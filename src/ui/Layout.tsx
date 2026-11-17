import { useId, useRef, useState } from 'preact/hooks';
import { bbox } from '../geom/polygon';
import { describe, fmt, t } from '../i18n';
import { useLocale } from '../i18n/hooks';
import { fromUnit, toUnit } from '../i18n/units';
import type { Unit } from '../i18n/units';
import type { Pt } from '../model/pattern';
import { tryMove } from '../nest/adjust';
import type { MoveOutcome } from '../nest/adjust';
import type { Fabric, NestPiece, NestResult, Placement } from '../nest/types';
import { lengthToBuy, placedSentence } from '../model/summary';
import { exportPNG, exportSVG } from './export';

// A placed piece against its paper pattern. flipY (a fold piece turned over along the fold) is a
// mirror plus a half turn, so it cancels a mirrored pair copy.
export function orientation(mirroredPair: boolean, placement: Pick<Placement, 'angle' | 'flipY'> & { tilt?: number }): { mirrored: boolean; turn: number; tilt?: number } {
  return { mirrored: mirroredPair !== placement.flipY, turn: (placement.angle + (placement.flipY ? 180 : 0)) % 360, ...placement.tilt ? { tilt: Math.abs(placement.tilt) } : {} };
}
export function orientationText({ mirrored, turn, tilt }: { mirrored: boolean; turn: number; tilt?: number }, layers: 'single' | 'folded' | 'fold'): string {
  const base = `${t(mirrored ? 'layout.mirrored' : 'layout.asPattern')}${turn ? t('layout.turned', { turn }) : ''}${tilt ? t('layout.tilted', { tilt }) : ''}`;
  return layers === 'folded' ? t('layout.foldedLayer', { base }) : layers === 'fold' ? t('layout.onFold', { base }) : base;
}

