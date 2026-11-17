import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPdf } from '../../src/pdf/readPdf';
import { detectLayout } from '../../src/pdf/layout';
import { assemblePaths, assembleTexts, placePages } from '../../src/pdf/place';
import { detectScale } from '../../src/pdf/scale';
import { styleLegend } from '../../src/pdf/styles';
import { traceSizes } from '../../src/pdf/trace';
import { contentPages } from '../../src/pdf/match';
import { suggestPieces } from '../../src/pdf/pieces';
import { unionCells } from '../../src/pdf/proposals';
import { area } from '../../src/geom/polygon';
import type { PatternFile } from '../../src/model/pattern';
import type { StyleEntry } from '../../src/pdf/types';

const directory = resolve('tools/pattern-extract/configs');
const present = ['patterns', 'library', directory].every(p => existsSync(resolve(p)));
interface Filter { fillBand?: boolean; width?: [number, number]; color?: number[]; dashes?: string }
function matchesStyle(e: StyleEntry, filter: Filter, fill = false) {
  const dash = filter.dashes?.match(/\[([^\]]*)\]/)?.[1].trim().split(/\s+/).filter(Boolean).map(Number);
  return e.kind === (fill ? 'fill' : 'stroke') && (!filter.width || (e.width >= filter.width[0] && e.width <= filter.width[1])) &&
    (!filter.color || e.color.every((n, i) => Math.abs(n - filter.color![i]) <= 0.08)) &&
    (!dash || (dash.length === e.dash.length && dash.every((n, i) => n === e.dash[i])));
}
const raglan: Record<string, Filter> = { S: { color: [0, 0.502, 0] }, M: { color: [1, 0.4, 0] }, L: { color: [0, 0, 1] }, XL: { color: [1, 0, 0] }, XXL: { color: [0.502, 0, 0.502] } };
const rasterOptions = (cmPerPt: number) => ({ cmPerPt, gapMm: 1, resolutionMm: 0.5, minAreaCm2: 15 });

async function load(id: string) {
  const configPath = resolve(directory, `${id}.json`), config = JSON.parse(readFileSync(configPath, 'utf8'));
  const doc = await readPdf(new Uint8Array(readFileSync(resolve(dirname(configPath), config.pdf))));
  const scale = detectScale(doc), placements = placePages(doc, detectLayout(doc).layout).placements;
  const paths = assemblePaths(contentPages(doc), placements), texts = assembleTexts(doc, placements), legend = styleLegend(paths);
  const library: PatternFile = JSON.parse(readFileSync(resolve('library', `${id}.json`), 'utf8'));
  return { config, scale, paths, texts, legend, library };
}

