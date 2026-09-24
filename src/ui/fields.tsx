import type { Rotation } from '../nest/types';

export function NumberField({ label, value, onChange, min = 0, max = 1000, step = 0.1, suffix = 'cm' }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return <label class="field"><span>{label}</span><span class="input-unit">
    <input type="number" required value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step}
      onInput={e => onChange(e.currentTarget.valueAsNumber)} />
    {suffix && <span aria-hidden="true">{suffix}</span>}
  </span></label>;
}
export function RotationSelect({ value, onChange, inherit = false, label = 'Otáčení' }: {
  value: Rotation | ''; onChange: (value: Rotation | '') => void; inherit?: boolean; label?: string;
}) {
  return <label class="field"><span>{label}</span><select value={value} onChange={e => onChange(e.currentTarget.value as Rotation | '')}>
    {inherit && <option value="">Dle nastavení</option>}
    <option value="none">Bez otáčení</option><option value="180">0° / 180° · po vlákně</option>
    <option value="90">0° / 90° / 180° / 270°</option>
  </select></label>;
}
