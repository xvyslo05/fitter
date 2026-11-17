import { useMemo, useState } from 'preact/hooks';
import { bbox, pointSegmentDistance } from '../geom/polygon';
import { describe, fmt, t } from '../i18n';
import { unionCells } from '../pdf/proposals';
import { foldEdges, newRectangle, openRing, rectangleProblems, RECTANGLE_MAX_CM, sizeFolds, snapFoldAt } from '../pdf/pieces';
import type { Edge, PieceDraft, RectangleDraft, VariantDraft } from '../pdf/pieces';
import type { Cell, PieceCandidate, Pt, TraceResult } from '../pdf/types';
import { cellOwners, isConnected, mapCells } from '../pdf/variants';
import { sizeColor } from '../theme';
import { LengthInput } from './fields';

const points = (ring: Pt[]) => ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const degrees = (n: number) => Number.isFinite(n) ? Math.round(n * 10) / 10 : '';
// Cells under this area (cm2) are not tapped on their own; they follow their largest neighbour.
const CELL_TAP_MIN_CM2 = 3;
const variantFill = (index: number) => `var(--piece-${index % 6 + 1})`;

// Checked before "Další"; buildPattern + parsePatternFile validate the rest in step 4.
// `candidate` (with cells) lets it check that each variant's selected cells touch.
export function draftProblems(draft: PieceDraft, candidate?: PieceCandidate): string[] {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push(t('pdf.problem.name'));
  if (!draft.cut.length) problems.push(t('pdf.problem.material'));
  if (draft.cut.some(c => !c.material.trim())) problems.push(t('pdf.problem.materialName'));
  if (draft.cut.some(c => !Number.isInteger(c.count) || c.count < 1 || c.count > 1000)) problems.push(t('pdf.problem.count'));
  if (!Number.isFinite(draft.grainAngle)) problems.push(t('pdf.problem.angle'));
  const labels = draft.variants.map(v => fmt.lower(v.label.trim())), named = labels.filter(Boolean);
  if (named.length < labels.length) problems.push(t('pdf.problem.variantName'));
  if (new Set(named).size < named.length) problems.push(t('pdf.problem.variantUnique'));
  draft.variants.forEach((v, i) => {
    const name = v.label.trim() || `${i + 1}`, selections = Object.entries(v.cells).filter(([, ids]) => ids.length);
    if (!selections.length) problems.push(t('pdf.problem.variantEmpty', { name }));
    else if (selections.some(([size, ids]) => { const cells = candidate?.cells?.[size]; return cells && !isConnected(cells, ids); }))
      problems.push(t('pdf.problem.variantSplit', { name }));
  });
  return problems;
}

