import { describe, expect, it } from 'vitest';
import { readPdf } from '../src/pdf/readPdf';
import { CM_PER_PT, detectScale, overrideScale, parseDecimal, resolveScale, withoutScaleMarks } from '../src/pdf/scale';
import { pdfBytes } from './pdf-writer';

describe('PDF scale', () => {
  it('finds a centre-line square next to 5x5 cm on an instruction page', async () => {
    const doc = await readPdf(pdfBytes([{ content: '20 20 100 100 re S' }, {
      content: '4 w 20 40 140 140 re S BT /F1 12 Tf 20 25 Td (5x5 cm) Tj ET',
    }]));
    const result = detectScale(doc);
    expect(result).toEqual({ source: 'square', page: 2, measuredPt: 140, squareCm: 5, cmPerPt: 5 / 140, squarePt: [20, expect.any(Number), 140, 140] });
    expect(result.squarePt![2]).toBeCloseTo(result.measuredPt!, 2);
    expect(result.squarePt![3]).toBeCloseTo(result.measuredPt!, 2);
    expect(overrideScale(result, 10).cmPerPt).toBe(10 / 140);
    expect(() => overrideScale(result, 0)).toThrow('scale.squareSize');
    expect(() => overrideScale(result, NaN)).toThrow('scale.squareSize');
  });
  it('falls back to 100% without a square and ignores open and non-square shapes', async () => {
    const doc = await readPdf(pdfBytes([{ content: '20 20 100 80 re S 0 0 m 140 0 l 140 140 l 0 140 l S' }]));
    expect(detectScale(doc)).toEqual({ source: 'default', cmPerPt: CM_PER_PT });
    expect(() => overrideScale(detectScale(doc), 5)).toThrow('scale.squareSize');
  });
  it('recognises a closed point path and snaps a standard 3 cm side', async () => {
    const doc = await readPdf(pdfBytes([{ content: '10 10 m 95 10 l 95 95 l 10 95 l h S' }]));
    expect(detectScale(doc)).toMatchObject({ source: 'square', squareCm: 3, measuredPt: 85 });
  });
  it('excludes calibration copies even with outlined labels, retaining other square pieces', async () => {
    const doc = await readPdf(pdfBytes([{ content: '10 10 140 140 re S 10 160 140.2 140.2 re S 160 10 100 100 re S' }]));
    expect(withoutScaleMarks(doc.pages[0].paths, [])).toHaveLength(3);
    expect(withoutScaleMarks(doc.pages[0].paths, [], detectScale(doc))).toHaveLength(1);
  });
  it('turns the yes/no answer into a scale without throwing', async () => {
    const square = detectScale(await readPdf(pdfBytes([{ content: '4 w 20 40 140 140 re S BT /F1 12 Tf 20 25 Td (5x5 cm) Tj ET' }])));
    const none = detectScale(await readPdf(pdfBytes([{ content: '20 20 100 80 re S' }])));
    expect(resolveScale(square, { ok: true })).toEqual({ scale: square });
    const smaller = resolveScale(square, { ok: false, measuredCm: 4.8 }), scaled = resolveScale(none, { percent: 97 });
    expect('scale' in smaller && smaller.scale.cmPerPt).toBeCloseTo(square.cmPerPt * 0.96, 12);
    expect('scale' in scaled && scaled.scale.cmPerPt).toBeCloseTo(CM_PER_PT * 0.97, 12);
    for (const bad of [{ ok: false as const, measuredCm: NaN }, { ok: false as const, measuredCm: 0 }, { ok: false as const, measuredCm: -3 }]) expect(resolveScale(square, bad)).toEqual({ error: { code: 'scale.measured' } });
    for (const bad of [NaN, 0, -5, Infinity]) expect(resolveScale(none, { percent: bad })).toEqual({ error: { code: 'scale.percent' } });
    expect(resolveScale(none, { ok: false, measuredCm: 5 })).toEqual({ error: { code: 'scale.squareMissing' } });
  });
  it('reads inch labels and converts them to cm', async () => {
    const two = detectScale(await readPdf(pdfBytes([{ content: '4 w 20 40 144 144 re S BT /F1 12 Tf 20 25 Td (2" x 2") Tj ET' }])));
    expect(two).toMatchObject({ source: 'square', squareCm: 5.08, measuredPt: 144 });
    expect(Math.abs(two.cmPerPt / (2.54 / 72) - 1)).toBeLessThan(0.001);
    const one = detectScale(await readPdf(pdfBytes([{ content: '4 w 20 40 72 72 re S BT /F1 12 Tf 20 25 Td (1 inch test square) Tj ET' }])));
    expect(one).toMatchObject({ source: 'square', squareCm: 2.54 });
    // "in" counts as inches only after a number; a label that is not square stays unread.
    const bare = detectScale(await readPdf(pdfBytes([{ content: '4 w 20 40 144 144 re S BT /F1 12 Tf 20 25 Td (2 in) Tj ET' }])));
    expect(bare).toMatchObject({ source: 'square', squareCm: 5.08 });
    // A printed 4 in label on a square that is not 4 in wide is trusted over the standard sizes.
    const mislabelled = detectScale(await readPdf(pdfBytes([{ content: '4 w 20 40 140 140 re S BT /F1 12 Tf 20 25 Td (2 in x 2 in) Tj ET' }])));
    expect(mislabelled).toMatchObject({ squareCm: 5.08, measuredPt: 140 });
  });
  it('snaps squares of 2 and 4 inches without a label', async () => {
    expect(detectScale(await readPdf(pdfBytes([{ content: '10 10 m 154 10 l 154 154 l 10 154 l h S' }])))).toMatchObject({ source: 'square', squareCm: 5.08 });
    expect(detectScale(await readPdf(pdfBytes([{ content: '10 10 m 298 10 l 298 298 l 10 298 l h S' }])))).toMatchObject({ source: 'square', squareCm: 10.16 });
  });
  it('reads decimal input with a comma', () => {
    expect(parseDecimal('4,8')).toBe(4.8);
    expect(parseDecimal(' 4.8 ')).toBe(4.8);
    expect(parseDecimal('97')).toBe(97);
    for (const bad of ['', 'abc', '4,8cm', '-3', '1,2,3']) expect(parseDecimal(bad)).toBeNaN();
  });
});
