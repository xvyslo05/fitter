import { describe, expect, it } from 'vitest';
import { cellOwners, isConnected, mapCells } from '../src/pdf/variants';
import { draftProblems } from '../src/ui/PdfPieces';
import type { PieceDraft } from '../src/pdf/pieces';
import type { Cell, PieceCandidate, Pt } from '../src/pdf/types';

// A stack of rectangles one above another, `scale` times larger about the origin; shared borders are 100 long.
function stack(heights: number[], scale = 1): Cell[] {
  let y = 0;
  return heights.map((h, i) => {
    const ring: Pt[] = [[0, y * scale], [100 * scale, y * scale], [100 * scale, (y + h) * scale], [0, (y + h) * scale]];
    y += h;
    return { id: i + 1, ring, areaPt2: 100 * h * scale * scale, touchesOutside: true,
      neighbours: [...(i > 0 ? [{ id: i, sharedPt: 100 }] : []), ...(i < heights.length - 1 ? [{ id: i + 2, sharedPt: 100 }] : [])] };
  });
}

describe('mapCells', () => {
  const ref = stack([50, 50, 50]), other = stack([50, 50, 50], 1.1);
  it('maps three stacked cells 1:1 in a size 10 % larger', () => {
    expect(mapCells(ref, other, [1])).toEqual([1]);
    expect(mapCells(ref, other, [2, 3])).toEqual([2, 3]);
    expect(mapCells(ref, other, [1, 2, 3])).toEqual([1, 2, 3]);
  });
  it('maps a cell missing in the other size to nothing', () => {
    expect(mapCells(ref, other.slice(0, 2), [3])).toEqual([]);
    expect(mapCells(ref, other.slice(0, 2), [1, 3])).toEqual([1]);
  });
  it('ignores unknown ids and merges cells that map to one', () => {
    expect(mapCells(ref, other, [9])).toEqual([]);
    expect(mapCells(ref, [other[0], { ...other[1], id: 7 }], [2, 3])).toEqual([7]);
  });
});

describe('isConnected', () => {
  const cells = stack([50, 50, 50]);
  it('is true for neighbours and false across a gap', () => {
    expect(isConnected(cells, [1, 2])).toBe(true);
    expect(isConnected(cells, [1, 3])).toBe(false);
    expect(isConnected(cells, [1, 2, 3])).toBe(true);
  });
  it('is true for no or one cell', () => {
    expect(isConnected(cells, [])).toBe(true);
    expect(isConnected(cells, [2])).toBe(true);
  });
});

describe('cellOwners', () => {
  it('makes small cells follow the neighbour with the longest border', () => {
    const cells = stack([50, 2, 50]);
    cells[1].neighbours = [{ id: 1, sharedPt: 30 }, { id: 3, sharedPt: 100 }];
    const owners = cellOwners(cells, 1000);
    expect([...owners]).toEqual([[1, 1], [2, 3], [3, 3]]);
  });
  it('keeps a lone small cell as its own owner', () => {
    expect(cellOwners([{ ...stack([2])[0], neighbours: [] }], 1000).get(1)).toBe(1);
  });
});

describe('draftProblems with variants', () => {
  const cells = stack([50, 50, 50]);
  const candidate: PieceCandidate = { id: 1, refSize: 'L', sizes: { L: [] }, cells: { L: cells }, labels: [] };
  const draft = (variants: PieceDraft['variants']): PieceDraft => ({ candidateId: 1, include: true, name: 'Rukáv', cut: [{ material: 'hlavní', count: 2 }],
    foldEdge: null, grainAngle: 90, optional: false, variantGroup: '', variant: '', variants });
  const pick = (label: string, ids: number[]) => ({ label, cells: { L: ids } });
  it('accepts named, distinct, connected variants', () => {
    expect(draftProblems(draft([pick('krátký', [1]), pick('dlouhý', [1, 2, 3])]), candidate)).toEqual([]);
  });
  it('reports an empty name, a duplicate name, an empty selection and a disconnected selection', () => {
    expect(draftProblems(draft([pick(' ', [1])]), candidate)).toEqual(['Pojmenujte každou možnost dílu.']);
    expect(draftProblems(draft([pick('Krátký', [1]), pick('krátký ', [2])]), candidate)).toEqual(['Názvy možností dílu se nesmí opakovat.']);
    expect(draftProblems(draft([pick('a', [])]), candidate)).toEqual(['Možnost „a“ nemá vybrané části.']);
    expect(draftProblems(draft([pick('a', [1, 3])]), candidate)).toEqual(['Možnost „a“: Vybrané části na sebe nenavazují.']);
  });
  it('skips the connection check without cells', () => {
    expect(draftProblems(draft([pick('a', [1, 3])]))).toEqual([]);
  });
});
