// Minimal uncompressed PDF writer: synthetic fixtures stay readable and need no binaries.
export interface TestPage { content: string; width?: number; height?: number; dictionary?: string }
export function pdfBytes(pages: TestPage[], resources = '', extraObjects: string[] = []): Uint8Array {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids: string[] = [];
  for (const p of pages) {
    const id = objects.length + 1;
    kids.push(`${id} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width ?? 200} ${p.height ?? 300}] /Resources << /Font << /F1 3 0 R >> ${resources} >> /Contents ${id + 1} 0 R ${p.dictionary ?? ''} >>`);
    objects.push(`<< /Length ${new TextEncoder().encode(p.content).length} >>\nstream\n${p.content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`;
  objects.push(...extraObjects);
  let result = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((value, i) => { offsets.push(result.length); result += `${i + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = result.length;
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  result += offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(result);
}

export function pdfStream(content: string, dictionary = ''): string {
  return `<< ${dictionary} /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`;
}

// Physically trim synthetic straight lines; do not depend on the reader applying
// PDF clipping to geometry retained for matching outside the visible tile.
export function clippedLines(lines: number[][], box: [number, number, number, number], origin = [0, 0]): string {
  return lines.flatMap(([ax, ay, bx, by]) => {
    const dx = bx - ax, dy = by - ay;
    let lo = 0, hi = 1;
    for (const [p, d, min, max] of [[ax, dx, box[0], box[2]], [ay, dy, box[1], box[3]]]) {
      if (!d) { if (p < min || p > max) return []; continue; }
      const t = [(min - p) / d, (max - p) / d].sort((a, b) => a - b);
      lo = Math.max(lo, t[0]); hi = Math.min(hi, t[1]);
    }
    return lo < hi ? [`${ax + dx * lo - origin[0]} ${ay + dy * lo - origin[1]} m ${ax + dx * hi - origin[0]} ${ay + dy * hi - origin[1]} l S`] : [];
  }).join('\n');
}
