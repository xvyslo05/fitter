import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cs } from '../src/i18n/cs';
import { ERROR_CODES, PATH_FIELDS, PLURAL_CODES, note } from '../src/errors';
import { describe as text, fmt, getLocale, plural, setLocale, t } from '../src/i18n';

const entries = Object.entries(cs) as [string, string][];

// Source text with comments blanked out; string literals and JSX text stay. Returns null when the scan ends inside a string or comment.
function withoutComments(source: string): string | null {
  type Mode = 'code' | 'single' | 'double' | 'template' | 'line' | 'block';
  let mode: Mode = 'code', depth = 0, out = '';
  const resume: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i], d = source[i + 1];
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; i++; } else if (c === '\n') out += c; continue; }
    out += c;
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; out = out.slice(0, -1); i++; }
      else if (c === '/' && d === '*') { mode = 'block'; out = out.slice(0, -1); i++; }
      else if (c === "'") mode = 'single';
      else if (c === '"') mode = 'double';
      else if (c === '`') mode = 'template';
      else if (c === '{') depth++;
      else if (c === '}') { if (resume.length && resume[resume.length - 1] === depth) { resume.pop(); mode = 'template'; } else depth--; }
    } else if (c === '\\') { out += d ?? ''; i++; }
    else if (mode === 'single' && c === "'") mode = 'code';
    else if (mode === 'double' && c === '"') mode = 'code';
    else if (mode === 'template') {
      if (c === '`') mode = 'code';
      else if (c === '$' && d === '{') { out += d; i++; resume.push(depth); mode = 'code'; }
    }
  }
  return mode === 'code' ? out : null;
}
const DIACRITIC = /[áčďéěíňóřšťúůýž]/iu;

afterEach(() => setLocale('cs'));

describe('dictionary', () => {
  it('has no empty values', () => {
    expect(entries.filter(([, value]) => !value.trim()).map(([key]) => key)).toEqual([]);
  });

  it('uses only simple identifiers as {placeholders}', () => {
    const bad = entries.filter(([, value]) => {
      const names = [...value.matchAll(/\{([^}]*)\}/g)].map(m => m[1]);
      return names.some(name => !/^[A-Za-z_]\w*(?::[nf]\d)?$/.test(name)) || /[{}]/.test(value.replace(/\{[A-Za-z_]\w*(?::[nf]\d)?\}/g, ''));
    });
    expect(bad.map(([key]) => key)).toEqual([]);
  });

  it('keeps every plural group complete (one, few, other)', () => {
    const keys = new Set(Object.keys(cs));
    const groups = [...keys].filter(key => key.endsWith('.other')).map(key => key.slice(0, -'.other'.length));
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) for (const category of ['one', 'few']) expect(keys.has(`${group}.${category}`), `${group}.${category}`).toBe(true);
  });
});

describe('UI sources', () => {
  const dir = fileURLToPath(new URL('../src/ui/', import.meta.url));
  const files = readdirSync(dir).filter(name => /\.tsx?$/.test(name));

  it('scans every UI file', () => {
    expect(files).toEqual(expect.arrayContaining(['App.tsx', 'PdfImport.tsx', 'PdfPieces.tsx', 'PdfSave.tsx', 'Layout.tsx', 'export.ts']));
  });

  it.each(files)('%s has no string literal or JSX text with a Czech diacritic', name => {
    const code = withoutComments(readFileSync(dir + name, 'utf8'));
    expect(code, 'scanner ended inside a string or comment').not.toBeNull();
    const found = code!.split('\n').flatMap((line, i) => DIACRITIC.test(line) ? [`${name}:${i + 1}: ${line.trim().slice(0, 100)}`] : []);
    expect(found).toEqual([]);
  });

  it('the scanner skips comments but not literals', () => {
    const code = withoutComments("const a = 'á'; // č\n/* ď */ const b = `x${'é'}ř`; const c = 'it\\'s ň'; const d = <p>ž</p>;");
    expect(code).not.toBeNull();
    expect(code).toContain("'á'");
    expect(code).toContain("'é'");
    expect(code).toContain('ř');
    expect(code).toContain('ň');
    expect(code).toContain('ž');
    expect(code).not.toContain('č');
    expect(code).not.toContain('ď');
  });
});

describe('t', () => {
  it('returns the Czech text for a key', () => {
    expect(t('library.title')).toBe('Moje střihy');
  });

  it('fills {params}, numbers included', () => {
    expect(t('piece.cut', { count: 2, material: 'podšívka' })).toBe('2× podšívka');
    expect(t('order.pieces', { selected: 3, total: 5 })).toBe('Díly (3 z 5)');
  });

  it('leaves a missing parameter visible and does not read values as placeholders', () => {
    expect(t('piece.cut', { count: 2 })).toBe('2× {material}');
    expect(t('piece.cut', { count: 2, material: '{count}' })).toBe('2× {count}');
  });
});

describe('plural', () => {
  it('picks one / few / other by the Czech rule', () => {
    expect(plural('pdf.confirm.summary', 1)).toBe('Složili jsme 1 stránku do jednoho archu. Vypadá to správně?');
    expect(plural('pdf.confirm.summary', 3)).toBe('Složili jsme 3 stránky do jednoho archu. Vypadá to správně?');
    expect(plural('pdf.confirm.summary', 5)).toBe('Složili jsme 5 stránek do jednoho archu. Vypadá to správně?');
  });

  it('falls back to other for categories the dictionary does not have', () => {
    expect(plural('pdf.confirm.summary', 1.5)).toBe('Složili jsme 1.5 stránek do jednoho archu. Vypadá to správně?');
  });
});

