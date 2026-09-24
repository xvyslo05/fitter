import type { PatternFile, PieceSize, Pt } from './pattern';
import { area, bbox } from '../geom/polygon';

function shape(outline: Pt[], fold?: [Pt, Pt]): PieceSize {
  const b = bbox(outline);
  return { outline, fold, bbox: [b.width, b.height], area: area(outline) };
}

export const demo: PatternFile = {
  format: 'fitter-pattern@1', id: 'fitter-synthetic-demo', name: 'Demo · Geometrická taška',
  author: 'fitter', seamAllowance: 'none', sizes: ['uni'],
  notes: 'Vlastní smyšlené tvary pro vyzkoušení aplikace. Nejde o střih určený k šití.',
  pieces: [
    { id: 'body', name: 'Tělo na přehybu', cut: [{ material: 'Vnější látka', count: 1 }, { material: 'Podšívka', count: 1 }],
      sizes: { uni: shape([[0, 0], [18, 0], [22, 28], [18, 34], [0, 34]], [[0, 0], [0, 34]]) } },
    { id: 'handle', name: 'Ucho', cut: [{ material: 'Vnější látka', count: 2 }],
      sizes: { uni: shape([[0, 0], [7, 0], [7, 48], [0, 48]]) } },
    { id: 'pocket-small', name: 'Kapsa malá', variantGroup: 'Kapsa', variant: 'Malá', cut: [{ material: 'Vnější látka', count: 1 }],
      sizes: { uni: shape([[0, 0], [16, 0], [16, 14], [12, 18], [4, 18], [0, 14]]) } },
    { id: 'pocket-large', name: 'Kapsa velká', variantGroup: 'Kapsa', variant: 'Velká', cut: [{ material: 'Vnější látka', count: 1 }],
      sizes: { uni: shape([[0, 0], [24, 0], [24, 22], [0, 22]]) } },
    { id: 'tab', name: 'Poutko', optional: true, cut: [{ material: 'Vnější látka', count: 1 }],
      sizes: { uni: shape([[0, 0], [5, 0], [5, 12], [0, 12]]) } },
  ],
};
