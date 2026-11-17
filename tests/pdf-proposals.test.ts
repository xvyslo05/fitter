import { describe, expect, it } from 'vitest';
import { area } from '../src/geom/polygon';
import { styleKeyOf } from '../src/pdf/styles';
import { chainOrder, nestedOutlines, onionLevels, proposeChain } from '../src/pdf/proposals';
import { suggestPieces } from '../src/pdf/pieces';
import { traceSizes } from '../src/pdf/trace';
import { CM_PER_PT } from '../src/pdf/scale';
import { testPath } from './pdf-writer';
import type { Cell, Pt, TraceOptions } from '../src/pdf/types';

const opts: TraceOptions = { cmPerPt: CM_PER_PT, resolutionMm: 0.5, gapMm: 1, minAreaCm2: 15 };
const pt = (cm: number) => cm / CM_PER_PT;
const rectangle = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]].map(([a, b]) => [pt(a), pt(b)] as Pt);
// Areas in cm2 (cmPerPt 1 in these graph tests); borders in pt of 10 cm.
const cell = (id: number, areaCm2: number, ...neighbours: number[]): Cell =>
  ({ id, ring: [], areaPt2: areaCm2, neighbours: neighbours.map(n => ({ id: n, sharedPt: 10 })), touchesOutside: true });
const sheetArea = (ring: Pt[]) => area(ring) * CM_PER_PT ** 2;

describe('cell graphs', () => {
  it('orders a path of strips from the largest cell', () => {
    const cells = [cell(1, 60, 2, 3), cell(2, 400, 1), cell(3, 40, 1)];
    expect(chainOrder(cells, 1)).toEqual([[2], [1], [3]]);
    expect(proposeChain({ M: cells }, ['M'], 1)).toEqual([
      { label: 'možnost 1', cells: { M: [2] } }, { label: 'možnost 2', cells: { M: [2, 1] } }, { label: 'možnost 3', cells: { M: [2, 1, 3] } }]);
  });
  it('proposes nothing for a star, a cycle, a single cell or sizes that differ', () => {
    expect(chainOrder([cell(1, 400, 2, 3), cell(2, 60, 1), cell(3, 40, 1)], 1)).toBeNull();
    expect(chainOrder([cell(1, 400, 2, 3), cell(2, 60, 1, 3), cell(3, 40, 1, 2)], 1)).toBeNull();
    expect(chainOrder([cell(1, 400)], 1)).toBeNull();
    const path = [cell(1, 400, 2), cell(2, 60, 1)], longer = [cell(1, 400, 2), cell(2, 60, 1, 3), cell(3, 40, 2)];
    expect(proposeChain({ S: path, M: longer }, ['S', 'M'], 1)).toEqual([]);
    expect(proposeChain({ S: path }, ['S', 'M'], 1)).toEqual([]);
    expect(proposeChain(undefined, ['S'], 1)).toEqual([]);
  });
  it('ignores short borders and joins small cells to the neighbour with the longest border', () => {
    const touch = (c: Cell, id: number, sharedPt: number) => { c.neighbours.push({ id, sharedPt }); return c; };
    // 1-2 share a 1 mm border only: not adjacent, so two levels cannot be reached.
    expect(onionLevels([touch(cell(1, 400), 2, 0.1), touch(cell(2, 60), 1, 0.1)], 1)).toBeNull();
    // Cell 3 (1 cm2) sits between 1 and 2 and belongs to 2, which borders it longer.
    const cells = [touch(cell(1, 400, 2), 3, 5), touch(cell(2, 60, 1), 3, 8), touch(touch(cell(3, 1), 1, 5), 2, 8)];
    expect(chainOrder(cells, 1)).toEqual([[1], [2, 3]]);
  });
  it('needs as many onion levels as sizes', () => {
    const cells = [cell(1, 400, 2), cell(2, 176, 1, 3), cell(3, 152, 2)];
    expect(onionLevels(cells, 1)).toEqual([[1], [2], [3]]);
    expect(nestedOutlines(cells, 2, 1, 0.5)).toBeNull();
    expect(nestedOutlines([cell(1, 400)], 3, 1, 0.5)).toBe('single');
  });
});

