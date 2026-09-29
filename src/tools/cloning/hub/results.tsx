import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { primersToCsv, primersToIdtBulk, type DesignedPrimer } from '@/core/cloning/oligo';
import { protocolText, waterVolume, type CloningProtocol } from '@/core/cloning/protocol';
import type { Finding } from '@/core/cloning/types';
import { downloadText } from '@/lib/export';

export const BUTTON = 'rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800';
export const PRIMARY_BUTTON = 'rounded-lg border border-accent-700 bg-accent-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent-800 disabled:opacity-40 dark:hover:bg-accent-600';
export const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900';

export function Section({ id, title, aside, children }: { id: string; title: string; aside?: ComponentChildren; children: ComponentChildren }) {
  return <section aria-labelledby={id} class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} class="text-sm font-semibold">{title}</h2>
      {aside && <div class="text-xs text-slate-600 dark:text-slate-400">{aside}</div>}
    </div>
    {children}
  </section>;
}

export function Labeled({ label, hint, children }: { label: string; hint?: string; children: ComponentChildren }) {
  return <label class="block text-xs font-medium">
    <span>{label}</span>
    <span class="mt-1 block">{children}</span>
    {hint && <span class="mt-0.5 block font-normal text-slate-600 dark:text-slate-400">{hint}</span>}
  </label>;
}

export function FindingsList({ findings }: { findings: Finding[] }) {
  const blockers = findings.filter(finding => finding.severity === 'blocker');
  const others = findings.filter(finding => finding.severity !== 'blocker');
  if (!findings.length) return null;
  return <div class="space-y-2">
    {blockers.length > 0 && <div role="alert" class="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">
      <ul class="space-y-1">{blockers.map((finding, index) => <li key={`${finding.code}-${index}`}><strong>Cannot design:</strong> {finding.message}</li>)}</ul>
    </div>}
    {others.length > 0 && <div role="status" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <ul class="space-y-1">{others.map((finding, index) => <li key={`${finding.code}-${index}`}>{finding.severity === 'warning' ? <strong>Check: </strong> : null}{finding.message}</li>)}</ul>
    </div>}
  </div>;
}

function useFlash() {
  const [message, setMessage] = useState('');
  const flash = (text: string) => { setMessage(text); setTimeout(() => setMessage(''), 1800); };
  return { message, flash };
}

async function copyText(text: string, flash: (message: string) => void, done: string) {
  try { await navigator.clipboard.writeText(text); flash(done); } catch { flash('Copy failed: select the text manually'); }
}

export function PrimerTable({ primers, fileName, caption }: { primers: DesignedPrimer[]; fileName: string; caption: string }) {
  const { message, flash } = useFlash();
  if (!primers.length) return null;
  return <div class="space-y-2">
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-xs">
        <caption class="sr-only">{caption}</caption>
        <thead class="text-slate-600 dark:text-slate-400"><tr>
          <th scope="col" class="py-1 pr-3">Name</th>
          <th scope="col" class="py-1 pr-3">Sequence 5′→3′</th>
          <th scope="col" class="py-1 pr-3 text-right">Length</th>
          <th scope="col" class="py-1 pr-3 text-right">Tm (°C)</th>
          <th scope="col" class="py-1 pr-3 text-right">GC %</th>
          <th scope="col" class="py-1">Notes</th>
        </tr></thead>
        <tbody>{primers.map(primer => <tr key={primer.name} class="border-t border-slate-200 align-top dark:border-slate-700">
          <th scope="row" class="py-1.5 pr-3 font-semibold">{primer.name}</th>
          <td class="py-1.5 pr-3 font-mono break-all">
            {primer.tail && <span class="text-slate-500 dark:text-slate-400" title="5′ tail (homology, site or edit)">{primer.tail.toLowerCase()}</span>}
            <span class="font-semibold">{primer.anneal.toUpperCase()}</span>
          </td>
          <td class="py-1.5 pr-3 text-right tabular-nums">{primer.sequence.length}</td>
          <td class="py-1.5 pr-3 text-right tabular-nums" title="Tm of the annealing part">{primer.annealTmC.toFixed(1)}</td>
          <td class="py-1.5 pr-3 text-right tabular-nums">{primer.gcPercent.toFixed(0)}</td>
          <td class="py-1.5 text-slate-600 dark:text-slate-400">{primer.notes.join('; ')}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p class="text-xs text-slate-600 dark:text-slate-400">Lower case is the 5′ tail; upper case anneals to the template. Tm is for the annealing part.</p>
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class={BUTTON} onClick={() => void copyText(primers.map(primer => `${primer.name}\t${primer.sequence}`).join('\n'), flash, 'Primers copied')}>Copy primers</button>
      <button type="button" class={BUTTON} onClick={() => downloadText(primersToCsv(primers), `${fileName}-primers.csv`, 'text/csv;charset=utf-8')}>Download CSV</button>
      <button type="button" class={BUTTON} onClick={() => downloadText(primersToIdtBulk(primers), `${fileName}-idt.txt`)}>Download IDT bulk order</button>
      <span role="status" class="text-xs text-slate-600 dark:text-slate-400">{message}</span>
    </div>
  </div>;
}

const volume = (value: number) => `${Number(value.toFixed(value < 1 ? 2 : 1))} µL`;

export function ProtocolCard({ protocol }: { protocol: CloningProtocol }) {
  const { message, flash } = useFlash();
  return <div class="space-y-3">
    {protocol.reactions.map(table => <div key={table.title} class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-xs">
        <caption class="pb-1 text-left font-semibold">{table.title} — {table.totalVolumeUl} µL</caption>
        <thead class="text-slate-600 dark:text-slate-400"><tr>
          <th scope="col" class="py-1 pr-3">Component</th>
          <th scope="col" class="py-1 pr-3">Stock</th>
          <th scope="col" class="py-1 pr-3">Amount</th>
          <th scope="col" class="py-1 text-right">Volume</th>
        </tr></thead>
        <tbody>{table.components.map(component => <tr key={component.name} class="border-t border-slate-200 dark:border-slate-700">
          <th scope="row" class="py-1 pr-3 font-medium">{component.name}</th>
          <td class="py-1 pr-3">{component.stock ?? ''}</td>
          <td class="py-1 pr-3">{component.amount ?? ''}</td>
          <td class="py-1 text-right tabular-nums">{component.volumeUl === null ? volume(Math.max(0, waterVolume(table))) : volume(component.volumeUl)}</td>
        </tr>)}</tbody>
      </table>
      {table.notes.length > 0 && <ul class="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-900 dark:text-amber-200">{table.notes.map(note => <li key={note}>{note}</li>)}</ul>}
    </div>)}
    <ol class="list-decimal space-y-1 pl-5 text-xs">{protocol.steps.map(step => <li key={step.text}>{step.text}</li>)}</ol>
    <p class="text-xs text-slate-600 dark:text-slate-400">Source: {protocol.source}</p>
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class={BUTTON} onClick={() => void copyText(protocolText(protocol), flash, 'Protocol copied')}>Copy protocol</button>
      <button type="button" class={BUTTON} onClick={() => downloadText(protocolText(protocol), `${protocol.title.replace(/\W+/g, '-').toLowerCase()}.txt`)}>Download text</button>
      <span role="status" class="text-xs text-slate-600 dark:text-slate-400">{message}</span>
    </div>
  </div>;
}
