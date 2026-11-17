import { describe, expect, it } from 'vitest';
import { buildHitIndex, isTap, segmentsOf, TAP_TOLERANCE_PX } from '../src/pdf/hit';
import type { PdfPath } from '../src/pdf/types';

const path = (subpaths: [number, number][][], over: Partial<PdfPath> = {}): PdfPath =>
  ({ subpaths, closed: subpaths.map(() => false), stroke: [0, 0, 0], fill: null, lineWidth: 1, dash: [], dashPhase: 0, ctm: [1, 0, 0, 1], ...over });

describe('hit-test', () => {
  const index = buildHitIndex([{ x1: 0, y1: 0, x2: 100, y2: 100, owner: 7 }, { x1: 0, y1: 300, x2: 100, y2: 300, owner: 8 }]);

  it('finds a diagonal segment within the tolerance, at any zoom', () => {
    for (const scale of [0.5, 1, 4]) {
      const tol = TAP_TOLERANCE_PX / scale, off = 11 / scale / Math.SQRT2;
      expect(index.hit(50 + off, 50 - off, tol)?.owner, `scale ${scale}`).toBe(7);
    }
  });
  it('finds nothing 13 px away', () => {
    for (const scale of [0.5, 1, 4]) {
      const off = 13 / scale / Math.SQRT2;
      expect(index.hit(50 + off, 50 - off, TAP_TOLERANCE_PX / scale), `scale ${scale}`).toBeNull();
    }
  });
  it('returns the nearest of several segments', () => {
    const two = buildHitIndex([{ x1: 0, y1: 0, x2: 100, y2: 0, owner: 1 }, { x1: 0, y1: 8, x2: 100, y2: 8, owner: 2 }]);
    expect(two.hit(50, 6, 12)?.owner).toBe(2);
    expect(two.hit(50, 2, 12)?.owner).toBe(1);
  });
  it('finds a long segment far from its end points and far from the origin', () => {
    const far = buildHitIndex([{ x1: -5000, y1: 4000, x2: 5000, y2: 4000, owner: 3 }]);
    expect(far.hit(1234, 4005, 12)?.owner).toBe(3);
    expect(far.hit(1234, 4030, 12)).toBeNull();
  });
  it('answers 10 000 segments in under 5 ms after indexing', () => {
    let seed = 1;
    const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const segments = Array.from({ length: 10_000 }, (_, i) => {
      const x = random() * 2000, y = random() * 2000;
      return { x1: x, y1: y, x2: x + random() * 60 - 30, y2: y + random() * 60 - 30, owner: i % 12 };
    });
    const big = buildHitIndex(segments);
    expect(big.size).toBe(10_000);
    big.hit(1000, 1000, 12);
    const times: number[] = [];
    for (let run = 0; run < 7; run++) {
      const start = performance.now();
      for (let q = 0; q < 10; q++) big.hit(100 + q * 150, 200 + q * 120, 12);
      times.push((performance.now() - start) / 10);
    }
    expect(Math.min(...times)).toBeLessThan(5);
  });
  it('agrees with a brute-force search', () => {
    let seed = 7;
    const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const segments = Array.from({ length: 400 }, (_, i) => { const x = random() * 300, y = random() * 300; return { x1: x, y1: y, x2: x + random() * 150 - 75, y2: y + random() * 150 - 75, owner: i }; });
    const fast = buildHitIndex(segments);
    for (let q = 0; q < 200; q++) {
      const x = random() * 300, y = random() * 300, tol = 3 + random() * 30;
      let best = Infinity;
      for (const s of segments) {
        const dx = s.x2 - s.x1, dy = s.y2 - s.y1, t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(x - s.x1 - t * dx, y - s.y1 - t * dy));
      }
      const hit = fast.hit(x, y, tol);
      if (best <= tol) expect(hit?.distance).toBeCloseTo(best, 9); else expect(hit).toBeNull();
    }
  });
});

describe('segmentsOf', () => {
  it('closes filled and closed subpaths and leaves open strokes open', () => {
    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(segmentsOf([path([square])], () => 0)).toHaveLength(3);
    expect(segmentsOf([path([square], { closed: [true] })], () => 0)).toHaveLength(4);
    expect(segmentsOf([path([square], { stroke: null, fill: [0, 0, 0] })], () => 0)).toHaveLength(4);
  });
  it('skips paths without an owner and paths that draw nothing', () => {
    const line: [number, number][] = [[0, 0], [5, 5]];
    expect(segmentsOf([path([line]), path([line], { stroke: null })], p => p.stroke ? 2 : undefined).map(s => s.owner)).toEqual([2]);
  });
});

describe('tap or pan', () => {
  it('is a tap up to 6 px of movement', () => {
    expect(isTap(0, 0)).toBe(true);
    expect(isTap(3, 5)).toBe(true);
    expect(isTap(6, 0)).toBe(true);
    expect(isTap(5, 5)).toBe(false);
    expect(isTap(0, -7)).toBe(false);
  });
});
