import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inlineTokens, loadThemeChoice, resolveTheme, saveThemeChoice, sizeColor, THEME_KEY } from '../src/theme';
import { inkColor } from '../src/ui/PdfImport';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const TOKEN_BLOCKS = [':root, .theme-light', ':root[data-theme="dark"]', ':root:not([data-theme="light"])'];
// Custom properties of the rule with exactly this selector.
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No rule ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}
const palettes = { light: tokens(TOKEN_BLOCKS[0]), dark: tokens(TOKEN_BLOCKS[1]) };

// WCAG 2 relative luminance of an sRGB colour given as linear channels, #rgb or #rrggbb.
const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const linear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
function hex(value: string): number[] {
  const digits = value.slice(1), full = digits.length === 3 ? [...digits].map(d => d + d).join('') : digits;
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) throw new Error(`Not an opaque colour: ${value}`);
  return [0, 2, 4].map(i => linear(parseInt(full.slice(i, i + 2), 16) / 255));
}
// oklch() as OKLab [L, a, b] and as linear sRGB clipped to the gamut (https://bottosson.github.io/posts/oklab/).
function oklch(value: string): { lab: number[]; rgb: number[] } {
  const [l, c, h] = value.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/)!.slice(1).map(Number);
  const a = c * Math.cos(h * Math.PI / 180), b = c * Math.sin(h * Math.PI / 180);
  const [L, M, S] = [l + 0.3963377774 * a + 0.2158037573 * b, l - 0.1055613458 * a - 0.0638541728 * b, l - 0.0894841775 * a - 1.291485548 * b].map(v => v ** 3);
  const rgb = [4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S];
  return { lab: [l, a, b], rgb: rgb.map(v => Math.min(1, Math.max(0, v))) };
}
const contrast = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

afterEach(() => vi.unstubAllGlobals());
describe('theme preference', () => {
  const storage = (items: Map<string, string>) => ({ getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) });
  it('saves and loads the choice, defaulting to automatic', () => {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', storage(items));
    expect(loadThemeChoice()).toBe('auto');
    for (const choice of ['dark', 'light', 'auto'] as const) {
      expect(saveThemeChoice(choice)).toBe(true);
      expect(items.get(THEME_KEY)).toBe(choice);
      expect(loadThemeChoice()).toBe(choice);
    }
    items.set(THEME_KEY, 'sepia');
    expect(loadThemeChoice()).toBe('auto');
  });
  it('falls back to automatic when storage fails', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadThemeChoice()).toBe('auto');
    expect(saveThemeChoice('dark')).toBe(false);
  });
  it('resolves automatic to the system setting and keeps a pinned theme', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('applies a pinned choice before the first paint (inline script in index.html)', () => {
    const script = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1];
    const run = (localStorage: unknown) => {
      const document = { documentElement: { dataset: {} as Record<string, string> } };
      new Function('localStorage', 'document', script)(localStorage, document);
      return document.documentElement.dataset.theme;
    };
    expect(run(storage(new Map([[THEME_KEY, 'dark']])))).toBe('dark');
    expect(run(storage(new Map([[THEME_KEY, 'light']])))).toBe('light');
    expect(run(storage(new Map([[THEME_KEY, 'auto']])))).toBeUndefined();
    expect(run({ getItem: () => { throw new Error('blocked'); } })).toBeUndefined();
  });
});

