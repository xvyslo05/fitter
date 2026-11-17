import { describe, expect, it } from 'vitest';
import { allSizesClosed, autoGap } from '../src/pdf/autogap';
import type { TraceResult } from '../src/pdf/types';

const result = (sizes: string[], closedSizes: string[]): TraceResult => ({ cmPerPt: 1, sizes, candidates: closedSizes.length ? [{ id: 1, refSize: closedSizes[0], sizes: Object.fromEntries(closedSizes.map(s => [s, []])), labels: [] }] : [] });

describe('autoGap', () => {
  // A fake tracer: pieces close only from 4 mm.
  const fake = (closesAt: number) => { const calls: number[] = []; return { calls, trace: (gap: number) => { calls.push(gap); return result(['S', 'M'], gap >= closesAt ? ['S', 'M'] : ['S']); } }; };

  it('returns 4 and the note flag when only 4 mm closes', async () => {
    const { calls, trace } = fake(4);
    expect(await autoGap(trace, allSizesClosed, 1)).toMatchObject({ gapMm: 4, widened: true });
    expect(calls).toEqual([1, 2, 4]);
  });
  it('keeps the start gap and no flag when it already closes', async () => {
    const { calls, trace } = fake(0);
    expect(await autoGap(trace, allSizesClosed, 1)).toMatchObject({ gapMm: 1, widened: false });
    expect(calls).toEqual([1]);
  });
  it('gives the first result and no flag when no gap closes', async () => {
    const { calls, trace } = fake(99);
    const outcome = await autoGap(trace, allSizesClosed, 1);
    expect(outcome).toMatchObject({ gapMm: 1, widened: false });
    expect(outcome.result.candidates[0].sizes).not.toHaveProperty('M');
    expect(calls).toEqual([1, 2, 4, 6]);
  });
  it('only widens beyond the start gap and accepts an async tracer', async () => {
    const calls: number[] = [];
    const outcome = await autoGap(async gap => { calls.push(gap); return result(['S'], gap >= 6 ? ['S'] : []); }, allSizesClosed, 3);
    expect(outcome).toMatchObject({ gapMm: 6, widened: true });
    expect(calls).toEqual([3, 4, 6]);
  });
});

describe('allSizesClosed', () => {
  it('needs every traced size in some piece', () => {
    expect(allSizesClosed(result(['S', 'M'], ['S', 'M']))).toBe(true);
    expect(allSizesClosed(result(['S', 'M'], ['S']))).toBe(false);
    expect(allSizesClosed(result(['S'], []))).toBe(false);
    expect(allSizesClosed(result([], []))).toBe(true);
  });
});
