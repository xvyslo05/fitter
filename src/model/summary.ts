import { note } from '../errors';
import type { Note } from '../errors';
import type { Fabric, NestResult } from '../nest/types';

// Fabric is sold by the 5 cm; the length to buy is the used length rounded up to it (screen and print).
export const BUY_ROUNDING_CM = 5;
export const lengthToBuy = (usedCm: number): number => Math.max(0, Math.ceil(usedCm / BUY_ROUNDING_CM - 1e-9)) * BUY_ROUNDING_CM;

// Numbers go to the dictionary rounded as shown; the text formats them (decimal separator, digits).
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
const metres = (n: number) => Math.round(n) / 100;

export interface FabricSummary { text: Note; exact?: Note }
// One sentence per material for the "Kolik látky koupit" box; `result` is null while it is still being computed.
// Returns null when there is nothing to say (no pieces).
export function fabricSummary(material: string, fabric: Fabric, result: NestResult | null, pieceCount: number): FabricSummary | null {
  if (!result) return pieceCount ? { text: note('summary.computing', { material }) } : null;
  if (!pieceCount && !result.placements.length && !result.unplaced.length && !result.usedLength) return null;
  const missed = result.unplaced.length;
  if (fabric.length === null) {
    if (missed) return { text: note(fabric.folded ? 'summary.tooWideFolded' : 'summary.tooWide', { material, n: missed }) };
    return {
      text: note(fabric.folded ? 'summary.buyFolded' : 'summary.buy', { material, metres: metres(lengthToBuy(result.usedLength)), width: round(fabric.width, 1) }),
      exact: note('summary.exact', { length: round(result.usedLength, 1) }),
    };
  }
  if (missed) return { text: note('summary.noFit', { material, n: missed }) };
  return { text: note('summary.fits', { material, length: round(fabric.length, 1), left: round(Math.max(0, Math.floor(fabric.length - result.usedLength)), 1) }) };
}
// Printed under the box, always.
export const SHRINKAGE_NOTE: Note = note('summary.shrinkage');
// Result card line replacing the "12 / 12 umístěno" badge: "všech 12 dílů" or "10 z 12 dílů, 2 se nevešly".
export function placedSentence(placed: number, total: number): Note {
  const missed = total - placed;
  if (missed <= 0) return note('summary.placedAll', { n: total });
  return note('summary.placedPartial', { placed, pieces: note('summary.pieces', { n: total }), missed: note('summary.didNotFit', { n: missed }) });
}