describe('palette', () => {
  it('defines every token in both themes and keeps the two dark blocks identical', () => {
    expect(Object.keys(palettes.dark)).toEqual(Object.keys(palettes.light));
    expect(tokens(TOKEN_BLOCKS[2])).toEqual(palettes.dark);
    expect(css).toMatch(/:root\[data-theme="dark"\] \{\s*color-scheme:dark;/);
    expect(css).toMatch(/@media \(prefers-color-scheme:dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{\s*color-scheme:dark;/);
  });
  it('has colour values only in the token blocks', () => {
    let rest = css;
    for (const selector of TOKEN_BLOCKS) {
      const start = rest.indexOf(`${selector} {`);
      rest = rest.slice(0, start) + rest.slice(rest.indexOf('}', start) + 1);
    }
    const literal = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|(?<![\w-])(white|black|gr[ae]y|silver|red|green|blue|navy|teal|olive|maroon|purple|orange|yellow|beige|ivory)(?![\w-])/gi;
    expect(rest.match(literal)).toBeNull();
  });
  // [foreground, background, minimum]: 4.5 for text, 3 for large text, UI boundaries and drawings.
  const pairs: [string, string, number][] = [
    ...['--bg', '--surface', '--surface-alt', '--well', '--fabric'].flatMap(bg => [['--text', bg, 4.5], ['--muted', bg, 4.5]] as [string, string, number][]),
    ['--accent', '--surface', 4.5], ['--accent', '--hover', 4.5], ['--accent', '--pressed-bg', 4.5], ['--accent', '--info-bg', 4.5],
    ['--brand-text', '--surface', 4.5], ['--brand-text', '--sheet', 4.5],
    ['--on-green', '--green', 4.5], ['--on-green', '--green-hover', 4.5], ['--on-green', '--danger', 4.5],
    ['--warn-text', '--warn-bg', 4.5], ['--danger', '--danger-bg', 4.5],
    ['--brand-dot', '--bg', 3], ['--green', '--bg', 3], ['--control-border', '--surface', 3], ['--control-border', '--bg', 3],
    ['--focus', '--bg', 3], ['--focus', '--surface', 3],
    ['--ink', '--fabric', 3], ['--mark', '--fabric', 3],
    ...[1, 2, 3, 4, 5, 6].flatMap(n => [['--text', `--piece-${n}`, 4.5], ['--ink', `--piece-${n}`, 3], ['--mark', `--piece-${n}`, 3]] as [string, string, number][]),
    ['--seam', '--sheet', 3], ['--seam-ok', '--sheet', 3], ['--seam', '--surface', 3], ['--seam-ok', '--surface', 3],
    ['--sheet-frame', '--sheet', 3], ['--edge-hint', '--sheet', 3], ['--grain', '--sheet', 3], ['--grain', '--ref-fill', 3], ['--brand-text', '--ref-fill', 3],
  ];
  for (const [theme, palette] of Object.entries(palettes)) {
    it(`meets the WCAG contrast minimums in the ${theme} theme`, () => {
      const failures = pairs.map(([fg, bg, min]) => ({ fg, bg, min, ratio: contrast(hex(palette[fg]), hex(palette[bg])) })).filter(p => p.ratio < p.min);
      expect(failures).toEqual([]);
    });
    it(`keeps size colours readable and distinct in the ${theme} theme`, () => {
      const colors = Array.from({ length: 8 }, (_, i) => oklch(inlineTokens(sizeColor(i), name => palette[name])));
      for (const { rgb } of colors) {
        // Text in the legend and the candidate table, outlines on the canvas.
        expect(contrast(rgb, hex(palette['--surface']))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(rgb, hex(palette['--sheet']))).toBeGreaterThanOrEqual(4.5);
      }
      // OKLab distance between any two of the first eight sizes; 0.02 is about a just-noticeable difference.
      for (let i = 0; i < colors.length; i++) for (let j = 0; j < i; j++)
        expect(Math.hypot(...colors[i].lab.map((v, k) => v - colors[j].lab[k])), `sizes ${i} and ${j}`).toBeGreaterThan(0.05);
    });
  }
  it('draws PDF colours as printed in light and with inverted lightness in dark', () => {
    expect(inkColor([0, 0, 0], false)).toBe('rgb(0,0,0)');
    expect(inkColor([0, 0, 0], true)).toBe('rgb(255,255,255)');
    expect(inkColor([0.8, 0.1, 0.1], true)).toBe('rgb(230,51,51)');
    expect(inkColor([1, 0, 0], true)).toBe('rgb(255,0,0)');
  });
});
