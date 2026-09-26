import { area, bbox } from '../geom/polygon';
import type { PdfDoc, PdfPath, PdfText, Pt, ScaleResult } from './types';

export const CM_PER_PT = 2.54 / 72;
const standards = [2.54, 3, 4, 5, 10];
function squareSide(points: Pt[], closed: boolean): number | undefined {
  if (points.length < 4 || points.length > 5 || !closed) return;
  const b = bbox(points);
  if (b.width < 60 || b.width > 320 || Math.abs(b.width - b.height) > Math.max(0.8, b.width * 0.01)) return;
  if (Math.abs(area(points) / (b.width * b.height) - 1) > 0.01) return;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], c = points[(i + 1) % points.length];
    if (Math.abs(a[0] - c[0]) > 0.3 && Math.abs(a[1] - c[1]) > 0.3) return;
    if (Math.min(Math.abs(a[0] - b.minX), Math.abs(a[0] - b.maxX)) > 0.3 ||
      Math.min(Math.abs(a[1] - b.minY), Math.abs(a[1] - b.maxY)) > 0.3) return;
  }
  return (b.width + b.height) / 2;
}
function squareCandidates(doc: PdfDoc) {
  const candidates: { result: ScaleResult; score: number; path: PdfPath; subpath: number; labelled: boolean }[] = [];
  for (const page of doc.pages) for (const path of page.paths) path.subpaths.forEach((points, i) => {
    const coincident = points.length > 2 && Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) < 0.3;
    const side = squareSide(points, path.closed[i] || !!path.fill || coincident);
    if (!side) return;
    const b = bbox(points);
    let score = 0, namedCm: number | undefined;
    for (const t of page.texts) {
      const distance = Math.hypot(Math.max(b.minX - t.x, 0, t.x - b.maxX), Math.max(b.minY - t.y, 0, t.y - b.maxY));
      if (distance > Math.max(80, side)) continue;
      const m = /(\d+(?:[.,]\d+)?)\s*(?:[x×]\s*(\d+(?:[.,]\d+)?)\s*)?cm\b/i.exec(t.str);
      const n = m ? Number(m[1].replace(',', '.')) : 0;
      const squareLabel = m && (!m[2] || Math.abs(n - Number(m[2].replace(',', '.'))) < 0.01);
      const weight = squareLabel && n > 0 && n <= 20 ? 4 : /kontroll|test|kontroln/i.test(t.str) ? 2 : 0;
      const value = weight / (1 + distance / side);
      if (value > score) { score = value; namedCm = squareLabel && weight === 4 ? n : undefined; }
    }
    const physical = side * CM_PER_PT;
    const standard = standards.reduce((a, n) => Math.abs(n - physical) < Math.abs(a - physical) ? n : a);
    const snap = Math.abs(physical / standard - 1) <= 0.03;
    if (!score && !snap) return;
    const squareCm = namedCm ?? (snap ? standard : physical);
    candidates.push({ result: { cmPerPt: squareCm / side, source: 'square', squareCm, measuredPt: side, page: page.index }, score: score + (snap ? 0.5 : 0), path, subpath: i, labelled: score >= 1 });
  });
  return candidates;
}
export function detectScale(doc: PdfDoc): ScaleResult {
  const candidates = squareCandidates(doc);
  return candidates.sort((a, b) => b.score - a.score)[0]?.result ?? { cmPerPt: CM_PER_PT, source: 'default' };
}
// Calibration marks can share the cutting-line style, and their labels can be
// painted glyphs rather than PDF text. Also remove copies of the detected square
// (half-point tolerance accommodates separate, slightly different drawings).
export function withoutScaleMarks(paths: PdfPath[], texts: PdfText[], scale?: ScaleResult): PdfPath[] {
  const marks = squareCandidates({ pages: [{ index: 1, width: 0, height: 0, clips: [], paths, texts }] })
    .filter(c => c.labelled || (scale?.source === 'square' && Math.abs(c.result.measuredPt! - scale.measuredPt!) < 0.5));
  return paths.flatMap(path => {
    const indices = path.subpaths.map((_, i) => i).filter(i => !marks.some(m => m.path === path && m.subpath === i));
    return indices.length === path.subpaths.length ? [path] : indices.length ? [{ ...path, subpaths: indices.map(i => path.subpaths[i]), closed: indices.map(i => path.closed[i]) }] : [];
  });
}
export function overrideScale(scale: ScaleResult, squareCm: number): ScaleResult {
  if (!scale.measuredPt || !Number.isFinite(squareCm) || squareCm <= 0) throw new Error('Zadejte kladnou velikost nalezeného čtverce v cm.');
  return { ...scale, squareCm, cmPerPt: squareCm / scale.measuredPt };
}
