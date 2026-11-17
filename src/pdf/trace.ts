import { area, isSimple, pointSegmentDistance } from '../geom/polygon';
import { strokeMetrics } from './stroke';
import { styleKeyOf, styleLegend } from './styles';
import { groupPieces } from './group';
import { withoutScaleMarks } from './scale';
import { nestedOutlines, singleCell } from './proposals';
import { sortSizes } from './build';
import type { Cell, PdfPath, PdfText, Pt, ScaleResult, TraceOptions, TraceRequest, TraceResult } from './types';

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

// Splits a ring (no closing point) at every vertex it visits twice and keeps the loop of the largest area.
export function largestLoop(ring: Pt[]): Pt[] {
  const stack: Pt[] = [], at = new Map<string, number>();
  let best: Pt[] = [];
  const consider = (loop: Pt[]) => { if (loop.length >= 3 && (!best.length || area(loop) > area(best))) best = loop; };
  for (const point of ring) {
    const key = `${point[0]},${point[1]}`, k = at.get(key);
    if (k !== undefined) {
      const loop = stack.splice(k);
      for (const p of loop) at.delete(`${p[0]},${p[1]}`);
      consider(loop);
    }
    at.set(key, stack.length); stack.push(point);
  }
  consider(stack);
  return best;
}

// An outline with the enclosed regions inside it.
export interface TracedShape { ring: Pt[]; cells: Cell[] }
const MIN_CELL_CM2 = 0.3, NOTCH_CM2 = 1;

