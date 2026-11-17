import { describe, expect, it } from 'vitest';
import { describe as text } from '../src/i18n';
import { bbox, signedArea } from '../src/geom/polygon';
import { parsePatternFile } from '../src/model/pattern';
import { applySkips, buildPattern, checkPieces, patternName, slug, sortSizes, suggestSeamAllowance, uniqueId } from '../src/pdf/build';
import { foldEdges, newRectangle, rectangleProblems } from '../src/pdf/pieces';
import type { PieceDraft, RectangleDraft } from '../src/pdf/pieces';
import { CM_PER_PT } from '../src/pdf/scale';
import { caught } from './fixtures';
import type { PdfText, Pt, TraceResult } from '../src/pdf/types';

// A test square printed at 102 %: 1 pt on the sheet is 1.02 × 2.54 / 72 cm.
const k = CM_PER_PT * 1.02, pt = (cm: number) => cm / k;
// Width × length rectangle in cm whose length runs at `degrees` in the sheet, as a closed traced ring in pt.
function rotated(origin: Pt, width: number, length: number, degrees: number): Pt[] {
  const a = degrees * Math.PI / 180, u: Pt = [Math.cos(a), Math.sin(a)], v: Pt = [-Math.sin(a), Math.cos(a)];
  const at = (s: number, t: number): Pt => [pt(origin[0] + s * u[0] + t * v[0]), pt(origin[1] + s * u[1] + t * v[1])];
  const ring = [at(0, 0), at(length, 0), at(length, width), at(0, width)];
  return [...ring, ring[0]];
}
const draft = (candidateId: number, patch: Partial<PieceDraft> = {}): PieceDraft => ({ candidateId, include: true, name: 'Přední díl',
  cut: [{ material: 'vnější', count: 2 }], foldEdge: null, grainAngle: 90, optional: false, variantGroup: '', variant: '', variants: [], ...patch });
// Size L 10 × 20 cm and size M 8 × 18 cm sharing the long edge, both with the length at 30° in the sheet.
const result: TraceResult = { cmPerPt: k, sizes: ['L', 'M'], candidates: [
  { id: 1, refSize: 'L', sizes: { L: rotated([50, 40], 10, 20, 30), M: rotated([50 + Math.cos(Math.PI / 6), 40 + Math.sin(Math.PI / 6)], 8, 18, 30) }, labels: [] },
  { id: 2, refSize: 'L', sizes: { L: rotated([0, 0], 10, 30, 0) }, labels: [] },
] };
const meta = { id: 'test', name: ' Testovací střih ', seamAllowance: 'none' as const, sizes: ['M', 'L', 'XS'] };

