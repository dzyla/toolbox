import { useState, useMemo, useEffect } from 'preact/hooks';
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

const AI_PROMPT_TEMPLATE = `Please convert the attached experimental protocol, SOP, or methods text into the following structured Markdown format:

# [Protocol Title]

## Materials
- [Reagent or equipment item 1]
- [Reagent or equipment item 2]

## Procedure
- [ ] 1. Resuspend pellet in 250 µL Buffer P1 [timer: 2 min]
- [ ] 2. Add 250 µL Buffer P2 and invert 4-6 times to mix. CRITICAL: Do not vortex
- [ ] 3. Centrifuge at 13,000 rpm at room temperature [timer: 10 min]

Rules:
1. Every procedural step MUST begin with "- [ ]" and describe a single atomic action starting with a verb.
2. If a step involves incubation, centrifugation, shaking, or waiting, append "[timer: X min]" (e.g. [timer: 15 min]).
3. Use "CRITICAL:" for steps requiring special care, temperature limits, or warnings.
4. Output ONLY the markdown text, with no extra conversational commentary.`;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function playAlarmChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174.66, now + 0.15);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.8);
  } catch {
    // blocked or unavailable
  }
}

function notifyStepComplete(stepText: string) {
  playAlarmChime();
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([300, 150, 300, 150, 500]);
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('⏱️ Protocol Timer Complete!', {
        body: stepText,
        icon: '/favicon.ico',
      });
    } catch {
      // ignore
    }
  }
}

