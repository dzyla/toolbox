import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';

export interface SideTab { id: string; label: string; content: ComponentChildren }

/**
 * The tabbed panel beside the viewer. Every tab stays mounted (hidden when not shown), so its
 * inputs keep their state; the panel scrolls on its own, never the page.
 */
export function SidePanel({ tabs, active, onActive }: { tabs: SideTab[]; active: string; onActive(id: string): void }) {
  const list = useRef<HTMLDivElement>(null);
  const shown = tabs.some(t => t.id === active) ? active : tabs[0]?.id;
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex(t => t.id === shown);
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -tabs.length, End: tabs.length };
    const d = step[e.key];
    if (d === undefined || i < 0) return;
    e.preventDefault();
    const next = tabs[Math.max(0, Math.min(tabs.length - 1, i + d))]!;
    onActive(next.id);
    list.current?.querySelector<HTMLElement>(`#structure-tab-${next.id}`)?.focus();
  };
  return (
    <div class="flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200 dark:border-slate-700">
      <div ref={list} role="tablist" aria-label="Structure details" onKeyDown={onKeyDown}
        class="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 p-1.5 dark:border-slate-700">
        {tabs.map(t => (
          <button key={t.id} id={`structure-tab-${t.id}`} type="button" role="tab" aria-selected={t.id === shown}
            aria-controls={`structure-panel-${t.id}`} tabIndex={t.id === shown ? 0 : -1} onClick={() => onActive(t.id)}
            class={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-accent-500 ${t.id === shown
              ? 'bg-accent-600 text-white'
              : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map(t => (
        <div key={t.id} id={`structure-panel-${t.id}`} role="tabpanel" aria-labelledby={`structure-tab-${t.id}`}
          hidden={t.id !== shown} tabIndex={0} class="min-h-0 flex-1 overflow-y-auto p-3">
          {t.content}
        </div>
      ))}
    </div>
  );
}
