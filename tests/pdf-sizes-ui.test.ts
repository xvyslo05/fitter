import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cs } from '../src/i18n/cs';
import { en } from '../src/i18n/en';
import { parseTraceOptions } from '../src/ui/PdfAdvanced';

// Step 2 shows no mm, pt or cm/pt value outside "Pokročilé" (PdfAdvanced.tsx holds all of them).
const source = (name: string) => readFileSync(fileURLToPath(new URL(`../src/ui/${name}`, import.meta.url)), 'utf8');
const code = (text: string) => text.split('\n').filter(line => !/^\s*(?:\/\/|\/\*|\*)/.test(line)).map(line => line.replace(/\s\/\/\s.*$/, '')).join('\n');
const UNITS = /(?<![\p{L}\d])(?:mm|pt)(?![\p{L}\d])|cm\/pt|\bmm\b/iu;
const keysIn = (text: string) => [...new Set([...text.matchAll(/'(pdf\.[A-Za-z0-9.]+)'/g)].map(m => m[1]))];

describe('step 2 without raster knobs', () => {
  const main = code(source('PdfSizes.tsx')), advanced = code(source('PdfAdvanced.tsx'));
  const dictionaries = { cs: cs as Record<string, string>, en: en as Record<string, string> };

  it('uses no advanced key and no unit-labelled text in the default view', () => {
    const keys = keysIn(main);
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter(key => key.startsWith('pdf.adv.'))).toEqual([]);
    for (const [locale, dictionary] of Object.entries(dictionaries)) for (const key of keys)
      expect(UNITS.test(dictionary[key] ?? ''), `${locale} ${key}: ${dictionary[key]}`).toBe(false);
  });
  it('has no unit word in a literal of the default view', () => {
    expect(main.split('\n').filter(line => UNITS.test(line.replace(/'pdf\.[A-Za-z0-9.]+'/g, '')))).toEqual([]);
  });
  it('keeps the labelled settings in the advanced component', () => {
    for (const key of ['pdf.adv.gap', 'pdf.adv.step', 'pdf.adv.minArea', 'pdf.adv.scaleCurrent', 'pdf.adv.range']) {
      expect(Object.hasOwn(cs, key), key).toBe(true);
      expect(Object.hasOwn(en, key), key).toBe(true);
    }
    expect(keysIn(advanced)).toEqual(expect.arrayContaining(['pdf.adv.gap', 'pdf.adv.step', 'pdf.adv.minArea', 'pdf.adv.scaleCurrent']));
    expect(cs['pdf.adv.gap']).toMatch(/mm/);
  });
  it('shows the main flow keys in both languages', () => {
    for (const key of ['pdf.line.question', 'pdf.line.shared', 'pdf.line.none', 'pdf.chips.add', 'pdf.sizes.gapNote'])
      for (const dictionary of Object.values(dictionaries)) expect(dictionary[key], key).toBeTruthy();
    expect(cs['pdf.line.question']).toBe('Která velikost je tato čára?');
  });
  it('tells a size of the gap in the user\'s unit, not in mm', () => {
    expect(cs['pdf.sizes.gapNote']).toContain('{gap:l1}');
    expect(en['pdf.sizes.gapNote']).toContain('{gap:l1}');
  });
});

describe('trace options from the advanced fields', () => {
  it('parses the defaults', () => {
    expect(parseTraceOptions({ gap: '1', resolution: '0,5', minArea: '15' }, 0.035)).toEqual({ cmPerPt: 0.035, gapMm: 1, resolutionMm: 0.5, minAreaCm2: 15 });
  });
  it('rejects empty and out-of-range values', () => {
    for (const bad of [{ gap: '', resolution: '0.5', minArea: '15' }, { gap: '7', resolution: '0.5', minArea: '15' }, { gap: '1', resolution: '0.1', minArea: '15' }, { gap: '1', resolution: '0.5', minArea: '-1' }])
      expect(() => parseTraceOptions(bad, 1)).toThrow();
  });
});
