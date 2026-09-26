import type { PatternFile, SeamAllowance } from '../model/pattern';

export interface SaveMeta { name: string; id: string; author: string; seamAllowance: SeamAllowance; sizes: string[] }
const SEAM: Record<SeamAllowance, string> = { included: 'díly obsahují švové záložky', none: 'bez švových záložek', unknown: 'nejasné', mixed: 'nejasné' };
const cm = (n: number) => n.toLocaleString('cs', { maximumFractionDigits: 1 });

export function downloadPattern(pattern: PatternFile) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(pattern, null, 1)], { type: 'application/json' })), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${pattern.id}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Save({ meta, onChange, patterns, suggestedSeam, pattern, error }: {
  meta: SaveMeta; onChange: (meta: SaveMeta) => void; patterns: PatternFile[]; suggestedSeam: SeamAllowance; pattern: PatternFile | null; error: string;
}) {
  const update = (patch: Partial<SaveMeta>) => onChange({ ...meta, ...patch });
  const move = (index: number, by: number) => {
    const sizes = [...meta.sizes];
    [sizes[index], sizes[index + by]] = [sizes[index + by], sizes[index]];
    update({ sizes });
  };
  const existing = patterns.find(p => p.id === meta.id.trim());
  return <div class="pdf-save">
    <div class="pdf-save-form">
      <label class="field"><span>Název střihu</span><input type="text" value={meta.name} maxLength={200} onInput={e => update({ name: e.currentTarget.value })} /></label>
      <label class="field"><span>ID v knihovně</span><input type="text" value={meta.id} maxLength={80} spellcheck={false} onInput={e => update({ id: e.currentTarget.value })} /></label>
      {existing && !error && <p class="warning small">V knihovně už je střih „{existing.name}“ se stejným ID. Uložení ho nahradí.</p>}
      <label class="field"><span>Autor (nepovinné)</span><input type="text" value={meta.author} maxLength={200} onInput={e => update({ author: e.currentTarget.value })} /></label>
      <label class="field"><span>Švová záložka</span><select value={meta.seamAllowance} onChange={e => update({ seamAllowance: e.currentTarget.value as SeamAllowance })}>
        <option value="included">Díly obsahují švové záložky</option><option value="none">Bez švových záložek</option><option value="unknown">Nejasné – ověřit podle střihu</option>
      </select></label>
      <p class="small muted">Návrh podle textu v PDF: {SEAM[suggestedSeam]}. Bez záložek aplikace při rozložení přidá nastavenou záložku; u nejasných ne.</p>
      <h3>Pořadí velikostí</h3>
      <ol class="pdf-size-order">{meta.sizes.map((size, i) => <li key={size}><span>{size}</span>
        <button type="button" class="icon-button" aria-label={`Posunout velikost ${size} dopředu`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
        <button type="button" class="icon-button" aria-label={`Posunout velikost ${size} dozadu`} disabled={i === meta.sizes.length - 1} onClick={() => move(i, 1)}>↓</button></li>)}</ol>
    </div>
    <section class="pdf-save-summary" aria-label="Souhrn střihu"><h3>Souhrn</h3>
      {error && <p class="warning" role="alert">{error}</p>}
      {pattern && <><p class="small muted">Dílů: {pattern.pieces.length} · velikostí: {pattern.sizes.length}. Rozměry jsou šířka × délka v cm, délka ve směru vlákna.</p>
        <div class="pdf-table-scroll"><table class="pdf-candidates pdf-summary-table"><thead><tr><th>Díl</th><th>Počty</th>{pattern.sizes.map(s => <th key={s}>{s}</th>)}</tr></thead>
          <tbody>{pattern.pieces.map(p => <tr key={p.id}><th>{p.name}<span class="small muted">{[p.optional && 'volitelný', p.variantGroup && `${p.variantGroup}${p.variant ? ` · ${p.variant}` : ''}`].filter(Boolean).join(' · ')}</span></th>
            <td>{p.cut.map(c => `${c.count}× ${c.material}`).join(', ')}</td>
            {pattern.sizes.map(s => <td key={s}>{p.sizes[s] ? `${cm(p.sizes[s].bbox[0])} × ${cm(p.sizes[s].bbox[1])}${p.sizes[s].fold ? ' · lom' : ''}` : '–'}</td>)}</tr>)}</tbody>
        </table></div></>}
    </section>
  </div>;
}
