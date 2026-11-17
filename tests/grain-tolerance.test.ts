import { afterEach, describe, expect, it, vi } from 'vitest';
import { demo } from '../src/model/demo';
import { DEFAULT_GRAIN_TOLERANCE_DEG, checkSettings, defaultSettings, makeOrder, prepare } from '../src/model/prepare';
import { orientation, orientationText } from '../src/ui/Layout';
import { bbox, normalize, polygonDistance, rotate } from '../src/geom/polygon';
import { orientations } from '../src/nest/raster';
import { nest, nestOnce } from '../src/nest/nest';
import type { Fabric, NestPiece } from '../src/nest/types';
import { loadWorkspace } from '../src/storage';
import { mixedPieces, options, rectangle } from './fixtures';

const piece = (extra: Partial<NestPiece> = {}): NestPiece => ({ key: 'p', label: 'p', polygon: [[0, 0], [20, 0], [14, 30], [0, 24]], rotation: '180', ...extra });

describe('grain tolerance setting', () => {
  it('pins the opt-in value and is off by default', () => {
    expect(DEFAULT_GRAIN_TOLERANCE_DEG).toBe(3);
    expect(defaultSettings.grainTolerance).toBe(0);
  });
  it('is limited to 0-5 degrees', () => {
    expect(checkSettings({ ...defaultSettings, grainTolerance: 5 })).toBeNull();
    expect(checkSettings({ ...defaultSettings, grainTolerance: 5.5 })?.code).toBe('settings.grainRange');
    expect(checkSettings({ ...defaultSettings, grainTolerance: -1 })?.code).toBe('settings.grainRange');
  });
  afterEach(() => vi.unstubAllGlobals());
  it('loads the default from a workspace saved without the field', () => {
    const { grainTolerance, ...old } = defaultSettings;
    expect(grainTolerance).toBe(0);
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ version: 1, order: [], fabrics: {}, settings: old }) });
    expect(loadWorkspace()?.settings.grainTolerance).toBe(0);
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ version: 1, order: [], fabrics: {}, settings: { ...old, grainTolerance: 3 } }) });
    expect(loadWorkspace()?.settings.grainTolerance).toBe(3);
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ version: 1, order: [], fabrics: {}, settings: { ...old, grainTolerance: 99 } }) });
    expect(loadWorkspace()?.settings.grainTolerance).toBe(0);
  });
});

describe('prepare tilt', () => {
  const run = (fabric: Fabric) => {
    const settings = { ...structuredClone(defaultSettings), grainTolerance: 3 };
    return Object.values(prepare([structuredClone(demo)], [makeOrder(demo, 'o')], { 'Vnější látka': fabric, 'Podšívka': fabric }, settings).materials).flat();
  };
  it('gives every piece of a directional fabric tilt 0 even when the setting is 3', () => {
    const pieces = run({ width: 140, length: null, folded: false, directional: true });
    expect(pieces.length).toBeGreaterThan(0);
    expect(pieces.map(p => p.tilt)).toEqual(pieces.map(() => 0));
  });
  it('tilts ordinary pieces and keeps fold-edge pieces straight', () => {
    const pieces = run({ width: 140, length: null, folded: true });
    expect(pieces.filter(p => p.foldEdge).map(p => p.tilt)).toEqual(pieces.filter(p => p.foldEdge).map(() => 0));
    expect(pieces.some(p => !p.foldEdge && p.tilt === 3)).toBe(true);
  });
  it('is off with the default settings', () => {
    const pieces = Object.values(prepare([structuredClone(demo)], [makeOrder(demo, 'o')], {}, structuredClone(defaultSettings)).materials).flat();
    expect(pieces.every(p => !p.tilt)).toBe(true);
  });
});

describe('tilted rasters', () => {
  it('adds tilted copies at -tilt and +tilt per base angle', () => {
    const rasters = orientations(piece({ tilt: 3 }), 0.5, 0.5);
    expect(rasters).toHaveLength(6);
    expect(rasters.map(r => [r.angle, r.tilt])).toEqual([[0, 0], [0, -3], [0, 3], [180, 0], [180, -3], [180, 3]]);
  });
  it('ignores the tilt of a fold-edge piece', () => {
    const rasters = orientations(piece({ tilt: 3, foldEdge: true }), 0.5, 0.5);
    expect(rasters.map(r => [r.angle, r.flipY, r.tilt])).toEqual([[0, false, 0], [0, true, 0]]);
  });
  it('is identical to today without tilt', () => {
    const plain = orientations(piece(), 0.5, 0.5);
    expect(plain).toHaveLength(2);
    expect(orientations(piece({ tilt: 0 }), 0.5, 0.5)).toEqual(plain);
    expect(plain.every(r => r.tilt === 0)).toBe(true);
  });
  it('turns the polygon by angle plus tilt', () => {
    const [straight, minus] = orientations({ key: 'r', label: 'r', polygon: rectangle(10, 40), rotation: 'none', tilt: 3 }, 0, 0.5);
    expect(minus.tilt).toBe(-3);
    expect(minus.width).toBeGreaterThan(straight.width);
    expect(minus.height).toBeGreaterThan(straight.height);
  });
});

