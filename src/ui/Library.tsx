import { useEffect, useRef, useState } from 'preact/hooks';
import type { PatternFile } from '../model/pattern';
import { demo } from '../model/demo';
import { deleteQuestion } from '../model/prepare';

// A library row. Deleting is two steps: "⋯" opens the menu, "Smazat střih…" asks inline, "Ponechat" has the focus.
function LibraryItem({ pattern, lines, onAdd, onDelete }: { pattern: PatternFile; lines: number; onAdd: () => void; onDelete: () => void }) {
  const [mode, setMode] = useState<'idle' | 'menu' | 'confirm'>('idle');
  const more = useRef<HTMLButtonElement>(null), keep = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (mode === 'confirm') keep.current?.focus(); }, [mode]);
  const close = () => { setMode('idle'); more.current?.focus(); };
  return <div class="library-item" onKeyDown={e => { if (e.key === 'Escape' && mode !== 'idle') { e.stopPropagation(); close(); } }}>
    <div class="library-row">
      <div class="grow"><strong>{pattern.name}</strong><p>{pattern.id === demo.id ? 'Syntetické demo' : pattern.author ?? 'Vlastní střih'} · {pattern.pieces.length} dílů · {pattern.sizes.join(', ')}</p></div>
      <button type="button" class="text-button" onClick={onAdd} aria-label={`Přidat ${pattern.name} do seznamu Co šiju`}>Do plánu</button>
      {pattern.id !== demo.id && <button type="button" ref={more} class="icon-button" aria-label={`Další akce: ${pattern.name}`} aria-expanded={mode === 'menu'}
        onClick={() => setMode(m => m === 'idle' ? 'menu' : 'idle')}>⋯</button>}
    </div>
    {mode === 'menu' && <div class="library-menu"><button type="button" class="text-button danger-text" onClick={() => setMode('confirm')}>Smazat střih…</button></div>}
    {mode === 'confirm' && <div class="delete-confirm" role="group" aria-label="Smazat střih"><p>{deleteQuestion(pattern.name, lines)}</p>
      <div class="field-row"><button type="button" class="secondary danger-button" onClick={onDelete}>Smazat střih</button>
        <button type="button" class="secondary" ref={keep} onClick={close}>Ponechat</button></div></div>}
  </div>;
}

export function Library({ messages, onDismissMessages, collapsible, startCollapsed, patterns, linesUsing, loading, onImport, onImportPdf, onBackup, onAdd, onDelete }: {
  messages: string[]; onDismissMessages: () => void; collapsible: boolean; startCollapsed: boolean;
  patterns: PatternFile[]; linesUsing: (patternId: string) => number; loading: boolean; onImportPdf: () => void; onBackup: () => void;
  onImport: (files: File[]) => Promise<void>; onAdd: (pattern: PatternFile) => void; onDelete: (pattern: PatternFile) => void;
}) {
  const input = useRef<HTMLInputElement>(null), [dragging, setDragging] = useState(false);
  const content = <>
    <button type="button" class="primary pdf-import-button" onClick={onImportPdf}>Přidat střih z PDF</button>
    {dragging && <p class="drop-hint" role="status">Pusťte soubor střihu nebo zálohy (.json) sem.</p>}
    <div class="library-list">{patterns.map(p => <LibraryItem key={p.id} pattern={p} lines={linesUsing(p.id)} onAdd={() => onAdd(p)} onDelete={() => onDelete(p)} />)}</div>
    <details class="advanced"><summary>Záloha a soubory</summary>
      <p class="small">Střihy jsou uložené jen v tomto prohlížeči. Zálohu si uložte do souboru, ať o ně nepřijdete. Soubor můžete také přetáhnout na seznam střihů.</p>
      <div class="field-row"><button type="button" class="text-button" onClick={onBackup}>Zálohovat vše do souboru</button>
        <button type="button" class="text-button" disabled={loading} onClick={() => input.current?.click()}>{loading ? 'Načítání…' : 'Nahrát soubor střihu nebo zálohy (.json)'}</button></div>
      <input ref={input} class="visually-hidden" type="file" accept=".json,application/json" multiple aria-label="Nahrát soubory střihů nebo zálohy" onChange={e => {
        const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; void onImport(files);
      }} />
    </details>
  </>;
  // Files can be dropped anywhere on the list, so the backup block can stay closed. Messages about patterns show here, beside the action.
  // On a phone the panel can fold (summary instead of heading); the messages stay outside the fold.
  return <div id="moje-strihy" tabIndex={-1} class={`library ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }}
    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }} onDrop={e => {
      e.preventDefault(); setDragging(false);
      if (e.dataTransfer && !loading) void onImport(Array.from(e.dataTransfer.files));
    }}>
    {messages.length > 0 && <div class="notice" role="status"><div>{messages.map((message, i) => <p key={i}>{message}</p>)}</div>
      <button type="button" class="icon-button" aria-label="Zavřít oznámení" onClick={onDismissMessages}>×</button></div>}
    {collapsible
      ? <details class="my-patterns" open={!startCollapsed}><summary><h3>Moje střihy</h3><span class="count">{patterns.length}</span></summary>{content}</details>
      : <><div class="section-heading"><h3>Moje střihy</h3><span class="count">{patterns.length}</span></div>{content}</>}
  </div>;
}
