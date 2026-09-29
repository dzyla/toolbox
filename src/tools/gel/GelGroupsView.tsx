import { useState } from 'preact/hooks';
import { assignByPattern } from './lane-meta';
import { matchCluster } from './workspace/groups';
import type { BandRef } from './workspace-model';
import { DataQualityPanel } from './DataQualityPanel';
import type { GelWorkspace } from './workspace';

const fmt = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : v.toPrecision(d));
const fmtP = (p: number) => (p < 0.001 ? '<0.001' : p.toFixed(3));

export function GelGroupsView({ g }: { g: GelWorkspace }) {
  const { s, set, targetClusters, groupRows, groupSummaries, groupControlCondition, qualityIssues, laneMeta, setLaneMeta, lanes } = g;
  const [pattern, setPattern] = useState({ conditions: '', replicates: 3 });
  const conditions = groupSummaries.map(x => x.condition);
  const refOf = (id: string) => { const c = targetClusters.find(t => t.id === id); return c ? { size: c.avgSize, rf: c.avgRf } : null; };
  const usable = targetClusters.filter(c => c.matchingLanesCount > 0);
  const idOf = (r: BandRef | null) => matchCluster(r, usable, s.groupMarginPct)?.id ?? '';
  const bandOptions = (r: BandRef | null) => (
    <>
      <option value="">Choose…</option>
      {usable.length === 0 && <option value="" disabled>No bands detected</option>}
      {r && !idOf(r) && <option value="__stored" selected>{`Stored target ${r.size !== null ? `~${r.size.toPrecision(3)}` : ''} Rf ${r.rf.toFixed(2)} — no matching band`}</option>}
      {usable.map(c => <option value={c.id}>{c.label}</option>)}
    </>
  );
  const pick = (id: string) => (id === '__stored' ? undefined : refOf(id));
  const unknownControl = s.groupControlCondition !== '' && !conditions.includes(s.groupControlCondition);
  const editMeta = (laneId: string, patch: Partial<{ condition: string; replicate: number | null; excluded: boolean }>) =>
    setLaneMeta(prev => ({ ...prev, [laneId]: { condition: prev[laneId]?.condition ?? '', replicate: prev[laneId]?.replicate ?? null, excluded: prev[laneId]?.excluded ?? false, ...patch } }));
  const sampleLaneIds = lanes.map(l => l.id).filter(id => groupRows.some(r => r.laneId === id));
  const spread = groupSummaries.flatMap(x => [...x.values, ...(x.mean !== null && x.sd !== null ? [x.mean - x.sd, x.mean + x.sd] : [])]);
  const yMin = Math.min(0, ...spread), yMax = Math.max(1e-12, ...spread), yRange = Math.max(1e-12, yMax - yMin);
  const yOf = (v: number) => 160 - ((v - yMin) / yRange) * 140;

  return (
    <div class="space-y-4">
      <DataQualityPanel issues={qualityIssues} />

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
        <label class="space-y-1"><span class="font-semibold">Target band</span>
          <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={idOf(s.groupTarget) || (s.groupTarget ? '__stored' : '')}
            onChange={e => { const p = pick((e.target as HTMLSelectElement).value); if (p !== undefined) set({ groupTarget: p }); }}>
            {bandOptions(s.groupTarget)}
          </select></label>
        <label class="space-y-1"><span class="font-semibold">Normalization</span>
          <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={s.groupNorm}
            onChange={e => set({ groupNorm: (e.target as HTMLSelectElement).value as typeof s.groupNorm })}>
            <option value="none">None (target net)</option><option value="control-band">Loading-control band</option><option value="total-lane">Total lane protein</option>
          </select></label>
        {s.groupNorm === 'control-band' && (
          <label class="space-y-1"><span class="font-semibold">Loading-control band</span>
            <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={idOf(s.groupControl) || (s.groupControl ? '__stored' : '')}
              onChange={e => { const p = pick((e.target as HTMLSelectElement).value); if (p !== undefined) set({ groupControl: p }); }}>
              {bandOptions(s.groupControl)}
            </select></label>
        )}
        <label class="space-y-1"><span class="font-semibold">Control condition</span>
          <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={groupControlCondition}
            onChange={e => set({ groupControlCondition: (e.target as HTMLSelectElement).value })}>
            {conditions.map(c => <option value={c}>{c}</option>)}
          </select>
          {unknownControl && <span class="block text-amber-700 dark:text-amber-400">Control condition '{s.groupControlCondition}' no longer exists — pick one</span>}</label>
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
        <line x1={0} x2={Math.max(200, 90 * groupSummaries.length)} y1={yOf(0)} y2={yOf(0)} class="stroke-slate-300 dark:stroke-slate-700" />
        {groupSummaries.map((x, i) => {
          const cx = 45 + i * 90, y = yOf;
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
