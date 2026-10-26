/** Shown over the whole tool while a file is dragged over it; never intercepts the drop itself. */
export function DropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent-500 bg-accent-50/80 dark:border-accent-400 dark:bg-accent-950/80">
      <p class="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-accent-700 shadow-sm dark:bg-slate-900 dark:text-accent-300">
        Drop a .cif, .pdb or .gz file
      </p>
    </div>
  );
}
