import { area, pointSegmentDistance } from '../geom/polygon';
import { containsPoint } from './group';
import type { PdfPath, PdfText, PieceCandidate, Pt, TraceResult } from './types';

export interface PieceDraft {
  candidateId: number; include: boolean; name: string;
  cut: { material: string; count: number }[];
  // Index into foldEdges(candidate, cmPerPt); null = not cut on fold.
  foldEdge: number | null;
  // Degrees in sheet space (y down): 0 = +x, 90 = +y.
  grainAngle: number; optional: boolean; variantGroup: string; variant: string;
  // Shown on the card: the labels left the counts ambiguous.
  hint?: string;
}
export interface Edge { a: Pt; b: Pt; length: number }
// Furniture-free sheet paths (contentPages) and all sheet texts, in sheet pt.
export interface PieceSheet { contentPaths: PdfPath[]; texts: PdfText[] }

const FOLD_MIN_CM = 5, GRAIN_MIN_CM = 3, ARROW_MIN_CM = 1.5, NEAR_CM = 2, FOLD_SNAP_CM = 0.25;
export const DEFAULT_MATERIAL = 'hlavní';

// JS \b is ASCII-only; letter lookarounds keep Czech/German words whole.
const FOLD = /bruch|(?<!\p{L})(?:st\.?\s?br|fold(?:ed)?|lom|lomu|přelož\p{L}*|přehyb\p{L}*|pli)(?!\p{L})/iu;
const GRAIN = /faden(?:lauf|richtung)|(?<!\p{L})(?:grain|fl|vlákn\p{L}*|osnov\p{L}*|droit[\s-]fil|fil\s+droit)(?!\p{L})/iu;
// "2x", "2 ×", "x 2", "cut 2", "2 mal" – but not "5x5" or "2 XL".
const COUNT = /(?<![\d.,])(\d{1,3})\s*[x×](?![\p{L}\d]|\s*\d)|(?<![\p{L}\d]\s*)[x×]\s*(\d{1,3})(?![\d.,])|(?<!\p{L})cut\s*(\d{1,3})(?!\d)|(\d{1,3})\s*-?\s*mal(?!\p{L})/giu;
const MEASURE = /\d\s*(?:cm|mm)(?!\p{L})|(?<!\p{L})(?:cm|mm|inch|zoll)(?!\p{L})|kontrol|testquadrat|maßstab|měřítk|(?<!\p{L})scale/iu;
const SIZE_TOKEN = /^(?:\d+(?:[.,]\d+)?|x{0,3}[sl]|m|\d?xl|x{1,4}l|uni)$/i;
const STOP = /^(?:(?:vy|na|u)?st[řr][ií]h\p{L}*|(?:zu)?schn\p{L}*|cut\p{L}*|couper|the|and|und|aus|from|each|jeweils|mal|times|pairs?|páry?|kus\p{L}*|stück|stk|gegengleich|spiegelverkehrt|zrcadl\p{L}*|mirror\p{L}*|revers\p{L}*|fois)$/iu;
// Printed Czech material words in any case form → dictionary form; other words stay as printed (lower case).
const MATERIALS: [RegExp, string][] = [[/^podšív/, 'podšívka'], [/^vnějš/, 'vnější'], [/^vnitřn/, 'vnitřní'], [/^hlavn/, 'hlavní'],
  [/^vlizel/, 'vlizelín'], [/^výztu/, 'výztuž'], [/^kontrastn/, 'kontrastní'], [/^lát[kc]/, 'látka']];

export const openRing = (ring: Pt[]): Pt[] => ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
const distance = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lineDistance = (p: Pt, a: Pt, b: Pt) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / (distance(a, b) || 1);
const ringDistance = (p: Pt, ring: Pt[]) => ring.reduce((d, a, i) => Math.min(d, pointSegmentDistance(p, a, ring[(i + 1) % ring.length])), Infinity);
const along = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// Axis angle in degrees, [0, 180): a grain line or fold edge has no direction.
export const axisAngle = (a: Pt, b: Pt) => ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI) % 180 + 180) % 180;
const angleGap = (a: number, b: number) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };
// Approximate text centre: the anchor is the baseline start, glyphs are about half an em wide.
function textCentre(t: PdfText): Pt {
  const half = t.str.length * t.height * 0.25;
  return [t.x + Math.cos(t.angle) * half, t.y + Math.sin(t.angle) * half];
}

