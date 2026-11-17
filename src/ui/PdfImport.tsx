import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { detectLayout } from '../pdf/layout';
import { assemblePaths, assembleTexts, placePages, unusedPages } from '../pdf/place';
import { contentPages } from '../pdf/match';
import { suggestPieces } from '../pdf/pieces';
import { rectangleProblems } from '../pdf/pieces';
import type { PieceDraft, RectangleDraft } from '../pdf/pieces';
import { applySkips, buildPattern, checkPieces, patternName, slug, sortSizes, suggestSeamAllowance, uniqueId } from '../pdf/build';
import { AppError } from '../errors';
import { describe, errorText, plural, t } from '../i18n';
import { dataDefaults } from '../i18n/data';
import { demo } from '../model/demo';
import { parsePatternFile } from '../model/pattern';
import type { PatternFile } from '../model/pattern';
import type { LayoutBlock, PageLayout, PdfDoc, TraceResult } from '../pdf/types';
import { draftProblems, Pieces } from './PdfPieces';
import { Preview } from './PdfPreview';
import { Sizes } from './PdfSizes';
import type { Sheet } from './PdfSizes';
import { downloadPattern, Save } from './PdfSave';
import type { Skipped } from './PdfSave';
import type { SaveMeta } from './PdfSave';
interface BlockDraft { first: string; last: string; rows: string }
const stepLabels = () => [t('pdf.step.pages'), t('pdf.step.sizes'), t('pdf.step.pieces'), t('pdf.step.save')];
const draft = (b: LayoutBlock): BlockDraft => ({ first: String(b.pages[0]), last: String(b.pages[1]), rows: b.rows.join(',') });
const number = (value: string) => Number(value.replace(',', '.'));

export function closePdfImport(dialog: Pick<HTMLDialogElement, 'close'> | null, focus: Pick<HTMLElement, 'focus'> | null) {
  dialog?.close();
  focus?.focus();
}