describe('buildPattern', () => {
  it('rotates every size by the grain about one origin, scales to cm and moves the bbox minimum to 0', () => {
    const pattern = buildPattern(result, [draft(1, { grainAngle: 30 }), draft(2, { grainAngle: 0 })], meta);
    const [first, second] = pattern.pieces;
    for (const [size, [w, h]] of [['L', [10, 20]], ['M', [8, 18]]] as const) {
      const shape = first.sizes[size], b = bbox(shape.outline);
      expect([b.minX, b.minY]).toEqual([0, 0]);
      expect(b.width).toBeCloseTo(w, 1); expect(b.height).toBeCloseTo(h, 1);
      expect(shape.bbox).toEqual([w, h]);
      expect(shape.area).toBeCloseTo(w * h, 0);
      // Same rotation for all sizes: every edge is axis-aligned, not just the reference's.
      shape.outline.forEach((p, i) => { const q = shape.outline[(i + 1) % shape.outline.length]; expect(Math.min(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]))).toBeLessThan(0.02); });
      // The offline builder's winding: negative shoelace sum; no repeated closing point.
      expect(signedArea(shape.outline)).toBeLessThan(0);
      expect(shape.outline).toHaveLength(4);
    }
    // A horizontal grain turns a 30 cm long horizontal piece upright.
    expect(second.sizes.L.bbox).toEqual([10, 30]);
    expect(Object.keys(first.sizes)).toEqual(['M', 'L']);
  });
  it('puts the fold on the outline of every size', () => {
    // The long edge from (50, 40) cm that size M shares.
    const start: Pt = [pt(50), pt(40)], end: Pt = [pt(50 + 20 * Math.cos(Math.PI / 6)), pt(40 + 20 * Math.sin(Math.PI / 6))];
    const near = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01;
    const shared = foldEdges(result.candidates[0], k).findIndex(e => (near(e.a, start) && near(e.b, end)) || (near(e.a, end) && near(e.b, start)));
    expect(shared).toBeGreaterThanOrEqual(0);
    const pattern = parsePatternFile(buildPattern(result, [draft(1, { grainAngle: 30, foldEdge: shared })], meta));
    const { L, M } = pattern.pieces[0].sizes;
    for (const [shape, length, width] of [[L, 20, 10], [M, 18, 8]] as const) {
      const [a, b] = shape.fold!;
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(length, 1);
      // Vertical (along the grain) on one side of the piece.
      expect(a[0]).toBeCloseTo(b[0], 2);
      expect([0, width].some(x => Math.abs(a[0] - x) < 0.02)).toBe(true);
    }
  });
  it('maps names, cut counts, optional and variants, drops excluded pieces and round-trips through parsePatternFile', () => {
    const pattern = buildPattern(result, [draft(1, { name: ' Přední díl ', cut: [{ material: ' podšívka ', count: 1 }], optional: true, variantGroup: 'Délka', variant: 'Krátká' }),
      draft(2, { variantGroup: ' ', variant: '' }), draft(1, { include: false })], { ...meta, author: '', source: 'strih.pdf' });
    expect(pattern.pieces.map(p => p.id)).toEqual(['predni-dil', 'predni-dil-2']);
    expect(pattern.pieces[0]).toMatchObject({ name: 'Přední díl', cut: [{ material: 'podšívka', count: 1 }], optional: true, variantGroup: 'Délka', variant: 'Krátká' });
    expect(pattern.pieces[1]).not.toHaveProperty('optional');
    expect(pattern.pieces[1]).not.toHaveProperty('variantGroup');
    expect(pattern).toMatchObject({ format: 'fitter-pattern@1', id: 'test', name: 'Testovací střih', source: 'strih.pdf', seamAllowance: 'none', sizes: ['M', 'L'] });
    expect(pattern).not.toHaveProperty('author');
    expect(parsePatternFile(JSON.parse(JSON.stringify(pattern)))).toEqual(pattern);
  });
});

