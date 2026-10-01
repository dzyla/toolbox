import { useMemo, useState } from 'preact/hooks';
import { ActionBar } from '@/app/components/ActionBar';
import { ImportAlert } from '@/app/components/ImportAlert';
import { SciencePanel } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import {
  DEFAULT_ENZYME_NAMES, analyzeSilentSites, silentSitesCsv, validateCds,
  type CreateRow, type DestroyRow, type SiteRef,
} from '@/core/silent-sites';
import { ENZYMES } from '@/core/nucleic/sequence';
import { HOST_NAMES, type HostOrganism } from '@/core/rare-codons';
import { useDraftText } from '@/lib/drafts';
import { downloadText, toCsv } from '@/lib/export';
import { importErrorMessage, readTextFile } from '@/lib/file-import';
import { SCIENCE } from './science';

const EXAMPLE = '>example\nATGGCTGAATTCAAAGGATCCGAGACCGGTCTCAAGCTTCTGGAAGAGTTCGGCTAA';
const field = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900';
const MAX_ROWS = 400;
const ALL_NAMES = [...new Set(ENZYMES.map(e => e.name))].sort((a, b) => a.localeCompare(b));
const SITE_OF = new Map(ENZYMES.map(e => [e.name, e.site]));

type Mode = 'destroy' | 'create';

const siteLabel = (s: SiteRef) => `${s.enzyme} ${s.matched} (${s.strand === '+' ? 'top' : 'bottom'} strand, nt ${s.position})`;
const brief = (xs: SiteRef[]) => xs.map(x => `${x.enzyme} @${x.position}`).join(', ');

