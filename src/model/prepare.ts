import { alignFoldOutline, clipAtFold, foldIsVertical, mirrorX, normalize, offset, orientFold, unfold } from '../geom/polygon';
import type { Fabric, NestOptions, NestPiece, Rotation } from '../nest/types';
import type { PatternFile, Piece } from './pattern';

export interface OrderLine {
  id: string;
  patternId: string;
  size: string;
  quantity: number;
  include: Record<string, boolean>;
  rotations: Record<string, Rotation>;
}
export interface Settings extends NestOptions {
  seamAmount: number;
  mirroredPairs: boolean;
  rotation: Rotation;
  addSeam: Record<string, boolean>;
}
// Default gap between pieces in cm; pending confirmation, ticket 28.
export const DEFAULT_GAP_CM = 0.5;
export const defaultSettings: Settings = {
  seamAmount: 1, gap: DEFAULT_GAP_CM, resolution: 0.5, timeMs: 5000, seed: 42,
  mirroredPairs: true, rotation: '180', addSeam: {},
};
// Quick picks for the fabric width field (cm); pending confirmation of the values, ticket 13 (O4).
export const FABRIC_WIDTH_PRESETS_CM = [110, 140, 150] as const;
export const defaultFabric = (): Fabric => ({ width: 140, length: null, folded: false, directional: false });
export const own = <T>(values: Record<string, T>, key: string): T | undefined => Object.hasOwn(values, key) ? values[key] : undefined;
export function makeOrder(pattern: PatternFile, id: string = crypto.randomUUID()): OrderLine {
  return { id, patternId: pattern.id, size: pattern.sizes[0], quantity: 1, include: {}, rotations: {} };
}
// Pieces of one variantGroup sharing the same variant label are chosen together
// (e.g. front + back skirt of one length).
export const variantLabel = (p: Piece): string => p.variant ?? p.id;
export function variantChoice(pattern: PatternFile, line: OrderLine, group: string): string | null {
  const members = pattern.pieces.filter(p => p.variantGroup === group && p.sizes[line.size]);
  const selected = members.find(p => own(line.include, p.id) === true) ??
    members.find(p => own(line.include, p.id) !== false && !p.optional);
  return selected ? variantLabel(selected) : null;
}
// Include flags after choosing `label` ('' = skip the group). Members of every size are set,
// so flags left over from another size cannot override the choice.
export function chooseVariant(pattern: PatternFile, line: OrderLine, group: string, label: string): Record<string, boolean> {
  const include = { ...line.include };
  for (const p of pattern.pieces) if (p.variantGroup === group) include[p.id] = variantLabel(p) === label;
  return include;
}
// "N z M" of the pieces list: a variant group counts as one piece, chosen unless it is skipped.
export function pieceCounts(pattern: PatternFile, line: OrderLine): { selected: number; total: number } {
  const available = pattern.pieces.filter(p => p.sizes[line.size]);
  const groups = [...new Set(available.flatMap(p => p.variantGroup ? [p.variantGroup] : []))];
  const included = new Set(includedPieces(pattern, line).map(p => p.id)), plain = available.filter(p => !p.variantGroup);
  return { total: plain.length + groups.length,
    selected: plain.filter(p => included.has(p.id)).length + groups.filter(g => variantChoice(pattern, line, g) !== null).length };
}
export function includedPieces(pattern: PatternFile, line: OrderLine): Piece[] {
  const available = pattern.pieces.filter(p => p.sizes[line.size]);
  const choices = new Map<string, string | null>();
  for (const p of available) if (p.variantGroup && !choices.has(p.variantGroup))
    choices.set(p.variantGroup, variantChoice(pattern, line, p.variantGroup));
  return available.filter(p => p.variantGroup ? choices.get(p.variantGroup) === variantLabel(p) : (own(line.include, p.id) ?? !p.optional));
}
const inRange = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
// Checks the settings the nester validates, so the error shows before a run instead of failing in the worker.
// These fields live in the collapsed "Upřesnit" block, which opens when this returns a message.
export function checkSettings(settings: Settings): string | null {
  if (!inRange(settings.seamAmount, 0, 10)) return 'Přídavek na švy musí být v rozmezí 0–10 cm.';
  if (!inRange(settings.gap, 0, 10)) return 'Mezera mezi díly musí být v rozmezí 0–10 cm.';
  if (!inRange(settings.resolution, 0.25, 1)) return 'Přesnost musí být 0,25–1 cm.';
  if (!inRange(settings.timeMs, 0, 60_000)) return 'Čas hledání musí být v rozmezí 0–60 s.';
  if (!Number.isFinite(settings.seed)) return 'Číslo pokusu musí být číslo.';
  return null;
}
export function checkInputs(settings: Settings, fabrics: Record<string, Fabric>, materials: string[]): string | null {
  const problem = checkSettings(settings);
  if (problem) return problem;
  for (const material of materials) {
    const f = own(fabrics, material) ?? defaultFabric();
    if (!(f.width > 0 && f.width <= 1000)) return `${material}: šířka látky musí být větší než 0 a nejvýše 1 000 cm.`;
    if (f.length !== null && !(f.length > 0 && f.length <= 10_000)) return `${material}: délka kusu musí být větší než 0 a nejvýše 10 000 cm.`;
  }
  return null;
}
// What differs from the defaults in the "Upřesnit" block, for its header. The per-pattern seam
// switches (addSeam) are not part of it: they sit with each pattern.
export function changedSettings(settings: Settings): string[] {
  const num = (n: number) => Number.isFinite(n) ? String(Math.round(n * 100) / 100).replace('.', ',') : '?';
  const changed: string[] = [];
  if (settings.seamAmount !== defaultSettings.seamAmount) changed.push(`přídavek na švy ${num(settings.seamAmount)} cm`);
  if (settings.gap !== defaultSettings.gap) changed.push(`mezera ${num(settings.gap)} cm`);
  if (settings.rotation !== defaultSettings.rotation) changed.push(settings.rotation === 'none' ? 'díly se neotáčejí' : 'díly i napříč');
  if (settings.mirroredPairs !== defaultSettings.mirroredPairs) changed.push('páry nezrcadlově');
  if (settings.resolution !== defaultSettings.resolution) changed.push(settings.resolution === 0.25 ? 'jemná přesnost' : settings.resolution === 1 ? 'hrubá přesnost' : `přesnost ${num(settings.resolution)} cm`);
  if (settings.timeMs !== defaultSettings.timeMs) changed.push(`hledání ${num(settings.timeMs / 1000)} s`);
  if (settings.seed !== defaultSettings.seed) changed.push(`číslo pokusu ${num(settings.seed)}`);
  return changed;
}
// Everything but the per-pattern seam switches goes back to the defaults.
export const resetSettings = (settings: Settings): Settings => ({ ...structuredClone(defaultSettings), addSeam: settings.addSeam });
// Order lines that use a pattern, counted before deleting it.
export const linesUsing = (order: OrderLine[], patternId: string): number => order.filter(line => line.patternId === patternId).length;
export function deleteQuestion(name: string, lines: number): string {
  const rows = lines === 1 ? 'řádek' : lines < 5 ? 'řádky' : 'řádků';
  return lines ? `Smazat střih „${name}“? Zmizí i ze seznamu Co šiju (${lines} ${rows}). Nejde to vrátit.` : `Smazat střih „${name}“? Nejde to vrátit.`;
}
// True when the plan is exactly the untouched sample row, so a freshly saved pattern may take its place.
export function shouldReplaceDemo(order: OrderLine[], demoId: string): boolean {
  const [line] = order;
  return order.length === 1 && line.patternId === demoId && line.quantity === 1 &&
    Object.keys(line.include).length === 0 && Object.keys(line.rotations).length === 0;
}
const pieces = (n: number) => n === 1 ? 'kus' : n < 5 ? 'kusy' : 'kusů';
export interface PreparedOrder {
  materials: Record<string, NestPiece[]>;
  notes: string[];
  mirroredKeys: string[];
}
export function prepare(
  patterns: PatternFile[], order: OrderLine[], fabrics: Record<string, Fabric>, settings: Settings,
): PreparedOrder {
  if (!Number.isFinite(settings.seamAmount) || settings.seamAmount < 0 || settings.seamAmount > 10)
    throw new Error('Přídavek na švy musí být v rozmezí 0–10 cm.');
  const materials: Record<string, NestPiece[]> = Object.create(null);
  const notes = new Set<string>(), mirroredKeys: string[] = [];
  // Surplus mirrored copies per pattern/piece/material, summed over order lines.
  const surplus = new Map<string, { label: string; count: number }>();
  let total = 0;
  for (const line of order) {
    const pattern = patterns.find(p => p.id === line.patternId);
    if (!pattern) { notes.add('Vybraný střih není v knihovně. Importujte jej znovu.'); continue; }
    if (!pattern.sizes.includes(line.size)) throw new Error(`${pattern.name}: vyberte platnou velikost.`);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100)
      throw new Error('Počet kusů: zadejte celé číslo 1–100.');
    for (const piece of includedPieces(pattern, line)) {
      const shape = piece.sizes[line.size];
      const aligned = shape.fold ? alignFoldOutline(shape.outline, shape.fold) : { polygon: shape.outline, adjusted: false };
      if (aligned.adjusted) notes.add(`${pattern.name}: obrys u přehybu byl srovnán s vyznačenou hranou (tolerance 0,2 cm).`);
      const allowance = piece.seamAllowance ?? pattern.seamAllowance;
      const addSeam = own(settings.addSeam, pattern.id) ?? allowance === 'none';
      if (allowance === 'unknown' || allowance === 'mixed')
        notes.add(`${pattern.name}: přídavek na švy není jednoznačný; ověřte ho podle střihu.`);
      const cuts = new Map<string, number>();
      for (const cut of piece.cut) cuts.set(cut.material, (cuts.get(cut.material) ?? 0) + cut.count);
      for (const [material, count] of cuts) {
        const fabric = own(fabrics, material) ?? defaultFabric();
        const keepFold = Boolean(fabric.folded && shape.fold && foldIsVertical(shape.fold));
        let polygon = shape.fold
          ? (keepFold ? orientFold(aligned.polygon, shape.fold) : unfold(aligned.polygon, shape.fold))
          : normalize(aligned.polygon);
        if (fabric.folded && shape.fold && !keepFold)
          notes.add(`${pattern.name} · ${piece.name}: přehyb není svislý (±1°); díl je rozvinutý a stříhá se ve dvou vrstvách.`);
        if (addSeam && settings.seamAmount > 0) {
          polygon = offset(polygon, settings.seamAmount);
          if (keepFold) polygon = clipAtFold(polygon);
          polygon = normalize(polygon);
        }
        const originals = settings.mirroredPairs ? Math.ceil(count / 2) : count;
        const mirrors = settings.mirroredPairs ? Math.floor(count / 2) : 0;
        const placements = fabric.folded && !keepFold ? Math.max(originals, mirrors) : count;
        const extra = fabric.folded && !keepFold ? line.quantity * Math.abs(originals - mirrors) : 0;
        if (extra) {
          const id = JSON.stringify([pattern.id, piece.id, material]);
          const entry = surplus.get(id) ?? { label: `${pattern.name} · ${piece.name} (${material})`, count: 0 };
          entry.count += extra;
          surplus.set(id, entry);
        }
        materials[material] ??= [];
        for (let garment = 0; garment < line.quantity; garment++) for (let j = 0; j < placements; j++) {
          if (++total > 500) throw new Error('Je toho moc najednou. Rozdělte šití na části do 500 dílů.');
          const i = garment * placements + j;
          const key = JSON.stringify([line.id, piece.id, material, i]);
          const mirrored = !fabric.folded && settings.mirroredPairs && j % 2 === 1;
          if (mirrored) mirroredKeys.push(key);
          materials[material].push({
            key, label: `${pattern.name} · ${piece.name} · ${line.size} #${i + 1}`,
            polygon: mirrored ? mirrorX(polygon) : polygon,
            rotation: fabric.directional ? 'none' : own(line.rotations, piece.id) ?? settings.rotation,
            foldEdge: keepFold,
          });
        }
      }
    }
  }
  for (const { label, count } of surplus.values()) notes.add(`${label}: vystřihne se ${count} ${pieces(count)} navíc (zrcadlově).`);
  return { materials, notes: [...notes], mirroredKeys };
}