const words = (s: string) => s.split(/[^\p{L}]+/u).filter(w => w.length >= 3 && !STOP.test(w) && !FOLD.test(w) && !GRAIN.test(w));
function material(word: string): string {
  const w = word.toLocaleLowerCase('cs');
  return MATERIALS.find(([r]) => r.test(w))?.[1] ?? w;
}
// Every "N×" of a cut instruction with the material printed after it; before the first count only a
// known material word counts ("PODŠÍVKA 2x", but not "navíc 2x"). null = no material printed.
function instructions(label: string): { material: string | null; count: number }[] {
  if (MEASURE.test(label)) return [];
  const matches = [...label.matchAll(COUNT)];
  return matches.flatMap((m, i) => {
    const count = Number(m[1] ?? m[2] ?? m[3] ?? m[4]), before = i === 0 ? words(label.slice(0, m.index)).at(-1) : undefined;
    const word = words(label.slice(m.index + m[0].length, matches[i + 1]?.index ?? label.length))[0] ??
      (before && MATERIALS.some(([r]) => r.test(before.toLocaleLowerCase('cs'))) ? before : undefined);
    return count > 0 ? [{ material: word ? material(word) : null, count }] : [];
  });
}
function nameLike(label: string): boolean {
  const tokens = label.split(/[\s,;/–-]+/).filter(Boolean);
  return /\p{L}.*\p{L}/u.test(label) && !instructions(label).length && !MEASURE.test(label) && !FOLD.test(label) && !GRAIN.test(label) &&
    !tokens.every(t => SIZE_TOKEN.test(t)) && label.length <= 40 && tokens.length <= 5;
}

// Labels are tried in order for the name (callers sort by text height); `titles` never become names.
// A material printed twice (e.g. in two languages) keeps the larger count; so do counts without a
// material, which are taken as one instruction. That count goes to
// (a) a known material named in another label of the piece (e.g. "UCHO V PODŠÍVCE") without its own count;
// (b) nowhere if `defaultMaterial` already has a printed count on the piece: `hint` asks the user to check;
// (c) otherwise `defaultMaterial`. Nothing parsed: hlavní × 1.
export function parseCutLabels(labels: string[], defaultMaterial = DEFAULT_MATERIAL, titles: ReadonlySet<string> = new Set()) {
  const counts = new Map<string, number>(), loose: { label: string; count: number }[] = [];
  for (const label of labels) for (const { material, count } of instructions(label)) {
    if (material) counts.set(material, Math.max(counts.get(material) ?? 0, count)); else loose.push({ label, count });
  }
  let hint: string | undefined;
  if (loose.length) {
    const count = Math.max(...loose.map(l => l.count));
    const named = labels.filter(l => !titles.has(l) && !instructions(l).length).flatMap(words).map(material)
      .find(m => MATERIALS.some(([, known]) => known === m) && !counts.has(m));
    if (named) counts.set(named, count);
    else if (counts.has(defaultMaterial)) hint = `Pokyn „${loose[0].label}“ neuvádí materiál – zkontrolujte počty.`;
    else counts.set(defaultMaterial, count);
  }
  const cut = [...counts].map(([material, count]) => ({ material, count }));
  return { name: labels.find(l => !titles.has(l) && nameLike(l)), cut: cut.length ? cut : [{ material: DEFAULT_MATERIAL, count: 1 }],
    fold: labels.some(l => FOLD.test(l)), ...(hint ? { hint } : {}) };
}

