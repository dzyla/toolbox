import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export function ToolLayout({
  icon,
  title,
  blurb,
  inputs,
  results,
  actions,
  science,
  wide,
  embedded,
  fullWidthResults,
  mobileDefaultTab = 'inputs',
  mobileResultSummary,
}: {
  icon: string;
  title: string;
  blurb: string;
  inputs: ComponentChildren;
  results: ComponentChildren;
  actions: ComponentChildren;
  science: ComponentChildren;
  wide?: boolean;
  embedded?: boolean;
  fullWidthResults?: boolean;
  mobileDefaultTab?: 'inputs' | 'results' | 'stacked';
  mobileResultSummary?: ComponentChildren;
}) {
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  const [mobileTab, setMobileTab] = useState<'inputs' | 'results' | 'stacked'>(
    isTest ? 'stacked' : mobileDefaultTab
  );

  return (
    <section class={embedded ? 'w-full' : `mx-auto p-3 sm:p-4 ${wide ? 'max-w-[92rem]' : 'max-w-6xl'}`}>
      {!embedded && (
        <header class="mb-3 sm:mb-4">
          <h1 class="text-xl sm:text-2xl font-bold">{icon} {title}</h1>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">{blurb}</p>
        </header>
      )}

      {/* Mobile Tab Bar */}
      <div class="lg:hidden mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2.5 dark:border-slate-800">
        <div class="flex min-w-0 flex-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 text-xs font-semibold shadow-2xs">
          <button
            type="button"
            aria-pressed={mobileTab === 'inputs'}
            onClick={() => setMobileTab('inputs')}
            class={`flex-1 min-w-0 rounded-lg px-2 py-1.5 transition whitespace-nowrap ${mobileTab === 'inputs' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
          >
            ✏️ Inputs
          </button>
          <button
            type="button"
            aria-pressed={mobileTab === 'results'}
            onClick={() => setMobileTab('results')}
            class={`flex-1 min-w-0 rounded-lg px-2 py-1.5 transition whitespace-nowrap ${mobileTab === 'results' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
          >
            📊 Results
          </button>
          <button
            type="button"
            aria-pressed={mobileTab === 'stacked'}
            onClick={() => setMobileTab('stacked')}
            class={`flex-1 min-w-0 rounded-lg px-2 py-1.5 transition whitespace-nowrap ${mobileTab === 'stacked' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
          >
            ↕️ Both
          </button>
        </div>
        {mobileResultSummary && mobileTab === 'inputs' && (
          <button
            type="button"
            onClick={() => setMobileTab('results')}
            class="text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline shrink-0"
          >
            Results ➔
          </button>
        )}
      </div>

      <div class={fullWidthResults ? 'space-y-4' : `grid gap-6 ${wide ? 'lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]'}`}>
        {!fullWidthResults && (
          <div class={`space-y-4 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 dark:border-slate-700 dark:bg-slate-900 self-start lg:sticky lg:top-16 max-h-[calc(100vh-5rem)] overflow-y-auto lg:block ${mobileTab === 'results' ? 'hidden' : 'block'}`}>
            {inputs}

            {/* Quick Mobile Results Preview & Jump Button */}
            {mobileTab === 'inputs' && (
              <div class="lg:hidden pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                {mobileResultSummary && (
                  <div class="rounded-xl border border-accent-200 bg-accent-50/70 p-3 text-xs dark:border-accent-800 dark:bg-accent-950/40 text-slate-800 dark:text-slate-200">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-accent-700 dark:text-accent-400 mb-1">Live Result Preview</div>
                    {mobileResultSummary}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setMobileTab('results')}
                  class="w-full py-2 px-3 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <span>View Full Results</span>
                  <span>➔</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div class={`space-y-4 min-w-0 ${fullWidthResults ? 'w-full' : ''} lg:block ${mobileTab === 'inputs' ? 'hidden' : 'block'}`}>
          {/* Mobile Back to Inputs Button */}
          {mobileTab === 'results' && (
            <div class="lg:hidden flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMobileTab('inputs')}
                class="inline-flex items-center gap-1 text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline"
              >
                <span>←</span>
                <span>Edit Inputs</span>
              </button>
            </div>
          )}

          <div class="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 dark:border-slate-700 dark:bg-slate-900 min-w-0">
            {results}
          </div>
          <div class="sticky bottom-2 z-10">{actions}</div>
          {science}
        </div>
      </div>
    </section>
  );
}