export default function SilentSitesView() {
  const [raw, setRaw] = useDraftText('silent-sites:seq', () => EXAMPLE);
  const [frame, setFrame] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<Mode>('destroy');
  const [selected, setSelected] = useState<string[]>(DEFAULT_ENZYME_NAMES);
  const [search, setSearch] = useState('');
  const [host, setHost] = useState<HostOrganism | ''>('');
  const [importError, setImportError] = useState('');

  const check = useMemo(() => validateCds(raw, frame), [raw, frame]);
  const result = useMemo(
    () => (check.errors.length || !selected.length ? null : analyzeSilentSites(check.seq, { enzymes: selected, frame, host: host || undefined })),
    [check, selected, frame, host],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? ALL_NAMES.filter(n => n.toLowerCase().includes(q) || (SITE_OF.get(n) ?? '').toLowerCase().includes(q)) : ALL_NAMES;
    return list.slice(0, 120);
  }, [search]);
  const toggle = (name: string) => setSelected(cur => (cur.includes(name) ? cur.filter(n => n !== name) : [...cur, name]));

  const rows: (DestroyRow | CreateRow)[] = result ? (mode === 'destroy' ? result.destroy : result.create) : [];
  const grouped = useMemo(() => {
    const m = new Map<string, (DestroyRow | CreateRow)[]>();
    for (const r of rows.slice(0, MAX_ROWS)) { const a = m.get(r.site.enzyme) ?? []; a.push(r); m.set(r.site.enzyme, a); }
    return [...m.entries()];
  }, [rows]);

  const csv = () => (result ? toCsv(silentSitesCsv(result, mode)) : '');

  return (
    <ToolLayout
      icon="🔬"
      title="Silent Restriction Sites"
      blurb="Single-nucleotide synonymous changes that destroy or create restriction sites in a coding sequence."
      inputs={
        <div class="space-y-4">
          <section>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold">Coding sequence</h2>
              <button type="button" class="text-sm text-accent-700 underline dark:text-accent-300" onClick={() => setRaw(EXAMPLE, { persist: false })}>Load example</button>
            </div>
            <textarea aria-label="Coding sequence (DNA or FASTA)" value={raw} rows={7} spellcheck={false}
              onInput={e => setRaw((e.target as HTMLTextAreaElement).value)}
              class={`${field} mt-1 font-mono text-xs`} placeholder="Paste a CDS or FASTA" />
            <label class="mt-2 block text-xs">
              Or import a FASTA/text file
              <input aria-label="Sequence file" type="file" accept=".fa,.fasta,.txt,.seq" class="block"
                onChange={e => {
                  const input = e.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
                  if (file) readTextFile(file).then(t => { setImportError(''); setRaw(t); }).catch(err => setImportError(importErrorMessage(err, file.name)));
                }} />
            </label>
            <ImportAlert message={importError} />
            {check.errors.map(m => <p key={m} role="alert" class="mt-2 text-sm text-rose-700 dark:text-rose-400">{m}</p>)}
            {check.warnings.map(m => <p key={m} class="mt-1 text-xs text-amber-700 dark:text-amber-400">Warning: {m}</p>)}
          </section>
          <section class="grid grid-cols-2 gap-2">
            <label class="text-sm font-medium">Reading frame
              <select aria-label="Reading frame" class={`${field} mt-1`} value={frame} onChange={e => setFrame(Number((e.target as HTMLSelectElement).value) as 1 | 2 | 3)}>
                <option value={1}>Frame 1</option><option value={2}>Frame 2</option><option value={3}>Frame 3</option>
              </select>
            </label>
            <label class="text-sm font-medium">Codon rarity (optional)
              <select aria-label="Organism for codon rarity" class={`${field} mt-1`} value={host} onChange={e => setHost((e.target as HTMLSelectElement).value as HostOrganism | '')}>
                <option value="">None</option>
                {(Object.keys(HOST_NAMES) as HostOrganism[]).map(h => <option value={h}>{HOST_NAMES[h]}</option>)}
              </select>
            </label>
          </section>
          <section>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold">Enzymes <span class="text-xs font-normal text-slate-500 dark:text-slate-400">({selected.length} selected)</span></h2>
              <span class="flex gap-3 text-xs">
                <button type="button" class="underline text-accent-700 dark:text-accent-300" onClick={() => setSelected(DEFAULT_ENZYME_NAMES)}>Common</button>
                <button type="button" class="underline text-accent-700 dark:text-accent-300" onClick={() => setSelected(cur => [...new Set([...cur, ...shown])])}>Add shown</button>
                <button type="button" class="underline text-accent-700 dark:text-accent-300" onClick={() => setSelected([])}>Clear</button>
              </span>
            </div>
            <input aria-label="Search enzymes by name or site" type="search" value={search} placeholder="Search name or site (e.g. EcoRI, GGTCTC)"
              onInput={e => setSearch((e.target as HTMLInputElement).value)} class={`${field} mt-1`} />
            <ul class="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 p-1 dark:border-slate-700" aria-label="Enzyme list">
              {shown.map(n => (
                <li key={n}>
                  <label class="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                    <input type="checkbox" checked={selected.includes(n)} onChange={() => toggle(n)} />
                    <span class="font-medium">{n}</span>
                    <span class="font-mono text-xs text-slate-500 dark:text-slate-400">{SITE_OF.get(n)}</span>
                  </label>
                </li>
              ))}
              {!shown.length && <li class="px-1 py-1 text-sm text-slate-500 dark:text-slate-400">No enzymes match.</li>}
            </ul>
          </section>
        </div>
      }
      results={
        <div class="space-y-3">
          <div role="group" aria-label="Mode" class="inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
            {(['destroy', 'create'] as const).map(m => (
              <button type="button" key={m} aria-pressed={mode === m} onClick={() => setMode(m)}
                class={`rounded-md px-3 py-1 text-sm font-medium ${mode === m ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                {m === 'destroy' ? 'Destroy sites' : 'Create sites'}
              </button>
            ))}
          </div>
          {!result && <p class="text-sm text-slate-500 dark:text-slate-400">{check.errors.length ? 'Fix the sequence to see results.' : 'Select at least one enzyme.'}</p>}
          {result && (
            <>
              <p class="text-sm text-slate-600 dark:text-slate-400">
                {result.existing.length} existing site{result.existing.length === 1 ? '' : 's'} for the selected enzymes; {result.changes.length} silent single-nucleotide changes possible.
                {result.existing.length > 0 && <> Existing: {result.existing.map(siteLabel).join('; ')}.</>}
              </p>
              {mode === 'destroy' && result.undestroyable.length > 0 && (
                <p class="text-xs text-amber-700 dark:text-amber-400">No single silent change removes: {result.undestroyable.map(siteLabel).join('; ')}.</p>
              )}
              {result.enzymes.some(e => e.typeIIS) && (
                <p class="text-xs text-slate-500 dark:text-slate-400">Type IIS enzymes ({result.enzymes.filter(e => e.typeIIS).map(e => e.name).join(', ')}) cut outside their recognition site; only the recognition sequence is analysed.</p>
              )}
              {rows.length === 0 && <p class="text-sm text-slate-500 dark:text-slate-400">No {mode === 'destroy' ? 'site-destroying' : 'site-creating'} silent changes found.</p>}
              {grouped.map(([enzyme, list]) => (
                <section key={enzyme} class="overflow-x-auto">
                  <h3 class="text-sm font-semibold">{enzyme} <span class="font-mono text-xs font-normal text-slate-500 dark:text-slate-400">{SITE_OF.get(enzyme)}</span></h3>
                  <table class="mt-1 w-full text-left text-xs">
                    <caption class="sr-only">{enzyme} silent changes ({mode})</caption>
                    <thead class="text-slate-500 dark:text-slate-400">
                      <tr>
                        <th scope="col" class="pr-2">{mode === 'destroy' ? 'Site' : 'New site'}</th>
                        <th scope="col" class="pr-2">nt</th><th scope="col" class="pr-2">Codon</th><th scope="col" class="pr-2">AA</th>
                        <th scope="col" class="pr-2">Also destroys</th><th scope="col" class="pr-2">Also creates</th>
                        {host && <th scope="col">New codon</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r, i) => (
                        <tr key={i} class="border-t border-slate-100 dark:border-slate-800">
                          <td class="pr-2 font-mono">{r.site.matched} {r.site.strand === '-' ? '(bottom)' : ''} @{r.site.position}</td>
                          <td class="pr-2">{r.change.position} {r.change.substitution}</td>
                          <td class="pr-2 font-mono">{r.change.codon}&rarr;{r.change.newCodon}</td>
                          <td class="pr-2">{r.change.aa}</td>
                          <td class="pr-2">{brief(r.otherLost) || '-'}</td>
                          <td class="pr-2">{brief(r.otherGained) || '-'}</td>
                          {host && <td>{r.change.newCodonRare ? 'rare' : 'ok'}{r.change.newCodonFraction !== undefined ? ` (${r.change.newCodonFraction.toFixed(2)})` : ''}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
              {rows.length > MAX_ROWS && <p class="text-xs text-slate-500 dark:text-slate-400">Showing the first {MAX_ROWS} of {rows.length} rows; the CSV contains all of them.</p>}
              <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" onClick={() => downloadText(csv(), `silent-sites-${mode}.csv`, 'text/csv')}>Download CSV</button>
            </>
          )}
        </div>
      }
      actions={<ActionBar onCopy={csv} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}