export function traceShapes(paths: PdfPath[], opts: TraceOptions): TracedShape[] {
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
  // Lines drawn as filled bands have no stroke width: estimate each band as 2 x area / perimeter. Long
  // thin subpaths count; short ones (dashes, glyphs) and wide solids (over 3 mm) are not line bands.
  for (const path of paths) if (path.fill) for (const points of path.subpaths) {
    let twiceArea = 0, perimeter = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      twiceArea += a[0] * b[1] - b[0] * a[1]; perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const width = Math.abs(twiceArea) * px / (perimeter || 1);
    // The 1-px rim drawn round every filled ring widens the band by one pixel; 40 px of perimeter is a band longer than 20 px.
    if (perimeter * px > 40 && width <= 3 / resolutionMm) maxWidth = Math.max(maxWidth, width + 1);
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
  // Cells: 4-connected enclosed regions, grown through the barrier (inside `solid`) to the line centres.
  const labels = new Int32Array(solid.length);
  let cellCount = 0;
  for (let seed = 0; seed < interior.length; seed++) {
    if (!interior[seed] || labels[seed]) continue;
    labels[seed] = ++cellCount; head = 0; tail = 1; queue[0] = seed;
    while (head < tail) {
      const i = queue[head++];
      for (const j of [i - 1, i + 1, i - w, i + w]) if (interior[j] && !labels[j]) { labels[j] = cellCount; queue[tail++] = j; }
    }
  }
  head = 0; tail = 0;
  for (let i = 0; i < labels.length; i++) if (labels[i]) { if (solid[i]) queue[tail++] = i; else labels[i] = 0; }
  while (head < tail) {
    const i = queue[head++];
    for (const j of [i - 1, i + 1, i - w, i + w]) if (solid[j] && !labels[j]) { labels[j] = labels[i]; queue[tail++] = j; }
  }
  const visited = new Uint8Array(solid.length), shapes: TracedShape[] = [];
  const directions: Pt[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const offsets = directions.map(([x, y]) => y * w + x);
  // Walks the outer border of the 8-connected component of `mask` that starts at its first pixel.
  function ringOf(mask: Uint8Array, start: number, pixels: number): Pt[] | undefined {
    const ring: Pt[] = [];
    let current = start, back = 4, first = -1;
    for (let steps = 0; steps < pixels * 8; steps++) {
      let next = -1, dir = 0;
      for (let n = 1; n <= 8; n++) {
        dir = (back + n) % 8;
        if (mask[current + offsets[dir]]) { next = current + offsets[dir]; break; }
      }
      if (next === -1 || (current === start && next === first)) break;
      if (first === -1) first = next;
      ring.push([current % w / px + minX, Math.floor(current / w) / px + minY]);
      const previous = directions[(dir + 7) % 8], movement = directions[dir];
      back = directions.findIndex(([x, y]) => x === previous[0] - movement[0] && y === previous[1] - movement[1]);
      current = next;
    }
    // A pinch still visited twice splits the ring; only its largest loop is kept.
    const loop = largestLoop(ring);
    if (loop.length < 4) return undefined;
    // Simplifying can create a crossing: retry with a finer tolerance, then drop a ring that stays non-simple.
    for (let tolerance = 0.03 / cmPerPt, attempt = 0; attempt < 4; attempt++, tolerance /= 2) {
      const candidate = simplify([...loop, [...loop[0]]], tolerance);
      if (isSimple(candidate.slice(0, -1))) return candidate;
    }
    return undefined;
  }
  const pixelCm2 = (resolutionMm / 10) ** 2, tinyPixels = MIN_CELL_CM2 / pixelCm2;
  let scratch: Uint8Array | undefined;
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
    if (tail * pixelCm2 < minAreaCm2) continue;
    let ring = ringOf(solid, start, tail);
    // Pixels and edges (4-neighbour pairs) per cell label; `out` counts edges towards the outside.
    const info = new Map<number, { px: number; out: number; adj: Map<number, number> }>();
    for (let n = 0; n < tail; n++) {
      const i = queue[n], label = labels[i];
      if (!label) continue;
      let cell = info.get(label);
      if (!cell) info.set(label, cell = { px: 0, out: 0, adj: new Map() });
      cell.px++;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        const other = solid[j] ? labels[j] : 0;
        if (!other) cell.out++;
        else if (other !== label) cell.adj.set(other, (cell.adj.get(other) ?? 0) + 1);
      }
    }
    // A small cell on the outside that mostly borders the outside is a notch mark, not part of the piece: it is cut off.
    const removed = new Set<number>();
    if (info.size > 1) for (const [label, cell] of info) {
      let shared = 0;
      for (const count of cell.adj.values()) shared += count;
      if (cell.px < NOTCH_CM2 / pixelCm2 && cell.out > 0 && shared < cell.out) removed.add(label);
    }
    if (removed.size === info.size) removed.clear();
    for (const label of removed) {
      for (const [other, count] of info.get(label)!.adj) if (!removed.has(other)) { const o = info.get(other)!; o.adj.delete(label); o.out += count; }
      info.delete(label);
    }
    let pixels = tail;
    if (removed.size) {
      scratch ??= new Uint8Array(solid.length);
      let first = solid.length;
      pixels = 0;
      for (let n = 0; n < tail; n++) if (!removed.has(labels[queue[n]])) { scratch[queue[n]] = 1; pixels++; first = Math.min(first, queue[n]); }
      ring = ringOf(scratch, first, pixels);
      for (let n = 0; n < tail; n++) scratch[queue[n]] = 0;
    }
    if (!ring || ring.length < 4 || area(ring) * cmPerPt ** 2 < minAreaCm2) continue;
    // Cells under 0.3 cm2 (text, marks) join the neighbour they share the longest border with.
    const merged = new Map<number, number>();
    const root = (label: number): number => { let r = label; while (merged.has(r)) r = merged.get(r)!; return r; };
    for (;;) {
      let small: number | undefined;
      for (const [label, cell] of info) if (cell.px < tinyPixels && cell.adj.size && (small === undefined || cell.px < info.get(small)!.px)) small = label;
      if (small === undefined) break;
      const a = info.get(small)!;
      let target = 0, edges = 0;
      for (const [label, count] of a.adj) if (count > edges) { target = label; edges = count; }
      const b = info.get(target)!;
      b.px += a.px; b.out += a.out; b.adj.delete(small);
      for (const [label, count] of a.adj) {
        if (label === target) continue;
        b.adj.set(label, (b.adj.get(label) ?? 0) + count);
        const c = info.get(label)!.adj;
        c.delete(small); c.set(target, (c.get(target) ?? 0) + count);
      }
      info.delete(small); merged.set(small, target);
    }
    const pixelPt2 = 1 / px ** 2, cells: Cell[] = [];
    if (info.size <= 1) cells.push({ id: 1, ring, areaPt2: pixels * pixelPt2, neighbours: [], touchesOutside: true });
    else {
      scratch ??= new Uint8Array(solid.length);
      const members = new Map<number, number[]>();
      for (let n = 0; n < tail; n++) {
        const label = labels[queue[n]];
        if (!label || removed.has(label)) continue;
        const list = members.get(root(label)) ?? [];
        list.push(queue[n]); members.set(root(label), list);
      }
      const rings = new Map<number, Pt[]>();
      for (const [label, list] of members) {
        let first = list[0];
        for (const i of list) { scratch[i] = 1; if (i < first) first = i; }
        const cellRing = ringOf(scratch, first, list.length);
        for (const i of list) scratch[i] = 0;
        if (cellRing) rings.set(label, cellRing);
      }
      const order = [...rings.keys()].sort((a, b) => info.get(b)!.px - info.get(a)!.px), ids = new Map(order.map((label, k) => [label, k + 1]));
      for (const label of order) {
        const cell = info.get(label)!;
        cells.push({ id: ids.get(label)!, ring: rings.get(label)!, areaPt2: cell.px * pixelPt2, touchesOutside: cell.out > 0,
          neighbours: [...cell.adj].filter(([other]) => ids.has(other)).map(([other, count]) => ({ id: ids.get(other)!, sharedPt: count / px })) });
      }
    }
    shapes.push({ ring, cells });
  }
  return shapes.sort((a, b) => area(b.ring) - area(a.ring));
}

