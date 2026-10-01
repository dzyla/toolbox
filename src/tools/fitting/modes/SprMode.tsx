import { useMemo, useState } from 'preact/hooks';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { useDraftText } from '@/lib/drafts';
import { importErrorMessage, readTextFile } from '@/lib/file-import';
import { downloadText, toCsv } from '@/lib/export';
import { fitSprGlobal, parseSensorgrams, type ConcUnit } from '@/core/fitting/spr';
import { SCIENCE } from '../science';
import type { FittingModel } from '../FittingModel';
import { sprExample } from './examples';
import { Card, Check, DataBox, ErrorBox, FitPlot, KeyCards, ModeTabs, NumField, Notes, ParamTable, PLOT_COLORS, fmtSig } from './shared';

export function SprMode({ m }: { m: FittingModel }) {
  const { s, set, setSub, shareUrl } = m;
  const spr = s.spr;
  const [text, setText] = useDraftText('fitting:spr', sprExample);
  const [importError, setImportError] = useState('');
  const [showResiduals, setShowResiduals] = useState(false);

  const curves = useMemo(() => parseSensorgrams(text, spr.concUnit), [text, spr.concUnit]);
  const fit = useMemo(() => {
    if (curves.length === 0) return null;
    try {
      return fitSprGlobal(curves, { tDissStart: spr.tDissStart, tAssocStart: spr.tAssocStart, globalRmax: spr.globalRmax, fitBaseline: spr.fitBaseline });
    } catch (e) { return { error: (e as Error).message }; }
  }, [curves, spr]);

  async function upload(f: File) {
    setImportError('');
    try { setText(await readTextFile(f)); } catch (e) { setImportError(importErrorMessage(e, f.name)); }
  }
  const ok = fit && !('error' in fit) ? fit : null;
  const error = fit && 'error' in fit ? fit.error : '';
  const ignored = curves.filter(c => c.conc === undefined).map(c => c.label);

  const copyText = ok
    ? ['Global 1:1 kinetic fit', `kon = ${fmtSig(ok.kon, 4)} M⁻¹s⁻¹`, `koff = ${fmtSig(ok.koff, 4)} s⁻¹`, `KD = ${fmtSig(ok.KD * 1e9, 4)} nM`, `Rmax = ${ok.rmax.map(v => fmtSig(v, 4)).join(', ')}`, `R² = ${ok.r2.toFixed(4)}`, '', ...ok.notes, '', scienceText(SCIENCE)].join('\n')
    : error || 'No fit available.';

  function exportCsv() {
    if (!ok) return;
    downloadText(toCsv([['curve', 'time', 'observed', 'fitted', 'residual'], ...ok.series.flatMap(sr => sr.points.map(p => [sr.label, p.x, p.y, p.yFit, p.residual]))]), 'kinetics-fit.csv', 'text/csv');
  }

  const inputs = (
    <div class="space-y-4">
      <ModeTabs value={s.analysis} onChange={a => set({ analysis: a })} />
      <DataBox title="Sensorgrams" label="Sensorgram data" value={text} onChange={setText} onExample={() => setText(sprExample(), { persist: false })}
        placeholder={'Time\t6.25 nM\t12.5 nM\n0\t0.1\t0.2'} format="First column time (s), then one column per analyte concentration. Put the concentration in the column header (e.g. “12.5 nM”); bare numbers use the unit below. Zero/reference-subtract the curves first."
        summary={`${curves.length} curve${curves.length === 1 ? '' : 's'}`} error={importError} onFile={upload} />
      <Card title="Cycle timing and model">
        <NumField label="Association starts at" value={spr.tAssocStart} onChange={v => setSub('spr', { tAssocStart: v })} unit="s" hint="Time of analyte injection (usually 0 after zeroing)" />
        <NumField label="Dissociation starts at" value={spr.tDissStart} onChange={v => setSub('spr', { tDissStart: v })} unit="s" hint="End of the injection" />
        <label class="block">
          <span class="mb-0.5 block text-[11px] font-medium text-slate-600 dark:text-slate-300">Unit for bare numbers in headers</span>
          <select value={spr.concUnit} onChange={e => setSub('spr', { concUnit: (e.target as HTMLSelectElement).value as ConcUnit })} class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950">
            {(['pM', 'nM', 'uM', 'mM'] as const).map(u => <option key={u} value={u}>{u === 'uM' ? 'µM' : u}</option>)}
          </select>
        </label>
        <Check label="One shared Rmax" checked={spr.globalRmax} onChange={v => setSub('spr', { globalRmax: v })} hint="Untick to fit an Rmax per curve (surface heterogeneity)." />
        <Check label="Fit a baseline offset per curve" checked={spr.fitBaseline} onChange={v => setSub('spr', { fitBaseline: v })} hint="Only if the curves are not zeroed before injection." />
        {ignored.length > 0 && <p class="text-[11px] text-amber-800 dark:text-amber-300">Columns without a concentration are ignored: {ignored.join(', ')}.</p>}
      </Card>
    </div>
  );

  const results = (
    <div class="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      {!error && !ok && <p class="py-8 text-center text-xs text-slate-500 dark:text-slate-400">Paste sensorgrams or load the example to fit.</p>}
      {ok && (
        <>
          <KeyCards items={[
            { label: 'KD', value: `${fmtSig(ok.KD * 1e9, 3)} nM`, sub: ok.KDsteadyState ? `steady state ${fmtSig(ok.KDsteadyState * 1e9, 3)} nM` : 'kinetic' },
            { label: 'kon', value: fmtSig(ok.kon, 3), sub: 'M⁻¹s⁻¹' },
            { label: 'koff', value: fmtSig(ok.koff, 3), sub: `t½ ${fmtSig(Math.LN2 / ok.koff, 3)} s` },
            { label: 'R²', value: ok.r2.toFixed(4), sub: `RMS ${fmtSig(ok.rmse, 3)}` },
          ]} />
          <Notes notes={ok.notes} />
          <Card title="Global fit" right={<button type="button" onClick={exportCsv} class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Export CSV</button>}>
            <FitPlot ariaLabel={`Sensorgrams at ${ok.series.length} concentrations with global 1:1 fit`} name="kinetics-fit" xLabel="Time (s)" yLabel="Response" title="Global 1:1 Langmuir fit" height={340}
              vLines={[{ x: spr.tDissStart, label: 'dissociation' }]}
              groups={ok.series.map((sr, i) => ({ label: sr.label, color: PLOT_COLORS[i % PLOT_COLORS.length]!, points: sr.points.filter((_, k) => k % 2 === 0).map(p => ({ x: p.x, y: p.y })), curve: sr.points.map(p => ({ x: p.x, y: p.yFit })) }))} />
            <label class="flex cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={showResiduals} onChange={e => setShowResiduals((e.target as HTMLInputElement).checked)} class="rounded accent-accent-600" /> Show residuals</label>
            {showResiduals && (
              <FitPlot ariaLabel="Residuals of the global fit" name="kinetics-residuals" xLabel="Time (s)" yLabel="Residual" title="Residuals (random scatter around 0 supports the 1:1 model)" height={220} hLines={[0]}
                groups={ok.series.map((sr, i) => ({ label: sr.label, color: PLOT_COLORS[i % PLOT_COLORS.length]!, points: sr.points.map(p => ({ x: p.x, y: p.residual })) }))} />
            )}
          </Card>
          <Card title="Fitted parameters"><ParamTable parameters={ok.parameters} /></Card>
        </>
      )}
    </div>
  );

  return (
    <ToolLayout
      icon="📈" title="Curve Fitting & Regression" wide
      blurb="Curve fits, plus global enzyme-inhibition analysis with model comparison, tight-binding (Morrison), ITC and SPR/BLI kinetics."
      mobileResultSummary={ok ? <span><strong>1:1 fit</strong>: KD = <strong class="font-mono">{fmtSig(ok.KD * 1e9, 3)} nM</strong></span> : null}
      inputs={inputs} results={results}
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
