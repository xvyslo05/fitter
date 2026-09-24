function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const safeName = (name: string) => name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'latka';
export function exportSVG(svg: SVGSVGElement, material: string) {
  download(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }), `fitter-${safeName(material)}.svg`);
}
export async function exportPNG(svg: SVGSVGElement, material: string): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const bounds = svg.viewBox.baseVal;
  const scale = Math.min(12, 8192 / Math.max(bounds.width, bounds.height), Math.sqrt(16_000_000 / (bounds.width * bounds.height)));
  const width = Math.max(1, Math.ceil(bounds.width * scale)), height = Math.max(1, Math.ceil(bounds.height * scale));
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
  const source = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Obrázek se nepodařilo vytvořit.')); image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Prohlížeč nepodporuje export PNG.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Export PNG se nezdařil.');
    download(blob, `fitter-${safeName(material)}.png`);
  } finally { URL.revokeObjectURL(url); }
}
