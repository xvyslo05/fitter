import type { Fabric, NestResult } from '../nest/types';

// Fabric is sold by the 5 cm; the length to buy is the used length rounded up to it (screen and print).
export const BUY_ROUNDING_CM = 5;
export const lengthToBuy = (usedCm: number): number => Math.max(0, Math.ceil(usedCm / BUY_ROUNDING_CM - 1e-9)) * BUY_ROUNDING_CM;

const num = (n: number, digits: number) => String(Math.round(n * 10 ** digits) / 10 ** digits).replace('.', ',');
const cm = (n: number) => num(n, 1);
const metres = (n: number) => (Math.round(n) / 100).toFixed(2).replace('.', ',');
// "1 díl", "2 díly", "5 dílů" with the verb agreeing: one / two to four / five and more.
function countPieces(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? 'díl' : n < 5 ? 'díly' : 'dílů'} ${n === 1 ? one : n < 5 ? few : many}`;
}

export interface FabricSummary { text: string; exact?: string }
// One sentence per material for the "Kolik látky koupit" box; `result` is null while it is still being computed.
// Returns null when there is nothing to say (no pieces).
export function fabricSummary(material: string, fabric: Fabric, result: NestResult | null, pieceCount: number): FabricSummary | null {
  if (!result) return pieceCount ? { text: `${material}: počítám…` } : null;
  if (!pieceCount && !result.placements.length && !result.unplaced.length && !result.usedLength) return null;
  const missed = result.unplaced.length;
  if (fabric.length === null) {
    if (missed) return { text: `${material}: ${countPieces(missed, 'je širší', 'jsou širší', 'je širších')} než látka. Zkuste širší látku${fabric.folded ? ' nebo látku nesloženou' : ''}.` };
    return {
      text: `${material}: kupte alespoň ${metres(lengthToBuy(result.usedLength))} m při šíři ${cm(fabric.width)} cm.${fabric.folded ? ' Počítáno pro látku složenou napůl.' : ''}`,
      exact: `Přesně vychází ${cm(result.usedLength)} cm.`,
    };
  }
  if (missed) return { text: `${material}: nevejde se. ${countPieces(missed, 'zůstal', 'zůstaly', 'zůstalo')} mimo, potřebujete delší kus.` };
  return { text: `${material}: vejde se. Z kusu ${cm(fabric.length)} cm zbyde asi ${cm(Math.max(0, Math.floor(fabric.length - result.usedLength)))} cm.` };
}
// Printed under the box, always.
export const SHRINKAGE_NOTE = 'Počítejte s rezervou na srážení látky.';
