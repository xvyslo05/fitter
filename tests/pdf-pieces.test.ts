import { describe, expect, it } from 'vitest';
import { contentPages } from '../src/pdf/match';
import { assemblePaths } from '../src/pdf/place';
import { CM_PER_PT } from '../src/pdf/scale';
import { detectGrain, foldEdges, parseCutLabels, sizeFolds, snapFold, straightEdges, suggestPieces } from '../src/pdf/pieces';
import type { PdfDoc, PdfText, PieceCandidate, Pt, TraceResult } from '../src/pdf/types';
import { testPath } from './pdf-writer';

const pt = (cm: number) => cm / CM_PER_PT;
const cm = (points: Pt[]): Pt[] => points.map(([x, y]) => [pt(x), pt(y)]);
// Traced outlines repeat their first point at the end.
const closedRing = (points: Pt[]): Pt[] => [...cm(points), cm(points)[0]];
const text = (str: string, x: number, y: number, height = 12): PdfText => ({ str, x: pt(x), y: pt(y), height, angle: 0 });
const candidate = (sizes: Record<string, Pt[]>, labels: string[] = [], id = 1): PieceCandidate =>
  ({ id, refSize: Object.keys(sizes)[0], sizes: Object.fromEntries(Object.entries(sizes).map(([s, p]) => [s, closedRing(p)])), labels });
const result = (...candidates: PieceCandidate[]): TraceResult => ({ cmPerPt: CM_PER_PT, sizes: Object.keys(candidates[0].sizes), candidates });
const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const line = (a: Pt, b: Pt) => testPath(cm([a, b]));
// A grain arrow: shaft from `a` to `b`, wings back from the tip at ±25°.
function arrow(a: Pt, b: Pt, wing = 1): ReturnType<typeof testPath> {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const w = (sign: number): Pt => [b[0] - wing * Math.cos(angle + sign * 25 * Math.PI / 180), b[1] - wing * Math.sin(angle + sign * 25 * Math.PI / 180)];
  return testPath(cm([a, b, w(1), b, w(-1)]));
}

