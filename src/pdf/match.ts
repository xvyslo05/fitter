import type { PdfDoc, PdfPage, Pt } from './types';

export interface Match { a: number; b: number; dx: number; dy: number; votes: number }
interface Feature { page: number; points: Pt[]; anchor: Pt }
const cache = new WeakMap<PdfDoc, Match[]>();
const near = (a: number, b: number) => Math.abs(a - b) < 0.6;

// Translation invariant, including filled outlines from printer drivers. Use a few
// samples for the bucket, then verify every point before counting a vote.
export function shapeKey(points: Pt[], relative = true): string {
  const [x, y] = relative ? points[0] : [0, 0];
  const sample = points.length <= 8 ? points : [points[0], points[1], points[Math.floor(points.length / 3)], points[Math.floor(points.length * 2 / 3)], points.at(-1)!];
  return `${points.length}:` + sample.map(p => `${Math.round((p[0] - x) * 2)},${Math.round((p[1] - y) * 2)}`).join(';');
}
const contentCache = new WeakMap<PdfDoc, PdfDoc>();
// Same-position subpaths on at least half the pages are page furniture. Index
// anchors spatially, but verify every point and count distinct pages, not copies.
export function contentPages(doc: PdfDoc): PdfDoc {
  const cached = contentCache.get(doc); if (cached) return cached;
  const buckets = new Map<string, { points: Pt[]; pages: Set<number>; copies: Pt[][] }[]>();
  for (const page of doc.pages) for (const path of page.paths) for (const points of path.subpaths) {
    if (!points.length) continue;
    const x = Math.round(points[0][0] / 0.3), y = Math.round(points[0][1] / 0.3);
    let group: { points: Pt[]; pages: Set<number>; copies: Pt[][] } | undefined;
    for (let dx = -1; dx <= 1 && !group; dx++) for (let dy = -1; dy <= 1 && !group; dy++) {
      group = buckets.get(`${points.length}:${x + dx}:${y + dy}`)?.find(g =>
        points.every((p, i) => Math.abs(p[0] - g.points[i][0]) <= 0.3 && Math.abs(p[1] - g.points[i][1]) <= 0.3));
    }
    if (group) { group.pages.add(page.index); group.copies.push(points); }
    else {
      const key = `${points.length}:${x}:${y}`, bucket = buckets.get(key) ?? [];
      bucket.push({ points, pages: new Set([page.index]), copies: [points] }); buckets.set(key, bucket);
    }
  }
  const furniture = new Set<Pt[]>(), threshold = Math.max(2, Math.ceil(doc.pages.length / 2));
  for (const bucket of buckets.values()) for (const group of bucket) if (group.pages.size >= threshold) {
    group.copies.forEach(points => furniture.add(points));
  }
  const content = { pages: doc.pages.map(page => ({ ...page, paths: page.paths.flatMap(path => {
    const indices = path.subpaths.flatMap((points, i) => furniture.has(points) ? [] : [i]);
    return indices.length ? [{ ...path, subpaths: indices.map(i => path.subpaths[i]), closed: indices.map(i => path.closed[i]) }] : [];
  }) })) };
  contentCache.set(doc, content); return content;
}