describe('variants', () => {
  // 30 × 20 cm piece (length along x) cut in three stacked cells of 20, 6 and 4 cm length.
  const cell = (id: number, from: number, to: number) => ({ id, ring: [[pt(from), 0], [pt(to), 0], [pt(to), pt(20)], [pt(from), pt(20)], [pt(from), 0]] as Pt[],
    areaPt2: 0, neighbours: [], touchesOutside: true });
  const stacked: TraceResult = { cmPerPt: k, sizes: ['L'], candidates: [{ id: 1, refSize: 'L', sizes: { L: rotated([0, 0], 20, 30, 0) },
    cells: { L: [cell(1, 0, 20), cell(2, 20, 26), cell(3, 26, 30)] }, labels: [] }] };
  const variants = (...picks: [string, number[]][]) => picks.map(([label, ids]) => ({ label, cells: { L: ids } }));
  const three = variants(['krátký', [1]], ['střední', [1, 2]], ['dlouhý', [1, 2, 3]]);
  const build = (patch: Partial<PieceDraft>) => buildPattern(stacked, [draft(1, { name: 'Rukáv', grainAngle: 0, ...patch })], { ...meta, sizes: ['L'] });
  it('writes one piece per variant in one group', () => {
    const pattern = parsePatternFile(build({ variants: three }));
    expect(pattern.pieces.map(p => [p.id, p.name, p.variantGroup, p.variant])).toEqual([
      ['rukav-kratky', 'Rukáv – krátký', 'Rukáv', 'krátký'], ['rukav-stredni', 'Rukáv – střední', 'Rukáv', 'střední'], ['rukav-dlouhy', 'Rukáv – dlouhý', 'Rukáv', 'dlouhý']]);
    pattern.pieces.forEach((p, i) => expect(Math.abs(p.sizes.L.area - [400, 520, 600][i])).toBeLessThan([4, 5.2, 6][i]));
    expect(build({ variants: three, variantGroup: 'Délka' }).pieces.every(p => p.variantGroup === 'Délka')).toBe(true);
  });
  it('joins traced cells whose rings are one pixel apart', () => {
    const gap = 0.5 / 10 / k;  // one 0.5 mm pixel, like neighbouring traced rings
    const apart: TraceResult = { ...stacked, resolutionMm: 0.5, candidates: [{ ...stacked.candidates[0],
      cells: { L: [cell(1, 0, 20), { ...cell(2, 0, 0), ring: cell(2, 20, 26).ring.map(([x, y]): Pt => [x + gap, y]) }] } }] };
    const pattern = buildPattern(apart, [draft(1, { grainAngle: 0, variants: variants(['dlouhý', [1, 2]]) })], { ...meta, sizes: ['L'] });
    expect(Math.abs(pattern.pieces[0].sizes.L.area - 520)).toBeLessThan(10);
  });
  it('names piece, variant and size when the selection is disconnected', () => {
    const apart = caught(() => build({ variants: variants(['dlouhý', [1, 3]]) }));
    expect(apart.code).toBe('build.variantUnion');
    expect(apart.params).toEqual({ name: 'Rukáv', variant: 'dlouhý', size: 'L', reason: { code: 'geom.partsDisconnected' } });
    expect(text(apart)).toBe('Díl „Rukáv“, varianta „dlouhý“, velikost L: Vybrané části na sebe nenavazují.');
    expect(caught(() => build({ variants: variants(['x', [9]]) })).code).toBe('build.cellMissing');
  });
  it('omits sizes a variant has no cells for', () => {
    const two: TraceResult = { ...stacked, sizes: ['L', 'M'], candidates: [{ ...stacked.candidates[0], sizes: { L: stacked.candidates[0].sizes.L, M: stacked.candidates[0].sizes.L },
      cells: { L: stacked.candidates[0].cells!.L, M: stacked.candidates[0].cells!.L } }] };
    const pattern = buildPattern(two, [draft(1, { variants: [{ label: 'a', cells: { L: [1] } }, { label: 'b', cells: { L: [1], M: [1, 2] } }] })], { ...meta, sizes: ['L', 'M'] });
    expect(pattern.pieces.map(p => Object.keys(p.sizes))).toEqual([['L'], ['L', 'M']]);
  });
  it('keeps a draft without variants as before', () => {
    expect(buildPattern(stacked, [draft(1, { variantGroup: 'Rukáv', variant: 'celý' })], meta).pieces.map(p => [p.id, p.variantGroup, p.variant])).toEqual([['predni-dil', 'Rukáv', 'celý']]);
  });
  it('snaps the fold to each variant', () => {
    const edges = foldEdges(stacked.candidates[0], k), edge = edges.findIndex(e => e.length * k > 29 && Math.abs(e.a[1]) < 1 && Math.abs(e.b[1]) < 1);
    expect(edge).toBeGreaterThanOrEqual(0);
    const pattern = parsePatternFile(build({ variants: three, foldEdge: edge }));
    pattern.pieces.forEach((p, i) => { const [a, b] = p.sizes.L.fold!; expect(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - [20, 26, 30][i])).toBeLessThan(0.15); });
  });
});

describe('checkPieces', () => {
  // Size M of candidate 1 is a bow tie: its two diagonals cross.
  const bow: Pt[] = [[0, 0], [pt(10), pt(10)], [pt(10), 0], [0, pt(10)], [0, 0]];
  const broken: TraceResult = { ...result, candidates: [{ ...result.candidates[0], sizes: { ...result.candidates[0].sizes, M: bow } }, result.candidates[1]] };
  const built = () => buildPattern(broken, [draft(1, { name: 'Rukáv', grainAngle: 30 }), draft(2, { name: 'Záda', grainAngle: 0 })], { ...meta, sizes: ['M', 'L'] });
  it('names the piece and size whose outline cannot be validated', () => {
    expect(checkPieces(built())).toMatchObject([{ pieceId: 'rukav', pieceName: 'Rukáv', size: 'M', problem: 'outline', error: { code: 'pattern.outlineInvalid', params: { piece: 1, size: 'M' } } }]);
    expect(checkPieces(buildPattern(result, [draft(1, { grainAngle: 30 })], meta))).toEqual([]);
  });
  it('drops one size and keeps the others', () => {
    const pattern = applySkips(built(), [{ pieceId: 'rukav', size: 'M' }]);
    expect(Object.keys(pattern.pieces[0].sizes)).toEqual(['L']);
    expect(pattern.pieces).toHaveLength(2);
    expect(() => parsePatternFile(pattern)).not.toThrow();
    expect(checkPieces(pattern)).toEqual([]);
  });
  it('drops a piece whose only size is bad, and sizes no piece has any more', () => {
    const only: TraceResult = { ...result, sizes: ['M'], candidates: [{ id: 1, refSize: 'M', sizes: { M: bow }, labels: [] }] };
    const pattern = buildPattern(only, [draft(1, { name: 'Rukáv' })], { ...meta, sizes: ['M'] });
    expect(checkPieces(pattern)).toHaveLength(1);
    const empty = applySkips(pattern, [{ pieceId: 'rukav', size: 'M' }]);
    expect(empty.pieces).toEqual([]);
    expect(empty.sizes).toEqual([]);
    expect(applySkips(built(), [{ pieceId: 'rukav' }]).pieces.map(p => p.id)).toEqual(['zada']);
  });
  it('reports a fold off the outline as a fold problem and can save without it', () => {
    const pattern = buildPattern(result, [draft(2, { grainAngle: 0 })], meta);
    pattern.pieces[0].sizes.L.fold = [[3, 3], [3, 8]];
    expect(checkPieces(pattern)).toMatchObject([{ size: 'L', problem: 'fold' }]);
    const fixed = applySkips(pattern, [{ pieceId: pattern.pieces[0].id, size: 'L', fold: true }]);
    expect(fixed.pieces[0].sizes.L).not.toHaveProperty('fold');
    expect(checkPieces(fixed)).toEqual([]);
  });
});

