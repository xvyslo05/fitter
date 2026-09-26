import { useMemo } from 'preact/hooks';
import { bbox, pointSegmentDistance } from '../geom/polygon';
import { foldEdges, sizeFolds } from '../pdf/pieces';
import type { Edge, PieceDraft } from '../pdf/pieces';
import type { PieceCandidate, Pt, TraceResult } from '../pdf/types';
import { sizeColor } from '../theme';

const points = (ring: Pt[]) => ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const degrees = (n: number) => Number.isFinite(n) ? Math.round(n * 10) / 10 : '';

// Checked before "Další"; buildPattern + parsePatternFile validate the rest in step 4.
export function draftProblems(draft: PieceDraft): string[] {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push('Zadejte název dílu.');
  if (!draft.cut.length) problems.push('Přidejte alespoň jeden materiál.');
  if (draft.cut.some(c => !c.material.trim())) problems.push('Vyplňte název materiálu.');
  if (draft.cut.some(c => !Number.isInteger(c.count) || c.count < 1 || c.count > 1000)) problems.push('Počet kusů musí být celé číslo 1–1 000.');
  if (!Number.isFinite(draft.grainAngle)) problems.push('Zadejte úhel směru vlákna.');
  return problems;
}

// Sheet-space preview: reference size filled, other sizes thin, straight edges clickable as fold.
function Thumbnail({ result, candidate, draft, edges, folds, onPick }: {
  result: TraceResult; candidate: PieceCandidate; draft: PieceDraft; edges: Edge[]; folds: Record<string, [Pt, Pt] | null>; onPick: (edge: number) => void;
}) {
  const ref = candidate.sizes[candidate.refSize];
  const view = useMemo(() => {
    const b = bbox(Object.values(candidate.sizes).flat()), pad = Math.max(b.width, b.height) * 0.06 + 2;
    return `${b.minX - pad} ${b.minY - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}`;
  }, [candidate]);
  const b = bbox(ref), a = draft.grainAngle * Math.PI / 180, d: Pt = [Math.cos(a), Math.sin(a)];
  const half = Number.isFinite(a) ? 0.3 * (Math.abs(b.width * d[0]) + Math.abs(b.height * d[1])) : 0, head = Math.max(half * 0.35, 4);
  const c: Pt = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], tip: Pt = [c[0] + d[0] * half, c[1] + d[1] * half];
  const wing = (turn: number): Pt => [tip[0] - head * Math.cos(a + turn), tip[1] - head * Math.sin(a + turn)];
  const arrow = [[c[0] - d[0] * half, c[1] - d[1] * half], tip, wing(0.45), tip, wing(-0.45)] as Pt[];
  function pick(e: MouseEvent) {
    const svg = e.currentTarget as SVGSVGElement, m = svg.getScreenCTM();
    if (!m || !edges.length) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()), at: Pt = [p.x, p.y];
    const distances = edges.map(edge => pointSegmentDistance(at, edge.a, edge.b)), best = distances.indexOf(Math.min(...distances));
    // Within about 16 screen pixels of the edge.
    if (distances[best] * Math.abs(m.a) <= 16) onPick(best);
  }
  const fold = draft.foldEdge === null ? undefined : edges[draft.foldEdge];
  return <svg class={`pdf-thumb${edges.length ? ' pickable' : ''}`} viewBox={view} role="img" onClick={pick}
    aria-label={`Náhled kandidáta ${candidate.id}: ${Object.keys(candidate.sizes).length} velikostí, ${fold ? 'lom vyznačen' : 'bez lomu'}, vlákno ${degrees(draft.grainAngle)}°`}>
    <polygon points={points(ref)} class="pdf-thumb-ref" vector-effect="non-scaling-stroke" />
    {Object.entries(candidate.sizes).filter(([size]) => size !== candidate.refSize).map(([size, ring]) =>
      <polygon key={size} points={points(ring)} fill="none" style={{ stroke: sizeColor(result.sizes.indexOf(size)) }} stroke-width="1" vector-effect="non-scaling-stroke" />)}
    {edges.map((e, j) => j !== draft.foldEdge && <line key={j} x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]} class="pdf-thumb-edge" vector-effect="non-scaling-stroke" />)}
    {Object.entries(folds).map(([size, f]) => f && <line key={size} x1={f[0][0]} y1={f[0][1]} x2={f[1][0]} y2={f[1][1]} class="pdf-thumb-fold" vector-effect="non-scaling-stroke" />)}
    {half > 0 && <polyline points={points(arrow)} class="pdf-thumb-grain" vector-effect="non-scaling-stroke" />}
  </svg>;
}

