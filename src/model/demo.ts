import type { PatternFile, PieceSize, Pt } from './pattern';
import { area, bbox } from '../geom/polygon';

function shape(outline: Pt[], fold?: [Pt, Pt]): PieceSize {
  const b = bbox(outline);
  return { outline, fold, bbox: [b.width, b.height], area: area(outline) };
}

// The built-in sample is never stored, so it can speak the language of the screen: `demoPattern(locale)` gives the same pattern
// (same id, piece ids, sizes and geometry) with names and materials in that language. `demo` is the Czech one.
const NAMES = {
  cs: { name: 'Demo · Geometrická taška', notes: 'Vlastní smyšlené tvary pro vyzkoušení aplikace. Nejde o střih určený k šití.', outer: 'Vnější látka', lining: 'Podšívka',
    body: 'Tělo na přehybu', handle: 'Ucho', pocket: 'Kapsa', small: 'Malá', large: 'Velká', pocketSmall: 'Kapsa malá', pocketLarge: 'Kapsa velká', tab: 'Poutko' },
  en: { name: 'Demo · Geometric bag', notes: 'Made-up shapes for trying out the app. This is not a pattern to sew from.', outer: 'Outer fabric', lining: 'Lining',
    body: 'Body on the fold', handle: 'Handle', pocket: 'Pocket', small: 'Small', large: 'Large', pocketSmall: 'Small pocket', pocketLarge: 'Large pocket', tab: 'Tab' },
} as const;
export const DEMO_ID = 'fitter-synthetic-demo';
export function demoPattern(locale: 'cs' | 'en'): PatternFile {
  const n = NAMES[locale];
  return {
    format: 'fitter-pattern@1', id: DEMO_ID, name: n.name,
    author: 'fitter', seamAllowance: 'none', sizes: ['uni'],
    notes: n.notes,
    pieces: [
      { id: 'body', name: n.body, cut: [{ material: n.outer, count: 1 }, { material: n.lining, count: 1 }],
        sizes: { uni: shape([[0, 0], [18, 0], [22, 28], [18, 34], [0, 34]], [[0, 0], [0, 34]]) } },
      { id: 'handle', name: n.handle, cut: [{ material: n.outer, count: 2 }],
        sizes: { uni: shape([[0, 0], [7, 0], [7, 48], [0, 48]]) } },
      { id: 'pocket-small', name: n.pocketSmall, variantGroup: n.pocket, variant: n.small, cut: [{ material: n.outer, count: 1 }],
        sizes: { uni: shape([[0, 0], [16, 0], [16, 14], [12, 18], [4, 18], [0, 14]]) } },
      { id: 'pocket-large', name: n.pocketLarge, variantGroup: n.pocket, variant: n.large, cut: [{ material: n.outer, count: 1 }],
        sizes: { uni: shape([[0, 0], [24, 0], [24, 22], [0, 22]]) } },
      { id: 'tab', name: n.tab, optional: true, cut: [{ material: n.outer, count: 1 }],
        sizes: { uni: shape([[0, 0], [5, 0], [5, 12], [0, 12]]) } },
    ],
  };
}
export const demo: PatternFile = demoPattern('cs');
