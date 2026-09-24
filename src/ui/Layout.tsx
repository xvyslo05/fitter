import { useRef, useState } from 'preact/hooks';
import { bbox } from '../geom/polygon';
import type { Pt } from '../model/pattern';
import type { Fabric, NestPiece, NestResult } from '../nest/types';
import { exportPNG, exportSVG } from './export';

const colors = ['#d9e6ce', '#f3d3b7', '#cbdfe6', '#e4d6e9', '#efe4b4', '#cadcd4'];
const cm = (n: number) => new Intl.NumberFormat('cs', { maximumFractionDigits: 1 }).format(n);
const ticks = (length: number) => Array.from({ length: Math.floor(length / 10) + 1 }, (_, i) => i * 10);
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
export function Layout({ material, fabric, pieces, result, mirroredKeys }: {
  material: string; fabric: Fabric; pieces: NestPiece[]; result: NestResult; mirroredKeys: string[];
}) {
  const ref = useRef<SVGSVGElement>(null), [error, setError] = useState(''), [exporting, setExporting] = useState(false);
  const width = fabric.width / (fabric.folded ? 2 : 1), length = fabric.length ?? result.usedLength;
  const displayLength = Math.max(length, 1), pieceMap = new Map(pieces.map((p, i) => [p.key, { ...p, color: colors[i % colors.length] }]));
  return <article class="result-card">
    <div class="result-heading"><div><p class="eyebrow">{fabric.folded ? 'Dvě vrstvy · složená látka' : 'Jedna vrstva'}</p><h3>{material}</h3></div>
      <span class={`badge ${result.unplaced.length ? 'amber' : ''}`}>{result.placements.length} / {pieces.length} umístěno</span></div>
    <dl class="stats"><div><dt>Rozměr</dt><dd>{cm(width)} × {cm(length)} <small>cm</small></dd></div>
      <div><dt>Spotřebovaná délka</dt><dd>{cm(result.usedLength)} <small>cm</small></dd></div>
      <div><dt>Využití</dt><dd>{cm(result.utilization * 100)} <small>%</small></dd></div></dl>
    {fabric.folded && <p class="small muted result-note">Šířka před složením: {cm(fabric.width)} cm. Na obrázku je využitelná polovina.</p>}
    <div class="canvas-scroll">
      <svg ref={ref} xmlns="http://www.w3.org/2000/svg" class="layout-svg" role="img" aria-label={`Rozložení dílů na materiálu ${material}`}
        viewBox={`-14 -14 ${width + 20} ${displayLength + 20}`} width={`${width + 20}cm`} height={`${displayLength + 20}cm`}>
        <title>{material} · rozložení střihů</title>
        <desc>{`Rozměr ${cm(width)} × ${cm(length)} cm. Využití ${cm(result.utilization * 100)} %. Šipky ukazují směr vlákna, ↔ zrcadlení.`}</desc>
        <rect x={-14} y={-14} width={width + 20} height={displayLength + 20} fill="#faf9f5" />
        <g font-family="system-ui, sans-serif" font-size="2.3" fill="#657367" stroke="#d4d9d0" stroke-width="0.16">
          {ticks(width).map(x => <g key={`x${x}`}><line x1={x} x2={x} y1={-3} y2={displayLength} stroke-dasharray="0.5 1" />
            <text x={x} y={-5} text-anchor="middle" stroke="none">{x}</text></g>)}
          {ticks(displayLength).map(y => <g key={`y${y}`}><line x1={-3} x2={width} y1={y} y2={y} stroke-dasharray="0.5 1" />
            <text x={-5} y={y + 0.8} text-anchor="end" stroke="none">{y}</text></g>)}
          <text x={-8} y={-7} stroke="none" font-size="2">cm</text>
        </g>
        <rect x={0} y={0} width={width} height={displayLength} fill="none" stroke="#48614f" stroke-width="0.35" />
        {result.placements.map(placement => {
          const p = pieceMap.get(placement.key)!;
          const b = bbox(placement.polygon), [cx, cy] = labelPoint(placement.polygon);
          const fontSize = Math.min(2.3, Math.max(0.9, Math.min(b.width, b.height) / 6));
          const maxChars = Math.max(3, Math.floor(b.width / (fontSize * 0.66)) - 2);
          const fullLabel = p.label.split(' · ').slice(1).join(' · ');
          const shortLabel = fullLabel.length > maxChars ? fullLabel.slice(0, maxChars - 1) + '…' : fullLabel;
          const arrow = Math.min(5, Math.min(b.height, b.width) * 0.22);
          const mirrored = mirroredKeys.includes(p.key) || placement.flipY;
          return <g key={p.key}><title>{p.label}{mirrored ? ' · zrcadleno' : ''}{p.foldEdge ? ' · na lomu' : ''}</title>
            <polygon points={placement.polygon.map(v => v.join(',')).join(' ')} fill={p.color} stroke="#435b4c" stroke-width="0.22" stroke-linejoin="round" />
            <g transform={`translate(${cx} ${cy})`} fill="#283f33" font-family="system-ui, sans-serif" font-size={fontSize} text-anchor="middle">
              <text y={-fontSize}>{shortLabel}</text>
              <g transform={`rotate(${placement.angle + (placement.flipY ? 180 : 0)})`} stroke="#48614f" stroke-width="0.25" fill="none">
                <path d={`M0,0 L0,${arrow} M-0.8,${arrow - 1} L0,${arrow} L0.8,${arrow - 1}`} />
              </g>
              {mirrored && <text x={fontSize * 1.6} y={fontSize * 1.8}>↔</text>}
            </g>
            {p.foldEdge && <line x1={0} x2={0} y1={b.minY} y2={b.maxY} stroke="#b25336" stroke-width="0.65" />}
          </g>;
        })}
        {fabric.folded && <g stroke="#b25336" fill="#b25336"><line x1={0} x2={0} y1={0} y2={displayLength} stroke-width="0.4" stroke-dasharray="2 1" />
          <text x={1} y={-1.5} font-family="system-ui, sans-serif" font-size="2.5" stroke="none">lom</text></g>}
      </svg>
    </div>
    <div class="drawing-footer"><span>↓ Směr vlákna <span class="legend-gap">↔ Zrcadlení</span></span><span>{result.iterations.toLocaleString('cs')} průchodů</span></div>
    {result.unplaced.length > 0 && <div class="unplaced"><h4>Nevešlo se ({result.unplaced.length})</h4><ul>{result.unplaced.map(key => <li key={key}>{pieceMap.get(key)?.label ?? key}</li>)}</ul></div>}
    <div class="export-actions"><span class="muted small">Stáhnout rozložení</span><button type="button" class="secondary" onClick={() => ref.current && exportSVG(ref.current, material)}>Export SVG</button>
      <button type="button" class="secondary" disabled={exporting} onClick={async () => {
        if (!ref.current) return; setExporting(true); setError('');
        try { await exportPNG(ref.current, material); } catch (e) { setError(e instanceof Error ? e.message : 'Export se nezdařil.'); }
        finally { setExporting(false); }
      }}>{exporting ? 'Připravuji…' : 'Export PNG'}</button></div>
    {error && <p class="warning" role="alert">{error}</p>}
  </article>;
}

export function EmptyLayout() {
  return <div class="empty-layout"><svg viewBox="0 0 320 230" aria-hidden="true">
    <defs><pattern id="empty-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#dce2d7" stroke-width="1" /></pattern></defs>
    <rect x="30" y="20" width="260" height="185" rx="3" fill="url(#empty-grid)" stroke="#aab9a7" stroke-dasharray="4 4" />
    <path d="M45 35H135L148 138 120 160H45Z" fill="#d9e6ce" stroke="#819276" />
    <path d="M163 35H190V175H163Z" fill="#f3d3b7" stroke="#b2967c" />
    <path d="M205 35H268V92L254 104H218L205 92Z" fill="#cbdfe6" stroke="#829da6" />
    <path d="M94 80V118M88 111L94 118 100 111M176 80V118M170 111L176 118 182 111" fill="none" stroke="#61765b" stroke-width="2" />
  </svg><p class="eyebrow">Každý centimetr se počítá</p><h3>Najděte místo pro každý díl.</h3>
    <p>Přidejte střihy do zakázky, zadejte látku<br />a nechte fitter hledat úsporné rozložení.</p>
    <span class="small muted">Demo střih je připravený k vyzkoušení.</span></div>;
}