export function matchPages(doc: PdfDoc): Match[] {
  const cached = cache.get(doc); if (cached) return cached;
  const buckets = new Map<string, Feature[]>();
  for (const page of contentPages(doc).pages) for (const path of page.paths) for (const points of path.subpaths) {
    if (points.length < 2) continue;
    let length = 0;
    for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (length < 12) continue;
    const key = shapeKey(points), bucket = buckets.get(key) ?? [];
    bucket.push({ page: page.index, points, anchor: points[0] }); buckets.set(key, bucket);
  }
  const votes = new Map<string, Match[]>();
  for (const bucket of buckets.values()) {
    // Repeated dashes, glyphs and grid lines aren't distinctive enough.
    const counts = new Map<number, number>();
    for (const f of bucket) counts.set(f.page, (counts.get(f.page) ?? 0) + 1);
    const features = bucket.filter(f => counts.get(f.page)! <= 4);
    for (let i = 0; i < features.length; i++) for (let j = i + 1; j < features.length; j++) {
      const a = features[i], b = features[j];
      if (a.page === b.page) continue;
      const dx = a.anchor[0] - b.anchor[0], dy = a.anchor[1] - b.anchor[1];
      if (Math.hypot(dx, dy) < 5) continue;
      if (!a.points.every((p, k) => near(p[0] - b.points[k][0], dx) && near(p[1] - b.points[k][1], dy))) continue;
      const key = `${a.page}:${b.page}`, list = votes.get(key) ?? [];
      const vote = list.find(v => near(v.dx, dx) && near(v.dy, dy));
      if (vote) { vote.dx += (dx - vote.dx) / (vote.votes + 1); vote.dy += (dy - vote.dy) / (vote.votes + 1); vote.votes++; }
      else list.push({ a: a.page, b: b.page, dx, dy, votes: 1 });
      votes.set(key, list);
    }
  }
  const matches = [...votes.values()].flatMap(list => list.sort((a, b) => b.votes - a.votes).slice(0, 4));
  cache.set(doc, matches); return matches;
}

interface Crossing { pos: number; slope: number }
function crossings(page: PdfPage, axis: 0 | 1, boundary: number, tolerance = 0.3): Crossing[] {
  const found: (Crossing & { distance: number })[] = [];
  for (const path of page.paths) for (const original of path.subpaths) {
    const points = path.fill && !path.stroke ? [...original, original[0]] : original;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1], q = points[i], d = q[axis] - p[axis];
      if (Math.abs(d) < 0.01) continue;
      // In points, not a fraction of segment length: short flattened segments
      // ending at a clip boundary need the same tolerance as long straight lines.
      if (boundary < Math.min(p[axis], q[axis]) - tolerance || boundary > Math.max(p[axis], q[axis]) + tolerance) continue;
      const t = (boundary - p[axis]) / d, slope = (q[1 - axis] - p[1 - axis]) / d;
      const pos = p[1 - axis] + t * (q[1 - axis] - p[1 - axis]);
      if (pos <= 3 || pos >= (axis === 0 ? page.height : page.width) - 3) continue;
      const distance = Math.max(0, Math.min(p[axis], q[axis]) - boundary, boundary - Math.max(p[axis], q[axis]));
      const previous = found.findIndex(c => near(c.pos, pos));
      // At a flattened curve vertex prefer the actual crossing over a nearby
      // segment extrapolated to the seam by the endpoint tolerance.
      if (previous < 0) found.push({ pos, slope, distance });
      else if (distance < found[previous].distance) found[previous] = { pos, slope, distance };
    }
  }
  return found;
}
function compareCrossings(left: Crossing[], right: Crossing[]): number {
  const used = new Set<number>();
  let count = 0;
  for (const c of left) {
    const i = right.findIndex((d, i) => !used.has(i) && near(c.pos, d.pos) && Math.abs(c.slope - d.slope) < 0.05);
    if (i !== -1) { used.add(i); count++; }
  }
  // Each side must have a majority of its distinct crossings accounted for.
  return count >= 2 && count > Math.max(left.length, right.length) / 2 ? count : 0;
}
// Call with furniture-filtered pages when matching a document.
export function edgeMatches(a: PdfPage, b: PdfPage, axis: 0 | 1): boolean {
  return !!compareCrossings(crossings(a, axis, axis === 0 ? a.width : a.height), crossings(b, axis, 0));
}

