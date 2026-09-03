export interface Science {
  title: string; formulas: string[]; assumptions: string[];
  references: { text: string; url?: string }[]; verified: string;
}

function parseFormula(raw: string): { expr: string; note?: string } {
  if (raw.includes(';')) {
    const [expr, ...rest] = raw.split(';');
    return { expr: expr!.trim(), note: rest.join(';').trim() };
  }
  const withMatch = raw.match(/^(.*?)(,\s*(?:with|where)\s+.*)$/i);
  if (withMatch) {
    return { expr: withMatch[1]!.trim(), note: withMatch[2]!.replace(/^,\s*/, '').trim() };
  }
  const parenMatch = raw.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (parenMatch && !parenMatch[1]!.includes('(')) {
    return { expr: parenMatch[1]!.trim(), note: parenMatch[2]!.trim() };
  }
  return { expr: raw.trim() };
}

function EquationItem({ formula, index }: { formula: string; index: number }) {
  const { expr, note } = parseFormula(formula);
  return (
    <div class="group relative rounded-lg border border-slate-200/60 bg-slate-50/40 px-4 py-2.5 transition-colors hover:border-slate-300/80 dark:border-slate-800/60 dark:bg-slate-900/30 dark:hover:border-slate-700/80">
      <div class="flex items-baseline justify-between gap-4">
        <div class="overflow-x-auto py-0.5">
          <span class="font-serif italic text-base sm:text-[17px] text-slate-800 dark:text-slate-200 tracking-wide select-all">
            {expr}
          </span>
        </div>
        <span class="shrink-0 font-serif italic text-xs text-slate-400 dark:text-slate-500 select-none">
          ({index + 1})
        </span>
      </div>
      {note && (
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
          <span class="text-slate-400 select-none mr-1">—</span>
          {note}
        </p>
      )}
    </div>
  );
}

export function SciencePanel({ science, open }: { science: Science; open?: boolean }) {
  return (
    <details open={open} class="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <summary class="cursor-pointer font-medium text-sm select-none text-slate-700 dark:text-slate-300 flex items-center justify-between">
        <span class="flex items-center gap-2">
          <span class="text-slate-400">📐</span>
          <span class="font-semibold text-slate-900 dark:text-slate-100">Science: {science.title}</span>
        </span>
        <span class="text-xs font-normal text-slate-400">Expand for derivations & literature</span>
      </summary>
      <div class="mt-4 space-y-4 text-sm">
        <div>
          <h4 class="font-medium text-xs text-slate-500 dark:text-slate-400 mb-2 tracking-wider uppercase">
            Formulation
          </h4>
          <div class="space-y-2">
            {science.formulas.map((f, i) => (
              <EquationItem key={f} formula={f} index={i} />
            ))}
          </div>
        </div>

        {science.assumptions.length > 0 && (
          <div>
            <h4 class="font-semibold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Assumptions & Scope
            </h4>
            <ul class="space-y-1 text-slate-600 dark:text-slate-300 text-xs sm:text-sm">
              {science.assumptions.map(a => (
                <li key={a} class="flex items-start gap-2">
                  <span class="text-slate-400 dark:text-slate-500 shrink-0">•</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {science.references.length > 0 && (
          <div>
            <h4 class="font-semibold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Primary References
            </h4>
            <ul class="space-y-1 text-slate-600 dark:text-slate-300 text-xs sm:text-sm">
              {science.references.map(r => (
                <li key={r.text} class="flex items-start gap-2">
                  <span class="text-accent-600 dark:text-accent-400 shrink-0">↗</span>
                  {r.url ? (
                    <a
                      class="underline hover:text-accent-600 dark:hover:text-accent-400 transition-colors"
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {r.text}
                    </a>
                  ) : (
                    <span>{r.text}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Peer-reviewed methodology</span>
          <span>Verified: {science.verified}</span>
        </div>
      </div>
    </details>
  );
}

/** Plain-text form for exports and clipboard, so a number never travels without its method. */
export function scienceText(s: Science): string {
  return [`Method: ${s.title}`, ...s.formulas.map(f => `  ${f}`), 'Assumptions:', ...s.assumptions.map(a => `  - ${a}`),
    'References:', ...s.references.map(r => `  - ${r.text}${r.url ? ` ${r.url}` : ''}`), `Verified: ${s.verified}`].join('\n');
}