// Maximal runs of ring vertices within `tolerancePt` (≈ 2 mm) of their chord, so that the 0.5–1.5 mm
// stair-steps of a traced outline stay one edge; segments longer than 5 × tolerance must also keep
// within 1° of the chord.
export function straightEdges(ring: Pt[], minLengthPt: number, tolerancePt = 6): Edge[] {
  const p = openRing(ring), n = p.length;
  if (n < 3) return [];
  const at = (i: number) => p[((i % n) + n) % n];
  const fits = (i: number, k: number) => {
    const a = at(i), b = at(k), chord = axisAngle(a, b);
    for (let m = i + 1; m <= k; m++) {
      if (m < k && lineDistance(at(m), a, b) > tolerancePt) return false;
      if (distance(at(m - 1), at(m)) > tolerancePt * 5 && angleGap(axisAngle(at(m - 1), at(m)), chord) > 1) return false;
    }
    return true;
  };
  // Start at the sharpest corner so that no straight run wraps around the start vertex.
  let start = 0, sharpest = -1;
  for (let i = 0; i < n; i++) {
    const turn = angleGap(axisAngle(at(i - 1), at(i)), axisAngle(at(i), at(i + 1)));
    if (turn > sharpest) { sharpest = turn; start = i; }
  }
  const edges: Edge[] = [];
  for (let i = start; i < start + n;) {
    let j = i + 1;
    while (j < start + n && fits(i, j + 1)) j++;
    if (distance(at(i), at(j)) >= minLengthPt) edges.push({ a: at(i), b: at(j), length: distance(at(i), at(j)) });
    i = j;
  }
  return edges;
}
// A fold edge needs the whole outline on one side of it.
function oneSided(ring: Pt[], { a, b }: Edge, tolerance: number): boolean {
  const sides = ring.map(p => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / distance(a, b));
  return !(sides.some(s => s > tolerance) && sides.some(s => s < -tolerance));
}
// Straight edges (≥ 5 cm) of the reference outline that can be a fold. PieceDraft.foldEdge indexes this list.
export function foldEdges(candidate: PieceCandidate, cmPerPt: number): Edge[] {
  const ring = openRing(candidate.sizes[candidate.refSize]);
  return straightEdges(ring, FOLD_MIN_CM / cmPerPt).filter(e => oneSided(ring, e, 0.2 / cmPerPt));
}
// Like extract.py snap_fold: fit the outline vertices near the approximate edge and span them.
export function snapFold(ring: Pt[], [a, b]: [Pt, Pt], tolerancePt: number): [Pt, Pt] | null {
  const near = openRing(ring).filter(p => pointSegmentDistance(p, a, b) <= tolerancePt);
  if (near.length < 2) return null;
  const cx = near.reduce((s, p) => s + p[0], 0) / near.length, cy = near.reduce((s, p) => s + p[1], 0) / near.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of near) { sxx += (x - cx) ** 2; sxy += (x - cx) * (y - cy); syy += (y - cy) ** 2; }
  const angle = Math.atan2(2 * sxy, sxx - syy) / 2;
  let dx = Math.cos(angle), dy = Math.sin(angle);
  if (dx * (b[0] - a[0]) + dy * (b[1] - a[1]) < 0) { dx = -dx; dy = -dy; }
  const t = near.map(([x, y]) => (x - cx) * dx + (y - cy) * dy), lo = Math.min(...t), hi = Math.max(...t);
  return hi - lo > 1e-6 ? [[cx + lo * dx, cy + lo * dy], [cx + hi * dx, cy + hi * dy]] : null;
}
// Fold per size: the chosen reference edge snapped to every size's own outline (null = not found).
export function sizeFolds(candidate: PieceCandidate, foldEdge: number | null, cmPerPt: number): Record<string, [Pt, Pt] | null> {
  const edge = foldEdge === null ? undefined : foldEdges(candidate, cmPerPt)[foldEdge];
  return Object.fromEntries(Object.entries(candidate.sizes).map(([size, ring]) =>
    [size, edge ? snapFold(ring, [edge.a, edge.b], FOLD_SNAP_CM / cmPerPt) : null]));
}

