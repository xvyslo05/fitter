import { describe, expect, it } from 'vitest';
import { readPdf } from '../src/pdf/readPdf';
import { CM_PER_PT, detectScale, overrideScale, withoutScaleMarks } from '../src/pdf/scale';
import { pdfBytes } from './pdf-writer';

describe('PDF scale', () => {
  it('finds a centre-line square next to 5x5 cm on an instruction page', async () => {
    const doc = await readPdf(pdfBytes([{ content: '20 20 100 100 re S' }, {
      content: '4 w 20 40 140 140 re S BT /F1 12 Tf 20 25 Td (5x5 cm) Tj ET',
    }]));
    const result = detectScale(doc);
    expect(result).toEqual({ source: 'square', page: 2, measuredPt: 140, squareCm: 5, cmPerPt: 5 / 140 });
    expect(overrideScale(result, 10).cmPerPt).toBe(10 / 140);
    expect(() => overrideScale(result, 0)).toThrow();
    expect(() => overrideScale(result, NaN)).toThrow();
  });
  it('falls back to 100% without a square and ignores open and non-square shapes', async () => {
    const doc = await readPdf(pdfBytes([{ content: '20 20 100 80 re S 0 0 m 140 0 l 140 140 l 0 140 l S' }]));
    expect(detectScale(doc)).toEqual({ source: 'default', cmPerPt: CM_PER_PT });
    expect(() => overrideScale(detectScale(doc), 5)).toThrow();
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
});
