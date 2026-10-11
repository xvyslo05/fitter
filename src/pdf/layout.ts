import type { LayoutBlock, PageLayout, PdfDoc, PdfPage, Pt } from './types';
import { seamMatches, matchPages } from './match';
import type { Match } from './match';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function mode(values: { value: number; weight: number }[], tolerance = 1): number | undefined {
  const groups: { value: number; weight: number }[] = [];
  for (const v of values) {
    const group = groups.find(g => Math.abs(g.value - v.value) < tolerance);
    if (group) { group.value = (group.value * group.weight + v.value * v.weight) / (group.weight + v.weight); group.weight += v.weight; }
    else groups.push({ ...v });
  }
  return groups.sort((a, b) => b.weight - a.weight)[0]?.value;
}

function registrationStep(pages: PdfPage[], size: Pt): (number | undefined)[] {
  const candidates: { value: number; weight: number }[][] = [[], []];
  for (const page of pages) {
    const segments: { fixed: number; low: number; high: number }[][] = [[], []];
    for (const path of page.paths) for (const points of path.subpaths) for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      for (const axis of [0, 1] as const) {
        const fixed = (a[axis] + b[axis]) / 2;
        const low = Math.min(a[1 - axis], b[1 - axis]), high = Math.max(a[1 - axis], b[1 - axis]);
        if (Math.abs(a[axis] - b[axis]) < 0.1 && high - low >= 2 && high - low <= 30 &&
          fixed >= 0 && fixed <= size[axis] && (fixed < size[axis] * 0.2 || fixed > size[axis] * 0.8)) segments[axis].push({ fixed, low, high });
      }
    }
    const marks: Pt[] = [];
    for (const vertical of segments[0]) for (const horizontal of segments[1]) {
      if (vertical.fixed < horizontal.low - 0.1 || vertical.fixed > horizontal.high + 0.1 ||
        horizontal.fixed < vertical.low - 0.1 || horizontal.fixed > vertical.high + 0.1) continue;
      if (!marks.some(p => Math.hypot(p[0] - vertical.fixed, p[1] - horizontal.fixed) < 1)) marks.push([vertical.fixed, horizontal.fixed]);
    }
    // Four corner intersections distinguish registration marks from an isolated
    // cross, a scale square, or the ends of a pattern line.
    for (const a of marks) for (const b of marks) {
      if (b[0] - a[0] < size[0] * 0.65 || b[1] - a[1] < size[1] * 0.65) continue;
      if (marks.some(p => Math.abs(p[0] - a[0]) < 0.5 && Math.abs(p[1] - b[1]) < 0.5) &&
        marks.some(p => Math.abs(p[0] - b[0]) < 0.5 && Math.abs(p[1] - a[1]) < 0.5)) {
        for (const axis of [0, 1] as const) candidates[axis].push({ value: b[axis] - a[axis], weight: 1 });
      }
    }
  }
  return candidates.map(values => values.length >= 2 ? mode(values) : undefined);
}

function frameStep(pages: PdfPage[], size: Pt): (number | undefined)[] {
  const candidates: { value: number; weight: number }[][] = [[], []];
  for (const page of pages) {
    const lines: { fixed: number; low: number; high: number }[][] = [[], []];
    for (const path of page.paths) for (const points of path.subpaths) {
      // Closed crop frames, including narrow filled rectangles (Foxit strokes).
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        for (const axis of [0, 1] as const) if (Math.abs(a[axis] - b[axis]) < 0.5) {
          const low = Math.min(a[1 - axis], b[1 - axis]), high = Math.max(a[1 - axis], b[1 - axis]);
          if (high - low > size[1 - axis] * 0.6 && low > -2 && high < size[1 - axis] + 2) lines[axis].push({ fixed: (a[axis] + b[axis]) / 2, low, high });
        }
      }
    }
    for (const axis of [0, 1] as const) {
      const spans = lines[1 - axis].map(l => l.high - l.low).filter(n => n > size[axis] * 0.65 && n < size[axis] - 4);
      for (const value of new Set(spans.map(n => Math.round(n * 10) / 10))) candidates[axis].push({ value, weight: 1 });
      for (const a of lines[axis]) for (const b of lines[axis]) {
        const value = b.fixed - a.fixed;
        if (value > size[axis] * 0.65 && value < size[axis] - 4 && Math.abs(a.low - b.low) < 1 && Math.abs(a.high - b.high) < 1) candidates[axis].push({ value, weight: 2 });
      }
    }
  }
  const marks = registrationStep(pages, size);
  return candidates.map((c, axis) => {
    const clips = pages.flatMap(page => page.clips.map(box => ({ value: box[axis + 2] - box[axis], weight: 1 })))
      .filter(v => v.value > size[axis] * 0.65 && v.value < size[axis] - 4);
    return mode(c) ?? (clips.length >= 2 ? mode(clips) : undefined) ?? marks[axis];
  });
}

