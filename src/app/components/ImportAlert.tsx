/** Inline, announced message for a failed file import. Renders nothing when there is no error. */
export function ImportAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" class="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
      {message}
    </p>
  );
}
