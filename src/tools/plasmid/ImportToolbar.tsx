import { useRef, useState } from 'preact/hooks';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { legacyPlasmidToDocument } from '@/core/plasmid/legacy';
import { importPlasmidFile, importPlasmidText } from '@/core/plasmid/import';
import { exportFasta, exportGenBank } from '@/core/plasmid/export';
import { validateDocument, type PlasmidDocument } from '@/core/plasmid/model';
import { downloadText } from '@/lib/export';

interface ImportToolbarProps {
  document: PlasmidDocument;
  onOpen: (document: PlasmidDocument) => void;
  onSave: () => Promise<void>;
  onUndo: () => void;
  onRedo: () => void;
  onExportSvg: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canExportSvg: boolean;
  notice: string;
  error: string;
  onError: (error: string) => void;
}

const BUTTON = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:outline-2 disabled:opacity-40 dark:border-slate-600';

export function ImportToolbar({ document, onOpen, onSave, onUndo, onRedo, onExportSvg, canUndo, canRedo, canExportSvg, notice, error, onError }: ImportToolbarProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [summaryFallback, setSummaryFallback] = useState('');
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const run = async (action: () => void | Promise<void>) => {
    onError('');
    try {
      const pending = action();
      if (pending) { setBusy(true); await pending; }
    }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'The document action could not be completed.'); }
    finally { setBusy(false); }
  };
  const open = (next: PlasmidDocument, filename?: string) => {
    const validation = validateDocument(next);
    if (!validation.valid) throw new Error(validation.reason);
    onOpen(filename ? { ...next, provenance: { ...next.provenance, filename } } : next);
    setSummaryFallback('');
  };
  const shareSummary = async () => {
    const summary = `${document.name}\n${document.sequence.length.toLocaleString()} bp · ${document.topology}\n${document.annotations.length} annotations`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(summary);
      setSummaryFallback('Summary copied.');
    } catch { setSummaryFallback(summary); }
  };
  return <section aria-label="Document toolbar" class="space-y-3">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><h2 class="text-xl font-semibold">{document.name}</h2><p class="text-sm text-slate-500">{document.sequence.length.toLocaleString()} bp · {document.topology} · {document.annotations.length} annotations</p></div>
      <label class="text-sm">Preset vector<select class="ml-2 rounded border border-slate-300 bg-transparent px-2 py-1" value="" disabled={busy} onChange={event => {
        const preset = PRESET_PLASMIDS.find(item => item.id === event.currentTarget.value);
        if (preset) void run(() => open(legacyPlasmidToDocument(preset)));
      }}><option value="">Open a preset…</option>{PRESET_PLASMIDS.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
    </div>
    <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700" open>
      <summary class="cursor-pointer text-sm font-semibold">Open sequence</summary>
      <label class="mt-3 block text-xs">Paste FASTA, GenBank, or raw DNA<textarea class="mt-1 w-full rounded border border-slate-300 bg-transparent p-2 font-mono text-xs" rows={3} value={text} onInput={event => setText(event.currentTarget.value)} /></label>
      <div class="mt-2 flex flex-wrap items-center gap-3">
        <button class={`${BUTTON} bg-blue-700 text-white`} disabled={busy || !text.trim()} onClick={() => void run(() => open(importPlasmidText(text).document))}>Open sequence</button>
        <label class="text-sm">Open sequence file<input class="ml-2 max-w-full text-xs" type="file" accept=".dna,.gb,.gbk,.fasta,.fa,.seq,.txt" disabled={busy} onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void run(async () => open((await importPlasmidFile(file)).document, file.name));
        }} /></label>
      </div>
    </details>
    <div class="flex flex-wrap gap-2">
      <button class={`${BUTTON} bg-blue-700 text-white`} disabled={busy} onClick={() => void run(onSave)}>Save locally</button>
      <button class={BUTTON} disabled={!canUndo || busy} onClick={onUndo}>Undo</button>
      <button class={BUTTON} disabled={!canRedo || busy} onClick={onRedo}>Redo</button>
      <button class={BUTTON} onClick={() => void run(() => downloadText(exportGenBank(document), `${document.name}.gb`, 'text/plain;charset=utf-8'))}>Download GenBank</button>
      <button class={BUTTON} onClick={() => void run(() => downloadText(exportFasta(document), `${document.name}.fasta`))}>Download FASTA</button>
      <button class={BUTTON} disabled={!canExportSvg} onClick={() => void run(onExportSvg)}>Download SVG</button>
      <button class={BUTTON} onClick={() => void shareSummary()}>Copy summary</button>
    </div>
    <p class="text-xs text-slate-500">Source: {document.provenance.format}{document.provenance.filename ? ` · ${document.provenance.filename}` : ''} · Parser {document.provenance.parserVersion}</p>
    {!!document.provenance.warnings.length && <section aria-label="Import warnings" class="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><h3 class="font-semibold">Import warnings</h3><ul>{document.provenance.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}</ul></section>}
    {notice && <p role="status" class="text-sm text-teal-700 dark:text-teal-300">{notice}</p>}
    {error && <div role="alert" class="flex items-center justify-between gap-3 rounded border border-red-300 p-3 text-sm text-red-700"><p>{error}</p><button class={BUTTON} onClick={() => onError('')}>Dismiss error</button></div>}
    {summaryFallback && (summaryFallback === 'Summary copied.' ? <p role="status" class="text-xs">{summaryFallback}</p> : <label class="block text-xs">Summary to copy<textarea ref={summaryRef} class="block w-full rounded border p-2" readOnly value={summaryFallback} onFocus={() => summaryRef.current?.select()} /><span>Select and copy with Ctrl+C or ⌘C. The summary omits DNA and selection.</span></label>)}
  </section>;
}
