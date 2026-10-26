/** Class strings shared by the structure tool's panels. */
export const captionClass = 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';
export const selectClass = 'max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
export const buttonClass = 'rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';
/** A segmented on/off button group (`aria-pressed` buttons). */
export const segmentGroupClass = 'inline-flex divide-x divide-slate-300 overflow-hidden rounded-md border border-slate-300 dark:divide-slate-700 dark:border-slate-700';
export const segmentClass = (on: boolean) => `px-2 py-0.5 text-xs font-semibold transition ${on
  ? 'bg-accent-600 text-white'
  : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`;