// Sheet-space preview: reference size filled, other sizes thin, straight edges clickable as fold.
// Variant mode: the reference cells are buttons; `selected` are the active variant's reference cells (filled),
// `owners` maps each cell to the tappable cell it follows, `mapped` is the active variant in the other sizes.
interface CellPicker { cells: Cell[]; owners: Map<number, number>; selected: Set<number>; fill: string; mapped: Record<string, number[]>; onToggle: (owner: number) => void }
function Thumbnail({ result, candidate, draft, edges, folds, picker, onPick }: {
  result: TraceResult; candidate: PieceCandidate; draft: PieceDraft; edges: Edge[]; folds: Record<string, [Pt, Pt] | null>; picker?: CellPicker; onPick: (edge: number) => void;
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
    if (!m || !edges.length || picker) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()), at: Pt = [p.x, p.y];
    const distances = edges.map(edge => pointSegmentDistance(at, edge.a, edge.b)), best = distances.indexOf(Math.min(...distances));
    // Within about 16 screen pixels of the edge.
    if (distances[best] * Math.abs(m.a) <= 16) onPick(best);
  }
  const fold = draft.foldEdge === null ? undefined : edges[draft.foldEdge];
  const hatch = Math.max(b.width, b.height) / 40, hatchId = `pdf-hatch-${candidate.id}`;
  const taps = picker ? picker.cells.filter(c => picker.owners.get(c.id) === c.id) : [];
  const toggleKey = (owner: number) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker!.onToggle(owner); } };
  return <svg class={`pdf-thumb${edges.length && !picker ? ' pickable' : ''}`} viewBox={view} role={picker ? 'group' : 'img'} onClick={pick}
    aria-label={t('pdf.thumb.label', { id: candidate.id, sizes: Object.keys(candidate.sizes).length, fold: t(fold ? 'pdf.thumb.foldMarked' : 'pdf.thumb.noFold'), grain: degrees(draft.grainAngle) })}>
    {picker && <defs><pattern id={hatchId} patternUnits="userSpaceOnUse" width={hatch} height={hatch} patternTransform="rotate(45)">
      <rect width={hatch} height={hatch} class="pdf-hatch-bg" /><line x1="0" y1="0" x2="0" y2={hatch} class="pdf-hatch-line" vector-effect="non-scaling-stroke" /></pattern></defs>}
    {picker ? picker.cells.map(cell => {
      const owner = picker.owners.get(cell.id)!, on = picker.selected.has(owner), tap = owner === cell.id;
      return <g key={cell.id} class={`pdf-cell${on ? ' on' : ''}`} onClick={() => picker.onToggle(owner)}
        {...(tap ? { role: 'button', tabIndex: 0, 'aria-pressed': on, 'aria-label': t('pdf.cell', { n: taps.findIndex(tap => tap.id === cell.id) + 1 }), onKeyDown: toggleKey(owner) } : {})}>
        <polygon points={points(cell.ring)} style={{ fill: on ? picker.fill : `url(#${hatchId})` }} vector-effect="non-scaling-stroke" /></g>;
    }) : <polygon points={points(ref)} class="pdf-thumb-ref" vector-effect="non-scaling-stroke" />}
    {Object.entries(candidate.sizes).filter(([size]) => size !== candidate.refSize).map(([size, ring]) =>
      <polygon key={size} points={points(ring)} fill="none" style={{ stroke: sizeColor(result.sizes.indexOf(size)) }} stroke-width="1" vector-effect="non-scaling-stroke" />)}
    {picker && Object.entries(picker.mapped).flatMap(([size, ids]) => ids.map(id => candidate.cells?.[size]?.find(c => c.id === id)).flatMap(cell => cell ?
      [<polygon key={`${size}-${cell.id}`} points={points(cell.ring)} class="pdf-thumb-mapped" style={{ stroke: sizeColor(result.sizes.indexOf(size)) }} vector-effect="non-scaling-stroke" />] : []))}
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
  const problems = draft.include ? draftProblems(draft, candidate) : [];
  const [active, setActive] = useState(0), [advanced] = useState(!!(draft.variantGroup || draft.variant));
  const refCells = candidate.cells?.[candidate.refSize], split = draft.variants.length > 0;
  const owners = useMemo(() => refCells ? cellOwners(refCells, CELL_TAP_MIN_CM2 / (k * k)) : new Map<number, number>(), [refCells, k]);
  const tappable = refCells?.filter(c => owners.get(c.id) === c.id) ?? [];
  const activeIndex = Math.min(active, draft.variants.length - 1);
  // The selection is made on the reference size and mapped to the other sizes.
  const selection = (ids: number[]): VariantDraft['cells'] => ({ [candidate.refSize]: ids, ...Object.fromEntries(Object.keys(candidate.sizes)
    .filter(size => size !== candidate.refSize && candidate.cells?.[size]).map(size => [size, mapCells(refCells!, candidate.cells![size], ids)])) });
  const setVariants = (variants: VariantDraft[]) => onChange({ variants });
  const patchVariant = (i: number, patch: Partial<VariantDraft>) => setVariants(draft.variants.map((v, n) => n === i ? { ...v, ...patch } : v));
  const toggle = (owner: number) => {
    const current = draft.variants[activeIndex].cells[candidate.refSize] ?? [], group = refCells!.filter(c => owners.get(c.id) === owner).map(c => c.id);
    patchVariant(activeIndex, { cells: selection(group.every(id => current.includes(id)) ? current.filter(id => !group.includes(id)) : [...new Set([...current, ...group])]) });
  };
  const picker: CellPicker | undefined = split && refCells ? { cells: refCells, owners, fill: variantFill(activeIndex), onToggle: toggle,
    selected: new Set((draft.variants[activeIndex].cells[candidate.refSize] ?? []).map(id => owners.get(id) ?? id)),
    mapped: Object.fromEntries(Object.entries(draft.variants[activeIndex].cells).filter(([size]) => size !== candidate.refSize)) } : undefined;
  // A variant whose outline no longer lies on the fold edge is saved without the fold; say so before step 4.
  const foldLost = useMemo(() => {
    const edge = draft.foldEdge === null ? undefined : edges[draft.foldEdge], lost: string[] = [];
    if (!edge) return lost;
    for (const v of draft.variants) {
      const sizes = Object.entries(v.cells).filter(([size, ids]) => ids.length && (!draft.allSizes || size === candidate.refSize)).flatMap(([size, ids]) => {
        const cells = candidate.cells?.[size];
        try { return cells && !snapFoldAt(unionCells(ids.flatMap(id => { const c = cells.find(x => x.id === id); return c ? [openRing(c.ring)] : []; }), k, result.resolutionMm ?? 0.5), edge, k) ? [size] : []; }
        catch { return []; }
      });
      if (sizes.length) lost.push(t('pdf.variant.lostEntry', { label: v.label.trim() || t('pdf.variant.unnamed'), sizes: sizes.join(', ') }));
    }
    return lost;
  }, [candidate, draft.variants, draft.foldEdge, draft.allSizes, edges, k]);
  return <article class={`pdf-piece${draft.include ? '' : ' excluded'}`} aria-label={t('pdf.piece.title', { id: candidate.id })}>
    <div class="pdf-piece-heading"><h4>{t('pdf.piece.title', { id: candidate.id })}</h4>
      <label class="check"><input type="checkbox" checked={draft.include} onChange={e => onChange({ include: e.currentTarget.checked })} />{t('pdf.piece.use')}</label></div>
    <Thumbnail result={result} candidate={candidate} draft={draft} edges={edges} folds={folds} picker={picker} onPick={foldEdge => { if (draft.include) onChange({ foldEdge }); }} />
    <fieldset class="pdf-piece-fields" disabled={!draft.include}>
      <label class="field"><span>{t('pdf.piece.name')}</span><input type="text" value={draft.name} maxLength={120} onInput={e => onChange({ name: e.currentTarget.value })} /></label>
      <div class="pdf-cuts" role="group" aria-label={t('pdf.piece.countsLabel', { id: candidate.id })}><span class="pdf-label">{t('pdf.piece.counts')}</span>
        {draft.cut.map((c, i) => <div class="pdf-cut-row" key={i}>
          <input type="text" aria-label={t('pdf.cut.material', { n: i + 1 })} value={c.material} placeholder={t('pdf.cut.placeholder')} maxLength={80} onInput={e => setCut(i, { material: e.currentTarget.value })} />
          <span class="input-unit"><input type="number" aria-label={t('pdf.cut.count', { n: i + 1 })} min={1} max={1000} step={1}
            value={Number.isFinite(c.count) ? c.count : ''} onInput={e => setCut(i, { count: e.currentTarget.valueAsNumber })} /><span aria-hidden="true">×</span></span>
          <button type="button" class="icon-button" aria-label={t('pdf.cut.remove', { n: i + 1 })} disabled={draft.cut.length === 1}
            onClick={() => setCuts(draft.cut.filter((_, n) => n !== i))}>×</button>
        </div>)}
        <button type="button" class="text-button" onClick={() => setCuts([...draft.cut, { material: '', count: 1 }])}>{t('pdf.cut.add')}</button>
        {draft.hint && <p class="warning small">{draft.hint.map(describe).join(' ')}</p>}
      </div>
      <label class="check"><input type="checkbox" checked={draft.foldEdge !== null} disabled={!edges.length}
        onChange={e => onChange({ foldEdge: e.currentTarget.checked ? longest : null })} />
        <span>{t('pdf.fold.label')}<small>{t(edges.length ? 'pdf.fold.pick' : 'pdf.fold.none')}</small></span></label>
      {draft.foldEdge !== null && <label class="field"><span>{t('pdf.fold.edge')}</span><select value={draft.foldEdge} onChange={e => onChange({ foldEdge: Number(e.currentTarget.value) })}>
        {edges.map((e, j) => <option key={j} value={j}>{t('pdf.fold.edgeOption', { n: j + 1, length: e.length * k })}</option>)}
      </select></label>}
      {missing.length > 0 && <p class="warning small">{t('pdf.fold.missing', { sizes: missing.join(', ') })}</p>}
      <div class="pdf-grain" role="group" aria-label={t('pdf.grain.groupLabel', { id: candidate.id })}><span class="pdf-label">{t('pdf.grain.title')}</span>
        <div class="pdf-grain-controls">
          <button type="button" class="secondary" aria-pressed={draft.grainAngle === auto.grainAngle} onClick={() => onChange({ grainAngle: auto.grainAngle })}>{t('pdf.grain.auto')}</button>
          <button type="button" class="secondary" aria-label={t('pdf.grain.left')} onClick={() => turn(-90)}>↺ 90°</button>
          <button type="button" class="secondary" aria-label={t('pdf.grain.right')} onClick={() => turn(90)}>↻ 90°</button>
          <span class="input-unit pdf-angle"><input type="number" aria-label={t('pdf.grain.angle')} step="any" min={-360} max={360}
            value={degrees(draft.grainAngle)} onInput={e => onChange({ grainAngle: e.currentTarget.valueAsNumber })} /><span aria-hidden="true">°</span></span>
        </div>
        <p class="small muted">{t('pdf.grain.help')}</p>
      </div>
      <label class="check"><input type="checkbox" checked={!!draft.allSizes} disabled={Object.keys(candidate.sizes).length === result.sizes.length}
        onChange={e => onChange({ allSizes: e.currentTarget.checked })} />
        <span>{t('pdf.allSizes.label')}<small>{t(Object.keys(candidate.sizes).length === result.sizes.length ? 'pdf.allSizes.drawn' : 'pdf.allSizes.reference')}</small></span></label>
      <label class="check"><input type="checkbox" checked={draft.optional} onChange={e => onChange({ optional: e.currentTarget.checked })} />
        <span>{t('pdf.optional.label')}<small>{t('pdf.optional.hint')}</small></span></label>
      {!split && tappable.length > 1 && <div class="pdf-split-offer"><p class="small">{t('pdf.split.offer')}</p>
        <button type="button" class="secondary" onClick={() => { setActive(0); setVariants([{ label: '', cells: selection(refCells!.map(c => c.id)) }]); }}>{t('pdf.split.action')}</button></div>}
      {split && <div class="pdf-variants" role="group" aria-label={t('pdf.variants.groupLabel', { id: candidate.id })}><span class="pdf-label">{t('pdf.variants.title')}</span>
        <p class="small muted">{t('pdf.variants.help')}</p>
        {draft.variants.map((v, i) => <div class="pdf-variant-row" key={i}>
          <button type="button" class="pdf-variant-pick" aria-pressed={i === activeIndex} aria-label={t('pdf.variants.edit', { name: v.label.trim() || i + 1 })} onClick={() => setActive(i)}>
            <span class="pdf-variant-dot" style={{ background: variantFill(i) }} aria-hidden="true" /></button>
          <input type="text" aria-label={t('pdf.variants.nameLabel', { n: i + 1 })} value={v.label} placeholder={t('pdf.variants.namePlaceholder')} maxLength={80}
            onFocus={() => setActive(i)} onInput={e => patchVariant(i, { label: e.currentTarget.value })} />
          <button type="button" class="icon-button" aria-label={t('pdf.variants.remove', { name: v.label.trim() || i + 1 })} disabled={draft.variants.length === 1}
            onClick={() => { setVariants(draft.variants.filter((_, n) => n !== i)); setActive(0); }}>×</button>
        </div>)}
        <div class="pdf-variant-actions">
          <button type="button" class="text-button" onClick={() => { setVariants([...draft.variants, { label: '', cells: {} }]); setActive(draft.variants.length); }}>{t('pdf.variants.add')}</button>
          <button type="button" class="text-button" onClick={() => setVariants([])}>{t('pdf.variants.cancel')}</button></div>
        {foldLost.length > 0 && <p class="warning small">{t('pdf.variants.foldLost', { list: foldLost.join('; ') })}</p>}
      </div>}
      <details class="pdf-advanced" open={advanced}><summary>{t('pdf.advanced.title')}</summary>
        <div class="field-row"><label class="field"><span>{t('pdf.group.label')}</span><input type="text" value={draft.variantGroup} placeholder={split ? draft.name || t('pdf.group.placeholder') : t('pdf.group.placeholder')} maxLength={80} onInput={e => onChange({ variantGroup: e.currentTarget.value })} /></label>
          {!split && <label class="field"><span>{t('pdf.variant.label')}</span><input type="text" value={draft.variant} placeholder={t('pdf.variant.placeholder')} maxLength={80} onInput={e => onChange({ variant: e.currentTarget.value })} /></label>}</div>
        <p class="small muted">{t(split ? 'pdf.group.helpSplit' : 'pdf.group.help')}</p>
      </details>
      {problems.map(p => <p class="warning small" key={p}>{p}</p>)}
    </fieldset>
  </article>;
}