// Straight lines fully inside the reference outline and not on any size's cutting line (furniture is
// already gone from contentPaths). Collinear pieces (tiles, dashes) are joined. Arrows or lines labelled
// like "Fadenlauf" win (≥ 1.5 cm), otherwise the longest line ≥ 3 cm.
export function detectGrain(candidate: PieceCandidate, cmPerPt: number, sheet: PieceSheet): Edge | null {
  const ring = openRing(candidate.sizes[candidate.refSize]), rings = Object.values(candidate.sizes).map(openRing);
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const [minX, minY, maxX, maxY] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const outside = (p: Pt) => p[0] < minX || p[1] < minY || p[0] > maxX || p[1] > maxY || !containsPoint(ring, p[0], p[1]);
  const onCut = 0.15 / cmPerPt, touch = 0.15 / cmPerPt, gap = 2 / cmPerPt;
  const segments: Edge[] = [], heads: Pt[][] = [];
  for (const path of sheet.contentPaths) path.subpaths.forEach((points, i) => {
    if (points.length < 2) return;
    const closed = path.closed[i] || !!path.fill || distance(points[0], points.at(-1)!) < 0.5;
    if (closed) {
      if (points.length <= 5 && !points.every(outside) && area(points) * cmPerPt ** 2 < 1) heads.push(points);
      return;
    }
    if (!path.stroke || points.every(outside)) return;
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j], length = distance(a, b);
      if (length < 0.1 / cmPerPt || [0, 0.25, 0.5, 0.75, 1].some(t => outside(along(a, b, t)))) continue;
      if ([0.25, 0.5, 0.75].every(t => rings.some(r => ringDistance(along(a, b, t), r) < onCut))) continue;
      segments.push({ a, b, length });
    }
  });
  // Group collinear segments (0.5°, 0.75 pt), then chain each group along its direction (gaps ≤ 2 cm).
  const groups: { origin: Pt; d: Pt; spans: [number, number][] }[] = [];
  for (const s of [...segments].sort((x, y) => y.length - x.length)) {
    const project = (g: { origin: Pt; d: Pt }, p: Pt) => (p[0] - g.origin[0]) * g.d[0] + (p[1] - g.origin[1]) * g.d[1];
    const offset = (g: { origin: Pt; d: Pt }, p: Pt) => Math.abs((p[0] - g.origin[0]) * g.d[1] - (p[1] - g.origin[1]) * g.d[0]);
    let group = groups.find(g => angleGap(axisAngle(s.a, s.b), axisAngle([0, 0], g.d)) < 0.5 && offset(g, s.a) < 0.75 && offset(g, s.b) < 0.75);
    if (!group) { group = { origin: s.a, d: [(s.b[0] - s.a[0]) / s.length, (s.b[1] - s.a[1]) / s.length], spans: [] }; groups.push(group); }
    const t = [project(group, s.a), project(group, s.b)].sort((x, y) => x - y) as [number, number];
    group.spans.push(t);
  }
  const lines: Edge[] = [];
  for (const { origin, d, spans } of groups) {
    const point = (t: number): Pt => [origin[0] + d[0] * t, origin[1] + d[1] * t];
    spans.sort((x, y) => x[0] - y[0]);
    let [lo, hi] = spans[0];
    for (const [from, to] of [...spans.slice(1), [Infinity, Infinity]]) {
      if (from - hi <= gap) { hi = Math.max(hi, to); continue; }
      lines.push({ a: point(lo), b: point(hi), length: hi - lo });
      [lo, hi] = [from, to];
    }
  }
  // Arrowhead at `tip`: two straight wings (≥ 3 mm) running back along the shaft, one on each side at
  // 10–60° and within 10° of each other, or a small closed head on the axis. Letters drawn as strokes
  // (Y, T, curve ends) do not qualify.
  const arrowAt = (line: Edge, tip: Pt, other: Pt) => {
    const u: Pt = [(other[0] - tip[0]) / line.length, (other[1] - tip[1]) / line.length];
    const wings = segments.flatMap(s => {
      const [near, far] = distance(s.a, tip) < distance(s.b, tip) ? [s.a, s.b] : [s.b, s.a];
      if (s.length < 0.3 / cmPerPt || s.length > Math.min(2.5 / cmPerPt, line.length * 0.6) || distance(near, tip) >= touch) return [];
      const back = (far[0] - tip[0]) * u[0] + (far[1] - tip[1]) * u[1], side = (far[1] - tip[1]) * u[0] - (far[0] - tip[0]) * u[1];
      const angle = Math.atan2(Math.abs(side), back) * 180 / Math.PI;
      return angle >= 10 && angle <= 60 ? [{ side: Math.sign(side), angle }] : [];
    });
    return wings.some(w => wings.some(x => x.side === -w.side && Math.abs(x.angle - w.angle) <= 10)) ||
      heads.some(h => (containsPoint(h, tip[0], tip[1]) || ringDistance(tip, h) < touch) &&
        lineDistance([h.reduce((s, p) => s + p[0], 0) / h.length, h.reduce((s, p) => s + p[1], 0) / h.length], line.a, line.b) < 0.1 / cmPerPt);
  };
  const arrow = (line: Edge) => arrowAt(line, line.a, line.b) || arrowAt(line, line.b, line.a);
  const labels = sheet.texts.filter(t => GRAIN.test(t.str)).flatMap((t): Pt[] => [[t.x, t.y], textCentre(t)]);
  const labelled = (line: Edge) => labels.some(p => pointSegmentDistance(p, line.a, line.b) < NEAR_CM / cmPerPt);
  // Share of the piece's extent in the line's direction. Text drawn as strokes (Celia) has straight
  // glyph strokes and arrow-like glyphs: arrows must span 10 %, plain lines 25 % of the piece.
  const span = (line: Edge) => {
    const t = ring.map(p => ((p[0] - line.a[0]) * (line.b[0] - line.a[0]) + (p[1] - line.a[1]) * (line.b[1] - line.a[1])) / line.length);
    return line.length / (Math.max(...t) - Math.min(...t));
  };
  const longest = (list: Edge[]) => list.reduce<Edge | null>((best, l) => !best || l.length > best.length ? l : best, null);
  return longest(lines.filter(l => l.length >= ARROW_MIN_CM / cmPerPt && span(l) >= 0.1 && (arrow(l) || labelled(l)))) ??
    longest(lines.filter(l => l.length >= GRAIN_MIN_CM / cmPerPt && span(l) >= 0.25));
}

