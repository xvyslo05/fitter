import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { allSizesClosed, autoGap } from '../pdf/autogap';
import { buildHitIndex, segmentsOf } from '../pdf/hit';
import { detectSizeChips, namedSizes, parseSizeName, SHARED_VALUE, toggleSize } from '../pdf/sizechips';
import { styleKeyOf, styleLegend } from '../pdf/styles';
import { dominantStyleKey, sheetProblem, sizeRole, withoutLettering } from '../pdf/trace';
import { detectScale, parseDecimal, resolveScale } from '../pdf/scale';
import type { ScaleAnswer } from '../pdf/scale';
import { area, bbox } from '../geom/polygon';
import { describe, errorText, fmt, getUnit, parseLength, t, toUnit } from '../i18n';
import { useLocale } from '../i18n/hooks';
import type { PageLayout, PdfDoc, PdfPath, PdfText, ScaleResult, SuggestRequest, TraceProgress, TraceResult, TraceRequest, TraceResponse } from '../pdf/types';
import { sizeColor, useTheme } from '../theme';
import { Advanced, parseTraceOptions } from './PdfAdvanced';
import type { TraceSettings } from './PdfAdvanced';
import { Preview, Swatch, tracePreviewPath } from './PdfPreview';

// The assembled sheet: all paths, texts, and paths without page furniture.
export interface Sheet { paths: PdfPath[]; texts: PdfText[]; content: PdfPath[]; unverified: number }
// The detected check square drawn on its page, so the user sees which square is meant.
function SquarePicture({ doc, scale }: { doc: PdfDoc; scale: ScaleResult }) {
  const canvas = useRef<HTMLCanvasElement>(null), theme = useTheme();
  useEffect(() => {
    const node = canvas.current, ctx = node?.getContext('2d'), page = doc.pages.find(p => p.index === scale.page);
    if (!node || !ctx || !page || !scale.squarePt) return;
    const [x, y, w, h] = scale.squarePt, side = Math.max(w, h) * 2, size = 220, k = size / side, dpr = window.devicePixelRatio || 1;
    node.width = node.height = Math.round(size * dpr);
    const style = getComputedStyle(node), token = (name: string) => style.getPropertyValue(name).trim();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = token('--sheet'); ctx.fillRect(0, 0, node.width, node.height);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * k * (side / 2 - x - w / 2), dpr * k * (side / 2 - y - h / 2));
    ctx.lineJoin = ctx.lineCap = 'round'; ctx.strokeStyle = token('--sheet-line'); ctx.lineWidth = 1 / k;
    const outline = new Path2D();
    for (const path of page.paths) if (path.stroke || path.fill) tracePreviewPath(outline, path);
    ctx.stroke(outline);
    ctx.font = `${12 / k}px system-ui`; ctx.fillStyle = token('--brand-text');
    for (const t of page.texts) ctx.fillText(t.str, t.x, t.y);
    ctx.strokeStyle = token('--focus'); ctx.lineWidth = 3 / k; ctx.strokeRect(x, y, w, h);
  }, [doc, scale, theme]);
  return <canvas ref={canvas} class="pdf-square-picture" role="img" aria-label={t('pdf.square.label', { page: scale.page ?? '' })} />;
}
const cmText = (cm: number) => fmt.length(cm, getUnit(), 2);