function blocksFromMatches(pages: PdfPage[], matches: Match[], step: Pt): LayoutBlock[] {
  const known = new Set(pages.map(p => p.index)), used = new Set<number>(), blocks: LayoutBlock[] = [];
  const links = matches.flatMap(m => {
    const col = Math.round(m.dx / step[0]), row = Math.round(m.dy / step[1]);
    return known.has(m.a) && known.has(m.b) && Math.abs(m.dx - col * step[0]) <= 1 &&
      Math.abs(m.dy - row * step[1]) <= 1 && (col || row) ? [{ ...m, col, row }] : [];
  });
  const linked = new Set(links.flatMap(m => [m.a, m.b]));
  for (const page of pages) {
    if (used.has(page.index)) continue;
    const positions = new Map<number, Pt>([[page.index, [0, 0]]]), queue = [page.index];
    let valid = true;
    for (const a of queue) {
      const pos = positions.get(a)!;
      for (const m of links) {
        if (m.a !== a && m.b !== a) continue;
        const b = m.a === a ? m.b : m.a, sign = m.a === a ? 1 : -1;
        if (used.has(b)) continue;
        const next: Pt = [pos[0] + m.col * sign, pos[1] + m.row * sign], previous = positions.get(b);
        if (previous) { if (previous[0] !== next[0] || previous[1] !== next[1]) valid = false; }
        else { positions.set(b, next); queue.push(b); }
      }
    }
    const ids = [...positions.keys()].sort((a, b) => a - b);
    const minX = Math.min(...[...positions.values()].map(p => p[0])), minY = Math.min(...[...positions.values()].map(p => p[1]));
    // In row-major order page - column is the first page of that row. This
    // also recovers gaps occupied by another linked component (a piece need
    // not cross every seam). Unlinked instruction pages are never filled in.
    const starts = new Map<number, number>();
    for (const id of ids) {
      const [x, y] = positions.get(id)!, row = y - minY, start = id - (x - minX);
      if (starts.has(row) && starts.get(row) !== start) valid = false;
      starts.set(row, start);
    }
    const rows: number[] = [];
    for (let row = 0; row < starts.size; row++) {
      const start = starts.get(row), end = starts.get(row + 1) ?? ids.at(-1)! + 1;
      if (start === undefined || end <= start) { valid = false; break; }
      rows.push(end - start);
    }
    const expected = new Map<number, Pt>();
    let id = ids[0];
    rows.forEach((count, row) => {
      for (let col = 0; col < count; col++, id++) expected.set(id, [col, row]);
    });
    if (id !== ids.at(-1)! + 1 || starts.get(0) !== ids[0]) valid = false;
    for (const [id, pos] of positions) {
      const cell = expected.get(id);
      if (!cell || cell[0] !== pos[0] - minX || cell[1] !== pos[1] - minY) valid = false;
    }
    for (const id of expected.keys()) if (!known.has(id) || used.has(id) || (ids.length > 1 && !linked.has(id))) valid = false;
    for (const m of links) {
      const a = expected.get(m.a), b = expected.get(m.b);
      if (a && b && (b[0] - a[0] !== m.col || b[1] - a[1] !== m.row)) valid = false;
    }
    if (valid && rows.length) {
      expected.forEach((_, id) => used.add(id)); blocks.push({ pages: [ids[0], ids.at(-1)!], rows });
    } else {
      // Reject the entire inconsistent component, including column-major labels.
      for (const id of ids) { used.add(id); blocks.push({ pages: [id, id], rows: [1] }); }
    }
  }
  return blocks.sort((a, b) => a.pages[0] - b.pages[0]);
}
function labelMatches(pages: PdfPage[], step: Pt): Match[] {
  const labels = pages.flatMap(page => {
    const items = page.texts.flatMap(t => {
      const m = /^([A-Z])\s*0?([1-9]\d?)$/.exec(t.str.trim());
      return m ? [{ page: page.index, row: m[1].charCodeAt(0) - 65, col: Number(m[2]) - 1 }] : [];
    });
    return items.length === 1 ? items : [];
  });
  if (new Set(labels.map(l => `${l.col}:${l.row}`)).size !== labels.length) return [];
  return labels.slice(1).map(l => ({ a: labels[0].page, b: l.page, dx: (l.col - labels[0].col) * step[0], dy: (l.row - labels[0].row) * step[1], votes: 1 }));
}

