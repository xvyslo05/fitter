import { fmt, t } from '../i18n';
import { useLocale } from '../i18n/hooks';
import { fabricWidthPresets } from '../model/prepare';
import type { Fabric } from '../nest/types';
import { LengthField } from './fields';

// One fabric card of step 2: "Teprve koupím" (length is calculated) or "Už mám kus" (fixed length).
export function FabricEditor({ material, fabric, onChange }: { material: string; fabric: Fabric; onChange: (fabric: Fabric) => void }) {
  const { unit } = useLocale();
  return <div class="fabric"><div class="fabric-title"><h3>{material}</h3></div>
    <div class="segmented" role="group" aria-label={t('fabric.groupLabel', { material })}>
      <button type="button" aria-pressed={fabric.length === null} onClick={() => onChange({ ...fabric, length: null })}>{t('fabric.buy')} <span>{t('fabric.buyHint')}</span></button>
      <button type="button" aria-pressed={fabric.length !== null} onClick={() => onChange({ ...fabric, length: fabric.length ?? 100 })}>{t('fabric.have')} <span>{t('fabric.haveHint')}</span></button>
    </div>
    <div class="field-row"><LengthField label={t('fabric.width')} srLabel={material} min={1} max={1000} value={fabric.width} onChange={width => onChange({ ...fabric, width })} />
      {fabric.length !== null && <LengthField label={t('fabric.length')} srLabel={material} min={1} max={10000} value={fabric.length} onChange={length => onChange({ ...fabric, length })} />}</div>
    <p class="small muted">{t('fabric.widthNote')}</p>
    <div class="presets" role="group" aria-label={t('fabric.presetsLabel', { material })}>
      {fabricWidthPresets(unit).map(width => <button type="button" key={width} class="preset" aria-pressed={fabric.width === width} aria-label={t('fabric.presetWidth', { width })}
        onClick={() => onChange({ ...fabric, width })}>{fmt.length(width, unit, 0)}</button>)}
    </div>
    <label class="check"><input type="checkbox" checked={fabric.folded} onChange={e => onChange({ ...fabric, folded: e.currentTarget.checked })} />{t('fabric.folded')}</label>
    {fabric.folded && <p class="small muted">{t('fabric.foldedNote', { half: fabric.width / 2 })}</p>}
    <label class="check"><input type="checkbox" checked={fabric.directional === true} onChange={e => onChange({ ...fabric, directional: e.currentTarget.checked })} />{t('fabric.directional')}</label>
    {fabric.directional && <p class="small muted">{t('fabric.directionalNote')}</p>}
  </div>;
}
