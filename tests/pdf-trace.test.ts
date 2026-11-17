import { describe, expect, it } from 'vitest';
import { area, bbox, isSimple } from '../src/geom/polygon';
import { styleLegend, styleKeyOf, defaultAssignments } from '../src/pdf/styles';
import { assignedSizes, sizeRole, suggestAssignments, largestLoop, traceOutlines, dominantStyleKey, sheetProblem, traceShapes, traceSizes, withoutLettering } from '../src/pdf/trace';
import { groupPieces } from '../src/pdf/group';
import { suggestPieces } from '../src/pdf/pieces';
import { assembleTexts } from '../src/pdf/place';
import { readPdf } from '../src/pdf/readPdf';
import { CM_PER_PT } from '../src/pdf/scale';
import { pdfBytes, squareRing, testPath } from './pdf-writer';
import type { Pt, TraceOptions } from '../src/pdf/types';

const opts: TraceOptions = { cmPerPt: CM_PER_PT, resolutionMm: 0.5, gapMm: 1, minAreaCm2: 15 };
const pt = (cm: number) => cm / CM_PER_PT;
describe('style legend', () => {
  it('groups colour, rounded device widths/dashes and paint kind', async () => {
    const doc = await readPdf(pdfBytes([{ content: `1.01 w 0 0 m 100 0 l S 1.02 w 0 5 m 100 5 l S
      1 0 0 RG 0 10 m 100 10 l S 2 w 0 15 m 100 15 l S
      [3 4] 0 d 0 20 m 100 20 l S 0 0 100 1 re f` }]));
    const entries = styleLegend(doc.pages[0].paths);
    expect(entries).toHaveLength(5);
    expect(entries.find(e => e.paths === 2)).toMatchObject({ kind: 'stroke', width: 1, lengthPt: 200 });
    expect(entries.some(e => e.kind === 'fill' && e.dash.length === 0 && e.width === 0)).toBe(true);
    expect(entries.some(e => e.dash.join() === '3,4')).toBe(true);
  });
  it('uses directional strokeMetrics under a non-uniform CTM', () => {
    const a = testPath([[0, 0], [100, 0]], { ctm: [2, 0, 0, 0.5], lineWidth: 2, dash: [3, 4] });
    const b = testPath([[0, 0], [0, 100]], { ...a, subpaths: [[[0, 0], [0, 100]]] });
    expect(styleLegend([a, b]).map(e => [e.width, e.dash])).toEqual([[1, [6, 8]], [4, [1.5, 2]]]);
    expect(styleKeyOf(a)).not.toBe(styleKeyOf(b));
  });
  it('only prefills a clearly dominant closed-outline style', () => {
    const a = testPath(squareRing(0, 0, 200), { closed: [true] });
    const b = testPath(squareRing(0, 0, 190), { closed: [true], stroke: [1, 0, 0] });
    expect(defaultAssignments(styleLegend([a]))).toEqual({ [styleKeyOf(a)]: 'uni' });
    expect(defaultAssignments(styleLegend([a, b]))).toEqual({});
    expect(defaultAssignments(styleLegend([testPath([[0, 0], [200, 0]])]))).toEqual({});
    expect(styleLegend([testPath(squareRing(0, 0, 10), { closed: [true] })])[0].closedLengthPt).toBe(40);
  });
});
describe('tracing', () => {
  it('closes a 0.5 mm tear at gap 1 mm, but leaves it open at gap 0', () => {
    const side = pt(10), gap = pt(0.05);
    const path = testPath([[side / 2 + gap / 2, 0], [side, 0], [side, side], [0, side], [0, 0], [side / 2 - gap / 2, 0]], { lineWidth: 0 });
    expect(traceOutlines([path], { ...opts, resolutionMm: 0.25, gapMm: 0 })).toHaveLength(0);
    const traced = traceOutlines([path], { ...opts, resolutionMm: 0.25 });
    expect(traced).toHaveLength(1);
    expect(area(traced[0]) * CM_PER_PT ** 2).toBeCloseTo(100, 0);
    expect(traced[0][0]).toEqual(traced[0].at(-1));
  });
  it('internal lines and outside spurs do not split or grow a piece', () => {
    const side = pt(10), square = testPath(squareRing(0, 0, side), { closed: [true] });
    const traced = traceOutlines([square, testPath([[0, side / 2], [side, side / 2]]), testPath([[side, side / 2], [side * 1.5, side / 2]])], opts);
    expect(traced).toHaveLength(1);
    const bounds = bbox(traced[0]);
    expect(Math.abs(bounds.width - side) * CM_PER_PT * 10).toBeLessThanOrEqual(opts.resolutionMm + 1e-6);
    expect(Math.abs(bounds.height - side) * CM_PER_PT * 10).toBeLessThanOrEqual(opts.resolutionMm + 1e-6);
  });
  it('traces nested size styles separately and groups them', () => {
    const a = testPath(squareRing(0, 0, pt(10)), { closed: [true] });
    const b = testPath(squareRing(pt(1), pt(1), pt(8)), { closed: [true], stroke: [1, 0, 0] });
    const result = traceSizes({ paths: [a, b], texts: [], assignments: { [styleKeyOf(a)]: 'L', [styleKeyOf(b)]: 'M' }, options: opts });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].refSize).toBe('L');
    expect(Object.keys(result.candidates[0].sizes)).toEqual(['L', 'M']);
    expect(area(result.candidates[0].sizes.M) * CM_PER_PT ** 2).toBeCloseTo(64, 0);
  });
  it('parses size lists and the all-sizes token', () => {
    expect(assignedSizes('S, M; L', [])).toEqual(['S', 'M', 'L']);
    expect(assignedSizes(' 42/44 ', [])).toEqual(['42/44']);
    for (const all of ['vše', 'VŠE', '*']) expect(assignedSizes(all, ['S', 'M'])).toEqual(['S', 'M']);
    expect(assignedSizes('vše', [])).toEqual(['uni']);
    expect(assignedSizes('', ['S'])).toEqual([]);
    expect(assignedSizes(' , ', ['S'])).toEqual([]);
    expect(assignedSizes(undefined, ['S'])).toEqual([]);
    expect(assignedSizes('uni, vše', [])).toEqual(['uni']);
    // With named sizes, uni is a line every size shares; alone it is the one size.
    expect(assignedSizes('uni', ['S', 'M'])).toEqual(['S', 'M']);
    expect(assignedSizes('UNI', [])).toEqual(['uni']);
    expect(['M, L', 'uni', 'vše', ' '].map(sizeRole)).toEqual(['named', 'shared', 'shared', 'none']);
    expect(assignedSizes('S, *', ['S', 'M'])).toEqual(['S', 'M']);
    const only = testPath(squareRing(0, 0, pt(10)), { closed: [true] });
    expect(traceSizes({ paths: [only], texts: [], assignments: { [styleKeyOf(only)]: 'vše' }, options: opts }).sizes).toEqual(['uni']);
  });
  it('closes open size outlines with a shared line assigned to all sizes', () => {
    const s = pt(10), a = testPath([[0, 0], [0, s], [s, s], [s, 0]]);
    const b = testPath([[pt(1), 0], [pt(1), pt(8)], [pt(9), pt(8)], [pt(9), 0]], { stroke: [1, 0, 0] });
    const c = testPath([[0, 0], [s, 0]], { stroke: [0, 1, 0] });
    for (const shared of ['vše', 'uni']) {
      const result = traceSizes({ paths: [a, b, c], texts: [], assignments: { [styleKeyOf(a)]: 'L', [styleKeyOf(b)]: 'M', [styleKeyOf(c)]: shared }, options: opts });
      expect(result.sizes).toEqual(['L', 'M']);
      expect(result.candidates).toHaveLength(1);
      expect(Object.keys(result.candidates[0].sizes)).toEqual(['L', 'M']);
    }
  });
  it('traces a shared closed style in every named size', () => {
    const a = testPath(squareRing(0, 0, pt(10)), { closed: [true] });
    const b = testPath(squareRing(pt(30), 0, pt(5)), { closed: [true], stroke: [1, 0, 0] });
    const c = testPath(squareRing(pt(30), 0, pt(5)), { closed: [true], stroke: [0, 1, 0] });
    const result = traceSizes({ paths: [a, b, c], texts: [], assignments: { [styleKeyOf(a)]: 'L', [styleKeyOf(b)]: 'M', [styleKeyOf(c)]: 'vše' }, options: opts });
    expect(result.sizes).toEqual(['L', 'M']);
    const shared = result.candidates.filter(x => x.sizes.L && x.sizes.M);
    expect(shared).toHaveLength(1);
    expect(area(shared[0].sizes.L)).toBeCloseTo(area(shared[0].sizes.M), 6);
  });
  it('traces a style listing several sizes in each of them', () => {
    const a = testPath(squareRing(0, 0, pt(10)), { closed: [true] });
    const result = traceSizes({ paths: [a], texts: [], assignments: { [styleKeyOf(a)]: 'L, M' }, options: opts });
    expect(result.sizes).toEqual(['L', 'M']);
    expect(result.candidates).toHaveLength(1);
    expect(Object.keys(result.candidates[0].sizes)).toEqual(['L', 'M']);
  });
  it('fills thin driver polygons and drops small outlines', () => {
    const s = pt(10), band = 0.8;
    const paths = [testPath([[0, 0], [s, 0], [s, band], [0, band]], { stroke: null, fill: [0, 0, 0] }),
      testPath([[0, s], [s, s], [s, s - band], [0, s - band]], { stroke: null, fill: [0, 0, 0] }),
      testPath([[0, 0], [band, 0], [band, s], [0, s]], { stroke: null, fill: [0, 0, 0] }),
      testPath([[s, 0], [s - band, 0], [s - band, s], [s, s]], { stroke: null, fill: [0, 0, 0] }),
      testPath(squareRing(s * 2, 0, pt(2)), { closed: [true] })];
    expect(traceOutlines(paths, opts)).toHaveLength(1);
    expect(traceOutlines([], opts)).toEqual([]);
    expect(() => traceOutlines(paths, { ...opts, cmPerPt: 0 })).toThrow();
  });
  it('combines multiple styles assigned to the same size', () => {
    const side = pt(10), a = testPath([[0, 0], [side, 0], [side, side]]);
    const b = testPath([[side, side], [0, side], [0, 0]], { stroke: [1, 0, 0] });
    const result = traceSizes({ paths: [a, b], texts: [], assignments: { [styleKeyOf(a)]: 'uni', [styleKeyOf(b)]: 'uni' }, options: opts });
    expect(result.sizes).toEqual(['uni']);
    expect(result.candidates).toHaveLength(1);
  });
  it('drops lettering drawn as fills, but keeps dashed lines, marks and other colours', () => {
    // An octagon of 6 pt stands for a glyph outline (more than 6 points).
    const glyph = (x: number, y: number, fill: [number, number, number] = [0, 0, 0]) => testPath([0, 1, 2, 3, 4, 5, 6, 7].map(i => [x + 3 + 3 * Math.cos(i * Math.PI / 4), y + 3 + 3 * Math.sin(i * Math.PI / 4)] as [number, number]), { stroke: null, fill });
    const word = [0, 8, 16, 24, 32].map(x => glyph(x, 0));
    const dash = (x: number): [number, number][] => [[x, 50], [x + 6, 50], [x + 6, 51], [x, 51]];
    const dashes = testPath(dash(0), { stroke: null, fill: [0, 0, 0], subpaths: [0, 10, 20, 30, 40, 50].map(dash), closed: [true, true, true, true, true, true] });
    const marks = [glyph(100, 0), glyph(108, 0), glyph(116, 0)], coloured = glyph(40, 0, [1, 0, 0]);
    const dot = testPath([[10, 2], [11, 2], [11, 3], [10, 3]], { stroke: null, fill: [0, 0, 0] }), lone = testPath([[80, 40], [81, 40], [81, 41], [80, 41]], { stroke: null, fill: [0, 0, 0] });
    const kept = withoutLettering([...word, dot, dashes, ...marks, coloured, lone]);
    expect(kept).toEqual([dashes, ...marks, coloured, lone]);
  });
  it('keeps a label beside a piece out of its outline', () => {
    // A Foxit-style outline of four thin bands, and a word just above its top edge, within the closed gap.
    const s = pt(12), band = 0.8, ink = { stroke: null, fill: [0, 0, 0] as [number, number, number] };
    const piece = [testPath([[0, 0], [s, 0], [s, band], [0, band]], ink), testPath([[0, s], [s, s], [s, s - band], [0, s - band]], ink),
      testPath([[0, 0], [band, 0], [band, s], [0, s]], ink), testPath([[s, 0], [s - band, 0], [s - band, s], [s, s]], ink)];
    const label = [20, 28, 36, 44].map(x => testPath([0, 1, 2, 3, 4, 5, 6, 7].map(i => [x + 3 + 3 * Math.cos(i * Math.PI / 4), -3.5 + 3 * Math.sin(i * Math.PI / 4)] as [number, number]), ink));
    const traced = (paths: typeof piece) => traceSizes({ paths, texts: [], assignments: { [styleKeyOf(piece[0])]: 'uni' }, options: opts }).candidates;
    expect(traced(piece)).toHaveLength(1);
    expect(area(traced([...piece, ...label])[0].sizes.uni)).toBeCloseTo(area(traced(piece)[0].sizes.uni), 6);
  });
  it('allows keeping square pieces that resemble calibration marks', () => {
    const path = testPath(squareRing(0, 0, pt(5)), { closed: [true] });
    const request = { paths: [path], texts: [], assignments: { [styleKeyOf(path)]: 'uni' }, options: opts,
      scale: { source: 'square' as const, measuredPt: pt(5), squareCm: 5, cmPerPt: CM_PER_PT } };
    expect(traceSizes(request).candidates).toHaveLength(0);
    expect(traceSizes({ ...request, excludeScaleMarks: false }).candidates).toHaveLength(1);
  });
});
describe('line bands and simple rings', () => {
  const ink = { stroke: null, fill: [0, 0, 0] as [number, number, number] };
  // A band 1 mm wide centred on the segment, in cm.
  const band = (x0: number, y0: number, x1: number, y1: number, t = 0.1) => {
    const h = t / 2, horizontal = y0 === y1;
    return testPath((horizontal ? [[x0 - h, y0 - h], [x1 + h, y0 - h], [x1 + h, y0 + h], [x0 - h, y0 + h]] : [[x0 - h, y0 - h], [x1 + h, y0 - h], [x1 + h, y1 + h], [x0 - h, y1 + h]]).map(([x, y]) => [pt(x), pt(y)] as [number, number]), ink);
  };
  const rectangle = [band(0, 0, 20, 0), band(0, 30, 20, 30), band(0, 0, 0, 30), band(20, 0, 20, 30), band(0, 15, 20, 15)];
  it('regrows past inner cutting lines drawn as filled bands', () => {
    const traced = traceOutlines(rectangle, opts);
    expect(traced).toHaveLength(1);
    expect(isSimple(traced[0].slice(0, -1))).toBe(true);
    expect(Math.abs(area(traced[0]) * CM_PER_PT ** 2 / 600 - 1)).toBeLessThan(0.005);
  });
  it('regrows past inner cutting lines drawn as strokes', () => {
    const lines = [[[0, 0], [20, 0]], [[0, 30], [20, 30]], [[0, 0], [0, 30]], [[20, 0], [20, 30]], [[0, 15], [20, 15]]]
      .map(([a, b]) => testPath([[pt(a[0]), pt(a[1])], [pt(b[0]), pt(b[1])]], { lineWidth: pt(0.1) }));
    const traced = traceOutlines(lines, opts);
    expect(traced).toHaveLength(1);
    expect(isSimple(traced[0].slice(0, -1))).toBe(true);
    expect(Math.abs(area(traced[0]) * CM_PER_PT ** 2 / 600 - 1)).toBeLessThan(0.005);
  });
  it('does not take a large solid fill for a line band', () => {
    const square = testPath(squareRing(0, 0, pt(10)), { closed: [true] });
    const solid = testPath(squareRing(pt(20), 0, pt(8)), ink);
    const alone = traceOutlines([square], opts)[0], start = performance.now(), withSolid = traceOutlines([square, solid], opts);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(withSolid).toHaveLength(1);
    expect(Math.abs(area(withSolid[0]) / area(alone) - 1)).toBeLessThan(0.001);
  });
  it('returns the regions between inner lines as cells with their neighbours', () => {
    const [shape, ...others] = traceShapes([...rectangle, band(0, 7.5, 20, 7.5)], opts);
    expect(others).toHaveLength(0);
    const cm2 = (c: { areaPt2: number }) => c.areaPt2 * CM_PER_PT ** 2;
    expect(shape.cells).toHaveLength(3);
    expect(Math.abs(shape.cells.reduce((sum, c) => sum + cm2(c), 0) / (area(shape.ring) * CM_PER_PT ** 2) - 1)).toBeLessThan(0.005);
    const middle = shape.cells.find(c => c.neighbours.length === 2)!;
    expect(Math.abs(cm2(middle) / 150 - 1)).toBeLessThan(0.01);
    expect(shape.cells.filter(c => c.neighbours.length === 1)).toHaveLength(2);
    expect(shape.cells.every(c => c.touchesOutside && isSimple(c.ring.slice(0, -1)))).toBe(true);
    for (const cell of shape.cells) for (const n of cell.neighbours) {
      expect(shape.cells.find(c => c.id === n.id)!.neighbours.find(m => m.id === cell.id)).toBeDefined();
      expect(n.sharedPt * CM_PER_PT).toBeGreaterThan(19);
    }
  });
  it('returns one cell for a plain piece and a nested region as its own cell', () => {
    expect(traceShapes(rectangle.slice(0, 4), opts)[0].cells).toMatchObject([{ id: 1, neighbours: [], touchesOutside: true }]);
    const [shape] = traceShapes([...rectangle.slice(0, 4), band(0, 10, 10, 10), band(0, 20, 10, 20), band(10, 10, 10, 20)], opts);
    expect(shape.cells).toHaveLength(2);
    const inner = shape.cells.find(c => c.areaPt2 * CM_PER_PT ** 2 < 150)!;
    expect(Math.abs(inner.areaPt2 * CM_PER_PT ** 2 / 100 - 1)).toBeLessThan(0.01);
    expect(inner.neighbours).toHaveLength(1);
  });
  it('merges cells under 0.3 cm2 into their neighbour and carries cells into the candidates', () => {
    const mark = [band(5, 5, 5.4, 5, 0.1), band(5, 5.4, 5.4, 5.4, 0.1), band(5, 5, 5, 5.4, 0.1), band(5.4, 5, 5.4, 5.4, 0.1)];
    const result = traceSizes({ paths: [...rectangle, ...mark], texts: [], assignments: { [styleKeyOf(rectangle[0])]: 'uni' }, options: opts });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].cells!.uni).toHaveLength(2);
    expect(groupPieces({ S: [squareRing(0, 0, 10)] }, []).every(c => c.cells === undefined)).toBe(true);
  });
  it('cuts a closed notch mark off the outline and ignores a dot touching it from inside', () => {
    const plain = traceOutlines(rectangle.slice(0, 4), opts)[0], cm2 = (ring: Pt[]) => area(ring) * CM_PER_PT ** 2;
    const stroke = (points: [number, number][]) => testPath(points.map(([x, y]) => [pt(x), pt(y)] as [number, number]), { lineWidth: pt(0.1), closed: [true] });
    const notch = stroke([[9.85, 0], [10.15, 0], [10, -0.3]]), dot = testPath(squareRing(pt(0), pt(5), pt(0.3)), ink);
    // A 1 cm notch encloses a cell of its own (0.38 cm2 of bump without the cut); the 3 mm one only guards the bound.
    const wide = stroke([[9.5, 0], [10.5, 0], [10, -0.8]]), cut = traceShapes([...rectangle.slice(0, 4), wide], opts);
    expect(cut).toHaveLength(1);
    expect(Math.abs(cm2(cut[0].ring) - cm2(plain))).toBeLessThan(0.1);
    expect(cut[0].cells).toHaveLength(1);
    const notched = traceShapes([...rectangle.slice(0, 4), notch], opts), dotted = traceShapes([...rectangle.slice(0, 4), dot], opts);
    expect(notched).toHaveLength(1);
    expect(Math.abs(cm2(notched[0].ring) - cm2(plain))).toBeLessThan(0.1);
    expect(notched[0].cells).toHaveLength(1);
    expect(dotted).toHaveLength(1);
    expect(Math.abs(cm2(dotted[0].ring) - cm2(plain))).toBeLessThan(0.1);
  });
  it('offers a grid of equal boxes as excluded, but a piece in three strips as included', () => {
    const lines = (...xs: number[][]) => xs.map(([a, b, c, d]) => band(a, b, c, d));
    const frame = (w: number, h: number) => lines([0, 0, w, 0], [0, h, w, h], [0, 0, 0, h], [w, 0, w, h]);
    const grid = [...frame(6, 12), ...lines([2, 0, 2, 12], [4, 0, 4, 12], [0, 3, 6, 3], [0, 6, 6, 6], [0, 9, 6, 9])];
    const strips = [...frame(20, 30), ...lines([0, 25, 20, 25], [0, 28, 20, 28])];
    for (const [paths, cells, include] of [[grid, 12, false], [strips, 3, true]] as const) {
      const result = traceSizes({ paths, texts: [], assignments: { [styleKeyOf(paths[0])]: 'uni' }, options: { ...opts, minAreaCm2: 15 } });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].cells!.uni).toHaveLength(cells);
      expect(suggestPieces(result, { contentPaths: [], texts: [] })[0].include).toBe(include);
    }
  });
  it('keeps the largest loop of a figure eight', () => {
    const s: [number, number] = [10, 0];
    const eight: [number, number][] = [s, [10, 10], [0, 10], [0, 0], s, [16, 0], [16, -5], [10, -5]];
    const loop = largestLoop(eight);
    expect(Math.abs(area(loop))).toBeCloseTo(100, 6);
    expect(isSimple(loop)).toBe(true);
    expect(largestLoop(squareRing(0, 0, 4).slice(0, -1))).toHaveLength(4);
  });
  it('returns only simple rings for two pieces joined by a thin bridge', () => {
    for (const neck of [0.5, 1, 1.5]) {
      const n = neck / 2, outline = [[0, 0], [10, 0], [10, 5 - n], [12, 5 - n], [12, 0], [22, 0], [22, 10], [12, 10], [12, 5 + n], [10, 5 + n], [10, 10], [0, 10]]
        .map(([x, y]) => [pt(x), pt(y)] as [number, number]);
      for (const resolutionMm of [0.25, 0.5]) {
        const traced = traceOutlines([testPath(outline, { closed: [true], lineWidth: 0 })], { ...opts, gapMm: 0, resolutionMm });
        expect(traced.length).toBeGreaterThan(0);
        for (const ring of traced) expect(isSimple(ring.slice(0, -1))).toBe(true);
      }
    }
  });
  it('returns only simple rings for 50 seeded random blobs', () => {
    let seed = 12345;
    const random = (lo: number, hi: number) => lo + (hi - lo) * ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let blob = 0; blob < 50; blob++) {
      const paths = Array.from({ length: 3 + blob % 3 }, () => {
        const x = random(0, 15), y = random(0, 15), width = random(4, 12), height = random(4, 12);
        const corners = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]].map(([a, b]) => [pt(a), pt(b)] as [number, number]);
        return testPath(corners, { closed: [true], lineWidth: pt(random(0.03, 0.15)) });
      });
      for (const ring of traceOutlines(paths, { ...opts, minAreaCm2: 1, gapMm: 1 + blob % 3 })) expect(isSimple(ring.slice(0, -1))).toBe(true);
    }
  });
});
describe('unsupported sheets', () => {
  const scale = { cmPerPt: CM_PER_PT, source: 'square' as const, squareCm: 5, measuredPt: pt(5), page: 1 };
  const rectangle = (x: number, y: number, width: number, height: number) =>
    testPath([[x, y], [x + width, y], [x + width, y + height], [x, y + height]].map(([a, b]) => [pt(a), pt(b)] as [number, number]), { closed: [true], lineWidth: pt(0.1) });
  const line = (x0: number, y0: number, x1: number, y1: number) => testPath([[pt(x0), pt(y0)], [pt(x1), pt(y1)]], { lineWidth: pt(0.1) });
  it('flags rectangles of varying size drawn over each other in one style', () => {
    let seed = 7;
    const random = (min: number, max: number) => { seed = (seed * 16807) % 2147483647; return min + (max - min) * seed / 2147483647; };
    const paths = Array.from({ length: 12 }, () => rectangle(random(0, 30), random(0, 30), random(20, 45), random(20, 45)));
    const result = traceSizes({ paths, texts: [], assignments: { [styleKeyOf(paths[0])]: 'uni' }, options: { ...opts, resolutionMm: 1 }, scale });
    expect(sheetProblem(result)).toBe('overlapping');
    expect(dominantStyleKey(paths)).toBe(styleKeyOf(paths[0]));
  });
  it('accepts separate pieces with nested sizes and hem lines', () => {
    const paths = [0, 1, 2].flatMap(piece => {
      const x = piece * 70;
      return [rectangle(x, 0, 60, 40), rectangle(x + 4, 4, 52, 32), rectangle(x + 8, 8, 44, 24), line(x, 12, x + 60, 12), line(x, 28, x + 60, 28)];
    });
    const result = traceSizes({ paths, texts: [], assignments: { [styleKeyOf(paths[0])]: 'uni' }, options: opts, scale });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(sheetProblem(result)).toBeNull();
  });
});
describe('size suggestion', () => {
  it('suggests the style that encloses clearly the most area, ignoring the calibration square', () => {
    const cm = 1 / CM_PER_PT;
    // The piece outline is split into open strokes, as on tiled pages; arrows and the square are other styles.
    const ring = squareRing(0, 0, 30 * cm), piece = [0, 1, 2, 3].map(i => testPath([ring[i], ring[i + 1]], { lineWidth: 1.4 }));
    const arrows = [testPath([[5 * cm, 5 * cm], [5 * cm, 20 * cm]], { lineWidth: 0.35 })];
    const square = testPath(squareRing(40 * cm, 0, 5 * cm), { lineWidth: 0.5, closed: [true] });
    const scale = { cmPerPt: CM_PER_PT, source: 'square' as const, squareCm: 5, measuredPt: 5 * cm, page: 1 };
    expect(suggestAssignments([...piece, ...arrows, square], [], scale)).toEqual({ [styleKeyOf(piece[0])]: 'uni' });
    const other = [0, 1, 2, 3].map(i => testPath([ring[i], ring[i + 1]].map(([x, y]) => [x + 50 * cm, y] as [number, number]), { stroke: [1, 0, 0] }));
    expect(suggestAssignments([...piece, ...other], [], scale)).toEqual({});
  });
});
describe('piece grouping', () => {
  it('uses largest total area, overlap over smaller area, and preserves leftovers', () => {
    const texts = [{ str: 'inside', x: 2, y: 2, height: 1, angle: 0 }, { str: 'outside', x: -1, y: -1, height: 1, angle: 0 }];
    const result = groupPieces({ S: [squareRing(1, 1, 8), squareRing(50, 50, 5)], L: [squareRing(0, 0, 10), squareRing(20, 0, 10)] }, texts);
    expect(result).toHaveLength(3);
    expect(result[0].refSize).toBe('L');
    expect(result[0].labels).toEqual(['inside']);
    expect(Object.keys(result[0].sizes)).toEqual(['L', 'S']);
    expect(result[2].refSize).toBe('S');
  });
  it('does not overwrite two outlines of the same size and places page texts', async () => {
    expect(groupPieces({ L: [squareRing(0, 0, 20)], S: [squareRing(1, 1, 5), squareRing(10, 10, 5)] }, [])).toHaveLength(2);
    // A small mark inside the piece overlaps it completely too, but the size's own outline wins.
    const marked = groupPieces({ L: [squareRing(0, 0, 20)], S: [squareRing(2, 2, 3), squareRing(1, 1, 18)] }, []);
    expect(marked).toHaveLength(2);
    expect(area(marked[0].sizes.S)).toBeCloseTo(18 * 18);
    // The same with the mark in the reference size: the outline still joins the piece, not the mark.
    const referenceMark = groupPieces({ L: [squareRing(0, 0, 20), squareRing(2, 2, 3)], S: [squareRing(1, 1, 18)] }, []);
    expect(referenceMark).toHaveLength(2);
    expect(area(referenceMark.find(c => c.sizes.S)!.sizes.L)).toBeCloseTo(20 * 20);
    const doc = await readPdf(pdfBytes([{ content: 'BT /F1 12 Tf 10 20 Td (label) Tj ET' }]));
    expect(assembleTexts(doc, [{ page: 1, block: 0, col: 0, row: 0, x: 50, y: 60 }])[0]).toMatchObject({ x: 60, y: 340 });
  });
});
