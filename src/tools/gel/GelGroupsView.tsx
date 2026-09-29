import { useState } from 'preact/hooks';
import { assignByPattern } from './lane-meta';
import { DataQualityPanel } from './DataQualityPanel';
import type { GelWorkspace } from './workspace';

const fmt = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : v.toPrecision(d));
const fmtP = (p: number) => (p < 0.001 ? '<0.001' : p.toFixed(3));

export function GelGroupsView({ g }: { g: GelWorkspace }) {
  const { s, set, targetClusters, groupRows, groupSummaries, groupControlCondition, qualityIssues, laneMeta, setLaneMeta, lanes } = g;
  const [pattern, setPattern] = useState({ conditions: '', replicates: 3 });
  const conditions = groupSummaries.map(x => x.condition);
  const refOf = (id: string) => { const c = targetClusters.find(t => t.id === id); return c ? { size: c.avgSize, rf: c.avgRf } : null; };
  const idOf = (r: typeof s.groupTarget) => targetClusters.find(t => r && t.avgSize === r.size && Math.abs(t.avgRf - r.rf) < 1e-9)?.id ?? '';
  const editMeta = (laneId: string, patch: Partial<{ condition: string; replicate: number | null; excluded: boolean }>) =>
    setLaneMeta(prev => ({ ...prev, [laneId]: { condition: prev[laneId]?.condition ?? '', replicate: prev[laneId]?.replicate ?? null, excluded: prev[laneId]?.excluded ?? false, ...patch } }));
  const sampleLaneIds = lanes.map(l => l.id).filter(id => groupRows.some(r => r.laneId === id));
  const maxVal = Math.max(1e-12, ...groupSummaries.flatMap(x => x.values));

  return (
    <div class="space-y-4">
      <DataQualityPanel issues={qualityIssues} />

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
        <label class="space-y-1"><span class="font-semibold">Target band</span>
          <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={idOf(s.groupTarget)}
            onChange={e => set({ groupTarget: refOf((e.target as HTMLSelectElement).value) })}>
            <option value="">Choose…</option>{targetClusters.map(c => <option value={c.id}>{c.label}</option>)}
          </select></label>
        <label class="space-y-1"><span class="font-semibold">Normalization</span>
          <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={s.groupNorm}
            onChange={e => set({ groupNorm: (e.target as HTMLSelectElement).value as typeof s.groupNorm })}>
            <option value="none">None (target net)</option><option value="control-band">Loading-control band</option><option value="total-lane">Total lane protein</option>
          </select></label>
        {s.groupNorm === 'control-band' && (
          <label class="space-y-1"><span class="font-semibold">Loading-control band</span>
            <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={idOf(s.groupControl)}
              onChange={e => set({ groupControl: refOf((e.target as HTMLSelectElement).value) })}>
              <option value="">Choose…</option>{targetClusters.map(c => <option value={c.id}>{c.label}</option>)}
            </select></label>
        )}
        <label class="space-y-1"><span class="font-semibold">Control condition</span>
          <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={groupControlCondition}
            onChange={e => set({ groupControlCondition: (e.target as HTMLSelectElement).value })}>
            {conditions.map(c => <option value={c}>{c}</option>)}
          </select></label>
        <label class="flex items-center gap-2"><input type="checkbox" checked={s.groupWelch} onChange={e => set({ groupWelch: (e.target as HTMLInputElement).checked })} />
          Welch t-test vs control (Holm-adjusted)</label>
      </div>

      <details class="text-xs"><summary class="cursor-pointer font-semibold">Assign conditions by pattern</summary>
        <div class="mt-2 flex flex-wrap items-end gap-2">
          <label class="space-y-1"><span>Conditions, in lane order (comma-separated)</span>
            <input class="block rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={pattern.conditions}
              onInput={e => setPattern(p => ({ ...p, conditions: (e.target as HTMLInputElement).value }))} placeholder="ctrl, drug A, drug B" /></label>
          <label class="space-y-1"><span>Replicates each</span>
            <input type="number" min={1} class="block w-20 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={pattern.replicates}
              onInput={e => setPattern(p => ({ ...p, replicates: Number((e.target as HTMLInputElement).value) || 1 }))} /></label>
          <button type="button" class="rounded bg-accent-600 px-3 py-1.5 font-semibold text-white"
            onClick={() => setLaneMeta(prev => ({ ...prev, ...assignByPattern(sampleLaneIds, pattern.conditions.split(',').map(c => c.trim()).filter(Boolean), pattern.replicates) }))}>Apply</button>
        </div>
      </details>

      <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table aria-label="Lane conditions" class="w-full text-xs text-left">
          <thead class="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase text-slate-500 dark:text-slate-400">
            <tr><th class="px-3 py-2">Lane</th><th class="px-3 py-2">Condition</th><th class="px-3 py-2">Replicate</th><th class="px-3 py-2">Include</th>
              <th class="px-3 py-2 text-right">Target net</th><th class="px-3 py-2 text-right">Control net</th><th class="px-3 py-2 text-right">Value</th><th class="px-3 py-2">Flags</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            {groupRows.map(r => (
              <tr key={r.laneId}>
                <td class="px-3 py-1.5 font-semibold">{r.label}</td>
                <td class="px-3 py-1.5"><input aria-label={`Condition for ${r.label}`} class="w-32 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5"
                  value={laneMeta[r.laneId]?.condition ?? ''} placeholder={r.condition} onInput={e => editMeta(r.laneId, { condition: (e.target as HTMLInputElement).value })} /></td>
                <td class="px-3 py-1.5"><input aria-label={`Replicate for ${r.label}`} type="number" min={1} class="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5"
                  value={r.replicate ?? ''} onInput={e => { const v = (e.target as HTMLInputElement).value; editMeta(r.laneId, { replicate: v === '' ? null : Number(v) }); }} /></td>
                <td class="px-3 py-1.5"><input aria-label={`Include ${r.label}`} type="checkbox" checked={r.role !== 'excluded'} onChange={e => editMeta(r.laneId, { excluded: !(e.target as HTMLInputElement).checked })} /></td>
                <td class="px-3 py-1.5 mono text-right">{fmt(r.targetNet, 4)}</td>
                <td class="px-3 py-1.5 mono text-right">{fmt(r.controlNet, 4)}</td>
                <td class="px-3 py-1.5 mono text-right" title={r.reason ?? undefined}>{r.value === null ? <span class="text-slate-500 dark:text-slate-400">– {r.reason}</span> : fmt(r.value, 4)}</td>
                <td class="px-3 py-1.5 text-amber-700 dark:text-amber-400">{r.flags.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table aria-label="Condition summary" class="w-full text-xs text-left">
          <thead class="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase text-slate-500 dark:text-slate-400">
            <tr><th class="px-3 py-2">Condition</th><th class="px-3 py-2 text-right">n</th><th class="px-3 py-2 text-right">Mean</th><th class="px-3 py-2 text-right">SD</th>
              <th class="px-3 py-2 text-right">SEM</th><th class="px-3 py-2 text-right">95% CI</th><th class="px-3 py-2 text-right">CV%</th><th class="px-3 py-2 text-right">Fold vs {groupControlCondition || 'control'}</th>
              {s.groupWelch && <th class="px-3 py-2 text-right">p (Holm)</th>}<th class="px-3 py-2">Flags</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            {groupSummaries.map(x => (
              <tr key={x.condition}>
                <td class="px-3 py-1.5 font-semibold">{x.condition}{x.condition === groupControlCondition && <span class="ml-1 text-[9px] uppercase text-slate-500">control</span>}</td>
                <td class="px-3 py-1.5 mono text-right">{x.n}{x.nExcluded > 0 && <span class="text-slate-500"> (+{x.nExcluded} excl.)</span>}</td>
                <td class="px-3 py-1.5 mono text-right">{fmt(x.mean, 4)}</td><td class="px-3 py-1.5 mono text-right">{fmt(x.sd)}</td>
                <td class="px-3 py-1.5 mono text-right">{fmt(x.sem)}</td>
                <td class="px-3 py-1.5 mono text-right">{x.ci95 ? `${fmt(x.ci95[0])} – ${fmt(x.ci95[1])}` : '–'}</td>
                <td class="px-3 py-1.5 mono text-right">{x.cvPct === null ? '–' : x.cvPct.toFixed(1)}</td>
                <td class="px-3 py-1.5 mono text-right">{fmt(x.foldChange)}</td>
                {s.groupWelch && <td class="px-3 py-1.5 mono text-right">{x.test ? fmtP(x.test.pAdj) : '–'}</td>}
                <td class="px-3 py-1.5 text-amber-700 dark:text-amber-400">{x.flags.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">
        Replicates here are lanes on one blot. With n &lt; 3 per condition, SD, CI and p-values are not meaningful; treat independent biological
        replicates (separate blots) as the unit of inference.
      </p>

      <svg role="img" aria-label="Normalized value per condition, each replicate shown with mean ± SD" viewBox={`0 0 ${Math.max(200, 90 * groupSummaries.length)} 180`} class="w-full max-w-2xl">
        {groupSummaries.map((x, i) => {
          const cx = 45 + i * 90, y = (v: number) => 160 - (v / maxVal) * 140;
          return (
            <g key={x.condition}>
              {x.values.map((v, k) => <circle cx={cx - 12 + (k % 5) * 6} cy={y(v)} r={3} class="fill-accent-600" />)}
              {x.mean !== null && <line x1={cx - 18} x2={cx + 18} y1={y(x.mean)} y2={y(x.mean)} class="stroke-slate-900 dark:stroke-slate-100" stroke-width={2} />}
              {x.mean !== null && x.sd !== null && <line x1={cx} x2={cx} y1={y(x.mean - x.sd)} y2={y(x.mean + x.sd)} class="stroke-slate-900 dark:stroke-slate-100" />}
              <text x={cx} y={176} text-anchor="middle" class="fill-slate-600 dark:fill-slate-400 text-[10px]">{x.condition}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
