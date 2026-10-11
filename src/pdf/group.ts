import { area, bbox, intersectionArea } from '../geom/polygon';
import type { PdfText, PieceCandidate, Pt } from './types';

export function containsPoint(ring: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function groupPieces(outlines: Record<string, Pt[][]>, texts: PdfText[]): PieceCandidate[] {
  const sizes = Object.keys(outlines).sort((a, b) => outlines[b].reduce((s, p) => s + area(p), 0) - outlines[a].reduce((s, p) => s + area(p), 0));
  const candidates: PieceCandidate[] = [];
  const add = (size: string, ring: Pt[]) => candidates.push({ id: candidates.length + 1, refSize: size, sizes: { [size]: ring },
    labels: [...new Set(texts.filter(t => containsPoint(ring, t.x, t.y)).map(t => t.str))] });
  if (!sizes.length) return candidates;
  for (const ring of outlines[sizes[0]]) add(sizes[0], ring);
  const references = [...candidates];
  for (const size of sizes.slice(1)) {
    const matches = outlines[size].map(ring => {
      let best: PieceCandidate | undefined, shared = 0;
      const a = bbox(ring), ringArea = area(ring);
      for (const candidate of references) {
        const ref = candidate.sizes[candidate.refSize], b = bbox(ref);
        if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) continue;
        const common = intersectionArea(ring, ref);
        if (common / Math.min(ringArea, area(ref)) >= 0.5 && common > shared) { best = candidate; shared = common; }
      }
      return { ring, best, shared };
    // Shared area, not the overlap ratio, decides: a small mark inside a piece overlaps it
    // completely too, but must neither claim the piece nor attract the piece's own outline.
    }).sort((a, b) => b.shared - a.shared);
    for (const { ring, best } of matches) {
      if (best && !Object.hasOwn(best.sizes, size)) Object.defineProperty(best.sizes, size, { value: ring, enumerable: true, writable: true, configurable: true });
      else add(size, ring);
    }
  }
  return candidates;
}
