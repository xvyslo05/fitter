import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { detectLayout } from '../pdf/layout';
import { assemblePaths, assembleTexts, placePages, unusedPages } from '../pdf/place';
import { contentPages } from '../pdf/match';
import { styleLegend } from '../pdf/styles';
import { detectScale, overrideScale, CM_PER_PT } from '../pdf/scale';
import { suggestPieces } from '../pdf/pieces';
import type { PieceDraft } from '../pdf/pieces';
import { buildPattern, patternName, slug, sortSizes, suggestSeamAllowance, uniqueId } from '../pdf/build';
import { area, bbox } from '../geom/polygon';
import { demo } from '../model/demo';
import { parsePatternFile } from '../model/pattern';
import type { PatternFile } from '../model/pattern';
import type { LayoutBlock, PageLayout, PdfDoc, PdfPath, PdfText, SuggestRequest, TraceResult, TraceRequest, TraceResponse } from '../pdf/types';
import { inlineTokens, sizeColor, useTheme } from '../theme';
import { draftProblems, Pieces } from './PdfPieces';
import { downloadPattern, Save } from './PdfSave';
import type { SaveMeta } from './PdfSave';

interface BlockDraft { first: string; last: string; rows: string }
// The assembled sheet: all paths, texts, and paths without page furniture.
interface Sheet { paths: PdfPath[]; texts: PdfText[]; content: PdfPath[] }
const STEPS = ['Stránky', 'Velikosti', 'Díly', 'Uložit'];
const draft = (b: LayoutBlock): BlockDraft => ({ first: String(b.pages[0]), last: String(b.pages[1]), rows: b.rows.join(',') });
const number = (value: string) => Number(value.replace(',', '.'));

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
export function closePdfImport(dialog: Pick<HTMLDialogElement, 'close'> | null, focus: Pick<HTMLElement, 'focus'> | null) {
  dialog?.close();
  focus?.focus();
}

function Preview({ doc, layout, sizesMode = false, result }: { doc: PdfDoc; layout: PageLayout; sizesMode?: boolean; result?: TraceResult | null }) {
  const canvas = useRef<HTMLCanvasElement>(null), [zoom, setZoom] = useState(1), theme = useTheme();
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
  useEffect(() => {
    const node = canvas.current, ctx = node?.getContext('2d');
    if (!node || !ctx) return;
    // Canvas colours: the palette tokens on screen, read again when the theme changes.
    const style = getComputedStyle(node), token = (name: string) => style.getPropertyValue(name).trim();
    const scale = Math.min(1800 * zoom / sheet.width, 3600 / sheet.height, 4096 / sheet.width);
    node.width = Math.ceil(sheet.width * scale); node.height = Math.ceil(sheet.height * scale);
    ctx.fillStyle = token('--sheet'); ctx.fillRect(0, 0, node.width, node.height);
    ctx.scale(scale, scale); ctx.translate(-sheet.minX, -sheet.minY);
    ctx.lineWidth = 0.65 / scale;
    for (const path of sheet.paths) {
      const color = path.stroke ?? path.fill;
      if (!color) continue;
      ctx.strokeStyle = sizesMode ? token('--sheet-line') : inkColor(color, theme === 'dark');
      ctx.beginPath();
      tracePreviewPath(ctx, path);
      ctx.stroke();
    }
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
  }, [doc, sheet, zoom, sizesMode, result, theme]);
  return <div class="pdf-preview">
    <div class="pdf-preview-heading"><h3>Složený arch</h3><label>Zvětšení <input aria-label="Zvětšení náhledu" type="range" min="1" max="4" step="0.5" value={zoom} onInput={e => setZoom(Number(e.currentTarget.value))} /></label></div>
    {sizesMode ? <p class="pdf-size-colors">{result?.sizes.map((size, i) => <span key={size} style={{ color: sizeColor(i) }}>● {size}</span>)}</p>
      : <p class="small muted"><span class="pdf-seam verified" /> Shodný obsah <span class="pdf-seam" /> Neověřený spoj · {sheet.placements.length} stránek</p>}
    <div class="pdf-canvas-scroll"><canvas ref={canvas} style={{ width: `${zoom * 100}%` }} role="img" aria-label={sizesMode ? `Náhled obrysů: ${result?.candidates.length ?? 0} kandidátů` : `Složený arch: ${sheet.placements.length} stránek, ${sheet.seams.filter(s => s.matched).length} ověřených spojů`} /></div>
  </div>;
}

