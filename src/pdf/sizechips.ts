import { AppError } from '../errors';
import { sortSizes } from './build';
import { SIZE_TOKEN } from './pieces';
import { sizeRole } from './trace';
import type { PdfText } from './types';

// Size chips: the sizes named on the sheet, read from a legend-like cluster of size labels ("S M L XL", "34 36 38").
// A leading "Size:" / "Velikosti" label may precede the sizes in one text item.
const LABEL = /^(?:sizes?|velikost(?:i)?|größen?|gr\.?|tailles?)\s*[:.]?\s+/i;
const MAX_NUMERIC = 14, MAX_LETTER = 10;
interface Item { x: number; y: number; height: number; tokens: string[] }
const isNumber = (token: string) => /^\d+$/.test(token);
// Whole numbers only (a decimal is a measurement), and no "uni".
const isSize = (token: string) => SIZE_TOKEN.test(token) && token.toLowerCase() !== 'uni' && (!/^\d/.test(token) || (isNumber(token) && Number(token) >= 2 && Number(token) <= 170));

// Candidate sizes in reading order of the best cluster: items made only of sizes, close together along a line or down a column.
export function detectSizeChips(texts: readonly PdfText[]): string[] {
  const items: Item[] = [];
  for (const text of texts) {
    const tokens = text.str.trim().replace(LABEL, '').split(/[\s,;]+/).filter(Boolean);
    if (tokens.length && tokens.every(isSize)) items.push({ x: text.x, y: text.y, height: Math.max(text.height, 1), tokens });
  }
  const parent = items.map((_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j], h = Math.max(a.height, b.height), dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    if ((dy <= 0.4 * h && dx <= 10 * h) || (dx <= 2 * h && dy <= 3 * h)) parent[find(i)] = find(j);
  }
  const clusters = new Map<number, string[]>();
  items.forEach((item, i) => { const list = clusters.get(find(i)) ?? []; list.push(...item.tokens); clusters.set(find(i), list); });
  let best: string[] = [];
  for (const tokens of clusters.values()) {
    const distinct = [...new Map(tokens.map(token => [token.toUpperCase(), token.toUpperCase()])).values()], numeric = distinct.filter(isNumber).length;
    if (distinct.length < 2 || (numeric !== 0 && numeric !== distinct.length)) continue;
    if (distinct.length > (numeric ? MAX_NUMERIC : MAX_LETTER) || distinct.length <= best.length) continue;
    best = distinct;
  }
  return sortSizes(best);
}

// The assignment value that means "shared by all sizes" and the named sizes of a value.
export const SHARED_VALUE = 'uni';
export const namedSizes = (value: string | undefined): string[] => (value ?? '').split(/[,;]/).map(s => s.trim()).filter(s => s && sizeRole(s) === 'named');
// Adds or removes `size`; the result lists the sizes in the order of `order` (unknown ones last). A shared value is replaced.
export function toggleSize(value: string | undefined, size: string, order: readonly string[]): string {
  const current = namedSizes(value), next = current.includes(size) ? current.filter(s => s !== size) : [...current, size];
  const rank = (s: string) => order.includes(s) ? order.indexOf(s) : order.length;
  return next.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(x => x.s).join(', ');
}
// A size typed by the user: one name, no list separators, not one of the "all sizes" words.
export function parseSizeName(input: string): string {
  const name = input.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 12 || /[,;]/.test(name) || sizeRole(name) === 'shared') throw new AppError('pdf.sizeName');
  return name;
}
