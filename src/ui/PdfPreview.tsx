import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { contentPages } from '../pdf/match';
import { assemblePaths, placePages } from '../pdf/place';
import { isTap, TAP_TOLERANCE_PX } from '../pdf/hit';
import { styleKeyOf, styleLegend } from '../pdf/styles';
import { withoutLettering } from '../pdf/trace';
import { bbox } from '../geom/polygon';
import { t } from '../i18n';
import type { PageLayout, PdfDoc, PdfPath, StyleEntry, TraceResult } from '../pdf/types';
import { inlineTokens, sizeColor, useTheme } from '../theme';

// Kept separate so the canvas outline and modal teardown can be checked without a DOM.
export function tracePreviewPath(ctx: Pick<CanvasRenderingContext2D, 'moveTo' | 'lineTo' | 'closePath'>, path: PdfPath) {
  path.subpaths.forEach((points, i) => {
    points.forEach(([x, y], j) => { if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    if (path.closed[i] || (!path.stroke && path.fill)) ctx.closePath();
  });
}
// A PDF colour on the preview. The dark theme inverts its lightness and keeps the hue, so black lines turn light.
export function inkColor(rgb: number[], dark: boolean): string {
  const shift = dark ? 1 - Math.max(...rgb) - Math.min(...rgb) : 0;
  return `rgb(${rgb.map(c => Math.round((c + shift) * 255)).join(',')})`;
}
export interface View { scale: number; x: number; y: number }
// width/height: the padded sheet in pt, or the box in CSS px.
export interface Size { width: number; height: number }
export function scaleLimits(sheet: Size, box: Size): [number, number] {
  const fit = Math.min(box.width / sheet.width, box.height / sheet.height);
  return [fit, Math.max(fit * 4, 12)];
}
export function fitView(sheet: Size, box: Size): View {
  const [scale] = scaleLimits(sheet, box);
  return { scale, x: (box.width - sheet.width * scale) / 2, y: (box.height - sheet.height * scale) / 2 };
}
// Scale into range; a small axis is centred, a large one keeps covering the box.
export function clampView(view: View, sheet: Size, box: Size): View {
  const [min, max] = scaleLimits(sheet, box), scale = Math.min(max, Math.max(min, view.scale));
  const axis = (pos: number, content: number, room: number) => content <= room ? (room - content) / 2 : Math.min(0, Math.max(room - content, pos));
  return { scale, x: axis(view.x, sheet.width * scale, box.width), y: axis(view.y, sheet.height * scale, box.height) };
}
// at: CSS px inside the box. Keeps the sheet point under `at` fixed, then clamps.
export function zoomView(view: View, factor: number, at: [number, number], sheet: Size, box: Size): View {
  const [min, max] = scaleLimits(sheet, box), scale = Math.min(max, Math.max(min, view.scale * factor)), k = scale / view.scale;
  return clampView({ scale, x: at[0] - (at[0] - view.x) * k, y: at[1] - (at[1] - view.y) * k }, sheet, box);
}
// A point in the box (CSS px) as a point of the sheet (pt); `origin` is the sheet's top left corner.
export function screenToSheet(view: View, origin: { minX: number; minY: number }, at: [number, number]): [number, number] {
  return [(at[0] - view.x) / view.scale + origin.minX, (at[1] - view.y) / view.scale + origin.minY];
}
type GestureEvent = Event & { scale: number; clientX: number; clientY: number };
const EPS = 1e-6;

// onTap: a press that moves at most 6 px; `at` is the sheet point, `tolerance` 12 screen px in sheet pt.
export function Preview({ doc, layout, sizesMode = false, result, highlight = null, companions = [], onTap }: {
  doc: PdfDoc; layout: PageLayout; sizesMode?: boolean; result?: TraceResult | null; highlight?: string | null; companions?: string[];
  onTap?: (at: [number, number], tolerance: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), theme = useTheme(), hintId = `${useId()}-hint`;
  const sheet = useMemo(() => {
    const placed = placePages(doc, layout), paths = assemblePaths(doc, placed.placements);
    let minX = 0, minY = 0, maxX = 1, maxY = 1;
    for (const p of placed.placements) {
      const page = doc.pages.find(page => page.index === p.page)!;
      maxX = Math.max(maxX, p.x + page.width); maxY = Math.max(maxY, p.y + page.height);
    }
    for (const path of paths) for (const points of path.subpaths) for (const [x, y] of points) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { ...placed, paths, minX: minX - 15, minY: minY - 15, width: maxX - minX + 30, height: maxY - minY + 30 };
  }, [doc, layout]);
  // Paths grouped by line style, longest first; one Path2D per group is built lazily on first paint.
  const groups = useMemo(() => {
    const byKey = new Map<string, PdfPath[]>(), traced = new Map<string, PdfPath[]>();
    const add = (map: Map<string, PdfPath[]>, path: PdfPath) => { const key = styleKeyOf(path); let list = map.get(key); if (!list) map.set(key, list = []); list.push(path); };
    for (const path of sheet.paths) if (path.stroke || path.fill) add(byKey, path);
    // Step 2 highlights what is traced: no page frames or lettering of the same style.
    if (sizesMode) for (const path of withoutLettering(assemblePaths(contentPages(doc), sheet.placements))) if (path.stroke || path.fill) add(traced, path);
    return { list: styleLegend(sheet.paths).map(entry => ({ entry, paths: byKey.get(entry.key)! })), built: new Map<string, Path2D>(), traced, builtTraced: new Map<string, Path2D>() };
  }, [doc, sheet, sizesMode]);
  const view = useRef<View>({ scale: 0, x: 0, y: 0 }), fitted = useRef(true), frame = useRef(0), paintRef = useRef(() => {});
  const pointers = useRef(new Map<number, { x: number; y: number; touch: boolean }>()), pinch = useRef({ x: 0, y: 0, d: 0 });
  // Where the press started (box px), whether it became a pan, whether a second finger joined.
  const press = useRef({ x: 0, y: 0, moved: false, multi: false });
  const sheetSize = useRef<Size>(sheet); sheetSize.current = sheet;
  const [atFit, setAtFit] = useState(true), [atMax, setAtMax] = useState(false), [dragging, setDragging] = useState(false);
  const boxSize = (): Size => ({ width: box.current?.clientWidth ?? 0, height: box.current?.clientHeight ?? 0 });
  const schedule = () => { if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; paintRef.current(); }); };
  const apply = (next: View) => {
    const [min, max] = scaleLimits(sheetSize.current, boxSize());
    view.current = next; fitted.current = next.scale <= min * (1 + EPS);
    setAtFit(fitted.current); setAtMax(next.scale >= max * (1 - EPS)); schedule();
  };
  const zoomAt = (factor: number, at: [number, number]) => apply(zoomView(view.current, factor, at, sheetSize.current, boxSize()));
  const panBy = (dx: number, dy: number) => apply(clampView({ ...view.current, x: view.current.x + dx, y: view.current.y + dy }, sheetSize.current, boxSize()));
  const refit = () => apply(fitView(sheetSize.current, boxSize()));
  const local = (e: { clientX: number; clientY: number }): [number, number] => { const r = box.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const centre = (): [number, number] => { const b = boxSize(); return [b.width / 2, b.height / 2]; };
  const actions = useRef({ zoomAt, panBy, local, apply, boxSize, schedule }); actions.current = { zoomAt, panBy, local, apply, boxSize, schedule };

  paintRef.current = () => {
    const node = canvas.current, ctx = node?.getContext('2d'), size = boxSize(), v = view.current;
    if (!node || !ctx || !size.width || !size.height || !v.scale) return;
    const dpr = window.devicePixelRatio || 1, w = Math.round(size.width * dpr), h = Math.round(size.height * dpr);
    if (node.width !== w || node.height !== h) { node.width = w; node.height = h; }
    // Canvas colours: the palette tokens on screen, read again when the theme changes.
    const style = getComputedStyle(node), token = (name: string) => style.getPropertyValue(name).trim(), dark = theme === 'dark';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = token('--sheet'); ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * (v.x - sheet.minX * v.scale), dpr * (v.y - sheet.minY * v.scale));
    const scale = v.scale;
    ctx.lineJoin = ctx.lineCap = 'round';
    const draw = (g: (typeof groups.list)[number], color: string, width: number, dash: number[], traced = false) => {
      const own = traced && groups.traced.get(g.entry.key), cache = own ? groups.builtTraced : groups.built;
      let p = cache.get(g.entry.key);
      if (!p) { p = new Path2D(); for (const path of own || g.paths) tracePreviewPath(p, path); cache.set(g.entry.key, p); }
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(p);
    };
    const dashOf = (e: StyleEntry) => e.kind === 'stroke' && e.dash.reduce((a, b) => a + b, 0) > 0 ? e.dash : [];
    const marked = sizesMode ? groups.list.find(g => g.entry.key === highlight) : undefined;
    if (marked) {
      // Companions: the shared styles (uni / vše) that complete the highlighted size's outlines.
      const shared = groups.list.filter(g => g !== marked && companions.includes(g.entry.key));
      for (const g of groups.list) if (g !== marked) draw(g, token('--sheet-line'), Math.max(1 / scale, g.entry.width), dashOf(g.entry));
      for (const g of shared) draw(g, inkColor(g.entry.color, dark), Math.max(2.5 / scale, g.entry.width), dashOf(g.entry), true);
      ctx.globalAlpha = 0.35; draw(marked, token('--focus'), 8 / scale, [], true); ctx.globalAlpha = 1;
      draw(marked, inkColor(marked.entry.color, dark), Math.max(2.5 / scale, marked.entry.width), dashOf(marked.entry), true);
      ctx.setLineDash([]);
      return;
    }
    ctx.globalAlpha = sizesMode && result ? 0.35 : 1;
    for (const g of groups.list) draw(g, inkColor(g.entry.color, dark), Math.max(1 / scale, g.entry.width), dashOf(g.entry));
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    if (sizesMode) {
      if (result) for (const candidate of result.candidates) {
        for (const [size, ring] of Object.entries(candidate.sizes)) {
          ctx.strokeStyle = inlineTokens(sizeColor(result.sizes.indexOf(size)), token); ctx.lineWidth = 2 / scale;
          ctx.beginPath(); ring.forEach(([x, y], i) => { if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
          ctx.closePath(); ctx.stroke();
        }
        const b = bbox(candidate.sizes[candidate.refSize]), x = (b.minX + b.maxX) / 2, y = (b.minY + b.maxY) / 2;
        ctx.font = `bold ${15 / scale}px system-ui`; ctx.textAlign = 'center';
        ctx.lineWidth = 4 / scale; ctx.strokeStyle = token('--sheet'); ctx.strokeText(String(candidate.id), x, y);
        ctx.fillStyle = token('--brand-text'); ctx.fillText(String(candidate.id), x, y);
      }
      return;
    }
    ctx.font = `${12 / scale}px system-ui`; ctx.lineWidth = 0.8 / scale;
    for (const p of sheet.placements) {
      const page = doc.pages.find(page => page.index === p.page)!;
      ctx.strokeStyle = token('--sheet-frame'); ctx.setLineDash([4 / scale, 3 / scale]);
      ctx.strokeRect(p.x, p.y, page.width, page.height); ctx.setLineDash([]);
      ctx.fillStyle = token('--brand-text'); ctx.fillText(String(p.page), p.x + 5 / scale, p.y + 15 / scale);
    }
    ctx.lineWidth = 2 / scale;
    for (const seam of sheet.seams) {
      const a = sheet.placements.find(p => p.page === seam.a)!, b = sheet.placements.find(p => p.page === seam.b)!;
      const page = doc.pages.find(p => p.index === a.page)!;
      ctx.strokeStyle = token(seam.matched ? '--seam-ok' : '--seam'); ctx.beginPath();
      if (a.row === b.row) {
        const x = (a.x + page.width + b.x) / 2;
        ctx.moveTo(x, a.y); ctx.lineTo(x, a.y + page.height);
      } else {
        const y = (a.y + page.height + b.y) / 2;
        ctx.moveTo(a.x, y); ctx.lineTo(a.x + page.width, y);
      }
      ctx.stroke();
    }
  };
  useEffect(() => { refit(); }, [sheet]);
  useEffect(() => { const a = document.activeElement; if (a instanceof HTMLButtonElement && a.disabled && box.current?.contains(a)) box.current.focus(); }, [atFit, atMax]);
  useEffect(() => { schedule(); }, [doc, sheet, groups, sizesMode, result, theme, highlight, companions.join('|')]);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const size = actions.current.boxSize();
      if (!size.width || !size.height) return;
      actions.current.apply(fitted.current ? fitView(sheetSize.current, size) : clampView(view.current, sheetSize.current, size));
    });
    observer.observe(node);
    // Normalise wheel deltas to px.
    const px = (e: WheelEvent, d: number) => d * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? actions.current.boxSize().height : 1);
    const wheel = (e: WheelEvent) => {
      const a = actions.current;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); a.zoomAt(Math.min(2, Math.max(0.5, Math.exp(-px(e, e.deltaY) * 0.01))), a.local(e)); }
      else if (!fitted.current) {
        const v = view.current, next = clampView({ ...v, x: v.x - px(e, e.deltaX), y: v.y - px(e, e.deltaY) }, sheetSize.current, a.boxSize());
        if (Math.abs(next.x - v.x) > 0.5 || Math.abs(next.y - v.y) > 0.5) { e.preventDefault(); a.apply(next); }
      }
    };
    // Safari trackpad pinch; touch pinch is handled by the pointer events.
    let start = 1;
    const gesture = (e: Event) => {
      e.preventDefault();
      if ([...pointers.current.values()].some(p => p.touch)) return;
      const a = actions.current, g = e as GestureEvent;
      if (e.type === 'gesturestart') start = view.current.scale;
      else if (e.type === 'gesturechange') a.zoomAt(start * g.scale / view.current.scale, a.local(g));
    };
    node.addEventListener('wheel', wheel, { passive: false });
    const names = ['gesturestart', 'gesturechange', 'gestureend'];
    names.forEach(n => node.addEventListener(n, gesture, { passive: false }));
    return () => {
      observer.disconnect(); node.removeEventListener('wheel', wheel);
      names.forEach(n => node.removeEventListener(n, gesture)); cancelAnimationFrame(frame.current); frame.current = 0;
    };
  }, []);

  const rebase = () => {
    const [a, b] = [...pointers.current.values()];
    pinch.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    if (!pointers.current.size) press.current = { x, y, moved: false, multi: false };
    pointers.current.set(e.pointerId, { x, y, touch: e.pointerType === 'touch' });
    if (pointers.current.size >= 2) press.current.multi = true;
    if (pointers.current.size === 2) rebase();
    setDragging(true);
  };
  const move = (e: PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const [x, y] = local(e);
    // Small movements of a single pointer stay a tap; once past the threshold the whole distance pans.
    if (pointers.current.size === 1 && !press.current.moved) { if (isTap(x - press.current.x, y - press.current.y)) return; press.current.moved = true; }
    const dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    if (pointers.current.size === 1) panBy(dx, dy);
    else if (pointers.current.size === 2) {
      const last = pinch.current, [a, b] = [...pointers.current.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y);
      const zoomed = zoomView(view.current, last.d > 0 ? d / last.d : 1, [last.x, last.y], sheet, boxSize());
      apply(clampView({ ...zoomed, x: zoomed.x + mx - last.x, y: zoomed.y + my - last.y }, sheet, boxSize()));
      pinch.current = { x: mx, y: my, d };
    }
  };
  const up = (e: PointerEvent) => {
    const press0 = press.current, tap = e.type === 'pointerup' && onTap && pointers.current.size === 1 && !press0.moved && !press0.multi;
    pointers.current.delete(e.pointerId);
    if (tap) onTap(screenToSheet(view.current, sheet, [press0.x, press0.y]), TAP_TOLERANCE_PX / view.current.scale);
    if (pointers.current.size === 2) rebase();
    if (!pointers.current.size) setDragging(false);
  };
  const key = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const b = boxSize(), step = { ArrowLeft: [b.width * 0.1, 0], ArrowRight: [-b.width * 0.1, 0], ArrowUp: [0, b.height * 0.1], ArrowDown: [0, -b.height * 0.1] }[e.key];
    if (e.key === '+' || e.key === '=') zoomAt(1.5, centre());
    else if (e.key === '-') zoomAt(1 / 1.5, centre());
    else if (e.key === '0') refit();
    else if (step) panBy(step[0], step[1]);
    else return;
    e.preventDefault();
  };
  return <div class="pdf-preview">
    <div class="pdf-preview-heading"><h3>{t('pdf.preview.title')}</h3></div>
    <p id={hintId} class="small muted">{t('pdf.preview.hint')}</p>
    {sizesMode ? <p class="pdf-size-colors">{result?.sizes.map((size, i) => <span key={size} style={{ color: sizeColor(i) }}>● {size}</span>)}</p>
      : <p class="small muted"><span class="pdf-seam verified" /> {t('pdf.preview.seamOk')} <span class="pdf-seam" /> {t('pdf.preview.seamUnsure')} · {t('pdf.preview.pageCount', { count: sheet.placements.length })}</p>}
    <div ref={box} class={`pdf-viewport${atFit ? '' : ' zoomed'}${dragging ? ' dragging' : ''}`} style={{ aspectRatio: `${sheet.width} / ${sheet.height}` }} tabIndex={0} role="group" aria-label={t('pdf.preview.label')} aria-describedby={hintId} onKeyDown={key}>
      <canvas ref={canvas} role="img" aria-label={sizesMode ? t('pdf.preview.outlines', { count: result?.candidates.length ?? 0 }) : t('pdf.preview.sheet', { pages: sheet.placements.length, seams: sheet.seams.filter(s => s.matched).length })}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDblClick={e => zoomAt(2, local(e))} />
      <div class="pdf-zoom">
        <button type="button" class="secondary" aria-label={t('pdf.zoom.in')} disabled={atMax} onClick={() => zoomAt(1.5, centre())}>+</button>
        <button type="button" class="secondary" aria-label={t('pdf.zoom.out')} disabled={atFit} onClick={() => zoomAt(1 / 1.5, centre())}>−</button>
        <button type="button" class="secondary" disabled={atFit} onClick={refit}>{t('pdf.zoom.fit')}</button>
      </div>
    </div>
  </div>;
}

// A line style drawn as a short sample; decorative, the text next to it says what it is.
export function Swatch({ entry, dark, label }: { entry: StyleEntry; dark: boolean; label?: string }) {
  const ink = inkColor(entry.color, dark);
  return <svg viewBox="0 0 96 24" width="96" height="24" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
    {entry.kind === 'fill' ? <rect x="4" y="11" width="88" height="2" fill={ink} />
      : <line x1="4" y1="12" x2="92" y2="12" stroke={ink} stroke-width={Math.max(0.5, entry.width)} stroke-dasharray={entry.dash.join(' ')} />}
  </svg>;
}