describe('cut labels', () => {
  it('parses Czech counts with printed materials in dictionary form', () => {
    expect(parseCutLabels(['vystřihnout 1x VNĚJŠÍ', 'vystřihnout 2x PODŠÍVKA']).cut).toEqual([{ material: 'vnější', count: 1 }, { material: 'podšívka', count: 2 }]);
    expect(parseCutLabels(['2x z PODŠÍVKY', '1x vnější látky']).cut).toEqual([{ material: 'podšívka', count: 2 }, { material: 'vnější', count: 1 }]);
    expect(parseCutLabels(['1x PODŠÍVCE']).cut).toEqual([{ material: 'podšívka', count: 1 }]);
  });
  it('parses German and English instructions; a count without material gets the default', () => {
    for (const label of ['2x zuschneiden', 'cut 2', 'Cut 2 x', '2 ×', 'x 2', '2 mal']) expect(parseCutLabels([label]).cut).toEqual([{ material: 'hlavní', count: 2 }]);
    expect(parseCutLabels(['2x zuschneiden'], 'vnější').cut).toEqual([{ material: 'vnější', count: 2 }]);
    expect(parseCutLabels(['2x Oberstoff', 'cut 1 lining']).cut).toEqual([{ material: 'oberstoff', count: 2 }, { material: 'lining', count: 1 }]);
    // Before the count only a known material word is a material.
    expect(parseCutLabels(['PODŠÍVKA 2x']).cut).toEqual([{ material: 'podšívka', count: 2 }]);
    expect(parseCutLabels(['navíc 1x']).cut).toEqual([{ material: 'hlavní', count: 1 }]);
    // The same instruction in two languages is not two instructions.
    expect(parseCutLabels(['2x zuschneiden', 'cut 2']).cut).toEqual([{ material: 'hlavní', count: 2 }]);
  });
  it('gives a count without material to a material named on the piece that has no count of its own (a)', () => {
    const parsed = parseCutLabels(['UCHO V PODŠÍVCE', 'vystřihnout 1x VNĚJŠÍ', 'vystřihnout 2x'], 'vnější');
    expect(parsed.cut).toEqual([{ material: 'vnější', count: 1 }, { material: 'podšívka', count: 2 }]);
    expect(parsed).not.toHaveProperty('hint');
    // A named material that already has a count, or the repeated pattern title, does not take it.
    expect(parseCutLabels(['PODŠÍVKA', 'vystřihnout 1x PODŠÍVKA', 'vystřihnout 2x'], 'vnější').cut).toEqual([{ material: 'podšívka', count: 1 }, { material: 'vnější', count: 2 }]);
    expect(parseCutLabels(['TAŠKA V PODŠÍVCE', 'vystřihnout 2x'], 'vnější', new Set(['TAŠKA V PODŠÍVCE'])).cut).toEqual([{ material: 'vnější', count: 2 }]);
  });
  it('keeps printed counts and asks for a check when the fallback material already has one (b)', () => {
    const parsed = parseCutLabels(['vystřihnout 1x VNĚJŠÍ', 'vystřihnout 2x'], 'vnější');
    expect(parsed.cut).toEqual([{ material: 'vnější', count: 1 }]);
    expect(parsed.hint).toBe('Pokyn „vystřihnout 2x“ neuvádí materiál – zkontrolujte počty.');
  });
  it('gives the fallback material the count when the piece has no printed material (c)', () => {
    expect(parseCutLabels(['vystřihnout 2x'], 'vnější')).toMatchObject({ cut: [{ material: 'vnější', count: 2 }] });
    expect(parseCutLabels(['vystřihnout 2x'], 'vnější')).not.toHaveProperty('hint');
    expect(parseCutLabels(['1x im Bruch zuschneiden']).cut).toEqual([{ material: 'hlavní', count: 1 }]);
  });
  it('does not add up one instruction printed in two languages', () => {
    expect(parseCutLabels(['2x PODŠÍVKA', 'cut 2 podšívka']).cut).toEqual([{ material: 'podšívka', count: 2 }]);
    expect(parseCutLabels(['2x zuschneiden', 'cut 2']).cut).toEqual([{ material: 'hlavní', count: 2 }]);
    expect(parseCutLabels(['vystřihnout 1x VNĚJŠÍ', 'cut 1'], 'vnější').cut).toEqual([{ material: 'vnější', count: 1 }]);
  });
  it('ignores measurements and defaults to hlavní × 1', () => {
    for (const labels of [[], ['5 x 5 cm'], ['5x5'], ['Kontrollquadrat 5x5'], ['Größe 36', 'XL']]) expect(parseCutLabels(labels).cut).toEqual([{ material: 'hlavní', count: 1 }]);
  });
  it('detects fold words in the languages of the patterns', () => {
    for (const label of ['1x im Bruch zuschneiden', 'Stoffbruch', 'im St.Br.', 'cut 1 on fold', 'na lomu', 'LOM', 'přeložení', 'au pli']) expect(parseCutLabels([label]).fold, label).toBe(true);
    for (const label of ['lomítko', 'folder', 'multiplier', 'vystřihnout 2x']) expect(parseCutLabels([label]).fold, label).toBe(false);
    expect(parseCutLabels(['1x im Bruch zuschneiden']).cut).toEqual([{ material: 'hlavní', count: 1 }]);
  });
  it('names a piece by the first name-like label, skipping titles, instructions, sizes and scale text', () => {
    expect(parseCutLabels(['TAŠKA DEMO', 'vystřihnout 1x VNĚJŠÍ', '36 38 40', '5 x 5 cm', 'Stoffbruch', 'UCHO 1/2'], 'hlavní', new Set(['TAŠKA DEMO'])).name).toBe('UCHO 1/2');
    expect(parseCutLabels(['1', 'S M L', 'cm']).name).toBeUndefined();
    expect(parseCutLabels(['Tato věta je příliš dlouhá na název dílu']).name).toBeUndefined();
  });
});

describe('straight edges', () => {
  it('chains raster stair-steps along an edge but splits at corners and bends', () => {
    // A 40 × 20 cm rectangle whose left edge zigzags by 1 mm every centimetre (raster stair-steps).
    const left = Array.from({ length: 19 }, (_, i): Pt => [(i % 2) * 0.1, 19 - i]);
    const edges = straightEdges(cm([[0, 0], [40, 0], [40, 20], [0, 20], ...left]), pt(5));
    expect(edges.map(e => Math.round(e.length * CM_PER_PT)).sort((a, b) => a - b)).toEqual([20, 20, 40, 40]);
    // 3° bend in the middle of the top edge: two edges, not one.
    const bent = straightEdges(cm([[0, 0], [20, 0], [40, 20 * Math.tan(3 * Math.PI / 180)], [40, 20], [0, 20]]), pt(5));
    expect(bent.map(e => Math.round(e.length * CM_PER_PT)).sort((a, b) => a - b)).toEqual([19, 20, 20, 20, 40]);
    // A circle has no straight edge of 5 cm, and short edges are dropped.
    expect(straightEdges(cm(Array.from({ length: 72 }, (_, i): Pt => [20 * Math.cos(i * Math.PI / 36), 20 * Math.sin(i * Math.PI / 36)])), pt(5))).toEqual([]);
    expect(straightEdges(cm(rect(0, 0, 4, 30)), pt(5)).map(e => Math.round(e.length * CM_PER_PT))).toEqual([30, 30]);
  });
  it('offers only edges with the whole outline on one side as fold edges', () => {
    // An L shape: the inner edges would cut through the piece.
    const piece = candidate({ uni: [[0, 0], [30, 0], [30, 10], [10, 10], [10, 40], [0, 40]] });
    expect(foldEdges(piece, CM_PER_PT).map(e => Math.round(e.length * CM_PER_PT)).sort((a, b) => a - b)).toEqual([10, 10, 30, 40]);
  });
});

