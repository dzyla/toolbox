export interface Science {
  title: string; formulas: string[]; assumptions: string[];
  references: { text: string; url?: string }[]; verified: string;
}

export function SciencePanel({ science, open }: { science: Science; open?: boolean }) {
  return (
    <details open={open} class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <summary class="cursor-pointer font-semibold">Science: {science.title}</summary>
      <div class="mt-3 space-y-3 text-sm">
        <div><h4 class="font-medium">Formulas</h4><ul class="mono mt-1 list-inside list-disc">{science.formulas.map(f => <li key={f}>{f}</li>)}</ul></div>
        <div><h4 class="font-medium">Assumptions</h4><ul class="mt-1 list-inside list-disc">{science.assumptions.map(a => <li key={a}>{a}</li>)}</ul></div>
        <div><h4 class="font-medium">References</h4><ul class="mt-1 list-inside list-disc">{science.references.map(r => <li key={r.text}>{r.url ? <a class="underline" href={r.url} target="_blank" rel="noopener">{r.text}</a> : r.text}</li>)}</ul></div>
        <p class="text-xs text-slate-500">Last verified: {science.verified}</p>
      </div>
    </details>
  );
}

/** Plain-text form for exports and clipboard, so a number never travels without its method. */
export function scienceText(s: Science): string {
  return [`Method: ${s.title}`, ...s.formulas.map(f => `  ${f}`), 'Assumptions:', ...s.assumptions.map(a => `  - ${a}`),
    'References:', ...s.references.map(r => `  - ${r.text}${r.url ? ` ${r.url}` : ''}`), `Verified: ${s.verified}`].join('\n');
}
