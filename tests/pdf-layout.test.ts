import { describe, expect, it } from 'vitest';
import { readPdf } from '../src/pdf/readPdf';
import { detectLayout } from '../src/pdf/layout';
import { assemblePaths, placePages, unusedPages } from '../src/pdf/place';
import { contentPages, edgeMatches, matchPages, seamMatches } from '../src/pdf/match';
import { pdfBytes, clippedLines } from './pdf-writer';

function repeatedSheet(full: boolean, labels = false) {
  const origins = [[0, 0], [180, 0], [0, 280], [180, 280]];
  // Unique bent paths across each seam. The exporter keeps complete paths
  // that touch the tile, even where the PDF clip hides their ends.
  const shapes = [[170, 30], [172, 90], [170, 330], [172, 390], [30, 270], [90, 272], [230, 270], [290, 272]];
  return pdfBytes(origins.map(([x, y], page) => ({ content: `q 1 0 0 -1 0 300 cm
    ${full ? '' : '5 10 m 15 10 l S 10 5 m 10 15 l S 185 10 m 195 10 l S 190 5 m 190 15 l S 5 290 m 15 290 l S 10 285 m 10 295 l S 185 290 m 195 290 l S 190 285 m 190 295 l S'}
    q 1 0 0 1 ${-x} ${-y} cm
    ${shapes.flatMap(([sx, sy], i) => full || (sx + 25 >= x && sx <= x + 200 && sy + 25 >= y && sy <= y + 300)
    ? [`${sx} ${sy} m ${sx + 25} ${sy + 5 + i} l ${sx + 12} ${sy + 25 + i} l S`] : []).join('\n')}
    Q Q ${labels ? `BT /F1 12 Tf 20 20 Td (${page < 2 ? 'A' : 'B'}${page % 2 + 1}) Tj ET` : ''}` })));
}

