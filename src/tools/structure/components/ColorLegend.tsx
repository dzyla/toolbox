import type { BFactorStats, PlddtInfo } from '@/core/structure';
import { BFACTOR_COLORS, PLDDT_BANDS, hex } from '../colour-scales';
import type { Coloring } from '../MolstarViewer';

const box = 'pointer-events-none absolute bottom-2 left-2 z-10 rounded-md bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-100 shadow';
const fmt = (n: number) => (Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(1));

/** Key for the data colourings, drawn over the bottom-left corner of the 3D view. */
export function ColorLegend({ coloring, bStats, plddt }: { coloring: Coloring | null; bStats: BFactorStats | null; plddt: PlddtInfo | null }) {
  if (coloring === 'plddt' && plddt) {
    return (
      <div class={box} data-testid="colour-legend">
        <div class="mb-0.5 font-semibold">pLDDT</div>
        <ul class="space-y-0.5">
          {PLDDT_BANDS.map(b => (
            <li key={b.label} class="flex items-center gap-1.5">
              <span aria-hidden="true" class="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: hex(b.color) }} />{b.label}
            </li>
          ))}
        </ul>
        {plddt.scale === 100 && <div class="mt-0.5 text-slate-300">File stores pLDDT / 100</div>}
      </div>
    );
  }
  if (coloring === 'uncertainty' && bStats) {
    return (
      <div class={box} data-testid="colour-legend">
        <div class="mb-0.5 font-semibold">B-factor (Å²)</div>
        <div aria-hidden="true" class="h-2 w-32 rounded-sm" style={{ background: `linear-gradient(to right, ${BFACTOR_COLORS.map(hex).join(', ')})` }} />
        <div class="flex w-32 justify-between tabular-nums"><span>{`≤ ${fmt(bStats.low)}`}</span><span>{`≥ ${fmt(bStats.high)}`}</span></div>
        <div class="text-slate-300">{`range ${fmt(bStats.min)}–${fmt(bStats.max)}`}</div>
      </div>
    );
  }
  return null;
}
