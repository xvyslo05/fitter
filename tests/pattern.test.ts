import { describe, expect, it } from 'vitest';
import { describe as text } from '../src/i18n';
import { demo, demoPattern } from '../src/model/demo';
import { parsePatternFile } from '../src/model/pattern';
import { caught } from './fixtures';

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
  it.each([
    [null, 'pattern.expectedObject', { field: 'pattern' }], [[], 'pattern.expectedObject', { field: 'pattern' }],
    [{}, 'pattern.format', { field: 'pattern' }], [{ ...demo, format: 'other' }, 'pattern.format', { field: 'pattern' }],
    [{ ...demo, seamAllowance: 'yes' }, 'pattern.seamInvalid', { field: 'seamAllowance' }],
    [{ ...demo, sizes: ['uni', 'uni'] }, 'pattern.duplicateSize', { field: 'sizes' }],
  ])('rejects invalid top-level input', (input, code, params) => {
    const error = caught(() => parsePatternFile(input));
    expect(error.code).toBe(code);
    expect(error.params).toEqual(params);
  });
  it('rejects invalid geometry, counts, folds, duplicate IDs and missing sizes', () => {
    const mutations: [(p: typeof demo) => void, string, Record<string, unknown>][] = [
      [p => { p.pieces[0].sizes.uni.outline[0][0] = NaN; }, 'pattern.expectedNumber', { piece: 1, size: 'uni', sub: 'outline[0]' }],
      [p => { p.pieces[0].sizes.uni.outline = [[0, 0], [10, 10], [0, 10], [10, 0]]; }, 'pattern.outlineInvalid', { piece: 1, size: 'uni' }],
      [p => { p.pieces[0].cut[0].count = 1.5; }, 'pattern.copyCount', { piece: 1 }],
      [p => { p.pieces[0].sizes.uni.fold = [[1, 1], [2, 2]]; }, 'pattern.foldEdge', { piece: 1, size: 'uni' }],
      [p => { p.pieces[1].id = p.pieces[0].id; }, 'pattern.duplicateId', { field: 'pieces' }],
      [p => { p.pieces[0].sizes = {}; }, 'pattern.pieceSizes', { piece: 1 }],
    ];
    for (const [mutate, code, params] of mutations) {
      const input = structuredClone(demo); mutate(input);
      const error = caught(() => parsePatternFile(input));
      expect(error.code).toBe(code);
      expect(error.params).toEqual(params);
    }
  });
  it('renders the path of an error in Czech', () => {
    const input = structuredClone(demo);
    input.pieces[2].sizes.uni.outline[1][0] = NaN;
    expect(text(caught(() => parsePatternFile(input)))).toBe('Díl 3 / uni.outline[1]: očekáváno platné číslo.');
    expect(text(caught(() => parsePatternFile({ ...demo, sizes: ['uni', 'uni'] })))).toBe('Velikosti: opakující se velikost.');
    expect(text(caught(() => parsePatternFile(null)))).toBe('Střih: očekáván objekt.');
  });
  it('rejects a fold whose outline leaves the fold line between its endpoints', () => {
    const input = structuredClone(demo);
    // A 2 cm notch into the piece in the middle of the fold edge: endpoints still lie on the outline.
    input.pieces[0].sizes.uni.outline = [[0, 0], [10, 0], [10, 20], [0, 20], [2, 10]];
    input.pieces[0].sizes.uni.fold = [[0, 0], [0, 20]];
    expect(caught(() => parsePatternFile(input)).code).toBe('pattern.foldEdge');
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
      expect(caught(() => parsePatternFile(input)).code).toBe('pattern.reservedName');
    }
  });
  it('accepts a fold annotation with small extraction rounding error', () => {
    const input = structuredClone(demo);
    input.pieces[0].sizes.uni.fold = [[0.08, 0], [0.08, 34]];
    expect(parsePatternFile(input).pieces[0].sizes.uni.fold).toEqual([[0.08, 0], [0.08, 34]]);
  });
});

describe('demo pattern per locale', () => {
  it('keeps id, piece ids, sizes and geometry in both languages and parses', () => {
    const en = demoPattern('en');
    expect(en.id).toBe(demo.id);
    expect(en.pieces.map(p => p.id)).toEqual(demo.pieces.map(p => p.id));
    expect(en.pieces.map(p => p.sizes)).toEqual(demo.pieces.map(p => p.sizes));
    expect(en.name).not.toBe(demo.name);
    expect(parsePatternFile(structuredClone(en)).pieces).toHaveLength(5);
    expect(demoPattern('cs')).toEqual(demo);
  });
});
