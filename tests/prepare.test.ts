import { describe, expect, it } from 'vitest';
import { demo } from '../src/model/demo';
import { defaultSettings, includedPieces, makeOrder, prepare, variantChoice } from '../src/model/prepare';
import { area, bbox, mirrorX } from '../src/geom/polygon';
import type { Fabric } from '../src/nest/types';
import { asymmetricPiece } from './fixtures';

const fabric: Fabric = { width: 150, length: null, folded: false };
const setup = () => ({ pattern: structuredClone(demo), line: makeOrder(demo, 'test-order'), settings: structuredClone(defaultSettings) });

describe('prepare', () => {
  it('multiplies quantities per material, skips optional pieces and picks first variant', () => {
    const { pattern, line, settings } = setup(); line.quantity = 3;
    const output = prepare([pattern], [line], {}, settings);
    expect(output.materials['Vnější látka']).toHaveLength(12);
    expect(output.materials['Podšívka']).toHaveLength(3);
    expect(output.materials['Vnější látka'].some(p => p.label.includes('Poutko'))).toBe(false);
    expect(output.materials['Vnější látka'].some(p => p.label.includes('velká'))).toBe(false);
    line.include = { 'pocket-large': true, tab: true };
    expect(includedPieces(pattern, line).map(p => p.id)).toEqual(['body', 'handle', 'pocket-large', 'tab']);
  });
  it('selects every piece of a variant group that shares the chosen variant label', () => {
    const { pattern, line } = setup();
    const back = { ...structuredClone(pattern.pieces[3]), id: 'pocket-large-back', name: 'Kapsa velká zadní' };
    pattern.pieces.push(back);
    expect(variantChoice(pattern, line, 'Kapsa')).toBe('Malá');
    expect(includedPieces(pattern, line).map(p => p.id)).toEqual(['body', 'handle', 'pocket-small']);
    line.include = { 'pocket-small': false, 'pocket-large': true, 'pocket-large-back': true };
    expect(variantChoice(pattern, line, 'Kapsa')).toBe('Velká');
    expect(includedPieces(pattern, line).map(p => p.id)).toEqual(['body', 'handle', 'pocket-large', 'pocket-large-back']);
    line.include = { 'pocket-small': false, 'pocket-large': false, 'pocket-large-back': false };
    expect(variantChoice(pattern, line, 'Kapsa')).toBeNull();
    expect(includedPieces(pattern, line).map(p => p.id)).toEqual(['body', 'handle']);
  });
  it('only includes pieces available in the selected size', () => {
    const { pattern, line } = setup();
    pattern.sizes.push('other'); line.size = 'other';
    pattern.pieces[3].sizes.other = pattern.pieces[3].sizes.uni;
    expect(includedPieces(pattern, line).map(p => p.id)).toEqual(['pocket-large']);
  });
  it('unfolds on flat fabric and preserves single-copy handedness across garments', () => {
    const { pattern, line, settings } = setup(); line.quantity = 2; settings.seamAmount = 0;
    const output = prepare([pattern], [line], {}, settings);
    const bodies = output.materials['Vnější látka'].filter(p => p.label.includes('Tělo'));
    expect(area(bodies[0].polygon)).toBeCloseTo(area(pattern.pieces[0].sizes.uni.outline) * 2);
    expect(bodies[1].polygon).toEqual(bodies[0].polygon);
    expect(output.mirroredKeys).not.toContain(bodies[1].key);
  });
  it.each([
    { count: 1, mirroredPairs: true, mirrored: [false, false] },
    { count: 2, mirroredPairs: true, mirrored: [false, true, false, true] },
    { count: 3, mirroredPairs: true, mirrored: [false, true, false, false, true, false] },
    { count: 2, mirroredPairs: false, mirrored: [false, false, false, false] },
  ])('mirrors within each garment for count $count × quantity 2, mirroredPairs $mirroredPairs', ({ count, mirroredPairs, mirrored }) => {
    const { pattern, line, settings } = setup(); line.quantity = 2; settings.seamAmount = 0;
    pattern.pieces = [asymmetricPiece(count)]; settings.mirroredPairs = mirroredPairs;
    const output = prepare([pattern], [line], {}, settings);
    const pieces = output.materials['Vnější látka'], original = pattern.pieces[0].sizes.uni.outline;
    expect(pieces.map(p => p.polygon)).toEqual(mirrored.map(value => value ? mirrorX(original) : original));
    expect(output.mirroredKeys).toEqual(pieces.filter((_, i) => mirrored[i]).map(p => p.key));
    expect(new Set(pieces.map(p => p.key)).size).toBe(count * line.quantity);
  });
  it.each([
    { count: 1, quantity: 2, mirroredPairs: true, placements: 2, surplus: '2 kusy' },
    { count: 2, quantity: 3, mirroredPairs: true, placements: 3, surplus: null },
    { count: 1, quantity: 1, mirroredPairs: true, placements: 1, surplus: '1 kus' },
    { count: 1, quantity: 5, mirroredPairs: true, placements: 5, surplus: '5 kusů' },
    { count: 2, quantity: 3, mirroredPairs: false, placements: 6, surplus: '6 kusů' },
    { count: 3, quantity: 2, mirroredPairs: true, placements: 4, surplus: '2 kusy' },
  ])('preserves folded handedness for count $count × quantity $quantity, mirroredPairs $mirroredPairs', ({ count, quantity, mirroredPairs, placements, surplus }) => {
    const { pattern, line, settings } = setup(); line.quantity = quantity; settings.seamAmount = 0;
    pattern.pieces = [asymmetricPiece(count)]; settings.mirroredPairs = mirroredPairs;
    const output = prepare([pattern], [line], { 'Vnější látka': { ...fabric, folded: true } }, settings);
    const pieces = output.materials['Vnější látka'];
    expect(pieces).toHaveLength(placements);
    expect(pieces.every(p => !p.foldEdge)).toBe(true);
    for (const piece of pieces) expect(piece.polygon).toEqual(pattern.pieces[0].sizes.uni.outline);
    expect(output.mirroredKeys).toEqual([]);
    expect(new Set(pieces.map(p => p.key)).size).toBe(placements);
    expect(output.notes).toEqual(surplus ? [`${pattern.name} · Asymetrický díl (Vnější látka): vystřihne se ${surplus} navíc (zrcadlově).`] : []);
  });
  it('keeps fold halves, pairs ordinary placements per garment, and reports mirrored extras', () => {
    const { pattern, line, settings } = setup(); line.quantity = 3;
    const output = prepare([pattern], [line], { 'Vnější látka': { ...fabric, folded: true } }, settings);
    const pieces = output.materials['Vnější látka'];
    expect(pieces.filter(p => p.foldEdge)).toHaveLength(3);
    expect(pieces.filter(p => p.label.includes('Ucho'))).toHaveLength(3);
    expect(pieces.filter(p => p.label.includes('Kapsa'))).toHaveLength(3);
    expect(output.notes).toEqual([`${pattern.name} · Kapsa malá (Vnější látka): vystřihne se 3 kusy navíc (zrcadlově).`]);
    expect(output.mirroredKeys.filter(key => pieces.some(p => p.key === key))).toHaveLength(0);
    expect(bbox(pieces[0].polygon).minX).toBe(0);
    expect(bbox(pieces[0].polygon).width).toBeLessThan(25);
  });
  it('keeps one folded placement per fold copy in each garment', () => {
    const { pattern, line, settings } = setup(); line.quantity = 3;
    pattern.pieces = [pattern.pieces[0]];
    pattern.pieces[0].cut = [{ material: 'Vnější látka', count: 2 }];
    const output = prepare([pattern], [line], { 'Vnější látka': { ...fabric, folded: true } }, settings);
    expect(output.materials['Vnější látka']).toHaveLength(6);
    expect(output.materials['Vnější látka'].every(p => p.foldEdge)).toBe(true);
    expect(output.notes).toEqual([]);
  });
  it('unfolds a nonvertical fold even on folded fabric', () => {
    const { pattern, line, settings } = setup();
    pattern.pieces[0].sizes.uni.fold = [[0, 0], [18, 0]];
    const output = prepare([pattern], [line], { 'Vnější látka': { ...fabric, folded: true } }, settings);
    expect(output.materials['Vnější látka'][0].foldEdge).toBe(false);
    expect(output.notes.join(' ')).toContain('lom není svislý');
  });
  it('honors per-piece seam status, explicit pattern toggle and rotation override', () => {
    const { pattern, line, settings } = setup();
    pattern.seamAllowance = 'included';
    pattern.pieces[0].seamAllowance = 'mixed';
    pattern.pieces[1].seamAllowance = 'none';
    pattern.pieces[2].seamAllowance = 'unknown';
    line.rotations.handle = 'none';
    let output = prepare([pattern], [line], {}, settings);
    const handle = output.materials['Vnější látka'].find(p => p.label.includes('Ucho'))!;
    expect(bbox(handle.polygon).width).toBeCloseTo(9);
    expect(handle.rotation).toBe('none');
    expect(output.notes).toEqual([`${pattern.name}: švová záložka není jednoznačná; ověřte ji podle střihu.`]);
    settings.addSeam[pattern.id] = false;
    output = prepare([pattern], [line], {}, settings);
    expect(bbox(output.materials['Vnější látka'].find(p => p.label.includes('Ucho'))!.polygon).width).toBeCloseTo(7);
  });
  it('treats dictionary-like IDs as data and rejects invalid seam amounts', () => {
    const { pattern, line, settings } = setup();
    pattern.id = 'constructor'; line.patternId = pattern.id;
    pattern.pieces[1].id = '__proto__';
    pattern.pieces[1].cut = [{ material: '__proto__', count: 2 }];
    const output = prepare([pattern], [line], {}, settings);
    expect(output.materials['__proto__']).toHaveLength(2);
    expect(output.materials['__proto__'][0].rotation).toBe('180');
    expect(bbox(output.materials['__proto__'][0].polygon).width).toBeCloseTo(9);
    expect(() => prepare([pattern], [line], {}, { ...settings, seamAmount: NaN })).toThrow(/záložka/);
  });
});
