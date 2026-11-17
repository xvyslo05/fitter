import { describe, fmt, t } from '../i18n';
import type { PatternFile, SeamAllowance } from '../model/pattern';
import type { PieceProblem, Skip } from '../pdf/build';

export interface SaveMeta { name: string; id: string; author: string; seamAllowance: SeamAllowance; sizes: string[] }
const seamName = (seam: SeamAllowance) => t(seam === 'included' ? 'pdf.save.seamIncluded' : seam === 'none' ? 'pdf.save.seamNone' : 'pdf.save.seamUnclear');
const cm = fmt.length;
const WHAT = { outline: 'pdf.save.whatOutline', fold: 'pdf.save.whatFold', other: 'pdf.save.whatOther' } as const;

export interface Skipped { skip: Skip; label: string }

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
      <label class="field"><span>{t('pdf.save.name')}</span><input type="text" value={meta.name} maxLength={200} onInput={e => update({ name: e.currentTarget.value })} /></label>
      <label class="field"><span>{t('pdf.save.id')}</span><input type="text" value={meta.id} maxLength={80} spellcheck={false} onInput={e => update({ id: e.currentTarget.value })} /></label>
      {existing && !error && <p class="warning small">{t('pdf.save.exists', { name: existing.name })}</p>}
      <label class="field"><span>{t('pdf.save.author')}</span><input type="text" value={meta.author} maxLength={200} onInput={e => update({ author: e.currentTarget.value })} /></label>
      <label class="field"><span>{t('pdf.save.seam')}</span><select value={meta.seamAllowance} onChange={e => update({ seamAllowance: e.currentTarget.value as SeamAllowance })}>
        <option value="included">{t('pdf.save.optIncluded')}</option><option value="none">{t('pdf.save.optNone')}</option><option value="unknown">{t('pdf.save.optUnknown')}</option>
      </select></label>
      <p class="small muted">{t('pdf.save.seamHint', { suggestion: seamName(suggestedSeam) })}</p>
      <h3>{t('pdf.save.sizeOrder')}</h3>
      <ol class="pdf-size-order">{meta.sizes.map((size, i) => <li key={size}><span>{size}</span>
        <button type="button" class="icon-button" aria-label={t('pdf.save.moveUp', { size })} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
        <button type="button" class="icon-button" aria-label={t('pdf.save.moveDown', { size })} disabled={i === meta.sizes.length - 1} onClick={() => move(i, 1)}>↓</button></li>)}</ol>
    </div>
    <section class="pdf-save-summary" aria-label={t('pdf.save.summaryLabel')}><h3>{t('pdf.save.summary')}</h3>
      {error && <p class="warning" role="alert">{error}</p>}
      {problems.length > 0 && <div class="warning" role="alert"><p>{t('pdf.save.problems')}</p>
        <ul class="pdf-problems">{problems.map(p => {
          const found = candidates.get(p.pieceId), piece = found === undefined ? t('pdf.save.piece', { name: p.pieceName }) : t('pdf.save.pieceFound', { name: p.pieceName, found }), label = t('pdf.save.pieceSize', { piece, size: p.size });
          return <li key={`${p.pieceId}|${p.size}`}><span>{t('pdf.save.problemLine', { label, what: t(WHAT[p.problem]) })}</span>
            <span class="pdf-problem-actions">
              {p.problem === 'fold' && <button type="button" class="secondary" onClick={() => onSkip({ pieceId: p.pieceId, size: p.size, fold: true }, t('pdf.save.labelNoFold', { label }))}>{t('pdf.save.noFold')}</button>}
              <button type="button" class="secondary" onClick={() => onSkip({ pieceId: p.pieceId, size: p.size }, t('pdf.save.labelSkipped', { label }))}>{t('pdf.save.skipSize')}</button>
              <button type="button" class="secondary" onClick={() => onSkip({ pieceId: p.pieceId }, t('pdf.save.pieceSkipped', { piece }))}>{t('pdf.save.skipPiece')}</button></span>
            <details><summary>{t('pdf.save.technical')}</summary><p class="small">{describe(p.error)}</p></details></li>;
        })}</ul></div>}
      {skipped.length > 0 && <p class="small muted">{t('pdf.save.skipped', { list: skipped.map(s => s.label).join(' · ') })}</p>}
      {pattern && <><p class="small muted">{t('pdf.save.counts', { pieces: pattern.pieces.length, sizes: pattern.sizes.length })}</p>
        <div class="pdf-table-scroll"><table class="pdf-candidates pdf-summary-table"><thead><tr><th>{t('pdf.save.colPiece')}</th><th>{t('pdf.save.colCounts')}</th>{pattern.sizes.map(s => <th key={s}>{s}</th>)}</tr></thead>
          <tbody>{pattern.pieces.map(p => <tr key={p.id}><th>{p.name}<span class="small muted">{[p.optional && t('pdf.save.optional'), p.variantGroup && `${p.variantGroup}${p.variant ? ` · ${p.variant}` : ''}`].filter(Boolean).join(' · ')}</span></th>
            <td>{p.cut.map(c => t('piece.cut', { count: c.count, material: c.material })).join(', ')}</td>
            {pattern.sizes.map(s => <td key={s}>{p.sizes[s] ? `${cm(p.sizes[s].bbox[0])} × ${cm(p.sizes[s].bbox[1])}${p.sizes[s].fold ? ` · ${t('pdf.save.fold')}` : ''}` : '–'}</td>)}</tr>)}</tbody>
        </table></div></>}
    </section>
  </div>;
}
