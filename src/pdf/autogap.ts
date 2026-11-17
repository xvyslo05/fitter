import type { TraceResult } from './types';

// If a size yields no closed piece at the start gap, trace again with wider gaps and keep the first that closes.
export const GAP_STEPS_MM = [2, 4, 6];
export interface GapOutcome<T> { result: T; gapMm: number; widened: boolean }

// Every traced size appears in at least one piece. A trace without sizes has nothing to close.
export const allSizesClosed = (result: TraceResult): boolean =>
  result.sizes.every(size => result.candidates.some(candidate => Object.hasOwn(candidate.sizes, size)));

// `trace(gapMm)` runs one trace. When no gap closes everything, the result at `startMm` is returned (widened = false).
export async function autoGap<T>(trace: (gapMm: number) => T | Promise<T>, closed: (result: T) => boolean, startMm: number, steps: readonly number[] = GAP_STEPS_MM): Promise<GapOutcome<T>> {
  const first = await trace(startMm);
  if (closed(first)) return { result: first, gapMm: startMm, widened: false };
  for (const gapMm of steps) {
    if (gapMm <= startMm) continue;
    const result = await trace(gapMm);
    if (closed(result)) return { result, gapMm, widened: true };
  }
  return { result: first, gapMm: startMm, widened: false };
}