// Legends and size tables: several labels, mostly sizes or numbers.
const tableLike = (labels: string[]) => labels.length >= 3 &&
  labels.filter(l => l.split(/[\s,;/–-]+/).filter(Boolean).every(t => SIZE_TOKEN.test(t))).length > labels.length / 2;

export function suggestPieces(result: TraceResult, sheet: PieceSheet): PieceDraft[] {
  const k = result.cmPerPt, candidates = result.candidates, rings = candidates.map(c => openRing(c.sizes[c.refSize]));
  // Text on more than half of the pieces (e.g. the pattern title) never names a piece.
  const frequency = new Map<string, number>();
  for (const c of candidates) for (const l of c.labels) frequency.set(l, (frequency.get(l) ?? 0) + 1);
  const titles = new Set([...frequency].filter(([, n]) => n >= 2 && n > candidates.length / 2).map(([l]) => l));
  // Name candidates by text height: piece names are printed larger than instructions.
  const ordered = candidates.map((c, i) => {
    const heights = new Map<string, number>();
    for (const t of sheet.texts) if (containsPoint(rings[i], t.x, t.y)) heights.set(t.str, Math.max(heights.get(t.str) ?? 0, t.height));
    return [...c.labels].sort((a, b) => (heights.get(b) ?? 0) - (heights.get(a) ?? 0));
  });
  const printed = new Map<string, number>();
  for (const { material } of ordered.flat().flatMap(instructions)) if (material) printed.set(material, (printed.get(material) ?? 0) + 1);
  const common = [...printed].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_MATERIAL;
  // A fold word belongs to the piece that contains it, or else to the nearest piece within 2 cm.
  const foldTexts = new Map<number, Pt[]>();
  for (const t of sheet.texts.filter(t => FOLD.test(t.str))) {
    const p = textCentre(t), distances = rings.map(r => containsPoint(r, p[0], p[1]) ? 0 : ringDistance(p, r));
    const owner = distances.indexOf(Math.min(...distances));
    if (owner !== -1 && distances[owner] <= NEAR_CM / k) foldTexts.set(owner, [...foldTexts.get(owner) ?? [], p]);
  }
  return candidates.map((c, i) => {
    const parsed = parseCutLabels(ordered[i], common, titles), edges = foldEdges(c, k), near = foldTexts.get(i) ?? [];
    let foldEdge: number | null = null;
    if (near.length && edges.length) {
      const d = edges.map(e => Math.min(...near.map(p => pointSegmentDistance(p, e.a, e.b))));
      foldEdge = d.indexOf(Math.min(...d));
    }
    const line = detectGrain(c, k, sheet), fold = foldEdge === null ? null : edges[foldEdge];
    const grainAngle = line ? axisAngle(line.a, line.b) : fold ? axisAngle(fold.a, fold.b) : 90;
    const include = !(c.labels.length === 0 && area(rings[i]) * k * k < 25) && !tableLike(c.labels);
    return { candidateId: c.id, include, name: parsed.name ?? `Díl ${c.id}`, cut: parsed.cut, foldEdge, grainAngle,
      optional: false, variantGroup: '', variant: '', ...(parsed.hint ? { hint: parsed.hint } : {}) };
  });
}