export default function ProtocolsView() {
  const [stateSig, shareUrl] = useUrlState<State>('protocols', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [activeProtocol, setActiveProtocol] = useState<Protocol>(() => BUNDLED_PROTOCOLS[0]!);
  const [customMdInput, setCustomMdInput] = useState('');
  const [activeTimerStepId, setActiveTimerStepId] = useState<string | null>(null);
  const [timerTotalSeconds, setTimerTotalSeconds] = useState<number>(0);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number>(0);
  const [timerIsRunning, setTimerIsRunning] = useState<boolean>(false);
  const [promptCopied, setPromptCopied] = useState(false);

  // Active step countdown interval ticker
  useEffect(() => {
    if (!activeTimerStepId || !timerIsRunning) return;

    const interval = window.setInterval(() => {
      setTimerRemainingSeconds(prev => {
        if (prev <= 1) {
          const finishedStep = activeProtocol.steps.find(st => st.id === activeTimerStepId);
          notifyStepComplete(finishedStep?.text || 'Incubation complete!');
          setTimerIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTimerStepId, timerIsRunning, activeProtocol.steps]);

  function handleCopyAiPrompt() {
    navigator.clipboard?.writeText?.(AI_PROMPT_TEMPLATE);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  function handleSelectProtocol(id: string) {
    set({ protocolId: id });
    const p = BUNDLED_PROTOCOLS.find(item => item.id === id);
    if (p) {
      setActiveProtocol(JSON.parse(JSON.stringify(p)));
      setActiveTimerStepId(null);
      setTimerIsRunning(false);
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
      setActiveTimerStepId(null);
      setTimerIsRunning(false);
    }
  }

  function handleStartStepTimer(stepId: string, mins: number) {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch {
        // ignore
      }
    }
    const total = Math.max(1, Math.round(mins * 60));
    setActiveTimerStepId(stepId);
    setTimerTotalSeconds(total);
    setTimerRemainingSeconds(total);
    setTimerIsRunning(true);
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

          {/* AI Prompt Helper Card */}
          <details class="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30 text-xs space-y-2">
            <summary class="cursor-pointer font-semibold text-indigo-900 dark:text-indigo-200 select-none flex items-center justify-between">
              <span class="flex items-center gap-1.5">
                <span>🤖</span>
                <span>Convert Protocol with AI (LLM Prompt)</span>
              </span>
              <span class="text-[10px] uppercase font-bold text-indigo-500">ChatGPT / Claude</span>
            </summary>
            <p class="text-[11px] text-indigo-800/80 dark:text-indigo-300">
              Paste this prompt into ChatGPT, Claude, or Gemini alongside any PDF, SOP, or paper method section to generate compatible checklist markdown:
            </p>
            <pre class="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-indigo-200 dark:border-indigo-900 font-mono text-[10px] leading-relaxed overflow-x-auto text-slate-700 dark:text-slate-300 whitespace-pre-wrap select-all">
              {AI_PROMPT_TEMPLATE}
            </pre>
            <button
              type="button"
              onClick={handleCopyAiPrompt}
              class="w-full py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-sm flex items-center justify-center gap-1.5"
            >
              <span>{promptCopied ? '✓' : '📋'}</span>
              <span>{promptCopied ? 'Copied Prompt to Clipboard!' : 'Copy AI Prompt Template'}</span>
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

          {/* Active Step Timer Notification with Visual Progress */}
          {activeTimerStepId && (
            <div class={`rounded-xl border p-4 shadow-sm transition ${timerRemainingSeconds === 0 ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 ring-2 ring-emerald-400' : 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40'}`}>
              <div class="flex items-center justify-between gap-3 mb-2.5">
                <div class="flex items-center gap-2.5">
                  <span class="text-xl animate-pulse">{timerRemainingSeconds === 0 ? '🔔' : '⏱️'}</span>
                  <div>
                    <strong class="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                      {timerRemainingSeconds === 0 ? 'Incubation Timer Finished!' : 'Active Step Timer'}
                    </strong>
                    <span class="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                      {formatTime(timerRemainingSeconds)} remaining of {formatTime(timerTotalSeconds)} ({Math.min(100, Math.round(((timerTotalSeconds - timerRemainingSeconds) / timerTotalSeconds) * 100))}% elapsed)
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-1.5">
                  {timerRemainingSeconds > 0 && (
                    <button
                      type="button"
                      onClick={() => setTimerIsRunning(r => !r)}
                      class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                      {timerIsRunning ? '⏸ Pause' : '▶ Resume'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTimerStepId(null);
                      setTimerIsRunning(false);
                    }}
                    class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div class="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  class={`h-full rounded-full transition-all duration-1000 ${timerRemainingSeconds === 0 ? 'bg-emerald-500' : 'bg-sky-500'}`}
                  style={{ width: `${Math.min(100, ((timerTotalSeconds - timerRemainingSeconds) / timerTotalSeconds) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Step-by-Step Interactive Checklist */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100 mb-2">
              Procedure Steps
            </h3>

            <div class="space-y-2">
              {activeProtocol.steps.map((step, idx) => {
                const isStepTimerActive = activeTimerStepId === step.id;
                const isFinished = isStepTimerActive && timerRemainingSeconds === 0;

                return (
                  <div
                    key={step.id}
                    onClick={() => handleToggleStep(step.id)}
                    class={`p-3 rounded-xl border transition flex items-start gap-3 cursor-pointer ${
                      step.completed
                        ? 'bg-slate-50/60 border-slate-200 dark:bg-slate-950/40 dark:border-slate-800 opacity-60'
                        : step.critical
                        ? 'border-rose-500 bg-rose-50/50 dark:border-rose-600 dark:bg-rose-950/30'
                        : step.warning
                        ? 'border-amber-400 bg-amber-50/50 dark:border-amber-500 dark:bg-amber-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
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
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white shadow-2xs">
                            🛑 CRITICAL
                          </span>
                        )}
                        {step.warning && (
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-amber-950 shadow-2xs">
                            ⚠️ WARNING
                          </span>
                        )}
                      </div>
                      <p class={`text-xs leading-relaxed ${step.completed ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                        {step.text}
                      </p>

                      {step.timerMinutes && (
                        <div class="pt-1">
                          {isStepTimerActive ? (
                            <div class="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                              <div class="flex items-center justify-between text-xs font-mono">
                                <span class="font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                                  <span>{isFinished ? '🔔 Finished!' : '⏱️ Running:'}</span>
                                  <span>{formatTime(timerRemainingSeconds)}</span>
                                </span>
                                <div class="space-x-1">
                                  {timerRemainingSeconds > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setTimerIsRunning(r => !r)}
                                      class="px-2 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
                                    >
                                      {timerIsRunning ? 'Pause' : 'Resume'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveTimerStepId(null);
                                      setTimerIsRunning(false);
                                    }}
                                    class="px-2 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              </div>
                              <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  class={`h-full rounded-full transition-all duration-1000 ${isFinished ? 'bg-emerald-500' : 'bg-sky-500'}`}
                                  style={{ width: `${Math.min(100, ((timerTotalSeconds - timerRemainingSeconds) / timerTotalSeconds) * 100)}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartStepTimer(step.id, step.timerMinutes!);
                              }}
                              class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-accent-50 text-accent-700 hover:bg-accent-100 dark:bg-accent-950 dark:text-accent-300 border border-accent-200 dark:border-accent-800 transition shadow-2xs"
                            >
                              <span>⏱️</span>
                              <span>Start Timer ({step.timerMinutes} min)</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