export function traceOutlines(paths: PdfPath[], opts: TraceOptions): Pt[][] { return traceShapes(paths, opts).map(shape => shape.ring); }

// In a pattern with named sizes, `uni` means a line every size shares (hem, fold, one-size piece),
// like `vše` / `*`; only without named sizes it is the single size `uni`.
const isAll = (token: string) => token === '*' || ['vše', 'uni'].includes(token.toLowerCase());
const sizeTokens = (value: string | undefined) => (value ?? '').split(/[,;]/).map(t => t.trim()).filter(Boolean);

// Sizes listed by one assignment value; `named` = every size named explicitly in the request.
// No split on `/`: sizes like 42/44 exist.
export function assignedSizes(value: string | undefined, named: string[]): string[] {
  return [...new Set(sizeTokens(value).flatMap(t => isAll(t) ? (named.length ? named : ['uni']) : [t]))];
}
// 'named': lists a size of its own; 'shared': only uni / vše / *; 'none': empty.
export function sizeRole(value: string | undefined): 'named' | 'shared' | 'none' {
  const tokens = sizeTokens(value);
  return tokens.some(t => !isAll(t)) ? 'named' : tokens.length ? 'shared' : 'none';
}

// Lettering converted to curves (no text layer) shares the cutting lines' style. Each glyph is a fill
// of one or two small subpaths (outline, counter); four or more glyphs with curves or corners (> 6 points)
// of one colour, closer to each other than 0.8 × their size, form lettering. Simple glyphs (i, l, dots,
// hyphens) go with it when they lie inside its bounds. Dashed lines (one fill, many dash subpaths),
// marks elsewhere and strokes stay.
export function withoutLettering(paths: PdfPath[]): PdfPath[] {
  const boxes = paths.map(path => {
    if (!path.fill || path.stroke || path.subpaths.length > 2) return undefined;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const points of path.subpaths) for (const [x, y] of points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    const size = Math.max(maxX - minX, maxY - minY);
    return size < 20 ? { minX, minY, maxX, maxY, size, color: path.fill.join(), complex: path.subpaths.some(points => points.length > 6) } : undefined;
  });
  const cell = 20, grid = new Map<string, number[]>(), parent = paths.map((_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  boxes.forEach((b, i) => {
    if (!b?.complex) return;
    for (let cx = Math.floor(b.minX / cell) - 1; cx <= Math.floor(b.maxX / cell) + 1; cx++) for (let cy = Math.floor(b.minY / cell) - 1; cy <= Math.floor(b.maxY / cell) + 1; cy++) {
      for (const j of grid.get(`${cx}:${cy}`) ?? []) {
        const a = boxes[j]!, gap = Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minY - b.maxY, b.minY - a.maxY));
        if (a.color === b.color && gap <= 0.8 * Math.max(a.size, b.size)) parent[find(i)] = find(j);
      }
    }
    const key = `${Math.floor(b.minX / cell)}:${Math.floor(b.minY / cell)}`, list = grid.get(key) ?? [];
    list.push(i); grid.set(key, list);
  });
  const clusters = new Map<number, { members: number; color: string; minX: number; minY: number; maxX: number; maxY: number }>();
  boxes.forEach((b, i) => {
    if (!b?.complex) return;
    const c = clusters.get(find(i));
    if (c) { c.members++; c.minX = Math.min(c.minX, b.minX); c.minY = Math.min(c.minY, b.minY); c.maxX = Math.max(c.maxX, b.maxX); c.maxY = Math.max(c.maxY, b.maxY); }
    else clusters.set(find(i), { members: 1, color: b.color, minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY });
  });
  const lettering = [...clusters.values()].filter(c => c.members >= 4);
  return paths.filter((_, i) => {
    const b = boxes[i];
    if (!b) return true;
    if (b.complex) return clusters.get(find(i))!.members < 4;
    const x = (b.minX + b.maxX) / 2, y = (b.minY + b.maxY) / 2;
    return !lettering.some(c => c.color === b.color && x >= c.minX - 2 && x <= c.maxX + 2 && y >= c.minY - 2 && y <= c.maxY + 2);
  });
}

