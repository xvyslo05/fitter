import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { detectLayout } from '../pdf/layout';
import { assemblePaths, placePages, unusedPages } from '../pdf/place';
import type { LayoutBlock, PageLayout, PdfDoc, PdfPath } from '../pdf/types';

interface BlockDraft { first: string; last: string; rows: string }
const draft = (b: LayoutBlock): BlockDraft => ({ first: String(b.pages[0]), last: String(b.pages[1]), rows: b.rows.join(',') });
const number = (value: string) => Number(value.replace(',', '.'));

// Kept separate so the canvas outline and modal teardown can be checked without a DOM.
export function tracePreviewPath(ctx: Pick<CanvasRenderingContext2D, 'moveTo' | 'lineTo' | 'closePath'>, path: PdfPath) {
  path.subpaths.forEach((points, i) => {
    points.forEach(([x, y], j) => { if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    if (path.closed[i] || (!path.stroke && path.fill)) ctx.closePath();
  });
}
export function closePdfImport(dialog: Pick<HTMLDialogElement, 'close'> | null, focus: Pick<HTMLElement, 'focus'> | null) {
  dialog?.close();
  focus?.focus();
}

function Preview({ doc, layout }: { doc: PdfDoc; layout: PageLayout }) {
  const canvas = useRef<HTMLCanvasElement>(null), [zoom, setZoom] = useState(1);
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
    const scale = Math.min(1800 * zoom / sheet.width, 3600 / sheet.height, 4096 / sheet.width);
    node.width = Math.ceil(sheet.width * scale); node.height = Math.ceil(sheet.height * scale);
    ctx.fillStyle = '#fffefb'; ctx.fillRect(0, 0, node.width, node.height);
    ctx.scale(scale, scale); ctx.translate(-sheet.minX, -sheet.minY);
    ctx.lineWidth = 0.65 / scale;
    for (const path of sheet.paths) {
      const color = path.stroke ?? path.fill;
      if (!color) continue;
      ctx.strokeStyle = `rgb(${color.map(c => Math.round(c * 255)).join(',')})`;
      ctx.beginPath();
      tracePreviewPath(ctx, path);
      ctx.stroke();
    }
    ctx.font = `${12 / scale}px system-ui`; ctx.lineWidth = 0.8 / scale;
    for (const p of sheet.placements) {
      const page = doc.pages.find(page => page.index === p.page)!;
      ctx.strokeStyle = '#a6aea7'; ctx.setLineDash([4 / scale, 3 / scale]);
      ctx.strokeRect(p.x, p.y, page.width, page.height); ctx.setLineDash([]);
      ctx.fillStyle = '#264f42'; ctx.fillText(String(p.page), p.x + 5 / scale, p.y + 15 / scale);
    }
    ctx.lineWidth = 2 / scale;
    for (const seam of sheet.seams) {
      const a = sheet.placements.find(p => p.page === seam.a)!, b = sheet.placements.find(p => p.page === seam.b)!;
      const page = doc.pages.find(p => p.index === a.page)!;
      ctx.strokeStyle = seam.matched ? '#22864b' : '#9ca3a0'; ctx.beginPath();
      if (a.row === b.row) {
        const x = (a.x + page.width + b.x) / 2;
        ctx.moveTo(x, a.y); ctx.lineTo(x, a.y + page.height);
      } else {
        const y = (a.y + page.height + b.y) / 2;
        ctx.moveTo(a.x, y); ctx.lineTo(a.x + page.width, y);
      }
      ctx.stroke();
    }
  }, [doc, sheet, zoom]);
  return <div class="pdf-preview">
    <div class="pdf-preview-heading"><h3>Složený arch</h3><label>Zvětšení <input aria-label="Zvětšení náhledu" type="range" min="1" max="4" step="0.5" value={zoom} onInput={e => setZoom(Number(e.currentTarget.value))} /></label></div>
    <p class="small muted"><span class="pdf-seam verified" /> Shodný obsah <span class="pdf-seam" /> Neověřený spoj · {sheet.placements.length} stránek</p>
    <div class="pdf-canvas-scroll"><canvas ref={canvas} style={{ width: `${zoom * 100}%` }} role="img" aria-label={`Složený arch: ${sheet.placements.length} stránek, ${sheet.seams.filter(s => s.matched).length} ověřených spojů`} /></div>
  </div>;
}

export function PdfImport({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), request = useRef(0);
  const [doc, setDoc] = useState<PdfDoc | null>(null), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [detected, setDetected] = useState<ReturnType<typeof detectLayout> | null>(null);
  const [blocks, setBlocks] = useState<BlockDraft[]>([]), [step, setStep] = useState(['', '']);
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
  function apply(layout: PageLayout) {
    setBlocks(layout.blocks.map(draft)); setStep(layout.step.map(n => String(Math.round(n * 1000) / 1000)));
  }
  async function open(file?: File) {
    if (!file) return;
    const id = ++request.current;
    setBusy(true); setError(''); setDoc(null); setName(file.name); setDetected(null);
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
    <ol class="pdf-steps" aria-label="Kroky importu"><li aria-current="step">1 · Stránky</li><li aria-disabled="true">2 · Velikosti</li><li aria-disabled="true">3 · Díly</li><li aria-disabled="true">4 · Uložit</li></ol>
    <p class="small muted">PDF zůstává v tomto prohlížeči. V této fázi připravíte složený arch; výběr velikostí, obkreslení dílů a uložení přibudou později.</p>
    <label class="field pdf-file"><span>Vybrat PDF</span><input type="file" accept=".pdf,application/pdf" onChange={e => { void open(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} /></label>
    {busy && <p role="status">Načítám {name} a hledám návaznost stránek…</p>}
    {error && <p class="warning" role="alert">{error}</p>}
    {doc && detected && <>
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
    <div class="pdf-footer"><span class="small muted">Krok 1 ze 4 · Stránky</span><button type="button" class="primary" disabled title="Výběr velikostí bude dostupný v další fázi">Další</button></div>
  </dialog>;
}
