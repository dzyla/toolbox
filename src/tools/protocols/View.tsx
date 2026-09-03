import { useState, useMemo } from 'preact/hooks';
import {
  type Protocol,
  BUNDLED_PROTOCOLS,
  parseMarkdownProtocol,
} from '@/core/protocols';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  protocolId: string;
}

const DEFAULTS: State = {
  protocolId: 'miniprep',
};

export default function ProtocolsView() {
  const [stateSig, shareUrl] = useUrlState<State>('protocols', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [activeProtocol, setActiveProtocol] = useState<Protocol>(() => BUNDLED_PROTOCOLS[0]!);
  const [customMdInput, setCustomMdInput] = useState('');
  const [activeTimerStepId, setActiveTimerStepId] = useState<string | null>(null);
  const [activeTimerSeconds, setActiveTimerSeconds] = useState<number>(0);

  function handleSelectProtocol(id: string) {
    set({ protocolId: id });
    const p = BUNDLED_PROTOCOLS.find(item => item.id === id);
    if (p) {
      // Clone so user can toggle steps
      setActiveProtocol(JSON.parse(JSON.stringify(p)));
    }
  }

  function handleToggleStep(stepId: string) {
    setActiveProtocol(prev => ({
      ...prev,
      steps: prev.steps.map(step => step.id === stepId ? { ...step, completed: !step.completed } : step),
    }));
  }

  function handleResetSteps() {
    setActiveProtocol(prev => ({
      ...prev,
      steps: prev.steps.map(step => ({ ...step, completed: false })),
    }));
  }

  function handleApplyCustomMd() {
    if (!customMdInput.trim()) return;
    const p = parseMarkdownProtocol(customMdInput);
    if (p.steps.length > 0) {
      setActiveProtocol(p);
      set({ protocolId: 'custom' });
    }
  }

  function handleStartStepTimer(stepId: string, mins: number) {
    setActiveTimerStepId(stepId);
    setActiveTimerSeconds(Math.round(mins * 60));
  }

  const completedCount = useMemo(() => {
    return activeProtocol.steps.filter(s => s.completed).length;
  }, [activeProtocol]);

  const totalSteps = activeProtocol.steps.length;
  const progressPct = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  const copyText = [
    `Protocol: ${activeProtocol.title}`,
    `Progress: ${completedCount} / ${totalSteps} steps completed (${progressPct.toFixed(0)}%)`,
    ...activeProtocol.steps.map(st => `  [${st.completed ? 'x' : ' '}] ${st.text}`),
    '',
    scienceText(SCIENCE),
  ].join('\n');

  return (
    <ToolLayout
      icon="📋"
      title="Lab Protocols & SOPs"
      blurb="Step-by-step molecular biology checklists with embedded incubation timers and custom markdown import."
      wide={true}
      inputs={
        <div class="space-y-4">
          {/* Protocol Picker */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Select Standard Protocol
            </label>
            <select
              value={s.protocolId}
              onChange={(e) => handleSelectProtocol((e.target as HTMLSelectElement).value)}
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 font-medium"
            >
              {BUNDLED_PROTOCOLS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.steps.length} steps)
                </option>
              ))}
              <option value="custom">Custom Markdown Protocol</option>
            </select>
          </div>

          {/* Custom Markdown Disclosure */}
          <details open={s.protocolId === 'custom'} class="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50 text-xs space-y-2">
            <summary class="cursor-pointer font-semibold text-slate-700 dark:text-slate-300 select-none">
              Import Custom Markdown Protocol
            </summary>
            <textarea
              rows={5}
              placeholder={`# Protocol Title\n- [ ] Step 1\n- [ ] Step 2: Incubate [timer: 15 min]`}
              value={customMdInput}
              onInput={(e) => setCustomMdInput((e.target as HTMLTextAreaElement).value)}
              class="w-full p-2 mono text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-950 resize-y"
            />
            <button
              type="button"
              onClick={handleApplyCustomMd}
              class="w-full py-1.5 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg transition"
            >
              Parse & Load Protocol
            </button>
          </details>

          {/* Reagents & Materials Checklist */}
          {activeProtocol.materials && activeProtocol.materials.length > 0 && (
            <div class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 space-y-2">
              <h4 class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Required Reagents & Materials
              </h4>
              <ul class="text-xs space-y-1 text-slate-600 dark:text-slate-400">
                {activeProtocol.materials.map((m, idx) => (
                  <li key={idx} class="flex items-start gap-1.5">
                    <span class="text-slate-400">•</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={handleResetSteps}
            class="w-full py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
          >
            Reset All Checkboxes
          </button>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Progress Header */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {activeProtocol.title}
                </h2>
                <p class="text-xs text-slate-500 mt-0.5">{activeProtocol.description}</p>
              </div>
              <div class="text-right">
                <span data-testid="progress-text" class="font-mono text-sm font-bold text-accent-600 dark:text-accent-400">
                  {completedCount} / {totalSteps} completed ({progressPct.toFixed(0)}%)
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                class="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Active Step Timer Notification if running */}
          {activeTimerStepId && (
            <div class="rounded-xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/40 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-lg">⏱️</span>
                <div>
                  <strong class="text-xs text-emerald-950 dark:text-emerald-200 block">Active Incubation Timer</strong>
                  <span class="text-[11px] text-emerald-800 dark:text-emerald-400">
                    Step timer running: {Math.floor(activeTimerSeconds / 60)}m {activeTimerSeconds % 60}s remaining
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTimerStepId(null)}
                class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Step-by-Step Interactive Checklist */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100 mb-2">
              Procedure Steps
            </h3>

            <div class="space-y-2">
              {activeProtocol.steps.map((step, idx) => (
                <div
                  key={step.id}
                  onClick={() => handleToggleStep(step.id)}
                  class={`p-3 rounded-xl border transition flex items-start gap-3 cursor-pointer ${step.completed ? 'bg-slate-50/60 border-slate-200 dark:bg-slate-950/40 dark:border-slate-800 opacity-60' : step.critical ? 'border-amber-300 bg-amber-50/20 dark:border-amber-800 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                  <input
                    type="checkbox"
                    checked={step.completed}
                    onChange={() => handleToggleStep(step.id)}
                    class="mt-1 w-4 h-4 rounded text-accent-600 accent-accent-600 cursor-pointer shrink-0"
                  />
                  <div class="flex-1 space-y-1">
                    <div class="flex items-baseline gap-2">
                      <strong class="font-mono text-xs text-slate-400">Step {idx + 1}</strong>
                      {step.critical && (
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          ⚠️ CRITICAL
                        </span>
                      )}
                    </div>
                    <p class={`text-xs leading-relaxed ${step.completed ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                      {step.text}
                    </p>

                    {step.timerMinutes && (
                      <div class="pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartStepTimer(step.id, step.timerMinutes!);
                          }}
                          class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-accent-50 text-accent-700 hover:bg-accent-100 dark:bg-accent-950 dark:text-accent-300 border border-accent-200 dark:border-accent-800 transition"
                        >
                          <span>⏱️</span>
                          <span>Start Timer ({step.timerMinutes} min)</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
