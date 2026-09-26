import { describe, expect, it } from 'vitest';
import { bbox, signedArea } from '../src/geom/polygon';
import { parsePatternFile } from '../src/model/pattern';
import { buildPattern, patternName, slug, sortSizes, suggestSeamAllowance, uniqueId } from '../src/pdf/build';
import { foldEdges } from '../src/pdf/pieces';
import type { PieceDraft } from '../src/pdf/pieces';
import { CM_PER_PT } from '../src/pdf/scale';
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
  cut: [{ material: 'vnější', count: 2 }], foldEdge: null, grainAngle: 90, optional: false, variantGroup: '', variant: '', ...patch });
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
});
