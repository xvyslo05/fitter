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

function fail(path: string, message: string): never { throw new Error(`${path}: ${message}`); }
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'očekáván objekt.');
  return value as Record<string, unknown>;
}
function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) fail(path, 'očekáván neprázdný text (nejvýše 2 000 znaků).');
  return value;
}
function number(value: unknown, path: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0) || Math.abs(value) > 1e9)
    fail(path, 'očekáváno platné číslo' + (positive ? ' větší než nula.' : '.'));
  return value;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || !value.length) fail(path, 'očekáván neprázdný seznam.');
  return value;
}
function point(value: unknown, path: string): Pt {
  const v = array(value, path);
  if (v.length !== 2) fail(path, 'bod musí mít dvě souřadnice.');
  return [number(v[0], path), number(v[1], path)];
}
function seam(value: unknown, path: string): SeamAllowance {
  if (!['included', 'none', 'mixed', 'unknown'].includes(value as string)) fail(path, 'neplatný údaj o švové záložce.');
  return value as SeamAllowance;
}
function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : string(value, path);
}
function size(value: unknown, path: string): PieceSize {
  const v = object(value, path);
  const outline = array(v.outline, `${path}.outline`).map((p, i) => point(p, `${path}.outline[${i}]`));
  if (outline.length < 3 || outline.length > 10_000 || area(outline) < 1e-8 || !isSimple(outline))
    fail(path, 'obrys musí být jednoduchý polygon s alespoň třemi body a nenulovou plochou (první bod neopakujte).');
  const bounds = point(v.bbox, `${path}.bbox`);
  if (bounds.some(n => n <= 0)) fail(path, 'rozměry musí být kladné.');
  const result: PieceSize = { outline, bbox: bounds, area: number(v.area, `${path}.area`, true) };
  if (v.fold !== undefined) {
    const f = array(v.fold, `${path}.fold`);
    if (f.length !== 2) fail(path, 'lom musí mít dva krajní body.');
    const a = point(f[0], path), b = point(f[1], path);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) fail(path, 'lom má nulovou délku.');
    const sides = outline.map(([x, y]) => ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / length);
    const onBoundary = (p: Pt) => outline.some((v, i) => pointSegmentDistance(p, v, outline[(i + 1) % outline.length]) <= FOLD_TOLERANCE);
    if ((sides.some(s => s > FOLD_TOLERANCE) && sides.some(s => s < -FOLD_TOLERANCE)) || !onBoundary(a) || !onBoundary(b))
      fail(path, 'lom musí ležet na rovné hraně obrysu (tolerance 0,2 cm) a díl musí být na jedné straně.');
    result.fold = [a, b];
  }
  return result;
}

export function parsePatternFile(json: unknown): PatternFile {
  const v = object(json, 'Střih');
  if (v.format !== 'fitter-pattern@1') fail('Střih', 'nepodporovaný formát; očekáván fitter-pattern@1.');
  const sizes = array(v.sizes, 'Velikosti').map(s => string(s, 'Velikost'));
  if (new Set(sizes).size !== sizes.length) fail('Velikosti', 'opakující se velikost.');
  const pieces = array(v.pieces, 'Díly').map((value, i): Piece => {
    const path = `Díl ${i + 1}`, p = object(value, path);
    const sizeEntries = Object.entries(object(p.sizes, `${path}.sizes`));
    if (!sizeEntries.length || sizeEntries.some(([key]) => !sizes.includes(key))) fail(path, 'velikosti dílu musí být ze seznamu velikostí střihu.');
    if (p.optional !== undefined && typeof p.optional !== 'boolean') fail(path, 'optional musí být true nebo false.');
    return {
      id: string(p.id, `${path}.id`), name: string(p.name, `${path}.name`),
      cut: array(p.cut, `${path}.cut`).map(c => {
        const item = object(c, path), count = number(item.count, `${path}.cut.count`, true);
        if (!Number.isSafeInteger(count) || count > 1000) fail(path, 'počet kopií musí být celé číslo 1–1 000.');
        return { material: string(item.material, `${path}.cut.material`), count };
      }),
      optional: p.optional as boolean | undefined,
      variant: optionalString(p.variant, path), variantGroup: optionalString(p.variantGroup, path),
      note: optionalString(p.note, path), seamAllowance: p.seamAllowance === undefined ? undefined : seam(p.seamAllowance, path),
      sizes: Object.fromEntries(sizeEntries.map(([key, value]) => [key, size(value, `${path} / ${key}`)])),
    };
  });
  if (new Set(pieces.map(p => p.id)).size !== pieces.length) fail('Díly', 'ID dílů musí být jedinečná.');
  return {
    format: 'fitter-pattern@1', id: string(v.id, 'ID střihu'), name: string(v.name, 'Název střihu'),
    author: v.author === null ? null : optionalString(v.author, 'Autor'), source: optionalString(v.source, 'Zdroj'),
    seamAllowance: seam(v.seamAllowance, 'Švová záložka'),
    notes: v.notes === null ? null : optionalString(v.notes, 'Poznámky'), sizes, pieces,
  };
}