// Asks whether the print matches the detected scale instead of showing numbers.
function ScaleQuestion({ doc, detected, result, no, onNo, measured, onMeasured, pieceOk, onPieceOk, percent, onPercent }: {
  doc: PdfDoc; detected: ScaleResult; result: TraceResult | null; no: boolean; onNo: (value: boolean) => void; measured: string; onMeasured: (value: string) => void;
  pieceOk: boolean | null; onPieceOk: (value: boolean | null) => void; percent: string; onPercent: (value: string) => void;
}) {
  const name = useId();
  const buttons = (value: boolean | null, set: (value: boolean) => void, yes: string, nope: string) => <div class="pdf-answer" role="group" aria-labelledby={name}>
    <button type="button" class={value === true ? 'primary' : 'secondary'} aria-pressed={value === true} onClick={() => set(true)}>{yes}</button>
    <button type="button" class={value === false ? 'primary' : 'secondary'} aria-pressed={value === false} onClick={() => set(false)}>{nope}</button></div>;
  if (detected.source === 'square' && detected.squareCm) return <div class="pdf-scale-question">
    {detected.squarePt && <SquarePicture doc={doc} scale={detected} />}
    <p id={name}><strong>{t('pdf.scale.squareQuestion', { size: detected.squareCm })}</strong></p>
    {buttons(!no, v => onNo(!v), t('pdf.yes'), t('pdf.noUnsure'))}
    {no && <label class="field"><span>{t('pdf.scale.measured')}</span><input type="text" inputMode="decimal" value={measured} placeholder={cmText(detected.squareCm)} onInput={e => onMeasured(e.currentTarget.value)} />
      <span class="small muted">{t('pdf.scale.measureHint')}</span></label>}
  </div>;
  // No square: 100 % is assumed; the largest traced piece offers a ruler check.
  const largest = result?.candidates.map(c => ({ c, ring: c.sizes[c.refSize] })).filter(x => x.ring).sort((a, b) => area(b.ring) - area(a.ring))[0];
  const dims = largest && (() => { const b = bbox(largest.ring); return `${cmText(b.width * detected.cmPerPt)} × ${cmText(b.height * detected.cmPerPt)}`; })();
  return <div class="pdf-scale-question">
    <p class="small">{t('pdf.scale.noSquare')}</p>
    {largest && dims && <><p id={name}><strong>{t('pdf.scale.pieceQuestion', { name: largest.c.labels[0] ?? t('pdf.piece.title', { id: largest.c.id }), dims })}</strong></p>{buttons(pieceOk, onPieceOk, t('pdf.yes'), t('pdf.no'))}</>}
    {pieceOk === false && <label class="field"><span>{t('pdf.scale.percent')}</span><input type="text" inputMode="decimal" value={percent} placeholder="100" onInput={e => onPercent(e.currentTarget.value)} /></label>}
  </div>;
}


