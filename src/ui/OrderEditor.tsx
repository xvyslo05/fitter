import { includedPieces, own, variantChoice, variantLabel } from '../model/prepare';
import type { OrderLine, Settings } from '../model/prepare';
import type { PatternFile } from '../model/pattern';
import { NumberField, RotationSelect } from './fields';

export function OrderEditor({ line, patterns, settings, onChange, onRemove, onSettings }: {
  line: OrderLine; patterns: PatternFile[]; settings: Settings;
  onChange: (line: OrderLine) => void; onRemove: () => void; onSettings: (settings: Settings) => void;
}) {
  const pattern = patterns.find(p => p.id === line.patternId);
  const selected = new Set(pattern ? includedPieces(pattern, line).map(p => p.id) : []);
  return <article class="order-line">
    <div class="order-heading"><label class="field grow"><span>Střih</span><select value={line.patternId} onChange={e => {
      const p = patterns.find(p => p.id === e.currentTarget.value)!;
      onChange({ ...line, patternId: p.id, size: p.sizes[0], include: {}, rotations: {} });
    }}>
      {!pattern && <option value={line.patternId}>Chybějící střih — importujte znovu</option>}
      {patterns.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label><button type="button" class="icon-button" aria-label={`Odebrat ${pattern?.name ?? 'řádek'}`} onClick={onRemove}>×</button></div>
    {pattern && <>
      <div class="field-row"><label class="field"><span>Velikost</span><select value={line.size} onChange={e => onChange({ ...line, size: e.currentTarget.value })}>
        {pattern.sizes.map(size => <option key={size} value={size}>{size}</option>)}
      </select></label><NumberField label="Množství" suffix="×" value={line.quantity} min={1} max={100} step={1} onChange={quantity => onChange({ ...line, quantity })} /></div>
      <label class="check"><input type="checkbox" checked={own(settings.addSeam, pattern.id) ?? pattern.seamAllowance === 'none'}
        onChange={e => onSettings({ ...settings, addSeam: { ...settings.addSeam, [pattern.id]: e.currentTarget.checked } })} />Přidat švovou záložku</label>
      {(pattern.seamAllowance === 'unknown' || pattern.seamAllowance === 'mixed' || pattern.pieces.some(p => p.seamAllowance === 'unknown' || p.seamAllowance === 'mixed')) &&
        <p class="warning small">Záložka není jednoznačná. Ověřte údaje střihu; automaticky se k nejasným dílům nepřidává.</p>}
      <details class="piece-settings"><summary>Díly a otáčení <span>{selected.size} vybráno</span></summary>
        <p class="muted small">Otáčení o 90° mění směr vlákna. Na lomu se díl pouze obrací podél lomu.</p>
        <p class="muted small">Výchozí záložka respektuje údaje každého dílu. Přepínač platí pro celý střih ve všech řádcích.</p>
        {own(settings.addSeam, pattern.id) !== undefined && <button type="button" class="text-button" onClick={() => {
          const addSeam = { ...settings.addSeam }; delete addSeam[pattern.id]; onSettings({ ...settings, addSeam });
        }}>Obnovit záložky podle střihu</button>}
        {[...new Set(pattern.pieces.filter(p => p.variantGroup && p.sizes[line.size]).map(p => p.variantGroup!))].map(group => {
          const members = pattern.pieces.filter(p => p.variantGroup === group && p.sizes[line.size]);
          return <label class="field" key={group}><span>Varianta · {group}</span>
            <select value={variantChoice(pattern, line, group) ?? ''} onChange={e => {
              const choice = e.currentTarget.value, include = { ...line.include };
              for (const p of members) include[p.id] = variantLabel(p) === choice;
              onChange({ ...line, include });
            }}>
              {[...new Set(members.map(variantLabel))].map(label => <option key={label} value={label}>{label}</option>)}
              <option value="">— vynechat —</option>
            </select></label>;
        })}
        {pattern.pieces.filter(piece => !piece.variantGroup || selected.has(piece.id)).map(piece => {
          const available = Boolean(piece.sizes[line.size]);
          const cuts = available ? piece.cut.map(c => `${c.count}× ${c.material}`).join(', ') : 'V této velikosti chybí';
          return <div class={`piece-row ${!available ? 'unavailable' : ''}`} key={piece.id}>
            {piece.variantGroup
              ? <div class="check"><span>{piece.name}<small>{piece.variantGroup} · {cuts}</small></span></div>
              : <label class="check"><input type="checkbox" checked={selected.has(piece.id)} disabled={!available} onChange={e => {
                onChange({ ...line, include: { ...line.include, [piece.id]: e.currentTarget.checked } });
              }} /><span>{piece.name}<small>{piece.optional && 'volitelné · '}{cuts}</small></span></label>}
            {piece.note && <p class="muted small">{piece.note}</p>}
            {available && <RotationSelect label={`Otáčení · ${piece.name}`} inherit value={own(line.rotations, piece.id) ?? ''} onChange={rotation => {
              const rotations = { ...line.rotations };
              if (rotation) rotations[piece.id] = rotation; else delete rotations[piece.id];
              onChange({ ...line, rotations });
            }} />}
          </div>;
        })}
        {pattern.notes && <p class="muted small">{pattern.notes}</p>}
      </details>
    </>}
  </article>;
}
