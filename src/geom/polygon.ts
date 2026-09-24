import { Clipper, FillRule, Path64, Paths64 } from 'clipper2-js';
import { inflatePaths } from './offset';
import type { Pt } from '../model/pattern';

const SCALE = 1_000_000;
export const EPS = 1e-8;
export const FOLD_TOLERANCE = 0.2;

export function signedArea(p: Pt[]): number {
  return p.reduce((sum, a, i) => {
    const b = p[(i + 1) % p.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;
}
export const area = (p: Pt[]): number => Math.abs(signedArea(p));
export function bbox(p: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of p) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
export const translate = (p: Pt[], x: number, y: number): Pt[] => p.map(([a, b]) => [a + x, b + y]);
export function normalize(p: Pt[]): Pt[] {
  const b = bbox(p);
  return translate(p, -b.minX, -b.minY);
}
export const rotate = (p: Pt[], degrees: number): Pt[] => {
  const a = degrees * Math.PI / 180;
  return p.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
};
export const mirrorX = (p: Pt[]): Pt[] => normalize(p.map(([x, y]) => [-x, y]));
export const mirrorY = (p: Pt[]): Pt[] => normalize(p.map(([x, y]) => [x, -y]));

function paths(polygons: Pt[][]): Paths64 {
  const result = new Paths64();
  for (const p of polygons) {
    const path = new Path64();
    const positive = signedArea(p) < 0 ? [...p].reverse() : p;
    for (const [x, y] of positive) path.push({ x: Math.round(x * SCALE), y: Math.round(y * SCALE) });
    result.push(path);
  }
  return result;
}
const fromPaths = (p: Paths64): Pt[][] => Array.from(p, ring => Array.from(ring, ({ x, y }) => [x / SCALE || 0, y / SCALE || 0] as Pt));
function outer(result: Paths64): Pt[] {
  const rings = fromPaths(result.map(ring => Clipper.trimCollinear(ring))).sort((a, b) => area(b) - area(a));
  if (!rings.length) throw new Error('Geometrie dílu je po úpravě prázdná.');
  if (rings.filter(p => signedArea(p) > 0).length > 1) throw new Error('Úprava vytvořila oddělené obrysy. Zkontrolujte hranu lomu.');
  // The file format describes one outer cutting ring, without holes.
  return rings[0];
}
export function offset(p: Pt[], amount: number): Pt[] {
  if (!amount) return p.map(([x, y]) => [x, y]);
  return outer(inflatePaths(paths([p]), amount * SCALE));
}
export function union(a: Pt[], b: Pt[]): Pt[] {
  return outer(Clipper.Union(paths([a, b]), undefined, FillRule.NonZero));
}
export function intersectionArea(a: Pt[], b: Pt[]): number {
  return Math.abs(fromPaths(Clipper.Intersect(paths([a]), paths([b]), FillRule.NonZero))
    .reduce((sum, p) => sum + signedArea(p), 0));
}
export function mirrorAcross(p: Pt[], [a, b]: [Pt, Pt]): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  if (length2 < EPS) throw new Error('Hrana lomu má nulovou délku.');
  return p.map(([x, y]) => {
    const t = ((x - a[0]) * dx + (y - a[1]) * dy) / length2;
    return [2 * (a[0] + t * dx) - x, 2 * (a[1] + t * dy) - y];
  });
}
export const unfold = (p: Pt[], fold: [Pt, Pt]): Pt[] => normalize(union(p, mirrorAcross(p, fold)));

export function alignFoldOutline(p: Pt[], [a, b]: [Pt, Pt]): { polygon: Pt[]; adjusted: boolean } {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  const distances = p.map(([x, y]) => (dx * (y - a[1]) - dy * (x - a[0])) / length);
  const onBoundary = (v: Pt) => p.some((a, i) => pointSegmentDistance(v, a, p[(i + 1) % p.length]) < 1e-6);
  const needsAlignment = !onBoundary(a) || !onBoundary(b) || (distances.some(d => d > 1e-6) && distances.some(d => d < -1e-6));
  if (!needsAlignment) return { polygon: p, adjusted: false };
  // Only normalize small extraction inaccuracies at a declared fold edge.
  const snapped: Pt[] = p.map(([x, y], i) => [Math.abs(distances[i]) <= FOLD_TOLERANCE ? 0 : distances[i],
    ((x - a[0]) * dx + (y - a[1]) * dy) / length]);
  // Union removes coincident or backtracking segments introduced by snapping.
  const local = outer(Clipper.Union(paths([snapped]), undefined, FillRule.NonZero));
  if (!isSimple(local) || area(local) < EPS) throw new Error('Obrys u lomu nelze bezpečně srovnat. Zkontrolujte vstupní střih.');
  const polygon: Pt[] = local.map(([x, y]) => [a[0] + (y * dx - x * dy) / length, a[1] + (y * dy + x * dx) / length]);
  return { polygon, adjusted: true };
}

export function foldIsVertical([a, b]: [Pt, Pt]): boolean {
  return Math.abs(b[0] - a[0]) <= Math.abs(b[1] - a[1]) * Math.tan(Math.PI / 180) + EPS;
}
export function orientFold(p: Pt[], fold: [Pt, Pt]): Pt[] {
  const [a, b] = fold[0][1] <= fold[1][1] ? fold : [fold[1], fold[0]];
  const angle = 90 - Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  let result = rotate(translate(p, -a[0], -a[1]), angle);
  const bounds = bbox(result);
  if (Math.abs(bounds.minX) > Math.abs(bounds.maxX)) result = result.map(([x, y]) => [-x, y]);
  result = result.map(([x, y]) => [Math.abs(x) < 1e-6 ? 0 : x, y]);
  return normalize(result);
}
export function clipAtFold(p: Pt[]): Pt[] {
  const b = bbox(p);
  const rect: Pt[] = [[0, b.minY - 1], [b.maxX + 1, b.minY - 1], [b.maxX + 1, b.maxY + 1], [0, b.maxY + 1]];
  return outer(Clipper.Intersect(paths([p]), paths([rect]), FillRule.NonZero));
}

function cross(a: Pt, b: Pt, c: Pt): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
export function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) - EPS || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) - EPS ||
      Math.max(a[1], b[1]) < Math.min(c[1], d[1]) - EPS || Math.max(c[1], d[1]) < Math.min(a[1], b[1]) - EPS) return false;
  return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
}
export function isSimple(p: Pt[]): boolean {
  for (let i = 0; i < p.length; i++) {
    const next = (i + 1) % p.length;
    if (Math.hypot(p[i][0] - p[next][0], p[i][1] - p[next][1]) < EPS) return false;
    for (let j = i + 1; j < p.length; j++) {
      if (j === next || (j + 1) % p.length === i) continue;
      if (segmentsIntersect(p[i], p[next], p[j], p[(j + 1) % p.length])) return false;
    }
  }
  return true;
}
export function polygonDistance(a: Pt[], b: Pt[]): number {
  if (intersectionArea(a, b) > 0) return 0;
  let distance = Infinity;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const an = a[(i + 1) % a.length], bn = b[(j + 1) % b.length];
    if (segmentsIntersect(a[i], an, b[j], bn)) return 0;
    distance = Math.min(distance, pointSegmentDistance(a[i], b[j], bn), pointSegmentDistance(b[j], a[i], an));
  }
  return distance;
}
