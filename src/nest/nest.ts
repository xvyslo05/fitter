import { area, bbox, translate } from '../geom/polygon';
import { mergeSpans, orientations } from './raster';
import type { Raster, Span } from './raster';
import type { Fabric, NestOptions, NestPiece, NestResult, Placement } from './types';
export type { Fabric, NestOptions, NestPiece, NestResult, Placement, Rotation } from './types';

function validate(pieces: NestPiece[], fabric: Fabric, opts: NestOptions) {
  if (!Number.isFinite(fabric.width) || fabric.width <= 0 || fabric.width > 1000 ||
      (fabric.length !== null && (!Number.isFinite(fabric.length) || fabric.length <= 0 || fabric.length > 10_000)))
    throw new Error('Šířka látky musí být 0–1 000 cm a délka kusu 0–10 000 cm (bez nuly).');
  if (!Number.isFinite(opts.resolution) || opts.resolution < 0.25 || opts.resolution > 1 ||
      !Number.isFinite(opts.gap) || opts.gap < 0 || opts.gap > 10 ||
      !Number.isFinite(opts.timeMs) || opts.timeMs < 0 || opts.timeMs > 60_000 || !Number.isFinite(opts.seed))
    throw new Error('Neplatné nastavení: krok 0,25–1 cm, mezera 0–10 cm, čas 0–60 s.');
  if (new Set(pieces.map(p => p.key)).size !== pieces.length) throw new Error('Klíče dílů musí být jedinečné.');
  if (pieces.length > 500) throw new Error('Najednou lze umístit nejvýše 500 dílů.');
  for (const p of pieces) {
    const b = bbox(p.polygon);
    if (p.polygon.length < 3 || p.polygon.some(v => v.some(n => !Number.isFinite(n))) || area(p.polygon) <= 0 ||
        b.width > 10_000 || b.height > 10_000 || !['none', '180', '90'].includes(p.rotation))
      throw new Error('Díl má neplatný obrys, rozměr nebo otáčení.');
    if (p.foldEdge && !fabric.folded) throw new Error('Díl na lomu vyžaduje složenou látku.');
  }
}

function collisionJump(board: Map<number, Span[]>, raster: Raster, x: number, y: number): number {
  for (const row of raster.rows) {
    const occupied = board.get(y + row.y);
    if (!occupied) continue;
    for (const [start, end] of row.spans) {
      for (const [a, b] of occupied) {
        if (a >= x + end) break;
        if (b > x + start) return b - start;
      }
    }
  }
  return x;
}
function placePass(pieces: NestPiece[], fabric: Fabric, opts: NestOptions, rasters: Raster[][], order: number[], orient?: number[]): NestResult {
  const board = new Map<number, Span[]>(), placements: Placement[] = [], unplaced: string[] = [];
  const width = fabric.width / (fabric.folded ? 2 : 1), step = opts.resolution;
  // boardBottom: first raster row below every occupied cell.
  let usedLength = 0, placedArea = 0, boardBottom = 0;
  for (const index of order) {
    const piece = pieces[index], variants = rasters[index];
    let best: { x: number; y: number; raster: Raster } | undefined;
    for (let n = 0; n < variants.length; n++) {
      const raster = variants[((orient?.[index] ?? 0) + n) % variants.length];
      if (raster.width > width + 1e-8 || (fabric.length !== null && raster.height > fabric.length + 1e-8)) continue;
      // Ordinary pieces on folded fabric keep their inflated cells right of the fold,
      // i.e. at least gap / 2 from the crease and a full gap from their mirrored copy.
      const minX = fabric.folded && !piece.foldEdge ? -raster.left : 0;
      const maxX = piece.foldEdge ? 0 : Math.floor((width - raster.width + 1e-8) / step);
      // On a roll, starting the piece's top row at boardBottom is always free.
      const lastY = fabric.length === null ? Math.max(0, boardBottom - raster.top) : Math.floor((fabric.length - raster.height + 1e-8) / step);
      const maxY = Math.min(lastY, best?.y ?? Infinity);
      search: for (let y = 0; y <= maxY; y++) {
        for (let x = minX; x <= maxX;) {
          const next = collisionJump(board, raster, x, y);
          if (next === x) {
            if (!best || y < best.y || (y === best.y && x < best.x)) best = { x, y, raster };
            break search;
          }
          x = next;
        }
      }
      if (best?.x === 0 && best.y === 0) break;
    }
    if (!best) { unplaced.push(piece.key); continue; }
    const { x, y, raster } = best;
    for (const row of raster.rows) {
      const key = y + row.y;
      board.set(key, mergeSpans([...(board.get(key) ?? []), ...row.spans.map(([a, b]): Span => [a + x, b + x])]));
    }
    placements.push({ key: piece.key, x: x * step, y: y * step, angle: raster.angle, flipY: raster.flipY,
      polygon: translate(raster.polygon, x * step, y * step) });
    usedLength = Math.max(usedLength, y * step + raster.height);
    if (raster.rows.length) boardBottom = Math.max(boardBottom, y + raster.rows[raster.rows.length - 1].y + 1);
    placedArea += area(piece.polygon);
  }
  return { placements, unplaced, usedLength, utilization: placedArea / (width * (fabric.length ?? usedLength) || 1), iterations: 1 };
}
const initialOrder = (pieces: NestPiece[]) => pieces.map((_, i) => i).sort((a, b) => area(pieces[b].polygon) - area(pieces[a].polygon));

