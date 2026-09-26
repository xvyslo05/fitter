import { strokeMetrics } from './stroke';
import type { PdfPath, StyleEntry } from './types';

const round = (n: number, step: number) => Number((Math.round(n / step) * step).toFixed(4));
function style(path: PdfPath) {
  const kind = path.stroke ? 'stroke' : 'fill';
  const color = (path.stroke ?? path.fill ?? [0, 0, 0]).map(n => round(n, 1 / 255)) as StyleEntry['color'];
  let length = 0, width = 0;
  const dash = path.dash.map(() => 0);
  path.subpaths.forEach((points, j) => {
    for (let i = 1; i < points.length + (path.closed[j] ? 1 : 0); i++) {
      const a = points[i - 1], b = points[i % points.length], weight = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const metrics = strokeMetrics(path, a, b);
      length += weight; width += metrics.lineWidth * weight;
      metrics.dash.forEach((n, j) => { dash[j] += n * weight; });
    }
  });
  // A curved path under an anisotropic CTM has no single width. The legend
  // uses the length-weighted device metrics; rasterisation measures each segment.
  // Fill-only paths have no stroke attributes (printer drivers often retain stale ones).
  return { kind, color, width: kind === 'stroke' ? round(width / (length || 1), 0.05) : 0,
    dash: kind === 'stroke' ? dash.map(n => round(n / (length || 1), 0.5)) : [] } as const;
}
export function styleKeyOf(path: PdfPath): string {
  const s = style(path);
  return `${s.kind}:${s.color.join(',')}:${s.width}:${s.dash.join(',')}`;
}
export function styleLegend(paths: PdfPath[]): StyleEntry[] {
  const entries = new Map<string, StyleEntry>();
  for (const path of paths) {
    if (!path.stroke && !path.fill) continue;
    const key = styleKeyOf(path);
    let entry = entries.get(key);
    if (!entry) { entry = { key, ...style(path), paths: 0, lengthPt: 0, closedLengthPt: 0 }; entries.set(key, entry); }
    entry.paths++;
    path.subpaths.forEach((points, i) => {
      let length = 0;
      for (let j = 1; j < points.length; j++) length += Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]);
      const closed = path.closed[i] || !!path.fill || (points.length > 2 && Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) < 0.01);
      if (closed && points.length) length += Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]);
      // Thin painted bands have two sides: perimeter / 2 approximates line length.
      if (!path.stroke && path.fill) length /= 2;
      entry.lengthPt += length;
      if (closed) entry.closedLengthPt += length;
    });
  }
  return [...entries.values()].sort((a, b) => b.lengthPt - a.lengthPt);
}
export function defaultAssignments(entries: StyleEntry[]): Record<string, string> {
  const ranked = [...entries].sort((a, b) => b.closedLengthPt - a.closedLengthPt);
  const first = ranked[0], rest = ranked.slice(1).reduce((n, e) => n + e.closedLengthPt, 0);
  return first && first.closedLengthPt >= 300 && first.closedLengthPt > rest * 2 ? { [first.key]: 'uni' } : {};
}
