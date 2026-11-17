import { fmt, t } from '../i18n';
import { chooseVariant, includedPieces, own, pieceCounts, variantChoice, variantLabel } from '../model/prepare';
import type { OrderLine, Settings } from '../model/prepare';
import type { PatternFile } from '../model/pattern';
import { NumberField, RotationSelect } from './fields';

export function OrderEditor({ line, patterns, settings, onChange, onRemove, onSettings, onEditSeam }: {
  line: OrderLine; patterns: PatternFile[]; settings: Settings;
  onChange: (line: OrderLine) => void; onRemove: () => void; onSettings: (settings: Settings) => void; onEditSeam: () => void;
}) {
  const pattern = patterns.find(p => p.id === line.patternId);
  const selected = new Set(pattern ? includedPieces(pattern, line).map(p => p.id) : []);
  const counts = pattern ? pieceCounts(pattern, line) : null;
  const shown = pattern ? pattern.pieces.filter(piece => !piece.variantGroup || selected.has(piece.id)) : [];
  const rotated = pattern ? pattern.pieces.filter(p => own(line.rotations, p.id)).length : 0;
  return <article class="order-line">
    <div class="order-heading"><label class="field grow"><span>{t('order.pattern')}</span><select value={line.patternId} onChange={e => {
      const p = patterns.find(p => p.id === e.currentTarget.value)!;
      onChange({ ...line, patternId: p.id, size: p.sizes[0], include: {}, rotations: {} });
    }}>
      {!pattern && <option value={line.patternId}>{t('order.patternMissing')}</option>}
      {patterns.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label><button type="button" class="text-button" aria-label={t('order.removeLabel', { name: pattern?.name ?? t('order.row') })} onClick={onRemove}>{t('order.remove')}</button></div>
    {pattern && <>
      <div class="field-row"><label class="field"><span>{t('order.size')}</span><select value={line.size} onChange={e => onChange({ ...line, size: e.currentTarget.value })}>
        {pattern.sizes.map(size => <option key={size} value={size}>{size}</option>)}
      </select></label><NumberField label={t('order.quantity')} suffix="×" hint={t('order.quantityHint')} value={line.quantity} min={1} max={100} step={1} onChange={quantity => onChange({ ...line, quantity })} /></div>
      {[...new Set(pattern.pieces.filter(p => p.variantGroup && p.sizes[line.size]).map(p => p.variantGroup!))].map(group => {
        const members = pattern.pieces.filter(p => p.variantGroup === group && p.sizes[line.size]);
        return <label class="field variant-field" key={group}><span>{group}</span>
          <select value={variantChoice(pattern, line, group) ?? ''}
            onChange={e => onChange({ ...line, include: chooseVariant(pattern, line, group, e.currentTarget.value) })}>
            {[...new Set(members.map(variantLabel))].map(label => <option key={label} value={label}>{label}</option>)}
            <option value="">{t('order.omit')}</option>
          </select></label>;
      })}
      <div class="seam-row"><label class="check"><input type="checkbox" checked={own(settings.addSeam, pattern.id) ?? pattern.seamAllowance === 'none'}
        onChange={e => onSettings({ ...settings, addSeam: { ...settings.addSeam, [pattern.id]: e.currentTarget.checked } })} />
        {Number.isFinite(settings.seamAmount) ? t('order.addSeamWithAmount', { amount: fmt.number(settings.seamAmount) }) : t('order.addSeam')}</label>
        <button type="button" class="text-button" onClick={onEditSeam}>{t('order.editSeam')}</button></div>
      {own(settings.addSeam, pattern.id) !== undefined && <button type="button" class="text-button" onClick={() => {
        const addSeam = { ...settings.addSeam }; delete addSeam[pattern.id]; onSettings({ ...settings, addSeam });
      }}>{t('order.resetSeam')}</button>}
      {(pattern.seamAllowance === 'unknown' || pattern.seamAllowance === 'mixed' || pattern.pieces.some(p => p.seamAllowance === 'unknown' || p.seamAllowance === 'mixed')) &&
        <p class="warning small">{t('order.seamUnclear')}</p>}
      <details class="piece-settings"><summary>{t('order.pieces', { selected: counts!.selected, total: counts!.total })}</summary>
        <p class="muted small">{t('order.piecesNote')}</p>
        {shown.map(piece => {
          const available = Boolean(piece.sizes[line.size]);
          const cuts = available ? piece.cut.map(c => t('piece.cut', { count: c.count, material: c.material })).join(', ') : t('order.cutMissing');
          return <div class={`piece-row ${!available ? 'unavailable' : ''}`} key={piece.id}>
            {piece.variantGroup
              ? <div class="check"><span>{piece.name}<small>{piece.variantGroup} · {cuts}</small></span></div>
              : <label class="check"><input type="checkbox" checked={selected.has(piece.id)} disabled={!available} onChange={e => {
                onChange({ ...line, include: { ...line.include, [piece.id]: e.currentTarget.checked } });
              }} /><span>{piece.name}<small>{piece.optional && <>{t('order.optionalPiece')} · </>}{cuts}</small></span></label>}
            {piece.note && <p class="muted small">{piece.note}</p>}
          </div>;
        })}
        {pattern.notes && <p class="muted small">{pattern.notes}</p>}
        <details class="piece-settings rotation-settings"><summary>{t('order.rotationPieces')}{rotated > 0 && <span>{t('order.rotatedCount', { count: rotated })}</span>}</summary>
          <p class="muted small">{t('order.rotationNote')}</p>
          {shown.filter(piece => piece.sizes[line.size]).map(piece => <RotationSelect key={piece.id} label={t('order.rotationLabel', { name: piece.name })} inherit value={own(line.rotations, piece.id) ?? ''} onChange={rotation => {
            const rotations = { ...line.rotations };
            if (rotation) rotations[piece.id] = rotation; else delete rotations[piece.id];
            onChange({ ...line, rotations });
          }} />)}
        </details>
      </details>
    </>}
  </article>;
}
