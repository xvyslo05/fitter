import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { demo } from '../model/demo';
import { parsePatternFile } from '../model/pattern';
import type { PatternFile } from '../model/pattern';
import { checkInputs, defaultFabric, defaultSettings, makeOrder, own, prepare } from '../model/prepare';
import type { PreparedOrder } from '../model/prepare';
import type { Fabric, NestJob, NestResult, WorkerResponse } from '../nest/types';
import { deletePattern, loadLibrary, loadWorkspace, savePattern, saveWorkspace } from '../storage';
import type { Workspace } from '../storage';
import { NumberField, RotationSelect } from './fields';
import { EmptyLayout, Layout } from './Layout';
import { Library } from './Library';
import { OrderEditor } from './OrderEditor';
import { PdfImport } from './PdfImport';

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
  const worker = useRef<Worker | null>(null), resultsSection = useRef<HTMLElement>(null);
  const { order, fabrics, settings } = workspace;
  useEffect(() => {
    let cancelled = false;
    loadLibrary().then(({ patterns, errors }) => {
      if (!cancelled) { setPatterns([demo, ...patterns.filter(p => p.id !== demo.id)]); setMessages(errors); }
    }).catch(() => {
      if (!cancelled) setMessages(['Knihovnu nelze načíst z úložiště. Importované střihy budou k dispozici jen do zavření stránky.']);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; worker.current?.terminate(); };
  }, []);
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
    catch (e) { return { data: { materials: {}, notes: [], mirroredKeys: [] }, error: e instanceof Error ? e.message : 'Zkontrolujte zakázku.' }; }
  }, [patterns, order, fabrics, settings]);
  const materials = Object.keys(prepared.data.materials);
  const inputError = prepared.error ?? checkInputs(settings, fabrics, materials);
  const stale = snapshot && snapshot.signature !== signature;
  const updateFabric = (material: string, fabric: Fabric) => setWorkspace(prev => ({ ...prev, fabrics: { ...prev.fabrics, [material]: fabric } }));
  const updateSettings = (next: Workspace['settings']) => setWorkspace(prev => ({ ...prev, settings: next }));

  async function importFiles(files: File[]) {
    if (!files.length) return;
    setLoading(true);
    const messages: string[] = [];
    let count = 0;
    for (const file of files) {
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error('Soubor je větší než 25 MB.');
        const pattern = parsePatternFile(JSON.parse(await file.text()));
        if (pattern.id === demo.id) throw new Error('ID vestavěného demo střihu je vyhrazené.');
        try { await savePattern(pattern); }
        catch { messages.push(`${file.name}: ukládání není dostupné, střih zůstane jen do zavření stránky.`); }
        setPatterns(prev => [...prev.filter(p => p.id !== pattern.id), pattern]);
        count++;
      } catch (e) { messages.push(`${file.name}: ${e instanceof SyntaxError ? 'Neplatný soubor JSON.' : e instanceof Error ? e.message : 'Import se nezdařil.'}`); }
    }
    if (count) messages.unshift(`Importováno střihů: ${count}. Stejná ID nahrazují předchozí verzi.`);
    setMessages(messages); setLoading(false);
  }
  // The PDF wizard's result goes the way of a JSON import: stored, listed, reported.
  async function savePdfPattern(pattern: PatternFile) {
    if (pattern.id === demo.id) { setMessages(['ID vestavěného demo střihu je vyhrazené.']); return; }
    let message = `Střih „${pattern.name}“ je uložený v knihovně. Stejné ID nahrazuje předchozí verzi.`;
    try { await savePattern(pattern); }
    catch { message = `${pattern.name}: ukládání není dostupné, střih zůstane jen do zavření stránky.`; }
    setPatterns(prev => [...prev.filter(p => p.id !== pattern.id), pattern]);
    setMessages([message]); setPdfImport(false);
  }
  async function removePattern(pattern: PatternFile) {
    try {
      await deletePattern(pattern.id);
      setPatterns(prev => prev.filter(p => p.id !== pattern.id));
      setWorkspace(prev => ({ ...prev, order: prev.order.filter(line => line.patternId !== pattern.id) }));
      setMessages([`${pattern.name}: odstraněno z knihovny i zakázky. Původní soubor můžete znovu importovat.`]);
    } catch { setMessages(['Střih se nepodařilo odstranit z úložiště.']); }
  }
  function run() {
    if (inputError) { setMessages([inputError]); return; }
    if (!materials.length) { setMessages(['Přidejte do zakázky alespoň jeden vybraný díl.']); return; }
    if (order.some(line => !patterns.some(p => p.id === line.patternId))) {
      setMessages(['V zakázce chybí střih. Importujte jej znovu, nebo odeberte jeho řádek.']); return;
    }
    const jobs = materials.map(material => ({ material, pieces: prepared.data.materials[material], fabric: own(fabrics, material) ?? defaultFabric() }));
    worker.current?.terminate();
    setSnapshot({ signature, jobs, mirroredKeys: prepared.data.mirroredKeys, notes: prepared.data.notes });
    setResults(Object.create(null)); setMessages([]); setBusy(true); setStatus('Připravuji první rozložení…');
    try {
      const activeWorker = new Worker(new URL('../nest/worker.ts', import.meta.url), { type: 'module' });
      worker.current = activeWorker;
      activeWorker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (worker.current !== activeWorker) return;
        if (data.type === 'progress' || data.type === 'result') {
          setResults(prev => ({ ...prev, [data.material]: data.result }));
          setStatus(`Hledám úspornější rozložení · ${data.material}`);
        } else {
          setBusy(false); activeWorker.terminate(); worker.current = null;
          if (data.type === 'error') { setMessages([data.message]); setStatus('Výpočet se nezdařil.'); }
          else setStatus('Rozložení je připravené.');
        }
      };
      activeWorker.onerror = () => {
        if (worker.current !== activeWorker) return;
        setMessages(['Výpočet se přerušil. Zkuste menší zakázku nebo větší krok rastru.']);
        setStatus('Výpočet se nezdařil.'); setBusy(false); activeWorker.terminate(); worker.current = null;
      };
      activeWorker.postMessage({ jobs, options: settings });
      if (window.innerWidth < 900) resultsSection.current?.scrollIntoView({ behavior: 'smooth' });
    } catch { setBusy(false); setMessages(['Prohlížeč nemohl spustit výpočetní worker.']); setStatus('Výpočet se nezdařil.'); }
  }
  function stop() {
    worker.current?.terminate(); worker.current = null; setBusy(false);
    setStatus('Zastaveno. Nejlepší dosud nalezené rozložení zůstává zobrazené.');
  }

  return <>
    <header class="site-header"><a href="./" class="brand" aria-label="fitter · úvod"><span class="brand-mark" aria-hidden="true">f</span>fitter<span class="brand-dot">.</span></a>
      <span class="header-note">Malý pomocník pro velké plány</span><span class="local-badge"><span aria-hidden="true">●</span> Vše zůstává u vás</span></header>
    <main>
      <div class="intro"><div><p class="eyebrow">Od střihu k látce</p><h1>Střihy na svém místě.</h1><p>Rozložte díly, využijte látku a pusťte se do šití.</p></div><span class="intro-tag">Méně odstřižků.<br />Více možností.</span></div>
      {storageWarning && <div class="notice warning" role="status">Prohlížeč neumožňuje uložit zakázku a nastavení. Po zavření stránky se nezachovají.</div>}
      {messages.length > 0 && <div class="notice" role="status"><div>{messages.map((message, i) => <p key={i}>{message}</p>)}</div>
        <button type="button" class="icon-button" aria-label="Zavřít oznámení" onClick={() => setMessages([])}>×</button></div>}
      <div class="workspace">
        <form class="controls" onSubmit={e => { e.preventDefault(); run(); }}>
          <fieldset disabled={busy} class="controls-fieldset">
            <Library onImportPdf={() => setPdfImport(true)} patterns={patterns} loading={loading} onImport={importFiles} onAdd={pattern => setWorkspace(prev => ({ ...prev, order: [...prev.order, makeOrder(pattern)] }))}
              onDelete={pattern => void removePattern(pattern)} />
            <section class="panel"><div class="section-heading"><h2><span class="step">01</span>Zakázka</h2><span class="count">{order.length}</span></div>
              {!order.length && <p class="muted">Vyberte střih v knihovně tlačítkem „+ Přidat“.</p>}
              {order.map(line => <OrderEditor key={line.id} line={line} patterns={patterns} settings={settings} onSettings={updateSettings}
                onChange={next => setWorkspace(prev => ({ ...prev, order: prev.order.map(l => l.id === line.id ? next : l) }))}
                onRemove={() => setWorkspace(prev => ({ ...prev, order: prev.order.filter(l => l.id !== line.id) }))} />)}
              <button type="button" class="add-line" onClick={() => setWorkspace(prev => ({ ...prev, order: [...prev.order, makeOrder(patterns[0])] }))}>+ Přidat řádek zakázky</button>
            </section>
            <section class="panel"><div class="section-heading"><h2><span class="step">02</span>Látky</h2><span class="unit-hint">v centimetrech</span></div>
              {!materials.length && <p class="muted">Materiály se objeví podle vybraných dílů.</p>}
              {materials.map(material => {
                const fabric = own(fabrics, material) ?? defaultFabric();
                return <div class="fabric" key={material}><div class="fabric-title"><h3>{material}</h3><span class="muted small">{prepared.data.materials[material].length} umístění</span></div>
                  <div class="segmented" role="group" aria-label={`Režim látky ${material}`}>
                    <button type="button" aria-pressed={fabric.length === null} onClick={() => updateFabric(material, { ...fabric, length: null })}>Role <span>spočítat délku</span></button>
                    <button type="button" aria-pressed={fabric.length !== null} onClick={() => updateFabric(material, { ...fabric, length: fabric.length ?? 100 })}>Kus <span>pevná délka</span></button>
                  </div>
                  <div class="field-row"><NumberField label={`Šířka · ${material}`} min={1} max={1000} value={fabric.width} onChange={width => updateFabric(material, { ...fabric, width })} />
                    {fabric.length !== null && <NumberField label={`Délka · ${material}`} min={1} max={10000} value={fabric.length} onChange={length => updateFabric(material, { ...fabric, length })} />}</div>
                  <label class="check"><input type="checkbox" checked={fabric.folded} onChange={e => updateFabric(material, { ...fabric, folded: e.currentTarget.checked })} />Složená napůl</label>
                  {fabric.folded && <p class="small muted">Využitelná šířka {(fabric.width / 2).toLocaleString('cs')} cm, lom vlevo. Díl mimo lom se stříhá ve dvou vrstvách.</p>}
                </div>;
              })}
            </section>
            <section class="panel"><div class="section-heading"><h2><span class="step">03</span>Nastavení</h2></div>
              <div class="field-row"><NumberField label="Švová záložka" value={settings.seamAmount} max={10} onChange={seamAmount => updateSettings({ ...settings, seamAmount })} />
                <NumberField label="Mezera mezi díly" value={settings.gap} max={10} onChange={gap => updateSettings({ ...settings, gap })} /></div>
              <RotationSelect value={settings.rotation} label="Výchozí otáčení" onChange={rotation => rotation && updateSettings({ ...settings, rotation })} />
              <label class="check"><input type="checkbox" checked={settings.mirroredPairs} onChange={e => updateSettings({ ...settings, mirroredPairs: e.currentTarget.checked })} />Páry zrcadlově</label>
              <p class="small muted">Každý druhý stejný díl zrcadlově. Platí pro nesloženou látku.</p>
              <details class="advanced"><summary>Přesnost a délka hledání</summary><div class="field-row">
                <label class="field"><span>Krok rastru</span><select value={settings.resolution} onChange={e => updateSettings({ ...settings, resolution: Number(e.currentTarget.value) })}>
                  <option value={0.25}>0,25 cm · jemný</option><option value={0.5}>0,5 cm · běžný</option><option value={1}>1 cm · rychlý</option>
                </select></label><NumberField label="Čas na materiál" value={settings.timeMs / 1000} min={0.1} max={60} step={0.1} suffix="s" onChange={time => updateSettings({ ...settings, timeMs: time * 1000 })} /></div>
                <NumberField label="Náhodné semínko" suffix="" value={settings.seed} min={0} max={4294967295} step={1} onChange={seed => updateSettings({ ...settings, seed })} />
                <p class="small muted">Jemnější rastr hledá těsnější rozložení. Výsledek je přibližný; absolutní minimum nelze zaručit.</p>
              </details>
            </section>
          </fieldset>
          {inputError && <p class="warning" role="alert">{inputError}</p>}
          <div class="run-actions">{busy
            // Distinct keys + preventDefault: otherwise Preact reuses this element as the submit button
            // before the click's default action runs, and stopping immediately restarts the run.
            ? <button key="stop" type="button" class="stop-button" onClick={e => { e.preventDefault(); stop(); }}>■ Zastavit <span>{elapsed.toFixed(1)} s</span></button>
            : <button key="run" type="submit" class="primary" disabled={loading || !materials.length || Boolean(inputError)}>Spočítat rozložení <span aria-hidden="true">↗</span></button>}
            <p>{busy ? 'Průběžně zobrazujeme nejlepší nalezený výsledek.' : `Hledání až ${settings.timeMs / 1000} s na každý materiál.`}</p></div>
        </form>
        <section class="results" ref={resultsSection} aria-label="Výsledky rozložení">
          <div class="results-heading"><h2>Vaše rozložení</h2><span class="muted small">{snapshot ? `Počet materiálů: ${snapshot.jobs.length}` : 'Připraveno na první střih'}</span></div>
          {status && <div class={`run-status ${busy ? 'running' : ''}`} role="status"><span class="status-dot" />{status}{busy && <span class="elapsed">{elapsed.toFixed(1)} s</span>}</div>}
          {stale && <div class="notice warning">Zakázka nebo nastavení se změnily. Zobrazené výsledky patří k předchozímu výpočtu; spusťte nový.</div>}
          {(snapshot?.notes ?? prepared.data.notes).length > 0 && <details class="notes" open><summary>Poznámky ke stříhání</summary>
            <ul>{(snapshot?.notes ?? prepared.data.notes).map(note => <li key={note}>{note}</li>)}</ul></details>}
          {!snapshot ? <EmptyLayout /> : snapshot.jobs.map(job => Object.hasOwn(results, job.material)
            ? <Layout key={job.material} {...job} result={results[job.material]} mirroredKeys={snapshot.mirroredKeys} />
            : <div class="pending-material" key={job.material}><h3>{job.material}</h3><p>{busy ? 'Čeká na výpočet…' : 'Tento materiál zatím nebyl spočítán.'}</p></div>)}
          <p class="results-footnote">Obrys představuje výslednou řeznou linii. Před stříháním zkontrolujte směr vzoru, vlas látky a údaje ke střihu.</p>
        </section>
      </div>
    </main>
    {pdfImport && <PdfImport patterns={patterns} onSaved={pattern => void savePdfPattern(pattern)} onClose={() => setPdfImport(false)} />}
    <footer class="site-footer"><span class="brand-small">fitter.</span><span>Naplánováno s rozmyslem. Ušito s radostí.</span><span>Bez účtu. Bez odesílání dat.</span></footer>
  </>;
}
