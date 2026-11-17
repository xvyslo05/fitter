import { FABRIC_WIDTH_PRESETS_CM } from '../model/prepare';
import type { Fabric } from '../nest/types';
import { NumberField } from './fields';

const cm = (n: number) => n.toLocaleString('cs');

// One fabric card of step 2: "Teprve koupím" (length is calculated) or "Už mám kus" (fixed length).
export function FabricEditor({ material, fabric, onChange }: { material: string; fabric: Fabric; onChange: (fabric: Fabric) => void }) {
  return <div class="fabric"><div class="fabric-title"><h3>{material}</h3></div>
    <div class="segmented" role="group" aria-label={`Jak máte látku ${material}`}>
      <button type="button" aria-pressed={fabric.length === null} onClick={() => onChange({ ...fabric, length: null })}>Teprve koupím <span>spočítáme, kolik</span></button>
      <button type="button" aria-pressed={fabric.length !== null} onClick={() => onChange({ ...fabric, length: fabric.length ?? 100 })}>Už mám kus <span>zadám jeho délku</span></button>
    </div>
    <div class="field-row"><NumberField label="Šíře látky" srLabel={material} min={1} max={1000} value={fabric.width} onChange={width => onChange({ ...fabric, width })} />
      {fabric.length !== null && <NumberField label="Délka kusu" srLabel={material} min={1} max={10000} value={fabric.length} onChange={length => onChange({ ...fabric, length })} />}</div>
    <div class="presets" role="group" aria-label={`Časté šíře látky ${material}`}>
      {FABRIC_WIDTH_PRESETS_CM.map(width => <button type="button" key={width} class="preset" aria-pressed={fabric.width === width} aria-label={`Šíře ${width} cm`}
        onClick={() => onChange({ ...fabric, width })}>{width}</button>)}
    </div>
    <label class="check"><input type="checkbox" checked={fabric.folded} onChange={e => onChange({ ...fabric, folded: e.currentTarget.checked })} />Složená napůl, lícem dovnitř</label>
    {fabric.folded && <p class="small muted">Stříháte dvě vrstvy najednou. Na nákresu je polovina šíře ({cm(fabric.width / 2)} cm), přehyb je vlevo.</p>}
    <label class="check"><input type="checkbox" checked={fabric.directional === true} onChange={e => onChange({ ...fabric, directional: e.currentTarget.checked })} />Látka má vlas nebo směr vzoru</label>
    {fabric.directional && <p class="small muted">Například samet, manšestr nebo potisk, který má nahoře a dole. Všechny díly budou položené stejným směrem.</p>}
  </div>;
}