// Dimensions typed in the unit on screen; a decimal comma is accepted, and fractions in inches.
function RectangleCard({ index, rectangle, onChange, onRemove }: {
  index: number; rectangle: RectangleDraft; onChange: (patch: Partial<RectangleDraft>) => void; onRemove: () => void;
}) {
  const sizes = Object.keys(rectangle.sizes), first = rectangle.sizes[sizes[0]];
  const setCuts = (cut: RectangleDraft['cut']) => onChange({ cut });
  const setCut = (i: number, patch: Partial<RectangleDraft['cut'][number]>) => setCuts(rectangle.cut.map((c, n) => n === i ? { ...c, ...patch } : c));
  const setSize = (size: string, patch: Partial<{ width: number; height: number }>) => onChange({ sizes: { ...rectangle.sizes, [size]: { ...rectangle.sizes[size], ...patch } } });
  const setAll = (patch: Partial<{ width: number; height: number }>) => onChange({ sizes: Object.fromEntries(sizes.map(size => [size, { ...rectangle.sizes[size], ...patch }])) });
  const length = (label: string, value: number, onInput: (n: number) => void) => <label class="field"><span>{label}</span>
    <span class="input-unit"><LengthInput max={RECTANGLE_MAX_CM} value={value} onChange={onInput} /><span aria-hidden="true">{fmt.unit()}</span></span></label>;
  const problems = rectangleProblems(rectangle).map(describe);
  return <article class="pdf-piece" aria-label={t('pdf.rect.label', { n: index + 1 })}>
    <div class="pdf-piece-heading"><h4>{t('pdf.rect.title', { n: index + 1 })}</h4>
      <button type="button" class="text-button" onClick={onRemove}>{t('pdf.rect.remove')}</button></div>
    <div class="pdf-piece-fields">
      <label class="field"><span>{t('pdf.piece.name')}</span><input type="text" value={rectangle.name} maxLength={120} placeholder={t('pdf.rect.namePlaceholder')} onInput={e => onChange({ name: e.currentTarget.value })} /></label>
      <div class="pdf-cuts" role="group" aria-label={t('pdf.rect.countsLabel', { n: index + 1 })}><span class="pdf-label">{t('pdf.piece.counts')}</span>
        {rectangle.cut.map((c, i) => <div class="pdf-cut-row" key={i}>
          <input type="text" aria-label={t('pdf.cut.material', { n: i + 1 })} value={c.material} placeholder={t('pdf.cut.placeholder')} maxLength={80} onInput={e => setCut(i, { material: e.currentTarget.value })} />
          <span class="input-unit"><input type="number" aria-label={t('pdf.cut.count', { n: i + 1 })} min={1} max={1000} step={1}
            value={Number.isFinite(c.count) ? c.count : ''} onInput={e => setCut(i, { count: e.currentTarget.valueAsNumber })} /><span aria-hidden="true">×</span></span>
          <button type="button" class="icon-button" aria-label={t('pdf.cut.remove', { n: i + 1 })} disabled={rectangle.cut.length === 1}
            onClick={() => setCuts(rectangle.cut.filter((_, n) => n !== i))}>×</button>
        </div>)}
        <button type="button" class="text-button" onClick={() => setCuts([...rectangle.cut, { material: '', count: 1 }])}>{t('pdf.cut.add')}</button>
      </div>
      {!rectangle.perSize && <div class="field-row">{length(t('pdf.rect.width'), first?.width, n => setAll({ width: n }))}{length(t('pdf.rect.length'), first?.height, n => setAll({ height: n }))}</div>}
      <p class="small muted">{t('pdf.rect.lengthNote')}</p>
      <label class="check"><input type="checkbox" checked={rectangle.perSize} onChange={e => onChange({ perSize: e.currentTarget.checked })} />
        <span>{t('pdf.rect.perSize')}</span></label>
      {rectangle.perSize && <div class="pdf-table-scroll"><table class="pdf-candidates"><thead><tr><th>{t('pdf.rect.colSize')}</th><th>{t('pdf.rect.colWidth')}</th><th>{t('pdf.rect.colLength')}</th></tr></thead>
        <tbody>{sizes.map(size => <tr key={size}><th>{size}</th>
          <td><LengthInput label={t('pdf.rect.widthFor', { size })} max={RECTANGLE_MAX_CM} value={rectangle.sizes[size].width} onChange={width => setSize(size, { width })} /></td>
          <td><LengthInput label={t('pdf.rect.lengthFor', { size })} max={RECTANGLE_MAX_CM} value={rectangle.sizes[size].height} onChange={height => setSize(size, { height })} /></td></tr>)}</tbody></table></div>}
      <label class="check"><input type="checkbox" checked={rectangle.optional} onChange={e => onChange({ optional: e.currentTarget.checked })} />
        <span>{t('pdf.optional.label')}<small>{t('pdf.optional.hint')}</small></span></label>
      <div class="field-row"><label class="field"><span>{t('pdf.group.label')}</span><input type="text" value={rectangle.variantGroup} placeholder={t('pdf.group.placeholder')} maxLength={80} onInput={e => onChange({ variantGroup: e.currentTarget.value })} /></label>
        <label class="field"><span>{t('pdf.variant.label')}</span><input type="text" value={rectangle.variant} placeholder={t('pdf.variant.placeholder')} maxLength={80} onInput={e => onChange({ variant: e.currentTarget.value })} /></label></div>
      {problems.map(p => <p class="warning small" key={p}>{p}</p>)}
    </div>
  </article>;
}