function PieceCard({ result, candidate, draft, auto, onChange }: {
  result: TraceResult; candidate: PieceCandidate; draft: PieceDraft; auto: PieceDraft; onChange: (patch: Partial<PieceDraft>) => void;
}) {
  const k = result.cmPerPt;
  const edges = useMemo(() => foldEdges(candidate, k), [candidate, k]);
  const folds = useMemo(() => sizeFolds(candidate, draft.foldEdge, k), [candidate, draft.foldEdge, k]);
  const missing = draft.foldEdge === null ? [] : Object.keys(folds).filter(size => !folds[size]);
  const longest = edges.reduce((best, e, j) => e.length > edges[best].length ? j : best, 0);
  // Editing the counts answers the hint about an instruction without material.
  const setCuts = (cut: PieceDraft['cut']) => onChange({ cut, hint: undefined });
  const setCut = (index: number, patch: Partial<PieceDraft['cut'][number]>) => setCuts(draft.cut.map((c, i) => i === index ? { ...c, ...patch } : c));
  const turn = (by: number) => onChange({ grainAngle: (((Number.isFinite(draft.grainAngle) ? draft.grainAngle : 90) + by) % 360 + 360) % 360 });
  const problems = draft.include ? draftProblems(draft) : [];
  return <article class={`pdf-piece${draft.include ? '' : ' excluded'}`} aria-label={`Kandidát ${candidate.id}`}>
    <div class="pdf-piece-heading"><h4>Kandidát {candidate.id}</h4>
      <label class="check"><input type="checkbox" checked={draft.include} onChange={e => onChange({ include: e.currentTarget.checked })} />Použít</label></div>
    <Thumbnail result={result} candidate={candidate} draft={draft} edges={edges} folds={folds} onPick={foldEdge => { if (draft.include) onChange({ foldEdge }); }} />
    <fieldset class="pdf-piece-fields" disabled={!draft.include}>
      <label class="field"><span>Název</span><input type="text" value={draft.name} maxLength={120} onInput={e => onChange({ name: e.currentTarget.value })} /></label>
      <div class="pdf-cuts" role="group" aria-label={`Počty · kandidát ${candidate.id}`}><span class="pdf-label">Počty</span>
        {draft.cut.map((c, i) => <div class="pdf-cut-row" key={i}>
          <input type="text" aria-label={`Materiál ${i + 1}`} value={c.material} placeholder="např. podšívka" maxLength={80} onInput={e => setCut(i, { material: e.currentTarget.value })} />
          <span class="input-unit"><input type="number" aria-label={`Počet kusů · materiál ${i + 1}`} min={1} max={1000} step={1}
            value={Number.isFinite(c.count) ? c.count : ''} onInput={e => setCut(i, { count: e.currentTarget.valueAsNumber })} /><span aria-hidden="true">×</span></span>
          <button type="button" class="icon-button" aria-label={`Odebrat materiál ${i + 1}`} disabled={draft.cut.length === 1}
            onClick={() => setCuts(draft.cut.filter((_, n) => n !== i))}>×</button>
        </div>)}
        <button type="button" class="text-button" onClick={() => setCuts([...draft.cut, { material: '', count: 1 }])}>+ Přidat materiál</button>
        {draft.hint && <p class="warning small">{draft.hint}</p>}
      </div>
      <label class="check"><input type="checkbox" checked={draft.foldEdge !== null} disabled={!edges.length}
        onChange={e => onChange({ foldEdge: e.currentTarget.checked ? longest : null })} />
        <span>Lom (stříhá se na přeložené látce)<small>{edges.length ? 'Jinou hranu vyberete kliknutím u rovné hrany v náhledu.' : 'Díl nemá rovnou hranu alespoň 5 cm.'}</small></span></label>
      {draft.foldEdge !== null && <label class="field"><span>Hrana lomu</span><select value={draft.foldEdge} onChange={e => onChange({ foldEdge: Number(e.currentTarget.value) })}>
        {edges.map((e, j) => <option key={j} value={j}>Hrana {j + 1} · {(e.length * k).toLocaleString('cs', { maximumFractionDigits: 1 })} cm</option>)}
      </select></label>}
      {missing.length > 0 && <p class="warning small">Lom se nenašel ve velikosti {missing.join(', ')}. Tam se díl uloží bez lomu.</p>}
      <div class="pdf-grain" role="group" aria-label={`Směr vlákna · kandidát ${candidate.id}`}><span class="pdf-label">Směr vlákna</span>
        <div class="pdf-grain-controls">
          <button type="button" class="secondary" aria-pressed={draft.grainAngle === auto.grainAngle} onClick={() => onChange({ grainAngle: auto.grainAngle })}>Podle čáry</button>
          <button type="button" class="secondary" aria-label="Otočit směr vlákna o 90° doleva" onClick={() => turn(-90)}>↺ 90°</button>
          <button type="button" class="secondary" aria-label="Otočit směr vlákna o 90° doprava" onClick={() => turn(90)}>↻ 90°</button>
          <span class="input-unit pdf-angle"><input type="number" aria-label="Úhel směru vlákna ve stupních" step="any" min={-360} max={360}
            value={degrees(draft.grainAngle)} onInput={e => onChange({ grainAngle: e.currentTarget.valueAsNumber })} /><span aria-hidden="true">°</span></span>
        </div>
        <p class="small muted">Úhel v náhledu: 0° vodorovně, 90° svisle. Při uložení se díl otočí, aby vlákno vedlo podél délky látky.</p>
      </div>
      <label class="check"><input type="checkbox" checked={draft.optional} onChange={e => onChange({ optional: e.currentTarget.checked })} />
        <span>Volitelný díl<small>V zakázce je standardně vypnutý.</small></span></label>
      <div class="field-row"><label class="field"><span>Skupina variant</span><input type="text" value={draft.variantGroup} placeholder="např. Kapsa" maxLength={80} onInput={e => onChange({ variantGroup: e.currentTarget.value })} /></label>
        <label class="field"><span>Varianta</span><input type="text" value={draft.variant} placeholder="např. Velká" maxLength={80} onInput={e => onChange({ variant: e.currentTarget.value })} /></label></div>
      {problems.map(p => <p class="warning small" key={p}>{p}</p>)}
    </fieldset>
  </article>;
}

export function Pieces({ result, drafts, suggested, textLayer, onChange }: {
  result: TraceResult; drafts: PieceDraft[]; suggested: PieceDraft[]; textLayer: boolean; onChange: (index: number, patch: Partial<PieceDraft>) => void;
}) {
  const included = drafts.filter(d => d.include).length;
  return <div class="pdf-pieces">
    {!textLayer && <p class="warning">PDF nemá textovou vrstvu (písmo je převedené na křivky) – názvy, počty a lom doplňte podle náhledu.</p>}
    <p class="small muted">Návrhy vycházejí z popisků a čar v PDF. Zkontrolujte název, počty, lom a směr vlákna. Barevné obrysy jsou další velikosti, přerušované čáry rovné hrany vhodné pro lom, červeně je lom, modře směr vlákna. Použito dílů: {included} z {drafts.length}.</p>
    {!included && <p class="warning" role="alert">Vyberte alespoň jeden díl.</p>}
    <div class="pdf-piece-grid">{drafts.map((draft, i) => <PieceCard key={draft.candidateId} result={result} draft={draft} auto={suggested[i]}
      candidate={result.candidates.find(c => c.id === draft.candidateId)!} onChange={patch => onChange(i, patch)} />)}</div>
  </div>;
}
