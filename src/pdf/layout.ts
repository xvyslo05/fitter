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
  if (blocks.some(b => b.pages[0] !== b.pages[1])) blocks = blocks.filter(b => b.pages[0] !== b.pages[1]);
  if (blocks.every(b => b.pages[0] === b.pages[1]) && doc.pages.length > 1) sources.push('bloky je třeba zadat');
  return { layout: { step, blocks }, source: [...new Set(sources)].join(' + ') };
}
