import { cs } from './cs';
import { en } from './en';
import { CM_PER_INCH, toUnit } from './units';
import type { Unit } from './units';
import { AppError } from '../errors';
import type { ErrorParams, Note, PathField, PlainCode, PluralCode } from '../errors';

// Flat dictionary, keys are `area.name`. Plural groups are `base.one`, `base.few`, `base.other` (Intl.PluralRules categories).
export type Key = keyof typeof cs;
export type PluralKey = { [K in Key]: K extends `${infer Base}.other` ? Base : never }[Key];
export type Params = Record<string, string | number>;

// The active locale is a module-level value (a tiny store, see useLocale in ./hooks); read it at call time, never cache the result.
const dictionaries: Record<Locale, Readonly<Record<string, string>>> = { cs, en };
export type Locale = 'cs' | 'en';
export { CM_PER_INCH, fromUnit, parseLength, toUnit } from './units';
export type { Unit } from './units';
export const LOCALE_KEY = 'fitter:locale', UNIT_KEY = 'fitter:unit';
// `languages` is navigator.languages: only the first one counts, Czech and Slovak read as cs, everything else as en. A stored choice wins.
export function detectLocale(languages: readonly string[], stored?: string | null): Locale {
  if (stored === 'cs' || stored === 'en') return stored;
  const first = languages[0];
  return first === undefined || /^(?:cs|sk)(?:-|_|$)/i.test(first) ? 'cs' : 'en';
}
// Inches by default only for en-US; every other locale reads centimetres.
export const defaultUnit = (locale: Locale, primaryLanguage: string): Unit => locale === 'en' && /^en[-_]us$/i.test(primaryLanguage) ? 'in' : 'cm';

let locale: Locale = 'cs', unitChoice: Unit | null = null, primaryLanguage = '';
const listeners = new Set<() => void>();
const notify = () => { for (const listener of [...listeners]) listener(); };
export const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getLocale = (): Locale => locale;
export const getUnit = (): Unit => unitChoice ?? defaultUnit(locale, primaryLanguage);
// These two only switch the running app (tests use them); chooseLocale / chooseUnit also store the choice.
export function setLocale(next: Locale): void { locale = next; notify(); }
export function setUnit(next: Unit | null): void { unitChoice = next; notify(); }

