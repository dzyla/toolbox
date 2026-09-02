import type { ComponentChildren } from 'preact';

export function ToolLayout({ icon, title, blurb, inputs, results, actions, science }:
  { icon: string; title: string; blurb: string; inputs: ComponentChildren; results: ComponentChildren; actions: ComponentChildren; science: ComponentChildren }) {
  return (
    <section class="mx-auto max-w-6xl p-4">
      <header class="mb-4"><h1 class="text-2xl font-bold">{icon} {title}</h1><p class="text-slate-600 dark:text-slate-300">{blurb}</p></header>
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">{inputs}</div>
        <div class="space-y-4">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">{results}</div>
          <div class="sticky bottom-2">{actions}</div>
          {science}
        </div>
      </div>
    </section>
  );
}
