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
export const defaultSettings: Settings = {
  seamAmount: 1, gap: 0.5, resolution: 0.5, timeMs: 5000, seed: 42,
  mirroredPairs: true, rotation: '180', addSeam: {},
};
export const defaultFabric = (): Fabric => ({ width: 150, length: null, folded: false });
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
export function includedPieces(pattern: PatternFile, line: OrderLine): Piece[] {
  const available = pattern.pieces.filter(p => p.sizes[line.size]);
  const choices = new Map<string, string | null>();
  for (const p of available) if (p.variantGroup && !choices.has(p.variantGroup))
    choices.set(p.variantGroup, variantChoice(pattern, line, p.variantGroup));
  return available.filter(p => p.variantGroup ? choices.get(p.variantGroup) === variantLabel(p) : (own(line.include, p.id) ?? !p.optional));
}
export interface PreparedOrder {
  materials: Record<string, NestPiece[]>;
  notes: string[];
  mirroredKeys: string[];
}
export function prepare(
  patterns: PatternFile[], order: OrderLine[], fabrics: Record<string, Fabric>, settings: Settings,
): PreparedOrder {
  if (!Number.isFinite(settings.seamAmount) || settings.seamAmount < 0 || settings.seamAmount > 10)
    throw new Error('Švová záložka musí být v rozmezí 0–10 cm.');
  const materials: Record<string, NestPiece[]> = Object.create(null);
  const notes = new Set<string>(), mirroredKeys: string[] = [];
  let total = 0;
  for (const line of order) {
    const pattern = patterns.find(p => p.id === line.patternId);
    if (!pattern) { notes.add('Střih ze zakázky není v knihovně. Importujte jej znovu.'); continue; }
    if (!pattern.sizes.includes(line.size)) throw new Error(`${pattern.name}: vyberte platnou velikost.`);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100)
      throw new Error('Množství v zakázce musí být celé číslo 1–100.');
    for (const piece of includedPieces(pattern, line)) {
      const shape = piece.sizes[line.size];
      const aligned = shape.fold ? alignFoldOutline(shape.outline, shape.fold) : { polygon: shape.outline, adjusted: false };
      if (aligned.adjusted) notes.add(`${pattern.name} · ${piece.name}: obrys u lomu byl srovnán s vyznačenou hranou (tolerance 0,2 cm).`);
      const allowance = piece.seamAllowance ?? pattern.seamAllowance;
      const addSeam = own(settings.addSeam, pattern.id) ?? allowance === 'none';
      if (allowance === 'unknown' || allowance === 'mixed')
        notes.add(`${pattern.name}: švová záložka není jednoznačná; ověřte ji podle střihu.`);
      const cuts = new Map<string, number>();
      for (const cut of piece.cut) cuts.set(cut.material, (cuts.get(cut.material) ?? 0) + cut.count);
      for (const [material, count] of cuts) {
        const fabric = own(fabrics, material) ?? defaultFabric();
        const keepFold = Boolean(fabric.folded && shape.fold && foldIsVertical(shape.fold));
        let polygon = shape.fold
          ? (keepFold ? orientFold(aligned.polygon, shape.fold) : unfold(aligned.polygon, shape.fold))
          : normalize(aligned.polygon);
        if (fabric.folded && shape.fold && !keepFold)
          notes.add(`${pattern.name} · ${piece.name}: lom není svislý (±1°); díl je rozvinutý a stříhá se ve dvou vrstvách.`);
        if (addSeam && settings.seamAmount > 0) {
          polygon = offset(polygon, settings.seamAmount);
          if (keepFold) polygon = clipAtFold(polygon);
          polygon = normalize(polygon);
        }
        const originals = settings.mirroredPairs ? Math.ceil(count / 2) : count;
        const mirrors = settings.mirroredPairs ? Math.floor(count / 2) : 0;
        const placements = fabric.folded && !keepFold ? Math.max(originals, mirrors) : count;
        const surplus = fabric.folded && !keepFold ? line.quantity * Math.abs(originals - mirrors) : 0;
        if (surplus)
          notes.add(`${pattern.name} · ${piece.name} (${material}): vystřihne se ${surplus} ${surplus === 1 ? 'kus' : surplus < 5 ? 'kusy' : 'kusů'} navíc (zrcadlově).`);
        materials[material] ??= [];
        for (let garment = 0; garment < line.quantity; garment++) for (let j = 0; j < placements; j++) {
          if (++total > 500) throw new Error('Zakázka je příliš velká. Rozdělte ji na části do 500 umístění.');
          const i = garment * placements + j;
          const key = JSON.stringify([line.id, piece.id, material, i]);
          const mirrored = !fabric.folded && settings.mirroredPairs && j % 2 === 1;
          if (mirrored) mirroredKeys.push(key);
          materials[material].push({
            key, label: `${pattern.name} · ${piece.name} · ${line.size} #${i + 1}`,
            polygon: mirrored ? mirrorX(polygon) : polygon,
            rotation: own(line.rotations, piece.id) ?? settings.rotation,
            foldEdge: keepFold,
          });
        }
      }
    }
  }
  return { materials, notes: [...notes], mirroredKeys };
}
