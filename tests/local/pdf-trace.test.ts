import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPdf } from '../../src/pdf/readPdf';
import { detectLayout } from '../../src/pdf/layout';
import { assemblePaths, assembleTexts, placePages } from '../../src/pdf/place';
import { detectScale } from '../../src/pdf/scale';
import { styleKeyOf, styleLegend } from '../../src/pdf/styles';
import { suggestPieces } from '../../src/pdf/pieces';
import { dominantStyleKey, sheetProblem, suggestAssignments, traceSizes } from '../../src/pdf/trace';
import { contentPages } from '../../src/pdf/match';
import { area, isSimple } from '../../src/geom/polygon';
import type { Pt, StyleEntry } from '../../src/pdf/types';

const directory = resolve('tools/pattern-extract/configs');
const present = ['patterns', 'library', directory].every(p => existsSync(resolve(p)));
interface Filter { fillBand?: boolean; width?: [number, number]; color?: number[]; dashes?: string }
interface Library { pieces: { id: string; sizes: Record<string, { outline: Pt[] }> }[] }
// Raglan pieces that must trace within 1 % of the library area: sleeve, hood, large pocket, body.
const raglanPieces = ['aermel-lang-saum-190', 'kapuze', 'tasche-gross', 'rueckenteil-190'];
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
    const paths = assemblePaths(contentPages(doc), placements), texts = assembleTexts(doc, placements), legend = styleLegend(paths);
    const library: Library = JSON.parse(readFileSync(resolve('library', `${id}.json`), 'utf8'));
    const filters: Record<string, Filter> = reportOnly ? raglan : config.sizes;
    // The wizard's default guess: the cutting-line style for one-size patterns, nothing for Celia's three sizes.
    const suggestion = suggestAssignments(paths, texts, scale);
    process.stdout.write(`${id}: suggestion=${Object.values(suggestion).join(',') || 'none'}\n`);
    if (id === 'celia') expect(suggestion).toEqual({});
    else if (!reportOnly) expect(legend.some(e => e.key === Object.keys(suggestion)[0] && matchesStyle(e, config.sizes.uni))).toBe(true);
    // Raglan: one call over all sizes; the shared black fill style keeps the wizard's `uni`, which then means every size.
    const sharedKeys = reportOnly ? legend.filter(e => matchesStyle(e, { color: [0, 0, 0] }, true)).map(e => e.key) : [];
    const rasterOptions = { cmPerPt: scale.cmPerPt, gapMm: 1, resolutionMm: 0.5, minAreaCm2: 15 };
    const raglanStart = performance.now();
    const raglanRequest = { paths, texts, scale, options: rasterOptions, assignments: {
      ...Object.fromEntries(sharedKeys.map(key => [key, 'uni'])),
      ...Object.fromEntries(Object.entries(filters).flatMap(([size, filter]) => legend.filter(e => matchesStyle(e, filter, true)).map(e => [e.key, size]))) } };
    const raglanResult = reportOnly ? traceSizes(raglanRequest) : null;
    const raglanElapsed = performance.now() - raglanStart;
    if (reportOnly) for (const gapMm of [1, 2, 4, 6]) {
      const rings = traceSizes({ ...raglanRequest, options: { ...rasterOptions, gapMm } }).candidates.flatMap(c => Object.values(c.sizes));
      const notSimple = rings.filter(ring => !isSimple(ring.slice(0, -1))).length;
      process.stdout.write(`${id} gap ${gapMm} mm: rings=${rings.length}; notSimple=${notSimple}\n`);
      expect(notSimple).toBe(0);
    }
    for (const [size, filter] of Object.entries(filters)) {
      const keys = new Set(legend.filter(e => matchesStyle(e, filter, reportOnly)).map(e => e.key));
      const selected = paths.filter(p => keys.has(styleKeyOf(p)));
      const start = performance.now();
      const result = raglanResult ?? traceSizes({ paths: selected, texts, scale, assignments: Object.fromEntries([...keys].map(key => [key, size])), options: rasterOptions });
      const traced = result.candidates.flatMap(c => c.sizes[size] ? [c.sizes[size]] : []);
      const elapsed = raglanResult ? raglanElapsed : performance.now() - start;
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
      if (reportOnly) {
        expect(matched).toBeGreaterThanOrEqual(3);
        // Junk candidates (size tables, marks) are offered off: at most one included candidate under 100 cm2.
        const drafts = suggestPieces(result, { contentPaths: paths, texts });
        const small = result.candidates.filter(c => c.sizes[size] && area(c.sizes[size]) * scale.cmPerPt ** 2 < 100 && drafts.find(d => d.candidateId === c.id)!.include);
        process.stdout.write(`${size} candidates=${result.candidates.length}; included under 100 cm2=${small.length}\n`);
        expect(small.length).toBeLessThanOrEqual(1);
        if (size === 'XXL') {
          // Cells of at least 3 cm2 per candidate, and library variants as unions of cells.
          const cellSets = result.candidates.flatMap(c => c.cells?.[size] ? [c.cells[size].map(cell => cell.areaPt2 * scale.cmPerPt ** 2).filter(a => a >= 3)] : []);
          for (const c of result.candidates) if (c.cells?.[size]) process.stdout.write(`${size} candidate ${c.id}: outline=${(area(c.sizes[size]) * scale.cmPerPt ** 2).toFixed(1)}; cells=${c.cells[size].map(cell => `${cell.id}:${(cell.areaPt2 * scale.cmPerPt ** 2).toFixed(1)}${cell.touchesOutside ? 'o' : ''}[${cell.neighbours.map(n => n.id).join('/')}]`).join(' ')}\n`);
          // Body cell counts are only reported: its variants are matched by area alone.
          const cellCount = (id: string) => {
            const reference = area(library.pieces.find(p => p.id === id)!.sizes[size].outline);
            return result.candidates.filter(c => c.cells?.[size] && Math.abs(area(c.sizes[size]) * scale.cmPerPt ** 2 / reference - 1) <= 0.01)
              .map(c => c.cells![size].filter(cell => cell.areaPt2 * scale.cmPerPt ** 2 >= 3).length);
          };
          expect(cellCount('aermel-lang-saum-190')).toEqual([6]);
          expect(cellCount('tasche-gross')).toEqual([3]);
          process.stdout.write(`${size} cells>=3cm2: sleeve=${cellCount('aermel-lang-saum-190')}; pocket=${cellCount('tasche-gross')}; body=${cellCount('rueckenteil-190')}\n`);
          const variants = library.pieces.filter(p => p.id.startsWith('aermel-') || p.id.startsWith('tasche-')).map(p => ({ id: p.id, ref: area(p.sizes[size].outline) }));
          for (const variant of variants) {
            let best = Infinity;
            for (const set of cellSets) for (let mask = 1; mask < 2 ** set.length; mask++) {
              const sum = set.reduce((total, a, i) => total + (mask >> i & 1 ? a : 0), 0);
              best = Math.min(best, Math.abs(sum / variant.ref - 1));
            }
            process.stdout.write(`${size} ${variant.id}: library=${variant.ref.toFixed(1)}; best cell union deviation=${(best * 100).toFixed(2)}%\n`);
            expect(best).toBeLessThanOrEqual(0.015);
          }
        }
        expect(traced.every(ring => isSimple(ring.slice(0, -1)))).toBe(true);
        for (const id of raglanPieces) {
          const reference = area(library.pieces.find(p => p.id === id)!.sizes[size].outline);
          const closest = measured.reduce((best, m) => Math.abs(m.area / reference - 1) < Math.abs(best / reference - 1) ? m.area : best, Infinity);
          process.stdout.write(`${size} ${id}: traced=${closest.toFixed(1)}; library=${reference.toFixed(1)}; deviation=${((closest / reference - 1) * 100).toFixed(2)}%\n`);
          expect(Math.abs(closest / reference - 1)).toBeLessThanOrEqual(0.01);
        }
      }
      else {
        expect(traced.length).toBe(expected.length);
        expect(matched).toBe(expected.length);
        if (id === 'celia') expect(elapsed).toBeLessThan(2000);
      }
    }
  }, 120000);
  // Cell counts (3 cm2 and up) per candidate and size; Alexia is the one sheet that must be flagged.
  it.each(files)('%s sheet problem', async file => {
    const configPath = resolve(directory, file), config = JSON.parse(readFileSync(configPath, 'utf8')), id: string = config.id;
    const doc = await readPdf(new Uint8Array(readFileSync(resolve(dirname(configPath), config.pdf))));
    const scale = detectScale(doc), placements = placePages(doc, detectLayout(doc).layout).placements;
    const paths = assemblePaths(contentPages(doc), placements), texts = assembleTexts(doc, placements), legend = styleLegend(paths);
    const options = { cmPerPt: scale.cmPerPt, gapMm: 1, resolutionMm: 0.5, minAreaCm2: 15 };
    let assignments: Record<string, string>;
    if (id === 'alexia-kleid') {
      const key = dominantStyleKey(paths);
      process.stdout.write(`${id}: dominant style=${key ? 'found' : 'none'}\n`);
      expect(key).toBeDefined();
      assignments = { [key!]: 'uni' };
      // The wizard probes at 1 mm.
      options.resolutionMm = 1;
    } else if (id === 'raglan-hoodie-alex') {
      const sharedKeys = legend.filter(e => matchesStyle(e, { color: [0, 0, 0] }, true)).map(e => e.key);
      assignments = { ...Object.fromEntries(sharedKeys.map(key => [key, 'uni'])),
        ...Object.fromEntries(Object.entries(raglan).flatMap(([size, filter]) => legend.filter(e => matchesStyle(e, filter, true)).map(e => [e.key, size]))) };
    } else {
      // A style that several sizes share is assigned to all of them.
      assignments = {};
      for (const [size, filter] of Object.entries(config.sizes as Record<string, Filter>)) for (const e of legend.filter(e => matchesStyle(e, filter, !!filter.fillBand)))
        assignments[e.key] = assignments[e.key] ? `${assignments[e.key]},${size}` : size;
    }
    const result = traceSizes({ paths, texts, scale, assignments, options });
    const counts = result.candidates.map(c => Math.max(0, ...Object.values(c.cells ?? {}).map(cells => cells.filter(cell => cell.areaPt2 * scale.cmPerPt ** 2 >= 3).length)));
    process.stdout.write(`${id}: candidates=${counts.length}; cells>=3cm2 per candidate=${counts.join(',')}; sheetProblem=${sheetProblem(result)}\n`);
    if (id === 'alexia-kleid') process.stdout.write(`${id}: suggestion=${Object.keys(suggestAssignments(paths, texts, scale)).length ? 'style' : 'none'}\n`);
    expect(sheetProblem(result)).toBe(id === 'alexia-kleid' ? 'overlapping' : null);
  }, 120000);
  it('covers all six scale configurations', () => { expect(files).toHaveLength(6); });
});
