import { useRef, useState } from 'preact/hooks';
import type { PatternFile } from '../model/pattern';
import { demo } from '../model/demo';

export function Library({ patterns, loading, onImport, onAdd, onDelete }: {
  patterns: PatternFile[]; loading: boolean; onImport: (files: File[]) => Promise<void>;
  onAdd: (pattern: PatternFile) => void; onDelete: (pattern: PatternFile) => void;
}) {
  const input = useRef<HTMLInputElement>(null), [dragging, setDragging] = useState(false);
  return <section class="panel library"><div class="section-heading"><h2>Knihovna střihů</h2><span class="count">{patterns.length}</span></div>
    <div class={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)} onDrop={e => {
        e.preventDefault(); setDragging(false);
        if (e.dataTransfer && !loading) void onImport(Array.from(e.dataTransfer.files));
      }}>
      <span class="import-icon" aria-hidden="true">↥</span><div><strong>Vaše střihy mají místo tady</strong><p>Přetáhněte soubory .json nebo je vyberte.</p></div>
      <button type="button" class="secondary" disabled={loading} onClick={() => input.current?.click()}>{loading ? 'Načítání…' : 'Importovat střihy'}</button>
      <input ref={input} class="visually-hidden" type="file" accept=".json,application/json" multiple aria-label="Importovat soubory střihů" onChange={e => {
        const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; void onImport(files);
      }} />
    </div>
    <div class="library-list">{patterns.map(p => <div class="library-item" key={p.id}>
      <div class="grow"><strong>{p.name}</strong><p>{p.id === demo.id ? 'Syntetické demo' : p.author ?? 'Vlastní střih'} · {p.pieces.length} dílů · {p.sizes.join(', ')}</p></div>
      <button type="button" class="text-button" onClick={() => onAdd(p)} aria-label={`Přidat ${p.name} do zakázky`}>+ Přidat</button>
      {p.id !== demo.id && <button type="button" class="icon-button" aria-label={`Smazat ${p.name} z knihovny`} onClick={() => onDelete(p)}>×</button>}
    </div>)}</div>
    <p class="privacy"><span aria-hidden="true">◈</span> Střihy zůstávají v tomto prohlížeči. Nikam je neposíláme.</p>
  </section>;
}
