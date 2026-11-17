import type { PdfPath } from './types';

// Hit-testing of taps against the line segments of the sheet (step 2 of the import).
// A segment belongs to an owner (the caller's number, e.g. the index of a line style).
export interface Segment { x1: number; y1: number; x2: number; y2: number; owner: number }
export interface Hit { owner: number; distance: number }

// A tap closer than this many screen px to a line counts as a hit; a pointer that moves more than TAP_MAX_MOVE_PX is a pan.
export const TAP_TOLERANCE_PX = 12, TAP_MAX_MOVE_PX = 6;
export const isTap = (dx: number, dy: number): boolean => Math.hypot(dx, dy) <= TAP_MAX_MOVE_PX;

// Segments of the strokes and fills of `paths`; filled and closed subpaths include the closing segment.
// `owner` gives the owner of a path, or undefined to leave the path out.
export function segmentsOf(paths: readonly PdfPath[], owner: (path: PdfPath) => number | undefined): Segment[] {
  const segments: Segment[] = [];
  for (const path of paths) {
    const id = owner(path);
    if (id === undefined || !(path.stroke || path.fill)) continue;
    path.subpaths.forEach((points, i) => {
      const close = (path.closed[i] || (!path.stroke && path.fill)) && points.length > 2;
      for (let n = 1; n < points.length + (close ? 1 : 0); n++) {
        const a = points[n - 1], b = points[n % points.length];
        segments.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], owner: id });
      }
    });
  }
  return segments;
}

// Cells are CELL pt wide; a segment is listed in every cell its sampled points fall into.
const CELL = 20;
export interface HitIndex { readonly size: number; hit(x: number, y: number, tolerance: number): Hit | null }
export function buildHitIndex(segments: readonly Segment[]): HitIndex {
  const n = segments.length, xs = new Float64Array(n * 4), owners = new Int32Array(n), cells = new Map<number, number[]>();
  // Cell keys stay unique for coordinates within ±2^20 cells.
  const key = (cx: number, cy: number) => (cx + 1_048_576) * 2_097_152 + (cy + 1_048_576);
  segments.forEach((s, i) => {
    xs[i * 4] = s.x1; xs[i * 4 + 1] = s.y1; xs[i * 4 + 2] = s.x2; xs[i * 4 + 3] = s.y2; owners[i] = s.owner;
    const steps = Math.max(1, Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / (CELL / 2)));
    let last = NaN;
    for (let k = 0; k <= steps; k++) {
      const cx = Math.floor((s.x1 + (s.x2 - s.x1) * k / steps) / CELL), cy = Math.floor((s.y1 + (s.y2 - s.y1) * k / steps) / CELL), id = key(cx, cy);
      if (id === last) continue;
      last = id;
      const list = cells.get(id);
      if (!list) cells.set(id, [i]); else if (list[list.length - 1] !== i) list.push(i);
    }
  });
  const seen = new Int32Array(n);
  let stamp = 0;
  return {
    size: n,
    hit(x, y, tolerance) {
      // Samples lie within CELL / 4 of the segment point nearest to any query, so the window is widened by CELL / 2.
      const reach = tolerance + CELL / 2, x0 = Math.floor((x - reach) / CELL), x1 = Math.floor((x + reach) / CELL), y0 = Math.floor((y - reach) / CELL), y1 = Math.floor((y + reach) / CELL);
      let best = -1, bestDistance = tolerance;
      stamp++;
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const list = cells.get(key(cx, cy));
        if (list) for (const i of list) {
          if (seen[i] === stamp) continue;
          seen[i] = stamp;
          const ax = xs[i * 4], ay = xs[i * 4 + 1], dx = xs[i * 4 + 2] - ax, dy = xs[i * 4 + 3] - ay;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
          const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
          if (d <= bestDistance) { best = i; bestDistance = d; }
        }
      }
      return best < 0 ? null : { owner: owners[best], distance: bestDistance };
    },
  };
}
