import { useEffect, useState } from 'preact/hooks';

// “Vzhled”: follow the system or pin light/dark. The colour tokens themselves live in styles.css.
export type ThemeChoice = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';
// index.html reads the same key before the first paint.
export const THEME_KEY = 'fitter:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function loadThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch { return 'auto'; }
}
export function saveThemeChoice(choice: ThemeChoice): boolean {
  try { localStorage.setItem(THEME_KEY, choice); return true; }
  catch { return false; }
}
export const resolveTheme = (choice: ThemeChoice, systemDark: boolean): Theme => choice === 'auto' ? systemDark ? 'dark' : 'light' : choice;

// `data-theme` selects the token block; without it styles.css follows the system. The browser colour
// (<meta name="theme-color">) follows the pinned theme through the metas' media queries.
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'auto') delete root.dataset.theme; else root.dataset.theme = choice;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][data-scheme]')) {
    const scheme = meta.dataset.scheme;
    meta.media = choice === 'auto' ? `(prefers-color-scheme: ${scheme})` : choice === scheme ? 'all' : 'not all';
  }
}
function activeTheme(): Theme {
  const pinned = document.documentElement.dataset.theme;
  return resolveTheme(pinned === 'light' || pinned === 'dark' ? pinned : 'auto', matchMedia(DARK_QUERY).matches);
}
// The theme on screen, for drawings that cannot use CSS (canvas): changes with the choice and, on
// “Automaticky”, with the system setting.
export function useTheme(): Theme {
  const [theme, setTheme] = useState(activeTheme);
  useEffect(() => {
    const update = () => setTheme(activeTheme()), media = matchMedia(DARK_QUERY), observer = new MutationObserver(update);
    media.addEventListener('change', update);
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    return () => { media.removeEventListener('change', update); observer.disconnect(); };
  }, []);
  return theme;
}

// Replaces each var(--name) with the token's value: canvas colours and self-contained exports.
export const inlineTokens = (value: string, token: (name: string) => string) =>
  value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => token(name));
// Distinct hues for any number of sizes (golden angle); lightness and chroma come from the palette.
export const sizeColor = (index: number) => `oklch(var(--size-l) var(--size-c) ${(index * 137.5 + 250) % 360})`;
