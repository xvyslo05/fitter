import { describe, expect, it } from 'vitest';
import { describe as text } from '../src/i18n';
import { fabricSummary, lengthToBuy, placedSentence } from '../src/model/summary';
import type { Fabric, NestResult } from '../src/nest/types';

const result = (usedLength: number, unplaced: string[] = [], placed = 4): NestResult => ({
  placements: Array.from({ length: placed }, (_, i) => ({ key: `p${i}`, x: 0, y: 0, angle: 0 as const, flipY: false, tilt: 0, polygon: [] })),
  unplaced, usedLength, utilization: 0.7, iterations: 10,
});
const role: Fabric = { width: 140, length: null, folded: false };

describe('lengthToBuy', () => {
  it('rounds up to 5 cm and keeps exact multiples', () => {
    expect(lengthToBuy(141.3)).toBe(145);
    expect(lengthToBuy(140)).toBe(140);
    expect(lengthToBuy(140.0000000001)).toBe(140);
    expect(lengthToBuy(140.1)).toBe(145);
    expect(lengthToBuy(0)).toBe(0);
  });
});
describe('fabricSummary', () => {
  it('roll: length to buy, width and exact value', () => {
    const s = fabricSummary('Hlavní látka', role, result(141.3), 4)!;
    expect(text(s.text)).toBe('Hlavní látka: kupte alespoň 1,45 m při šíři 140 cm.');
    expect(text(s.exact!)).toBe('Přesně vychází 141,3 cm.');
    expect(s.text).toEqual({ code: 'summary.buy', params: { material: 'Hlavní látka', metres: 1.45, width: 140 } });
  });
  it('roll on an exact multiple does not round up and keeps two decimals', () => {
    expect(text(fabricSummary('A', role, result(140), 4)!.text)).toContain('1,40 m');
    expect(text(fabricSummary('A', role, result(150), 4)!.text)).toContain('1,50 m');
  });
  it('folded roll states the unfolded width and the fold', () => {
    const s = fabricSummary('Podšívka', { ...role, folded: true }, result(60), 4)!;
    expect(text(s.text)).toContain('0,60 m');
    expect(text(s.text)).toContain('140 cm');
    expect(text(s.text)).toContain('složenou napůl');
  });
  it('roll with pieces wider than the fabric', () => {
    expect(text(fabricSummary('A', role, result(50, ['a']), 5)!.text)).toBe('A: 1 díl je širší než látka. Zkuste širší látku.');
    expect(text(fabricSummary('A', role, result(50, ['a', 'b']), 5)!.text)).toContain('2 díly jsou širší');
    expect(text(fabricSummary('A', { ...role, folded: true }, result(50, ['a', 'b', 'c', 'd', 'e']), 6)!.text)).toBe('A: 5 dílů je širších než látka. Zkuste širší látku nebo látku nesloženou.');
  });
  it('fixed piece that fits says how much is left', () => {
    const s = fabricSummary('A', { ...role, length: 200 }, result(141.3), 4)!;
    expect(text(s.text)).toBe('A: vejde se. Z kusu 200 cm zbyde asi 58 cm.');
  });
  it('fixed piece with unplaced pieces uses the right plural', () => {
    const fixed = { ...role, length: 100 };
    expect(text(fabricSummary('A', fixed, result(100, ['a']), 5)!.text)).toBe('A: nevejde se. 1 díl zůstal mimo, potřebujete delší kus.');
    expect(text(fabricSummary('A', fixed, result(100, ['a', 'b', 'c']), 5)!.text)).toContain('3 díly zůstaly mimo');
    expect(text(fabricSummary('A', fixed, result(100, Array(5).fill('a')), 8)!.text)).toContain('5 dílů zůstalo mimo');
  });
  it('still computing, or nothing to say', () => {
    expect(text(fabricSummary('A', role, null, 3)!.text)).toBe('A: počítám…');
    expect(fabricSummary('A', role, null, 0)).toBeNull();
    expect(fabricSummary('A', role, result(0, [], 0), 0)).toBeNull();
  });
});

describe('placedSentence', () => {
  it('says all pieces fit, with the right noun form', () => {
    expect(text(placedSentence(12, 12))).toBe('všech 12 dílů');
    expect(text(placedSentence(3, 3))).toBe('všech 3 díly');
    expect(text(placedSentence(1, 1))).toBe('1 díl');
  });
  it('says how many did not fit, with the right verb form', () => {
    expect(text(placedSentence(10, 12))).toBe('10 z 12 dílů, 2 se nevešly');
    expect(text(placedSentence(11, 12))).toBe('11 z 12 dílů, 1 se nevešel');
    expect(text(placedSentence(7, 12))).toBe('7 z 12 dílů, 5 se nevešlo');
  });
});
