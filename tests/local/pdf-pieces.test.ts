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
import { foldEdges, suggestPieces } from '../../src/pdf/pieces';
import { buildPattern, sortSizes, suggestSeamAllowance } from '../../src/pdf/build';
import { parsePatternFile } from '../../src/model/pattern';
import type { PatternFile, PieceSize } from '../../src/model/pattern';
import { area, bbox } from '../../src/geom/polygon';
import type { StyleEntry } from '../../src/pdf/types';

const directory = resolve('tools/pattern-extract/configs');
const present = ['patterns', 'library', directory].every(p => existsSync(resolve(p)));
interface Filter { width?: [number, number]; color?: number[]; dashes?: string }
// Same size mapping as tests/local/pdf-trace.test.ts: the configuration's style filters.
function matchesStyle(e: StyleEntry, filter: Filter) {
  const dash = filter.dashes?.match(/\[([^\]]*)\]/)?.[1].trim().split(/\s+/).filter(Boolean).map(Number);
  return e.kind === 'stroke' && (!filter.width || (e.width >= filter.width[0] && e.width <= filter.width[1])) &&
    (!filter.color || e.color.every((n, i) => Math.abs(n - filter.color![i]) <= 0.08)) &&
    (!dash || (dash.length === e.dash.length && dash.every((n, i) => n === e.dash[i])));
}
const foldLength = (s: PieceSize) => s.fold ? Math.hypot(s.fold[1][0] - s.fold[0][0], s.fold[1][1] - s.fold[0][1]) : 0;
// Count per material over the given pieces, in a stable order.
const cuts = (...pieces: PatternFile['pieces']) => {
  const map = new Map<string, number>();
  for (const c of pieces.flatMap(p => p.cut)) map.set(c.material, (map.get(c.material) ?? 0) + c.count);
  return [...map].sort(([a], [b]) => a.localeCompare(b));
};
const outlineKey = (p: PatternFile['pieces'][number]) => JSON.stringify(Object.values(p.sizes).map(s => s.outline));
// Outline shape only: area and the axis-aligned bbox (the grain rotation; 180° gives the same bbox).
function shapeError(built: PieceSize, expected: PieceSize) {
  const a = bbox(built.outline), b = bbox(expected.outline);
  return { area: Math.abs(area(built.outline) / area(expected.outline) - 1), box: Math.max(Math.abs(a.width - b.width), Math.abs(a.height - b.height)) };
}
// Library pieces whose cut counts the PDF labels determine (ledvinka-gyda: all of them). A built piece is
// compared with all library pieces drawn with its outline (kabelka-fiona zd-2 shares it with another piece).
const countedPieces: Record<string, string[] | 'all'> = { 'ledvinka-gyda': 'all', 'kabelka-fiona': ['pd', 'zd-1', 'zd-2'] };

