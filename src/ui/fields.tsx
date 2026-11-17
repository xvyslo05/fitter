import type { Rotation } from '../nest/types';

// `srLabel` is read by screen readers only (e.g. the material the field belongs to).
export function NumberField({ label, value, onChange, min = 0, max = 1000, step = 0.1, suffix = 'cm', id, hint, srLabel }: {
  label: string; id?: string; hint?: string; srLabel?: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return <label class="field"><span>{label}{srLabel && <span class="visually-hidden"> · {srLabel}</span>}</span><span class="input-unit">
    <input id={id} type="number" required value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step}
      onInput={e => onChange(e.currentTarget.valueAsNumber)} />
    {suffix && <span aria-hidden="true">{suffix}</span>}
  </span>{hint && <small class="field-hint">{hint}</small>}</label>;
}
export function RotationSelect({ value, onChange, inherit = false, label = 'Otáčení' }: {
  value: Rotation | ''; onChange: (value: Rotation | '') => void; inherit?: boolean; label?: string;
}) {
  return <label class="field"><span>{label}</span><select value={value} onChange={e => onChange(e.currentTarget.value as Rotation | '')}>
    {inherit && <option value="">Jako ostatní díly</option>}
    <option value="none">Neotáčet</option><option value="180">Po niti, i vzhůru nohama (0° a 180°)</option>
    <option value="90">I napříč (po 90°), mění směr vlákna</option>
  </select></label>;
}