describe('nesting with tilt', () => {
  it('keeps tilted mixed concave pieces in bounds and at least 0.5 cm apart', () => {
    const fabric = { width: 150, length: 180, folded: false };
    const pieces = mixedPieces(18).map(p => ({ ...p, tilt: 3 }));
    const result = nest(pieces, fabric, { ...options, gap: 0.5, timeMs: 400 });
    expect(result.placements.length).toBeGreaterThan(5);
    expect(result.placements.some(p => p.tilt !== 0)).toBe(true);
    for (const p of result.placements) {
      const b = bbox(p.polygon);
      expect(b.minX).toBeGreaterThanOrEqual(-1e-6);
      expect(b.minY).toBeGreaterThanOrEqual(-1e-6);
      expect(b.maxX).toBeLessThanOrEqual(150 + 1e-6);
      expect(b.maxY).toBeLessThanOrEqual(180 + 1e-6);
      expect(Math.abs(p.tilt)).toBeLessThanOrEqual(3);
    }
    for (let i = 0; i < result.placements.length; i++) for (let j = i + 1; j < result.placements.length; j++)
      expect(polygonDistance(result.placements[i].polygon, result.placements[j].polygon)).toBeGreaterThanOrEqual(0.5 - 1e-6);
  });
  it('without tilt returns exactly the same result as before the setting existed', () => {
    const fabric = { width: 150, length: null, folded: false };
    const pieces = mixedPieces(10);
    const a = nestOnce(pieces, fabric, options), b = nestOnce(pieces.map(p => ({ ...p, tilt: 0 })), fabric, options);
    expect(b).toEqual(a);
    expect(a.placements.every(p => p.tilt === 0)).toBe(true);
  });
  it('rejects an out-of-range tilt', () => {
    expect(() => nestOnce([piece({ tilt: 9 })], { width: 100, length: null, folded: false }, options)).toThrow();
  });
});

describe('constructed case', () => {
  // A 10 × 60 strip cut 3° off the pattern's vertical next to a straight one; the cloth is 21 cm wide and 62 cm long.
  // They fit side by side only when the slanted strip is turned back to vertical, i.e. tilted by -3°.
  const slanted = (tilt: number): NestPiece => ({ key: 'slanted', label: 'slanted', polygon: normalize(rotate(rectangle(10, 60), 3)), rotation: '180', tilt });
  const straight = (tilt: number): NestPiece => ({ key: 'straight', label: 'straight', polygon: rectangle(10, 60), rotation: '180', tilt });
  const fabric = { width: 21, length: 62, folded: false }, opts = { gap: 0.5, resolution: 0.25, timeMs: 300, seed: 7 };
  it('places both strips with the tilt on and leaves one unplaced with it off', () => {
    const off = nest([slanted(0), straight(0)], fabric, opts);
    const on = nest([slanted(3), straight(3)], fabric, opts);
    expect(off.unplaced).toHaveLength(1);
    expect(on.unplaced).toEqual([]);
    expect(on.placements.find(p => p.key === 'slanted')?.tilt).toBe(-3);
    expect(polygonDistance(on.placements[0].polygon, on.placements[1].polygon)).toBeGreaterThanOrEqual(0.5 - 1e-6);
  });
  it('never tilts when a piece is not given a tilted copy to try', () => {
    expect(nestOnce([slanted(3), straight(3)], fabric, opts).unplaced).toHaveLength(1);
  });
});

describe('layout text', () => {
  it('reports the tilt off the grain, unsigned', () => {
    expect(orientation(false, { angle: 180, flipY: false, tilt: -2 })).toEqual({ mirrored: false, turn: 180, tilt: 2 });
    expect(orientation(false, { angle: 0, flipY: false, tilt: 0 })).toEqual({ mirrored: false, turn: 0 });
    expect(orientationText({ mirrored: false, turn: 0, tilt: 2 }, 'single')).toBe('Jako ve střihu, natočeno o 2° od vlákna');
  });
});