export function PdfImport({ patterns, onSaved, onClose }: { patterns: PatternFile[]; onSaved: (pattern: PatternFile) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), request = useRef(0);
  const [doc, setDoc] = useState<PdfDoc | null>(null), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [stage, setStage] = useState(1), [traced, setTraced] = useState<TraceResult | null>(null);
  // Step 1 shows a confirmation; the block and tile-step editors open on request or when detection is unsure.
  const [manual, setManual] = useState(false), editors = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (manual) editors.current?.focus(); }, [manual]);
  useEffect(() => { dialog.current?.scrollTo({ top: 0 }); }, [stage]);
  const [detected, setDetected] = useState<ReturnType<typeof detectLayout> | null>(null);
  const [blocks, setBlocks] = useState<BlockDraft[]>([]), [step, setStep] = useState(['', '']);
  // Piece drafts belong to one trace result (key); `suggested` backs "Podle čáry".
  const [pieces, setPieces] = useState<{ key: string; suggested: PieceDraft[]; drafts: PieceDraft[]; rectangles: RectangleDraft[] } | null>(null);
  // Sizes, folds or pieces left out of the built pattern in step 4; the drafts stay untouched.
  const [skips, setSkips] = useState<Skipped[]>([]);
  const [meta, setMeta] = useState<SaveMeta | null>(null);
  useEffect(() => {
    const focus = document.activeElement, node = dialog.current;
    node?.showModal();
    return () => { request.current++; closePdfImport(node, focus instanceof HTMLElement ? focus : null); };
  }, []);
  const edited = useMemo(() => {
    if (!doc) return { layout: null, message: '' };
    try {
      const layout: PageLayout = { step: [number(step[0]), number(step[1])], blocks: blocks.map(b => ({
        pages: [number(b.first), number(b.last)], rows: b.rows.split(',').map(s => Number(s.trim())),
      })) };
      // The same validation drives both the editor and programmatic placement.
      placePages(doc, layout);
      return { layout, message: '' };
    } catch (e) { return { layout: null, message: errorText(e, 'pdf.layout.check') }; }
  }, [doc, blocks, step]);
  const unused = doc && edited.layout ? unusedPages(doc, edited.layout) : [];
  const showEditors = manual || !detected?.confident || !edited.layout;
  const sheet = useMemo<Sheet | null>(() => {
    if (!doc || !edited.layout) return null;
    const { placements, seams } = placePages(doc, edited.layout);
    return { paths: assemblePaths(doc, placements), texts: assembleTexts(doc, placements), content: assemblePaths(contentPages(doc), placements), unverified: seams.filter(m => !m.matched).length };
  }, [doc, edited.layout]);
  const suggestedSeam = useMemo(() => sheet ? suggestSeamAllowance(sheet.texts) : 'unknown', [sheet]);
  const piecesReady = !!pieces && (pieces.drafts.some(d => d.include) || pieces.rectangles.length > 0) && pieces.drafts.every(d => !d.include || !draftProblems(d, traced?.candidates.find(c => c.id === d.candidateId)).length)
    && pieces.rectangles.every(r => !rectangleProblems(r).length);
  const built = useMemo(() => {
    if (stage !== 4 || !traced || !pieces || !meta) return null;
    try {
      if (meta.id.trim() === demo.id) throw new Error(t('pdf.build.demoId'));
      const whole = buildPattern(traced, pieces.drafts, { ...meta, id: meta.id.trim(), source: name }, pieces.rectangles);
      // Piece ids are built in draft order: remember which candidate each came from.
      const candidates = new Map(whole.pieces.map((p, i) => [p.id, pieces.drafts.filter(d => d.include)[i]?.candidateId]));
      const pattern = applySkips(whole, skips.map(s => s.skip)), problems = checkPieces(pattern);
      if (problems.length) return { pattern: null, error: '', problems, candidates };
      if (!pattern.pieces.length) return { pattern: null, error: t('pdf.build.nothingLeft'), problems, candidates };
      parsePatternFile(pattern);
      return { pattern, error: '', problems, candidates };
    } catch (e) { return { pattern: null, error: errorText(e, 'pdf.build.failed'), problems: [], candidates: new Map<string, number | undefined>() }; }
  }, [stage, traced, pieces, meta, name, skips]);
  // A repeated trace of the same sheet gives the same result: keep the user's edits then.
  function toPieces() {
    if (!traced || !sheet) return;
    const key = JSON.stringify(traced);
    if (pieces?.key !== key) {
      const suggested = suggestPieces(traced, { contentPaths: sheet.content, texts: sheet.texts });
      setPieces({ key, suggested, drafts: suggested, rectangles: [] }); setMeta(null); setSkips([]);
    }
    setStage(3);
  }
  function toSave() {
    if (!meta && traced) {
      const title = patternName(doc?.title, name);
      setMeta({ name: title, id: uniqueId(slug(title) || slug(dataDefaults().pattern), patterns.map(p => p.id)), author: '', seamAllowance: suggestedSeam, sizes: sortSizes(traced.sizes) });
    }
    setStage(4);
  }
  // ready[i]: step i + 1 can be opened from the step before it.
  const ready = [true, !!edited.layout && !busy, !!traced?.candidates.length, piecesReady];
  const next = [() => setStage(2), toPieces, toSave][stage - 1];
  function apply(layout: PageLayout) {
    setBlocks(layout.blocks.map(draft)); setStep(layout.step.map(n => String(Math.round(n * 1000) / 1000)));
  }
  async function open(file?: File) {
    if (!file) return;
    const id = ++request.current;
    setBusy(true); setError(''); setDoc(null); setName(file.name); setDetected(null); setManual(false); setStage(1); setTraced(null); setPieces(null); setMeta(null); setSkips([]);
    try {
      const { readPdf } = await import('../pdf/readPdf');
      const doc = await readPdf(new Uint8Array(await file.arrayBuffer()));
      if (request.current !== id) return;
      const result = detectLayout(doc);
      setDoc(doc); setDetected(result); apply(result.layout);
    } catch (e) {
      // Keep the technical cause visible: browser-specific failures are otherwise impossible to diagnose.
      console.error('PDF import failed', e);
      if (request.current !== id) return;
      const name = e instanceof Error ? e.name : '';
      setError(e instanceof AppError ? describe(e) : name === 'PasswordException' ? t('pdf.error.password')
        : name === 'InvalidPDFException' ? t('pdf.error.invalid')
        : t('pdf.error.load', { cause: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }));
    }
    finally { if (request.current === id) setBusy(false); }
  }
  function update(index: number, field: keyof BlockDraft, value: string) {
    setBlocks(prev => prev.map((block, i) => i === index ? { ...block, [field]: value } : block));
  }
  return <dialog ref={dialog} class="pdf-dialog" aria-labelledby="pdf-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <div class="pdf-header"><div><p class="eyebrow">{t('pdf.eyebrow')}</p><h2 id="pdf-title">{t('pdf.title')}</h2></div>
      <button type="button" class="secondary" onClick={onClose}>{t('pdf.close')}</button></div>
    <ol class="pdf-steps" aria-label={t('pdf.stepsLabel')}>{stepLabels().map((label, i) => <li key={label} aria-current={stage === i + 1 ? 'step' : undefined}
      aria-disabled={i + 1 > stage && !ready[i] ? 'true' : undefined}>{i + 1} · {label}</li>)}</ol>
    <p class="small muted">{t('pdf.intro')}</p>
    {stage === 1 && <label class="field pdf-file"><span>{t('pdf.choose')}</span><input type="file" accept=".pdf,application/pdf" onChange={e => { void open(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} /></label>}
    {busy && <p role="status">{t('pdf.loading', { name })}</p>}
    {error && <p class="warning" role="alert">{error}</p>}
    {stage === 1 && doc && detected && <>
      {!doc.pages.some(p => p.paths.length) && <p class="warning">{t('pdf.noVectors')}</p>}
      {!showEditors && edited.layout && sheet ? <div class="pdf-confirm">
        <p class="pdf-summary"><strong>{name}</strong><br />{plural('pdf.confirm.summary', doc.pages.length - unused.length)}
          {sheet.unverified > 0 && <> {t('pdf.confirm.unverified', { count: sheet.unverified })}</>}{unused.length > 0 && <> {t('pdf.confirm.unused', { count: unused.length })}</>}</p>
        <Preview doc={doc} layout={edited.layout} />
        <div class="pdf-answer"><button type="button" class="primary" onClick={() => setStage(2)}>{t('pdf.confirm.yes')}</button>
          <button type="button" class="secondary" onClick={() => setManual(true)}>{t('pdf.confirm.edit')}</button></div>
      </div> : <>
        <p class="pdf-summary"><strong>{name}</strong> · {t('pdf.pageCountLabel', { count: doc.pages.length })}</p>
        <div class="pdf-workspace"><div class="pdf-editor"><h3 ref={editors} tabIndex={-1}>{t('pdf.blocks.title')}</h3>
          {!manual && <p class="warning" role="status">{t(edited.layout ? 'pdf.blocks.unsure' : 'pdf.blocks.fix')}</p>}
          <p class="small muted">{t('pdf.blocks.detection', { source: detected.sources.map(code => describe({ code })).join(' + ') })}</p>
          <p class="small muted">{t('pdf.blocks.help')}</p>
          {blocks.map((b, i) => <fieldset class="pdf-block" key={i}><legend>{t('pdf.block.title', { n: i + 1 })}</legend>
            <div class="field-row"><label class="field"><span>{t('pdf.block.from')}</span><input type="number" min="1" max={doc.pages.length} value={b.first} onInput={e => update(i, 'first', e.currentTarget.value)} /></label>
              <label class="field"><span>{t('pdf.block.to')}</span><input type="number" min="1" max={doc.pages.length} value={b.last} onInput={e => update(i, 'last', e.currentTarget.value)} /></label></div>
            <label class="field"><span>{t('pdf.block.rows')}</span><input type="text" value={b.rows} placeholder="2,4,4" onInput={e => update(i, 'rows', e.currentTarget.value)} /></label>
            <button type="button" class="text-button" onClick={() => setBlocks(prev => prev.filter((_, n) => n !== i))}>{t('pdf.block.remove', { n: i + 1 })}</button>
          </fieldset>)}
          <div class="pdf-block-actions"><button type="button" class="secondary" onClick={() => setBlocks(prev => [...prev, { first: '', last: '', rows: '' }])}>{t('pdf.block.add')}</button>
            <button type="button" class="text-button" onClick={() => setBlocks([{ first: '1', last: String(doc.pages.length), rows: '' }])}>{t('pdf.block.custom')}</button>
            <button type="button" class="text-button" onClick={() => apply(detected.layout)}>{t('pdf.block.restore')}</button></div>
          {unused.length > 0 && <section><h3>{t('pdf.unused.title')}</h3>
            <p class="small muted">{t('pdf.unused.help')}</p>
            <ul class="pdf-unused" aria-label={t('pdf.unused.title')}>{unused.map(page => <li key={page}>{t('pdf.unused.page', { page })}</li>)}</ul>
          </section>}
          <h3>{t('pdf.step.title')}</h3><p class="small muted">{t('pdf.step.help')}</p>
          <div class="field-row">{[t('pdf.step.horizontal'), t('pdf.step.vertical')].map((label, i) => <label class="field" key={label}><span>{label}</span><input type="text" inputMode="decimal" value={step[i]} onInput={e => { const value = e.currentTarget.value; setStep(prev => prev.map((v, n) => n === i ? value : v)); }} /></label>)}</div>
          <p class="small muted">{t('pdf.step.overlap', { width: (doc.pages[0].width - number(step[0])).toFixed(2), height: (doc.pages[0].height - number(step[1])).toFixed(2) })}</p>
          {edited.message && <p class="warning" role="alert">{edited.message}</p>}
        </div>{edited.layout ? <Preview doc={doc} layout={edited.layout} /> : <p class="muted">{t('pdf.preview.pending')}</p>}</div>
      </>}
    </>}
    {doc && edited.layout && sheet && <div hidden={stage !== 2}><Sizes doc={doc} layout={edited.layout} sheet={sheet} active={stage === 2} result={traced} onResult={setTraced} /></div>}
    {stage === 3 && traced && pieces && sheet && <Pieces result={traced} drafts={pieces.drafts} suggested={pieces.suggested} textLayer={sheet.texts.length > 0}
      rectangles={pieces.rectangles} onRectangles={rectangles => setPieces(prev => prev && { ...prev, rectangles })}
      onChange={(index, patch) => setPieces(prev => prev && { ...prev, drafts: prev.drafts.map((d, i) => i === index ? { ...d, ...patch } : d) })} />}
    {stage === 4 && meta && <Save meta={meta} onChange={setMeta} patterns={patterns} suggestedSeam={suggestedSeam} pattern={built?.pattern ?? null} error={built?.error ?? ''}
      problems={built?.problems ?? []} candidates={built?.candidates ?? new Map()} skipped={skips} onSkip={(skip, label) => setSkips(prev => [...prev, { skip, label }])} />}
    <div class="pdf-footer"><span class="small muted">{t('pdf.footer.step', { stage, label: stepLabels()[stage - 1] })}</span>
      <div class="pdf-navigation">{stage > 1 && <button type="button" class="secondary" onClick={() => { if (stage === 4) setSkips([]); setStage(stage - 1); }}>{t('pdf.back')}</button>}
        {stage < 4 ? <button type="button" class="primary" disabled={!ready[stage]} onClick={next}>{t('pdf.next')}</button> : <>
          <button type="button" class="secondary" disabled={!built?.pattern} onClick={() => built?.pattern && downloadPattern(built.pattern)}>{t('pdf.downloadJson')}</button>
          <button type="button" class="primary" disabled={!built?.pattern} onClick={() => built?.pattern && onSaved(built.pattern)}>{t('pdf.saveToLibrary')}</button></>}</div></div>
  </dialog>;
}