describe('PDF layout and placement', () => {
  it.each([false, true])('finds 2×2 tiling from identical paths (full sheet=%s)', async full => {
    const doc = await readPdf(repeatedSheet(full)), { layout } = detectLayout(doc);
    expect(layout.step[0]).toBeCloseTo(180, 1);
    expect(layout.step[1]).toBeCloseTo(280, 1);
    expect(layout.blocks).toEqual([{ pages: [1, 4], rows: [2, 2] }]);
    const { placements, seams } = placePages(doc, layout);
    expect(placements.map(p => [p.x, p.y])).toEqual([[0, 0], [180, 0], [0, 280], [180, 280]]);
    expect(seams).toHaveLength(4);
    expect(seams.every(s => s.matched)).toBe(true);
    expect(assemblePaths(doc, placements).length).toBeLessThan(doc.pages.reduce((n, p) => n + p.paths.length, 0));
    expect(placePages(doc, { ...layout, step: [175, 275] }).seams.every(s => !s.matched)).toBe(true);
  });
  it('finds a butt-joined 2×2 tiling using clipped boundary crossings, without marks or labels', async () => {
    const lines = [40, 100, 370, 450].map(y => [0, y, 400, y + 40]);
    lines.push(...[50, 120, 270, 350].map(x => [x, 0, x - 30, 600]));
    const contents = [[0, 0], [200, 0], [0, 300], [200, 300]].map(([x, y]) => {
      const paths = lines.flatMap(([ax, ay, bx, by]) => {
        const dx = bx - ax, dy = by - ay;
        let lo = 0, hi = 1;
        for (const [p, d, min, max] of [[ax, dx, x, x + 200], [ay, dy, y, y + 300]]) {
          if (!d) { if (p < min || p > max) return []; continue; }
          const t = [(min - p) / d, (max - p) / d].sort((a, b) => a - b);
          lo = Math.max(lo, t[0]); hi = Math.min(hi, t[1]);
        }
        return lo < hi ? [`${ax + dx * lo - x} ${ay + dy * lo - y} m ${ax + dx * hi - x} ${ay + dy * hi - y} l S`] : [];
      });
      return { content: `q 1 0 0 -1 0 300 cm ${paths.join('\n')} Q` };
    });
    const doc = await readPdf(pdfBytes(contents)), { layout, source } = detectLayout(doc);
    expect(layout).toEqual({ step: [200, 300], blocks: [{ pages: [1, 4], rows: [2, 2] }] });
    expect(source).toContain('návaznost hran');
    expect(placePages(doc, layout).seams.every(s => s.matched)).toBe(true);
  });
  it('uses common crop frames and tile labels when geometry gives no translations', async () => {
    const doc = await readPdf(pdfBytes(['A1', 'A2', 'B1', 'B2'].map(label => ({ content: `10 10 180 280 re S BT /F1 12 Tf 20 20 Td (${label}) Tj ET` }))));
    const { layout, source } = detectLayout(doc);
    expect(layout).toEqual({ step: [180, 280], blocks: [{ pages: [1, 4], rows: [2, 2] }] });
    expect(source).toContain('popisky');
    expect(placePages(doc, layout).seams.every(s => !s.matched)).toBe(true);
  });
  it('detects the step from repeated corner registration crosses without full frame lines', async () => {
    const marks = [[10, 10], [190, 10], [10, 290], [190, 290]]
      .map(([x, y]) => `${x - 4} ${y} m ${x + 4} ${y} l S ${x} ${y - 4} m ${x} ${y + 4} l S`).join(' ');
    const doc = await readPdf(pdfBytes(['A1', 'A2', 'B1', 'B2'].map(label => ({ content: `${marks} BT /F1 12 Tf 20 20 Td (${label}) Tj ET` }))));
    expect(detectLayout(doc).layout).toEqual({ step: [180, 280], blocks: [{ pages: [1, 4], rows: [2, 2] }] });
  });
  it('does not deduplicate distinct paths with the same sampled fingerprint', async () => {
    const common = '0 0 m 10 10 l 20 20 l 30 30 l 40 40 l 50 50 l 60 60 l 70 70 l';
    const doc = await readPdf(pdfBytes([{ content: `${common} 80 80 l S` }, { content: `${common.replace('40 40', '41 42')} 80 80 l S` }]));
    const placements = [{ page: 1, block: 0, col: 0, row: 0, x: 0, y: 0 }, { page: 2, block: 0, col: 0, row: 0, x: 0, y: 0 }];
    expect(assemblePaths(doc, placements)).toHaveLength(2);
  });
  it('places uneven rows and multiple blocks side by side, and rejects invalid edits', async () => {
    const doc = await readPdf(pdfBytes(Array.from({ length: 10 }, () => ({ content: '0 0 m 10 10 l S' }))));
    const layout = { step: [180, 280] as [number, number], blocks: [{ pages: [1, 7] as [number, number], rows: [2, 3, 2] }, { pages: [8, 10] as [number, number], rows: [1, 2] }] };
    const { placements } = placePages(doc, layout);
    expect(placements.slice(0, 7).map(p => [p.col, p.row])).toEqual([[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]]);
    expect(placements[7].x).toBe(596);
    expect(placements[7].y).toBe(0);
    expect(() => placePages(doc, { ...layout, step: [0, 280] })).toThrow(/Krok/);
    expect(() => placePages(doc, { ...layout, blocks: [{ pages: [1, 4], rows: [2, 1] }] })).toThrow(/Součet/);
    expect(() => placePages(doc, { ...layout, blocks: [layout.blocks[0], layout.blocks[0]] })).toThrow(/opakuje/);
  });
  it('keeps complementary dash phases, including ExtGState and restored styles', async () => {
    const doc = await readPdf(pdfBytes([{ content: '[10 10] 0 d 0 0 m 100 0 l S q /GS gs 0 0 m 100 0 l S Q 0 0 m 100 0 l S' }],
      '/ExtGState << /GS << /D [[10 10] 10] >> >>'));
    const paths = assemblePaths(doc, placePages(doc, detectLayout(doc).layout).placements);
    expect(paths.map(p => p.dashPhase)).toEqual([0, 10]);
  });
  it('deduplicates across neighbouring position buckets and verifies every point', async () => {
    const doc = await readPdf(pdfBytes([{ content: '0.09 0.09 m 10.09 10.09 l S 0.11 0.11 m 10.11 10.11 l S 0.12 0.12 m 10.12 11.12 l S' }]));
    expect(assemblePaths(doc, placePages(doc, detectLayout(doc).layout).placements)).toHaveLength(2);
  });
  it('indexes many identical short segments by absolute position', async () => {
    const count = 20000;
    const doc = await readPdf(pdfBytes([{ content: Array.from({ length: count }, (_, i) => `${i * 2} 0 m ${i * 2 + 1} 0 l S`).join('\n') }]));
    const placements = [{ page: 1, block: 0, row: 0, col: 0, x: 0, y: 0 }];
    const start = performance.now();
    expect(assemblePaths(doc, placements)).toHaveLength(count);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('rejects column-major labels instead of swapping the middle two pages', async () => {
    const doc = await readPdf(pdfBytes(['A1', 'B1', 'A2', 'B2'].map(label => ({ content: `10 10 180 280 re S BT /F1 12 Tf 20 20 Td (${label}) Tj ET` }))));
    expect(detectLayout(doc).layout.blocks).toEqual([1, 2, 3, 4].map(page => ({ pages: [page, page], rows: [1] })));
  });
  it.each(['band', 'frame', 'filled frame', 'clip'] as const)('finds %s seams despite repeated page furniture and omits an unlinked cover', async kind => {
    const lines = [40, 100, 370, 450].map(y => [0, y, 400, y + 40]);
    lines.push(...[50, 120, 270, 350].map(x => [x, 0, x - 30, 600]));
    const origins = [[0, 0], [180, 0], [0, 280], [180, 280]];
    const doc = await readPdf(pdfBytes([{ content: '20 20 30 40 re S' }, ...origins.map(([x, y]) => {
      const margin = kind === 'band' ? 0 : kind === 'filled frame' ? 10.5 : 10;
      const furniture = '0 70 m 200 90 l 200 120 l 0 110 l h S 0 190 m 200 215 l S';
      const frame = kind === 'clip' ? '10 10 180 280 re W n' : kind === 'filled frame' ?
        '9.4 10 1.2 280 re f 189.4 10 1.2 280 re f 10 9.4 180 1.2 re f 10 289.4 180 1.2 re f' : '10 10 180 280 re S';
      return { content: `q 1 0 0 -1 0 300 cm ${frame} ${furniture}
        ${clippedLines(lines, [x + margin, y + margin, x + 200 - margin, y + 300 - margin], [x, y])} Q` };
    })]));
    const detected = detectLayout(doc), placed = placePages(doc, detected.layout);
    expect(detected.layout).toEqual({ step: [180, 280], blocks: [{ pages: [2, 5], rows: [2, 2] }] });
    expect(placed.seams.every(s => s.matched)).toBe(true);
    expect(unusedPages(doc, detected.layout)).toEqual([1]);
    expect(unusedPages(doc, { ...detected.layout, blocks: [{ pages: [1, 1], rows: [1] }, ...detected.layout.blocks] })).toEqual([]);
  });
  it('filters furniture by distinct pages, tolerance and complete subpaths', async () => {
    const doc = await readPdf(pdfBytes(Array.from({ length: 6 }, (_, i) => ({ content: `
      ${i < 3 ? `${i * 0.1} 0 m ${20 + i * 0.1} 10 l S` : ''}
      ${i < 2 ? '40 0 m 60 10 l S' : ''}
      ${i === 0 ? '80 0 m 100 10 l S 80 0 m 100 10 l S 80 0 m 100 10 l S' : ''}
      120 0 m 140 ${10 + i} l S` }))));
    expect(contentPages(doc).pages.map(p => p.paths.length)).toEqual([5, 2, 1, 1, 1, 1]);
    // Furniture would otherwise generate translations to a second repeated rule.
    const repeated = await readPdf(pdfBytes(Array.from({ length: 4 }, () => ({ content: '0 0 m 20 10 l S 0 30 m 20 40 l S 180 0 m 200 10 l S 180 30 m 200 40 l S' }))));
    expect(matchPages(repeated)).toEqual([]);
    expect(seamMatches(repeated, [180, 280])).toEqual([]);
  });
  it('requires two distinct crossings and a majority, not just coincident rules', async () => {
    const doc = await readPdf(pdfBytes([
      { content: '180 50 m 200 50 l S 180 100 m 200 100 l S 180 150 m 200 150 l S 180 200 m 200 200 l S' },
      { content: '0 50 m 20 50 l S 0 100 m 20 100 l S 0 170 m 20 170 l S 0 220 m 20 220 l S' },
      { content: '180 50 m 200 50 l S 180 70 m 200 50 l S' },
      { content: '0 50 m 20 50 l S 0 50 m 20 30 l S' },
    ]));
    expect(edgeMatches(doc.pages[0], doc.pages[1], 0)).toBe(false);
    expect(edgeMatches(doc.pages[2], doc.pages[3], 0)).toBe(false);
  });
  it('recovers interleaved linked components without filling in unlinked pages', async () => {
    const origins = [[0, 0], [180, 0], [0, 280], [180, 280], [360, 280], [540, 280], [0, 560], [180, 560], [360, 560], [540, 560]];
    const links = [[1, 2], [1, 3], [2, 4], [3, 4], [4, 5], [5, 6], [5, 9], [6, 10], [9, 10], [7, 8]];
    const doc = await readPdf(pdfBytes(origins.map(([x, y], i) => ({ content: `q 1 0 0 -1 ${-x} ${300 + y} cm
      ${links.flatMap(([a, b], n) => a === i + 1 || b === i + 1 ? [0, 1].map(j => {
        const sx = 50 + n * 31 + j * 100, sy = 70 + n * 47;
        return `${sx} ${sy} m ${sx + 30 + n} ${sy + 20 + j} l ${sx + 15} ${sy + 40 + n} l S`;
      }) : []).join(' ')} Q` }))));
    expect(detectLayout(doc).layout.blocks).toEqual([{ pages: [1, 10], rows: [2, 4, 4] }]);
    const missing = { pages: doc.pages.map(p => p.index === 7 ? { ...p, paths: [] } : p) };
    expect(detectLayout(missing).layout.blocks).not.toContainEqual({ pages: [1, 10], rows: [2, 4, 4] });
  });

  it('does not join independent rows using split crop-frame corners', async () => {
    const doc = await readPdf(pdfBytes(Array.from({ length: 4 }, (_, i) => {
      const x = (i % 2) * 180, y = i < 2 ? 0 : 40;
      const lines = [[0, 50 + y, 380, 80 + y], [0, 110 + y, 380, 155 + y]];
      return { content: `q 1 0 0 -1 0 300 cm 10 10 m 10 290 l 190 290 l 190 ${70 + i} l S
        ${clippedLines(lines, [x + 10, 10, x + 190, 290], [x, 0])} Q` };
    })));
    const { layout } = detectLayout(doc);
    expect(layout.blocks).toEqual([{ pages: [1, 2], rows: [2] }, { pages: [3, 4], rows: [2] }]);
    expect(seamMatches(doc, layout.step).every(m => m.dy === 0)).toBe(true);
  });
  it('retains coincident geometry with different directional stroke transforms', async () => {
    const doc = await readPdf(pdfBytes([{ content: '8 w 0 0 m 100 0 l S q 2 0 0 0.5 0 0 cm 0 0 m 50 0 l S Q' }]));
    expect(assemblePaths(doc, [{ page: 1, block: 0, col: 0, row: 0, x: 0, y: 0 }])).toHaveLength(2);
  });

});
