import { describe, expect, it } from 'vitest';
import { area, bbox } from '../src/geom/polygon';
import { styleLegend, styleKeyOf, defaultAssignments } from '../src/pdf/styles';
import { suggestAssignments, traceOutlines, traceSizes } from '../src/pdf/trace';
import { groupPieces } from '../src/pdf/group';
import { assembleTexts } from '../src/pdf/place';
import { readPdf } from '../src/pdf/readPdf';
import { CM_PER_PT } from '../src/pdf/scale';
import { pdfBytes, squareRing, testPath } from './pdf-writer';
import type { TraceOptions } from '../src/pdf/types';

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
  it('allows keeping square pieces that resemble calibration marks', () => {
    const path = testPath(squareRing(0, 0, pt(5)), { closed: [true] });
    const request = { paths: [path], texts: [], assignments: { [styleKeyOf(path)]: 'uni' }, options: opts,
      scale: { source: 'square' as const, measuredPt: pt(5), squareCm: 5, cmPerPt: CM_PER_PT } };
    expect(traceSizes(request).candidates).toHaveLength(0);
    expect(traceSizes({ ...request, excludeScaleMarks: false }).candidates).toHaveLength(1);
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
    const doc = await readPdf(pdfBytes([{ content: 'BT /F1 12 Tf 10 20 Td (label) Tj ET' }]));
    expect(assembleTexts(doc, [{ page: 1, block: 0, col: 0, row: 0, x: 50, y: 60 }])[0]).toMatchObject({ x: 60, y: 340 });
  });
});
