import { describe, expect, it } from 'vitest';
import { area, bbox, translate } from '../src/geom/polygon';
import { tryMove } from '../src/nest/adjust';
import type { Fabric, NestPiece, NestResult, Placement } from '../src/nest/types';
import type { Pt } from '../src/model/pattern';

const square = (size: number): Pt[] => [[0, 0], [size, 0], [size, size], [0, size]];
const piece = (key: string, polygon = square(10), foldEdge = false): NestPiece => ({ key, label: key, polygon, rotation: 'none', foldEdge });
const place = (key: string, polygon: Pt[], x: number, y: number): Placement => ({ key, x, y, angle: 0, flipY: false, tilt: 0, polygon: translate(polygon, x, y) });
const result = (placements: Placement[]): NestResult => ({ placements, unplaced: [], usedLength: 0, utilization: 0, iterations: 5 });
const fabric: Fabric = { width: 100, length: null, folded: false };

describe('tryMove', () => {
  const pieces = [piece('a'), piece('b')];
  const base = result([place('a', square(10), 0, 0), place('b', square(10), 20, 0)]);

  it('moves a piece while the gap holds, and refuses when it is too close', () => {
    const near = tryMove(base, pieces, fabric, 0.5, 'b', -9, 0);
    expect(near.ok).toBe(true);
    expect(near.result.placements[1].x).toBeCloseTo(11, 9);
    expect(bbox(near.result.placements[1].polygon).minX).toBeCloseTo(11, 9);
    const closer = tryMove(base, pieces, fabric, 0.5, 'b', -9.6, 0);
    expect(closer.ok).toBe(false);
    expect(closer.blockedBy).toEqual(['a']);
    expect(closer.result).toBe(base);
  });
  it('snaps to 1 mm and leaves other placement fields alone', () => {
    const tilted = result([place('a', square(10), 0, 0), { ...place('b', square(10), 20, 0), angle: 90, flipY: true, tilt: 2 }]);
    const moved = tryMove(tilted, pieces, fabric, 0.5, 'b', 0.04, 3.456);
    expect(moved.ok).toBe(true);
    expect(moved.result.placements[1].x).toBeCloseTo(20, 9);
    expect(moved.result.placements[1].y).toBeCloseTo(3.5, 9);
    expect(moved.result.placements[1]).toMatchObject({ angle: 90, flipY: true, tilt: 2 });
    expect(base.placements[1].y).toBe(0);
  });
  it('keeps the piece on the fabric', () => {
    expect(tryMove(base, pieces, fabric, 0.5, 'b', 71, 0).ok).toBe(false);
    expect(tryMove(base, pieces, fabric, 0.5, 'b', 70, 0).ok).toBe(true);
    expect(tryMove(base, pieces, fabric, 0.5, 'b', 0, -1).ok).toBe(false);
    expect(tryMove(base, pieces, { ...fabric, length: 25 }, 0.5, 'b', 0, 15.1).ok).toBe(false);
    expect(tryMove(base, pieces, { ...fabric, length: 25 }, 0.5, 'b', 0, 15).ok).toBe(true);
  });
  it('moves a fold-edge piece along the fold only', () => {
    const folded: Fabric = { width: 100, length: null, folded: true };
    const set = [piece('f', square(10), true), piece('o')], r = result([place('f', square(10), 0, 0), place('o', square(10), 20, 0)]);
    expect(tryMove(r, set, folded, 0.5, 'f', 1, 0).ok).toBe(false);
    expect(tryMove(r, set, folded, 0.5, 'f', 1, 0).reason).toBe('fold');
    const down = tryMove(r, set, folded, 0.5, 'f', 0, 12);
    expect(down.ok).toBe(true);
    expect(bbox(down.result.placements[0].polygon)).toMatchObject({ minX: 0, minY: 12 });
  });
  it('keeps ordinary pieces gap / 2 from the fold', () => {
    const folded: Fabric = { width: 100, length: null, folded: true };
    const set = [piece('o')], r = result([place('o', square(10), 5, 0)]);
    expect(tryMove(r, set, folded, 0.5, 'o', -4.8, 0).ok).toBe(false);
    expect(tryMove(r, set, folded, 0.5, 'o', -4.7, 0).ok).toBe(true);
    expect(tryMove(r, set, folded, 0.5, 'o', 35, 0).ok).toBe(true);
    expect(tryMove(r, set, folded, 0.5, 'o', 36, 0).ok).toBe(false);
  });
  it('recomputes used length and utilisation', () => {
    const r = result([place('a', square(10), 0, 0), place('b', square(10), 20, 30)]);
    const before = tryMove(r, pieces, fabric, 0.5, 'a', 0, 0);
    expect(before.result.usedLength).toBe(40);
    const up = tryMove(r, pieces, fabric, 0.5, 'b', 0, -25);
    expect(up.ok).toBe(true);
    expect(up.result.usedLength).toBeLessThan(40);
    expect(up.result.usedLength).toBeCloseTo(15, 9);
    expect(Math.abs(up.result.utilization - (2 * area(square(10))) / (100 * up.result.usedLength))).toBeLessThan(1e-9);
    const fixed = tryMove(r, pieces, { ...fabric, length: 50 }, 0.5, 'b', 0, -25);
    expect(Math.abs(fixed.result.utilization - 200 / (100 * 50))).toBeLessThan(1e-9);
    expect(up.result.iterations).toBe(5);
  });
  it('rejects an unknown key', () => {
    expect(tryMove(base, pieces, fabric, 0.5, 'zzz', 1, 0).ok).toBe(false);
  });
  it('validates one move among 20 pieces of 470 points in under 30 ms', () => {
    const round = (n: number, r: number, cx: number, cy: number): Pt[] => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)]);
    const set = Array.from({ length: 20 }, (_, i) => piece(`p${i}`, round(470, 4.5, 5, 5)));
    const r = result(set.map((p, i) => place(p.key, p.polygon, (i % 5) * 10, Math.floor(i / 5) * 10)));
    tryMove(r, set, fabric, 0.5, 'p6', 0.2, 0.2);
    const started = performance.now(), moved = tryMove(r, set, fabric, 0.5, 'p6', 0.4, 0.4);
    expect(performance.now() - started).toBeLessThan(30);
    expect(moved.ok).toBe(true);
  });
});
