import { intersectionArea } from '../geom/polygon';
import type { Cell } from './types';

// Cell ids of `otherCells` matching the selected reference cells: for each selected cell the one sharing the
// most area with it, provided that is at least half of the smaller cell (the rule groupPieces uses for
// outlines). A cell without such a match maps to nothing.
export function mapCells(refCells: Cell[], otherCells: Cell[], ids: number[]): number[] {
  const mapped = new Set<number>();
  for (const id of ids) {
    const ref = refCells.find(c => c.id === id);
    if (!ref) continue;
    let best = 0, bestArea = 0;
    for (const cell of otherCells) {
      const shared = intersectionArea(ref.ring, cell.ring);
      if (shared > bestArea && shared * 2 >= Math.min(ref.areaPt2, cell.areaPt2)) { best = cell.id; bestArea = shared; }
    }
    if (best) mapped.add(best);
  }
  return [...mapped];
}

// The selected cells form one connected group (neighbours share a border). Unknown ids are ignored.
export function isConnected(cells: Cell[], ids: number[]): boolean {
  const selected = new Set(ids.filter(id => cells.some(c => c.id === id)));
  if (selected.size < 2) return true;
  const seen = new Set<number>(), stack = [[...selected][0]];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const n of cells.find(c => c.id === id)?.neighbours ?? []) if (selected.has(n.id) && n.sharedPt > 0 && !seen.has(n.id)) stack.push(n.id);
  }
  return seen.size === selected.size;
}

// Cells smaller than `minAreaPt2` follow the neighbour they share the longest border with (repeatedly) until a
// large cell is reached. Maps every cell id to the id of the cell the user can tap; a cell that is large, has
// no neighbour or sits in a ring of small cells is its own owner.
export function cellOwners(cells: Cell[], minAreaPt2: number): Map<number, number> {
  const byId = new Map(cells.map(c => [c.id, c]));
  const owners = new Map<number, number>();
  for (const cell of cells) {
    const seen = new Set<number>([cell.id]);
    let current = cell;
    while (current.areaPt2 < minAreaPt2) {
      const next = [...current.neighbours].sort((a, b) => b.sharedPt - a.sharedPt).find(n => byId.has(n.id) && !seen.has(n.id));
      if (!next) break;
      seen.add(next.id);
      current = byId.get(next.id)!;
    }
    owners.set(cell.id, current.id);
  }
  return owners;
}
