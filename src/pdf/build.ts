import { area, bbox, rotate, signedArea } from '../geom/polygon';
import type { PatternFile, Piece, PieceSize, SeamAllowance } from '../model/pattern';
import { openRing, sizeFolds } from './pieces';
import type { PieceDraft } from './pieces';
import type { PdfText, Pt, TraceResult } from './types';

export interface PatternMeta { id: string; name: string; author?: string; source?: string; seamAllowance: SeamAllowance; sizes: string[] }

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits || 0;
function centroid(ring: Pt[]): Pt {
  let x = 0, y = 0;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], cross = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
  });
  const sixArea = 6 * signedArea(ring);
  return [x / sixArea, y / sixArea];
}

// As tools/pattern-extract/extract.py cmd_build: every size is rotated about the reference outline's
// centroid by 90° − grain so the grain runs along +y, scaled to cm and moved to a zero bbox minimum.
// Rings keep the offline builder's winding (negative shoelace sum; clockwise if y pointed up).
export function buildPattern(result: TraceResult, drafts: PieceDraft[], meta: PatternMeta): PatternFile {
  const k = result.cmPerPt, ids = new Set<string>();
  const pieces = drafts.filter(d => d.include).map((draft): Piece => {
    const candidate = result.candidates.find(c => c.id === draft.candidateId);
    if (!candidate) throw new Error(`Díl ${draft.candidateId} už mezi kandidáty není.`);
    const origin = centroid(openRing(candidate.sizes[candidate.refSize])), folds = sizeFolds(candidate, draft.foldEdge, k);
    const place = (points: Pt[]): Pt[] => rotate(points.map(([x, y]) => [x - origin[0], y - origin[1]]), 90 - draft.grainAngle).map(([x, y]) => [x * k, y * k]);
    const sizes: Record<string, PieceSize> = {};
    for (const size of meta.sizes.filter(s => Object.hasOwn(candidate.sizes, s))) {
      const placed = place(openRing(candidate.sizes[size])), b = bbox(placed);
      const move = ([x, y]: Pt): Pt => [round(x - b.minX), round(y - b.minY)];
      const outline = placed.map(move).filter((p, i, all) => { const q = all[(i + 1) % all.length]; return p[0] !== q[0] || p[1] !== q[1]; });
      if (signedArea(outline) > 0) outline.reverse();
      const fold = folds[size], bounds = bbox(outline);
      sizes[size] = { outline, ...(fold ? { fold: place(fold).map(move) as [Pt, Pt] } : {}),
        bbox: [round(bounds.width, 1), round(bounds.height, 1)], area: round(area(outline), 1) };
    }
    const id = uniqueId(slug(draft.name) || `dil-${candidate.id}`, ids);
    ids.add(id);
    return { id, name: draft.name.trim(), cut: draft.cut.map(c => ({ material: c.material.trim(), count: c.count })),
      ...(draft.optional ? { optional: true } : {}), ...(draft.variantGroup.trim() ? { variantGroup: draft.variantGroup.trim() } : {}),
      ...(draft.variant.trim() ? { variant: draft.variant.trim() } : {}), sizes };
  });
  return { format: 'fitter-pattern@1', id: meta.id, name: meta.name.trim(), ...(meta.author?.trim() ? { author: meta.author.trim() } : {}),
    ...(meta.source ? { source: meta.source } : {}), seamAllowance: meta.seamAllowance,
    sizes: meta.sizes.filter(s => pieces.some(p => Object.hasOwn(p.sizes, s))), pieces };
}

// Phrases that remove "none" are cut out before looking for "included" ("bez přídavků na švy"
// must not count as "přídavky na švy"). Both kinds, or neither: unknown.
const NONE = /ohne\s+nahtzugaben?|keine?\s+nahtzugaben?|nahtzugaben?\s+(?:ist|sind)\s+nicht\s+(?:enthalten|inbegriffen)|(?:zzgl\.?|zuzüglich)\s+nahtzugaben?|nahtzugaben?\s+(?:hinzufügen|zugeben)|bez\s+(?:švových\s+)?(?:přídavků|záložek)|přídavky\s+na\s+švy\s+(?:nejsou|není)|(?:přidejte|připočtěte|přičtěte|připočítejte)\s+(?:\p{L}+\s+)?přídavky|without\s+seam\s+allowances?|no\s+seam\s+allowances?|seam\s+allowances?\s+(?:is|are)\s+not\s+included|add\s+(?:\p{L}+\s+)?seam\s+allowances?|sans\s+(?:les\s+)?marges?\s+de\s+couture/giu;
const INCLUDED = /nahtzugaben?\s+(?:(?:ist|sind)\s+)?(?:enthalten|inbegriffen|inklusive)|(?:inkl\.?|inklusive|mit)\s+nahtzugaben?|přídavky\s+na\s+švy|včetně\s+(?:švových\s+)?(?:přídavků|záložek)|seam\s+allowances?\s+(?:(?:is|are)\s+)?included|includ(?:es|ing)\s+(?:\p{L}+\s+)?seam\s+allowances?|marges?\s+de\s+couture\s+(?:incluses?|comprises?)/iu;
export function suggestSeamAllowance(texts: PdfText[]): SeamAllowance {
  const text = texts.map(t => t.str).join(' ').replace(/\s+/g, ' '), rest = text.replace(NONE, ' ');
  const none = rest !== text, included = INCLUDED.test(rest);
  return none === included ? 'unknown' : none ? 'none' : 'included';
}

const LETTERS = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
// Numbers numerically, then letter sizes XS < S < M < L < XL < XXL (2XL = XXL), then other text.
export function sortSizes(sizes: string[]): string[] {
  const collator = new Intl.Collator('cs', { numeric: true, sensitivity: 'base' });
  const rank = (size: string): [number, number] => {
    const s = size.trim(), letter = LETTERS.indexOf(s.toUpperCase().replace(/^(\d)X(?=[SL]$)/, (_, n: string) => 'X'.repeat(Number(n))));
    return /^\d+(?:[.,]\d+)?$/.test(s) ? [0, Number(s.replace(',', '.'))] : letter >= 0 ? [1, letter] : [2, 0];
  };
  return [...sizes].sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1] || collator.compare(a, b); });
}

export const slug = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let id = base, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  return id;
}
// Trailing file-name noise: paper formats and words like "střih" or "Schnittmuster".
const NOISE = /[\s_–-]+(?:a[0-4]|us[\s_-]*letter|letter|legal|st[řr]ih|schnittmuster|pattern|ebook|print|copyshop)$/iu;
// The PDF title unless it is empty or an application's file name, else the file name; trailing noise
// is removed repeatedly, but a name made only of noise stays as it is.
export function patternName(title: string | undefined, fileName: string): string {
  const t = title?.trim();
  const name = t && !/\.(?:docx?|indd|ai|pdf|psd|cdr|svg)$/i.test(t) && !/^(?:untitled|bez názvu)$/i.test(t) ? t
    : fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  let rest = ` ${name}`;
  while (NOISE.test(rest)) rest = rest.replace(NOISE, '');
  return rest.trim() || name || 'Střih z PDF';
}