describe('fold', () => {
  const texts = [text('im Stoffbruch', 1, 20)];
  it('chooses the straight edge nearest to a fold word and snaps it per size', () => {
    // Size L 30 × 40 cm, size M 26 × 36 cm sharing the left edge; the fold word runs along x = 1 cm.
    const piece = candidate({ L: rect(0, 0, 30, 40), M: rect(0, 2, 26, 36) }, ['im Stoffbruch']);
    const [draft] = suggestPieces(result(piece), { contentPaths: [], texts });
    const edge = foldEdges(piece, CM_PER_PT)[draft.foldEdge!];
    expect([edge.a[0], edge.b[0]].map(x => x * CM_PER_PT)).toEqual([0, 0]);
    const folds = sizeFolds(piece, draft.foldEdge, CM_PER_PT);
    expect(folds.L!.flat().map(n => Math.round(n * CM_PER_PT))).toEqual(expect.arrayContaining([0, 0, 0, 40]));
    const m = folds.M!.map(p => p.map(n => Math.round(n * CM_PER_PT * 10) / 10));
    expect(m.map(p => Math.abs(p[0]))).toEqual([0, 0]);
    expect(m.map(p => p[1]).sort((a, b) => a - b)).toEqual([2, 38]);
    // Without the word, or with it far away, there is no fold; grain then does not follow it either.
    expect(suggestPieces(result(piece), { contentPaths: [], texts: [] })[0].foldEdge).toBeNull();
    expect(suggestPieces(result(piece), { contentPaths: [], texts: [text('Stoffbruch', 60, 20)] })[0].foldEdge).toBeNull();
    // Near the outside of the piece (within 2 cm) still counts.
    expect(suggestPieces(result(piece), { contentPaths: [], texts: [{ ...text('Bruch', -1.5, 20), angle: Math.PI / 2 }] })[0].foldEdge).not.toBeNull();
  });
  it('fits the snapped fold through the vertices near the approximate edge', () => {
    const ring = cm([[0, 0], [10, 0], [10, 20], [0.05, 20], [0, 10]]);
    const fold = snapFold(ring, cm([[0.2, 0], [0.2, 20]]) as [Pt, Pt], pt(0.25))!;
    expect(fold[0][1] * CM_PER_PT).toBeCloseTo(0, 1);
    expect(fold[1][1] * CM_PER_PT).toBeCloseTo(20, 1);
    expect(Math.abs(fold[0][0] * CM_PER_PT)).toBeLessThan(0.05);
    expect(snapFold(ring, cm([[5, 5], [5, 15]]) as [Pt, Pt], pt(0.25))).toBeNull();
  });
  it('uses the fold direction as grain when no grain line is found', () => {
    const piece = candidate({ uni: rect(0, 0, 40, 20) }, ['Stoffbruch']);
    const [draft] = suggestPieces(result(piece), { contentPaths: [], texts: [text('Stoffbruch', 15, 1)] });
    expect(draft.foldEdge).not.toBeNull();
    expect(draft.grainAngle).toBe(0);
  });
});

