import type { PatternFile, SeamAllowance } from '../model/pattern';
import type { PieceProblem, Skip } from '../pdf/build';

export interface SaveMeta { name: string; id: string; author: string; seamAllowance: SeamAllowance; sizes: string[] }
const SEAM: Record<SeamAllowance, string> = { included: 'díly obsahují přídavek na švy', none: 'bez přídavku na švy', unknown: 'nejasné', mixed: 'nejasné' };
const cm = (n: number) => n.toLocaleString('cs', { maximumFractionDigits: 1 });

export interface Skipped { skip: Skip; label: string }
const WHAT = { outline: 'obrys se nepodařilo obkreslit čistě.', fold: 'přehyb neleží na rovné hraně obrysu.', other: 'díl se nepodařilo sestavit.' };

export function downloadPattern(pattern: PatternFile) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(pattern, null, 1)], { type: 'application/json' })), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${pattern.id}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Save({ meta, onChange, patterns, suggestedSeam, pattern, error, problems, candidates, skipped, onSkip }: {
  meta: SaveMeta; onChange: (meta: SaveMeta) => void; patterns: PatternFile[]; suggestedSeam: SeamAllowance; pattern: PatternFile | null; error: string;
  problems: PieceProblem[]; candidates: Map<string, number | undefined>; skipped: Skipped[]; onSkip: (skip: Skip, label: string) => void;
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
      <label class="field"><span>Přídavek na švy</span><select value={meta.seamAllowance} onChange={e => update({ seamAllowance: e.currentTarget.value as SeamAllowance })}>
        <option value="included">Díly obsahují přídavek na švy</option><option value="none">Bez přídavku na švy</option><option value="unknown">Nejasné – ověřit podle střihu</option>
      </select></label>
      <p class="small muted">Návrh podle textu v PDF: {SEAM[suggestedSeam]}. Bez přídavku na švy aplikace při vytváření polohového plánu přidá nastavený přídavek; u nejasných ne.</p>
      <h3>Pořadí velikostí</h3>
      <ol class="pdf-size-order">{meta.sizes.map((size, i) => <li key={size}><span>{size}</span>
        <button type="button" class="icon-button" aria-label={`Posunout velikost ${size} dopředu`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
        <button type="button" class="icon-button" aria-label={`Posunout velikost ${size} dozadu`} disabled={i === meta.sizes.length - 1} onClick={() => move(i, 1)}>↓</button></li>)}</ol>
    </div>
    <section class="pdf-save-summary" aria-label="Souhrn střihu"><h3>Souhrn</h3>
      {error && <p class="warning" role="alert">{error}</p>}
      {problems.length > 0 && <div class="warning" role="alert"><p>Některé díly se nepodařilo sestavit. Vynechejte je, nebo se vraťte a upravte díly.</p>
        <ul class="pdf-problems">{problems.map(p => {
          const piece = `Díl „${p.pieceName}“${candidates.get(p.pieceId) === undefined ? '' : ` (nalezený díl ${candidates.get(p.pieceId)})`}`, label = `${piece}, velikost ${p.size}`;
          return <li key={`${p.pieceId}|${p.size}`}><span>{label}: {WHAT[p.problem]}</span>
            <span class="pdf-problem-actions">
              {p.problem === 'fold' && <button type="button" class="secondary" onClick={() => onSkip({ pieceId: p.pieceId, size: p.size, fold: true }, `${label}: bez přehybu`)}>Uložit bez přehybu</button>}
              <button type="button" class="secondary" onClick={() => onSkip({ pieceId: p.pieceId, size: p.size }, `${label}: vynechána`)}>Vynechat tuto velikost</button>
              <button type="button" class="secondary" onClick={() => onSkip({ pieceId: p.pieceId }, `${piece}: vynechán celý`)}>Vynechat celý díl</button></span>
            <details><summary>Technické podrobnosti</summary><p class="small">{p.message}</p></details></li>;
        })}</ul></div>}
      {skipped.length > 0 && <p class="small muted">Vynecháno při ukládání: {skipped.map(s => s.label).join(' · ')}. Tlačítkem Zpět se vynechání vrátí.</p>}
      {pattern && <><p class="small muted">Dílů: {pattern.pieces.length} · velikostí: {pattern.sizes.length}. Rozměry jsou šířka × délka v cm, délka ve směru vlákna.</p>
        <div class="pdf-table-scroll"><table class="pdf-candidates pdf-summary-table"><thead><tr><th>Díl</th><th>Počty</th>{pattern.sizes.map(s => <th key={s}>{s}</th>)}</tr></thead>
          <tbody>{pattern.pieces.map(p => <tr key={p.id}><th>{p.name}<span class="small muted">{[p.optional && 'volitelný', p.variantGroup && `${p.variantGroup}${p.variant ? ` · ${p.variant}` : ''}`].filter(Boolean).join(' · ')}</span></th>
            <td>{p.cut.map(c => `${c.count}× ${c.material}`).join(', ')}</td>
            {pattern.sizes.map(s => <td key={s}>{p.sizes[s] ? `${cm(p.sizes[s].bbox[0])} × ${cm(p.sizes[s].bbox[1])}${p.sizes[s].fold ? ' · přehyb' : ''}` : '–'}</td>)}</tr>)}</tbody>
        </table></div></>}
    </section>
  </div>;
}