function Sizes({ doc, layout, sheet, active, result, onResult }: {
  doc: PdfDoc; layout: PageLayout; sheet: Sheet; active: boolean; result: TraceResult | null; onResult: (value: TraceResult | null) => void;
}) {
  const legend = useMemo(() => styleLegend(sheet.paths), [sheet]);
  const detected = useMemo(() => detectScale(doc), [doc]);
  const [assignments, setAssignments] = useState<Record<string, string>>({}), [suggesting, setSuggesting] = useState(false);
  const [squareCm, setSquareCm] = useState(''), [gap, setGap] = useState('1'), [resolution, setResolution] = useState('0.5'), [minArea, setMinArea] = useState('15');
  const [excludeScaleMarks, setExcludeScaleMarks] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  // Suggest "uni" for the style that encloses clearly the most area (coarse trace in the worker).
  // The user's own entries always win over a late suggestion.
  useEffect(() => {
    let worker: Worker | undefined, cancelled = false;
    setAssignments({}); setSuggesting(true);
    try {
      worker = new Worker(new URL('../pdf/trace.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<TraceResponse>) => {
        const data = event.data;
        if (!cancelled && 'suggestion' in data) setAssignments(prev => Object.values(prev).some(v => v.trim()) ? prev : data.suggestion);
        if (!cancelled) setSuggesting(false);
        worker?.terminate();
      };
      worker.onerror = () => { if (!cancelled) setSuggesting(false); worker?.terminate(); };
      // Page furniture (frames, marks repeated on every page) must not win the default "uni" guess.
      const request: SuggestRequest = { suggest: true, paths: sheet.content, texts: sheet.texts, scale: detected };
      worker.postMessage(request);
    } catch { setSuggesting(false); }
    return () => { cancelled = true; worker?.terminate(); };
  }, [sheet, detected]);
  const settings = useMemo(() => {
    try {
      const scale = squareCm.trim() ? overrideScale(detected, number(squareCm)) : detected;
      const options = { cmPerPt: scale.cmPerPt, gapMm: number(gap), resolutionMm: number(resolution), minAreaCm2: number(minArea) };
      if (!gap.trim() || !resolution.trim() || !minArea.trim() || !Object.values(options).every(Number.isFinite) || options.gapMm < 0 || options.gapMm > 6 ||
        options.resolutionMm < 0.25 || options.resolutionMm > 1 || options.minAreaCm2 < 0) throw new Error('Mezery: 0–6 mm; rastr: 0,25–1 mm; plocha: alespoň 0 cm².');
      return { options, message: '' };
    } catch (e) { return { options: null, message: e instanceof Error ? e.message : 'Zkontrolujte nastavení.' }; }
  }, [detected, squareCm, gap, resolution, minArea]);
  const selected = Object.values(assignments).some(s => s.trim());
  useEffect(() => {
    if (!active) return;
    onResult(null); setError(''); setBusy(false);
    if (!settings.options || !selected) return;
    let worker: Worker | undefined, cancelled = false;
    const options = settings.options;
    setBusy(true);
    const timer = window.setTimeout(() => {
      try {
        worker = new Worker(new URL('../pdf/trace.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<TraceResponse>) => {
          if (cancelled) return;
          if ('result' in event.data) onResult(event.data.result); else if ('error' in event.data) setError(event.data.error);
          setBusy(false); worker?.terminate();
        };
        worker.onerror = () => { setError('Obkreslení se nezdařilo. Zkuste hrubší rastr nebo menší arch.'); setBusy(false); worker?.terminate(); };
        const request: TraceRequest = { paths: sheet.paths, texts: sheet.texts, assignments, options, scale: detected, excludeScaleMarks };
        worker.postMessage(request);
      } catch (e) { setError(e instanceof Error ? e.message : 'Obkreslení se nezdařilo.'); setBusy(false); worker?.terminate(); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); worker?.terminate(); };
  }, [active, sheet, assignments, settings, selected, onResult, detected, excludeScaleMarks]);
  const cmPerPt = settings.options?.cmPerPt ?? detected.cmPerPt;
  return <div class="pdf-size-workspace"><div class="pdf-size-controls">
    <h3>Styly čar → velikosti</h3><p class="small muted">Zadejte např. 42, M nebo uni. Prázdné pole znamená, že styl není střihová čára. Více stylů může patřit jedné velikosti.</p>
    <div class="pdf-table-scroll"><table class="pdf-legend"><thead><tr><th>Styl</th><th>Cesty / délka</th><th>Velikost</th></tr></thead>
      <tbody>{legend.map((entry, i) => <tr key={entry.key}><td><svg viewBox="0 0 96 24" width="96" height="24" role="img" aria-label={`${entry.kind === 'fill' ? 'Výplň' : 'Čára'} ${entry.width.toFixed(2)} pt, ${entry.dash.length ? 'čárkovaná' : 'plná'}`}>
        {entry.kind === 'fill' ? <rect x="4" y="11" width="88" height="2" fill={`rgb(${entry.color.map(n => n * 255).join(',')})`} />
          : <line x1="4" y1="12" x2="92" y2="12" stroke={`rgb(${entry.color.map(n => n * 255).join(',')})`} stroke-width={Math.max(0.5, entry.width)} stroke-dasharray={entry.dash.join(' ')} />}
      </svg><span class="small muted">{entry.kind === 'fill' ? 'Výplň' : `${entry.width.toFixed(2)} pt`}</span></td>
        <td>{entry.paths}<span class="small muted">{(entry.lengthPt * cmPerPt).toFixed(1)} cm</span></td>
        <td><input aria-label={`Velikost pro styl ${i + 1}`} value={assignments[entry.key] ?? ''} placeholder="—" maxLength={40} onInput={e => { const value = e.currentTarget.value; setAssignments(prev => ({ ...prev, [entry.key]: value })); }} /></td></tr>)}</tbody></table></div>
    <h3>Měřítko</h3>
    <p class="small">{detected.source === 'square' ? `Kontrolní čtverec na stránce ${detected.page}: ${detected.measuredPt!.toFixed(2)} pt → ${detected.squareCm} cm (střed čáry).`
      : 'Kontrolní čtverec nenalezen. Používám 100 % (2,54 / 72 cm na pt).'}</p>
    <p class="small muted">Aktuálně {cmPerPt.toFixed(6)} cm/pt · {(cmPerPt / CM_PER_PT * 100).toFixed(2)} %</p>
    {detected.measuredPt && <label class="field"><span>Skutečná strana čtverce (cm)</span><input aria-label="Skutečná strana čtverce (cm)" type="text" inputMode="decimal" value={squareCm} placeholder={String(detected.squareCm)} onInput={e => setSquareCm(e.currentTarget.value)} /></label>}
    <h3>Obkreslení</h3><div class="pdf-trace-settings">
      <label class="field"><span>Zacelit mezery (mm)</span><input type="number" min="0" max="6" step="0.25" value={gap} onInput={e => setGap(e.currentTarget.value)} /></label>
      <label class="field"><span>Krok rastru (mm)</span><input type="number" min="0.25" max="1" step="0.25" value={resolution} onInput={e => setResolution(e.currentTarget.value)} /></label>
      <label class="field"><span>Min. plocha (cm²)</span><input type="number" min="0" step="1" value={minArea} onInput={e => setMinArea(e.currentTarget.value)} /></label>
    </div><label class="pdf-scale-marks"><input type="checkbox" checked={excludeScaleMarks} onChange={e => setExcludeScaleMarks(e.currentTarget.checked)} /> Vynechat kontrolní čtverce</label>
    <p class="small muted">Volba vynechá nalezený čtverec a jeho kopie. Vypněte ji, pokud chybí stejně velký čtvercový díl. Čárkované střihové čáry se obkreslují souvisle.</p>
    {settings.message && <p class="warning" role="alert">{settings.message}</p>}
    {error && <p class="warning" role="alert">{error}</p>}
    <p role="status" class="small">{busy ? 'Obkresluji velikosti…' : suggesting && !selected ? 'Hledám styl střihových čar…' : !selected ? 'Přiřaďte alespoň jeden styl velikosti.' : result ? `Nalezeno kandidátů: ${result.candidates.length}` : ''}</p>
  </div><div class="pdf-size-results"><Preview doc={doc} layout={layout} sizesMode result={result} />
    {result && <section><h3>Kandidáti dílů</h3>{!result.candidates.length ? <p class="muted">Žádný uzavřený díl. Zkontrolujte styly, mezery a rozložení stránek.</p> :
      <div class="pdf-table-scroll"><table class="pdf-candidates"><thead><tr><th>Díl</th><th>Velikost</th><th>Plocha (cm²)</th><th>Šířka × výška (cm)</th></tr></thead><tbody>
        {result.candidates.flatMap(c => Object.entries(c.sizes).map(([size, ring]) => {
          const b = bbox(ring), k = result.cmPerPt;
          return <tr key={`${c.id}:${size}`}><th>{c.id}</th><td style={{ color: sizeColor(result.sizes.indexOf(size)) }}>{size}</td><td>{(area(ring) * k * k).toFixed(1)}</td><td>{(b.width * k).toFixed(1)} × {(b.height * k).toFixed(1)}</td></tr>;
        }))}</tbody></table></div>}</section>}
  </div></div>;
}

export function PdfImport({ patterns, onSaved, onClose }: { patterns: PatternFile[]; onSaved: (pattern: PatternFile) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), request = useRef(0);
  const [doc, setDoc] = useState<PdfDoc | null>(null), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [stage, setStage] = useState(1), [traced, setTraced] = useState<TraceResult | null>(null);
  const [detected, setDetected] = useState<ReturnType<typeof detectLayout> | null>(null);
  const [blocks, setBlocks] = useState<BlockDraft[]>([]), [step, setStep] = useState(['', '']);
  // Piece drafts belong to one trace result (key); `suggested` backs "Podle čáry".
  const [pieces, setPieces] = useState<{ key: string; suggested: PieceDraft[]; drafts: PieceDraft[] } | null>(null);
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
    } catch (e) { return { layout: null, message: e instanceof Error ? e.message : 'Zkontrolujte bloky.' }; }
  }, [doc, blocks, step]);
  const unused = doc && edited.layout ? unusedPages(doc, edited.layout) : [];
  const sheet = useMemo<Sheet | null>(() => {
    if (!doc || !edited.layout) return null;
    const { placements } = placePages(doc, edited.layout);
    return { paths: assemblePaths(doc, placements), texts: assembleTexts(doc, placements), content: assemblePaths(contentPages(doc), placements) };
  }, [doc, edited.layout]);
  const suggestedSeam = useMemo(() => sheet ? suggestSeamAllowance(sheet.texts) : 'unknown', [sheet]);
  const piecesReady = !!pieces?.drafts.some(d => d.include) && pieces.drafts.every(d => !d.include || !draftProblems(d).length);
  const built = useMemo(() => {
    if (stage !== 4 || !traced || !pieces || !meta) return null;
    try {
      if (meta.id.trim() === demo.id) throw new Error('ID střihu je vyhrazené pro vestavěné demo.');
      const pattern = buildPattern(traced, pieces.drafts, { ...meta, id: meta.id.trim(), source: name });
      parsePatternFile(pattern);
      return { pattern, error: '' };
    } catch (e) { return { pattern: null, error: e instanceof Error ? e.message : 'Střih nelze sestavit.' }; }
  }, [stage, traced, pieces, meta, name]);
  // A repeated trace of the same sheet gives the same result: keep the user's edits then.
  function toPieces() {
    if (!traced || !sheet) return;
    const key = JSON.stringify(traced);
    if (pieces?.key !== key) {
      const suggested = suggestPieces(traced, { contentPaths: sheet.content, texts: sheet.texts });
      setPieces({ key, suggested, drafts: suggested }); setMeta(null);
    }
    setStage(3);
  }
  function toSave() {
    if (!meta && traced) {
      const title = patternName(doc?.title, name);
      setMeta({ name: title, id: uniqueId(slug(title) || 'strih-z-pdf', patterns.map(p => p.id)), author: '', seamAllowance: suggestedSeam, sizes: sortSizes(traced.sizes) });
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
    setBusy(true); setError(''); setDoc(null); setName(file.name); setDetected(null); setStage(1); setTraced(null); setPieces(null); setMeta(null);
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
      setError(name === 'PasswordException' ? 'PDF je chráněné heslem. Otevřete ho bez hesla a uložte znovu.'
        : name === 'InvalidPDFException' ? 'Soubor není platné PDF.'
        : `PDF se nepodařilo načíst (${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}).`);
    }
    finally { if (request.current === id) setBusy(false); }
  }
  function update(index: number, field: keyof BlockDraft, value: string) {
    setBlocks(prev => prev.map((block, i) => i === index ? { ...block, [field]: value } : block));
  }
  return <dialog ref={dialog} class="pdf-dialog" aria-labelledby="pdf-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <div class="pdf-header"><div><p class="eyebrow">Knihovna střihů</p><h2 id="pdf-title">Import PDF</h2></div>
      <button type="button" class="secondary" onClick={onClose}>Zavřít</button></div>
    <ol class="pdf-steps" aria-label="Kroky importu">{STEPS.map((label, i) => <li key={label} aria-current={stage === i + 1 ? 'step' : undefined}
      aria-disabled={i + 1 > stage && !ready[i] ? 'true' : undefined}>{i + 1} · {label}</li>)}</ol>
    <p class="small muted">PDF zůstává v tomto prohlížeči. Připravte arch, přiřaďte styly velikostem, zkontrolujte díly a uložte střih do knihovny.</p>
    {stage === 1 && <label class="field pdf-file"><span>Vybrat PDF</span><input type="file" accept=".pdf,application/pdf" onChange={e => { void open(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} /></label>}
    {busy && <p role="status">Načítám {name} a hledám návaznost stránek…</p>}
    {error && <p class="warning" role="alert">{error}</p>}
    {stage === 1 && doc && detected && <>
      <p class="pdf-summary"><strong>{name}</strong> · Počet stránek: {doc.pages.length}<br /><span class="small muted">Detekce: {detected.source}. Rozložení vždy zkontrolujte v náhledu.</span></p>
      {!doc.pages.some(p => p.paths.length) && <p class="warning">PDF neobsahuje vektorové cesty. Obrázkové skeny zatím nelze skládat podle obrysů.</p>}
      <div class="pdf-workspace"><div class="pdf-editor"><h3>Bloky stránek</h3>
        <p class="small muted">Každý blok má rozsah stránek a počty dlaždic v řádcích (např. 2,4,4). Řádky jsou zarovnané vlevo; bloky leží vedle sebe.</p>
        {blocks.map((b, i) => <fieldset class="pdf-block" key={i}><legend>Blok {i + 1}</legend>
          <div class="field-row"><label class="field"><span>Od stránky</span><input type="number" min="1" max={doc.pages.length} value={b.first} onInput={e => update(i, 'first', e.currentTarget.value)} /></label>
            <label class="field"><span>Do stránky</span><input type="number" min="1" max={doc.pages.length} value={b.last} onInput={e => update(i, 'last', e.currentTarget.value)} /></label></div>
          <label class="field"><span>Dlaždic v jednotlivých řádcích</span><input type="text" value={b.rows} placeholder="2,4,4" onInput={e => update(i, 'rows', e.currentTarget.value)} /></label>
          <button type="button" class="text-button" onClick={() => setBlocks(prev => prev.filter((_, n) => n !== i))}>Odebrat blok {i + 1}</button>
        </fieldset>)}
        <div class="pdf-block-actions"><button type="button" class="secondary" onClick={() => setBlocks(prev => [...prev, { first: '', last: '', rows: '' }])}>+ Přidat blok</button>
          <button type="button" class="text-button" onClick={() => setBlocks([{ first: '1', last: String(doc.pages.length), rows: '' }])}>Zadat vlastní bloky</button>
          <button type="button" class="text-button" onClick={() => apply(detected.layout)}>Obnovit detekci</button></div>
        {unused.length > 0 && <section><h3>Nepoužité stránky</h3>
          <p class="small muted">Tyto stránky nejsou v aktuálních blocích. Můžete je přidat úpravou rozsahů nebo přidáním bloku.</p>
          <ul class="pdf-unused" aria-label="Nepoužité stránky">{unused.map(page => <li key={page}>Stránka {page}</li>)}</ul>
        </section>}
        <h3>Krok dlaždic · překryv</h3><p class="small muted">Vzdálenost začátků sousedních stránek v bodech (pt). Menší krok znamená větší překryv. 1 mm = 2,835 pt.</p>
        <div class="field-row">{['Vodorovně (pt)', 'Svisle (pt)'].map((label, i) => <label class="field" key={label}><span>{label}</span><input type="text" inputMode="decimal" value={step[i]} onInput={e => { const value = e.currentTarget.value; setStep(prev => prev.map((v, n) => n === i ? value : v)); }} /></label>)}</div>
        <p class="small muted">Překryv první stránky: {(doc.pages[0].width - number(step[0])).toFixed(2)} × {(doc.pages[0].height - number(step[1])).toFixed(2)} pt.</p>
        {edited.message && <p class="warning" role="alert">{edited.message}</p>}
      </div>{edited.layout ? <Preview doc={doc} layout={edited.layout} /> : <p class="muted">Náhled se zobrazí po opravě bloků a kroku.</p>}</div>
    </>}
    {doc && edited.layout && sheet && <div hidden={stage !== 2}><Sizes doc={doc} layout={edited.layout} sheet={sheet} active={stage === 2} result={traced} onResult={setTraced} /></div>}
    {stage === 3 && traced && pieces && sheet && <Pieces result={traced} drafts={pieces.drafts} suggested={pieces.suggested} textLayer={sheet.texts.length > 0}
      onChange={(index, patch) => setPieces(prev => prev && { ...prev, drafts: prev.drafts.map((d, i) => i === index ? { ...d, ...patch } : d) })} />}
    {stage === 4 && meta && <Save meta={meta} onChange={setMeta} patterns={patterns} suggestedSeam={suggestedSeam} pattern={built?.pattern ?? null} error={built?.error ?? ''} />}
    <div class="pdf-footer"><span class="small muted">Krok {stage} ze 4 · {STEPS[stage - 1]}</span>
      <div class="pdf-navigation">{stage > 1 && <button type="button" class="secondary" onClick={() => setStage(stage - 1)}>Zpět</button>}
        {stage < 4 ? <button type="button" class="primary" disabled={!ready[stage]} onClick={next}>Další</button> : <>
          <button type="button" class="secondary" disabled={!built?.pattern} onClick={() => built?.pattern && downloadPattern(built.pattern)}>Stáhnout .json</button>
          <button type="button" class="primary" disabled={!built?.pattern} onClick={() => built?.pattern && onSaved(built.pattern)}>Uložit do knihovny</button></>}</div></div>
  </dialog>;
}
