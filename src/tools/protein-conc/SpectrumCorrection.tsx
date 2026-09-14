import { useMemo, useState } from 'preact/hooks';
import type { SpectrumImport } from '@/core/chromatography';
import { correctA280ForScatter, fitLogScatter, parseSpectrum } from '@/core/chromatography';

const FIELD = 'mono w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

export function SpectrumCorrection({ onUseA280 }: { onUseA280: (absorbance: number) => void }) {
  const [source, setSource] = useState('');
  const [scatterEnabled, setScatterEnabled] = useState(false);
  const imported = useMemo<{ data?: SpectrumImport; error?: string }>(() => {
    if (!source.trim()) return {};
    try { return { data: parseSpectrum(source) }; }
    catch (error) { return { error: error instanceof Error ? error.message : 'Could not parse spectrum.' }; }
  }, [source]);
  const observed = imported.data?.points.find(point => point.wavelengthNm === 280)?.absorbance;
  const fit = useMemo(() => imported.data ? fitLogScatter(imported.data.points) : undefined, [imported.data]);
  const correction = scatterEnabled && observed !== undefined && fit ? correctA280ForScatter(observed, fit) : undefined;

  return <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <summary class="cursor-pointer font-medium">Import spectrum and adjust A280 for scattering</summary>
    <div class="mt-3 space-y-3">
      <label class="block text-sm">Spectrum CSV or TSV<textarea aria-label="Spectrum CSV or TSV" value={source} onInput={event => setSource((event.target as HTMLTextAreaElement).value)} placeholder="Wavelength,Absorbance" rows={5} class={`${FIELD} mt-1 text-xs`} /></label>
      {imported.error && <p role="alert" class="text-sm text-rose-700">{imported.error}</p>}
      {imported.data && <><div class="grid gap-3 sm:grid-cols-2"><div class="rounded border p-3 text-sm"><strong>Observed A280</strong><p>{observed === undefined ? 'No 280 nm observation' : observed.toFixed(4)}</p></div><label class="rounded border p-3 text-sm"><input aria-label="Apply 300–340 nm scatter correction" type="checkbox" checked={scatterEnabled} onChange={event => setScatterEnabled((event.target as HTMLInputElement).checked)} /> Apply 300–340 nm scatter correction</label></div>{scatterEnabled && <div class="rounded border border-violet-200 bg-violet-50 p-3 text-sm dark:bg-violet-950/20"><strong>Log-space scattering-adjusted A280</strong><p>{correction?.correctedA280?.toFixed(4) ?? 'unavailable'}</p><p class="mt-1 text-xs">Fit: n={fit?.pointCount ?? 0}; slope {fit?.slope?.toFixed(4) ?? '—'}; R² {fit?.rSquared?.toFixed(4) ?? '—'}; extrapolated log contribution {correction?.predictedScatterLogA280?.toFixed(4) ?? '—'}.</p>{correction?.correctedA280 !== undefined && <button type="button" class="mt-2 rounded border px-2 py-1 text-xs" onClick={() => onUseA280(correction.correctedA280!)}>Use adjusted A280</button>}</div>}{[...(fit?.warnings ?? []), ...(correction?.warnings ?? [])].map(warning => <p role="alert" class="text-xs text-amber-700">Warning: {warning}</p>)}</>}
    </div>
  </details>;
}
