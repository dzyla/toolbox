export function ContributeModal({ recipeJson, title, onClose }: { recipeJson: string; title: string; onClose: () => void }) {
  return (
      <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
        <div class="max-w-lg w-full rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 space-y-4 border border-slate-200 dark:border-slate-800">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="font-bold text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>🚀</span> Contribute Buffer Recipe
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Share your recipe with scientists worldwide by submitting it to the open-source database!
              </p>
            </div>
            <button
              type="button"
              onClick={() => onClose()}
              class="text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg p-1 transition"
              title="Close modal"
            >
              ✕
            </button>
          </div>

          <div class="text-xs text-slate-600 dark:text-slate-300 space-y-2">
            <p>
              <strong>How to submit your buffer:</strong>
            </p>
            <ol class="list-decimal list-inside space-y-1 pl-1 text-slate-500 dark:text-slate-400">
              <li>Click <strong>Submit via GitHub Issue</strong> below to open a pre-filled submission on the Toolbox repo.</li>
              <li>Or click <strong>Copy Recipe JSON</strong> and paste it into a GitHub discussion or PR.</li>
              <li>Once reviewed, it will be added to the official preset library for all users!</li>
            </ol>
          </div>

          <div class="overflow-x-auto rounded-xl bg-slate-50 p-3 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <pre class="mono text-[11px] text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto">{recipeJson}</pre>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(recipeJson);
                alert('Recipe JSON copied to clipboard!');
              }}
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 transition"
            >
              Copy JSON
            </button>
            <a
              href={`https://github.com/dzyla/toolbox/issues/new?title=${encodeURIComponent(`[Buffer Preset]: ${title}`)}&body=${encodeURIComponent(`### New Buffer Recipe Submission\n\n\`\`\`json\n${recipeJson}\n\`\`\`\n\n**Source / Reference:** (e.g. Cold Spring Harbor, Sambrook, paper citation)`)}`}
              target="_blank"
              rel="noopener noreferrer"
              class="rounded-lg bg-accent-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-700 transition inline-block text-center shadow-xs"
            >
              Submit via GitHub Issue ↗
            </a>
          </div>
        </div>
      </div>
  );
}
