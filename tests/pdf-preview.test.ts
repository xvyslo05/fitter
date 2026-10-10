import { describe, expect, it } from 'vitest';
import { clampView, fitView, scaleLimits, zoomView } from '../src/ui/PdfImport';

const sheet = { width: 200, height: 100 }, box = { width: 400, height: 400 };

describe('pdf preview view math', () => {
  it('fits and centres the sheet', () => {
    expect(fitView(sheet, box)).toEqual({ scale: 2, x: 0, y: 100 });
    expect(scaleLimits(sheet, box)).toEqual([2, 12]);
  });
  it('keeps the point under the anchor fixed when zooming', () => {
    const view = { scale: 4, x: -100, y: -50 }, at = [150, 120] as [number, number];
    const next = zoomView(view, 1.5, at, sheet, box);
    expect(next.scale).toBeCloseTo(6);
    const point = (v: typeof view) => [(at[0] - v.x) / v.scale, (at[1] - v.y) / v.scale];
    expect(point(next)[0]).toBeCloseTo(point(view)[0]);
    expect(point(next)[1]).toBeCloseTo(point(view)[1]);
  });
  it('never leaves the zoom range', () => {
    const fit = fitView(sheet, box);
    expect(zoomView(fit, 0.1, [10, 10], sheet, box).scale).toBe(2);
    expect(zoomView(fit, 100, [10, 10], sheet, box).scale).toBe(12);
    const wide = { width: 1000, height: 1000 }, small = { width: 100, height: 100 }, [min, max] = scaleLimits(wide, small);
    expect(max).toBe(12);
    expect(min).toBeCloseTo(0.1);
    expect(scaleLimits(sheet, box)[1]).toBe(Math.max(2 * 4, 12));
  });
  it('centres a small axis and removes gaps on a large one', () => {
    const v = clampView({ scale: 3, x: 50, y: 500 }, sheet, box);
    expect(v.x).toBe(0);            // 600 wide sheet in 400 box: no gap on the left
    expect(v.y).toBe(50);           // 300 tall sheet in 400 box: centred
    expect(clampView({ scale: 3, x: -500, y: 0 }, sheet, box).x).toBe(-200);
    expect(clampView({ scale: 2, x: 7, y: 7 }, sheet, box)).toEqual({ scale: 2, x: 0, y: 100 });
  });
});
