import { useState, useEffect } from 'preact/hooks';
import { type TallyCounter } from '@/core/counting';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  stepSize: number;
}

const DEFAULTS: State = {
  stepSize: 1,
};

const INITIAL_COUNTERS: TallyCounter[] = [
  { id: 'cnt-1', name: 'Phenotype A (Wildtype)', count: 24, step: 1, goal: 100, color: '#3b82f6' },
  { id: 'cnt-2', name: 'Phenotype B (Mutant)', count: 18, step: 1, goal: 100, color: '#ef4444' },
  { id: 'cnt-3', name: 'Uncertain / Control', count: 5, step: 1, goal: 50, color: '#10b981' },
];

export default function TallyView() {
  const [stateSig, shareUrl] = useUrlState<State>('tally', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [counters, setCounters] = useState<TallyCounter[]>(INITIAL_COUNTERS);
  const [newCounterName, setNewCounterName] = useState('');

  const totalCount = counters.reduce((acc, c) => acc + c.count, 0);

  function handleIncrement(id: string, delta: number) {
    setCounters(prev => prev.map(c => {
      if (c.id !== id) return c;
      return { ...c, count: Math.max(0, c.count + delta) };
    }));
  }

  function handleReset(id: string) {
    setCounters(prev => prev.map(c => c.id === id ? { ...c, count: 0 } : c));
  }

  function handleResetAll() {
    setCounters(prev => prev.map(c => ({ ...c, count: 0 })));
  }

  function handleAddCounter() {
    const name = newCounterName.trim() || `Counter ${counters.length + 1}`;
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    const color = colors[counters.length % colors.length]!;
    setCounters(prev => [...prev, {
      id: `cnt-${Date.now()}`,
      name,
      count: 0,
      step: s.stepSize,
      color,
    }]);
    setNewCounterName('');
  }

  function handleDeleteCounter(id: string) {
    if (counters.length <= 1) return;
    setCounters(prev => prev.filter(c => c.id !== id));
  }

  // Keyboard support: pressing 1-9 increments counter 1-9
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1 && num <= counters.length) {
        const counter = counters[num - 1];
        if (counter) handleIncrement(counter.id, s.stepSize);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [counters, s.stepSize]);

  function handleExportCsv() {
    const rows = [
      ['ID', 'Name', 'Count', 'Percentage', 'Goal'],
      ...counters.map(c => [
        c.id,
        `"${c.name.replace(/"/g, '""')}"`,
        c.count,
        totalCount > 0 ? `${((c.count / totalCount) * 100).toFixed(1)}%` : '0%',
        c.goal || 'None',
      ]),
      ['Total', 'All Categories', totalCount, '100%', ''],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tally_counts_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const copyText = [
    `Tally Summary (Total: ${totalCount}):`,
    ...counters.map(c => `  - ${c.name}: ${c.count} (${totalCount > 0 ? ((c.count / totalCount) * 100).toFixed(1) : 0}%)`),
    '',
    scienceText(SCIENCE),
  ].join('\n');

  return (
    <ToolLayout
      icon="🔢"
      title="Tally Counter"
      blurb="Multiple named counters with goals, frequency ratios, keyboard shortcuts, and export."
      mobileDefaultTab="results"
      mobileResultSummary={
        <span>Total: <strong class="font-mono text-accent-700 dark:text-accent-300">{totalCount.toLocaleString()}</strong> ({counters.length} counters)</span>
      }
      inputs={
        <div class="space-y-4">
          <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Counter Settings
            </h3>
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Default Step Increment
              </label>
              <div class="flex gap-2">
                {[1, 5, 10].map(sz => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => set({ stepSize: sz })}
                    class={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${s.stepSize === sz ? 'bg-accent-600 text-white border-accent-600' : 'border-slate-300 dark:border-slate-700'}`}
                  >
                    +{sz}
                  </button>
                ))}
              </div>
            </div>

            <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Add New Counter
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Fluorescent Cells"
                  value={newCounterName}
                  onInput={(e) => setNewCounterName((e.target as HTMLInputElement).value)}
                  class="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={handleAddCounter}
                  class="px-3 py-1.5 text-xs font-semibold bg-accent-600 hover:bg-accent-700 text-white rounded-lg transition shrink-0"
                >
                  + Add
                </button>
              </div>
            </div>
          </div>

          <div class="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-xs space-y-1.5 text-slate-500">
            <span class="font-semibold text-slate-700 dark:text-slate-300 block">⌨️ Keyboard Shortcuts:</span>
            <p>Press <kbd class="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 font-mono text-[10px] border border-slate-300 dark:border-slate-600">1</kbd> through <kbd class="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 font-mono text-[10px] border border-slate-300 dark:border-slate-600">9</kbd> to rapidly tap individual counters without moving your mouse.</p>
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleResetAll}
              class="px-3 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
            >
              Reset All
            </button>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Total Banner */}
          <div class="flex items-center justify-between rounded-2xl bg-white p-4 border border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <span class="text-xs text-slate-500 block">Total Combined Count</span>
              <span data-testid="total-count" class="font-mono text-3xl font-bold text-slate-900 dark:text-slate-100">
                {totalCount.toLocaleString()}
              </span>
            </div>
            <div class="text-right">
              <span class="text-xs text-slate-400 block">{counters.length} active counters</span>
            </div>
          </div>

          {/* Proportional Share Bar */}
          {totalCount > 0 && (
            <div class="h-3 w-full rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
              {counters.map(c => {
                const pct = (c.count / totalCount) * 100;
                if (pct <= 0) return null;
                return (
                  <div
                    key={c.id}
                    style={{ width: `${pct}%`, backgroundColor: c.color }}
                    title={`${c.name}: ${c.count} (${pct.toFixed(1)}%)`}
                    class="h-full transition-all duration-300"
                  />
                );
              })}
            </div>
          )}

          {/* Counter Cards Grid */}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {counters.map((c, idx) => {
              const pct = totalCount > 0 ? (c.count / totalCount) * 100 : 0;
              return (
                <div
                  key={c.id}
                  class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <strong class="text-xs text-slate-900 dark:text-slate-100">{c.name}</strong>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-500 font-semibold">
                        Key [{idx + 1}]
                      </span>
                      {counters.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCounter(c.id)}
                          class="text-slate-300 hover:text-rose-500 text-xs px-1"
                          title="Remove counter"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Big Number & Percentage */}
                  <div class="flex items-baseline justify-between">
                    <span data-testid={`count-${idx}`} class="font-mono text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                      {c.count}
                    </span>
                    <span class="font-mono text-xs text-slate-500 font-semibold">
                      {pct.toFixed(1)}% of total
                    </span>
                  </div>

                  {/* Goal progress if specified */}
                  {c.goal && (
                    <div class="space-y-1">
                      <div class="flex justify-between text-[11px] text-slate-400">
                        <span>Goal: {c.goal}</span>
                        <span>{Math.min(100, Math.round((c.count / c.goal) * 100))}%</span>
                      </div>
                      <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-accent-600 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (c.count / c.goal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div class="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleIncrement(c.id, -s.stepSize)}
                      disabled={c.count <= 0}
                      class="px-4 min-h-[48px] rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-base hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 active:scale-95 transition"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => handleIncrement(c.id, s.stepSize)}
                      class="flex-1 min-h-[48px] rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-extrabold text-lg hover:bg-slate-800 dark:hover:bg-white shadow-xs active:scale-[0.98] transition flex items-center justify-center gap-1.5"
                    >
                      <span>+</span>
                      <span>{s.stepSize}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReset(c.id)}
                      class="px-3 min-h-[48px] text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                      title="Reset counter"
                    >
                      ↺
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
