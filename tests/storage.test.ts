import { afterEach, describe, expect, it, vi } from 'vitest';
import { demo } from '../src/model/demo';
import { defaultSettings, makeOrder } from '../src/model/prepare';
import { loadWorkspace, saveWorkspace } from '../src/storage';

afterEach(() => vi.unstubAllGlobals());
describe('workspace persistence', () => {
  it('round-trips order, per-piece choices, materials and settings', () => {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) });
    const workspace = { order: [{ ...makeOrder(demo, 'saved-order'), quantity: 2, include: { tab: true }, rotations: { tab: 'none' as const } }],
      fabrics: { canvas: { width: 140, length: 80, folded: true } }, settings: structuredClone(defaultSettings) };
    workspace.settings.mirroredPairs = false;
    expect(saveWorkspace(workspace)).toBe(true);
    expect(loadWorkspace()).toEqual(workspace);
  });
  it('handles blocked storage and corrupt or obsolete state without crashing', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadWorkspace()).toBeNull();
    expect(saveWorkspace({ order: [], fabrics: {}, settings: defaultSettings })).toBe(false);
    for (const data of ['{bad', 'null', '{"version":0}', '{"version":1,"order":null}']) {
      vi.stubGlobal('localStorage', { getItem: () => data });
      expect(loadWorkspace()).toBeNull();
    }
  });
  it('drops malformed lines and fabric dimensions and restores safe numeric defaults', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ version: 1,
      order: [{ ...makeOrder(demo, 'invalid'), quantity: -1 }], fabrics: { canvas: { width: 0, length: null } },
      settings: { ...defaultSettings, resolution: 0, gap: -2, rotation: 'anything' },
    }) });
    expect(loadWorkspace()).toEqual({ order: [], fabrics: {}, settings: defaultSettings });
  });
});