describe.skipIf(!present)('local variant proposals (numbers and ids only)', () => {
  it('dandelion: styles listing several sizes give nested sizes', async () => {
    const { config, scale, paths, texts, legend, library } = await load('dandelion-dress');
    const assignments: Record<string, string> = {};
    for (const [size, filter] of Object.entries(config.sizes as Record<string, Filter>)) for (const e of legend.filter(e => matchesStyle(e, filter, !!filter.fillBand)))
      assignments[e.key] = assignments[e.key] ? `${assignments[e.key]},${size}` : size;
    const result = traceSizes({ paths, texts, scale, assignments, options: rasterOptions(scale.cmPerPt) });
    const k2 = scale.cmPerPt ** 2, back = library.pieces.find(p => p.id === 'rueckteil')!;
    const near = (size: string, reference: number) => result.candidates.filter(c => c.sizes[size])
      .map(c => area(c.sizes[size]) * k2).reduce((best, a) => Math.abs(a / reference - 1) < Math.abs(best / reference - 1) ? a : best, Infinity);
    for (const size of ['34', '44', '42', '48']) {
      const reference = area(back.sizes[size].outline), traced = near(size, reference);
      process.stdout.write(`dandelion back bodice ${size}: traced=${traced.toFixed(1)}; library=${reference.toFixed(1)}; deviation=${((traced / reference - 1) * 100).toFixed(2)}%\n`);
      expect(Math.abs(traced / reference - 1)).toBeLessThanOrEqual(0.01);
    }
    const candidate = result.candidates.filter(c => c.sizes['34'] && c.sizes['44']).find(c => Math.abs(area(c.sizes['34']) * k2 / area(back.sizes['34'].outline) - 1) <= 0.01)!;
    expect(area(candidate.sizes['34'])).toBeLessThan(area(candidate.sizes['44']) * 0.95);
    // One-size pieces are drawn once; the suggestion gives them to every size.
    const drafts = suggestPieces(result, { contentPaths: paths, texts });
    for (const id of ['fluegelaermel', 'knopfleiste', 'brusttasche']) {
      const reference = area(library.pieces.find(p => p.id === id)!.sizes['34'].outline);
      const c = result.candidates.find(c => c.sizes['42'] && Math.abs(area(c.sizes['42']) * k2 / reference - 1) <= 0.02);
      process.stdout.write(`dandelion ${id}: library=${reference.toFixed(1)}; listed sizes=${c ? Object.keys(c.sizes).join(',') : 'none'}; allSizes=${c ? drafts.find(d => d.candidateId === c.id)?.allSizes : 'n/a'}\n`);
      expect(c).toBeDefined();
      expect(drafts.find(d => d.candidateId === c!.id)!.allSizes).toBe(true);
    }
    const flagged = result.candidates.filter(c => c.sizesUnclear).map(c => c.id);
    process.stdout.write(`dandelion flagged candidates: ${flagged.join(',') || 'none'}\n`);
  }, 120000);

  it('raglan: the sleeve strips become variants', async () => {
    const { scale, paths, texts, legend, library } = await load('raglan-hoodie-alex');
    const sharedKeys = legend.filter(e => matchesStyle(e, { color: [0, 0, 0] }, true)).map(e => e.key);
    const assignments = { ...Object.fromEntries(sharedKeys.map(key => [key, 'uni'])),
      ...Object.fromEntries(Object.entries(raglan).flatMap(([size, filter]) => legend.filter(e => matchesStyle(e, filter, true)).map(e => [e.key, size]))) };
    const result = traceSizes({ paths, texts, scale, assignments, options: rasterOptions(scale.cmPerPt) });
    for (const c of result.candidates) if (c.cells?.XXL) process.stdout.write(`raglan cand ${c.id}: outline=${(area(c.sizes.XXL) * scale.cmPerPt ** 2).toFixed(1)}; cells=${c.cells.XXL.filter(x => x.areaPt2 * scale.cmPerPt ** 2 >= 3).map(x => `${x.id}:${(x.areaPt2 * scale.cmPerPt ** 2).toFixed(1)}[${x.neighbours.map(n => `${n.id}/${(n.sharedPt * scale.cmPerPt * 10).toFixed(0)}`).join(',')}]`).join(' ')}\n`);
    const drafts = suggestPieces(result, { contentPaths: paths, texts });
    const proposed = drafts.filter(d => d.variants.length);
    process.stdout.write(`raglan: candidates=${result.candidates.length}; with proposals=${proposed.map(d => `${d.candidateId}(${d.variants.length})`).join(',') || 'none'}\n`);
    // The variants' areas: unions of their cells (build.ts unions the raw cell rings, which do not touch; see OPEN).
    const areas = proposed.flatMap(d => {
      const candidate = result.candidates.find(c => c.id === d.candidateId)!;
      return d.variants.map(v => area(unionCells(v.cells.XXL.map(id => candidate.cells!.XXL.find(c => c.id === id)!.ring.slice(0, -1)), scale.cmPerPt, 0.5)) * scale.cmPerPt ** 2);
    });
    process.stdout.write(`raglan XXL proposal areas: ${areas.map(a => a.toFixed(1)).join(',')}\n`);
    const built = areas.map(a => ({ sizes: { XXL: { area: a } } }));
    for (const id of ['aermel-kurz-buendchen', 'aermel-lang-saum-190']) {
      const reference = area(library.pieces.find(p => p.id === id)!.sizes.XXL.outline);
      const best = built.reduce((b, p) => Math.abs(p.sizes.XXL.area / reference - 1) < Math.abs(b / reference - 1) ? p.sizes.XXL.area : b, Infinity);
      process.stdout.write(`raglan ${id} XXL: library=${reference.toFixed(1)}; best variant=${best.toFixed(1)}; deviation=${((best / reference - 1) * 100).toFixed(2)}%\n`);
      expect(Math.abs(best / reference - 1)).toBeLessThanOrEqual(0.015);
    }
  }, 120000);
});
