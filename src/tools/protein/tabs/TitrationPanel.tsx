import { useMemo, useState } from 'preact/hooks';
import { LineChart } from '@/app/components/LineChart';
import { netCharge, titrationCurve, type Counts, type PKaScheme } from '@/core/protein';

const READOUT_PH = [5.0, 6.0, 7.0, 7.4, 8.0, 9.0];
const LABEL: Record<PKaScheme, string> = { bjellqvist: 'Bjellqvist', emboss: 'EMBOSS' };

const signed = (q: number) => `${q > 0 ? '+' : ''}${q.toFixed(2)}`;

/** Net charge vs pH titration curve with pI marker, optional second pKa scheme and a small readout table. */
export function TitrationPanel({ seq, counts, scheme }: { seq: string; counts: Counts; scheme: PKaScheme }) {
  const [overlay, setOverlay] = useState(false);
  const other: PKaScheme = scheme === 'bjellqvist' ? 'emboss' : 'bjellqvist';
  const main = useMemo(() => titrationCurve(counts, scheme, seq), [counts, scheme, seq]);
  const alt = useMemo(() => (overlay ? titrationCurve(counts, other, seq) : null), [overlay, counts, other, seq]);

  const series = [{ name: LABEL[scheme], x: main.pH, y: main.charge }];
  if (alt) series.push({ name: `${LABEL[other]} (overlay)`, x: alt.pH, y: alt.charge, dashed: true } as (typeof series)[number]);

  return (
    <details class="rounded-xl border border-slate-200 p-4 dark:border-slate-800" data-testid="titration-panel">
      <summary class="cursor-pointer font-bold text-sm text-slate-900 dark:text-slate-100 mb-3 select-none flex items-center justify-between">
        <span>Net charge vs pH (titration curve)</span>
        <span class="text-xs font-normal text-slate-500 dark:text-slate-400">Click to expand</span>
      </summary>
      <div class="space-y-3">
        <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={overlay} onChange={e => setOverlay((e.target as HTMLInputElement).checked)} aria-label={`Overlay ${LABEL[other]} pKa scheme`} />
          Overlay {LABEL[other]} pKa scheme
        </label>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800 bg-white dark:bg-slate-900">
          <LineChart
            title={`Net charge vs pH (${LABEL[scheme]}), pI ${main.pI.toFixed(2)}`}
            xLabel="pH"
            yLabel="Net charge / e"
            xDomain={[0, 14]}
            hLines={[{ y: 0 }]}
            vLines={[{ x: main.pI, label: `pI ${main.pI.toFixed(2)}` }]}
            series={series}
            exportName="protein-titration"
          />
        </div>
        <table class="w-full text-sm">
          <caption class="mb-1 text-left text-xs text-slate-500 dark:text-slate-400">Net charge (e) at selected pH, {LABEL[scheme]} pKa set</caption>
          <thead>
            <tr class="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th scope="col" class="py-1 font-medium">pH</th>
              <th scope="col" class="py-1 text-right font-medium">{LABEL[scheme]}</th>
              {alt && <th scope="col" class="py-1 text-right font-medium">{LABEL[other]}</th>}
            </tr>
          </thead>
          <tbody>
            {READOUT_PH.map(p => (
              <tr key={p} class="border-t border-slate-100 dark:border-slate-800">
                <th scope="row" class="mono py-1 text-left font-normal">{p.toFixed(1)}</th>
                <td class="mono py-1 text-right">{signed(netCharge(counts, p, scheme, seq))}</td>
                {alt && <td class="mono py-1 text-right">{signed(netCharge(counts, p, other, seq))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Net charge is a calculated sum over free ionisable groups, not a measure of binding behaviour: it ignores the local environment, buried or
          interacting residues, modifications and metal or ligand binding, so ion-exchange retention and binding can differ from what the sign suggests.
        </p>
      </div>
    </details>
  );
}