export function traceSizes({ paths, texts, assignments, options, scale, excludeScaleMarks = true }: TraceRequest): TraceResult {
  const named = [...new Set(Object.values(assignments).flatMap(v => sizeTokens(v).filter(t => !isAll(t))))];
  const selected = new Map<string, PdfPath[]>(), byStyle = new Map<string, PdfPath[]>(), styles = new Map<string, Set<string>>();
  for (const path of withoutLettering(excludeScaleMarks ? withoutScaleMarks(paths, texts, scale) : paths)) {
    const key = styleKeyOf(path);
    for (const size of assignedSizes(assignments[key], named)) {
      const group = selected.get(size) ?? []; group.push(path); selected.set(size, group);
      styles.set(size, (styles.get(size) ?? new Set()).add(key));
    }
    if (assignments[key]) byStyle.set(key, [...byStyle.get(key) ?? [], path]);
  }
  const sizes = [...named, ...(named.length ? [] : ['uni'])].filter(size => selected.has(size));
  const shapes: Record<string, TracedShape[]> = {}, unclear = new Set<Pt[]>();
  // A style listing several sizes, and nothing else drawn in them, is traced once: its cells are ordered
  // outward from the largest, each level being the next larger size (proposals.ts).
  for (const [key, value] of Object.entries(assignments)) {
    const listed = sizeTokens(value);
    if (listed.length < 2 || listed.some(isAll) || !byStyle.has(key)) continue;
    const own = sortSizes(assignedSizes(value, named));
    if (own.length < 2 || own.some(size => styles.get(size)?.size !== 1)) continue;
    for (const size of own) shapes[size] = [];
    for (const shape of traceShapes(byStyle.get(key)!, options)) {
      const rings = nestedOutlines(shape.cells, own.length, options.cmPerPt, options.resolutionMm);
      if (!rings) unclear.add(shape.ring);
      own.forEach((size, k) => shapes[size].push(rings === 'single' || !rings ? shape : { ring: rings[k], cells: singleCell(rings[k]) }));
    }
  }
  for (const size of sizes) shapes[size] ??= traceShapes(selected.get(size)!, options);
  const outlines = Object.fromEntries(sizes.map(size => [size, shapes[size].map(s => s.ring)]));
  const cells = Object.fromEntries(sizes.map(size => [size, shapes[size].map(s => s.cells)]));
  const candidates = groupPieces(outlines, texts, cells);
  for (const c of candidates) if (Object.values(c.sizes).some(ring => unclear.has(ring))) c.sizesUnclear = true;
  return { cmPerPt: options.cmPerPt, resolutionMm: options.resolutionMm, sizes, candidates };
}

// Overlapping pieces of every size in one line style trace as blobs with very many cells (Alexia: 163 and 90
// cells of at least 3 cm2; supported sheets: at most 23 per piece). More than MAX_CELLS in one candidate, or
// half of the traced area in candidates with more than MANY_CELLS, flags the sheet.
const CELL_MIN_CM2 = 3, MAX_CELLS = 60, MANY_CELLS = 30, MANY_AREA_SHARE = 0.5;
export function sheetProblem(result: TraceResult): 'overlapping' | null {
  const cm2 = result.cmPerPt ** 2;
  let total = 0, many = 0;
  for (const candidate of result.candidates) {
    const counts = Object.values(candidate.cells ?? {}).map(cells => cells.filter(cell => cell.areaPt2 * cm2 >= CELL_MIN_CM2).length);
    const count = Math.max(0, ...counts), outline = area(candidate.sizes[candidate.refSize] ?? []) * cm2;
    if (count > MAX_CELLS) return 'overlapping';
    total += outline;
    if (count > MANY_CELLS) many += outline;
  }
  return total > 0 && many >= MANY_AREA_SHARE * total ? 'overlapping' : null;
}

// The style to probe when no size suggestion wins: one style holding over 80 % of all line length.
export function dominantStyleKey(paths: PdfPath[]): string | undefined {
  const legend = styleLegend(paths), total = legend.reduce((sum, e) => sum + e.lengthPt, 0);
  return legend[0] && legend[0].lengthPt > 0.8 * total ? legend[0].key : undefined;
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