describe('grain', () => {
  const piece = candidate({ L: rect(0, 0, 30, 40), M: rect(1, 1, 28, 38) });
  const angleOf = (paths: ReturnType<typeof testPath>[], texts: PdfText[] = []) => suggestPieces(result(piece), { contentPaths: paths, texts })[0].grainAngle;
  it('prefers an arrow inside the piece over a longer plain line', () => {
    const tilted = arrow([10, 25], [10 + 8 * Math.cos(Math.PI / 6), 25 + 8 * Math.sin(Math.PI / 6)]);
    expect(angleOf([tilted, line([5, 10], [25, 10])])).toBeCloseTo(30, 5);
    const g = detectGrain(piece, CM_PER_PT, { contentPaths: [tilted], texts: [] })!;
    expect(g.length * CM_PER_PT).toBeCloseTo(8, 5);
  });
  it('prefers a line labelled as grain, else the longest plain line of at least 3 cm', () => {
    expect(angleOf([line([5, 5], [5, 30]), line([10, 20], [25, 34])], [text('Fadenlauf', 11, 22)])).toBeCloseTo(43.03, 1);
    expect(angleOf([line([5, 5], [5, 30]), line([10, 20], [25, 34])])).toBe(90);
    expect(angleOf([line([5, 5], [7.5, 5])])).toBe(90);
    expect(angleOf([line([5, 5], [25, 5])])).toBe(0);
  });
  it('ignores lines crossing the outline and cutting lines of other sizes', () => {
    expect(angleOf([line([-5, 5], [20, 30])])).toBe(90);
    // Size M's outline drawn as open strokes lies inside L; its edges are not grain lines.
    const m = piece.sizes.M.slice(0, 4).map((p, i, all) => testPath([p, all[(i + 1) % 4]]));
    expect(angleOf(m)).toBe(90);
    expect(angleOf([...m, line([10, 35], [25, 20])])).toBeCloseTo(135, 5);
  });
  it('ignores page furniture repeated on every page', () => {
    const furniture = testPath(cm([[4, 30], [26, 12]]));
    const doc: PdfDoc = { pages: [1, 2].map(index => ({ index, width: pt(50), height: pt(50), clips: [], texts: [],
      paths: index === 1 ? [testPath(closedRing(rect(0, 0, 30, 40)), { closed: [true] }), furniture] : [furniture] })) };
    const placements = [{ page: 1, block: 0, col: 0, row: 0, x: 0, y: 0 }, { page: 2, block: 0, col: 1, row: 0, x: pt(60), y: 0 }];
    expect(angleOf(assemblePaths(doc, placements))).not.toBe(90);
    expect(angleOf(assemblePaths(contentPages(doc), placements))).toBe(90);
  });
  it('joins collinear pieces of a line split at tiles or dashes', () => {
    const g = detectGrain(piece, CM_PER_PT, { contentPaths: [line([15, 3], [15, 12]), line([15, 13], [15, 20]), line([15, 21.5], [15, 36])], texts: [] })!;
    expect(g.length * CM_PER_PT).toBeCloseTo(33, 5);
  });
});

describe('piece suggestions', () => {
  it('names, counts and includes pieces; skips the repeated title and unlabelled scraps', () => {
    const a = candidate({ uni: rect(0, 0, 30, 20) }, ['DEMO', 'TĚLO', 'vystřihnout 1x VNĚJŠÍ', 'vystřihnout 1x PODŠÍVKA'], 1);
    const b = candidate({ uni: rect(40, 0, 20, 20) }, ['DEMO', 'UCHO', 'vystřihnout 2x'], 2);
    const scrap = candidate({ uni: rect(70, 0, 4, 4) }, [], 3), unnamed = candidate({ uni: rect(80, 0, 30, 30) }, ['DEMO'], 4);
    const table = candidate({ uni: rect(0, 30, 20, 10) }, ['36', '38', '40', '42'], 5);
    const texts = [text('DEMO', 2, 2, 12), text('TĚLO', 10, 10, 30), text('vystřihnout 1x VNĚJŠÍ', 2, 15, 14), text('vystřihnout 1x PODŠÍVKA', 2, 17, 14),
      text('DEMO', 42, 2, 12), text('UCHO', 45, 10, 30), text('vystřihnout 2x', 42, 15, 14), text('DEMO', 82, 2, 40)];
    const drafts = suggestPieces({ cmPerPt: CM_PER_PT, sizes: ['uni'], candidates: [a, b, scrap, unnamed, table] }, { contentPaths: [], texts });
    expect(drafts.map(d => d.name)).toEqual(['TĚLO', 'UCHO', 'Díl 3', 'Díl 4', 'Díl 5']);
    expect(drafts.map(d => d.include)).toEqual([true, true, false, true, false]);
    // The most frequent printed material (a tie keeps the first) fills counts without a material.
    expect(drafts[1].cut).toEqual([{ material: 'vnější', count: 2 }]);
    expect(drafts[3].cut).toEqual([{ material: 'hlavní', count: 1 }]);
    expect(drafts[0]).toMatchObject({ candidateId: 1, foldEdge: null, grainAngle: 90, optional: false, variantGroup: '', variant: '' });
    expect(drafts.some(d => 'hint' in d)).toBe(false);
  });
  it('passes the check hint of an instruction without material to the draft', () => {
    const a = candidate({ uni: rect(0, 0, 30, 20) }, ['vystřihnout 1x VNĚJŠÍ', 'vystřihnout 2x'], 1);
    const [draft] = suggestPieces(result(a), { contentPaths: [], texts: [] });
    expect(draft.cut).toEqual([{ material: 'vnější', count: 1 }]);
    expect(draft.hint).toContain('vystřihnout 2x');
  });
});