// One trace in its own worker (step 2 asks for progress); `cancel` ends it and the promise then never settles.
function traceInWorker(request: TraceRequest, onProgress: (progress: TraceProgress) => void): { done: Promise<TraceResult>; cancel: () => void } {
  let worker: Worker | undefined;
  const done = new Promise<TraceResult>((resolve, reject) => {
    try {
      worker = new Worker(new URL('../pdf/trace.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<TraceResponse>) => {
        const data = event.data;
        if ('progress' in data) { onProgress(data.progress); return; }
        worker?.terminate();
        if ('result' in data) resolve(data.result); else if ('error' in data) reject(new Error(describe(data.error))); else reject(new Error(t('pdf.sizes.traceFailed')));
      };
      worker.onerror = () => { worker?.terminate(); reject(new Error(t('pdf.sizes.traceFailedHint'))); };
      worker.postMessage({ ...request, progress: true });
    } catch (e) { worker?.terminate(); reject(e); }
  });
  return { done, cancel: () => worker?.terminate() };
}

export function Sizes({ doc, layout, sheet, active, result, onResult }: {
  doc: PdfDoc; layout: PageLayout; sheet: Sheet; active: boolean; result: TraceResult | null; onResult: (value: TraceResult | null) => void;
}) {
  const legend = useMemo(() => styleLegend(sheet.content), [sheet]), theme = useTheme(), dark = theme === 'dark';
  const [hovered, setHovered] = useState<string | null>(null), [focused, setFocused] = useState<string | null>(null);
  // The tapped (or clicked) style stays highlighted; hover and focus show other styles meanwhile.
  const [pinned, setPinned] = useState<string | null>(null), highlight = hovered ?? focused ?? pinned;
  const detected = useMemo(() => detectScale(doc), [doc]);
  const [assignments, setAssignments] = useState<Record<string, string>>({}), [suggesting, setSuggesting] = useState(false);
  const companions = highlight && sizeRole(assignments[highlight]) === 'named' ? legend.filter(e => sizeRole(assignments[e.key]) === 'shared').map(e => e.key) : [];
  // Sizes named on the sheet, plus those added by hand; sizes typed into the table of line styles join them.
  const [chips, setChips] = useState<string[]>(() => detectSizeChips(sheet.texts)), [adding, setAdding] = useState(false), [newSize, setNewSize] = useState(''), [chipError, setChipError] = useState('');
  useEffect(() => { setChips(detectSizeChips(sheet.texts)); }, [sheet]);
  const allChips = useMemo(() => [...new Set([...chips, ...Object.values(assignments).flatMap(namedSizes)])], [chips, assignments]);
  const assign = (key: string, value: string) => setAssignments(prev => ({ ...prev, [key]: value }));
  // Taps are answered by the nearest line of the lines that are traced (no page frames or lettering).
  const hitIndex = useMemo(() => {
    const index = new Map(legend.map((entry, i) => [entry.key, i]));
    return buildHitIndex(segmentsOf(withoutLettering(sheet.content), path => index.get(styleKeyOf(path))));
  }, [sheet, legend]);
  const onTap = (at: [number, number], tolerance: number) => { const hit = hitIndex.hit(at[0], at[1], tolerance); setPinned(hit ? legend[hit.owner].key : null); };
  // The scale answer lives here (Sizes stays mounted), so going back and forth does not ask again.
  const [scaleNo, setScaleNo] = useState(false), [measured, setMeasured] = useState(''), [percent, setPercent] = useState(''), [pieceOk, setPieceOk] = useState<boolean | null>(null);
  const [trace, setTrace] = useState<TraceSettings>({ gap: '1', resolution: '0.5', minArea: '15' });
  const [excludeScaleMarks, setExcludeScaleMarks] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  // Per-size progress, the gap (mm) of a retry in progress, and the gap that finally closed the pieces.
  const [progress, setProgress] = useState<TraceProgress | null>(null), [retryGap, setRetryGap] = useState<number | null>(null), [widenedGap, setWidenedGap] = useState<number | null>(null);
  // Set when no style wins the suggestion and the one dominant style traces as overlapping pieces.
  const [probeProblem, setProbeProblem] = useState(false);
  // Suggest "uni" for the style that encloses clearly the most area (coarse trace in the worker).
  // The user's own entries always win over a late suggestion.
  useEffect(() => {
    let worker: Worker | undefined, cancelled = false;
    setAssignments({}); setSuggesting(true); setProbeProblem(false);
    let probe: Worker | undefined;
    try {
      worker = new Worker(new URL('../pdf/trace.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<TraceResponse>) => {
        const data = event.data;
        if (!cancelled && 'suggestion' in data) setAssignments(prev => Object.values(prev).some(v => v.trim()) ? prev : data.suggestion);
        if (!cancelled) setSuggesting(false);
        worker?.terminate();
        // No winner: trace the one style that holds most of the line length once at 1 mm and look for overlapping pieces.
        const key = !cancelled && 'suggestion' in data && !Object.keys(data.suggestion).length ? dominantStyleKey(sheet.content) : undefined;
        if (!key) return;
        try {
          probe = new Worker(new URL('../pdf/trace.worker.ts', import.meta.url), { type: 'module' });
          probe.onmessage = (e: MessageEvent<TraceResponse>) => {
            if (!cancelled && 'result' in e.data) setProbeProblem(sheetProblem(e.data.result) !== null);
            probe?.terminate();
          };
          probe.onerror = () => probe?.terminate();
          const request: TraceRequest = { paths: sheet.content, texts: sheet.texts, assignments: { [key]: 'uni' }, scale: detected,
            options: { cmPerPt: detected.cmPerPt, gapMm: 1, resolutionMm: 1, minAreaCm2: 15 }, excludeScaleMarks: true };
          probe.postMessage(request);
        } catch { /* the probe is optional */ }
      };
      worker.onerror = () => { if (!cancelled) setSuggesting(false); worker?.terminate(); };
      // Page furniture (frames, marks repeated on every page) must not win the default "uni" guess.
      const request: SuggestRequest = { suggest: true, paths: sheet.content, texts: sheet.texts, scale: detected };
      worker.postMessage(request);
    } catch { setSuggesting(false); }
    return () => { cancelled = true; worker?.terminate(); probe?.terminate(); };
  }, [sheet, detected]);
  const settings = useMemo(() => {
    try {
      const answer: ScaleAnswer = detected.source === 'square' ? (scaleNo && measured.trim() ? { ok: false, measuredCm: parseLength(measured, getUnit()) } : { ok: true })
        : pieceOk === false && percent.trim() ? { percent: parseDecimal(percent) } : { ok: true };
      const resolved = resolveScale(detected, answer);
      if ('error' in resolved) return { options: null, message: describe(resolved.error) };
      return { options: parseTraceOptions(trace, resolved.scale.cmPerPt), message: '' };
    } catch (e) { return { options: null, message: errorText(e, 'pdf.sizes.checkSettings') }; }
  }, [detected, scaleNo, measured, pieceOk, percent, trace]);
  const selected = Object.values(assignments).some(s => s.trim());
  useEffect(() => {
    if (!active) return;
    onResult(null); setError(''); setBusy(false); setProgress(null); setRetryGap(null); setWidenedGap(null);
    if (!settings.options || !selected) return;
    let cancelled = false, running: ReturnType<typeof traceInWorker> | undefined;
    const options = settings.options;
    setBusy(true);
    const timer = window.setTimeout(() => {
      // Starts at the set gap; when a size closes no piece, wider gaps are tried (2, 4, 6 mm).
      const run = (gapMm: number) => {
        if (cancelled) return new Promise<TraceResult>(() => {});
        if (gapMm > options.gapMm) setRetryGap(gapMm);
        const request: TraceRequest = { paths: sheet.content, texts: sheet.texts, assignments, options: { ...options, gapMm }, scale: detected, excludeScaleMarks };
        running = traceInWorker(request, p => { if (!cancelled) setProgress(p); });
        return running.done;
      };
      autoGap(run, allSizesClosed, options.gapMm).then(outcome => {
        if (cancelled) return;
        onResult(outcome.result); setWidenedGap(outcome.widened ? outcome.gapMm : null);
      }, (e: unknown) => { if (!cancelled) setError(errorText(e, 'pdf.sizes.traceFailed')); })
        .finally(() => { if (!cancelled) { setBusy(false); setProgress(null); setRetryGap(null); } });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); running?.cancel(); };
  }, [active, sheet, assignments, settings, selected, onResult, detected, excludeScaleMarks]);
  const cmPerPt = settings.options?.cmPerPt ?? detected.cmPerPt, { unit } = useLocale();
  const entry = pinned ? legend.find(e => e.key === pinned) : undefined, questionId = useId();
  const labelOf = (key: string) => sizeRole(assignments[key]) === 'shared' ? t('pdf.result.shared') : namedSizes(assignments[key]).join(', ');
  const assigned = legend.filter(e => sizeRole(assignments[e.key]) !== 'none');
  const addSize = (e: Event) => {
    e.preventDefault();
    try { const name = parseSizeName(newSize); setChips(prev => prev.includes(name) ? prev : [...prev, name]); setNewSize(''); setChipError(''); setAdding(false); }
    catch (err) { setChipError(errorText(err, 'error.unknown')); }
  };
  const sizeDot = (size: string) => <span class="chip-dot" style={{ color: sizeColor(allChips.indexOf(size)) }}>●</span>;
  return <div class="pdf-size-workspace"><div class="pdf-size-controls">
    <h3>{t('pdf.sizes.title')}</h3><p class="small muted">{t('pdf.sizes.help')}</p>
    <div class="pdf-chips" role="group" aria-label={t('pdf.chips.label')}>
      {allChips.map(size => <span key={size} class="chip">{sizeDot(size)} {size}</span>)}
      {!adding && <button type="button" class="text-button" onClick={() => setAdding(true)}>{t('pdf.chips.add')}</button>}
    </div>
    {!allChips.length && <p class="small muted">{t('pdf.chips.none')}</p>}
    {adding && <form class="pdf-chip-form" onSubmit={addSize}>
      <input type="text" aria-label={t('pdf.chips.name')} value={newSize} maxLength={12} autoFocus onInput={e => setNewSize(e.currentTarget.value)} />
      <button type="submit" class="secondary">{t('pdf.chips.confirm')}</button>
      {chipError && <p class="warning" role="alert">{chipError}</p>}
    </form>}
    <h3>{t('pdf.result.title')}</h3>
    {assigned.length ? <ul class="pdf-assigned">{assigned.map(e => <li key={e.key}>
      <button type="button" class={`pdf-assigned-row${pinned === e.key ? ' pinned' : ''}`} aria-pressed={pinned === e.key} aria-label={t('pdf.result.change', { sizes: labelOf(e.key) })}
        onClick={() => setPinned(k => k === e.key ? null : e.key)} onMouseEnter={() => setHovered(e.key)} onMouseLeave={() => setHovered(k => k === e.key ? null : k)}
        onFocus={() => setFocused(e.key)} onBlur={() => setFocused(k => k === e.key ? null : k)}><Swatch entry={e} dark={dark} /><span>{labelOf(e.key)}</span></button></li>)}</ul>
      : <p class="small muted">{t('pdf.result.empty')}</p>}
    <h3>{t('pdf.scale.title')}</h3>
    <ScaleQuestion doc={doc} detected={detected} result={result} no={scaleNo} onNo={setScaleNo} measured={measured} onMeasured={setMeasured}
      pieceOk={pieceOk} onPieceOk={setPieceOk} percent={percent} onPercent={setPercent} />
    <Advanced legend={legend} assignments={assignments} onAssign={assign} highlight={highlight} pinned={pinned} onPin={setPinned} onHover={setHovered} onFocus={setFocused}
      dark={dark} unit={unit} cmPerPt={cmPerPt} settings={trace} onSettings={patch => setTrace(prev => ({ ...prev, ...patch }))} excludeScaleMarks={excludeScaleMarks} onExcludeScaleMarks={setExcludeScaleMarks} />
    {(result ? sheetProblem(result) : probeProblem) && <div class="warning" role="alert"><p>{t('pdf.sizes.overlap')}</p>
      <p class="small">{t('pdf.sizes.overlapHint')}</p></div>}
    {settings.message && <p class="warning" role="alert">{settings.message}</p>}
    {error && <p class="warning" role="alert">{error}</p>}
    {widenedGap !== null && !busy && <p class="small" role="status">{t('pdf.sizes.gapNote', { gap: widenedGap / 10 })}</p>}
    <div role="status" class="small">
      {busy ? <>{retryGap !== null && <p>{t('pdf.progress.retry', { gap: retryGap / 10 })}</p>}
        <p>{progress ? t('pdf.progress.size', { size: progress.size, done: progress.done, total: progress.total }) : t('pdf.sizes.tracing')}</p>
        {progress && <progress aria-label={t('pdf.progress.label')} max={progress.total} value={progress.done} />}</>
        : suggesting && !selected ? t('pdf.sizes.searching') : !selected ? t('pdf.sizes.assign') : result ? t('pdf.sizes.found', { count: result.candidates.length }) : ''}
    </div>
  </div><div class="pdf-size-results"><Preview doc={doc} layout={layout} sizesMode result={result} highlight={highlight} companions={companions} onTap={onTap} />
    {entry && <section class="pdf-line-panel" role="group" aria-labelledby={questionId}>
      <div class="pdf-line-head"><Swatch entry={entry} dark={dark} /><strong id={questionId}>{t('pdf.line.question')}</strong></div>
      {allChips.length ? <div class="pdf-chips">{allChips.map(size => <button type="button" key={size} class={`chip-button${namedSizes(assignments[entry.key]).includes(size) ? ' active' : ''}`}
        aria-pressed={namedSizes(assignments[entry.key]).includes(size)} onClick={() => assign(entry.key, toggleSize(assignments[entry.key], size, allChips))}>{sizeDot(size)} {size}</button>)}</div>
        : <p class="small muted">{t('pdf.line.noChips')}</p>}
      <div class="pdf-line-actions">
        <button type="button" class="secondary" aria-pressed={sizeRole(assignments[entry.key]) === 'shared'} onClick={() => assign(entry.key, SHARED_VALUE)}>{t('pdf.line.shared')}</button>
        <button type="button" class="secondary" aria-pressed={sizeRole(assignments[entry.key]) === 'none'} onClick={() => assign(entry.key, '')}>{t('pdf.line.none')}</button>
        <button type="button" class="text-button" onClick={() => setPinned(null)}>{t('pdf.line.done')}</button></div>
    </section>}
    {result && <section><h3>{t('pdf.found.title')}</h3>{!result.candidates.length ? <p class="muted">{t('pdf.found.none')}</p> :
      <div class="pdf-table-scroll"><table class="pdf-candidates"><thead><tr><th>{t('pdf.found.piece')}</th><th>{t('pdf.found.size')}</th><th>{t('pdf.found.area')}</th><th>{t('pdf.found.dimensions')}</th></tr></thead><tbody>
        {result.candidates.flatMap(c => Object.entries(c.sizes).map(([size, ring]) => {
          const b = bbox(ring), k = result.cmPerPt;
          return <tr key={`${c.id}:${size}`}><th>{c.id}</th><td style={{ color: sizeColor(result.sizes.indexOf(size)) }}>{size}</td><td>{fmt.area(area(ring) * k * k, unit).toFixed(1)}</td><td>{toUnit(b.width * k, unit).toFixed(1)} × {toUnit(b.height * k, unit).toFixed(1)}</td></tr>;
        }))}</tbody></table></div>}</section>}
  </div></div>;
}
