import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePatternFile } from '../../src/model/pattern';
import { defaultFabric, defaultSettings, makeOrder, prepare } from '../../src/model/prepare';
import type { OrderLine } from '../../src/model/prepare';
import { nest } from '../../src/nest/nest';
import type { NestResult } from '../../src/nest/types';

// Nesting benchmark: FITTER_BENCH=1 npx vitest run tests/local/nest-benchmark.test.ts
// Needs library/ only. Prints numbers and ids, never pattern content.
const present = process.env.FITTER_BENCH === '1' && existsSync(resolve('library'));
const load = (id: string) => parsePatternFile(JSON.parse(readFileSync(resolve('library', `${id}.json`), 'utf8')));
// FITTER_TILT=3 runs with grain tolerance 3° (default 0); the baselines below apply to 0 only.
const TILT = Number(process.env.FITTER_TILT ?? 0), settings = { ...defaultSettings, grainTolerance: TILT };
const PASSES = 300, WALL_MS = 5000, material = 'hlavní';
// [pattern id, size] pairs; each is run unfolded and folded.
const singles: [string, string][] = [['alexia-kleid', '34'], ['alexia-kleid', '52'], ['celia', '44'], ['raglan-hoodie-alex', 'L']];
// Utilisation (%) at the fixed pass budget, recorded from the first run on the owner's machine.
const baseline: Record<string, number> = {
  'alexia-kleid 34 flat': 68.0, 'alexia-kleid 34 folded': 62.9, 'alexia-kleid 52 flat': 67.6, 'alexia-kleid 52 folded': 69.6,
  'celia 44 flat': 69.7, 'celia 44 folded': 64.0, 'raglan-hoodie-alex L flat': 73.4, 'raglan-hoodie-alex L folded': 73.1,
  'celia 44 x2 + raglan-hoodie-alex L x1 flat': 73.6,
};

interface Case { name: string; lines: [string, string, number][]; folded: boolean }
const cases: Case[] = [
  ...singles.flatMap(([id, size]): Case[] => [false, true].map(folded => ({ name: `${id} ${size} ${folded ? 'folded' : 'flat'}`, lines: [[id, size, 1]], folded }))),
  { name: 'celia 44 x2 + raglan-hoodie-alex L x1 flat', lines: [['celia', '44', 2], ['raglan-hoodie-alex', 'L', 1]], folded: false },
];

function run(c: Case, mode: 'passes' | 'wall') {
  const patterns = [...new Set(c.lines.map(l => l[0]))].map(load);
  const order: OrderLine[] = c.lines.map(([id, size, quantity], i) => ({ ...makeOrder(patterns.find(p => p.id === id)!, `bench-${i}`), size, quantity }));
  const fabric = { ...defaultFabric(), folded: c.folded };
  const pieces = prepare(patterns, order, { [material]: fabric }, settings).materials[material];
  const started = performance.now();
  let calls = 0;
  const opts = mode === 'passes' ? { ...settings, timeMs: 60_000 } : { ...settings, timeMs: WALL_MS };
  // nest() counts the initial pass itself, so PASSES - 1 loop rounds give exactly PASSES passes.
  const result: NestResult = nest(pieces, fabric, opts, undefined, mode === 'passes' ? () => calls++ >= PASSES - 1 : undefined);
  return { count: pieces.length, result, ms: Math.round(performance.now() - started) };
}

describe.skipIf(!present)('nesting benchmark (local, FITTER_BENCH=1)', () => {
  it('fixed passes and wall clock', () => {
    const rows: string[] = [];
    for (const c of cases) {
      const fixed = run(c, 'passes'), wall = run(c, 'wall');
      const fmt = (r: ReturnType<typeof run>) => `${r.result.usedLength.toFixed(1)} cm, ${(r.result.utilization * 100).toFixed(1)} %, passes ${r.result.iterations}, ${r.ms} ms`;
      rows.push(`${c.name}: pieces ${fixed.count}, unplaced ${fixed.result.unplaced.length} | ${PASSES} passes: ${fmt(fixed)} | ${WALL_MS / 1000} s: ${fmt(wall)}`);
      expect(fixed.result.unplaced, c.name).toEqual([]);
      expect(wall.result.unplaced, c.name).toEqual([]);
      const base = baseline[c.name];
      if (base !== undefined && TILT === 0) expect(fixed.result.utilization * 100, c.name).toBeGreaterThanOrEqual(base - 1);
    }
    process.stdout.write(`\nNesting benchmark, fabric 140 cm, gap ${defaultSettings.gap} cm, raster ${defaultSettings.resolution} cm, seed ${defaultSettings.seed}, grain tolerance ${TILT}°\n${rows.join('\n')}\n`);
    process.stdout.write([
      'Reference (TUL thesis, industrial markers): manual Investronica 86.0 %, AccuMark 87.3 %, NestMakerXQ 82.23 %;',
      'automatic 85.3 %, 88.3 %, 69.78 % (same order). Not directly comparable: industrial markers combine many garments',
      'and sizes on wide fabric with different gap, grain and seam rules. Use as a ceiling for orientation only.\n',
    ].join('\n'));
  }, 170_000);
});