export interface PieceRow { key: string; name: string; size: string; mirrored: boolean; tilt: number; left: number; top: number }
// Rows of the printed piece list (labels are "střih · díl · velikost #n"; positions are the piece's
// bounding box from the fabric's left edge and top, in cm to 1 decimal) and the labels that did not fit.
export function pieceTable(pieces: NestPiece[], result: NestResult, mirroredKeys: string[]): { rows: PieceRow[]; unplaced: string[] } {
  const labels = new Map(pieces.map(p => [p.key, p.label])), mirroredSet = new Set(mirroredKeys), round = (n: number) => Math.round(n * 10) / 10;
  const rows = result.placements.map((placement): PieceRow => {
    const parts = (labels.get(placement.key) ?? placement.key).split(' · '), b = bbox(placement.polygon);
    return { key: placement.key, name: parts.length > 2 ? parts.slice(1, -1).join(' · ') : parts[parts.length - 1], size: parts.length > 2 ? parts[parts.length - 1].replace(/ #\d+$/, '') : '',
      mirrored: orientation(mirroredSet.has(placement.key), placement).mirrored, tilt: Math.abs(placement.tilt), left: round(b.minX), top: round(b.minY) };
  });
  return { rows, unplaced: result.unplaced.map(key => labels.get(key) ?? key) };
}

// Colours are palette tokens (styles.css); exports replace them with the light values.
const colors = Array.from({ length: 6 }, (_, i) => `var(--piece-${i + 1})`);
const cm = fmt.length;
const percent = (ratio: number) => fmt.plain(ratio * 100, 1);
// Ruler marks every 10 cm, or every 5 in when the unit is inches; positions are cm, the label is the mark in the unit.
export const ticks = (length: number, unit: Unit) => {
  const step = fromUnit(unit === 'in' ? 5 : 10, unit);
  return Array.from({ length: Math.floor(length / step + 1e-9) + 1 }, (_, i) => ({ at: i * step, label: String(Math.round(toUnit(i * step, unit) * 100) / 100) }));
};
function labelPoint(polygon: Pt[]): Pt {
  const b = bbox(polygon), y = (b.minY + b.maxY) / 2, crossings: number[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) crossings.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  });
  crossings.sort((a, b) => a - b);
  let x = (b.minX + b.maxX) / 2, width = 0;
  for (let i = 0; i + 1 < crossings.length; i += 2) if (crossings[i + 1] - crossings[i] > width) {
    width = crossings[i + 1] - crossings[i]; x = (crossings[i + 1] + crossings[i]) / 2;
  }
  return [x, y];
}
const MARK = 'var(--mark)';
// Piece-edge positions along one ruler; `label` is false where it would overlap the previous label.
function breakpoints(values: number[], minGap: number): { v: number; label: boolean }[] {
  const sorted = [...new Set(values.map(v => Math.round(v * 10) / 10))].sort((a, b) => a - b);
  let last = -Infinity;
  return sorted.map(v => {
    const label = v - last >= minGap;
    if (label) last = v;
    return { v, label };
  });
}
function Dimension({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label: string }) {
  const vertical = x1 === x2, t = 0.7;
  return <g>
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke-width="0.18" />
    {vertical ? <><line x1={x1 - t} x2={x1 + t} y1={y1} y2={y1} stroke-width="0.18" /><line x1={x1 - t} x2={x1 + t} y1={y2} y2={y2} stroke-width="0.18" /></>
      : <><line x1={x1} x2={x1} y1={y1 - t} y2={y1 + t} stroke-width="0.18" /><line x1={x2} x2={x2} y1={y1 - t} y2={y1 + t} stroke-width="0.18" /></>}
    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + (vertical ? 0.6 : -0.6)} text-anchor={vertical ? 'start' : 'middle'} dx={vertical ? 0.9 : 0}
      style="stroke:var(--fabric)" stroke-width="0.5" paint-order="stroke">{label}</text>
  </g>;
}
export function Layout({ material, fabric, pieces, result, mirroredKeys, gap, adjusted, canAdjust, onMove, onRestore }: {
  material: string; fabric: Fabric; pieces: NestPiece[]; result: NestResult; mirroredKeys: string[];
  // Manual adjustment: `gap` is the gap the plan was computed with; `adjusted` says the result was moved by hand.
  gap: number; adjusted: boolean; canAdjust: boolean; onMove: (result: NestResult) => void; onRestore: () => void;
}) {
  const { unit } = useLocale();
  const ref = useRef<SVGSVGElement>(null), [error, setError] = useState(''), [exporting, setExporting] = useState(false);
  const [pointer, setPointer] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ key: string; sx: number; sy: number; outcome: MoveOutcome } | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [blocked, setBlocked] = useState('');
  const width = fabric.width / (fabric.folded ? 2 : 1), length = fabric.length ?? result.usedLength;
  const displayLength = Math.max(length, 1), pieceMap = new Map(pieces.map((p, i) => [p.key, { ...p, color: colors[i % colors.length] }]));
  const edges = new Map(result.placements.map(p => {
    const b = bbox(p.polygon), d = drag?.key === p.key ? drag.outcome : null;
    return [p.key, d ? { ...b, minX: b.minX + d.dx, maxX: b.maxX + d.dx, minY: b.minY + d.dy, maxY: b.maxY + d.dy } : b];
  }));
  const mirroredSet = new Set(mirroredKeys), turned = new Map(result.placements.map(p => [p.key, orientation(mirroredSet.has(p.key), p)]));
  const layers = (p: NestPiece) => p.foldEdge ? 'fold' : fabric.folded ? 'folded' : 'single', hatch = `mirror-${useId()}`;
  const xMarks = breakpoints([...edges.values()].flatMap(b => [b.minX, b.maxX]), 4.5);
  const yMarks = breakpoints([...edges.values()].flatMap(b => [b.minY, b.maxY]), 2.4);
  const tiltMax = Math.max(0, ...result.placements.map(p => Math.abs(p.tilt))), table = pieceTable(pieces, result, mirroredKeys), hot = active ? edges.get(active) : undefined;
  const fromLeft = t(fabric.folded ? 'layout.fromFold' : 'layout.fromLeft'), fromRight = t(fabric.folded ? 'layout.fromEdge' : 'layout.fromRight');
  const toSvg = (e: PointerEvent) => {
    const matrix = ref.current?.getScreenCTM();
    return matrix ? new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()) : null;
  };
  const nameOf = (key: string) => pieceMap.get(key)?.label.split(' · ').slice(1).join(' · ') ?? key;
  const whyNot = (o: MoveOutcome) => o.reason === 'gap' ? t('layout.moveTooClose', { names: (o.blockedBy ?? []).map(nameOf).join(', '), gap }) : t(o.reason === 'fold' ? 'layout.moveFold' : 'layout.moveOutside');
  // A mouse drags at once; a finger first selects the piece, so that the first touch still scrolls the page.
  function startDrag(e: PointerEvent, key: string) {
    if (!canAdjust || e.button !== 0) return;
    if (e.pointerType === 'touch' && selected !== key) { setSelected(key); return; }
    const p = toSvg(e);
    if (!p) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setActive(key); setBlocked(''); setDrag({ key, sx: p.x, sy: p.y, outcome: { result, ok: true, dx: 0, dy: 0 } });
  }
  function moveDrag(e: PointerEvent) {
    const p = drag && toSvg(e);
    if (!drag || !p) return;
    const onFold = pieceMap.get(drag.key)?.foldEdge;
    setDrag({ ...drag, outcome: tryMove(result, pieces, fabric, gap, drag.key, onFold ? 0 : p.x - drag.sx, p.y - drag.sy) });
  }
  // An invalid drop leaves the piece where it was.
  function endDrag(commit: boolean) {
    if (!drag) return;
    const { outcome } = drag;
    if (commit && outcome.ok && (outcome.dx || outcome.dy)) onMove(outcome.result);
    setBlocked(commit && !outcome.ok ? whyNot(outcome) : ''); setDrag(null);
  }
  const ARROWS: Record<string, [number, number] | undefined> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  function nudge(e: KeyboardEvent, key: string) {
    const dir = ARROWS[e.key];
    if (!dir || !canAdjust) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.1 : 1, outcome = tryMove(result, pieces, fabric, gap, key, dir[0] * step, dir[1] * step);
    setBlocked(outcome.ok ? '' : whyNot(outcome));
    if (outcome.ok) onMove(outcome.result);
  }
  function track(e: PointerEvent) {
    const p = toSvg(e);
    if (!p) return;
    setPointer(p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= displayLength ? { x: p.x, y: p.y, cx: e.clientX, cy: e.clientY } : null);
  }
  return <article class="result-card">
    <div class="result-heading"><div><p class="eyebrow">{t(fabric.folded ? 'layout.twoLayers' : 'layout.oneLayer')} · {describe(placedSentence(result.placements.length, pieces.length))}</p><h3>{material}</h3></div>
      <span class={`badge print-legacy ${result.unplaced.length ? 'amber' : ''}`}>{t('layout.placedBadge', { placed: result.placements.length, total: pieces.length })}</span></div>
    <dl class="stats print-legacy"><div><dt>{t('layout.dimensions')}</dt><dd>{cm(width)} × {cm(length)} <small>{fmt.unit(unit)}</small></dd></div>
      <div><dt>{t('layout.usedLength')}</dt><dd>{cm(result.usedLength)} <small>{fmt.unit(unit)}</small></dd></div>
      <div><dt>{t('layout.utilization')}</dt><dd>{percent(result.utilization)} <small>%</small></dd></div></dl>
    {fabric.folded && <p class="small muted result-note">{t('layout.widthBeforeFold', { width: fabric.width })}</p>}
    <div class="layout-canvas">
      <svg ref={ref} xmlns="http://www.w3.org/2000/svg" class="layout-svg" role="img" aria-label={t('layout.svgLabel', { material })}
        viewBox={`-17 -14 ${width + 23} ${displayLength + 20}`} width={`${width + 23}cm`} height={`${displayLength + 20}cm`}
        onPointerMove={track} onPointerDown={track} onPointerLeave={() => { setPointer(null); setActive(null); }}>
        <desc>{t('layout.svgDesc', { material, width, length, utilization: percent(result.utilization) })}</desc>
        <defs><pattern id={hatch} width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1.6" style="stroke:var(--ink)" stroke-width="0.35" /></pattern></defs>
        <rect x={-17} y={-14} width={width + 23} height={displayLength + 20} style="fill:var(--fabric)" />
        <g font-family="system-ui, sans-serif" font-size="2.3" style="fill:var(--muted);stroke:var(--fabric-grid)" stroke-width="0.16">
          {ticks(width, unit).map(({ at, label }) => <g key={`x${label}`}><line x1={at} x2={at} y1={-3} y2={displayLength} stroke-dasharray="0.5 1" />
            <text x={at} y={-5} text-anchor="middle" stroke="none">{label}</text></g>)}
          {ticks(displayLength, unit).map(({ at, label }) => <g key={`y${label}`}><line x1={-3} x2={width} y1={at} y2={at} stroke-dasharray="0.5 1" />
            <text x={-5} y={at + 0.8} text-anchor="end" stroke="none">{label}</text></g>)}
          <text x={-8} y={-7} stroke="none" font-size="2">{fmt.unit(unit)}</text>
        </g>
        <rect x={0} y={0} width={width} height={displayLength} fill="none" style="stroke:var(--ink)" stroke-width="0.35" />
        <rect x={-17} y={-14} width={width + 23} height={displayLength + 20} fill="none" pointer-events="all" onPointerDown={() => setSelected(null)} />
        {result.placements.map(placement => {
          const p = pieceMap.get(placement.key)!;
          const b = bbox(placement.polygon), [cx, cy] = labelPoint(placement.polygon);
          const fontSize = Math.min(2.3, Math.max(0.9, Math.min(b.width, b.height) / 6));
          const maxChars = Math.max(3, Math.floor(b.width / (fontSize * 0.66)) - 2);
          const fullLabel = p.label.split(' · ').slice(1).join(' · ');
          const shortLabel = fullLabel.length > maxChars ? fullLabel.slice(0, maxChars - 1) + '…' : fullLabel;
          const arrow = Math.min(5, Math.min(b.height, b.width) * 0.22);
          const o = turned.get(p.key)!, points = placement.polygon.map(v => v.join(',')).join(' ');
          const moving = drag?.key === p.key ? drag.outcome : null;
          return <g key={p.key} onPointerEnter={() => setActive(p.key)} onPointerLeave={() => setActive(k => k === p.key ? null : k)}
            class={`layout-piece${canAdjust ? ' movable' : ''}${selected === p.key ? ' selected' : ''}${moving ? moving.ok ? ' dragging' : ' blocked' : ''}`}
            transform={moving ? `translate(${moving.dx} ${moving.dy})` : undefined}
            {...canAdjust ? { tabIndex: 0, role: 'button', 'aria-label': t('layout.pieceMovable', { label: nameOf(p.key) }),
              onPointerDown: (e: PointerEvent) => startDrag(e, p.key), onPointerMove: moveDrag, onPointerUp: () => endDrag(true), onPointerCancel: () => endDrag(false),
              onKeyDown: (e: KeyboardEvent) => nudge(e, p.key) } : {}}>
            <desc>{p.label} · {orientationText(o, layers(p))}</desc>
            <polygon points={points} style={{ fill: p.color, stroke: active === p.key ? MARK : 'var(--ink)' }}
              stroke-width={active === p.key ? 0.45 : 0.22} stroke-linejoin="round" />
            {o.mirrored && <polygon points={points} fill={`url(#${hatch})`} opacity="0.35" pointer-events="none" />}
            <g transform={`translate(${cx} ${cy})`} style="fill:var(--text)" font-family="system-ui, sans-serif" font-size={fontSize} text-anchor="middle">
              <text y={-fontSize}>{shortLabel}</text>
              <g transform={`rotate(${placement.angle + placement.tilt + (placement.flipY ? 180 : 0)})`} style="stroke:var(--ink)" stroke-width="0.25" fill="none">
                <path d={`M0,0 L0,${arrow} M-0.8,${arrow - 1} L0,${arrow} L0.8,${arrow - 1}`} />
              </g>
              {o.mirrored && <text x={fontSize * 1.7} y={fontSize * 1.9} font-size={fontSize * 1.4} font-weight="700">↔</text>}
            </g>
            {p.foldEdge && <line x1={0} x2={0} y1={b.minY} y2={b.maxY} style={{ stroke: MARK }} stroke-width="0.65" />}
          </g>;
        })}
        {fabric.folded && <g style={{ stroke: MARK, fill: MARK }}><line x1={0} x2={0} y1={0} y2={displayLength} stroke-width="0.4" stroke-dasharray="2 1" />
          <text x={1} y={-1.5} font-family="system-ui, sans-serif" font-size="2.5" stroke="none">{t('layout.fold')}</text></g>}
        <g class="breakpoints" style={{ stroke: MARK, fill: MARK }} font-family="system-ui, sans-serif" font-size="1.5" pointer-events="none">
          {xMarks.map(({ v, label }) => {
            const on = hot && (Math.abs(v - hot.minX) < 0.05 || Math.abs(v - hot.maxX) < 0.05);
            return <g key={`bx${v}`}><line x1={v} x2={v} y1={-2.2} y2={0} stroke-width={on ? 0.35 : 0.15} />
              {(hot ? on : label) && <text x={v} y={-8.6} text-anchor="middle" stroke="none" font-weight={on ? 700 : 400}>{cm(v)}</text>}</g>;
          })}
          {yMarks.map(({ v, label }) => {
            const on = hot && (Math.abs(v - hot.minY) < 0.05 || Math.abs(v - hot.maxY) < 0.05);
            return <g key={`by${v}`}><line x1={-2.2} x2={0} y1={v} y2={v} stroke-width={on ? 0.35 : 0.15} />
              {(hot ? on : label) && <text x={-10.2} y={v + 0.5} text-anchor="end" stroke="none" font-weight={on ? 700 : 400}>{cm(v)}</text>}</g>;
          })}
        </g>
        {pointer && <g style="stroke:var(--ink)" stroke-width="0.12" stroke-dasharray="0.5 0.4" opacity="0.7" pointer-events="none">
          <line x1={pointer.x} x2={pointer.x} y1={-2.2} y2={displayLength} /><line x1={-2.2} x2={width} y1={pointer.y} y2={pointer.y} />
        </g>}
        {hot && <g style={{ stroke: MARK, fill: MARK }} font-family="system-ui, sans-serif" font-size="1.7" pointer-events="none">
          <g stroke-width="0.12" stroke-dasharray="0.6 0.5">
            <line x1={hot.minX} x2={hot.minX} y1={-2.2} y2={hot.maxY} /><line x1={hot.maxX} x2={hot.maxX} y1={-2.2} y2={hot.maxY} />
            <line x1={-2.2} x2={hot.maxX} y1={hot.minY} y2={hot.minY} /><line x1={-2.2} x2={hot.maxX} y1={hot.maxY} y2={hot.maxY} />
          </g>
          {hot.minX > 0.05 && <Dimension x1={0} y1={(hot.minY + hot.maxY) / 2} x2={hot.minX} y2={(hot.minY + hot.maxY) / 2} label={cm(hot.minX)} />}
          {width - hot.maxX > 0.05 && <Dimension x1={hot.maxX} y1={(hot.minY + hot.maxY) / 2} x2={width} y2={(hot.minY + hot.maxY) / 2} label={cm(width - hot.maxX)} />}
          {hot.minY > 0.05 && <Dimension x1={(hot.minX + hot.maxX) / 2} y1={0} x2={(hot.minX + hot.maxX) / 2} y2={hot.minY} label={cm(hot.minY)} />}
          {fabric.length !== null && length - hot.maxY > 0.05 &&
            <Dimension x1={(hot.minX + hot.maxX) / 2} y1={hot.maxY} x2={(hot.minX + hot.maxX) / 2} y2={length} label={cm(length - hot.maxY)} />}
        </g>}
      </svg>
      {pointer && <div class={`layout-tip ${pointer.cx > window.innerWidth - 300 ? 'flip' : ''}`} style={{ left: `${pointer.cx}px`, top: `${pointer.cy}px` }} aria-hidden="true">
        {hot && active && <>
          <strong>{pieceMap.get(active)?.label.split(' · ').slice(1).join(' · ')}</strong>
          {turned.has(active) && pieceMap.has(active) && <span class={turned.get(active)!.mirrored ? 'tip-mirrored' : undefined}>{orientationText(turned.get(active)!, layers(pieceMap.get(active)!))}</span>}
          <span>{t('layout.pieceSize', { width: hot.width, height: hot.height })}</span>
          <span>{fabric.length !== null
            ? t('layout.tipPositionBottom', { fromLeft, left: hot.minX, fromRight, right: width - hot.maxX, top: hot.minY, bottom: length - hot.maxY })
            : t('layout.tipPositionTop', { fromLeft, left: hot.minX, fromRight, right: width - hot.maxX, top: hot.minY })}</span>
        </>}
        <span class="tip-point">{t('layout.tipPoint', { fromLeft, x: pointer.x, fromRight, right: width - pointer.x, y: pointer.y })}</span>
      </div>}
    </div>
    {(canAdjust || adjusted) && <div class="adjust-bar screen-only">{canAdjust && <span class="small muted">{t('layout.dragHint', { step: 1, fine: 0.1 })}</span>}
      {adjusted && <><span class="badge">{t('layout.adjustedBadge')}</span><button type="button" class="secondary" onClick={onRestore}>{t('layout.restore')}</button></>}</div>}
    <p class="small adjust-note screen-only" role="status">{drag && !drag.outcome.ok ? whyNot(drag.outcome) : blocked}</p>
    <div class="drawing-footer"><span>↓ {t('layout.grain')} <span class="legend-gap"><span class="mirror-swatch" aria-hidden="true" />↔ {t('layout.legendMirrored')}</span>{tiltMax > 0 && <span class="legend-gap">{t('layout.legendTilted', { tilt: tiltMax })}</span>}</span><span class="print-legacy">{t('layout.iterations', { count: fmt.number(result.iterations) })}</span></div>
    <div class="result-summary screen-only"><span>{t('layout.utilization')} <strong>{percent(result.utilization)} %</strong></span>
      <details class="result-details"><summary>{t('layout.details')}</summary>
        <dl><div><dt>{t('layout.planSize')}</dt><dd>{cm(width)} × {cm(length)} {fmt.unit(unit)}</dd></div>
          <div><dt>{t('layout.usedLength')}</dt><dd>{cm(result.usedLength)} {fmt.unit(unit)}</dd></div>
          <div><dt>{t('layout.attempts')}</dt><dd>{fmt.number(result.iterations)}</dd></div></dl></details></div>
    {result.unplaced.length > 0 && <div class="unplaced"><h4>{t('layout.unplaced', { count: result.unplaced.length })}</h4><ul>{table.unplaced.map((label, i) => <li key={result.unplaced[i]}>{label}</li>)}</ul></div>}
    <div class="print-only print-details">
      <p>{fabric.folded ? t('layout.printFabricFolded', { width: fabric.width, usable: width }) : t('layout.printFabric', { width: fabric.width })} {fabric.length === null
        ? t('layout.printBuy', { length: lengthToBuy(result.usedLength) }) : t('layout.printFixed', { length: fabric.length, used: result.usedLength })}</p>
      <p class="small">{t('layout.printScaleNote')}</p>
      <table class="print-table"><thead><tr><th>{t('layout.colPiece')}</th><th>{t('layout.colSize')}</th><th>{t('layout.colMirrored')}</th><th>{t(fabric.folded ? 'layout.colFromFold' : 'layout.colFromLeft')}</th><th>{t('layout.colTop')}</th></tr></thead>
        <tbody>{table.rows.map(row => <tr key={row.key}><td>{row.name}{row.tilt > 0 && ` (${t('layout.tiltedShort', { tilt: row.tilt })})`}</td><td>{row.size}</td><td>{t(row.mirrored ? 'layout.mirroredYes' : 'layout.mirroredNo')}</td><td>{cm(row.left)}</td><td>{cm(row.top)}</td></tr>)}</tbody></table>
    </div>
    <div class="export-actions"><span class="muted small">{t('layout.download')}</span>
      <button type="button" class="secondary" disabled={exporting} onClick={async () => {
        if (!ref.current) return; setExporting(true); setError('');
        try { await exportPNG(ref.current, material); } catch (e) { setError(e instanceof Error ? e.message : t('layout.exportFailed')); }
        finally { setExporting(false); }
      }}>{exporting ? t('layout.preparing') : t('layout.saveImage')}</button>
      <details class="more-formats"><summary>{t('layout.moreFormats')}</summary>
        <button type="button" class="text-button" onClick={() => ref.current && exportSVG(ref.current, material)}>{t('layout.vectorImage')}</button></details></div>
    {error && <p class="warning" role="alert">{error}</p>}
  </article>;
}

export function EmptyLayout() {
  return <div class="empty-layout"><svg viewBox="0 0 320 230" aria-hidden="true">
    <defs><pattern id="empty-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" style="stroke:var(--fabric-grid)" stroke-width="1" /></pattern></defs>
    <rect x="30" y="20" width="260" height="185" rx="3" fill="url(#empty-grid)" style="stroke:var(--sketch-frame)" stroke-dasharray="4 4" />
    <path d="M45 35H135L148 138 120 160H45Z" style="fill:var(--piece-1);stroke:var(--sketch-1)" />
    <path d="M163 35H190V175H163Z" style="fill:var(--piece-2);stroke:var(--sketch-2)" />
    <path d="M205 35H268V92L254 104H218L205 92Z" style="fill:var(--piece-3);stroke:var(--sketch-3)" />
    <path d="M94 80V118M88 111L94 118 100 111M176 80V118M170 111L176 118 182 111" fill="none" style="stroke:var(--muted)" stroke-width="2" />
  </svg><p class="eyebrow">{t('empty.eyebrow')}</p><h3>{t('empty.title')}</h3>
    <p>{t('empty.text')}</p>
    <span class="small muted">{t('empty.demo')}</span></div>;
}
