import { getLocale } from './index';
import type { Locale } from './index';

// Names a new pattern gets while no one has named it: data, not interface text. They become keys in saved patterns
// (`material` in `cut`, and in `workspace.fabrics`), so a stored pattern is never rewritten when the language changes:
// only patterns created from now on take the default of the language they are created in.
export interface DataDefaults { material: string; piece: string; pattern: string; option: string }
const DEFAULTS: Record<Locale, DataDefaults> = {
  cs: { material: 'hlavní', piece: 'Díl', pattern: 'Střih z PDF', option: 'možnost' },
  en: { material: 'main', piece: 'Piece', pattern: 'Pattern from PDF', option: 'option' },
};
export const dataDefaults = (locale: Locale = getLocale()): DataDefaults => DEFAULTS[locale];
