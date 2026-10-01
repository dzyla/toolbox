import { useMemo, useState } from 'preact/hooks';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { useDraftText } from '@/lib/drafts';
import { importErrorMessage, readTextFile } from '@/lib/file-import';
import { downloadText, toCsv } from '@/lib/export';
import { fitItcOneSite, parseItcInjections, type HeatUnit } from '@/core/fitting/itc';
import { SCIENCE } from '../science';
import type { FittingModel } from '../FittingModel';
import { itcExample } from './examples';
import { Card, Check, DataBox, ErrorBox, FitPlot, KeyCards, ModeTabs, NumField, Notes, ParamTable, PLOT_COLORS, fmtSig } from './shared';

export function ItcMode({ m }: { m: FittingModel }) {
  const { s, set, setSub, shareUrl } = m;
  const itc = s.itc;
  const [text, setText] = useDraftText('fitting:itc', itcExample);
  const [importError, setImportError] = useState('');

  const parsed = useMemo(() => {
    try { return { ...parseItcInjections(text, itc.defaultVolumeUl) }; } catch (e) { return { error: (e as Error).message }; }
  }, [text, itc.defaultVolumeUl]);

  const fit = useMemo(() => {
    if ('error' in parsed || parsed.heats.length === 0) return null;
    try {
      return fitItcOneSite(
        { cellVolumeUl: itc.cellVolumeUl, cellConcUm: itc.cellConcUm, syringeConcUm: itc.syringeConcUm, temperatureC: itc.temperatureC, volumesUl: parsed.volumesUl, heats: parsed.heats, heatUnit: itc.heatUnit },
        { fixedN: itc.fixN ? itc.n : undefined, fitOffset: itc.fitOffset, skipFirst: itc.skipFirst },
      );
    } catch (e) { return { error: (e as Error).message }; }
  }, [parsed, itc]);

  async function upload(f: File) {
    setImportError('');
    try { setText(await readTextFile(f)); } catch (e) { setImportError(importErrorMessage(e, f.name)); }
  }
  const ok = fit && !('error' in fit) ? fit : null;
  const error = 'error' in parsed ? parsed.error : fit && 'error' in fit ? fit.error : '';
  const p = (sym: string) => ok!.parameters.find(x => x.symbol === sym)!;

  const copyText = ok
    ? ['ITC one set of sites', `n = ${fmtSig(ok.n, 4)}`, `K = ${fmtSig(ok.K, 4)} M⁻¹ (KD = ${fmtSig(ok.KD * 1e6, 4)} µM)`, `ΔH = ${fmtSig(ok.deltaH, 4)} kcal/mol`, `ΔG = ${fmtSig(ok.deltaG, 4)} kcal/mol`, `−TΔS = ${fmtSig(ok.minusTdeltaS, 4)} kcal/mol`, `c = ${fmtSig(ok.cValue, 3)}`, '', ...ok.notes, '', scienceText(SCIENCE)].join('\n')
    : error || 'No fit available.';

  function exportCsv() {
    if (!ok) return;
    downloadText(toCsv([['injection', 'molar ratio', 'observed (kcal/mol injectant)', 'fitted (kcal/mol injectant)', 'residual', 'excluded'], ...ok.injections.map(i => [i.index, i.molarRatio, i.observed, i.fitted, i.residual, i.excluded ? 'yes' : ''])]), 'itc-fit.csv', 'text/csv');
  }

  const inputs = (
    <div class="space-y-4">
      <ModeTabs value={s.analysis} onChange={a => set({ analysis: a })} />
      <DataBox title="Injection heats" label="ITC injection data" value={text} onChange={setText} onExample={() => setText(itcExample(), { persist: false })}
        placeholder={'# volume (µL)\theat (µcal)\n0.4\t-0.8\n2\t-3.1'} format="Two columns: injection volume (µL) and integrated heat per injection. One column (heat only) uses the default volume below. Export integrated peaks (e.g. from NITPIC, MicroCal, PEAQ) after baseline correction."
        summary={'heats' in parsed ? `${parsed.heats.length} injections` : undefined} error={importError} onFile={upload} />
      <Card title="Experiment">
        <label class="block">
          <span class="mb-0.5 block text-[11px] font-medium text-slate-600 dark:text-slate-300">Heat unit in the table</span>
          <select value={itc.heatUnit} onChange={e => setSub('itc', { heatUnit: (e.target as HTMLSelectElement).value as HeatUnit })} class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950">
            <option value="ucal">µcal per injection</option>
            <option value="uJ">µJ per injection</option>
            <option value="kcal/mol">kcal per mole of injectant</option>
          </select>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <NumField label="Cell volume" value={itc.cellVolumeUl} onChange={v => setSub('itc', { cellVolumeUl: v })} unit="µL" hint="Active volume of your instrument" />
          <NumField label="Temperature" value={itc.temperatureC} onChange={v => setSub('itc', { temperatureC: v })} unit="°C" />
          <NumField label="Cell concentration" value={itc.cellConcUm} onChange={v => setSub('itc', { cellConcUm: v })} unit="µM" hint="Macromolecule" />
          <NumField label="Syringe concentration" value={itc.syringeConcUm} onChange={v => setSub('itc', { syringeConcUm: v })} unit="µM" hint="Ligand" />
          <NumField label="Default injection volume" value={itc.defaultVolumeUl} onChange={v => setSub('itc', { defaultVolumeUl: v })} unit="µL" hint="Used when the table has heats only" />
        </div>
      </Card>
      <Card title="Fit options">
        <Check label="Skip the first injection" checked={itc.skipFirst} onChange={v => setSub('itc', { skipFirst: v })} hint="The small priming injection is often inaccurate." />
        <Check label="Fit a constant heat offset" checked={itc.fitOffset} onChange={v => setSub('itc', { fitOffset: v })} hint="Heat of dilution, if no control titration was subtracted." />
        <Check label="Fix the stoichiometry n" checked={itc.fixN} onChange={v => setSub('itc', { fixN: v })} hint="Use for low-c titrations, with n from the active concentration." />
        {itc.fixN && <NumField label="n (fixed)" value={itc.n} onChange={v => setSub('itc', { n: v })} />}
      </Card>
    </div>
  );

  const results = (
    <div class="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      {!error && !ok && <p class="py-8 text-center text-xs text-slate-500 dark:text-slate-400">Paste injection data or load the example to fit.</p>}
      {ok && (
        <>
          <KeyCards items={[
            { label: 'KD', value: `${fmtSig(ok.KD * 1e6, 3)} µM`, sub: `K = ${fmtSig(ok.K, 3)} M⁻¹` },
            { label: 'ΔH', value: `${fmtSig(ok.deltaH, 3)}`, sub: 'kcal/mol' },
            { label: 'n', value: fmtSig(ok.n, 3), sub: itc.fixN ? 'fixed' : `± ${fmtSig(p('n').standardError)}` },
            { label: 'c-value', value: fmtSig(ok.cValue, 3), sub: ok.cValue >= 1 && ok.cValue <= 1000 ? 'well-defined K' : 'see notes' },
          ]} />
          <Notes notes={ok.notes} />
          <Card title="Binding isotherm" right={<button type="button" onClick={exportCsv} class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Export CSV</button>}>
            <FitPlot ariaLabel="Heat per mole of injectant versus molar ratio with one-site fit" name="itc-fit" xLabel="Molar ratio [ligand]/[macromolecule]" yLabel="ΔH (kcal/mol injectant)" title="One set of sites"
              groups={[{ label: 'Injections', color: PLOT_COLORS[0]!, points: ok.injections.filter(i => !i.excluded).map(i => ({ x: i.molarRatio, y: i.observed })), curve: ok.injections.map(i => ({ x: i.molarRatio, y: i.fitted })) }]} />
            <p class="text-[11px] text-slate-500 dark:text-slate-400">RMS residual {fmtSig(ok.rmse)} µcal per injection. {ok.injections.some(i => i.excluded) ? 'The skipped injection is not drawn.' : ''}</p>
          </Card>
          <Card title="Thermodynamics">
            <ParamTable parameters={ok.parameters} />
            <p class="font-serif text-xs italic text-slate-600 dark:text-slate-300">ΔG = −RT ln K = ΔH − TΔS (1 M standard state). ΔH, ΔG and −TΔS are shown in kcal/mol.</p>
          </Card>
        </>
      )}
    </div>
  );

  return (
    <ToolLayout
      icon="📈" title="Curve Fitting & Regression" wide
      blurb="Curve fits, plus global enzyme-inhibition analysis with model comparison, tight-binding (Morrison), ITC and SPR/BLI kinetics."
      mobileResultSummary={ok ? <span><strong>ITC</strong>: KD = <strong class="font-mono">{fmtSig(ok.KD * 1e6, 3)} µM</strong>, ΔH = {fmtSig(ok.deltaH, 3)} kcal/mol</span> : null}
      inputs={inputs} results={results}
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
