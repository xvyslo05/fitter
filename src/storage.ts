import { createStore, del, entries, set } from 'idb-keyval';
import { parsePatternFile } from './model/pattern';
import type { PatternFile } from './model/pattern';
import { defaultSettings } from './model/prepare';
import type { OrderLine, Settings } from './model/prepare';
import type { Fabric, Rotation } from './nest/types';

const libraryStore = createStore('fitter-library', 'patterns');
const WORKSPACE_KEY = 'fitter:workspace:v1';
export interface Workspace { order: OrderLine[]; fabrics: Record<string, Fabric>; settings: Settings }
export async function loadLibrary(): Promise<{ patterns: PatternFile[]; errors: string[] }> {
  const patterns: PatternFile[] = [], errors: string[] = [];
  for (const [, value] of await entries(libraryStore)) {
    try { patterns.push(parsePatternFile(value)); }
    catch { errors.push('Jeden uložený střih je poškozený. Importujte jej znovu.'); }
  }
  return { patterns, errors };
}
export const savePattern = (p: PatternFile) => set(p.id, p, libraryStore);
export const deletePattern = (id: string) => del(id, libraryStore);

const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const numeric = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const rotation = (v: unknown): v is Rotation => v === 'none' || v === '180' || v === '90';
const booleanMap = (v: unknown): Record<string, boolean> => record(v) ? Object.fromEntries(Object.entries(v).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')) : {};

export function loadWorkspace(): Workspace | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? 'null');
    if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.order) || !record(raw.fabrics) || !record(raw.settings)) return null;
    const order: OrderLine[] = [];
    for (const line of raw.order) {
      if (!record(line) || typeof line.id !== 'string' || typeof line.patternId !== 'string' || typeof line.size !== 'string' ||
          !numeric(line.quantity, 1, 100) || !Number.isInteger(line.quantity)) continue;
      order.push({ id: line.id, patternId: line.patternId, size: line.size, quantity: line.quantity,
        include: booleanMap(line.include), rotations: record(line.rotations)
          ? Object.fromEntries(Object.entries(line.rotations).filter((entry): entry is [string, Rotation] => rotation(entry[1]))) : {} });
    }
    const fabrics: Record<string, Fabric> = Object.fromEntries(Object.entries(raw.fabrics).flatMap(([key, f]) => {
      if (!record(f) || !numeric(f.width, 0.1, 1000) || (f.length !== null && !numeric(f.length, 0.1, 10000))) return [];
      return [[key, { width: f.width, length: f.length, folded: f.folded === true }]];
    }));
    const s = raw.settings, settings = { ...defaultSettings, addSeam: booleanMap(s.addSeam) };
    if (numeric(s.seamAmount, 0, 10)) settings.seamAmount = s.seamAmount;
    if (numeric(s.gap, 0, 10)) settings.gap = s.gap;
    if (numeric(s.resolution, 0.25, 1)) settings.resolution = s.resolution;
    if (numeric(s.timeMs, 0, 60000)) settings.timeMs = s.timeMs;
    if (numeric(s.seed, 0, 4294967295)) settings.seed = s.seed;
    if (rotation(s.rotation)) settings.rotation = s.rotation;
    if (typeof s.mirroredPairs === 'boolean') settings.mirroredPairs = s.mirroredPairs;
    return { order, fabrics, settings };
  } catch { return null; }
}
export function saveWorkspace(workspace: Workspace): boolean {
  try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 1, ...workspace })); return true; }
  catch { return false; }
}
