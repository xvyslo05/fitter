import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportMarkup } from '../src/ui/export';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/ui/Layout.tsx', import.meta.url), 'utf8');
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  return Object.fromEntries([...css.slice(start, css.indexOf('}', start)).matchAll(/(--[\w-]+):([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}
const light = tokens(':root, .theme-light'), dark = tokens(':root[data-theme="dark"]');

afterEach(() => vi.unstubAllGlobals());
describe('layout export', () => {
  it('draws the layout only with palette tokens', () => {
    expect(layout).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i);
  });
  it('writes the light palette as literal colours, whatever theme is on screen', () => {
    const names = [...new Set([...layout.matchAll(/var\((--[\w-]+)\)/g)].map(m => m[1]))].concat([1, 2, 3, 4, 5, 6].map(n => `--piece-${n}`));
    for (const name of names) expect(light[name], name).toBeDefined();
    // What XMLSerializer gives for the on-screen SVG: token references in style attributes.
    const markup = `<svg xmlns="http://www.w3.org/2000/svg">${names.map(name => `<path style="fill: var(${name}); stroke: var(${name});"/>`).join('')}</svg>`;
    vi.stubGlobal('XMLSerializer', class { serializeToString() { return markup; } });
    // Dark is active: only the `.theme-light` probe resolves to the light palette.
    vi.stubGlobal('document', { documentElement: { className: '' }, body: { appendChild: <T>(node: T) => node }, createElement: () => ({ className: '', remove() {} }) });
    vi.stubGlobal('getComputedStyle', (node: { className: string }) => ({ getPropertyValue: (name: string) => ` ${(node.className === 'theme-light' ? light : dark)[name] ?? ''}` }));
    const exported = exportMarkup({} as Element);
    expect(exported).not.toContain('var(');
    for (const name of names) expect(exported).toContain(`<path style="fill: ${light[name]}; stroke: ${light[name]};"/>`);
    expect(light['--fabric']).not.toBe(dark['--fabric']);
    expect(exported).not.toContain(dark['--fabric']);
  });
});
