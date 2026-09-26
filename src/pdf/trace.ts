import { area, pointSegmentDistance } from '../geom/polygon';
import { strokeMetrics } from './stroke';
import { styleKeyOf } from './styles';
import { groupPieces } from './group';
import { withoutScaleMarks } from './scale';
import type { PdfPath, PdfText, Pt, ScaleResult, TraceOptions, TraceRequest, TraceResult } from './types';

// Binary disk morphology. Horizontal runs keep work proportional to radius,
// rather than the disk area, even for the largest permitted gap.
function morph(src: Uint8Array, w: number, h: number, radius: number, dilate: boolean): Uint8Array {
  if (!radius) return src;
  const out = new Uint8Array(src.length);
  if (!dilate) out.fill(1);
  for (let dy = -radius; dy <= radius; dy++) {
    const rx = Math.round(Math.sqrt(radius * radius - dy * dy));
    for (let y = radius; y < h - radius; y++) {
      const base = (y + dy) * w, row = y * w;
      let sum = 0;
      for (let x = 0; x <= 2 * rx; x++) sum += src[base + x];
      for (let x = rx; x < w - rx; x++) {
        if (dilate) { if (sum) out[row + x] = 1; }
        else if (sum !== rx * 2 + 1) out[row + x] = 0;
        sum += (src[base + x + rx + 1] ?? 0) - src[base + x - rx];
      }
    }
  }
  if (!dilate) {
    out.fill(0, 0, radius * w); out.fill(0, (h - radius) * w);
    for (let y = 0; y < h; y++) { out.fill(0, y * w, y * w + radius); out.fill(0, (y + 1) * w - radius, (y + 1) * w); }
  }
  return out;
}