describe('nested sizes in one style', () => {
  // Three rectangles share the left edge: 20 x 20, 24 x 24 and 26 x 28 cm.
  const nested = [rectangle(0, 4, 20, 20), rectangle(0, 2, 24, 24), rectangle(0, 0, 26, 28)];
  const paths = nested.map(ring => testPath(ring, { closed: [true] }));
  const key = styleKeyOf(paths[0]);
  it('assigns the cumulative unions to the listed sizes, smallest innermost', () => {
    const result = traceSizes({ paths, texts: [], assignments: { [key]: 'M, S, L' }, options: opts });
    expect(result.sizes).toEqual(['M', 'S', 'L']);
    expect(result.candidates).toHaveLength(1);
    const piece = result.candidates[0];
    expect(piece.sizesUnclear).toBeUndefined();
    for (const [size, expected] of [['S', 400], ['M', 576], ['L', 728]] as const) expect(Math.abs(sheetArea(piece.sizes[size]) / expected - 1)).toBeLessThan(0.01);
    expect(piece.cells!.S).toHaveLength(1);
    expect(suggestPieces(result, { contentPaths: paths, texts: [] })[0].variants).toEqual([]);
  });
  it('flags a piece whose levels do not match the sizes', () => {
    const result = traceSizes({ paths: paths.slice(0, 2), texts: [], assignments: { [key]: 'S, M, L' }, options: opts });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].sizesUnclear).toBe(true);
    expect(Object.keys(result.candidates[0].sizes).sort()).toEqual(['L', 'M', 'S']);
    const [draft] = suggestPieces(result, { contentPaths: paths, texts: [] });
    expect(draft.hint).toContain('Velikosti se nepodařilo rozlišit');
    expect(draft.variants).toEqual([]);
  });
  it('gives a one-level piece the same outline in every listed size', () => {
    const lone = testPath(rectangle(60, 0, 10, 10), { closed: [true] });
    const result = traceSizes({ paths: [...paths, lone], texts: [], assignments: { [key]: 'S, M, L' }, options: opts });
    const single = result.candidates.find(c => sheetArea(c.sizes.S) < 150)!;
    expect(Object.keys(single.sizes).sort()).toEqual(['L', 'M', 'S']);
    expect(single.sizes.S).toEqual(single.sizes.L);
    expect(single.sizesUnclear).toBeUndefined();
    expect(result.candidates.filter(c => c.sizesUnclear)).toHaveLength(0);
  });
  it('leaves sizes that have other lines of their own as they were', () => {
    const own = testPath(rectangle(0, 3, 22, 22), { closed: [true], stroke: [1, 0, 0] });
    const result = traceSizes({ paths: [...paths, own], texts: [], assignments: { [key]: 'S, M', [styleKeyOf(own)]: 'M' }, options: opts });
    expect(result.candidates.some(c => c.sizesUnclear)).toBe(false);
  });
});

describe('stacked strips', () => {
  it('proposes prefixes of the strips of a rectangle piece', () => {
    // 20 x 20 cm block with 2 cm and 1.5 cm strips stacked along the bottom, each closed by a line.
    const paths = [rectangle(0, 0, 20, 20), rectangle(0, 20, 20, 2), rectangle(0, 22, 20, 1.5)].map(ring => testPath(ring, { closed: [true] }));
    const result = traceSizes({ paths, texts: [], assignments: { [styleKeyOf(paths[0])]: 'uni' }, options: opts });
    expect(result.candidates).toHaveLength(1);
    const [draft] = suggestPieces(result, { contentPaths: paths, texts: [] });
    expect(draft.variants.map(v => v.label)).toEqual(['možnost 1', 'možnost 2', 'možnost 3']);
    expect(draft.variants.map(v => v.cells.uni.length)).toEqual([1, 2, 3]);
  });
});
