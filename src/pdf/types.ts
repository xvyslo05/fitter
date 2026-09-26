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