// Assembly overview ("Klebeplan"): a small grid of tile-shaped cells, one per
// tile page, one group per separately assembled sheet.
type Line = { at: number; low: number; high: number };
type Cell = { x1: number; y1: number; x2: number; y2: number };
function mergeLines(lines: Line[]): { lines: Line[]; positions: number } {
  const sorted = [...lines].sort((a, b) => a.at - b.at), merged: Line[] = [];
  let positions = 0;
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j < sorted.length && sorted[j].at - sorted[i].at <= 1) j++;
    positions++;
    let current: (Line & { weight: number; sum: number }) | undefined;
    for (const l of sorted.slice(i, j).sort((a, b) => a.low - b.low)) {
      const length = l.high - l.low;
      if (current && l.low <= current.high + 1.5) {
        current.high = Math.max(current.high, l.high); current.weight += length; current.sum += l.at * length;
      } else {
        if (current) merged.push({ at: current.sum / current.weight, low: current.low, high: current.high });
        current = { ...l, weight: length, sum: l.at * length };
      }
    }
    if (current) merged.push({ at: current.sum / current.weight, low: current.low, high: current.high });
    i = j;
  }
  return { lines: merged, positions };
}
// [vertical, horizontal] merged lines, or undefined for a page too busy to be an overview.
function overviewLines(page: PdfPage): [Line[], Line[]] | undefined {
  const raw: Line[][] = [[], []];
  for (const path of page.paths) for (const points of path.subpaths) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      for (const axis of [0, 1] as const) {
        const low = Math.min(a[1 - axis], b[1 - axis]), high = Math.max(a[1 - axis], b[1 - axis]);
        if (Math.abs(a[axis] - b[axis]) < 0.5 && high - low >= 6) raw[axis].push({ at: (a[axis] + b[axis]) / 2, low, high });
      }
    }
    if (path.fill && !path.stroke && points.length) {
      // Thin filled bands (Foxit) stand for their centre line.
      const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
      for (const p of points) for (const axis of [0, 1] as const) { min[axis] = Math.min(min[axis], p[axis]); max[axis] = Math.max(max[axis], p[axis]); }
      const axis = max[0] - min[0] < max[1] - min[1] ? 0 : 1, short = max[axis] - min[axis], long = max[1 - axis] - min[1 - axis];
      if (short <= 3 && long >= 6) raw[axis].push({ at: (min[axis] + max[axis]) / 2, low: min[1 - axis], high: max[1 - axis] });
    }
  }
  const [vertical, horizontal] = [mergeLines(raw[0]), mergeLines(raw[1])];
  return vertical.positions > 200 || horizontal.positions > 200 ? undefined : [vertical.lines, horizontal.lines];
}
function overviewCells(page: PdfPage, aspect: number): Cell[] {
  const lines = overviewLines(page);
  if (!lines) return [];
  const vertical = lines[0].filter(l => l.high - l.low >= 10), cells: Cell[] = [];
  const horizontal = lines[1].filter(l => l.high - l.low >= 10).sort((p, q) => p.at - q.at);
  for (const a of vertical) for (const b of vertical) {
    const w = b.at - a.at;
    if (w < 12 || w > page.width * 0.6 || Math.min(a.high, b.high) - Math.max(a.low, b.low) < 12) continue;
    // Consecutive lines spanning both columns are the only minimal row pairs; only a
    // line near the middle can split a cell of the same aspect (stray lines elsewhere are ignored).
    const spanning = horizontal.filter(l => l.low <= a.at + 1 && l.high >= b.at - 1)
      .filter((l, i, all) => i === 0 || l.at - all[i - 1].at > 2);
    for (let i = 1; i < spanning.length; i++) {
      const y1 = spanning[i - 1].at, y2 = spanning[i].at, h = y2 - y1;
      if (h < 12 || h > page.height * 0.6 || Math.abs(w / h - aspect) / aspect > 0.1) continue;
      const covers = (l: Line) => l.low <= y1 + 1 && l.high >= y2 - 1;
      if (!covers(a) || !covers(b) || vertical.some(l => Math.abs(l.at - (a.at + b.at) / 2) <= w * 0.1 && covers(l))) continue;
      if (!cells.some(c => Math.abs(c.x1 - a.at) < 3 && Math.abs(c.x2 - b.at) < 3 && Math.abs(c.y1 - y1) < 3 && Math.abs(c.y2 - y2) < 3)) {
        cells.push({ x1: a.at, y1, x2: b.at, y2 });
      }
    }
  }
  return cells;
}
// Row lengths per group, groups in reading order; undefined when the cells are no usable grid.
function overviewGroups(all: Cell[]): number[][] | undefined {
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.03 * Math.max(a, b);
  const similar = (a: Cell, b: Cell) => near(a.x2 - a.x1, b.x2 - b.x1) && near(a.y2 - a.y1, b.y2 - b.y1);
  let cells: Cell[] = [];
  for (const seed of all) { const same = all.filter(c => similar(seed, c)); if (same.length > cells.length) cells = same; }
  if (cells.length < 2) return undefined;
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
  const adjacent = (a: Cell, b: Cell) =>
    ((Math.abs(a.x2 - b.x1) <= 2 || Math.abs(b.x2 - a.x1) <= 2) && overlap(a.y1, a.y2, b.y1, b.y2) >= (a.y2 - a.y1) / 2) ||
    ((Math.abs(a.y2 - b.y1) <= 2 || Math.abs(b.y2 - a.y1) <= 2) && overlap(a.x1, a.x2, b.x1, b.x2) >= (a.x2 - a.x1) / 2);
  const seen = new Set<Cell>(), groups: { cells: Cell[]; rows: number[] }[] = [];
  for (const start of cells) {
    if (seen.has(start)) continue;
    const members = [start];
    seen.add(start);
    for (const a of members) for (const b of cells) if (!seen.has(b) && adjacent(a, b)) { seen.add(b); members.push(b); }
    const minX = Math.min(...members.map(c => c.x1)), rows: number[] = [];
    const sorted = [...members].sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
    for (let i = 0; i < sorted.length;) {
      const row = sorted.filter(c => Math.abs(c.y1 - sorted[i].y1) <= 2).sort((a, b) => a.x1 - b.x1);
      if (Math.abs(row[0].x1 - minX) > 2 || row.some((c, k) => k > 0 && Math.abs(c.x1 - row[k - 1].x2) > 2)) return undefined;
      rows.push(row.length); i += row.length;
    }
    groups.push({ cells: members, rows });
  }
  const height = cells[0].y2 - cells[0].y1, top = (g: { cells: Cell[] }) => Math.min(...g.cells.map(c => c.y1)), left = (g: { cells: Cell[] }) => Math.min(...g.cells.map(c => c.x1));
  // Bands by top (within half a cell height of the band's first top), then left to right.
  const byTop = [...groups].sort((a, b) => top(a) - top(b)), band = new Map<typeof groups[number], number>();
  let bandTop = -Infinity, bands = -1;
  for (const g of byTop) { if (top(g) - bandTop > height / 2) { bands++; bandTop = top(g); } band.set(g, bands); }
  groups.sort((a, b) => band.get(a)! - band.get(b)! || left(a) - left(b));
  return groups.map(g => g.rows);
}
function overviewBlocks(doc: PdfDoc, matches: Match[], step: Pt): LayoutBlock[] | undefined {
  let best: number[][] | undefined, bestCount = 0, bestCovered = 0;
  for (const page of doc.pages) {
    const groups = overviewGroups(overviewCells(page, step[0] / step[1]));
    const count = groups?.flat().reduce((a, b) => a + b, 0) ?? 0;
    // Only groups of 2+ cells (touching cells) count as coverage; single cells still take their page.
    const covered = groups?.map(rows => rows.reduce((a, b) => a + b, 0)).filter(n => n >= 2).reduce((a, b) => a + b, 0) ?? 0;
    if (groups && covered && count <= doc.pages.length && covered > bestCovered) { best = groups; bestCount = count; bestCovered = covered; }
  }
  if (!best) return undefined;
  const cells = best.flatMap((rows, group) => rows.flatMap((length, row) => Array.from({ length }, (_, col) => ({ group, col, row }))));
  const known = new Set(doc.pages.map(p => p.index));
  const links = matches.flatMap(m => {
    const col = Math.round(m.dx / step[0]), row = Math.round(m.dy / step[1]);
    return known.has(m.a) && known.has(m.b) && Math.abs(m.dx - col * step[0]) <= 1 && Math.abs(m.dy - row * step[1]) <= 1 && (col || row) ? [{ ...m, col, row }] : [];
  });
  let start = 0, bestScore = -Infinity, bestAgree = 0, bestDisagree = 0, ties = 0;
  for (let s = 1; s + bestCount - 1 <= doc.pages.length; s++) {
    let agree = 0, disagree = 0;
    for (const m of links) {
      const a = cells[m.a - s], b = cells[m.b - s];
      if (!a || !b) continue;
      if (a.group === b.group && b.col - a.col === m.col && b.row - a.row === m.row) agree++; else disagree++;
    }
    if (agree - disagree > bestScore) { start = s; bestScore = agree - disagree; bestAgree = agree; bestDisagree = disagree; ties = 0; }
    else if (agree - disagree === bestScore) ties++;
  }
  if (!start || bestAgree <= bestDisagree || ties) return undefined;
  let first = start;
  return best.map(rows => {
    const count = rows.reduce((a, b) => a + b, 0), block: LayoutBlock = { pages: [first, first + count - 1], rows };
    first += count;
    return block;
  });
}

