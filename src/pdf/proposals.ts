import { AppError } from '../errors';
import { dataDefaults } from '../i18n/data';
import { area, offset, union } from '../geom/polygon';
import type { VariantDraft } from './pieces';
import type { Cell, Pt } from './types';

// Cells under CELL_MIN_CM2 join the neighbour they share the longest border with; only borders of at least
// BORDER_MIN_MM count as adjacency (a shorter touch is a corner or a slit, not a shared line).
export const CELL_MIN_CM2 = 3, BORDER_MIN_MM = 2;

// A cell of at least CELL_MIN_CM2 with the small cells it absorbed (ids from the tracer).
interface Group { ids: number[]; areaPt2: number }
interface Graph { groups: Group[]; adjacent: number[][] }

function cellGraph(cells: Cell[], cmPerPt: number): Graph | null {
  const byId = new Map(cells.map(c => [c.id, c])), owner = new Map<number, number>();
  const groups: Group[] = [];
  for (const cell of cells) if (cell.areaPt2 * cmPerPt ** 2 >= CELL_MIN_CM2) { owner.set(cell.id, groups.length); groups.push({ ids: [cell.id], areaPt2: cell.areaPt2 }); }
  if (!groups.length) return null;
  for (let progress = true; progress;) {
    progress = false;
    for (const cell of cells) {
      if (owner.has(cell.id)) continue;
      let best: number | undefined, longest = 0;
      for (const n of cell.neighbours) if (owner.has(n.id) && n.sharedPt > longest) { best = owner.get(n.id); longest = n.sharedPt; }
      if (best === undefined) continue;
      owner.set(cell.id, best); groups[best].ids.push(cell.id); groups[best].areaPt2 += cell.areaPt2; progress = true;
    }
  }
  const adjacent = groups.map(() => [] as number[]);
  for (const [id, index] of owner) {
    if (groups[index].ids[0] !== id) continue;
    for (const n of byId.get(id)!.neighbours) {
      const other = owner.get(n.id);
      if (other !== undefined && other !== index && groups[other].ids[0] === n.id && n.sharedPt * cmPerPt * 10 >= BORDER_MIN_MM) adjacent[index].push(other);
    }
  }
  return { groups, adjacent };
}

// Ids of the cells by breadth-first distance from the largest cell; null when a cell is not reached.
// With one cell there is a single level.
export function onionLevels(cells: Cell[], cmPerPt: number): number[][] | null {
  const graph = cellGraph(cells, cmPerPt);
  if (!graph) return null;
  const { groups, adjacent } = graph, distance = new Array<number>(groups.length).fill(-1);
  const start = groups.reduce((best, g, i) => g.areaPt2 > groups[best].areaPt2 ? i : best, 0);
  distance[start] = 0;
  const queue = [start], levels: number[][] = [];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    (levels[distance[i]] ??= []).push(...groups[i].ids);
    for (const j of adjacent[i]) if (distance[j] < 0) { distance[j] = distance[i] + 1; queue.push(j); }
  }
  return queue.length === groups.length ? levels : null;
}

// Cell ids in path order, starting at the end with the larger cell; null unless the cells form a path of at
// least two whose start is a large cell (at least START_SHARE of the largest): a large cell in the middle
// with small strips on both sides is a star, not a stack.
const START_SHARE = 0.5;
export function chainOrder(cells: Cell[], cmPerPt: number): number[][] | null {
  const graph = cellGraph(cells, cmPerPt);
  if (!graph || graph.groups.length < 2) return null;
  const { groups, adjacent } = graph, ends = adjacent.flatMap((list, i) => list.length === 1 ? [i] : []);
  if (adjacent.some(list => list.length > 2 || !list.length) || ends.length !== 2) return null;
  let at = groups[ends[0]].areaPt2 >= groups[ends[1]].areaPt2 ? ends[0] : ends[1], before = -1;
  if (groups[at].areaPt2 < START_SHARE * Math.max(...groups.map(g => g.areaPt2))) return null;
  const order = [at];
  while (order.length < groups.length) {
    const next = adjacent[at].find(j => j !== before);
    if (next === undefined || order.includes(next)) return null;
    before = at; at = next; order.push(at);
  }
  return order.map(i => groups[i].ids);
}

// Rings of neighbouring cells run through pixel centres, one pixel apart: growing each by 0.6 pixel makes them
// overlap, and puts the union's edge on the pixel edge, as a traced outline would be. Holes (a pixel left open
// where three cells meet) are filled; parts that stay apart throw.
export function unionCells(rings: Pt[][], cmPerPt: number, pixelMm: number): Pt[] {
  const d = 0.6 * pixelMm / 10 / cmPerPt;
  try { return rings.map(ring => offset(ring, d)).reduce((all, ring) => union(all, ring)); }
  catch { throw new AppError('geom.partsDisconnected'); }
}

// Sizes of one shared style, smallest first: the cumulative unions of the onion levels, or 'single' when the
// piece has only one level (it is the same in every size); null when the levels do not match the sizes.
export function nestedOutlines(cells: Cell[], count: number, cmPerPt: number, pixelMm: number): Pt[][] | 'single' | null {
  const levels = onionLevels(cells, cmPerPt);
  if (!levels) return null;
  if (levels.length === 1) return 'single';
  if (levels.length !== count) return null;
  const ids = new Set<number>(), rings: Pt[][] = [];
  try {
    for (const level of levels) {
      level.forEach(id => ids.add(id));
      const ring = unionCells(cells.filter(c => ids.has(c.id)).map(c => c.ring.slice(0, -1)), cmPerPt, pixelMm);
      rings.push([...ring, [...ring[0]]]);
    }
  } catch { return null; }
  return rings;
}

export const singleCell = (ring: Pt[]): Cell[] => [{ id: 1, ring, areaPt2: area(ring), neighbours: [], touchesOutside: true }];

// Stacked strips: when the cells of every size form a path of the same length, the variants are the prefixes
// of the path from the end with the largest cell. Otherwise none.
export function proposeChain(cells: Record<string, Cell[]> | undefined, sizes: string[], cmPerPt: number): VariantDraft[] {
  if (!cells || !sizes.length || sizes.some(size => !cells[size])) return [];
  const chains = sizes.map(size => chainOrder(cells[size], cmPerPt));
  if (chains.some(chain => !chain || chain.length !== chains[0]!.length)) return [];
  return chains[0]!.map((_, k) => ({ label: `${dataDefaults().option} ${k + 1}`,
    cells: Object.fromEntries(sizes.map((size, s) => [size, chains[s]!.slice(0, k + 1).flat()])) }));
}
