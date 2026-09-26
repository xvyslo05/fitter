import type { PageLayout, PagePlacement, PdfDoc, PdfPath, PdfText } from './types';
import { seamMatches, matchPages } from './match';

export function validateLayout(doc: PdfDoc, layout: PageLayout): void {
  if (layout.step.length !== 2 || layout.step.some(n => !Number.isFinite(n) || n <= 0)) throw new Error('Krok dlaždic musí být kladné číslo.');
  if (!layout.blocks.length) throw new Error('Přidejte alespoň jeden blok.');
  const available = new Set(doc.pages.map(p => p.index)), used = new Set<number>();
  for (const block of layout.blocks) {
    const [first, last] = block.pages;
    if (!Number.isInteger(first) || !Number.isInteger(last) || first > last || !available.has(first) || !available.has(last)) throw new Error('Zadejte platný rozsah stránek.');
    if (!block.rows.length || block.rows.some(n => !Number.isInteger(n) || n <= 0) || block.rows.reduce((a, b) => a + b, 0) !== last - first + 1) throw new Error('Součet dlaždic v řádcích musí odpovídat počtu stránek bloku.');
    for (let p = first; p <= last; p++) {
      if (!available.has(p) || used.has(p)) throw new Error('Stránka chybí nebo se opakuje ve více blocích.');
      used.add(p);
    }
  }
}
export function unusedPages(doc: PdfDoc, layout: PageLayout): number[] {
  return doc.pages.filter(p => !layout.blocks.some(b => p.index >= b.pages[0] && p.index <= b.pages[1])).map(p => p.index);
}
export function placePages(doc: PdfDoc, layout: PageLayout) {
  validateLayout(doc, layout);
  const placements: PagePlacement[] = [], seams: { a: number; b: number; matched: boolean }[] = [];
  const pages = new Map(doc.pages.map(p => [p.index, p])), matches = [...matchPages(doc), ...seamMatches(doc, layout.step)];
  let left = 0;
  layout.blocks.forEach((block, index) => {
    let page = block.pages[0], right = left;
    block.rows.forEach((count, row) => {
      for (let col = 0; col < count; col++, page++) {
        const x = left + col * layout.step[0], y = row * layout.step[1];
        placements.push({ page, block: index, col, row, x, y });
        right = Math.max(right, x + pages.get(page)!.width);
      }
    });
    left = right + 36;
  });
  for (const a of placements) for (const b of placements) {
    if (a.block !== b.block || !((b.col === a.col + 1 && b.row === a.row) || (b.row === a.row + 1 && b.col === a.col))) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const shared = matches.some(m => m.a === a.page && m.b === b.page && m.votes >= 2 && Math.abs(m.dx - dx) < 1 && Math.abs(m.dy - dy) < 1);
    seams.push({ a: a.page, b: b.page, matched: shared });
  }
  return { placements, seams };
}

// Deduplicate in sheet space, including subpaths grouped differently on pages.
export function assemblePaths(doc: PdfDoc, placements: PagePlacement[]): PdfPath[] {
  const pages = new Map(doc.pages.map(p => [p.index, p])), seen = new Map<string, PdfPath[]>(), result: PdfPath[] = [];
  for (const placement of placements) for (const path of pages.get(placement.page)!.paths) {
    path.subpaths.forEach((points, i) => {
      if (points.length < 2) return;
      const moved = points.map(([x, y]): [number, number] => [x + placement.x, y + placement.y]);
      const style = `${moved.length}:${path.closed[i]}:${path.stroke}:${path.fill}:${path.lineWidth}:${path.dash}:${path.dashPhase}:${path.ctm}`;
      const x = Math.round(moved[0][0] / 0.2), y = Math.round(moved[0][1] / 0.2);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const neighbours = seen.get(`${x + dx}:${y + dy}:${style}`);
        if (neighbours?.some(other => moved.every((p, n) => Math.abs(p[0] - other.subpaths[0][n][0]) < 0.2 && Math.abs(p[1] - other.subpaths[0][n][1]) < 0.2))) return;
      }
      const key = `${x}:${y}:${style}`, bucket = seen.get(key) ?? [];
      const assembled = { ...path, subpaths: [moved], closed: [path.closed[i]] };
      bucket.push(assembled); seen.set(key, bucket); result.push(assembled);
    });
  }
  return result;
}

export function assembleTexts(doc: PdfDoc, placements: PagePlacement[]): PdfText[] {
  const pages = new Map(doc.pages.map(p => [p.index, p])), seen = new Set<string>();
  return placements.flatMap(p => pages.get(p.page)!.texts.flatMap(t => {
    const moved = { ...t, x: t.x + p.x, y: t.y + p.y };
    const key = `${t.str}:${Math.round(moved.x * 2)}:${Math.round(moved.y * 2)}`;
    if (seen.has(key)) return [];
    seen.add(key); return [moved];
  }));
}
