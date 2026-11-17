import { AppError, note } from '../errors';
import { fromUnit } from '../i18n/units';
import type { Unit } from '../i18n/units';
import type { Note } from '../errors';
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
// The same in inches (the usual bolt widths 44, 54 and 60 in), shown instead of the cm ones when the unit is inches; the value stays cm.
export const FABRIC_WIDTH_PRESETS_IN = [44, 54, 60] as const;
export const fabricWidthPresets = (unit: Unit): number[] => unit === 'in' ? FABRIC_WIDTH_PRESETS_IN.map(w => fromUnit(w, 'in')) : [...FABRIC_WIDTH_PRESETS_CM];
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
// These fields live in the collapsed "Upřesnit" block, which opens when this returns a note.
export function checkSettings(settings: Settings): Note | null {
  if (!inRange(settings.seamAmount, 0, 10)) return note('settings.seamRange');
  if (!inRange(settings.gap, 0, 10)) return note('settings.gapRange');
  if (!inRange(settings.resolution, 0.25, 1)) return note('settings.resolutionRange');
  if (!inRange(settings.timeMs, 0, 60_000)) return note('settings.timeRange');
  if (!Number.isFinite(settings.seed)) return note('settings.seedNumber');
  return null;
}
export function checkInputs(settings: Settings, fabrics: Record<string, Fabric>, materials: string[]): Note | null {
  const problem = checkSettings(settings);
  if (problem) return problem;
  for (const material of materials) {
    const f = own(fabrics, material) ?? defaultFabric();
    if (!(f.width > 0 && f.width <= 1000)) return note('fabric.widthRange', { material });
    if (f.length !== null && !(f.length > 0 && f.length <= 10_000)) return note('fabric.lengthRange', { material });
  }
  return null;
}
// What differs from the defaults in the "Upřesnit" block, for its header. The per-pattern seam
// switches (addSeam) are not part of it: they sit with each pattern.
export function changedSettings(settings: Settings): Note[] {
  const value = (n: number) => ({ value: Math.round(n * 100) / 100 });
  const changed: Note[] = [];
  if (settings.seamAmount !== defaultSettings.seamAmount) changed.push(note('changed.seam', value(settings.seamAmount)));
  if (settings.gap !== defaultSettings.gap) changed.push(note('changed.gap', value(settings.gap)));
  if (settings.rotation !== defaultSettings.rotation) changed.push(note(settings.rotation === 'none' ? 'changed.rotationNone' : 'changed.rotationCross'));
  if (settings.mirroredPairs !== defaultSettings.mirroredPairs) changed.push(note('changed.mirrorOff'));
  if (settings.resolution !== defaultSettings.resolution) changed.push(settings.resolution === 0.25 ? note('changed.precisionFine') : settings.resolution === 1 ? note('changed.precisionCoarse') : note('changed.precisionCustom', value(settings.resolution)));
  if (settings.timeMs !== defaultSettings.timeMs) changed.push(note('changed.time', value(settings.timeMs / 1000)));
  if (settings.seed !== defaultSettings.seed) changed.push(note('changed.seed', value(settings.seed)));
  return changed;
}
// Everything but the per-pattern seam switches goes back to the defaults.
export const resetSettings = (settings: Settings): Settings => ({ ...structuredClone(defaultSettings), addSeam: settings.addSeam });
// Order lines that use a pattern, counted before deleting it.
export const linesUsing = (order: OrderLine[], patternId: string): number => order.filter(line => line.patternId === patternId).length;
export const deleteQuestion = (name: string, lines: number): Note => lines ? note('delete.withLines', { name, n: lines }) : note('delete.plain', { name });
// True when the plan is exactly the untouched sample row, so a freshly saved pattern may take its place.
export function shouldReplaceDemo(order: OrderLine[], demoId: string): boolean {
  const [line] = order;
  return order.length === 1 && line.patternId === demoId && line.quantity === 1 &&
    Object.keys(line.include).length === 0 && Object.keys(line.rotations).length === 0;
}
export interface PreparedOrder {
  materials: Record<string, NestPiece[]>;
  notes: Note[];
  mirroredKeys: string[];
}
export function prepare(
  patterns: PatternFile[], order: OrderLine[], fabrics: Record<string, Fabric>, settings: Settings,
): PreparedOrder {
  if (!Number.isFinite(settings.seamAmount) || settings.seamAmount < 0 || settings.seamAmount > 10)
    throw new AppError('settings.seamRange');
  const materials: Record<string, NestPiece[]> = Object.create(null);
  // Keyed by the note's JSON: the same note from several lines or pieces is listed once, in first-seen order.
  const notes = new Map<string, Note>(), mirroredKeys: string[] = [];
  const addNote = (n: Note) => { notes.set(JSON.stringify(n), n); };
  // Surplus mirrored copies per pattern/piece/material, summed over order lines.
  const surplus = new Map<string, { label: string; count: number }>();
  let total = 0;
  for (const line of order) {
    const pattern = patterns.find(p => p.id === line.patternId);
    if (!pattern) { addNote(note('prepare.patternMissing')); continue; }
    if (!pattern.sizes.includes(line.size)) throw new AppError('prepare.invalidSize', { pattern: pattern.name });
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100)
      throw new AppError('prepare.quantityRange');
    for (const piece of includedPieces(pattern, line)) {
      const shape = piece.sizes[line.size];
      const aligned = shape.fold ? alignFoldOutline(shape.outline, shape.fold) : { polygon: shape.outline, adjusted: false };
      if (aligned.adjusted) addNote(note('prepare.foldAligned', { pattern: pattern.name }));
      const allowance = piece.seamAllowance ?? pattern.seamAllowance;
      const addSeam = own(settings.addSeam, pattern.id) ?? allowance === 'none';
      if (allowance === 'unknown' || allowance === 'mixed')
        addNote(note('prepare.seamUnclear', { pattern: pattern.name }));
      const cuts = new Map<string, number>();
      for (const cut of piece.cut) cuts.set(cut.material, (cuts.get(cut.material) ?? 0) + cut.count);
      for (const [material, count] of cuts) {
        const fabric = own(fabrics, material) ?? defaultFabric();
        const keepFold = Boolean(fabric.folded && shape.fold && foldIsVertical(shape.fold));
        let polygon = shape.fold
          ? (keepFold ? orientFold(aligned.polygon, shape.fold) : unfold(aligned.polygon, shape.fold))
          : normalize(aligned.polygon);
        if (fabric.folded && shape.fold && !keepFold)
          addNote(note('prepare.foldNotVertical', { pattern: pattern.name, piece: piece.name }));
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
          if (++total > 500) throw new AppError('prepare.tooMany');
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
  for (const { label, count } of surplus.values()) addNote(note('prepare.surplus', { label, n: count }));
  return { materials, notes: [...notes.values()], mirroredKeys };
}
