import { useEffect, useRef, useState } from 'preact/hooks';
import { fmt, getUnit, parseLength, t } from '../i18n';
import { useLocale } from '../i18n/hooks';
import type { Unit } from '../i18n';
import type { Rotation } from '../nest/types';

// `srLabel` is read by screen readers only (e.g. the material the field belongs to).
export function NumberField({ label, value, onChange, min = 0, max = 1000, step = 0.1, suffix = '', id, hint, srLabel }: {
  label: string; id?: string; hint?: string; srLabel?: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return <label class="field"><span>{label}{srLabel && <span class="visually-hidden"> · {srLabel}</span>}</span><span class="input-unit">
    <input id={id} type="number" required value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step}
      onInput={e => onChange(e.currentTarget.valueAsNumber)} />
    {suffix && <span aria-hidden="true">{suffix}</span>}
  </span>{hint && <small class="field-hint">{hint}</small>}</label>;
}

// A length typed in the unit on screen (cm or inches); `value`, `min`, `max` and what `onChange` gets are cm. A decimal comma or point
// both work, and inches also take fractions ("5/8", "1 1/2"). While the text is being typed it stays as typed; NaN reports text that is not a length.
export function LengthInput({ value, onChange, min = 0, max = 1000, id, label }: {
  value: number; onChange: (cm: number) => void; min?: number; max?: number; id?: string; label?: string;
}) {
  const { unit } = useLocale();
  const [draft, setDraft] = useState<{ text: string; unit: Unit } | null>(null), input = useRef<HTMLInputElement>(null);
  const shown = draft && draft.unit === unit ? draft.text : Number.isFinite(value) ? fmt.field(value, unit) : '';
  // The browser's own validity (required, min, max) does not know inches, so the field reports it.
  useEffect(() => {
    const ok = Number.isFinite(value) && value >= min && value <= max;
    input.current?.setCustomValidity(ok ? '' : t('field.range', { min, max }));
  }, [value, min, max, unit]);
  return <input ref={input} id={id} type="text" inputMode={unit === 'in' ? 'text' : 'decimal'} autocomplete="off" required aria-label={label} value={shown}
    onInput={e => { const text = e.currentTarget.value; setDraft({ text, unit: getUnit() }); onChange(parseLength(text, getUnit())); }}
    onBlur={() => setDraft(null)} />;
}
export function LengthField({ label, value, onChange, min = 0, max = 1000, id, hint, srLabel }: {
  label: string; id?: string; hint?: string; srLabel?: string; value: number; onChange: (cm: number) => void; min?: number; max?: number;
}) {
  const { unit } = useLocale();
  return <label class="field"><span>{label}{srLabel && <span class="visually-hidden"> · {srLabel}</span>}</span><span class="input-unit">
    <LengthInput id={id} value={value} onChange={onChange} min={min} max={max} /><span aria-hidden="true">{fmt.unit(unit)}</span>
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
