import { cs } from './cs';

// Flat dictionary, keys are `area.name`. Plural groups are `base.one`, `base.few`, `base.other` (Intl.PluralRules categories).
export type Key = keyof typeof cs;
export type PluralKey = { [K in Key]: K extends `${infer Base}.other` ? Base : never }[Key];
export type Params = Record<string, string | number>;

// The active locale is a module-level value so a later ticket can switch it; read it at call time, never cache the result.
const dictionaries: Record<string, Readonly<Record<string, string>>> = { cs };
let locale = 'cs';
export const getLocale = (): string => locale;
export function setLocale(next: string): void { locale = next; }

const lookup = (key: Key): string => dictionaries[locale]?.[key] ?? cs[key];

// `{name}` is replaced in one pass, so a parameter value is never read as a placeholder. A missing parameter stays visible.
export function t(key: Key, params?: Params): string {
  const text = lookup(key);
  return params ? text.replace(/\{([A-Za-z_]\w*)\}/g, (match, name: string) => Object.hasOwn(params, name) ? String(params[name]) : match) : text;
}

// Picks `key.one` / `key.few` / `key.other` by the locale's plural rule; `{n}` is always available in the text.
export function plural(key: PluralKey, n: number, params?: Params): string {
  const category = new Intl.PluralRules(locale).select(n);
  const chosen = (Object.hasOwn(dictionaries[locale] ?? cs, `${key}.${category}`) ? `${key}.${category}` : `${key}.other`) as Key;
  return t(chosen, { n, ...params });
}

const formats = new Map<string, Intl.NumberFormat>();
function format(n: number, min: number, max: number | undefined, grouping: boolean): string {
  const id = `${locale}|${min}|${max}|${grouping}`;
  let formatter = formats.get(id);
  if (!formatter) formats.set(id, formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: grouping }));
  return formatter.format(n);
}
export const fmt = {
  // Locale default (up to 3 decimals), or at most `digits`.
  number: (n: number, digits?: number): string => format(n, 0, digits, true),
  // Exactly `digits` decimals, no thousands separator.
  fixed: (n: number, digits: number): string => format(n, digits, digits, false),
  // A length in cm to one decimal; ticket 17 can switch the unit here.
  length: (cm: number): string => format(cm, 0, 1, true),
  date: (date: Date): string => date.toLocaleDateString(locale),
  lower: (text: string): string => text.toLocaleLowerCase(locale),
};