function simplify(points: Pt[], tolerance: number): Pt[] {
  const keep = new Uint8Array(points.length), stack = [[0, points.length - 1]];
  keep[0] = keep[points.length - 1] = 1;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = tolerance, index = -1;
    for (let i = a + 1; i < b; i++) {
      const distance = pointSegmentDistance(points[i], points[a], points[b]);
      if (distance > far) { far = distance; index = i; }
    }
    if (index !== -1) { keep[index] = 1; stack.push([a, index], [index, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

export function traceOutlines(paths: PdfPath[], opts: TraceOptions): Pt[][] {
  const { resolutionMm, gapMm, minAreaCm2, cmPerPt } = opts;
  if (![resolutionMm, gapMm, minAreaCm2, cmPerPt].every(Number.isFinite) || resolutionMm < 0.25 || resolutionMm > 1 ||
    gapMm < 0 || gapMm > 6 || minAreaCm2 < 0 || cmPerPt <= 0) throw new Error('Neplatné nastavení obkreslení.');
  if (!paths.length) return [];
  const px = cmPerPt * 10 / resolutionMm, radius = Math.round(gapMm / resolutionMm / 2);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxWidth = 1;
  for (const path of paths) for (const points of path.subpaths) for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Cesta obsahuje neplatné souřadnice.');
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    if (path.stroke && i) maxWidth = Math.max(maxWidth, strokeMetrics(path, points[i - 1], points[i]).lineWidth * px);
  }
  if (!Number.isFinite(minX)) return [];
  const padding = radius + Math.ceil(maxWidth) + 4;
  minX -= padding / px; minY -= padding / px;
  const w = Math.ceil((maxX - minX) * px) + padding + 1, h = Math.ceil((maxY - minY) * px) + padding + 1;
  if (w * h > 40_000_000) throw new Error('Arch je pro toto rozlišení příliš velký. Zvyšte krok rastru.');
  const raster = new Uint8Array(w * h);
  function line(a: Pt, b: Pt, width: number) {
    let x = Math.round((a[0] - minX) * px), y = Math.round((a[1] - minY) * px);
    const bx = Math.round((b[0] - minX) * px), by = Math.round((b[1] - minY) * px);
    const dx = Math.abs(bx - x), dy = -Math.abs(by - y), sx = x < bx ? 1 : -1, sy = y < by ? 1 : -1;
    let error = dx + dy;
    const r = Math.max(0, (Math.max(1, width) - 1) / 2), reach = Math.ceil(r);
    for (;;) {
      if (!reach) raster[y * w + x] = 1;
      else for (let oy = -reach; oy <= reach; oy++) for (let ox = -reach; ox <= reach; ox++) {
        if (ox * ox + oy * oy <= r * r + 0.25) raster[(y + oy) * w + x + ox] = 1;
      }
      if (x === bx && y === by) break;
      const e = 2 * error;
      if (e >= dy) { error += dy; x += sx; }
      if (e <= dx) { error += dx; y += sy; }
    }
  }
  function fill(rings: Pt[][]) {
    // Non-zero winding scanlines retain holes in compound painted bands.
    const edges: { x: number; y: number; end: number; slope: number; wind: number }[] = [];
    let lo = h, hi = 0;
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (a[1] === b[1]) continue;
      const low = a[1] < b[1] ? a : b, high = a[1] < b[1] ? b : a;
      const y = (low[1] - minY) * px, end = (high[1] - minY) * px;
      edges.push({ x: (low[0] - minX) * px, y, end, slope: (high[0] - low[0]) / (high[1] - low[1]), wind: a[1] < b[1] ? 1 : -1 });
      lo = Math.min(lo, Math.ceil(y)); hi = Math.max(hi, Math.ceil(end));
    }
    for (let y = lo; y < hi; y++) {
      const crossings = edges.filter(e => y >= e.y && y < e.end).map(e => ({ x: e.x + (y - e.y) * e.slope, wind: e.wind })).sort((a, b) => a.x - b.x);
      let winding = 0, start = 0;
      for (const c of crossings) {
        if (!winding) start = c.x;
        winding += c.wind;
        if (!winding) raster.fill(1, y * w + Math.ceil(start), y * w + Math.floor(c.x) + 1);
      }
    }
  }
  for (const path of paths) {
    if (path.fill) {
      fill(path.subpaths);
      // Conservative pixel coverage keeps subpixel printer-driver bands connected.
      for (const ring of path.subpaths) for (let i = 0; i < ring.length; i++) line(ring[i], ring[(i + 1) % ring.length], 1);
    }
    // Dashes identify sizes, but trace the underlying continuous cutting line,
    // as the offline extractor does; intentional dash spaces are not tears.
    if (path.stroke) path.subpaths.forEach((points, j) => {
      for (let i = 1; i < points.length; i++) line(points[i - 1], points[i], strokeMetrics(path, points[i - 1], points[i]).lineWidth * px);
      if (path.closed[j] && points.length > 2) line(points.at(-1)!, points[0], strokeMetrics(path, points.at(-1)!, points[0]).lineWidth * px);
    });
  }
  const barrier = morph(raster, w, h, radius, true), outside = new Uint8Array(raster.length), queue = new Int32Array(raster.length);
  let head = 0, tail = 1; outside[0] = 1;
  while (head < tail) {
    const i = queue[head++], x = i % w;
    if (x && !barrier[i - 1] && !outside[i - 1]) { outside[i - 1] = 1; queue[tail++] = i - 1; }
    if (x + 1 < w && !barrier[i + 1] && !outside[i + 1]) { outside[i + 1] = 1; queue[tail++] = i + 1; }
    if (i >= w && !barrier[i - w] && !outside[i - w]) { outside[i - w] = 1; queue[tail++] = i - w; }
    if (i + w < outside.length && !barrier[i + w] && !outside[i + w]) { outside[i + w] = 1; queue[tail++] = i + w; }
  }
  const interior = new Uint8Array(outside.length);
  for (let i = 0; i < outside.length; i++) {
    interior[i] = !outside[i] && !barrier[i] ? 1 : 0;
    outside[i] = outside[i] ? 0 : 1;
  }
  // Grow only enclosed whitespace back to the line centre. Outside spurs have
  // no interior seeds. Intersect with the restored envelope so thick internal
  // lines cannot expand the outer contour.
  const restored = morph(outside, w, h, radius, false);
  const solid = morph(interior, w, h, radius + Math.ceil(maxWidth / 2), true);
  for (let i = 0; i < solid.length; i++) solid[i] &= restored[i];
  const visited = new Uint8Array(solid.length), outlines: Pt[][] = [];
  const directions: Pt[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const offsets = directions.map(([x, y]) => y * w + x);
  for (let start = 0; start < solid.length; start++) {
    if (!solid[start] || visited[start]) continue;
    head = 0; tail = 1; queue[0] = start; visited[start] = 1;
    while (head < tail) {
      const i = queue[head++];
      for (const offset of offsets) {
        const j = i + offset;
        if (solid[j] && !visited[j]) { visited[j] = 1; queue[tail++] = j; }
      }
    }
    if (tail * (resolutionMm / 10) ** 2 < minAreaCm2) continue;
    const ring: Pt[] = [];
    let current = start, back = 4, first = -1;
    for (let steps = 0; steps < tail * 8; steps++) {
      let next = -1, dir = 0;
      for (let n = 1; n <= 8; n++) {
        dir = (back + n) % 8;
        if (solid[current + offsets[dir]]) { next = current + offsets[dir]; break; }
      }
      if (next === -1 || (current === start && next === first)) break;
      if (first === -1) first = next;
      ring.push([current % w / px + minX, Math.floor(current / w) / px + minY]);
      const previous = directions[(dir + 7) % 8], movement = directions[dir];
      back = directions.findIndex(([x, y]) => x === previous[0] - movement[0] && y === previous[1] - movement[1]);
      current = next;
    }
    if (ring.length < 4) continue;
    ring.push([...ring[0]]);
    const reduced = simplify(ring, 0.03 / cmPerPt);
    if (reduced.length >= 4 && area(reduced) * cmPerPt ** 2 >= minAreaCm2) outlines.push(reduced);
  }
  return outlines.sort((a, b) => area(b) - area(a));
}

export function traceSizes({ paths, texts, assignments, options, scale, excludeScaleMarks = true }: TraceRequest): TraceResult {
  const selected = new Map<string, PdfPath[]>();
  for (const path of excludeScaleMarks ? withoutScaleMarks(paths, texts, scale) : paths) {
    const size = assignments[styleKeyOf(path)]?.trim();
    if (!size) continue;
    const group = selected.get(size) ?? []; group.push(path); selected.set(size, group);
  }
  const outlines = Object.fromEntries([...selected].map(([size, group]) => [size, traceOutlines(group, options)]));
  return { cmPerPt: options.cmPerPt, sizes: [...selected.keys()], candidates: groupPieces(outlines, texts) };
}

// Default size guess: the one style that encloses clearly more area than any other.
// Tiled outlines are split into open subpaths, so closed length alone cannot tell.
// Callers pass furniture-free paths (frames repeated on every page also enclose area).
export function suggestAssignments(paths: PdfPath[], texts: PdfText[], scale: ScaleResult): Record<string, string> {
  const groups = new Map<string, PdfPath[]>();
  for (const path of withoutScaleMarks(paths, texts, scale)) {
    const key = styleKeyOf(path), group = groups.get(key) ?? [];
    group.push(path); groups.set(key, group);
  }
  const options = { resolutionMm: 1, gapMm: 1, minAreaCm2: 15, cmPerPt: scale.cmPerPt };
  const scored = [...groups].map(([key, group]) => ({ key, area: traceOutlines(group, options).reduce((sum, ring) => sum + area(ring), 0) }))
    .sort((a, b) => b.area - a.area);
  return scored[0]?.area > 2 * (scored[1]?.area ?? 0) ? { [scored[0].key]: 'uni' } : {};
}
