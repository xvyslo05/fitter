import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { flatten, multiply } from './flatten';
import type { Matrix } from './flatten';
import type { Color, PdfDoc, PdfPath } from './types';

interface State { matrix: Matrix; stroke: Color | null; fill: Color | null; width: number; dash: number[]; dashPhase: number; maskDepth: number }
function color(value: string): Color | null {
  if (!/^#[\da-f]{6}$/i.test(value)) return null;
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255) as Color;
}

export async function readPdf(data: Uint8Array): Promise<PdfDoc> {
  // Vite emits the worker as a local asset; Node uses pdf.js's legacy fake worker.
  if (typeof window !== 'undefined') {
    GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  }
  const task = getDocument({ data: data.slice(), isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
  try {
    const pdf = await task.promise, pages: PdfDoc['pages'] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index), viewport = page.getViewport({ scale: 1 });
      const [ops, text] = await Promise.all([page.getOperatorList(), page.getTextContent()]);
      const base = viewport.transform as Matrix, paths: PdfPath[] = [], stack: State[] = [];
      let state: State = { matrix: base, stroke: [0, 0, 0], fill: [0, 0, 0], width: 1, dash: [], dashPhase: 0, maskDepth: 0 };
      const clips: [number, number, number, number][] = [];
      let pendingClip = false;
      const save = () => { stack.push({ ...state }); };
      const restore = () => { state = stack.pop() ?? state; };
      for (let i = 0; i < ops.fnArray.length; i++) {
        const op = ops.fnArray[i], args = ops.argsArray[i];
        switch (op) {
          case OPS.save: save(); break;
          case OPS.restore: restore(); break;
          case OPS.transform: state.matrix = multiply(state.matrix, args as Matrix); break;
          case OPS.paintFormXObjectBegin:
            save(); if (args[0]) state.matrix = multiply(state.matrix, args[0]); break;
          case OPS.paintFormXObjectEnd: restore(); break;
          case OPS.beginGroup:
            // pdf.js applies this matrix again at paintFormXObjectBegin.
            save(); if (args[0].smask) state.maskDepth++; break;
          case OPS.endGroup: restore(); break;
          case OPS.setLineWidth: state.width = args[0]; break;
          case OPS.setDash: state.dash = [...args[0]]; state.dashPhase = args[1]; break;
          // The evaluator converts DeviceGray, DeviceRGB and DeviceCMYK to CSS RGB.
          case OPS.setStrokeRGBColor: state.stroke = color(args[0]); break;
          case OPS.setFillRGBColor: state.fill = color(args[0]); break;
          case OPS.setStrokeTransparent: state.stroke = null; break;
          case OPS.setFillTransparent: state.fill = null; break;
          case OPS.setGState:
            for (const [key, value] of args[0]) {
              if (key === 'LW') state.width = value;
              if (key === 'D') { state.dash = [...value[0]]; state.dashPhase = value[1]; }
            }
            break;
          case OPS.clip: case OPS.eoClip: pendingClip = true; break;
          case OPS.constructPath: {
            const paint: number = args[0], buffer = args[1][0] as ArrayLike<number> | null;
            if (pendingClip && buffer && !state.maskDepth) {
              const { subpaths } = flatten(buffer, state.matrix);
              const points = subpaths[0];
              if (subpaths.length === 1 && points.length === 5 && points.every((p, i) => !i || Math.abs(p[0] - points[i - 1][0]) < 0.01 || Math.abs(p[1] - points[i - 1][1]) < 0.01)) {
                clips.push([Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]);
              }
            }
            pendingClip = false;
            // Clipping paths aren't painted. Keep painted geometry outside the clip,
            // as assemble.py does, to recover repeated full-sheet geometry.
            if (state.maskDepth || !buffer || paint === OPS.endPath || paint === OPS.clip || paint === OPS.eoClip) break;
            const stroke = [OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(paint);
            const fill = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(paint);
            if (!stroke && !fill) break;
            const geometry = flatten(buffer, state.matrix);
            const m = state.matrix;
            paths.push({ ...geometry, stroke: stroke ? state.stroke : null, fill: fill ? state.fill : null,
              lineWidth: state.width, dash: [...state.dash], dashPhase: state.dashPhase, ctm: [m[0], m[1], m[2], m[3]] });
            break;
          }
        }
      }
      const texts = text.items.flatMap(item => {
        if (!('str' in item) || !item.str.trim()) return [];
        const m = multiply(base, item.transform as Matrix);
        return [{ str: item.str, x: m[4], y: m[5], height: Math.hypot(m[2], m[3]), angle: Math.atan2(m[1], m[0]) }];
      });
      pages.push({ index, width: viewport.width, height: viewport.height, paths, texts, clips });
      page.cleanup();
    }
    return { pages };
  } finally { await task.destroy(); }
}
