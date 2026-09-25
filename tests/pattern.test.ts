import { describe, expect, it } from 'vitest';
import { demo } from '../src/model/demo';
import { parsePatternFile } from '../src/model/pattern';

describe('parsePatternFile', () => {
  it('accepts library-shaped data with nullable metadata, partial sizes and extra fields', () => {
    const input = {
      ...structuredClone(demo), author: null, notes: null, sizes: ['uni', 'large'], extractorMetadata: { ignored: true },
    };
    const parsed = parsePatternFile(input);
    expect(parsed.pieces[0].sizes.uni.fold).toEqual([[0, 0], [0, 34]]);
    expect(parsed.sizes).toEqual(['uni', 'large']);
    expect(parsed).not.toHaveProperty('extractorMetadata');
    expect(parsed.author).toBeNull();
  });
  it.each([null, [], {}, { ...demo, format: 'other' }, { ...demo, seamAllowance: 'yes' }, { ...demo, sizes: ['uni', 'uni'] }])('rejects invalid top-level input', input => {
    expect(() => parsePatternFile(input)).toThrow(/Střih|Švová|Velikosti/);
  });
  it('rejects invalid geometry, counts, folds, duplicate IDs and missing sizes', () => {
    const mutations = [
      (p: typeof demo) => { p.pieces[0].sizes.uni.outline[0][0] = NaN; },
      (p: typeof demo) => { p.pieces[0].sizes.uni.outline = [[0, 0], [10, 10], [0, 10], [10, 0]]; },
      (p: typeof demo) => { p.pieces[0].cut[0].count = 1.5; },
      (p: typeof demo) => { p.pieces[0].sizes.uni.fold = [[1, 1], [2, 2]]; },
      (p: typeof demo) => { p.pieces[1].id = p.pieces[0].id; },
      (p: typeof demo) => { p.pieces[0].sizes = {}; },
    ];
    for (const mutate of mutations) {
      const input = structuredClone(demo); mutate(input);
      expect(() => parsePatternFile(input)).toThrow(/Díl/);
    }
  });
  it('rejects a fold whose outline leaves the fold line between its endpoints', () => {
    const input = structuredClone(demo);
    // A 2 cm notch into the piece in the middle of the fold edge: endpoints still lie on the outline.
    input.pieces[0].sizes.uni.outline = [[0, 0], [10, 0], [10, 20], [0, 20], [2, 10]];
    input.pieces[0].sizes.uni.fold = [[0, 0], [0, 20]];
    expect(() => parsePatternFile(input)).toThrow(/lom musí ležet/);
  });
  it('rejects the reserved key "__proto__" as pattern, piece, size or material name', () => {
    const mutations = [
      (p: typeof demo) => { p.id = '__proto__'; },
      (p: typeof demo) => { p.pieces[0].id = '__proto__'; },
      (p: typeof demo) => { p.pieces[0].cut[0].material = '__proto__'; },
      (p: typeof demo) => { p.sizes = ['__proto__']; },
    ];
    for (const mutate of mutations) {
      const input = structuredClone(demo); mutate(input);
      expect(() => parsePatternFile(input)).toThrow(/vyhrazený/);
    }
  });
  it('accepts a fold annotation with small extraction rounding error', () => {
    const input = structuredClone(demo);
    input.pieces[0].sizes.uni.fold = [[0.08, 0], [0.08, 34]];
    expect(parsePatternFile(input).pieces[0].sizes.uni.fold).toEqual([[0.08, 0], [0.08, 34]]);
  });
});
