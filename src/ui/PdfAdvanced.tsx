import { CM_PER_PT } from '../pdf/scale';
import { fmt, t, toUnit } from '../i18n';
import type { Unit } from '../i18n';
import type { StyleEntry, TraceOptions } from '../pdf/types';
import { Swatch } from './PdfPreview';

// Everything with raster, gap, pt or cm/pt values: shown only inside the "Pokročilé" section of step 2.
export interface TraceSettings { gap: string; resolution: string; minArea: string }
const number = (value: string) => Number(value.replace(',', '.'));
// Throws an Error with the text for the user when a value is empty or out of range.
export function parseTraceOptions(settings: TraceSettings, cmPerPt: number): TraceOptions {
  const options = { cmPerPt, gapMm: number(settings.gap), resolutionMm: number(settings.resolution), minAreaCm2: number(settings.minArea) };
  if (!settings.gap.trim() || !settings.resolution.trim() || !settings.minArea.trim() || !Object.values(options).every(Number.isFinite) || options.gapMm < 0 || options.gapMm > 6 ||
    options.resolutionMm < 0.25 || options.resolutionMm > 1 || options.minAreaCm2 < 0) throw new Error(t('pdf.adv.range'));
  return options;
}

export function Advanced({ legend, assignments, onAssign, highlight, pinned, onPin, onHover, onFocus, dark, unit, cmPerPt, settings, onSettings, excludeScaleMarks, onExcludeScaleMarks }: {
  legend: StyleEntry[]; assignments: Record<string, string>; onAssign: (key: string, value: string) => void;
  highlight: string | null; pinned: string | null; onPin: (key: string | null) => void; onHover: (key: string | null) => void; onFocus: (key: string | null) => void;
  dark: boolean; unit: Unit; cmPerPt: number; settings: TraceSettings; onSettings: (patch: Partial<TraceSettings>) => void;
  excludeScaleMarks: boolean; onExcludeScaleMarks: (value: boolean) => void;
}) {
  return <details class="pdf-advanced"><summary>{t('pdf.advanced')}</summary>
    <p class="small muted">{t('pdf.adv.help')}</p>
    <h3>{t('pdf.adv.tableTitle')}</h3><p class="small muted">{t('pdf.adv.tableHelp')}</p>
    <div class="pdf-table-scroll"><table class="pdf-legend"><thead><tr><th>{t('pdf.legend.style')}</th><th>{t('pdf.legend.paths')}</th><th>{t('pdf.legend.size')}</th></tr></thead>
      <tbody>{legend.map((entry, i) => <tr key={entry.key} class={[highlight === entry.key && 'highlighted', pinned === entry.key && 'pinned'].filter(Boolean).join(' ') || undefined}
        onClick={e => { const typing = e.target instanceof HTMLInputElement; onPin(typing || pinned !== entry.key ? entry.key : null); }} onMouseEnter={() => onHover(entry.key)} onMouseLeave={() => onHover(null)}>
        <td><Swatch entry={entry} dark={dark} label={t('pdf.adv.styleLabel', { kind: t(entry.kind === 'fill' ? 'pdf.legend.fill' : 'pdf.legend.line'), width: entry.width.toFixed(2), dash: t(entry.dash.length ? 'pdf.legend.dashed' : 'pdf.legend.solid') })} />
          <span class="small muted">{entry.kind === 'fill' ? t('pdf.legend.fill') : `${entry.width.toFixed(2)} pt`}</span></td>
        <td>{entry.paths}<span class="small muted">{toUnit(entry.lengthPt * cmPerPt, unit).toFixed(1)} {fmt.unit(unit)}</span></td>
        <td><input aria-label={t('pdf.legend.sizeFor', { n: i + 1 })} value={assignments[entry.key] ?? ''} placeholder="—" maxLength={80} onFocus={() => onFocus(entry.key)} onBlur={() => onFocus(null)}
          onInput={e => onAssign(entry.key, e.currentTarget.value)} /></td></tr>)}</tbody></table></div>
    <p class="small muted">{t('pdf.adv.scaleCurrent', { cmPerPt: cmPerPt.toFixed(6), percent: (cmPerPt / CM_PER_PT * 100).toFixed(2) })}</p>
    <label class="pdf-scale-marks"><input type="checkbox" checked={excludeScaleMarks} onChange={e => onExcludeScaleMarks(e.currentTarget.checked)} /> {t('pdf.scale.excludeMarks')}</label>
    <p class="small muted">{t('pdf.scale.excludeHelp')}</p>
    <h3>{t('pdf.adv.traceTitle')}</h3><div class="pdf-trace-settings">
      <label class="field"><span>{t('pdf.adv.gap')}</span><input type="number" min="0" max="6" step="0.25" value={settings.gap} onInput={e => onSettings({ gap: e.currentTarget.value })} /></label>
      <label class="field"><span>{t('pdf.adv.step')}</span><input type="number" min="0.25" max="1" step="0.25" value={settings.resolution} onInput={e => onSettings({ resolution: e.currentTarget.value })} /></label>
      <label class="field"><span>{t('pdf.adv.minArea')}</span><input type="number" min="0" step="1" value={settings.minArea} onInput={e => onSettings({ minArea: e.currentTarget.value })} /></label>
    </div>
  </details>;
}
