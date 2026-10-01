import { useMemo, useState } from 'preact/hooks';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { useDraftText } from '@/lib/drafts';
import { importErrorMessage, readTextFile } from '@/lib/file-import';
import { downloadText, toCsv } from '@/lib/export';
import { analyzeInhibition, fitMorrison, parseInhibitionData } from '@/core/fitting/global';
import { parseFittingData } from '@/core/fitting';
import { SCIENCE } from '../science';
import type { FittingModel } from '../FittingModel';
import { inhibitionExample, morrisonExample } from './examples';
import { Card, Check, DataBox, ErrorBox, FitPlot, KeyCards, ModeTabs, NumField, Notes, ParamTable, PLOT_COLORS, fmtSig, logspace } from './shared';

export function InhibitionMode({ m }: { m: FittingModel }) {
  const { s, set, setSub, shareUrl } = m;
  const inh = s.inh;
  const [mechText, setMechText] = useDraftText('fitting:inhibition', inhibitionExample);
  const [morText, setMorText] = useDraftText('fitting:morrison', morrisonExample);
  const [importError, setImportError] = useState('');
  const isMorrison = inh.kind === 'morrison';

  const mech = useMemo(() => {
    if (isMorrison) return null;
    try {
      const data = parseInhibitionData(mechText);
      if (data.length === 0) return null;
      return { analysis: analyzeInhibition(data), data };
    } catch (e) { return { error: (e as Error).message }; }
  }, [mechText, isMorrison]);

  const mor = useMemo(() => {
    if (!isMorrison) return null;
    try {
      const pts = parseFittingData(morText);
      if (pts.length === 0) return null;
      return { fit: fitMorrison(pts, { enzymeConc: inh.enzymeConc, fitEnzyme: inh.fitEnzyme, substrateConc: inh.substrateConc > 0 ? inh.substrateConc : undefined, km: inh.km > 0 ? inh.km : undefined }) };
    } catch (e) { return { error: (e as Error).message }; }
  }, [morText, isMorrison, inh.enzymeConc, inh.fitEnzyme, inh.substrateConc, inh.km]);

  async function upload(f: File) {
    setImportError('');
    try { const t = await readTextFile(f); if (isMorrison) setMorText(t); else setMechText(t); } catch (e) { setImportError(importErrorMessage(e, f.name)); }
  }

  const mechOk = mech && !('error' in mech) ? mech : null;
  const best = mechOk ? mechOk.analysis.fits[mechOk.analysis.best] : null;
  const morOk = mor && !('error' in mor) ? mor.fit : null;
  const error = mech && 'error' in mech ? mech.error : mor && 'error' in mor ? mor.error : '';

  const copyText = isMorrison
    ? (morOk ? [morOk.modelName, morOk.equationStr, ...morOk.parameters.map(p => `${p.symbol} = ${fmtSig(p.value, 4)}${p.unit ? ' ' + p.unit : ''}`), ...morOk.notes].join('\n') : error || 'No fit available.')
    : (mechOk && best ? [mechOk.analysis.summary, best.modelName, best.equationStr, ...best.parameters.map(p => `${p.symbol} = ${fmtSig(p.value, 4)} (SE ${fmtSig(p.standardError)})`), '', 'Model comparison (AICc):', ...mechOk.analysis.comparison.map(c => `${c.name}: AICc ${c.aicc.toFixed(1)}, Δ ${c.deltaAicc.toFixed(1)}, weight ${(c.weight * 100).toFixed(0)}%`), '', scienceText(SCIENCE)].join('\n') : error || 'No fit available.');

  function exportCsv() {
    if (mechOk && best) {
      downloadText(toCsv([['[S]', '[I]', 'v observed', 'v fitted'], ...best.series.flatMap(sr => sr.points.map(p => [p.x, sr.id.replace('I=', ''), p.y, p.yFit]))]), 'inhibition-fit.csv', 'text/csv');
    } else if (morOk) {
      downloadText(toCsv([['[I]', 'activity observed', 'activity fitted'], ...morOk.series[0]!.points.map(p => [p.x, p.y, p.yFit])]), 'morrison-fit.csv', 'text/csv');
    }
  }

  const inputs = (
    <div class="space-y-4">
      <ModeTabs value={s.analysis} onChange={a => set({ analysis: a })} />
      <Card title="Experiment type">
        <div class="grid grid-cols-2 gap-1.5" role="group" aria-label="Experiment type">
          {([['mechanism', 'Mechanism (several [S] and [I])'], ['morrison', 'Tight-binding (Morrison)']] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={inh.kind === k} onClick={() => setSub('inh', { kind: k })}
              class={`rounded-lg px-2 py-1.5 text-xs font-semibold ${inh.kind === k ? 'bg-accent-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{label}</button>
          ))}
        </div>
      </Card>
      {isMorrison ? (
        <>
          <DataBox title="Inhibitor titration" label="Morrison data" value={morText} onChange={setMorText} onExample={() => setMorText(morrisonExample(), { persist: false })}
            placeholder={'# [I]\tactivity\n0\t100\n1\t62'} format="Two columns: inhibitor concentration, then activity (any consistent unit). Include 0 inhibitor and at least 5 concentrations around the Ki and the enzyme concentration."
            summary={isMorrison && morOk ? `${morOk.series[0]!.points.length} points` : undefined} error={importError} onFile={upload} />
          <Card title="Enzyme and assay conditions">
            <NumField label="Total active enzyme [E]t" value={inh.enzymeConc} onChange={v => setSub('inh', { enzymeConc: v })} unit="same unit as [I]" />
            <Check label="Fit the active enzyme concentration" checked={inh.fitEnzyme} onChange={v => setSub('inh', { fitEnzyme: v })} hint="Use for an active-site titration; otherwise [E]t is fixed to the value above." />
            <NumField label="Substrate [S] (optional)" value={inh.substrateConc} onChange={v => setSub('inh', { substrateConc: v })} hint="With Km, converts Ki,app to Ki for a competitive inhibitor." />
            <NumField label="Km (optional)" value={inh.km} onChange={v => setSub('inh', { km: v })} />
          </Card>
        </>
      ) : (
        <DataBox title="Rates at several [S] and [I]" label="Inhibition data" value={mechText} onChange={setMechText} onExample={() => setMechText(inhibitionExample(), { persist: false })}
          placeholder={'# [S]\t[I]\tv\n1\t0\t17\n1\t5\t9'} format="Three columns: substrate, inhibitor, rate (extra columns are replicate rates). Include [I] = 0 and at least two inhibitor concentrations, with [S] spanning about 0.2–5 × Km."
          summary={mechOk ? `${mechOk.data.length} observations` : undefined} error={importError} onFile={upload} />
      )}
    </div>
  );

  const results = (
    <div class="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      {(mechOk || morOk) && <div class="flex justify-end"><button type="button" onClick={exportCsv} class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Export fit as CSV</button></div>}
      {!error && !mechOk && !morOk && <p class="py-8 text-center text-xs text-slate-500 dark:text-slate-400">Paste data or load the example to fit.</p>}

      {mechOk && best && (
        <>
          <p class="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs font-medium text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200">{mechOk.analysis.summary}</p>
          <KeyCards items={[
            { label: 'Preferred mechanism', value: best.modelName.replace(' inhibition', '') },
            { label: 'Ki', value: fmtSig(best.parameters.find(p => p.symbol === 'Ki')!.value), sub: `± ${fmtSig(best.parameters.find(p => p.symbol === 'Ki')!.standardError)}` },
            { label: 'Vmax', value: fmtSig(best.parameters[0]!.value) },
            { label: 'Km', value: fmtSig(best.parameters[1]!.value) },
          ]} />
          <Card title="Global fit">
            <FitPlot
              ariaLabel={`Rate versus substrate at ${best.series.length} inhibitor concentrations with global ${best.modelName} fit`}
              name="inhibition-fit" xLabel="[S]" yLabel="Rate v" title={best.modelName}
              groups={best.series.map((sr, i) => {
                const xs = sr.points.map(p => p.x);
                const sMax = Math.max(...xs), sMin = Math.min(...xs.filter(v => v > 0));
                return { label: sr.label, color: PLOT_COLORS[i % PLOT_COLORS.length]!, points: sr.points.map(p => ({ x: p.x, y: p.y })), curve: logspace(sMin * 0.5, sMax, 60).map(x => ({ x, y: sr.predict(x) })) };
              })}
              xLog
            />
            <p class="font-serif text-sm italic text-slate-700 dark:text-slate-300">{best.equationStr}</p>
            <ParamTable parameters={best.parameters} />
          </Card>
          <Card title="Model comparison (AICc)">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead><tr class="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th class="pb-2 font-semibold">Mechanism</th><th class="pb-2 text-right font-semibold">Params</th><th class="pb-2 text-right font-semibold">SSE</th><th class="pb-2 text-right font-semibold">ΔAICc</th><th class="pb-2 text-right font-semibold">Akaike weight</th>
                </tr></thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  {mechOk.analysis.comparison.map(c => (
                    <tr key={c.model} class={c.model === mechOk.analysis.best ? 'font-semibold' : ''}>
                      <td class="py-1.5">{c.name}</td><td class="py-1.5 text-right font-mono">{c.nParams}</td><td class="py-1.5 text-right font-mono">{fmtSig(c.sse)}</td>
                      <td class="py-1.5 text-right font-mono">{c.deltaAicc.toFixed(1)}</td><td class="py-1.5 text-right font-mono">{(c.weight * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">ΔAICc &lt; 2: indistinguishable; 4–7: moderate support; &gt; 10: strong support for the lower-AICc model (Burnham &amp; Anderson 2002). Non-competitive is the special case α = 1 of mixed inhibition.</p>
          </Card>
          <Notes notes={best.notes} />
        </>
      )}

      {morOk && (
        <>
          <KeyCards items={[
            { label: 'Ki,app', value: fmtSig(morOk.parameters[1]!.value), sub: `± ${fmtSig(morOk.parameters[1]!.standardError)}` },
            ...(morOk.parameters.find(p => p.symbol === 'Ki') ? [{ label: 'Ki (competitive)', value: fmtSig(morOk.parameters.find(p => p.symbol === 'Ki')!.value) }] : []),
            { label: '[E]t', value: fmtSig(morOk.parameters[2]!.value), sub: inh.fitEnzyme ? 'fitted' : 'fixed' },
            { label: 'R²', value: morOk.r2.toFixed(4) },
          ]} />
          <Card title="Tight-binding fit">
            <FitPlot ariaLabel="Activity versus inhibitor concentration with Morrison fit" name="morrison-fit" xLabel="[I]" yLabel="Activity" title={morOk.modelName}
              groups={[{ label: 'Data', color: PLOT_COLORS[0]!, points: morOk.series[0]!.points.map(p => ({ x: p.x, y: p.y })), curve: Array.from({ length: 80 }, (_, i) => { const xMax = Math.max(...morOk.series[0]!.points.map(p => p.x)); const x = (xMax * i) / 79; return { x, y: morOk.series[0]!.predict(x) }; }) }]} />
            <p class="font-serif text-sm italic text-slate-700 dark:text-slate-300">{morOk.equationStr}</p>
            <ParamTable parameters={morOk.parameters} />
          </Card>
          <Notes notes={morOk.notes} />
        </>
      )}
    </div>
  );

  return (
    <ToolLayout
      icon="📈" title="Curve Fitting & Regression" wide
      blurb="Curve fits, plus global enzyme-inhibition analysis with model comparison, tight-binding (Morrison), ITC and SPR/BLI kinetics."
      mobileResultSummary={best ? <span><strong>{best.modelName}</strong>: Ki = <strong class="font-mono">{fmtSig(best.parameters.find(p => p.symbol === 'Ki')!.value)}</strong></span> : morOk ? <span><strong>Ki,app</strong> = <strong class="font-mono">{fmtSig(morOk.parameters[1]!.value)}</strong></span> : null}
      inputs={inputs} results={results}
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