const stored = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const store = (key: string, value: string): void => { try { localStorage.setItem(key, value); } catch { /* no storage: the choice lasts until the page closes */ } };
// Language, title and description of the page follow the locale (index.html sets `lang` before the first paint from the same key).
export function applyDocument(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.title = t('app.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
}
// Reads the stored choices, else the browser's languages; call once before the first render.
export function initLocale(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): void {
  primaryLanguage = languages[0] ?? '';
  const unit = stored(UNIT_KEY);
  locale = detectLocale(languages, stored(LOCALE_KEY));
  unitChoice = unit === 'cm' || unit === 'in' ? unit : null;
  applyDocument();
  notify();
}
export function chooseLocale(next: Locale): void { store(LOCALE_KEY, next); setLocale(next); applyDocument(); }
export function chooseUnit(next: Unit): void { store(UNIT_KEY, next); setUnit(next); }

const lookup = (key: Key): string => dictionaries[locale][key] ?? cs[key];

// Numbers of the model that the dictionary quotes (limits in cm), so a text can say "0–10 cm" or "0–3.94 in" without every caller passing them.
const LIMITS_CM: Record<string, number> = { seamMax: 10, gapMax: 10, resolutionMin: 0.25, resolutionMax: 1, widthMax: 1000, lengthMax: 10_000,
  foldTolerance: 0.2, gapAdvice: 0.5, foldMin: 5, squareExample: 4.8 };
const PLACEHOLDER = /\{([A-Za-z_]\w*)(?::(?:([nfld])(\d)|(buy)))?\}/g;
// `{name}` is replaced in one pass, so a parameter value is never read as a placeholder. A missing parameter stays visible.
// `{name:n1}` / `{name:n2}` write a number with at most 1 / 2 decimals, `{name:f2}` with exactly 2 (no grouping; a value that is not finite is "?").
// `{name:d1}` is a length given in cm, written in the unit on screen with up to 1 decimal (up to 2 in inches); `{name:l1}` adds the unit.
// `{name:buy}` is a length in metres, written as metres (cm) or as yards (inches). `{unit}` is the unit's label.
export function t(key: Key, params: Params = {}): string {
  return lookup(key).replace(PLACEHOLDER, (match, name: string, kind?: string, digits?: string, buy?: string) => {
    const value = Object.hasOwn(params, name) ? params[name] : name === 'unit' ? fmt.unit() : Object.hasOwn(LIMITS_CM, name) ? LIMITS_CM[name] : undefined;
    if (value === undefined) return match;
    if (typeof value !== 'number' || (!kind && !buy)) return String(value);
    if (buy) return Number.isFinite(value) ? fmt.buy(value) : '?';
    if (kind === 'l') return `${Number.isFinite(value) ? fmt.length(value, getUnit(), Number(digits)) : '?'} ${fmt.unit()}`;
    if (!Number.isFinite(value)) return '?';
    return (kind === 'f' ? fmt.fixed : kind === 'd' ? (n: number, d: number) => fmt.length(n, getUnit(), d) : fmt.plain)(value, Number(digits));
  });
}

// Picks `key.one` / `key.few` / `key.other` by the locale's plural rule; `{n}` is always available in the text.
export function plural(key: PluralKey, n: number, params?: Params): string {
  const category = new Intl.PluralRules(locale).select(n);
  const chosen = (Object.hasOwn(dictionaries[locale], `${key}.${category}`) ? `${key}.${category}` : `${key}.other`) as Key;
  return t(chosen, { n, ...params });
}

const formats = new Map<string, Intl.NumberFormat>();
function format(n: number, min: number, max: number | undefined, grouping: boolean): string {
  const id = `${locale}|${min}|${max}|${grouping}`;
  let formatter = formats.get(id);
  if (!formatter) formats.set(id, formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: grouping }));
  return formatter.format(n);
}
const M_PER_YARD = 0.9144;
export const fmt = {
  // At most `digits` decimals, no thousands separator.
  plain: (n: number, digits: number): string => format(n, 0, digits, false),
  // Locale default (up to 3 decimals), or at most `digits`.
  number: (n: number, digits?: number): string => format(n, 0, digits, true),
  // Exactly `digits` decimals, no thousands separator.
  fixed: (n: number, digits: number): string => format(n, digits, digits, false),
  // A length given in cm, as a number in `unit`: up to `digits` decimals in cm, one more in inches (at most 3).
  length: (cm: number, unit: Unit = getUnit(), digits = 1): string => format(toUnit(cm, unit), 0, unit === 'in' ? Math.min(digits + 1, 3) : digits, true),
  // The same for a text field: no thousands separator, 2 decimals in cm, 3 in inches.
  field: (cm: number, unit: Unit = getUnit()): string => format(toUnit(cm, unit), 0, unit === 'in' ? 3 : 2, false),
  // An area given in cm², as a number in the squared unit.
  area: (cm2: number, unit: Unit = getUnit()): number => unit === 'in' ? cm2 / CM_PER_INCH ** 2 : cm2,
  unit: (unit: Unit = getUnit()): string => t(`unit.${unit}`),
  // Length to buy, given in metres: "2,50 m", or in inches mode yards rounded up: "2.75 yd".
  buy: (metres: number): string => getUnit() === 'in' ? `${format(Math.ceil(metres / M_PER_YARD * 100 - 1e-9) / 100, 2, 2, false)} ${t('unit.yd')}` : `${format(metres, 2, 2, false)} ${t('unit.m')}`,
  date: (date: Date): string => date.toLocaleDateString(locale, locale === 'en' ? { dateStyle: 'medium' } : undefined),
  // Date of a backup: "03.05.2026" in Czech, "May 3, 2026" in English.
  shortDate: (date: Date): string => locale === 'cs' ? `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}` : fmt.date(date),
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
