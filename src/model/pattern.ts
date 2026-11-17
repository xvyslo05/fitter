import { AppError } from '../errors';
import type { ErrorCode, PathField } from '../errors';
import { area, FOLD_TOLERANCE, isSimple, pointSegmentDistance } from '../geom/polygon';

export type Pt = [number, number];
export type SeamAllowance = 'included' | 'none' | 'mixed' | 'unknown';
export interface PieceSize {
  outline: Pt[];
  fold?: [Pt, Pt];
  bbox: [number, number];
  area: number;
}
export interface Piece {
  id: string;
  name: string;
  cut: { material: string; count: number }[];
  optional?: boolean;
  variant?: string;
  variantGroup?: string;
  note?: string;
  seamAllowance?: SeamAllowance;
  sizes: Record<string, PieceSize>;
}
export interface PatternFile {
  format: 'fitter-pattern@1';
  id: string;
  name: string;
  author?: string | null;
  source?: string;
  seamAllowance: SeamAllowance;
  notes?: string | null;
  sizes: string[];
  pieces: Piece[];
}

// Where a value sits: a named field, or piece n (of size `size`), then a technical sub-path such as "outline[2]".
interface Where { field?: PathField; piece?: number; size?: string; sub?: string }
const sub = (where: Where, part: string): Where => ({ ...where, sub: where.sub ? `${where.sub}.${part}` : part });
function fail(where: Where, code: ErrorCode): never {
  throw new AppError(code, Object.fromEntries(Object.entries(where).filter(([, value]) => value !== undefined)) as Record<string, string | number>);
}
function object(value: unknown, path: Where): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'pattern.expectedObject');
  return value as Record<string, unknown>;
}
function string(value: unknown, path: Where): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) fail(path, 'pattern.expectedText');
  return value;
}
// Used as keys of plain objects in the app, where "__proto__" would hit the prototype setter.
function key(value: unknown, path: Where): string {
  const s = string(value, path);
  if (s === '__proto__') fail(path, 'pattern.reservedName');
  return s;
}
function number(value: unknown, path: Where, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0) || Math.abs(value) > 1e9)
    fail(path, positive ? 'pattern.expectedPositive' : 'pattern.expectedNumber');
  return value;
}
function array(value: unknown, path: Where): unknown[] {
  if (!Array.isArray(value) || !value.length) fail(path, 'pattern.expectedList');
  return value;
}
function point(value: unknown, path: Where): Pt {
  const v = array(value, path);
  if (v.length !== 2) fail(path, 'pattern.pointCoords');
  return [number(v[0], path), number(v[1], path)];
}
function seam(value: unknown, path: Where): SeamAllowance {
  if (!['included', 'none', 'mixed', 'unknown'].includes(value as string)) fail(path, 'pattern.seamInvalid');
  return value as SeamAllowance;
}
function optionalString(value: unknown, path: Where): string | undefined {
  return value === undefined ? undefined : string(value, path);
}
function size(value: unknown, path: Where): PieceSize {
  const v = object(value, path);
  const outline = array(v.outline, sub(path, 'outline')).map((p, i) => point(p, sub(path, `outline[${i}]`)));
  if (outline.length < 3 || outline.length > 10_000 || area(outline) < 1e-8 || !isSimple(outline))
    fail(path, 'pattern.outlineInvalid');
  const bounds = point(v.bbox, sub(path, 'bbox'));
  if (bounds.some(n => n <= 0)) fail(path, 'pattern.sizeDimensions');
  const result: PieceSize = { outline, bbox: bounds, area: number(v.area, sub(path, 'area'), true) };
  if (v.fold !== undefined) {
    const f = array(v.fold, sub(path, 'fold'));
    if (f.length !== 2) fail(path, 'pattern.foldPoints');
    const a = point(f[0], path), b = point(f[1], path);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) fail(path, 'pattern.foldZero');
    const sides = outline.map(([x, y]) => ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / length);
    const onBoundary = (p: Pt) => outline.some((v, i) => pointSegmentDistance(p, v, outline[(i + 1) % outline.length]) <= FOLD_TOLERANCE);
    // The whole fold edge, not just its endpoints, must follow the outline.
    const alongFold = Array.from({ length: 33 }, (_, i): Pt => [a[0] + (b[0] - a[0]) * i / 32, a[1] + (b[1] - a[1]) * i / 32]);
    if ((sides.some(s => s > FOLD_TOLERANCE) && sides.some(s => s < -FOLD_TOLERANCE)) || !alongFold.every(onBoundary))
      fail(path, 'pattern.foldEdge');
    result.fold = [a, b];
  }
  return result;
}

export function parsePatternFile(json: unknown): PatternFile {
  const v = object(json, { field: 'pattern' });
  if (v.format !== 'fitter-pattern@1') fail({ field: 'pattern' }, 'pattern.format');
  const sizes = array(v.sizes, { field: 'sizes' }).map(s => key(s, { field: 'size' }));
  if (new Set(sizes).size !== sizes.length) fail({ field: 'sizes' }, 'pattern.duplicateSize');
  const pieces = array(v.pieces, { field: 'pieces' }).map((value, i): Piece => {
    const path: Where = { piece: i + 1 }, p = object(value, path);
    const sizeEntries = Object.entries(object(p.sizes, sub(path, 'sizes')));
    if (!sizeEntries.length || sizeEntries.some(([key]) => !sizes.includes(key))) fail(path, 'pattern.pieceSizes');
    if (p.optional !== undefined && typeof p.optional !== 'boolean') fail(path, 'pattern.optionalFlag');
    return {
      id: key(p.id, sub(path, 'id')), name: string(p.name, sub(path, 'name')),
      cut: array(p.cut, sub(path, 'cut')).map(c => {
        const item = object(c, path), count = number(item.count, sub(path, 'cut.count'), true);
        if (!Number.isSafeInteger(count) || count > 1000) fail(path, 'pattern.copyCount');
        return { material: key(item.material, sub(path, 'cut.material')), count };
      }),
      optional: p.optional as boolean | undefined,
      variant: optionalString(p.variant, path), variantGroup: optionalString(p.variantGroup, path),
      note: optionalString(p.note, path), seamAllowance: p.seamAllowance === undefined ? undefined : seam(p.seamAllowance, path),
      sizes: Object.fromEntries(sizeEntries.map(([key, value]) => [key, size(value, { ...path, size: key })])),
    };
  });
  if (new Set(pieces.map(p => p.id)).size !== pieces.length) fail({ field: 'pieces' }, 'pattern.duplicateId');
  return {
    format: 'fitter-pattern@1', id: key(v.id, { field: 'patternId' }), name: string(v.name, { field: 'patternName' }),
    author: v.author === null ? null : optionalString(v.author, { field: 'author' }), source: optionalString(v.source, { field: 'source' }),
    seamAllowance: seam(v.seamAllowance, { field: 'seamAllowance' }),
    notes: v.notes === null ? null : optionalString(v.notes, { field: 'notes' }), sizes, pieces,
  };
}
