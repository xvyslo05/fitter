import { bbox, mirrorY, normalize, offset, rotate } from '../geom/polygon';
import type { Pt } from '../model/pattern';
import type { NestPiece, Placement } from './types';

export type Span = [number, number]; // Half-open grid columns.
export interface RasterRow { y: number; spans: Span[] }
export interface Raster {
  polygon: Pt[];
  width: number;
  height: number;
  angle: Placement['angle'];
  flipY: boolean;
  rows: RasterRow[];
}
export function mergeSpans(spans: Span[]): Span[] {
  spans.sort((a, b) => a[0] - b[0]);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return merged;
}

export function rasterize(polygon: Pt[], gap: number, resolution: number): RasterRow[] {
  const p = (gap ? offset(polygon, gap / 2 + 0.000002) : polygon)
    .map(([x, y]): Pt => [x / resolution, y / resolution]);
  const b = bbox(p), rows: RasterRow[] = [];
  for (let y = Math.floor(b.minY + 1e-9); y < Math.ceil(b.maxY - 1e-9); y++) {
    const intervals: Span[] = [], crossings: number[] = [];
    const mid = y + 0.5;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      const low = Math.min(a[1], c[1]), high = Math.max(a[1], c[1]);
      if (low <= mid && high > mid) crossings.push(a[0] + (mid - a[1]) * (c[0] - a[0]) / (c[1] - a[1]));
      // Sweep every boundary segment through the strip, not just its midpoint.
      // Together with midpoint interiors this covers every intersected cell.
      if (high <= y + 1e-9 || low >= y + 1 - 1e-9) continue;
      if (Math.abs(c[1] - a[1]) < 1e-12) intervals.push([Math.min(a[0], c[0]), Math.max(a[0], c[0])]);
      else {
        const x1 = a[0] + (Math.max(y, low) - a[1]) * (c[0] - a[0]) / (c[1] - a[1]);
        const x2 = a[0] + (Math.min(y + 1, high) - a[1]) * (c[0] - a[0]) / (c[1] - a[1]);
        intervals.push([Math.min(x1, x2), Math.max(x1, x2)]);
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) intervals.push([crossings[i], crossings[i + 1]]);
    const spans = mergeSpans(intervals.map(([lo, hi]): Span => [Math.floor(lo + 1e-9), Math.ceil(hi - 1e-9)])
      .filter(([lo, hi]) => hi > lo));
    if (spans.length) rows.push({ y, spans });
  }
  return rows;
}
export function orientations(piece: NestPiece, gap: number, resolution: number): Raster[] {
  const angles: Placement['angle'][] = piece.foldEdge || piece.rotation === 'none' ? [0] : piece.rotation === '180' ? [0, 180] : [0, 90, 180, 270];
  const transforms = piece.foldEdge && piece.rotation !== 'none'
    ? [{ angle: 0 as const, flipY: false }, { angle: 0 as const, flipY: true }]
    : angles.map(angle => ({ angle, flipY: false }));
  return transforms.map(({ angle, flipY }) => {
    const polygon = normalize(flipY ? mirrorY(piece.polygon) : rotate(piece.polygon, angle));
    const b = bbox(polygon);
    return { polygon, width: b.width, height: b.height, angle, flipY, rows: rasterize(polygon, gap, resolution) };
  });
}
