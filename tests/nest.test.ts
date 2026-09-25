import { describe, expect, it } from 'vitest';
import { area, bbox, intersectionArea, polygonDistance } from '../src/geom/polygon';
import { nest, nestOnce, seededRandom } from '../src/nest/nest';
import type { Fabric, NestPiece, NestResult, Rotation } from '../src/nest/types';
import { diamond, mixedPieces, options, rectangle, square } from './fixtures';

function assertSafe(result: NestResult, fabric: Fabric, gap: number) {
  const width = fabric.width / (fabric.folded ? 2 : 1);
  for (const placement of result.placements) {
    const b = bbox(placement.polygon);
    expect(b.minX).toBeGreaterThanOrEqual(-1e-6);
    expect(b.minY).toBeGreaterThanOrEqual(-1e-6);
    expect(b.maxX).toBeLessThanOrEqual(width + 1e-6);
    if (fabric.length !== null) expect(b.maxY).toBeLessThanOrEqual(fabric.length + 1e-6);
  }
  for (let i = 0; i < result.placements.length; i++) for (let j = i + 1; j < result.placements.length; j++) {
    const a = result.placements[i].polygon, b = result.placements[j].polygon;
    expect(intersectionArea(a, b)).toBeLessThan(1e-6);
    expect(polygonDistance(a, b)).toBeGreaterThanOrEqual(gap - 1e-6);
  }
}
describe('nesting', () => {
  it('fits four exact 50 × 50 squares into 100 × 100 at resolution 0.5 and gap 0', () => {
    const fabric = { width: 100, length: 100, folded: false };
    const result = nestOnce(['a', 'b', 'c', 'd'].map(k => square(k, 50)), fabric, { ...options, gap: 0 });
    expect(result.placements).toHaveLength(4);
    expect(result.unplaced).toEqual([]);
    expect(result.utilization).toBeCloseTo(1);
    assertSafe(result, fabric, 0);
  });
  it.each([0, 0.5, 1.3])('keeps mixed concave pieces in bounds and at least %s cm apart', gap => {
    const fabric = { width: 150, length: 180, folded: false };
    const pieces = mixedPieces(18);
    const result = nest(pieces, fabric, { ...options, gap, timeMs: 30 });
    expect(result.placements.length).toBeGreaterThan(5);
    assertSafe(result, fabric, gap);
  });
  it('keeps two diamonds at least 1 cm apart at resolution 0.25', () => {
    const fabric = { width: 40, length: null, folded: false };
    const pieces = ['a', 'b'].map(key => ({ ...square(key), polygon: diamond }));
    const result = nestOnce(pieces, fabric, { ...options, gap: 1, resolution: 0.25 });
    expect(result.placements).toHaveLength(2);
    expect(result.unplaced).toEqual([]);
    expect(polygonDistance(result.placements[0].polygon, result.placements[1].polygon)).toBeGreaterThanOrEqual(1);
    assertSafe(result, fabric, 1);
  });
  it('reports every unplaced piece on a sheet that is too small', () => {
    const result = nestOnce([square('fits', 10), square('large', 30), square('extra', 10)], { width: 10, length: 10, folded: false }, options);
    expect(result.placements.map(p => p.key)).toEqual(['fits']);
    expect(result.unplaced.sort()).toEqual(['extra', 'large']);
  });
  it('computes roll length and utilization from the cut shapes, excluding gap', () => {
    const fabric = { width: 10, length: null, folded: false };
    const result = nestOnce([square('a'), square('b')], fabric, { ...options, gap: 0 });
    expect(result.usedLength).toBeCloseTo(20);
    expect(result.utilization).toBeCloseTo(1);
    assertSafe(result, fabric, 0);
    expect(nestOnce([], fabric, options).usedLength).toBe(0);
  });
  it.each(['none', '180', '90'] as Rotation[])('respects rotation mode %s', rotation => {
    const piece = { ...square('a'), polygon: rectangle(20, 10), rotation };
    const result = nestOnce([piece], { width: 10, length: 20, folded: false }, { ...options, gap: 0 });
    if (rotation === '90') expect(result.placements[0].angle).toBe(90);
    else expect(result.unplaced).toEqual(['a']);
    const wide = nestOnce([piece], { width: 25, length: 25, folded: false }, options, [0], [1]);
    const allowed = rotation === 'none' ? [0] : rotation === '180' ? [0, 180] : [0, 90, 180, 270];
    expect(allowed).toContain(wide.placements[0].angle);
  });
  it('keeps fold edges exactly at x = 0 and only permits vertical flips', () => {
    const pieces = mixedPieces(6).map(p => ({ ...p, polygon: p.polygon.length === 4 ? rectangle(12, 19) : p.polygon, foldEdge: true }));
    const fabric = { width: 150, length: null, folded: true };
    const result = nestOnce(pieces, fabric, options, undefined, pieces.map(() => 1));
    expect(result.placements).toHaveLength(6);
    for (const p of result.placements) {
      expect(p.x).toBe(0);
      expect(bbox(p.polygon).minX).toBe(0);
      expect(p.angle).toBe(0);
      expect(p.flipY).toBe(true);
      expect(p.polygon.filter(([x]) => x === 0).length).toBeGreaterThanOrEqual(2);
    }
    expect(result.utilization).toBeCloseTo(result.placements.reduce((sum, p) => sum + area(p.polygon), 0) / (75 * result.usedLength));
    assertSafe(result, fabric, options.gap);
  });
  it('streams a valid first result, supports early stop and deterministic initial passes', () => {
    const pieces = mixedPieces(6), fabric = { width: 150, length: null, folded: false };
    const progress: NestResult[] = [];
    const result = nest(pieces, fabric, { ...options, timeMs: 5000 }, r => progress.push(r), () => true);
    expect(result.iterations).toBe(1);
    expect(progress).toHaveLength(1);
    expect(result).toEqual(nestOnce(pieces, fabric, options));
    assertSafe(result, fabric, options.gap);
  });
  it('never leaves a piece narrower than the roll unplaced, even with sharp miters and a large gap', () => {
    const random = seededRandom(7);
    for (let run = 0; run < 90; run++) {
      const resolution = [0.25, 0.5, 1][run % 3], gap = Math.round(random() * 20) / 10, width = 20 + Math.round(random() * 130);
      const pieces: NestPiece[] = Array.from({ length: 2 + Math.floor(random() * 6) }, (_, i) => {
        const w = 1 + random() * (width - 1), h = 1 + random() * 40, skew = random() * w * 0.5;
        return { key: `p${i}`, label: `p${i}`, polygon: [[skew, 0], [w, 0], [w - skew * 0.3, h], [0, h * 0.8]], rotation: 'none' };
      });
      const fabric = { width, length: null, folded: false };
      const result = nestOnce(pieces, fabric, { gap, resolution, timeMs: 0, seed: 1 });
      expect(result.unplaced, JSON.stringify({ run, resolution, gap, width })).toEqual([]);
      assertSafe(result, fabric, gap);
    }
  });
  it('keeps ordinary pieces on folded fabric at least gap / 2 from the fold', () => {
    const gap = 1, fabric = { width: 150, length: null, folded: true };
    const ordinary = mixedPieces(8), fold = { ...square('fold'), polygon: rectangle(12, 19), foldEdge: true };
    const result = nestOnce([fold, ...ordinary], fabric, { ...options, gap });
    expect(result.unplaced).toEqual([]);
    for (const p of result.placements) {
      if (p.key === 'fold') expect(bbox(p.polygon).minX).toBe(0);
      else expect(bbox(p.polygon).minX).toBeGreaterThanOrEqual(gap / 2 - 1e-6);
    }
    assertSafe(result, fabric, gap);
  });
  it('rejects invalid numeric settings and duplicate keys', () => {
    const fabric = { width: 150, length: null, folded: false };
    expect(() => nestOnce([square('a')], fabric, { ...options, resolution: 0 })).toThrow();
    expect(() => nestOnce([square('a'), square('a')], fabric, options)).toThrow();
    expect(() => nestOnce([square('a')], { ...fabric, width: NaN }, options)).toThrow();
  });
  it('runs a greedy pass for 30 mixed 5–60 cm pieces on a 150 cm roll in under 1500 ms', () => {
    const pieces = mixedPieces(30), fabric = { width: 150, length: null, folded: false };
    const start = performance.now();
    const result = nestOnce(pieces, fabric, options);
    const elapsed = performance.now() - start;
    console.info(`Greedy performance: ${elapsed.toFixed(1)} ms / 1500 ms, ${result.placements.length} pieces`);
    expect(result.placements).toHaveLength(30);
    expect(elapsed).toBeLessThan(1500);
    assertSafe(result, fabric, options.gap);
  });
});
