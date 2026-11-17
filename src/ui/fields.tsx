import { t } from '../i18n';
import type { Rotation } from '../nest/types';

// `srLabel` is read by screen readers only (e.g. the material the field belongs to).
export function NumberField({ label, value, onChange, min = 0, max = 1000, step = 0.1, suffix = t('unit.cm'), id, hint, srLabel }: {
  label: string; id?: string; hint?: string; srLabel?: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return <label class="field"><span>{label}{srLabel && <span class="visually-hidden"> · {srLabel}</span>}</span><span class="input-unit">
    <input id={id} type="number" required value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step}
      onInput={e => onChange(e.currentTarget.valueAsNumber)} />
    {suffix && <span aria-hidden="true">{suffix}</span>}
  </span>{hint && <small class="field-hint">{hint}</small>}</label>;
}
export function RotationSelect({ value, onChange, inherit = false, label = t('field.rotation') }: {
  value: Rotation | ''; onChange: (value: Rotation | '') => void; inherit?: boolean; label?: string;
}) {
  return <label class="field"><span>{label}</span><select value={value} onChange={e => onChange(e.currentTarget.value as Rotation | '')}>
    {inherit && <option value="">{t('field.rotation.inherit')}</option>}
    <option value="none">{t('field.rotation.none')}</option><option value="180">{t('field.rotation.180')}</option>
    <option value="90">{t('field.rotation.90')}</option>
  </select></label>;
}