describe('same outline for all sizes', () => {
  it('copies the reference outline into every size of the pattern', () => {
    const one: TraceResult = { cmPerPt: k, sizes: ['34', '36', '42', '50'], candidates: [{ id: 1, refSize: '42', sizes: { 42: rotated([0, 0], 10, 20, 0) }, labels: [] }] };
    const sizes = ['34', '36', '42', '50'];
    const pattern = parsePatternFile(buildPattern(one, [draft(1, { grainAngle: 0, allSizes: true })], { ...meta, sizes }));
    expect(pattern.sizes).toEqual(sizes);
    expect(Object.keys(pattern.pieces[0].sizes)).toEqual(sizes);
    for (const size of sizes) expect(pattern.pieces[0].sizes[size]).toEqual(pattern.pieces[0].sizes['42']);
    expect(Object.keys(buildPattern(one, [draft(1, { grainAngle: 0 })], { ...meta, sizes }).pieces[0].sizes)).toEqual(['42']);
  });
});

describe('rectangle pieces', () => {
  const rectangle = (patch: Partial<RectangleDraft> = {}): RectangleDraft => ({ ...newRectangle(['S', 'M']), name: 'Manžeta', cut: [{ material: 'hlavní', count: 2 }], ...patch });
  const build = (rectangles: RectangleDraft[]) => parsePatternFile(buildPattern(result, [draft(1, { include: false })], { ...meta, sizes: ['S', 'M'] }, rectangles));
  it('builds one width × length for every size', () => {
    const pattern = build([rectangle({ name: 'Plisé', sizes: { S: { width: 7, height: 44 }, M: { width: 7, height: 44 } } })]);
    expect(pattern.sizes).toEqual(['S', 'M']);
    for (const size of ['S', 'M']) expect(pattern.pieces[0].sizes[size]).toMatchObject({ bbox: [7, 44], area: 308, outline: [[0, 0], [0, 44], [7, 44], [7, 0]] });
    expect(pattern.pieces[0]).toMatchObject({ id: 'plise', name: 'Plisé', cut: [{ material: 'hlavní', count: 2 }] });
    expect(signedArea(pattern.pieces[0].sizes.S.outline)).toBeLessThan(0);
  });
  it('builds different dimensions per size, with unique ids next to traced pieces', () => {
    const pattern = parsePatternFile(buildPattern(result, [draft(2, { name: 'Manžeta' })], { ...meta, sizes: ['M', 'L'] },
      [rectangle({ perSize: true, sizes: { M: { width: 6, height: 17 }, L: { width: 6, height: 17.5 } } })]));
    expect(pattern.pieces.map(p => p.id)).toEqual(['manzeta', 'manzeta-2']);
    expect(pattern.pieces[1].sizes.M.area).toBe(102);
    expect(pattern.pieces[1].sizes.L.area).toBe(105);
    expect(pattern.sizes).toEqual(['M', 'L']);
  });
  it('blocks a missing name and zero, negative or empty dimensions', () => {
    const ok = rectangle({ sizes: { S: { width: 7, height: 44 }, M: { width: 7, height: 44 } } });
    expect(rectangleProblems(ok)).toEqual([]);
    expect(rectangleProblems({ ...ok, name: ' ' })).toHaveLength(1);
    for (const bad of [0, -3, NaN, 1001]) expect(rectangleProblems({ ...ok, sizes: { ...ok.sizes, M: { width: bad, height: 5 } } }), String(bad)).toHaveLength(1);
    expect(rectangleProblems(newRectangle(['S']))).toHaveLength(2);
  });
});