describe('locale and fmt', () => {
  it('is cs by default and can be set', () => {
    expect(getLocale()).toBe('cs');
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('library.title')).toBe('Moje střihy');
  });

  it('formats numbers like the code it replaced', () => {
    expect(fmt.length(1.26)).toBe('1,3');
    expect(fmt.fixed(2, 1)).toBe('2,0');
    expect(fmt.number(12.5)).toBe((12.5).toLocaleString('cs'));
    expect(fmt.number(0.123456, 2)).toBe('0,12');
    expect(fmt.lower('ČERVENÁ')).toBe('červená');
  });
});

describe('error codes', () => {
  const plural = new Set<string>(PLURAL_CODES);
  it('has a Czech entry for every code (plural codes: one, few and other)', () => {
    const missing = ERROR_CODES.flatMap(code => plural.has(code) ? ['one', 'few', 'other'].map(form => `error.${code}.${form}`) : [`error.${code}`])
      .filter(key => !Object.hasOwn(cs, key));
    expect(missing).toEqual([]);
    expect(PATH_FIELDS.filter(field => !Object.hasOwn(cs, `error.path.${field}`))).toEqual([]);
    expect(Object.hasOwn(cs, 'error.path.piece')).toBe(true);
  });
  it('has no dictionary entry for a code that does not exist', () => {
    const known = new Set<string>([...ERROR_CODES.flatMap(code => plural.has(code) ? [`${code}.one`, `${code}.few`, `${code}.other`] : [code]),
      'path.piece', ...PATH_FIELDS.map(field => `path.${field}`)]);
    expect(Object.keys(cs).filter(key => key.startsWith('error.') && !known.has(key.slice('error.'.length)))).toEqual([]);
  });
  it('describes a note: parameters, plural forms, number formats and nested notes', () => {
    expect(text(note('prepare.invalidSize', { pattern: 'Mikina' }))).toBe('Mikina: vyberte platnou velikost.');
    expect(text(note('delete.withLines', { name: 'A', n: 3 }))).toContain('(3 řádky)');
    expect(text(note('summary.buy', { material: 'M', metres: 1.5, width: 140.5 }))).toBe('M: kupte alespoň 1,50 m při šíři 140,5 cm.');
    expect(text(note('changed.seam', { value: NaN }))).toBe('přídavek na švy ? cm');
    expect(text(note('backup.patternNumbered', { n: 2, reason: note('pattern.invalid') }))).toBe('Střih č. 2 se nepodařilo obnovit: neplatný střih.');
  });
});

describe('Czech text outside the dictionary', () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const dirs = ['model', 'nest', 'geom', 'pdf'];
  const files = [...dirs.flatMap(dir => readdirSync(root + dir).filter(name => /\.tsx?$/.test(name)).map(name => `${dir}/${name}`)), 'storage.ts'];
  // Heuristic vocabularies and data defaults, not messages; matched per line so a message next to them is still found.
  const allowed: Record<string, RegExp[]> = {
    'model/demo.ts': [/./],
    'pdf/pieces.ts': [/^export const DEFAULT_MATERIAL\b/, /^const (?:FOLD|GRAIN|MEASURE|STOP|MATERIALS)\b/, /^\[\/\^vlizel\//, /name: parsed\.name \?\? `Díl \$\{c\.id\}`/],
    'pdf/build.ts': [/^const (?:NONE|INCLUDED|NOISE) = \//, /bez názvu/, /'Střih z PDF'/],
    // User-typed size words ("vše" means every size).
    'pdf/trace.ts': [/^const isAll\b/],
    // The default name of a proposed variant, like "Díl N".
    'pdf/proposals.ts': [/label: `možnost \$\{k \+ 1\}`/],
  };
  // Own-line comments and a trailing "// ..." are not text the user sees.
  const code = (line: string) => /^\s*(?:\/\/|\/\*|\*)/.test(line) ? '' : line.replace(/\s\/\/\s.*$/, '');

  it('scans every source file of the model, geometry, nesting, PDF and storage code', () => {
    expect(files).toEqual(expect.arrayContaining(['model/pattern.ts', 'model/prepare.ts', 'model/summary.ts', 'nest/nest.ts', 'nest/worker.ts', 'geom/polygon.ts',
      'pdf/build.ts', 'pdf/layout.ts', 'pdf/trace.worker.ts', 'storage.ts']));
  });
  it.each(files)('%s has no string literal with a Czech diacritic', name => {
    const found = readFileSync(root + name, 'utf8').split('\n').flatMap((line, i) =>
      DIACRITIC.test(code(line)) && !(allowed[name] ?? []).some(pattern => pattern.test(line.trim())) ? [`${name}:${i + 1}: ${line.trim().slice(0, 100)}`] : []);
    expect(found).toEqual([]);
  });
  it('the allow-list still matches something (a stale entry hides nothing)', () => {
    for (const [name, patterns] of Object.entries(allowed)) {
      const lines = readFileSync(root + name, 'utf8').split('\n').map(line => line.trim());
      for (const pattern of patterns) expect(lines.some(line => pattern.test(line) && DIACRITIC.test(line)), `${name} ${pattern}`).toBe(true);
    }
  });
});
