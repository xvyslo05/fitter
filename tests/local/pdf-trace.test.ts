import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPdf } from '../../src/pdf/readPdf';
import { detectLayout } from '../../src/pdf/layout';
import { assemblePaths, assembleTexts, placePages } from '../../src/pdf/place';
import { detectScale } from '../../src/pdf/scale';
import { styleKeyOf, styleLegend } from '../../src/pdf/styles';
import { suggestAssignments, traceSizes } from '../../src/pdf/trace';
import { contentPages } from '../../src/pdf/match';
import { area } from '../../src/geom/polygon';
import type { Pt, StyleEntry } from '../../src/pdf/types';

const directory = resolve('tools/pattern-extract/configs');
const present = ['patterns', 'library', directory].every(p => existsSync(resolve(p)));
interface Filter { width?: [number, number]; color?: number[]; dashes?: string }
interface Library { pieces: { sizes: Record<string, { outline: Pt[] }> }[] }
// Convex hull + edge orientations: dimensions of the minimum-area rectangle,
// independent of the grain rotation in the saved library.
function dimensions(points: Pt[]): number[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (ps: Pt[]) => {
    const result: Pt[] = [];
    for (const p of ps) { while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, p) <= 0) result.pop(); result.push(p); }
    return result.slice(0, -1);
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  let best = [Infinity, Infinity];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(angle), s = Math.sin(angle), xs = hull.map(p => p[0] * c + p[1] * s), ys = hull.map(p => p[1] * c - p[0] * s);
    const dims = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    if (dims[0] * dims[1] < best[0] * best[1]) best = dims;
  }
  return best.sort((a, b) => a - b);
}
function matchesStyle(e: StyleEntry, filter: Filter, fill = false) {
  const dash = filter.dashes?.match(/\[([^\]]*)\]/)?.[1].trim().split(/\s+/).filter(Boolean).map(Number);
  return e.kind === (fill ? 'fill' : 'stroke') && (!filter.width || (e.width >= filter.width[0] && e.width <= filter.width[1])) &&
    (!filter.color || e.color.every((n, i) => Math.abs(n - filter.color![i]) <= 0.08)) &&
    (!dash || (dash.length === e.dash.length && dash.every((n, i) => n === e.dash[i])));
}
const raglan: Record<string, Filter> = { S: { color: [0, 0.502, 0] }, M: { color: [1, 0.4, 0] }, L: { color: [0, 0, 1] }, XL: { color: [1, 0, 0] }, XXL: { color: [0.502, 0, 0.502] } };

describe.skipIf(!present)('local PDF tracing acceptance (numbers only)', () => {
  const files = present ? readdirSync(directory).filter(f => f.endsWith('.json')).sort() : [];
  it.each(files)('%s', async file => {
    const configPath = resolve(directory, file), config = JSON.parse(readFileSync(configPath, 'utf8')), id: string = config.id;
    const doc = await readPdf(new Uint8Array(readFileSync(resolve(dirname(configPath), config.pdf))));
    const scale = detectScale(doc), expectedScale = config.scale.squareCm / config.scale.squarePt;
    const error = Math.abs(scale.cmPerPt / expectedScale - 1) * 100;
    process.stdout.write(`${id}: scale=${scale.cmPerPt.toFixed(7)} cm/pt; error=${error.toFixed(3)}%\n`);
    expect(error).toBeLessThan(1);
    if (!['ledvinka-gyda', 'kabelka-fiona', 'celia', 'raglan-hoodie-alex'].includes(id)) return;
    const reportOnly = id === 'raglan-hoodie-alex';
    const placements = placePages(doc, detectLayout(doc).layout).placements;
    const paths = assemblePaths(doc, placements), texts = assembleTexts(doc, placements), legend = styleLegend(paths);
    const library: Library = JSON.parse(readFileSync(resolve('library', `${id}.json`), 'utf8'));
    const filters: Record<string, Filter> = reportOnly ? raglan : config.sizes;
    // The wizard's default guess: the cutting-line style for one-size patterns, nothing for Celia's three sizes.
    const suggestion = suggestAssignments(assemblePaths(contentPages(doc), placements), texts, scale);
    process.stdout.write(`${id}: suggestion=${Object.values(suggestion).join(',') || 'none'}\n`);
    if (id === 'celia') expect(suggestion).toEqual({});
    else if (!reportOnly) expect(legend.some(e => e.key === Object.keys(suggestion)[0] && matchesStyle(e, config.sizes.uni))).toBe(true);
    for (const [size, filter] of Object.entries(filters)) {
      const keys = new Set(legend.filter(e => matchesStyle(e, filter, reportOnly)).map(e => e.key));
      const selected = paths.filter(p => keys.has(styleKeyOf(p)));
      const start = performance.now();
      const result = traceSizes({ paths: selected, texts, scale, assignments: Object.fromEntries([...keys].map(key => [key, size])),
        options: { cmPerPt: scale.cmPerPt, gapMm: reportOnly ? 4 : 1, resolutionMm: 0.5, minAreaCm2: 15 } });
      const traced = result.candidates.flatMap(c => c.sizes[size] ? [c.sizes[size]] : []);
      const elapsed = performance.now() - start;
      const measured = traced.map(p => ({ area: area(p) * scale.cmPerPt ** 2, dims: dimensions(p).map(n => n * scale.cmPerPt) }));
      const distinct = new Map<string, Pt[]>();
      for (const piece of library.pieces) {
        const outline = piece.sizes[size]?.outline;
        if (outline) distinct.set(JSON.stringify(outline), outline);
      }
      const expected = [...distinct.values()].map(p => ({ area: area(p), dims: dimensions(p) }));
      const used = new Set<number>();
      let matched = 0;
      for (const ref of expected) {
        const index = measured.findIndex((m, i) => !used.has(i) && Math.abs(m.area / ref.area - 1) <= 0.02 && m.dims.every((n, j) => Math.abs(n - ref.dims[j]) <= 0.4));
        if (index !== -1) { matched++; used.add(index); }
      }
      process.stdout.write(`${id} ${size}: traced=${traced.length}; distinct=${expected.length}; matched=${matched}; ${elapsed.toFixed(0)} ms${reportOnly ? '; report-only' : ''}; areas=${measured.map(m => m.area.toFixed(1)).join(',')}; dimensions=${measured.map(m => m.dims.map(n => n.toFixed(2)).join('x')).join(',')} cm\n`);
      if (!reportOnly) {
        expect(traced.length).toBe(expected.length);
        expect(matched).toBe(expected.length);
        if (id === 'celia') expect(elapsed).toBeLessThan(2000);
      }
    }
  }, 120000);
  it('covers all six scale configurations', () => { expect(files).toHaveLength(6); });
});
