import { describe, expect, it } from 'vitest';
import { detectSizeChips, namedSizes, parseSizeName, toggleSize } from '../src/pdf/sizechips';
import { AppError } from '../src/errors';
import type { PdfText } from '../src/pdf/types';

const text = (str: string, x: number, y: number, height = 10): PdfText => ({ str, x, y, height, angle: 0 });
const row = (labels: string[], x = 100, y = 50, step = 30) => labels.map((label, i) => text(label, x + i * step, y));

describe('detectSizeChips', () => {
  it('reads separate letter labels in a row, in order', () => {
    expect(detectSizeChips(row(['S', 'M', 'L', 'XL', 'XXL']))).toEqual(['S', 'M', 'L', 'XL', 'XXL']);
  });
  it('reads one text item with several sizes', () => {
    expect(detectSizeChips([text('34 36 38', 100, 50)])).toEqual(['34', '36', '38']);
    expect(detectSizeChips([text('Size: S, M, L', 100, 50)])).toEqual(['S', 'M', 'L']);
  });
  it('reads a column of labels and sorts them', () => {
    expect(detectSizeChips(['40', '36', '38'].map((s, i) => text(s, 100, 50 + i * 12)))).toEqual(['36', '38', '40']);
  });
  it('does not take A4 for a size', () => {
    expect(detectSizeChips([text('A4', 100, 50), text('Print on A4 or US Letter', 100, 80)])).toEqual([]);
    expect(detectSizeChips([...row(['34', '36', '38']), text('A4', 400, 300)])).toEqual(['34', '36', '38']);
  });
  it('ignores a lone label, labels far apart and decimal numbers', () => {
    expect(detectSizeChips([text('M', 100, 50)])).toEqual([]);
    expect(detectSizeChips([text('S', 100, 50), text('M', 900, 700)])).toEqual([]);
    expect(detectSizeChips([text('1,5 2,5', 100, 50)])).toEqual([]);
    expect(detectSizeChips([text('uni', 100, 50), text('S', 130, 50)])).toEqual([]);
  });
  it('does not mix numbers with letters in one cluster', () => {
    expect(detectSizeChips(row(['S', 'M', '38']))).toEqual([]);
  });
  it('takes the largest cluster, not the page numbers', () => {
    const stray = [text('1', 20, 500), text('2', 700, 20)];
    expect(detectSizeChips([...stray, ...row(['38', '40', '42', '44'])])).toEqual(['38', '40', '42', '44']);
  });
  it('is empty without a text layer', () => { expect(detectSizeChips([])).toEqual([]); });
});

describe('assigning sizes to a line style', () => {
  const order = ['S', 'M', 'L'];
  it('toggles a size on and off and keeps the chip order', () => {
    expect(toggleSize('', 'L', order)).toBe('L');
    expect(toggleSize('L', 'S', order)).toBe('S, L');
    expect(toggleSize('S, L', 'L', order)).toBe('S');
    expect(toggleSize('S', 'S', order)).toBe('');
  });
  it('replaces the shared value and keeps unknown sizes last', () => {
    expect(toggleSize('uni', 'M', order)).toBe('M');
    expect(toggleSize('vše', 'M', order)).toBe('M');
    expect(toggleSize('XXL, S', 'M', order)).toBe('S, M, XXL');
  });
  it('lists only named sizes', () => {
    expect(namedSizes('S; uni, M')).toEqual(['S', 'M']);
    expect(namedSizes(undefined)).toEqual([]);
  });
  it('accepts one size name and rejects lists and the all-sizes words', () => {
    expect(parseSizeName('  42/44 ')).toBe('42/44');
    for (const bad of ['', 'S, M', 'a;b', 'uni', 'VŠE', '*', 'x'.repeat(13)]) expect(() => parseSizeName(bad), bad).toThrow(AppError);
  });
});
