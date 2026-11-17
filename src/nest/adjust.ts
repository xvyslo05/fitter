import { area, bbox, polygonDistance, translate } from '../geom/polygon';
import type { Fabric, NestPiece, NestResult } from './types';

// Manual moves of a finished marker. Pure: the input result is never changed. A placement is moved
// by translating its polygon (and x, y); any other field of the placement (angle, flipY, ...) is kept.
const TOL = 1e-6;
const snap = (v: number) => Math.round(v * 10) / 10; // 1 mm
export type MoveBlock = 'bounds' | 'fold' | 'gap';
export interface MoveOutcome {
  result: NestResult;
  ok: boolean;
  // Keys of the pieces that are too close (reason 'gap').
  blockedBy?: string[];
  reason?: MoveBlock;
  // The move that was tried, snapped to 1 mm (position of the bounding box corner), in cm.
  dx: number;
  dy: number;
}

// Used length, utilisation and the rest of the result after the placements changed.
function recompute(result: NestResult, placements: NestResult['placements'], pieces: NestPiece[], fabric: Fabric): NestResult {
  const width = fabric.width / (fabric.folded ? 2 : 1), areas = new Map(pieces.map(p => [p.key, area(p.polygon)]));
  const usedLength = placements.reduce((m, p) => Math.max(m, bbox(p.polygon).maxY), 0);
  const placedArea = placements.reduce((sum, p) => sum + (areas.get(p.key) ?? 0), 0);
  return { ...result, placements, usedLength, utilization: placedArea / (width * (fabric.length ?? usedLength) || 1) };
}

// Moves piece `key` by (dx, dy) cm. Not ok when the piece would leave the fabric, move off the fold,
// or come closer than `gap` to another piece (bounding boxes first, then the exact distance).
export function tryMove(result: NestResult, pieces: NestPiece[], fabric: Fabric, gap: number, key: string, dx: number, dy: number): MoveOutcome {
  const index = result.placements.findIndex(p => p.key === key);
  const fail = (reason: MoveBlock, ddx = 0, ddy = 0, blockedBy?: string[]): MoveOutcome => ({ result, ok: false, reason, blockedBy, dx: ddx, dy: ddy });
  if (index < 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) return fail('bounds');
  const moving = result.placements[index], piece = pieces.find(p => p.key === key), from = bbox(moving.polygon);
  const sx = Math.abs(dx) < TOL ? 0 : snap(from.minX + dx) - from.minX, sy = Math.abs(dy) < TOL ? 0 : snap(from.minY + dy) - from.minY;
  if (piece?.foldEdge && sx !== 0) return fail('fold', sx, sy);
  const width = fabric.width / (fabric.folded ? 2 : 1);
  // Ordinary pieces on folded fabric keep gap / 2 from the crease, as the nester does.
  const minX = fabric.folded && !piece?.foldEdge ? gap / 2 : 0;
  const polygon = translate(moving.polygon, sx, sy), to = bbox(polygon);
  if (to.minX < minX - TOL || to.maxX > width + TOL || to.minY < -TOL || (fabric.length !== null && to.maxY > fabric.length + TOL)) return fail('bounds', sx, sy);
  const near: string[] = [];
  for (const other of result.placements) {
    if (other.key === key) continue;
    const b = bbox(other.polygon);
    if (b.minX > to.maxX + gap || b.maxX < to.minX - gap || b.minY > to.maxY + gap || b.maxY < to.minY - gap) continue;
    if (polygonDistance(polygon, other.polygon) < gap - TOL) near.push(other.key);
  }
  if (near.length) return fail('gap', sx, sy, near);
  const placements = result.placements.map((p, i) => i === index ? { ...p, x: p.x + sx, y: p.y + sy, polygon } : p);
  return { result: recompute(result, placements, pieces, fabric), ok: true, dx: sx, dy: sy };
}
