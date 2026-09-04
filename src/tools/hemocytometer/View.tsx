import { useState, useMemo } from 'preact/hooks';
import { calculateHemocytometer, type HemocytometerSquare } from '@/core/cells/hemocytometer';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  dilutionFactor: number;
  totalCultureVolumeMl: number;
  targetSeedingCount: number;
  activeTab: 'tap' | 'table';
}

const DEFAULTS: State = {
  dilutionFactor: 2,
  totalCultureVolumeMl: 10,
  targetSeedingCount: 500_000,
  activeTab: 'tap',
};

const INITIAL_SQUARES: HemocytometerSquare[] = [
  { id: 1, name: 'Top-Left (1)', live: 48, dead: 2 },
  { id: 2, name: 'Top-Right (2)', live: 52, dead: 3 },
  { id: 3, name: 'Bottom-Left (3)', live: 46, dead: 1 },
  { id: 4, name: 'Bottom-Right (4)', live: 54, dead: 4 },
];

export default function HemocytometerView() {
  const [stateSig, shareUrl] = useUrlState<State>('hemocytometer', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [squares, setSquares] = useState<HemocytometerSquare[]>(INITIAL_SQUARES);
  const [selectedSquareId, setSelectedSquareId] = useState<number>(1);
  const [countingMode, setCountingMode] = useState<'live' | 'dead'>('live');

  const result = useMemo(() => {
    try {
      return calculateHemocytometer({
        squares,
        dilutionFactor: s.dilutionFactor,
        totalCultureVolumeMl: s.totalCultureVolumeMl,
        targetSeedingCount: s.targetSeedingCount,
      });
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [squares, s.dilutionFactor, s.totalCultureVolumeMl, s.targetSeedingCount]);

  function handleAddCount(squareId: number, kind: 'live' | 'dead', delta = 1) {
    setSquares(prev => prev.map(sq => {
      if (sq.id !== squareId) return sq;
      const current = kind === 'live' ? sq.live : sq.dead;
      const next = Math.max(0, current + delta);
      return kind === 'live' ? { ...sq, live: next } : { ...sq, dead: next };
    }));
  }

  function handleResetSquare(squareId: number) {
    setSquares(prev => prev.map(sq => sq.id === squareId ? { ...sq, live: 0, dead: 0 } : sq));
  }

  function handleResetAll() {
    setSquares(prev => prev.map(sq => ({ ...sq, live: 0, dead: 0 })));
  }

  function handleAddSquare() {
    const nextId = squares.length + 1;
    setSquares(prev => [...prev, { id: nextId, name: `Square (${nextId})`, live: 0, dead: 0 }]);
  }

  const copyText = 'error' in result ? result.error! : [
    `Viable Cell Density: ${result.liveCellsPerMl.toExponential(3)} cells/mL`,
    `Viability: ${result.viabilityPercent.toFixed(1)}% (${result.totalLiveCounted} live / ${result.totalDeadCounted} dead)`,
    `Total Culture Cells: ${result.totalViableInCulture ? result.totalViableInCulture.toExponential(3) : 'N/A'} cells`,
    `Seeding Volume (${s.targetSeedingCount.toLocaleString()} cells): ${result.seedingVolumeUl ? `${result.seedingVolumeUl.toFixed(1)} µL` : 'N/A'}`,
    '',
    scienceText(SCIENCE),
  ].join('\n');

  return (
    <ToolLayout
      icon="🔬"
      title="Hemocytometer & Cell Viability"
      blurb="Calculate cell concentration, Trypan Blue viability, and required seeding volumes."
      mobileDefaultTab="results"
      mobileResultSummary={
        'error' in result ? (
          <span class="text-rose-600 dark:text-rose-400 font-semibold">{result.error}</span>
        ) : (
          <span>Viable: <strong class="font-mono text-accent-700 dark:text-accent-300">{result.liveCellsPerMl >= 1e6 ? `${(result.liveCellsPerMl / 1e6).toFixed(2)} × 10⁶` : result.liveCellsPerMl.toLocaleString()}</strong> cells/mL · <strong>{result.viabilityPercent.toFixed(1)}%</strong> via</span>
        )
      }
      inputs={
        <div class="space-y-4">
          <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Counting Parameters
            </h3>
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Dilution Factor (e.g. 2 for 1:1 Trypan Blue)
              </label>
              <input
                type="number"
                min="1"
                step="0.1"
                value={s.dilutionFactor}
                onInput={(e) => set({ dilutionFactor: parseFloat((e.target as HTMLInputElement).value) || 1 })}
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Total Culture Volume (mL)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={s.totalCultureVolumeMl}
                onInput={(e) => set({ totalCultureVolumeMl: parseFloat((e.target as HTMLInputElement).value) || 0 })}
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Target Seeding Count (cells)
              </label>
              <input
                type="number"
                min="0"
                step="10000"
                value={s.targetSeedingCount}
                onInput={(e) => set({ targetSeedingCount: parseInt((e.target as HTMLInputElement).value) || 0 })}
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>

          {/* Counting Mode Toggle */}
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Tap Counting Tool
            </span>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCountingMode('live')}
                class={`p-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition ${countingMode === 'live' ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-300"></span>
                Live Cells
              </button>
              <button
                type="button"
                onClick={() => setCountingMode('dead')}
                class={`p-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition ${countingMode === 'dead' ? 'bg-rose-600 text-white border-rose-700 shadow-xs' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span class="w-2.5 h-2.5 rounded-full bg-rose-300"></span>
                Dead Cells (Blue)
              </button>
            </div>
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              onClick={handleAddSquare}
              class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              + Add Square
            </button>
            <button
              type="button"
              onClick={handleResetAll}
              class="px-3 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
            >
              Reset Counts
            </button>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Results Summary Tiles */}
          {'error' in result ? (
            <p role="alert" class="text-sm text-red-600 font-medium">{result.error}</p>
          ) : (
            <>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Viable Density</span>
                  <span data-testid="live-density" class="font-mono text-xl font-bold text-slate-900 dark:text-slate-100">
                    {result.liveCellsPerMl >= 1e6
                      ? `${(result.liveCellsPerMl / 1e6).toFixed(2)} × 10⁶`
                      : result.liveCellsPerMl.toLocaleString()}
                  </span>
                  <span class="text-[11px] text-slate-400 block">cells / mL</span>
                </div>

                <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Viability</span>
                  <span data-testid="viability" class={`font-mono text-xl font-bold ${result.viabilityPercent >= 90 ? 'text-emerald-600 dark:text-emerald-400' : result.viabilityPercent >= 75 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {result.viabilityPercent.toFixed(1)}%
                  </span>
                  <span class="text-[11px] text-slate-400 block">
                    {result.totalLiveCounted} live / {result.totalDeadCounted} dead
                  </span>
                </div>

                <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Total in Culture</span>
                  <span class="font-mono text-xl font-bold text-slate-900 dark:text-slate-100">
                    {result.totalViableInCulture ? (
                      result.totalViableInCulture >= 1e6
                        ? `${(result.totalViableInCulture / 1e6).toFixed(2)} × 10⁶`
                        : result.totalViableInCulture.toLocaleString()
                    ) : '—'}
                  </span>
                  <span class="text-[11px] text-slate-400 block">cells total</span>
                </div>

                <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Seeding Volume</span>
                  <span class="font-mono text-xl font-bold text-accent-600 dark:text-accent-400">
                    {result.seedingVolumeUl !== undefined ? (
                      result.seedingVolumeUl >= 1000
                        ? `${(result.seedingVolumeUl / 1000).toFixed(2)} mL`
                        : `${result.seedingVolumeUl.toFixed(1)} µL`
                    ) : '—'}
                  </span>
                  <span class="text-[11px] text-slate-400 block">for {s.targetSeedingCount.toLocaleString()} cells</span>
                </div>
              </div>

              {/* Interactive Hemocytometer Counting Grid */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Hemocytometer Squares ({squares.length} squares)
                  </h3>
                  <span class="text-xs text-slate-400">
                    Active mode: <strong class={countingMode === 'live' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{countingMode.toUpperCase()}</strong>
                  </span>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {squares.map((sq) => {
                    const isSelected = selectedSquareId === sq.id;
                    const sqViability = sq.live + sq.dead > 0 ? (sq.live / (sq.live + sq.dead)) * 100 : 100;
                    return (
                      <div
                        key={sq.id}
                        onClick={() => setSelectedSquareId(sq.id)}
                        class={`rounded-xl border p-3 cursor-pointer transition ${isSelected ? 'border-accent-500 bg-accent-50/20 dark:border-accent-600 dark:bg-accent-950/20 shadow-xs' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                      >
                        <div class="flex items-center justify-between mb-2">
                          <strong class="text-xs text-slate-900 dark:text-slate-100">{sq.name}</strong>
                          <span class="text-[11px] mono text-slate-500">{sqViability.toFixed(0)}% via</span>
                        </div>

                        <div class="grid grid-cols-2 gap-2 mb-2">
                          <div class="bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center">
                            <span class="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold block uppercase">Live</span>
                            <span class="font-mono text-lg font-bold text-emerald-800 dark:text-emerald-200">{sq.live}</span>
                          </div>
                          <div class="bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg border border-rose-200 dark:border-rose-800 text-center">
                            <span class="text-[10px] text-rose-700 dark:text-rose-400 font-semibold block uppercase">Dead</span>
                            <span class="font-mono text-lg font-bold text-rose-800 dark:text-rose-200">{sq.dead}</span>
                          </div>
                        </div>

                        <div class="flex items-center gap-1.5 pt-1">
                          <div class="flex-1 flex gap-1">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleAddCount(sq.id, 'live', 1); }}
                              class="flex-1 min-h-[38px] bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg font-bold text-xs transition flex items-center justify-center shadow-xs"
                            >
                              + Live
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleAddCount(sq.id, 'live', -1); }}
                              disabled={sq.live <= 0}
                              title="Decrement live"
                              class="px-2 min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 font-bold text-xs disabled:opacity-30 transition"
                            >
                              −
                            </button>
                          </div>
                          <div class="flex-1 flex gap-1">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleAddCount(sq.id, 'dead', 1); }}
                              class="flex-1 min-h-[38px] bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-lg font-bold text-xs transition flex items-center justify-center shadow-xs"
                            >
                              + Dead
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleAddCount(sq.id, 'dead', -1); }}
                              disabled={sq.dead <= 0}
                              title="Decrement dead"
                              class="px-2 min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 font-bold text-xs disabled:opacity-30 transition"
                            >
                              −
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleResetSquare(sq.id); }}
                            title="Reset this square"
                            class="px-2 min-h-[38px] text-slate-400 hover:text-rose-600 rounded-lg text-xs transition"
                          >
                            ↺
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
