import type { Pt } from './types';

export type Matrix = [number, number, number, number, number, number];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
export function point(m: Matrix, x: number, y: number): Pt {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
// pdf.js 5 DrawOPS, from shared/util.js. Rectangles and v/y curves have already
// been expanded by the evaluator. Twelve samples match the offline assembler.
export function flatten(data: ArrayLike<number>, matrix: Matrix) {
  const subpaths: Pt[][] = [], closed: boolean[] = [];
  let current: Pt[] = [];
  const start = (p: Pt) => { current = [p]; subpaths.push(current); closed.push(false); };
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    if (op === 0) start(point(matrix, data[i++], data[i++]));
    else if (op === 1) current.push(point(matrix, data[i++], data[i++]));
    else if (op === 2 || op === 3) {
      const p0 = current.at(-1) ?? point(matrix, 0, 0);
      let p1 = point(matrix, data[i++], data[i++]);
      let p2 = point(matrix, data[i++], data[i++]);
      const p3 = op === 2 ? point(matrix, data[i++], data[i++]) : p2;
      if (op === 3) {
        p2 = [p3[0] + (p1[0] - p3[0]) * 2 / 3, p3[1] + (p1[1] - p3[1]) * 2 / 3];
        p1 = [p0[0] + (p1[0] - p0[0]) * 2 / 3, p0[1] + (p1[1] - p0[1]) * 2 / 3];
      }
      for (let n = 1; n <= 12; n++) {
        const t = n / 12, s = 1 - t;
        current.push([s ** 3 * p0[0] + 3 * s * s * t * p1[0] + 3 * s * t * t * p2[0] + t ** 3 * p3[0],
          s ** 3 * p0[1] + 3 * s * s * t * p1[1] + 3 * s * t * t * p2[1] + t ** 3 * p3[1]]);
      }
    } else if (op === 4) {
      if (current.length) { current.push([...current[0]]); closed[closed.length - 1] = true; }
    } else throw new Error(`Neznámý příkaz cesty PDF: ${op}.`);
  }
  return { subpaths, closed };
}
