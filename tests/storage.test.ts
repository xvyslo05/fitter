import { afterEach, describe, expect, it, vi } from 'vitest';
import { demo } from '../src/model/demo';
import { defaultSettings, makeOrder } from '../src/model/prepare';
import { MAX_IMPORT_BYTES, backupFileName, exportBackup, isBackup, loadWorkspace, parseBackup, saveWorkspace } from '../src/storage';

afterEach(() => vi.unstubAllGlobals());
describe('workspace persistence', () => {
  it('round-trips order, per-piece choices, materials and settings', () => {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) });
    const workspace = { order: [{ ...makeOrder(demo, 'saved-order'), quantity: 2, include: { tab: true }, rotations: { tab: 'none' as const } }],
      fabrics: { canvas: { width: 140, length: 80, folded: true, directional: true } }, settings: structuredClone(defaultSettings) };
    workspace.settings.mirroredPairs = false;
    expect(saveWorkspace(workspace)).toBe(true);
    expect(loadWorkspace()).toEqual(workspace);
  });
  it('loads a stored fabric without directional as false', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ version: 1, order: [], fabrics: { canvas: { width: 140, length: null, folded: false } }, settings: defaultSettings }) });
    expect(loadWorkspace()?.fabrics.canvas).toEqual({ width: 140, length: null, folded: false, directional: false });
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

describe('backup', () => {
  const copy = (id: string) => ({ ...structuredClone(demo), id, name: `Střih ${id}` });
  const workspace = () => ({ order: [{ ...makeOrder(demo, 'o1'), quantity: 2 }], fabrics: { canvas: { width: 140, length: 80, folded: false, directional: false } }, settings: structuredClone(defaultSettings) });
  const read = async (blob: Blob): Promise<unknown> => JSON.parse(await blob.text());
  it('round-trips two patterns and the workspace without the demo pattern', async () => {
    const a = copy('a'), b = copy('b'), ws = workspace();
    const json = await read(exportBackup([demo, a, b], ws, new Date('2026-11-17T10:00:00Z')));
    expect(isBackup(json)).toBe(true);
    const parsed = parseBackup(json);
    expect(parsed.patterns).toEqual([a, b]);
    expect(parsed.workspace).toEqual(ws);
    expect(parsed.errors).toEqual([]);
    expect(parsed.created).toBe('2026-11-17T10:00:00.000Z');
    expect(backupFileName(new Date('2026-11-17T10:00:00Z'))).toBe('fitter-zaloha-2026-11-17.json');
  });
  it('restores the valid patterns and names the invalid one', async () => {
    const json = await read(exportBackup([copy('a'), copy('b')], workspace())) as { patterns: unknown[] };
    json.patterns[1] = { ...(json.patterns[1] as object), sizes: 'bad' };
    const parsed = parseBackup(json);
    expect(parsed.patterns.map(p => p.id)).toEqual(['a']);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toContain('Střih b');
  });
  it('rejects another format', () => {
    expect(() => parseBackup({ format: 'fitter-pattern@1' })).toThrow('fitter-backup@1');
    expect(() => parseBackup(null)).toThrow('fitter-backup@1');
    expect(isBackup(structuredClone(demo))).toBe(false);
  });
  it('ignores the demo id and drops order lines of patterns missing from the backup', async () => {
    const ws = workspace();
    ws.order.push(makeOrder(copy('gone'), 'o2'), makeOrder(copy('kept'), 'o3'));
    const json = await read(exportBackup([copy('kept')], ws)) as { patterns: unknown[] };
    json.patterns.push(structuredClone(demo));
    const parsed = parseBackup(json);
    expect(parsed.patterns.map(p => p.id)).toEqual(['kept']);
    expect(parsed.workspace?.order.map(l => l.id)).toEqual(['o1', 'o3']);
  });
  it('reports patterns over the pattern limits and shares the 25 MB file limit', async () => {
    const big = copy('big');
    big.pieces[0].cut[0].count = 1001;
    const parsed = parseBackup(await read(exportBackup([big], workspace())));
    expect(parsed.patterns).toEqual([]);
    expect(parsed.errors).toHaveLength(1);
    expect(MAX_IMPORT_BYTES).toBe(25 * 1024 * 1024);
  });
  it('reports an unreadable workspace without losing patterns', async () => {
    const json = await read(exportBackup([copy('a')], workspace())) as { workspace: unknown };
    json.workspace = null;
    const parsed = parseBackup(json);
    expect(parsed.patterns).toHaveLength(1);
    expect(parsed.workspace).toBeNull();
    expect(parsed.errors).toHaveLength(1);
  });
});