describe.skipIf(!present)('local PDF pieces acceptance (numbers and ids only)', () => {
  it.each(['ledvinka-gyda', 'kabelka-fiona', 'celia'])('%s', async id => {
    const configPath = resolve(directory, `${id}.json`), config = JSON.parse(readFileSync(configPath, 'utf8'));
    const doc = await readPdf(new Uint8Array(readFileSync(resolve(dirname(configPath), config.pdf))));
    const scale = detectScale(doc), placements = placePages(doc, detectLayout(doc).layout).placements;
    const paths = assemblePaths(doc, placements), texts = assembleTexts(doc, placements), legend = styleLegend(paths);
    const assignments: Record<string, string> = {};
    for (const [size, filter] of Object.entries(config.sizes as Record<string, Filter>)) for (const e of legend) if (matchesStyle(e, filter)) assignments[e.key] = size;
    const result = traceSizes({ paths, texts, scale, assignments, options: { cmPerPt: scale.cmPerPt, gapMm: 1, resolutionMm: 0.5, minAreaCm2: 15 } });
    const start = performance.now();
    const sheet = { contentPaths: assemblePaths(contentPages(doc), placements), texts };
    const drafts = suggestPieces(result, sheet), elapsed = performance.now() - start;
    const pattern = parsePatternFile(buildPattern(result, drafts, { id, name: 'test', seamAllowance: suggestSeamAllowance(texts), sizes: sortSizes(result.sizes) }));
    const included = drafts.filter(d => d.include);
    const library: PatternFile = JSON.parse(readFileSync(resolve('library', `${id}.json`), 'utf8'));
    const seen = new Set<string>(), distinct = library.pieces.filter(p => !seen.has(outlineKey(p)) && seen.add(outlineKey(p)));
    process.stdout.write(`${id}: candidates=${result.candidates.length}; included=${included.length}; distinct library outlines=${distinct.length}; ` +
      `seam=${pattern.seamAllowance} (library ${library.seamAllowance}); text items=${texts.length}; suggestPieces=${elapsed.toFixed(0)} ms\n`);
    const used = new Set<number>(), textLayer = texts.length > 0;
    let matched = 0;
    for (const expected of distinct) {
      const sizes = Object.keys(expected.sizes);
      const index = pattern.pieces.findIndex((p, i) => !used.has(i) && sizes.every(s => p.sizes[s] &&
        shapeError(p.sizes[s], expected.sizes[s]).area <= 0.02 && shapeError(p.sizes[s], expected.sizes[s]).box <= 0.5));
      if (index === -1) { process.stdout.write(`  ${expected.id}: no match\n`); continue; }
      used.add(index); matched++;
      const built = pattern.pieces[index], errors = sizes.map(s => shapeError(built.sizes[s], expected.sizes[s]));
      const libraryFolds = sizes.filter(s => expected.sizes[s].fold).length, builtFolds = sizes.filter(s => built.sizes[s].fold).length;
      const foldError = Math.max(0, ...sizes.filter(s => expected.sizes[s].fold && built.sizes[s].fold).map(s => Math.abs(foldLength(built.sizes[s]) - foldLength(expected.sizes[s]))));
      const counted = countedPieces[id] === 'all' || countedPieces[id]?.includes(expected.id);
      const expectedCuts = cuts(...library.pieces.filter(p => outlineKey(p) === outlineKey(expected)));
      process.stdout.write(`  ${expected.id} → piece ${index + 1}: area error ≤ ${(Math.max(...errors.map(e => e.area)) * 100).toFixed(2)} %; ` +
        `bbox error ≤ ${Math.max(...errors.map(e => e.box)).toFixed(2)} cm; folds library/suggested ${libraryFolds}/${builtFolds}; fold length error ${foldError.toFixed(2)} cm; ` +
        `cut counts ${JSON.stringify(cuts(built)) === JSON.stringify(expectedCuts) ? 'equal' : 'differ'}${counted ? '' : ' (not asserted)'}\n`);
      // Fold words are text: without a text layer the suggestion can only be "no fold".
      expect(builtFolds).toBe(textLayer ? libraryFolds : 0);
      expect(foldError).toBeLessThanOrEqual(1);
      if (counted) expect(cuts(built)).toEqual(expectedCuts);
      if (libraryFolds && !builtFolds) {
        // The user's edit instead: one of the offered straight edges gives the library fold in every size.
        const draft = included[index], candidate = result.candidates.find(c => c.id === draft.candidateId)!;
        const options = foldEdges(candidate, result.cmPerPt).map((_, edge) => {
          const edited = drafts.map(d => d === draft ? { ...d, foldEdge: edge } : d);
          const piece = parsePatternFile(buildPattern(result, edited, { id, name: 'test', seamAllowance: 'unknown', sizes: sortSizes(result.sizes) })).pieces[index];
          return Math.max(...sizes.map(s => piece.sizes[s].fold ? Math.abs(foldLength(piece.sizes[s]) - foldLength(expected.sizes[s])) : Infinity));
        });
        process.stdout.write(`    fold needs user input: ${options.length} straight edges offered; best edge fold length error ${Math.min(...options).toFixed(2)} cm\n`);
        expect(Math.min(...options)).toBeLessThanOrEqual(1);
      }
    }
    expect(matched).toBe(distinct.length);
    expect(included).toHaveLength(distinct.length);
  }, 120000);
});