// Repeated frame coordinates locate an asymmetric crop/clip boundary. Unlike
// content matching this deliberately inspects the original page furniture.
function frameBoundaries(doc: PdfDoc, axis: 0 | 1, step: number): [number, number][] {
  const groups: { value: number; pages: Set<number> }[] = [];
  for (const page of doc.pages) {
    const size = axis === 0 ? page.width : page.height;
    for (const path of page.paths) for (const points of path.subpaths) for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (Math.abs(a[axis] - b[axis]) > 0.3 || Math.abs(a[1 - axis] - b[1 - axis]) < (axis === 0 ? page.height : page.width) * 0.6) continue;
      const value = (a[axis] + b[axis]) / 2;
      if (value < -0.3 || value > size + 0.3) continue;
      const group = groups.find(g => Math.abs(g.value - value) < 0.3);
      if (group) group.pages.add(page.index); else groups.push({ value, pages: new Set([page.index]) });
    }
  }
  const common = groups.filter(g => g.pages.size >= Math.max(2, Math.ceil(doc.pages.length / 2)));
  // A frame drawn as a narrow filled rectangle has two edges. Use its
  // centreline as the content boundary, rather than either painted edge.
  const centres: typeof common = [];
  for (const item of common.sort((a, b) => a.value - b.value)) {
    const last = centres.at(-1);
    if (last && item.value - last.value < 2) last.value = (last.value + item.value) / 2;
    else centres.push({ ...item });
  }
  const result: [number, number][] = [];
  for (const low of centres) for (const high of centres) if (Math.abs(high.value - low.value - step) < 1) result.push([high.value, low.value]);
  return result;
}
const seamCache = new WeakMap<PdfDoc, Map<string, Match[]>>();
export function seamMatches(doc: PdfDoc, step: Pt): Match[] {
  const key = step.join(':'), cached = seamCache.get(doc)?.get(key); if (cached) return cached;
  const pages = contentPages(doc).pages, matches: Match[] = [];
  const bounds = [frameBoundaries(doc, 0, step[0]), frameBoundaries(doc, 1, step[1])];
  for (const axis of [0, 1] as const) {
    const frames = bounds[axis];
    const profiles = pages.map(page => {
      const size = axis === 0 ? page.width : page.height;
      const clips = page.clips.filter(c => Math.abs(c[axis + 2] - c[axis] - step[axis]) < 1)
        .map((c): [number, number] => [c[axis + 2], c[axis]]);
      const boundaries = Math.abs(size - step[axis]) < 0.6 ? [{ kind: 'edge', end: size, start: 0, tolerance: 0.3 }] : [
        ...[0.25, 0.5, 0.75].map(fraction => ({ kind: `band${fraction}`, end: step[axis] + (size - step[axis]) * fraction, start: (size - step[axis]) * fraction, tolerance: 0.3 })),
        ...frames.map(([end, start], i) => ({ kind: `frame${i}`, end, start, tolerance: 1 })),
        ...clips.map(([end, start]) => ({ kind: 'clip', end, start, tolerance: 0.3 })),
      ];
      // Crop-frame corners are the equivalent of page-edge furniture. A frame
      // can be split into different subpaths on different tiles, so exclude its
      // border here as well as filtering identical complete subpaths above.
      const interior = (c: Crossing) => !bounds[1 - axis].some(([high, low]) => c.pos <= low + 3 || c.pos >= high - 3);
      return boundaries.map(({ kind, end, start, tolerance }) => ({ kind, end: crossings(page, axis, end, tolerance).filter(interior), start: crossings(page, axis, start, tolerance).filter(interior) }));
    });
    for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
      let votes = 0;
      for (const a of profiles[i]) for (const b of profiles[j]) {
        if (a.kind === b.kind) votes = Math.max(votes, compareCrossings(a.end, b.start));
      }
      if (votes) matches.push({ a: pages[i].index, b: pages[j].index, dx: axis === 0 ? step[0] : 0, dy: axis === 1 ? step[1] : 0, votes });
    }
  }
  const cache = seamCache.get(doc) ?? new Map<string, Match[]>(); cache.set(key, matches); seamCache.set(doc, cache);
  return matches;
}
