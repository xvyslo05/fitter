import type { Ref } from 'preact';
import { DEFAULT_GAP_CM, changedSettings, resetSettings } from '../model/prepare';
import type { Settings } from '../model/prepare';
import { NumberField, RotationSelect } from './fields';

// Settings that rarely change. The header always says what differs from the defaults, so a closed block hides nothing.
export function Refine({ settings, onSettings, detailsRef }: { settings: Settings; onSettings: (settings: Settings) => void; detailsRef: Ref<HTMLDetailsElement> }) {
  const changed = changedSettings(settings);
  return <div class="refine">
    <details id="refine" ref={detailsRef} class="advanced"><summary>Upřesnit · {changed.length ? `změněno: ${changed.join(', ')}` : 'výchozí nastavení'}</summary>
      <h4>Přídavky a mezery</h4>
      <div class="field-row"><NumberField id="seam-amount" label="Přídavek na švy" value={settings.seamAmount} max={10} onChange={seamAmount => onSettings({ ...settings, seamAmount })} />
        <NumberField label="Mezera mezi díly" value={settings.gap} max={10} onChange={gap => onSettings({ ...settings, gap })} /></div>
      <p class="small muted">Přídavek na švy se přidá jen u střihů, kde je to zaškrtnuté. Platí pro všechny střihy.</p>
      <p class="small muted">Mezera mezi díly: místo na stříhání mezi sousedními díly. Pro stříhání nůžkami nechte 0,5 cm; při 0 se díly mohou dotýkat. Přídavek na švy je už započítaný zvlášť.{' '}
        {settings.gap !== DEFAULT_GAP_CM && <button type="button" class="text-button" onClick={() => onSettings({ ...settings, gap: DEFAULT_GAP_CM })}>Výchozí</button>}</p>
      <h4>Otáčení dílů</h4>
      <RotationSelect value={settings.rotation} label="Jak smí být díly otočené" onChange={rotation => rotation && onSettings({ ...settings, rotation })} />
      <label class="check"><input type="checkbox" checked={settings.mirroredPairs} onChange={e => onSettings({ ...settings, mirroredPairs: e.currentTarget.checked })} />Pravý a levý díl stříhat zrcadlově</label>
      <p class="small muted">Z dílu, který se stříhá dvakrát, bude jeden zrcadlově. Platí pro nesloženou látku.</p>
      <h4>Hledání</h4>
      <div class="field-row">
        <label class="field"><span>Přesnost</span><select value={settings.resolution} onChange={e => onSettings({ ...settings, resolution: Number(e.currentTarget.value) })}>
          <option value={0.25}>Jemná (pomalejší)</option><option value={0.5}>Běžná</option><option value={1}>Hrubá (rychlejší)</option>
        </select></label>
        <NumberField label="Jak dlouho hledat" value={settings.timeMs / 1000} min={0.1} max={60} step={0.1} suffix="s na každou látku" onChange={time => onSettings({ ...settings, timeMs: time * 1000 })} /></div>
      <NumberField label="Číslo pokusu" suffix="" hint="Jiné číslo zkusí jiné rozmístění. Stejné číslo dá stejný výsledek." value={settings.seed} min={0} max={4294967295} step={1} onChange={seed => onSettings({ ...settings, seed })} />
      <p class="small muted">Jemnější přesnost a delší hledání mohou ušetřit pár centimetrů. Výsledek je dobrý odhad, ne zaručené minimum.</p>
    </details>
    {changed.length > 0 && <button type="button" class="text-button" onClick={() => onSettings(resetSettings(settings))}>Vrátit výchozí</button>}
  </div>;
}
