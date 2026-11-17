import type { Ref } from 'preact';
import { describe, t } from '../i18n';
import { DEFAULT_GAP_CM, changedSettings, resetSettings } from '../model/prepare';
import type { Settings } from '../model/prepare';
import { LengthField, NumberField, RotationSelect } from './fields';

// Settings that rarely change. The header always says what differs from the defaults, so a closed block hides nothing.
export function Refine({ settings, onSettings, detailsRef }: { settings: Settings; onSettings: (settings: Settings) => void; detailsRef: Ref<HTMLDetailsElement> }) {
  const changed = changedSettings(settings);
  return <div class="refine">
    <details id="refine" ref={detailsRef} class="advanced"><summary>{changed.length ? t('refine.summaryChanged', { list: changed.map(describe).join(', ') }) : t('refine.summaryDefault')}</summary>
      <h4>{t('refine.allowances')}</h4>
      <div class="field-row"><LengthField id="seam-amount" label={t('refine.seamAmount')} value={settings.seamAmount} max={10} onChange={seamAmount => onSettings({ ...settings, seamAmount })} />
        <LengthField label={t('refine.gap')} value={settings.gap} max={10} onChange={gap => onSettings({ ...settings, gap })} /></div>
      <p class="small muted">{t('refine.seamNote')}</p>
      <p class="small muted">{t('refine.gapNote')}{' '}
        {settings.gap !== DEFAULT_GAP_CM && <button type="button" class="text-button" onClick={() => onSettings({ ...settings, gap: DEFAULT_GAP_CM })}>{t('refine.gapDefault')}</button>}</p>
      <h4>{t('refine.rotation')}</h4>
      <RotationSelect value={settings.rotation} label={t('refine.rotationLabel')} onChange={rotation => rotation && onSettings({ ...settings, rotation })} />
      <label class="check"><input type="checkbox" checked={settings.mirroredPairs} onChange={e => onSettings({ ...settings, mirroredPairs: e.currentTarget.checked })} />{t('refine.mirrored')}</label>
      <p class="small muted">{t('refine.mirroredNote')}</p>
      <h4>{t('refine.search')}</h4>
      <div class="field-row">
        <label class="field"><span>{t('refine.precision')}</span><select value={settings.resolution} onChange={e => onSettings({ ...settings, resolution: Number(e.currentTarget.value) })}>
          <option value={0.25}>{t('refine.precisionFine')}</option><option value={0.5}>{t('refine.precisionNormal')}</option><option value={1}>{t('refine.precisionCoarse')}</option>
        </select></label>
        <NumberField label={t('refine.time')} value={settings.timeMs / 1000} min={0.1} max={60} step={0.1} suffix={t('refine.timeSuffix')} onChange={time => onSettings({ ...settings, timeMs: time * 1000 })} /></div>
      <NumberField label={t('refine.seed')} suffix="" hint={t('refine.seedHint')} value={settings.seed} min={0} max={4294967295} step={1} onChange={seed => onSettings({ ...settings, seed })} />
      <p class="small muted">{t('refine.searchNote')}</p>
    </details>
    {changed.length > 0 && <button type="button" class="text-button" onClick={() => onSettings(resetSettings(settings))}>{t('refine.resetAll')}</button>}
  </div>;
}
