import type { Piece, Pt } from '../src/model/pattern';
import type { NestOptions, NestPiece } from '../src/nest/types';

export const rectangle = (w: number, h: number): Pt[] => [[0, 0], [w, 0], [w, h], [0, h]];
export const diamond: Pt[] = [[0, 10], [10, 0], [20, 10], [10, 20]];
export const asymmetricPiece = (count: number): Piece => ({
  id: 'asymmetric', name: 'Asymetrický díl', cut: [{ material: 'Vnější látka', count }],
  sizes: { uni: { outline: [[0, 0], [10, 0], [3, 12], [0, 12]], bbox: [10, 12], area: 78 } },
});
export const options: NestOptions = { gap: 0.5, resolution: 0.5, timeMs: 0, seed: 123 };
export const square = (key: string, side = 10): NestPiece => ({ key, label: key, polygon: rectangle(side, side), rotation: '180' });
export function mixedPieces(count = 30): NestPiece[] {
  return Array.from({ length: count }, (_, i) => {
    const w = 5 + (i * 17) % 56, h = 5 + (i * 23) % 56;
    const polygon: Pt[] = i % 3 === 0 ? [[0, 0], [w, 0], [w, h * 0.4], [w * 0.4, h * 0.4], [w * 0.4, h], [0, h]] :
      i % 3 === 1 ? [[0, 0], [w, 0], [w * 0.8, h], [w * 0.15, h]] : rectangle(w, h);
    return { key: `synthetic-${i}`, label: `Zkušební díl ${i}`, polygon, rotation: i % 2 ? '90' : '180' };
  });
}
