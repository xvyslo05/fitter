import type { PdfPath, Pt } from './types';

// Width is measured perpendicular to the transformed tangent; dash distances
// and phase follow that tangent. A single scalar cannot describe a whole curve.
export function strokeMetrics(path: PdfPath, from: Pt, to: Pt) {
  const [a, b, c, d] = path.ctm, det = a * d - b * c;
  const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
  const inverseLength = Math.hypot(d * dx - c * dy, a * dy - b * dx);
  const scale = inverseLength ? Math.abs(det) * length / inverseLength : 0;
  return { lineWidth: scale ? path.lineWidth * Math.abs(det) / scale : 0,
    dash: path.dash.map(n => n * scale), dashPhase: path.dashPhase * scale };
}
