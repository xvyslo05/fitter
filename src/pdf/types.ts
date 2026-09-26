export type Pt = [number, number];
export type Color = [number, number, number];
export interface PdfPath {
  // Filled subpaths are implicitly closed, even when closed[i] is false.
  subpaths: Pt[][]; closed: boolean[]; stroke: Color | null; fill: Color | null;
  // Styles are in PDF user space; geometry is already transformed to page space.
  lineWidth: number; dash: number[]; dashPhase: number;
  ctm: [number, number, number, number];
}
// Text positions are baselines, height is in pt, angle is in radians (y down).
export interface PdfText { str: string; x: number; y: number; height: number; angle: number }
// clips contains axis-aligned rectangular clipping bounds in page coordinates.
export interface PdfPage { index: number; width: number; height: number; paths: PdfPath[]; texts: PdfText[]; clips: [number, number, number, number][] }
export interface PdfDoc { pages: PdfPage[] }
export interface LayoutBlock { pages: [number, number]; rows: number[] }
export interface PageLayout { step: Pt; blocks: LayoutBlock[] }
export interface PagePlacement { page: number; block: number; col: number; row: number; x: number; y: number }
export interface StyleEntry {
  key: string; kind: 'stroke' | 'fill'; color: Color; width: number; dash: number[];
  paths: number; lengthPt: number; closedLengthPt: number;
}
export interface ScaleResult { cmPerPt: number; source: 'square' | 'default'; squareCm?: number; measuredPt?: number; page?: number }
export interface TraceOptions { resolutionMm: number; gapMm: number; minAreaCm2: number; cmPerPt: number }
export interface PieceCandidate { id: number; refSize: string; sizes: Record<string, Pt[]>; labels: string[] }
export interface TraceResult { cmPerPt: number; sizes: string[]; candidates: PieceCandidate[] }
export interface TraceRequest {
  paths: PdfPath[]; texts: PdfText[]; assignments: Record<string, string>; options: TraceOptions;
  scale?: ScaleResult; excludeScaleMarks?: boolean;
}
export interface SuggestRequest { suggest: true; paths: PdfPath[]; texts: PdfText[]; scale: ScaleResult }
export type TraceResponse = { result: TraceResult } | { suggestion: Record<string, string> } | { error: string };