describe('pattern metadata', () => {
  const texts = (...lines: string[]): PdfText[] => lines.map((str, i) => ({ str, x: 0, y: i * 10, height: 8, angle: 0 }));
  it('suggests the seam allowance from sheet texts', () => {
    for (const lines of [['Nahtzugabe enthalten'], ['inkl.', 'Nahtzugabe 1 cm'], ['Střih obsahuje přídavky na švy'], ['Seam allowance included']])
      expect(suggestSeamAllowance(texts(...lines)), lines.join(' ')).toBe('included');
    for (const lines of [['ohne Nahtzugabe'], ['Keine Nahtzugabe'], ['kein Nahtzugabe'], ['Střih je bez přídavků na švy'], ['Přidejte přídavky na švy'], ['without seam allowance']])
      expect(suggestSeamAllowance(texts(...lines)), lines.join(' ')).toBe('none');
    expect(suggestSeamAllowance(texts('Vorderteil', '2x zuschneiden'))).toBe('unknown');
    expect(suggestSeamAllowance(texts('Nahtzugabe enthalten', 'Saum ohne Nahtzugabe'))).toBe('unknown');
  });
  it('reads English seam allowance phrases, with a measurement or SA', () => {
    for (const lines of [['Pattern includes a 3/8" seam allowance'], ['5/8 inch seam allowances are included'], ['Includes 1.5 cm seam allowance'], ['SA included'], ['Including 1 in. seam allowances']])
      expect(suggestSeamAllowance(texts(...lines)), lines.join(' ')).toBe('included');
    for (const lines of [['Add seam allowance'], ['Seam allowances are not included'], ['SA not included'], ['No SA']])
      expect(suggestSeamAllowance(texts(...lines)), lines.join(' ')).toBe('none');
    expect(suggestSeamAllowance(texts('Includes a 3/8" seam allowance', 'Add seam allowance to the hem'))).toBe('unknown');
    expect(suggestSeamAllowance(texts('Sleeve', 'Cut 2'))).toBe('unknown');
  });
  it('sorts sizes: numbers numerically, then S < M < L < XL < XXL, then text', () => {
    expect(sortSizes(['XL', '42', 'M', 'uni', '38', 'S', 'XXL', 'L', '104', '36/38', 'XS'])).toEqual(['38', '42', '104', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '36/38', 'uni']);
    expect(sortSizes(['3XL', '2XL', 'XL'])).toEqual(['XL', '2XL', '3XL']);
  });
  it('derives a unique slug id and a name from the PDF title or file name', () => {
    expect(slug('Taška DEMO – střih A4')).toBe('taska-demo-strih-a4');
    expect(uniqueId('kabelka', ['kabelka', 'kabelka-2'])).toBe('kabelka-3');
    expect(patternName(undefined, 'Taska-DEMO_mala.pdf')).toBe('Taska DEMO mala');
    expect(patternName('Microsoft Word - navod.docx', 'Kabelka.pdf')).toBe('Kabelka');
    expect(patternName(' Šaty Demo ', 'x.pdf')).toBe('Šaty Demo');
  });
  it('strips trailing paper formats and pattern words from the default name, but never everything', () => {
    expect(patternName(undefined, 'Taska-DEMO-strih-A4.pdf')).toBe('Taska DEMO');
    expect(patternName('Šaty Demo Gr. 36-44 A0', 'x.pdf')).toBe('Šaty Demo Gr. 36-44');
    expect(patternName(undefined, 'Model_X_Schnittmuster_US-Letter.pdf')).toBe('Model X');
    expect(patternName('Model X – STŘIH legal', 'x.pdf')).toBe('Model X');
    expect(patternName(undefined, 'Kleid Pattern ebook print copyshop.pdf')).toBe('Kleid');
    expect(patternName(undefined, 'Sprint A3.pdf')).toBe('Sprint');
    expect(patternName(undefined, 'strih-A4.pdf')).toBe('strih A4');
    expect(patternName('Pattern', 'x.pdf')).toBe('Pattern');
  });
  it('strips English file-name noise: projector, copy shop, print at home', () => {
    expect(patternName(undefined, 'Tee_Dress_Projector.pdf')).toBe('Tee Dress');
    expect(patternName(undefined, 'Tee Dress Copy Shop.pdf')).toBe('Tee Dress');
    expect(patternName(undefined, 'Tee-Dress-Print-At-Home.pdf')).toBe('Tee Dress');
    expect(patternName(undefined, 'Tee Dress Print at Home A4.pdf')).toBe('Tee Dress');
    expect(patternName(undefined, 'Projector.pdf')).toBe('Projector');
  });
});