export function detectLayout(doc: PdfDoc): { layout: PageLayout; source: string } {
  if (!doc.pages.length) throw new Error('PDF neobsahuje stránky.');
  const size: Pt = [median(doc.pages.map(p => p.width)), median(doc.pages.map(p => p.height))];
  const matches = matchPages(doc), frame = frameStep(doc.pages, size);
  const sources: string[] = [];
  const step = size.map((dim, axis) => {
    const values = matches.filter(m => m.votes >= 2 && Math.abs(axis === 0 ? m.dy : m.dx) < 0.8)
      .map(m => ({ value: Math.abs(axis === 0 ? m.dx : m.dy), weight: m.votes }))
      .filter(v => v.value > dim * 0.55 && v.value < dim * 1.05);
    const value = mode(values);
    sources.push(value ? 'shodné cesty' : frame[axis] ? 'ořezový rám / značky' : 'rozměr stránky');
    return value ?? frame[axis] ?? dim;
  }) as Pt;
  const seams = seamMatches(doc, step);
  const links = [...matches.filter(m => m.votes >= 2), ...seams];
  const labels = labelMatches(doc.pages, step);
  let blocks = blocksFromMatches(doc.pages, links, step);
  if (labels.length) {
    const labeled = blocksFromMatches(doc.pages, labels, step);
    if (labeled.length < blocks.length) { blocks = labeled; sources.push('popisky dlaždic'); }
  }
  if (seams.length) sources.push('návaznost hran');
  const linked = blocks.filter(b => b.pages[0] !== b.pages[1]).reduce((n, b) => n + b.pages[1] - b.pages[0] + 1, 0);
  if (linked < doc.pages.length) {
    const overview = overviewBlocks(doc, links, step);
    const covered = overview?.filter(b => b.pages[0] !== b.pages[1]).reduce((n, b) => n + b.pages[1] - b.pages[0] + 1, 0) ?? 0;
    if (overview && (covered > linked || covered === linked && overview.length < blocks.filter(b => b.pages[0] !== b.pages[1]).length)) { blocks = overview; sources.push('náhled skládání'); }
  }
  if (blocks.some(b => b.pages[0] !== b.pages[1])) blocks = blocks.filter(b => b.pages[0] !== b.pages[1]);
  if (blocks.every(b => b.pages[0] === b.pages[1]) && doc.pages.length > 1) sources.push('bloky je třeba zadat');
  return { layout: { step, blocks }, source: [...new Set(sources)].join(' + ') };
}