export function Pieces({ result, drafts, suggested, rectangles, textLayer, onChange, onRectangles }: {
  result: TraceResult; drafts: PieceDraft[]; suggested: PieceDraft[]; rectangles: RectangleDraft[]; textLayer: boolean;
  onChange: (index: number, patch: Partial<PieceDraft>) => void; onRectangles: (rectangles: RectangleDraft[]) => void;
}) {
  const included = drafts.filter(d => d.include).length, total = included + rectangles.length;
  return <div class="pdf-pieces">
    {!textLayer && <p class="warning">{t('pdf.pieces.noText')}</p>}
    <p class="small muted">{t('pdf.pieces.intro', { total, all: drafts.length + rectangles.length })}</p>
    {!total && <p class="warning" role="alert">{t('pdf.pieces.none')}</p>}
    <div class="pdf-piece-grid">{drafts.map((draft, i) => <PieceCard key={draft.candidateId} result={result} draft={draft} auto={suggested[i]}
      candidate={result.candidates.find(c => c.id === draft.candidateId)!} onChange={patch => onChange(i, patch)} />)}
      {rectangles.map((rectangle, i) => <RectangleCard key={i} index={i} rectangle={rectangle}
        onChange={patch => onRectangles(rectangles.map((r, n) => n === i ? { ...r, ...patch } : r))} onRemove={() => onRectangles(rectangles.filter((_, n) => n !== i))} />)}</div>
    <p><button type="button" class="secondary" onClick={() => onRectangles([...rectangles, newRectangle(result.sizes)])}>{t('pdf.pieces.addRect')}</button></p>
  </div>;
}
