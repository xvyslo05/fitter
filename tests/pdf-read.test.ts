import { describe, expect, it } from 'vitest';
import { readPdf } from '../src/pdf/readPdf';
import { tracePreviewPath, closePdfImport } from '../src/ui/PdfImport';
import { strokeMetrics } from '../src/pdf/stroke';
import { pdfBytes, pdfStream } from './pdf-writer';

describe('readPdf', () => {
  it('applies nested CTMs, save/restore, rectangles, colors, widths and dashes', async () => {
    const doc = await readPdf(pdfBytes([{ content: `2 w [3 4] 1 d 1 0 0 RG 0.5 g
      q 2 0 0 2 10 20 cm 1 2 3 4 re B
      q 0 1 -1 0 10 0 cm 0 0 m 10 5 l S Q
      0 0 m 5 5 l S Q 0 0 m 10 10 l S
      0 1 0 0 k 20 30 4 5 re f 0.25 G 0 0 m 1 1 l S` }]));
    const p = doc.pages[0];
    expect([p.index, p.width, p.height]).toEqual([1, 200, 300]);
    expect(p.paths).toHaveLength(6);
    expect(p.paths[0].subpaths[0]).toEqual([[12, 276], [18, 276], [18, 268], [12, 268], [12, 276]]);
    expect(p.paths[0].closed).toEqual([true]);
    expect(p.paths[0].stroke).toEqual([1, 0, 0]);
    expect(p.paths[0].fill?.[0]).toBeCloseTo(0.5, 2);
    expect(p.paths[0].lineWidth).toBe(2);
    expect(strokeMetrics(p.paths[0], p.paths[0].subpaths[0][0], p.paths[0].subpaths[0][1]).lineWidth).toBe(4);
    expect(p.paths[0].dash).toEqual([3, 4]);
    expect(p.paths[0].dashPhase).toBe(1);
    expect(p.paths[1].subpaths[0]).toEqual([[30, 280], [20, 260]]);
    expect(p.paths[2].subpaths[0]).toEqual([[10, 280], [20, 270]]);
    expect(p.paths[3].subpaths[0]).toEqual([[0, 300], [10, 290]]);
    expect(p.paths[3].lineWidth).toBe(2);
    expect(p.paths[3].dash).toEqual([3, 4]);
    expect(p.paths[4].stroke).toBeNull();
    expect(p.paths[4].fill?.[0]).toBeGreaterThan(0.8);
    expect(p.paths[4].fill?.[1]).toBeLessThan(0.3);
    expect(p.paths[5].stroke?.[0]).toBeCloseTo(0.25, 2);
  });
  it('flattens c/v/y curves and preserves filled polygons and text baselines', async () => {
    const { pages: [p] } = await readPdf(pdfBytes([{ content: `0 0 m 0 12 12 12 12 0 c 24 12 24 0 v 30 12 36 0 y h f
      BT /F1 12 Tf 1 0 0 1 25 50 Tm (A1) Tj ET` }]));
    const points = p.paths[0].subpaths[0];
    expect(points).toHaveLength(38);
    expect(points[6]).toEqual([6, 291]);
    expect(points[12]).toEqual([12, 300]);
    expect(points[24]).toEqual([24, 300]);
    expect(points[36]).toEqual([36, 300]);
    expect(p.paths[0].stroke).toBeNull();
    expect(p.paths[0].fill).toEqual([0, 0, 0]);
    expect(p.texts[0]).toMatchObject({ str: 'A1', x: 25, y: 250, height: 12 });
  });
  it('restores graphics styles and applies skewed CTMs to curves and ExtGState', async () => {
    const { pages: [p] } = await readPdf(pdfBytes([{ content: `0 0 1 RG 0 1 0 rg 2 w [2 5] 0 d
      q /GS gs 1 0 0 rg 0 1 0 RG 2 1 0.5 2 10 20 cm
      0 0 m 0 12 12 12 12 0 c B Q 0 0 2 2 re B` }], '/ExtGState << /GS << /LW 4 /D [[3 7] 2] >> >>'));
    const transformed = p.paths[0], restored = p.paths[1];
    expect(transformed.subpaths[0][6]).toEqual([26.5, 256]);
    expect(transformed.lineWidth).toBe(4);
    expect(transformed.ctm).toEqual([2, -1, 0.5, -2]);
    expect(transformed.dash).toEqual([3, 7]);
    expect(transformed.dashPhase).toBe(2);
    expect(restored.dashPhase).toBe(0);
    expect(transformed.stroke).toEqual([0, 1, 0]);
    expect(transformed.fill).toEqual([1, 0, 0]);
    expect(restored.stroke).toEqual([0, 0, 1]);
    expect(restored.fill).toEqual([0, 1, 0]);
    expect(restored.lineWidth).toBe(2);
    expect(restored.dash).toEqual([2, 5]);
  });
  it('measures anisotropic widths and dashes along horizontal, vertical and skewed strokes', async () => {
    const { pages: [p] } = await readPdf(pdfBytes([{ content: `8 w [10 10] 3 d
      q 2 0 0 0.5 0 0 cm 0 0 m 50 0 l S 0 0 m 0 50 l S Q
      q 2 1 0.5 2 0 0 cm 0 0 m 50 0 l S Q` }]));
    const metrics = p.paths.map(path => strokeMetrics(path, path.subpaths[0][0], path.subpaths[0][1]));
    expect(metrics[0]).toEqual({ lineWidth: 4, dash: [20, 20], dashPhase: 6 });
    expect(metrics[1]).toEqual({ lineWidth: 16, dash: [5, 5], dashPhase: 1.5 });
    expect(metrics[2].lineWidth).toBeCloseTo(8 * 3.5 / Math.sqrt(5));
    expect(metrics[2].dash[0]).toBeCloseTo(10 * Math.sqrt(5));
  });
  it('applies a transparency-group form matrix once and restores its state', async () => {
    const doc = await readPdf(pdfBytes([{ content: '3 w /X Do 0 0 m 10 0 l S' }], '/XObject << /X 6 0 R >>', [
      pdfStream('0 0 m 10 0 l S', '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Matrix [2 0 0 2 10 20] /Group << /S /Transparency >>'),
    ]));
    const [grouped, plain] = doc.pages[0].paths;
    expect(grouped.subpaths[0]).toEqual([[10, 280], [30, 280]]);
    expect(strokeMetrics(grouped, grouped.subpaths[0][0], grouped.subpaths[0][1]).lineWidth).toBe(6);
    expect(plain.subpaths[0]).toEqual([[0, 300], [10, 300]]);
    expect(plain.ctm).toEqual([1, 0, 0, -1]);
  });
  it('excludes nested soft-mask definition geometry and balances graphics state', async () => {
    const doc = await readPdf(pdfBytes([{ content: `2 w [3 4] 1 d q /GS gs 10 10 m 20 10 l S Q 30 30 m 40 30 l S` }],
      '/ExtGState << /GS << /SMask << /S /Luminosity /G 6 0 R >> >> >>', [
        pdfStream('q 7 w /Inner gs /X Do Q 0 0 80 80 re W n 0 0 80 80 re f', '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Matrix [2 0 0 2 10 20] /Group << /S /Transparency /CS /DeviceGray >> /Resources << /ExtGState << /Inner << /SMask << /S /Luminosity /G 7 0 R >> >> >> /XObject << /X 8 0 R >> >>'),
        pdfStream('0 0 40 40 re f', '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceGray >>'),
        pdfStream('0 0 m 50 50 l S', '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency >>'),
      ]));
    expect(doc.pages[0].paths).toHaveLength(2);
    expect(doc.pages[0].clips).toEqual([]);
    expect(doc.pages[0].paths.map(p => p.subpaths[0])).toEqual([[[10, 290], [20, 290]], [[30, 270], [40, 270]]]);
    for (const path of doc.pages[0].paths) {
      expect(path.ctm).toEqual([1, 0, 0, -1]);
      expect(path.lineWidth).toBe(2);
      expect(path.dashPhase).toBe(1);
    }
  });
  it('retains painted vectors outside a clipping rectangle', async () => {
    const { pages: [p] } = await readPdf(pdfBytes([{ content: '10 10 30 30 re W n -100 -200 m 500 600 l S' }]));
    expect(p.paths).toHaveLength(1);
    expect(p.paths[0].subpaths[0]).toEqual([[-100, 500], [500, -300]]);
  });
  it('applies form matrices, page rotation, crop origin and UserUnit', async () => {
    const form = '0 0 m 10 20 l S';
    const { pages: [p] } = await readPdf(pdfBytes([{ dictionary: '/CropBox [10 20 190 280] /Rotate 90 /UserUnit 2', content: 'q 1 0 0 1 5 7 cm /X Do Q 10 20 m 20 20 l S' }],
      '/XObject << /X 6 0 R >>', [`<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Matrix [2 0 0 2 10 20] /Length ${form.length} >>\nstream\n${form}\nendstream`]));
    expect([p.width, p.height]).toEqual([520, 360]);
    expect(p.paths[0].subpaths[0]).toEqual([[14, 10], [94, 50]]);
    expect(p.paths[1].subpaths[0]).toEqual([[0, 0], [0, 20]]);
  });
  it('closes fill-only subpaths when tracing the preview outline', async () => {
    const { pages: [page] } = await readPdf(pdfBytes([{ content: '0 0 m 100 0 l 100 100 l f 0 0 m 100 0 l 100 100 l S' }]));
    const calls: string[] = [];
    const ctx = { moveTo: () => calls.push('move'), lineTo: () => calls.push('line'), closePath: () => calls.push('close') };
    expect(page.paths[0].closed).toEqual([false]);
    tracePreviewPath(ctx, page.paths[0]);
    expect(calls).toEqual(['move', 'line', 'line', 'close']);
    calls.length = 0;
    tracePreviewPath(ctx, page.paths[1]);
    expect(calls).toEqual(['move', 'line', 'line']);
  });
  it('closes the modal before restoring focus during cleanup', () => {
    let open = true;
    const calls: string[] = [];
    closePdfImport({ close: () => { open = false; calls.push('close'); } }, { focus: () => { expect(open).toBe(false); calls.push('focus'); } });
    expect(calls).toEqual(['close', 'focus']);
  });
});
