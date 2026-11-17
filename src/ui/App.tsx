import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { demo } from '../model/demo';
import { parsePatternFile } from '../model/pattern';
import type { PatternFile } from '../model/pattern';
import { fabricSummary, SHRINKAGE_NOTE } from '../model/summary';
import { checkInputs, checkSettings, defaultFabric, defaultSettings, linesUsing, makeOrder, own, prepare, shouldReplaceDemo } from '../model/prepare';
import type { PreparedOrder } from '../model/prepare';
import type { Fabric, NestJob, NestResult, WorkerResponse } from '../nest/types';
import { MAX_IMPORT_BYTES, backupFileName, deletePattern, exportBackup, isBackup, loadLibrary, loadWorkspace, parseBackup, savePattern, saveWorkspace } from '../storage';
import type { ParsedBackup, Workspace } from '../storage';
import { applyTheme, loadThemeChoice, saveThemeChoice } from '../theme';
import type { ThemeChoice } from '../theme';
import { FabricEditor } from './FabricEditor';
import { EmptyLayout, Layout } from './Layout';
import { Library } from './Library';
import { OrderEditor } from './OrderEditor';
import { PdfImport } from './PdfImport';
import { Refine } from './Refine';

const backupDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 'neznámého data' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
// "Kolik látky koupit": one sentence per material, in material order, above the drawings.
function BuyBox({ jobs, results, busy }: { jobs: NestJob[]; results: Record<string, NestResult>; busy: boolean }) {
  const rows = jobs.flatMap(job => {
    const result = Object.hasOwn(results, job.material) ? results[job.material] : null;
    const summary = result || busy ? fabricSummary(job.material, job.fabric, result, job.pieces.length) : null;
    return summary ? [{ material: job.material, ...summary }] : [];
  });
  if (!rows.length) return null;
  return <section class="buy-box" aria-label="Kolik látky koupit"><h3>Kolik látky koupit</h3>
    {rows.map(row => <p key={row.material}>{row.text}{row.exact && <small>{row.exact}</small>}</p>)}
    <p class="small muted">{SHRINKAGE_NOTE}</p>
    <button type="button" class="secondary screen-only" onClick={() => window.print()}>Vytisknout plán</button></section>;
}
const DEMO_ID_TAKEN = 'Tento soubor má stejné označení jako ukázkový střih, proto ho nejde nahrát.';
const MOBILE_QUERY = '(max-width:560px)';
interface RunSnapshot { signature: string; jobs: NestJob[]; mirroredKeys: string[]; notes: string[] }
export function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace() ?? {
    order: [makeOrder(demo)], fabrics: {}, settings: structuredClone(defaultSettings),
  });
  const [patterns, setPatterns] = useState<PatternFile[]>([demo]);
  const [loading, setLoading] = useState(true), [messages, setMessages] = useState<string[]>([]);
  const [storageWarning, setStorageWarning] = useState(false), [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, NestResult>>(() => Object.create(null));
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null), [status, setStatus] = useState('');
  const [elapsed, setElapsed] = useState(0), [pdfImport, setPdfImport] = useState(false);
  const [runError, setRunError] = useState('');
  const [themeChoice, setThemeChoice] = useState(loadThemeChoice), [restore, setRestore] = useState<ParsedBackup | null>(null);
  const worker = useRef<Worker | null>(null), resultsSection = useRef<HTMLElement>(null), refine = useRef<HTMLDetailsElement>(null);
  const { order, fabrics, settings } = workspace;
  // "Moje střihy" folds on a phone when the plan already has a row; the choice is made once, at load.
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [startCollapsed] = useState(() => window.matchMedia(MOBILE_QUERY).matches && order.length > 0);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY), change = () => setMobile(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadLibrary().then(({ patterns, errors }) => {
      if (!cancelled) { setPatterns([demo, ...patterns.filter(p => p.id !== demo.id)]); setMessages(errors); }
    }).catch(() => {
      if (!cancelled) setMessages(['Uložené střihy se nepodařilo načíst. Nově přidané střihy zůstanou jen do zavření stránky.']);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; worker.current?.terminate(); };
  }, []);
  // Prints are always light, whatever the screen theme.
  useEffect(() => {
    const light = () => applyTheme('light'), restore = () => applyTheme(themeChoice);
    window.addEventListener('beforeprint', light); window.addEventListener('afterprint', restore);
    return () => { window.removeEventListener('beforeprint', light); window.removeEventListener('afterprint', restore); };
  }, [themeChoice]);
  useEffect(() => { setStorageWarning(!saveWorkspace(workspace)); }, [workspace]);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now(); setElapsed(0);
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(timer);
  }, [busy]);
  const signature = useMemo(() => JSON.stringify({ workspace, patterns }), [workspace, patterns]);
  const prepared = useMemo<{ data: PreparedOrder; error?: string }>(() => {
    try { return { data: prepare(patterns, order, fabrics, settings) }; }
    catch (e) { return { data: { materials: {}, notes: [], mirroredKeys: [] }, error: e instanceof Error ? e.message : 'Zkontrolujte seznam Co šiju.' }; }
  }, [patterns, order, fabrics, settings]);
  const materials = Object.keys(prepared.data.materials);
  const inputError = prepared.error ?? checkInputs(settings, fabrics, materials);
  // The collapsed block opens by itself when one of its fields is invalid: a closed <details> cannot show or focus it.
  const refineError = checkSettings(settings);
  useEffect(() => { if (refineError && refine.current) refine.current.open = true; }, [refineError]);
  useEffect(() => setRunError(''), [signature]);
  const stale = snapshot && snapshot.signature !== signature;
  const updateFabric = (material: string, fabric: Fabric) => setWorkspace(prev => ({ ...prev, fabrics: { ...prev.fabrics, [material]: fabric } }));
  const updateSettings = (next: Workspace['settings']) => setWorkspace(prev => ({ ...prev, settings: next }));

  async function importFiles(files: File[]) {
    if (!files.length) return;
    setLoading(true);
    const messages: string[] = [];
    let count = 0, backup: ParsedBackup | null = null;
    for (const file of files) {
      try {
        if (file.size > MAX_IMPORT_BYTES) throw new Error('Soubor je větší než 25 MB.');
        const json: unknown = JSON.parse(await file.text());
        if (isBackup(json)) { backup = parseBackup(json); continue; }
        const pattern = parsePatternFile(json);
        if (pattern.id === demo.id) throw new Error(DEMO_ID_TAKEN);
        try { await savePattern(pattern); }
        catch { messages.push(`${file.name}: prohlížeč nedovolil střih uložit. Zůstane jen do zavření stránky.`); }
        setPatterns(prev => [...prev.filter(p => p.id !== pattern.id), pattern]);
        count++;
      } catch (e) { messages.push(`${file.name}: ${e instanceof SyntaxError ? 'tohle není soubor střihu ani záloha z fitteru.' : e instanceof Error ? e.message : 'Import se nezdařil.'}`); }
    }
    if (count) messages.unshift(`Přidáno střihů: ${count}. Střih, který už v seznamu byl, je nahrazený novou verzí.`);
    setMessages(messages); setRestore(backup); setLoading(false);
  }
  function backupAll() {
    const url = URL.createObjectURL(exportBackup(patterns, workspace)), anchor = document.createElement('a');
    anchor.href = url; anchor.download = backupFileName(); anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function applyRestore(backup: ParsedBackup, replace: boolean) {
    setRestore(null); setLoading(true);
    const messages: string[] = [];
    let storageFailed = false;
    if (replace) {
      for (const old of patterns) if (old.id !== demo.id) { try { await deletePattern(old.id); } catch { storageFailed = true; } }
    }
    for (const pattern of backup.patterns) { try { await savePattern(pattern); } catch { storageFailed = true; } }
    setPatterns(prev => [demo, ...(replace ? [] : prev.filter(p => p.id !== demo.id && !backup.patterns.some(b => b.id === p.id))), ...backup.patterns]);
    if (replace && backup.workspace) setWorkspace(backup.workspace);
    messages.push(`Záloha obnovena: ${backup.patterns.length} střihů${replace && backup.workspace ? ' a seznam Co šiju' : ''}.`, ...backup.errors);
    if (storageFailed) messages.push('Ukládání není dostupné, střihy zůstanou jen do zavření stránky.');
    setMessages(messages); setLoading(false);
  }
  // The PDF wizard's result goes the way of a JSON import: stored, listed, reported.
  async function savePdfPattern(pattern: PatternFile) {
    if (pattern.id === demo.id) { setMessages([DEMO_ID_TAKEN]); return; }
    // A new pattern takes the place of an untouched sample row; any other plan only gets the pattern in the library.
    const replaceDemo = shouldReplaceDemo(order, demo.id);
    let message = `Střih „${pattern.name}“ je uložený ${replaceDemo ? 'a nahradil ukázkový střih v seznamu Co šiju' : 'v Moje střihy. Do seznamu Co šiju ho přidáte tlačítkem „Do plánu“'}. Tip: zálohujte si střihy do souboru.`;
    try { await savePattern(pattern); }
    catch { message = `${pattern.name}: prohlížeč nedovolil střih uložit. Zůstane jen do zavření stránky.`; }
    setPatterns(prev => [...prev.filter(p => p.id !== pattern.id), pattern]);
    if (replaceDemo) setWorkspace(prev => shouldReplaceDemo(prev.order, demo.id) ? { ...prev, order: [makeOrder(pattern)] } : prev);
    setMessages([message]); setPdfImport(false);
  }
  async function removePattern(pattern: PatternFile) {
    try {
      await deletePattern(pattern.id);
      setPatterns(prev => prev.filter(p => p.id !== pattern.id));
      setWorkspace(prev => ({ ...prev, order: prev.order.filter(line => line.patternId !== pattern.id) }));
      setMessages([`Střih „${pattern.name}“ je smazaný.`]);
    } catch { setMessages(['Střih se nepodařilo smazat. Zkuste to znovu.']); }
  }
  function run() {
    if (inputError) return;
    if (!materials.length) { setRunError('V seznamu Co šiju není žádný díl. Přidejte střih, nebo zaškrtněte díly.'); return; }
    if (order.some(line => !patterns.some(p => p.id === line.patternId))) {
      setRunError('Jeden střih ze seznamu Co šiju už není uložený. Přidejte ho znovu, nebo jeho řádek odeberte.'); return;
    }
    const jobs = materials.map(material => ({ material, pieces: prepared.data.materials[material], fabric: own(fabrics, material) ?? defaultFabric() }));
    worker.current?.terminate();
    setSnapshot({ signature, jobs, mirroredKeys: prepared.data.mirroredKeys, notes: prepared.data.notes });
    setResults(Object.create(null)); setMessages([]); setRunError(''); setBusy(true); setStatus('Připravuji první polohový plán…');
    try {
      const activeWorker = new Worker(new URL('../nest/worker.ts', import.meta.url), { type: 'module' });
      worker.current = activeWorker;
      activeWorker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (worker.current !== activeWorker) return;
        if (data.type === 'progress' || data.type === 'result') {
          setResults(prev => ({ ...prev, [data.material]: data.result }));
          setStatus(`Hledám úspornější polohový plán · ${data.material}`);
        } else {
          setBusy(false); activeWorker.terminate(); worker.current = null;
          if (data.type === 'error') { setRunError(data.message); setStatus('Výpočet se nezdařil.'); }
          else setStatus('Polohový plán je připravený.');
        }
      };
      activeWorker.onerror = () => {
        if (worker.current !== activeWorker) return;
        setRunError('Výpočet se přerušil. Zkuste méně střihů najednou, nebo v Upřesnit zvolte přesnost „Hrubá“.');
        setStatus('Výpočet se nezdařil.'); setBusy(false); activeWorker.terminate(); worker.current = null;
      };
      activeWorker.postMessage({ jobs, options: settings });
      if (window.innerWidth < 900) resultsSection.current?.scrollIntoView({ behavior: 'smooth' });
    } catch { setBusy(false); setRunError('Výpočet se nepodařilo spustit. Načtěte stránku znovu, případně zkuste jiný prohlížeč.'); setStatus('Výpočet se nezdařil.'); }
  }
  // Both move the view to where the choice is made (the library list, the seam allowance field).
  function showLibrary() {
    const library = document.getElementById('moje-strihy');
    const folded = library?.querySelector<HTMLDetailsElement>('details.my-patterns');
    if (folded) folded.open = true;
    library?.scrollIntoView({ behavior: 'smooth', block: 'start' }); library?.focus({ preventScroll: true });
  }
  function editSeam() {
    if (refine.current) refine.current.open = true;
    const field = document.getElementById('seam-amount');
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' }); field?.focus({ preventScroll: true });
  }
  function chooseTheme(choice: ThemeChoice) {
    setThemeChoice(choice); applyTheme(choice); saveThemeChoice(choice);
  }
  function stop() {
    worker.current?.terminate(); worker.current = null; setBusy(false);
    setStatus('Zastaveno. Nejlepší dosud nalezený polohový plán zůstává zobrazený.');
  }

  return <>
    <header class="site-header"><a href="./" class="brand" aria-label="fitter · úvod"><span class="brand-mark" aria-hidden="true">f</span>fitter<span class="brand-dot">.</span></a>
      <span class="local-badge"><span aria-hidden="true">●</span> Vše zůstává u vás</span></header>
    <main>
      {snapshot && <div class="print-only print-header"><h1>fitter · polohový plán</h1>
        <p>{[...new Set(order.map(line => `${patterns.find(p => p.id === line.patternId)?.name ?? line.patternId} (${line.size}, ${line.quantity}×)`))].join('; ')}</p>
        <p>{new Date().toLocaleDateString('cs')}</p></div>}
      <div class="intro"><div><h1>Střihy na svém místě.</h1><p>Rozmístěte díly střihu na látku a zjistěte, kolik jí koupit.</p></div></div>
      {storageWarning && <div class="notice warning" role="status">Prohlížeč neumožňuje uložit seznam Co šiju a nastavení. Po zavření stránky se nezachovají.</div>}
      {restore && <div class="notice" role="status"><div><p>Záloha obsahuje {restore.patterns.length} střihů z {backupDate(restore.created)}. Obnovit?</p>
        {restore.errors.map((message, i) => <p key={i}>{message}</p>)}
        <div class="field-row"><button type="button" class="secondary" onClick={() => void applyRestore(restore, false)}>Přidat k mým střihům</button>
          <button type="button" class="secondary" onClick={() => void applyRestore(restore, true)}>Nahradit vše</button></div></div>
        <button type="button" class="icon-button" aria-label="Zrušit obnovení" onClick={() => setRestore(null)}>×</button></div>}
      <div class="workspace">
        <form class="controls" onSubmit={e => { e.preventDefault(); run(); }}>
          <fieldset disabled={busy} class="controls-fieldset">
            <section class="panel"><div class="section-heading"><h2><span class="step">1</span>Co šiju</h2><span class="count">{order.length}</span></div>
              {!order.length && <p class="muted">Vyberte střih níže tlačítkem „Do plánu“, nebo přidejte vlastní z PDF.</p>}
              {order.map(line => <OrderEditor key={line.id} line={line} patterns={patterns} settings={settings} onSettings={updateSettings} onEditSeam={editSeam}
                onChange={next => setWorkspace(prev => ({ ...prev, order: prev.order.map(l => l.id === line.id ? next : l) }))}
                onRemove={() => setWorkspace(prev => ({ ...prev, order: prev.order.filter(l => l.id !== line.id) }))} />)}
              <button type="button" class="add-line" onClick={showLibrary}>+ Přidat další střih</button>
              <Library messages={messages} onDismissMessages={() => setMessages([])} collapsible={mobile} startCollapsed={startCollapsed} linesUsing={id => linesUsing(order, id)} onImportPdf={() => setPdfImport(true)} patterns={patterns} loading={loading} onImport={importFiles} onBackup={backupAll} onAdd={pattern => setWorkspace(prev => ({ ...prev, order: [...prev.order, makeOrder(pattern)] }))}
                onDelete={pattern => void removePattern(pattern)} />
            </section>
            <section class="panel"><div class="section-heading"><h2><span class="step">2</span>Látka</h2></div>
              {!materials.length && <p class="muted">Materiály se objeví podle vybraných dílů.</p>}
              <div class="fabric-list">{materials.map(material => <FabricEditor key={material} material={material} fabric={own(fabrics, material) ?? defaultFabric()} onChange={fabric => updateFabric(material, fabric)} />)}</div>
            </section>
            <section class="panel"><div class="section-heading"><h2><span class="step">3</span>Polohový plán</h2></div>
              <Refine settings={settings} onSettings={updateSettings} detailsRef={refine} />
            </section>
          </fieldset>
          <div class="run-actions">
            {(inputError ?? runError) && <p class="warning run-error" role="alert">{inputError ?? runError}</p>}
            {busy
            // Distinct keys + preventDefault: otherwise Preact reuses this element as the submit button
            // before the click's default action runs, and stopping immediately restarts the run.
            ? <button key="stop" type="button" class="stop-button" onClick={e => { e.preventDefault(); stop(); }}>■ Zastavit · <span>{elapsed.toFixed(1).replace('.', ',')} s</span></button>
            : <button key="run" type="submit" class="primary" disabled={loading || !materials.length || Boolean(inputError)}>Vytvořit polohový plán <span aria-hidden="true">↗</span></button>}</div>
        </form>
        <section class="results" ref={resultsSection} aria-label="Výsledky: polohový plán">
          <div class="results-heading"><h2>Váš polohový plán</h2>{!snapshot && <span class="muted small">Připraveno na první střih</span>}</div>
          <p class="muted small">Polohový plán – rozmístění dílů střihu na látce.</p>
          {status && <div class={`run-status ${busy ? 'running' : ''}`} role="status"><span class="status-dot" />{status}{busy && <span class="elapsed">{elapsed.toFixed(1)} s</span>}</div>}
          {stale && <div class="notice warning" role="status"><p>Zadání se změnilo. Tento plán už neplatí, vytvořte nový.</p>
            <button type="button" class="secondary" disabled={busy || loading || !materials.length || Boolean(inputError)} onClick={run}>Vytvořit znovu</button></div>}
          {(snapshot?.notes ?? prepared.data.notes).length > 0 && <details class="notes" open><summary>Poznámky ke stříhání</summary>
            <ul>{(snapshot?.notes ?? prepared.data.notes).map(note => <li key={note}>{note}</li>)}</ul></details>}
          {snapshot && <BuyBox jobs={snapshot.jobs} results={results} busy={busy} />}
          {!snapshot ? <EmptyLayout /> : snapshot.jobs.map(job => Object.hasOwn(results, job.material)
            ? <Layout key={job.material} {...job} result={results[job.material]} mirroredKeys={snapshot.mirroredKeys} />
            : <div class="pending-material" key={job.material}><h3>{job.material}</h3><p>{busy ? 'Čeká na výpočet…' : 'Tato látka se zatím nespočítala.'}</p></div>)}
          <p class="results-footnote">Obrys představuje výslednou řeznou linii. Před stříháním zkontrolujte směr vzoru, vlas látky a údaje ke střihu.</p>
        </section>
      </div>
    </main>
    {pdfImport && <PdfImport patterns={patterns} onSaved={pattern => void savePdfPattern(pattern)} onClose={() => setPdfImport(false)} />}
    <footer class="site-footer"><span class="brand-small">fitter.</span><span>Střihy zůstávají v tomto prohlížeči. Nikam je neposíláme.</span>
      <label class="theme-picker"><span>Vzhled</span><select value={themeChoice} onChange={e => chooseTheme(e.currentTarget.value as ThemeChoice)}>
        <option value="auto">Automaticky</option><option value="light">Světlý</option><option value="dark">Tmavý</option>
      </select></label></footer>
  </>;
}