export function nestOnce(pieces: NestPiece[], fabric: Fabric, opts: NestOptions, order?: number[], orient?: number[]): NestResult {
  validate(pieces, fabric, opts);
  if (order && (order.length !== pieces.length || new Set(order).size !== pieces.length || order.some(i => !Number.isInteger(i) || i < 0 || i >= pieces.length)))
    throw new Error('Pořadí musí obsahovat každý díl právě jednou.');
  if (orient && orient.some(i => !Number.isInteger(i) || i < 0)) throw new Error('Neplatná volba otočení.');
  return placePass(pieces, fabric, opts, pieces.map(p => orientations(p, opts.gap, opts.resolution)), order ?? initialOrder(pieces), orient);
}
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function nest(pieces: NestPiece[], fabric: Fabric, opts: NestOptions, onProgress?: (best: NestResult) => void, shouldStop?: () => boolean): NestResult {
  validate(pieces, fabric, opts);
  const started = performance.now(), random = seededRandom(opts.seed);
  const rasters = pieces.map(p => orientations(p, opts.gap, opts.resolution));
  const areas = new Map(pieces.map(p => [p.key, area(p.polygon)]));
  let order = initialOrder(pieces), orient = pieces.map(() => 0);
  let best = placePass(pieces, fabric, opts, rasters, order, orient), iterations = 1;
  onProgress?.(best);
  const score = (r: NestResult) => [r.unplaced.length, r.unplaced.reduce((sum, key) => sum + (areas.get(key) ?? 0), 0), r.usedLength];
  const better = (a: NestResult, b: NestResult) => {
    const sa = score(a), sb = score(b);
    for (let i = 0; i < sa.length; i++) if (Math.abs(sa[i] - sb[i]) > 1e-8) return sa[i] < sb[i];
    return false;
  };
  while (pieces.length > 0 && performance.now() - started < opts.timeMs && !shouldStop?.()) {
    let candidateOrder = [...order];
    const candidateOrient = [...orient];
    if (iterations < 3) {
      const dimension = iterations === 1 ? 'height' : 'width';
      candidateOrder.sort((a, b) => bbox(pieces[b].polygon)[dimension] - bbox(pieces[a].polygon)[dimension]);
    } else {
      const a = Math.floor(random() * pieces.length), b = Math.floor(random() * pieces.length);
      [candidateOrder[a], candidateOrder[b]] = [candidateOrder[b], candidateOrder[a]];
      candidateOrient[a] = Math.floor(random() * rasters[a].length);
      if (iterations % 20 === 0) {
        candidateOrder = [...order];
        for (let i = candidateOrder.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [candidateOrder[i], candidateOrder[j]] = [candidateOrder[j], candidateOrder[i]];
        }
      }
    }
    const result = placePass(pieces, fabric, opts, rasters, candidateOrder, candidateOrient);
    iterations++;
    if (better(result, best)) {
      best = { ...result, iterations }; order = candidateOrder; orient = candidateOrient;
      onProgress?.(best);
    }
  }
  return { ...best, iterations };
}
