/* Horizontal bar chart of one population across samples (one bar per sample, in the sample's colour). */

export type ChartMetric = 'pctParent' | 'pctTotal' | 'count';
export const METRIC_LABEL: Record<ChartMetric, string> = { pctParent: '% of parent', pctTotal: '% of total', count: 'Events' };

export interface ChartRow { name: string; color: string; count: number; pctParent: number; pctTotal: number }

const W = 520, LABEL_W = 150, VALUE_W = 70, ROW = 26, TOP = 8, AXIS = 22;
const clip = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const metricText = (m: ChartMetric, v: number) => (!Number.isFinite(v) ? 'not evaluated' : m === 'count' ? v.toLocaleString() : `${v.toFixed(2)}%`);

export function SampleChart({ rows, metric, population }: { rows: ChartRow[]; metric: ChartMetric; population: string }) {
  const values = rows.map(r => r[metric]);
  const finite = values.filter(Number.isFinite);
  const max = metric === 'count' ? Math.max(1, ...finite) : Math.max(100, ...finite);
  const plotW = W - LABEL_W - VALUE_W;
  const h = TOP + rows.length * ROW + AXIS;
  const summary = rows.map((r, i) => `${r.name} ${metricText(metric, values[i]!)}`).join('; ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max);
  return (
    <svg
      viewBox={`0 0 ${W} ${h}`} role="img" class="block h-auto w-full max-w-xl"
      aria-label={`Bar chart of ${METRIC_LABEL[metric]} for ${population}, per sample: ${summary}.`}
    >
      {ticks.map(t => {
        const x = LABEL_W + (t / max) * plotW;
        return (
          <g>
            <line x1={x} x2={x} y1={TOP} y2={TOP + rows.length * ROW} class="stroke-slate-200 dark:stroke-slate-700" stroke-width="1" />
            <text x={x} y={h - 6} text-anchor="middle" font-size="10" class="fill-slate-600 dark:fill-slate-300">
              {metric === 'count' ? Math.round(t).toLocaleString() : `${+t.toFixed(0)}%`}
            </text>
          </g>
        );
      })}
      {rows.map((r, i) => {
        const v = values[i]!;
        const y = TOP + i * ROW;
        const bw = Number.isFinite(v) ? Math.max(v > 0 ? 2 : 0, (v / max) * plotW) : 0;
        return (
          <g>
            <title>{`${r.name}: ${metricText('pctParent', r.pctParent)} of parent, ${metricText('pctTotal', r.pctTotal)} of total, ${Number.isFinite(r.count) ? r.count.toLocaleString() : 'no'} events`}</title>
            <text x={LABEL_W - 8} y={y + ROW / 2} text-anchor="end" dominant-baseline="middle" font-size="11" class="fill-slate-700 dark:fill-slate-200">{clip(r.name)}</text>
            <rect x={LABEL_W} y={y + 4} width={bw} height={ROW - 8} rx="3" fill={r.color} />
            <text x={LABEL_W + bw + 6} y={y + ROW / 2} dominant-baseline="middle" font-size="11" class="fill-slate-700 dark:fill-slate-200">{metricText(metric, v)}</text>
          </g>
        );
      })}
    </svg>
  );
}
