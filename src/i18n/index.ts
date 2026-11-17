import { cs } from './cs';
import { AppError } from '../errors';
import type { ErrorParams, Note, PathField, PlainCode, PluralCode } from '../errors';

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
// `{name:n1}` / `{name:n2}` write a number with at most 1 / 2 decimals, `{name:f2}` with exactly 2 (a decimal comma, no grouping; a value that is not finite is "?").
export function t(key: Key, params?: Params): string {
  const text = lookup(key);
  return params ? text.replace(/\{([A-Za-z_]\w*)(?::([nf])(\d))?\}/g, (match, name: string, kind?: string, digits?: string) => {
    if (!Object.hasOwn(params, name)) return match;
    const value = params[name];
    if (!kind || typeof value !== 'number') return String(value);
    return Number.isFinite(value) ? (kind === 'f' ? fmt.fixed : fmt.plain)(value, Number(digits)) : '?';
  }) : text;
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
  // At most `digits` decimals, no thousands separator.
  plain: (n: number, digits: number): string => format(n, 0, digits, false),
  // Locale default (up to 3 decimals), or at most `digits`.
  number: (n: number, digits?: number): string => format(n, 0, digits, true),
  // Exactly `digits` decimals, no thousands separator.
  fixed: (n: number, digits: number): string => format(n, digits, digits, false),
  // A length in cm to one decimal; ticket 17 can switch the unit here.
  length: (cm: number): string => format(cm, 0, 1, true),
  date: (date: Date): string => date.toLocaleDateString(locale),
  lower: (text: string): string => text.toLocaleLowerCase(locale),
};

// Every code has its text under `error.<code>` (plural codes under `error.<code>.other`, with `.one` and `.few`), every path field under `error.path.<field>`.
type ErrorKey = `error.${PlainCode}` | `error.${PluralCode}.other` | `error.path.${PathField}` | 'error.path.piece';
const complete: Record<ErrorKey, string> = cs;
void complete;

// "Díl 3 / XL.outline[2]": a piece (and size) or a named field, then the technical `sub` path.
function where(params: Params): string {
  const base = params.piece !== undefined ? `${t('error.path.piece', { piece: params.piece })}${params.size !== undefined ? ` / ${params.size}` : ''}`
    : t(`error.path.${params.field}` as Key);
  return params.sub === undefined ? base : `${base}.${params.sub}`;
}

// The text of an error or note. A parameter that is itself a note is described first, so causes and phrases nest.
export function describe(note: Note): string {
  const params: Params = {};
  for (const [name, value] of Object.entries(note.params ?? {} as ErrorParams)) params[name] = typeof value === 'object' ? describe(value) : value;
  if (note.code.startsWith('pattern.') && (params.piece !== undefined || params.field !== undefined)) params.path = where(params);
  const key = `error.${note.code}`;
  return Object.hasOwn(cs, `${key}.other`) ? plural(key as PluralKey, Number(params.n), params) : t(key as Key, params);
}
// The text of a caught exception: an AppError through the dictionary, an Error thrown with text already translated as it is, anything else `fallback`.
export const errorText = (e: unknown, fallback: Key): string => e instanceof AppError ? describe(e) : e instanceof Error ? e.message : t(fallback);
