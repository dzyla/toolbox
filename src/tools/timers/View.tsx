import { useState, useEffect, useRef } from 'preact/hooks';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface LabTimer {
  id: string;
  name: string;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  color: string;
}

interface State {
  mode: 'countdown' | 'stopwatch';
  quickMinutes: number;
}

const DEFAULTS: State = {
  mode: 'countdown',
  quickMinutes: 10,
};

const INITIAL_TIMERS: LabTimer[] = [
  { id: 't1', name: 'Primary Antibody Incubation', totalSeconds: 3600, remainingSeconds: 3600, isRunning: false, color: '#3b82f6' },
  { id: 't2', name: 'Centrifugation (Max Speed)', totalSeconds: 600, remainingSeconds: 600, isRunning: false, color: '#10b981' },
  { id: 't3', name: 'Alkaline Lysis (DO NOT EXCEED)', totalSeconds: 240, remainingSeconds: 240, isRunning: false, color: '#ef4444' },
];

function playBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  } catch {
    // AudioContext might be blocked until user gesture
  }
}

function notifyTimerComplete(timerName: string) {
  playBeep();
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([300, 150, 300, 150, 500]);
    } catch {}
  }
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('⏱️ Timer Complete!', {
        body: `Timer "${timerName}" has finished!`,
        icon: '/favicon.ico',
      });
    } catch {}
  }
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function TimersView() {
  const [stateSig, shareUrl] = useUrlState<State>('timers', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [timers, setTimers] = useState<LabTimer[]>(INITIAL_TIMERS);
  const [newTimerName, setNewTimerName] = useState('');
  const [newTimerMins, setNewTimerMins] = useState(15);

  // Stopwatch state
  const [stopwatchMs, setStopwatchMs] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const stopwatchRef = useRef<number | null>(null);

  // Countdown timer interval ticker
  useEffect(() => {
    const interval = window.setInterval(() => {
      setTimers(prev => prev.map(t => {
        if (!t.isRunning) return t;
        if (t.remainingSeconds <= 1) {
          notifyTimerComplete(t.name);
          return { ...t, remainingSeconds: 0, isRunning: false };
        }
        return { ...t, remainingSeconds: t.remainingSeconds - 1 };
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Stopwatch interval ticker
  useEffect(() => {
    if (isStopwatchRunning) {
      const start = performance.now() - stopwatchMs;
      stopwatchRef.current = window.setInterval(() => {
        setStopwatchMs(performance.now() - start);
      }, 50);
    } else if (stopwatchRef.current) {
      clearInterval(stopwatchRef.current);
    }
    return () => {
      if (stopwatchRef.current) clearInterval(stopwatchRef.current);
    };
  }, [isStopwatchRunning]);

  function handleToggleTimer(id: string) {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch {}
    }
    setTimers(prev => prev.map(t => t.id === id ? { ...t, isRunning: !t.isRunning } : t));
  }

  function handleResetTimer(id: string) {
    setTimers(prev => prev.map(t => t.id === id ? { ...t, remainingSeconds: t.totalSeconds, isRunning: false } : t));
  }

  function handleAddSeconds(id: string, secs: number) {
    setTimers(prev => prev.map(t => {
      if (t.id !== id) return t;
      const next = t.remainingSeconds + secs;
      return { ...t, remainingSeconds: next, totalSeconds: Math.max(t.totalSeconds, next) };
    }));
  }

  function handleAddTimer() {
    const name = newTimerName.trim() || `Timer ${timers.length + 1}`;
    const secs = Math.max(1, newTimerMins * 60);
    const colors = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4'];
    const color = colors[timers.length % colors.length]!;

    setTimers(prev => [...prev, {
      id: `timer-${Date.now()}`,
      name,
      totalSeconds: secs,
      remainingSeconds: secs,
      isRunning: false,
      color,
    }]);
    setNewTimerName('');
  }

  function handleDeleteTimer(id: string) {
    setTimers(prev => prev.filter(t => t.id !== id));
  }

  const copyText = [
    'Lab Timers Status:',
    ...timers.map(t => `  - ${t.name}: ${formatTime(t.remainingSeconds)} / ${formatTime(t.totalSeconds)} (${t.isRunning ? 'Running' : 'Stopped'})`),
    '',
    scienceText(SCIENCE),
  ].join('\n');

  return (
    <ToolLayout
      icon="⏱️"
      title="Lab Timers & Stopwatch"
      blurb="Simultaneous concurrent incubation countdowns, alarm alerts, and lab stopwatch."
      mobileDefaultTab="results"
      mobileResultSummary={
        <span>{timers.filter(t => t.isRunning).length} active · Next: <strong class="font-mono text-accent-700 dark:text-accent-300">{formatTime(Math.min(...timers.map(t => t.remainingSeconds)))}</strong></span>
      }
      inputs={
        <div class="space-y-4">
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => set({ mode: 'countdown' })}
              class={`flex-1 py-1.5 rounded-full text-xs font-semibold transition ${s.mode === 'countdown' ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
            >
              Countdown Timers
            </button>
            <button
              type="button"
              onClick={() => set({ mode: 'stopwatch' })}
              class={`flex-1 py-1.5 rounded-full text-xs font-semibold transition ${s.mode === 'stopwatch' ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
            >
              Stopwatch
            </button>
          </div>

          {s.mode === 'countdown' ? (
            <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Create New Timer
              </h3>
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Timer Label
                </label>
                <input
                  type="text"
                  placeholder="e.g. Blocking Step"
                  value={newTimerName}
                  onInput={(e) => setNewTimerName((e.target as HTMLInputElement).value)}
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={newTimerMins}
                  onInput={(e) => setNewTimerMins(parseFloat((e.target as HTMLInputElement).value) || 1)}
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div class="flex flex-wrap gap-1.5 pt-1">
                {[1, 2, 5, 10, 15, 30, 60].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setNewTimerMins(mins)}
                    class="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    {mins}m
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddTimer}
                class="w-full py-2 bg-accent-600 hover:bg-accent-700 text-white font-semibold text-xs rounded-lg transition"
              >
                + Add Timer
              </button>
            </div>
          ) : (
            <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 text-xs">
              <p class="text-slate-500">
                Precision millisecond lab stopwatch with split lap times.
              </p>
            </div>
          )}
        </div>
      }
      results={
        <div class="space-y-4">
          {s.mode === 'countdown' ? (
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {timers.map(t => {
                const progressPct = t.totalSeconds > 0
                  ? Math.max(0, Math.min(100, (t.remainingSeconds / t.totalSeconds) * 100))
                  : 0;
                const isComplete = t.remainingSeconds === 0;

                return (
                  <div
                    key={t.id}
                    class={`rounded-2xl border bg-white p-4 dark:bg-slate-900 space-y-3 transition ${isComplete ? 'border-rose-500 animate-pulse bg-rose-50/20' : 'border-slate-200 dark:border-slate-800'}`}
                  >
                    <div class="flex items-center justify-between">
                      <strong class="text-xs text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                        {t.name}
                      </strong>
                      <button
                        type="button"
                        onClick={() => handleDeleteTimer(t.id)}
                        class="text-slate-300 hover:text-rose-500 text-xs px-1"
                        title="Delete timer"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Big Digital Display */}
                    <div class="flex items-baseline justify-between">
                      <span data-testid={`timer-display-${t.id}`} class={`font-mono text-3xl font-extrabold tracking-wider ${isComplete ? 'text-rose-600' : 'text-slate-900 dark:text-slate-100'}`}>
                        {formatTime(t.remainingSeconds)}
                      </span>
                      <span class="text-xs font-mono text-slate-400">
                        / {formatTime(t.totalSeconds)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        class="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${progressPct}%`,
                          backgroundColor: isComplete ? '#ef4444' : t.color,
                        }}
                      />
                    </div>

                    {/* Controls */}
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleTimer(t.id)}
                        class={`flex-1 min-h-[44px] rounded-xl text-xs font-bold text-white transition active:scale-95 shadow-xs ${t.isRunning ? 'bg-amber-600 hover:bg-amber-700' : 'bg-accent-600 hover:bg-accent-700'}`}
                      >
                        {t.isRunning ? 'Pause' : isComplete ? 'Restart' : 'Start'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddSeconds(t.id, 60)}
                        class="px-3 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition"
                      >
                        +1m
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddSeconds(t.id, 300)}
                        class="px-3 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition"
                      >
                        +5m
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetTimer(t.id)}
                        class="px-2.5 min-h-[44px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs transition"
                        title="Reset"
                      >
                        ↺
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Stopwatch View */
            <div class="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 text-center space-y-6">
              <div class="font-mono text-5xl sm:text-6xl font-extrabold text-slate-900 dark:text-slate-100 tracking-wider">
                {formatTime(Math.floor(stopwatchMs / 1000))}.
                <span class="text-3xl text-slate-400">
                  {Math.floor((stopwatchMs % 1000) / 10).toString().padStart(2, '0')}
                </span>
              </div>

              <div class="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsStopwatchRunning(!isStopwatchRunning)}
                  class={`px-6 py-2.5 rounded-xl font-bold text-sm text-white shadow-xs transition ${isStopwatchRunning ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {isStopwatchRunning ? 'Pause' : 'Start'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isStopwatchRunning) setLaps(prev => [...prev, stopwatchMs]);
                    else { setStopwatchMs(0); setLaps([]); }
                  }}
                  class="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm transition"
                >
                  {isStopwatchRunning ? 'Lap' : 'Reset'}
                </button>
              </div>

              {laps.length > 0 && (
                <div class="max-w-md mx-auto pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-left">
                  <h4 class="font-bold text-slate-500 uppercase tracking-wider mb-2">Recorded Laps</h4>
                  <div class="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {laps.map((lap, i) => (
                      <div key={i} class="py-1.5 flex justify-between font-mono">
                        <span class="text-slate-400">Lap #{i + 1}</span>
                        <span class="font-semibold text-slate-800 dark:text-slate-200">
                          {formatTime(Math.floor(lap / 1000))}.{(Math.floor((lap % 1000) / 10)).toString().padStart(2, '0')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
