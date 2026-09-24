import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerRequest, WorkerResponse } from '../src/nest/types';
import { defaultFabric, defaultSettings, makeOrder, prepare } from '../src/model/prepare';
import { demo } from '../src/model/demo';

interface WorkerScope {
  onmessage?: (event: { data: WorkerRequest }) => void;
  postMessage: (message: WorkerResponse) => void;
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('worker protocol', () => {
  it('streams demo results for every material before reporting completion', async () => {
    const messages: WorkerResponse[] = [];
    const scope: WorkerScope = { postMessage: message => messages.push(message) };
    vi.stubGlobal('self', scope);
    await import('../src/nest/worker');
    const prepared = prepare([demo], [{ ...makeOrder(demo, 'demo'), quantity: 2 }], {}, defaultSettings);
    const jobs = Object.entries(prepared.materials).map(([material, pieces]) => ({ material, pieces, fabric: defaultFabric() }));
    scope.onmessage!({ data: { jobs, options: { ...defaultSettings, timeMs: 0 } } });
    expect(messages.map(m => m.type)).toEqual(['progress', 'result', 'progress', 'result', 'done']);
    for (const message of messages) if (message.type === 'result') {
      expect(message.result.unplaced).toEqual([]);
      expect(message.result.usedLength).toBeGreaterThan(0);
      expect(message.result.placements.length).toBe(prepared.materials[message.material].length);
    }
  });
  it('reports input errors to the UI', async () => {
    const messages: WorkerResponse[] = [];
    const scope: WorkerScope = { postMessage: message => messages.push(message) };
    vi.stubGlobal('self', scope);
    await import('../src/nest/worker');
    scope.onmessage!({ data: { jobs: [{ material: 'Synthetic', pieces: [], fabric: { ...defaultFabric(), width: 0 } }], options: defaultSettings } });
    expect(messages[0].type).toBe('error');
    expect(messages).toHaveLength(1);
  });
});
