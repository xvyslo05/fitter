import { describe, expect, it } from 'vitest';
import { alignFoldOutline, area, bbox, clipAtFold, offset, orientFold, rotate, unfold } from '../src/geom/polygon';
import type { Pt } from '../src/model/pattern';
import { diamond, rectangle } from './fixtures';

describe('cut geometry', () => {
  it('mirrors and unions a half across vertical and slanted fold lines to twice its area', () => {
    const half: Pt[] = [[0, 0], [8, 0], [12, 7], [6, 15], [0, 15]];
    for (const angle of [0, 32, 90]) {
      const p = rotate(half, angle), edge = rotate([[0, 0], [0, 15]], angle) as [Pt, Pt];
      expect(area(unfold(p, edge))).toBeCloseTo(area(half) * 2, 4);
    }
  });
  it('offsets a 10 × 10 square by 1 cm to 12 × 12', () => {
    const grown = offset(rectangle(10, 10), 1);
    expect(bbox(grown).width).toBeCloseTo(12, 5);
    expect(bbox(grown).height).toBeCloseTo(12, 5);
    expect(area(grown)).toBeCloseTo(144, 5);
  });
  it('offsets diamond right angles by 1 cm with miters within limit 2', () => {
    const grown = offset(diamond, 1), bounds = bbox(grown);
    expect(grown).toHaveLength(4);
    expect(bounds.width).toBeCloseTo(20 + 2 * Math.SQRT2, 5);
    expect(bounds.height).toBeCloseTo(20 + 2 * Math.SQRT2, 5);
    expect(bounds.minX).toBeCloseTo(-Math.SQRT2, 5);
    expect(bounds.minY).toBeCloseTo(-Math.SQRT2, 5);
  });
  it('aligns a right-side and nearly vertical fold, clipping allowance at x = 0', () => {
    const polygon = rotate(rectangle(10, 20), 0.8);
    const edge = rotate([[10, 0], [10, 20]], 0.8) as [Pt, Pt];
    const aligned = orientFold(polygon, edge);
    expect(bbox(aligned).minX).toBeCloseTo(0, 6);
    const grown = clipAtFold(offset(aligned, 1));
    expect(bbox(grown).minX).toBe(0);
    expect(bbox(grown).width).toBeCloseTo(11, 5);
  });
  it('snaps a noisy fold edge without changing a valid outline and refuses disconnected unfolds', () => {
    const polygon: Pt[] = [[0.08, 0], [10, 0], [10, 20], [0.05, 20], [-0.1, 10], [-0.08, 10.1], [-0.04, 9.9]];
    const fold: [Pt, Pt] = [[0, 0], [0, 20]];
    const aligned = alignFoldOutline(polygon, fold);
    expect(aligned.adjusted).toBe(true);
    expect(area(unfold(aligned.polygon, fold))).toBeCloseTo(400);
    expect(bbox(orientFold(aligned.polygon, fold)).minX).toBe(0);
    expect(alignFoldOutline(rectangle(10, 20), fold).adjusted).toBe(false);
    expect(() => unfold(rectangle(10, 20), [[-10, 0], [-10, 20]])).toThrow(/oddělené/);
  });
});
