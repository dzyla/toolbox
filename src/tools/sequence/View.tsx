import { useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { LineChart } from '@/app/components/LineChart';
import { SCIENCE } from './science';
import {
  cleanNucleic, detectType, reverseComplement, gcContent, gcProfile,
  sixFrames, findOrfs, digestSummary, restrictionSites,
  CODON_TABLES,
} from '@/core/nucleic/sequence';
import { summarize } from '@/core/protein';

interface State {
  raw: string;
  tableId: number;
  minOrfAa: number;
  gcWindow: number;
  circular: boolean;
  activeTab: 'details' | 'translation' | 'orfs' | 'gc' | 'restriction';
}

const DEFAULTS: State = {
  raw: `>example_dna
ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG`,
  tableId: 1,
  minOrfAa: 4,
  gcWindow: 10,
  circular: false,
  activeTab: 'details',
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

export default function SequenceView() {
  const [state] = useUrlState('bb.sequence', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };

  const parsed = useMemo(() => {
    let header = 'Sequence';
    let content = s.raw;
    if (s.raw.trim().startsWith('>')) {
      const lines = s.raw.trim().split('\n');
      header = lines[0]!.replace(/^>\s*/, '');
      content = lines.slice(1).join('');
    }
    const clean = cleanNucleic(content);
    const kind = detectType(clean.seq);
    return { header, seq: clean.seq, removed: clean.removed, kind };
  }, [s.raw]);

  const revComp = useMemo(() => {
    if (parsed.kind === 'protein' || !parsed.seq) return '';
    return reverseComplement(parsed.seq, parsed.kind === 'RNA' ? 'RNA' : 'DNA');
  }, [parsed.seq, parsed.kind]);

  const gc = useMemo(() => {
    if (parsed.kind === 'protein' || !parsed.seq) return { pct: 0, profile: null };
    const pct = gcContent(parsed.seq) * 100;
    const windowSize = Math.max(3, Math.min(s.gcWindow, parsed.seq.length));
    const profile = parsed.seq.length >= windowSize ? gcProfile(parsed.seq, windowSize) : null;
    return { pct, profile };
  }, [parsed.seq, parsed.kind, s.gcWindow]);

  const translations = useMemo(() => {
    if (parsed.kind === 'protein' || !parsed.seq) return [];
    return sixFrames(parsed.seq, s.tableId);
  }, [parsed.seq, parsed.kind, s.tableId]);

  const orfs = useMemo(() => {
    if (parsed.kind === 'protein' || !parsed.seq) return [];
    return findOrfs(parsed.seq, { minAa: s.minOrfAa, tableId: s.tableId });
  }, [parsed.seq, parsed.kind, s.minOrfAa, s.tableId]);

  const digest = useMemo(() => {
    if (parsed.kind === 'protein' || !parsed.seq) return { sites: [], summary: [] };
    const sites = restrictionSites(parsed.seq, undefined, { circular: s.circular });
    const summary = digestSummary(parsed.seq, undefined, { circular: s.circular });
    return { sites, summary };
  }, [parsed.seq, parsed.kind, s.circular]);

  const proteinSummary = useMemo(() => {
    if (parsed.kind !== 'protein' || !parsed.seq) return null;
    try {
      return summarize(parsed.seq);
    } catch {
      return null;
    }
  }, [parsed.seq, parsed.kind]);

  const copyText = () => {
    const lines = [
      `Sequence: ${parsed.header}`,
      `Type: ${parsed.kind}, Length: ${parsed.seq.length}`,
    ];
    if (parsed.kind !== 'protein') {
      lines.push(`GC Content: ${gc.pct.toFixed(1)}%`);
      lines.push(`Reverse complement: ${revComp}`);
      lines.push(`Found ${orfs.length} ORFs (≥${s.minOrfAa} aa), ${digest.sites.length} restriction sites`);
    } else if (proteinSummary) {
      lines.push(`MW: ${proteinSummary.mw.toFixed(2)} Da, pI: ${proteinSummary.pI.toFixed(2)}`);
    }
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <ToolLayout
      icon="🔤"
      title="Sequence Viewer & Analysis"
      blurb="Six-frame translation, ORF discovery, restriction site mapping, GC profile and protein parameter calculation."
      inputs={
        <div class="space-y-4">
          <div>
            <div class="flex items-baseline justify-between mb-1">
              <label class="block text-sm font-medium">Input Sequence (FASTA or raw)</label>
              <span class="text-xs text-slate-500">{parsed.seq.length} residues · {parsed.kind}</span>
            </div>
            <textarea
              rows={6}
              class={`${FIELD} mono text-xs`}
              value={s.raw}
              onInput={e => set({ raw: (e.target as HTMLTextAreaElement).value })}
            />
            {parsed.removed.whitespace + parsed.removed.digits + parsed.removed.other > 0 && (
              <p class="mt-1 text-xs text-slate-500">
                Ignored non-letter characters ({parsed.removed.whitespace} spaces, {parsed.removed.digits} digits, {parsed.removed.other} other)
              </p>
            )}
          </div>

          <label class="block">
            <span class="mb-1 block text-sm font-medium">Upload Sequence File</span>
            <input
              type="file"
              accept=".fasta,.fa,.dna,.txt,text/plain"
              class="block min-h-11 w-full text-sm"
              onChange={async e => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) set({ raw: await file.text() });
              }}
            />
          </label>

          {parsed.kind !== 'protein' && (
            <div class="space-y-3 pt-2">
              <div>
                <label class="block text-sm font-medium mb-1">Genetic Code (Translation Table)</label>
                <select
                  class={FIELD}
                  value={s.tableId}
                  onChange={e => set({ tableId: Number((e.target as HTMLSelectElement).value) })}
                >
                  {CODON_TABLES.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.id}: {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium mb-1">Min ORF length (aa)</label>
                  <input
                    type="number"
                    min="2"
                    class={FIELD}
                    value={s.minOrfAa}
                    onInput={e => set({ minOrfAa: Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1) })}
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1">GC Window (nt)</label>
                  <input
                    type="number"
                    min="3"
                    class={FIELD}
                    value={s.gcWindow}
                    onInput={e => set({ gcWindow: Math.max(3, parseInt((e.target as HTMLInputElement).value) || 3) })}
                  />
                </div>
              </div>

              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300"
                  checked={s.circular}
                  onChange={e => set({ circular: (e.target as HTMLInputElement).checked })}
                />
                Circular topology (wrap restriction sites around ends)
              </label>
            </div>
          )}
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Tabs */}
          <div class="flex flex-wrap gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
            {(
              [
                ['details', 'Overview'],
                ['translation', '6-Frame Translation'],
                ['orfs', 'ORFs'],
                ['gc', 'GC Profile'],
                ['restriction', 'Restriction Digest'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                class={`min-h-9 rounded-lg px-3 text-sm font-medium transition ${
                  s.activeTab === id
                    ? 'bg-accent-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
                onClick={() => set({ activeTab: id })}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab 1: Overview */}
          {s.activeTab === 'details' && (
            <div class="space-y-4" data-testid="sequence-overview-result">
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Detected Type</div>
                  <div class="mono text-xl font-bold text-accent-600">{parsed.kind}</div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Length</div>
                  <div class="mono text-xl font-bold">{parsed.seq.length}</div>
                </div>

                {parsed.kind !== 'protein' ? (
                  <>
                    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div class="text-xs text-slate-500">GC Content</div>
                      <div class="mono text-xl font-bold">{gc.pct.toFixed(1)}%</div>
                    </div>

                    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div class="text-xs text-slate-500">ORFs Found</div>
                      <div class="mono text-xl font-bold">{orfs.length}</div>
                    </div>
                  </>
                ) : proteinSummary ? (
                  <>
                    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div class="text-xs text-slate-500">Molecular Weight</div>
                      <div class="mono text-xl font-bold">{proteinSummary.mw.toFixed(1)} Da</div>
                    </div>

                    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div class="text-xs text-slate-500">Isoelectric Point</div>
                      <div class="mono text-xl font-bold">{proteinSummary.pI.toFixed(2)}</div>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Formatted Sequence Display */}
              <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div class="flex justify-between items-center mb-2">
                  <h3 class="font-medium text-sm">Sequence Display</h3>
                  <button
                    type="button"
                    class="text-xs text-accent-600 underline"
                    onClick={() => navigator.clipboard.writeText(parsed.seq)}
                  >
                    Copy Clean Sequence
                  </button>
                </div>
                <div class="overflow-x-auto max-h-48 rounded bg-slate-50 p-3 dark:bg-slate-800/50">
                  <pre class="mono text-xs whitespace-pre-wrap break-all leading-relaxed">
                    {parsed.seq}
                  </pre>
                </div>
              </div>

              {revComp && (
                <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div class="flex justify-between items-center mb-2">
                    <h3 class="font-medium text-sm">Reverse Complement</h3>
                    <button
                      type="button"
                      class="text-xs text-accent-600 underline"
                      onClick={() => navigator.clipboard.writeText(revComp)}
                    >
                      Copy Reverse Complement
                    </button>
                  </div>
                  <div class="overflow-x-auto max-h-48 rounded bg-slate-50 p-3 dark:bg-slate-800/50">
                    <pre class="mono text-xs whitespace-pre-wrap break-all leading-relaxed">
                      {revComp}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: 6-Frame Translation */}
          {s.activeTab === 'translation' && (
            <div class="space-y-4" data-testid="sequence-translation-result">
              {translations.length === 0 ? (
                <p class="text-slate-500">Translation is available for nucleotide sequences.</p>
              ) : (
                translations.map(t => (
                  <div key={t.frame} class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div class="flex justify-between items-center mb-1">
                      <span class="text-xs font-semibold uppercase text-slate-500">
                        Frame {t.frame > 0 ? `+${t.frame}` : t.frame}
                      </span>
                      <button
                        type="button"
                        class="text-xs text-accent-600 hover:underline"
                        onClick={() => navigator.clipboard.writeText(t.protein)}
                      >
                        Copy
                      </button>
                    </div>
                    <pre class="mono text-xs whitespace-pre-wrap break-all bg-slate-50 p-2 rounded dark:bg-slate-800/40">
                      {t.protein}
                    </pre>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: ORFs */}
          {s.activeTab === 'orfs' && (
            <div class="space-y-4" data-testid="sequence-orfs-result">
              <div class="flex justify-between items-center">
                <h3 class="font-semibold text-sm">Identified Open Reading Frames (≥{s.minOrfAa} aa)</h3>
                <span class="text-xs text-slate-500">{orfs.length} ORFs</span>
              </div>

              {orfs.length === 0 ? (
                <p class="text-sm text-slate-500">No ORFs found meeting the criteria.</p>
              ) : (
                <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table class="w-full text-left text-xs">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                        <th class="p-2">Frame</th>
                        <th class="p-2">Start</th>
                        <th class="p-2">End</th>
                        <th class="p-2">Length</th>
                        <th class="p-2">Protein</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orfs.map((orf, i) => (
                        <tr key={i} class="border-b border-slate-100 dark:border-slate-800">
                          <td class="p-2 mono">{orf.frame > 0 ? `+${orf.frame}` : orf.frame}</td>
                          <td class="p-2 mono">{orf.start}</td>
                          <td class="p-2 mono">{orf.end}</td>
                          <td class="p-2 mono">{orf.lengthAa} aa ({orf.lengthNt} nt)</td>
                          <td class="p-2 mono truncate max-w-xs">{orf.protein}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: GC Profile */}
          {s.activeTab === 'gc' && (
            <div class="space-y-4" data-testid="sequence-gc-result">
              {gc.profile ? (
                <LineChart
                  title={`GC Content Profile (${s.gcWindow} nt window)`}
                  xLabel="Position (nt)"
                  yLabel="GC Content (%)"
                  series={[
                    {
                      name: 'GC %',
                      x: gc.profile.x,
                      y: gc.profile.y,
                      color: '#0891b2',
                    },
                  ]}
                  exportName="sequence-gc-profile"
                />
              ) : (
                <p class="text-sm text-slate-500">Sequence too short for current GC window.</p>
              )}
            </div>
          )}

          {/* Tab 5: Restriction Digest */}
          {s.activeTab === 'restriction' && (
            <div class="space-y-4" data-testid="sequence-digest-result">
              <div class="flex justify-between items-center">
                <h3 class="font-semibold text-sm">Restriction Sites</h3>
                <span class="text-xs text-slate-500">{digest.sites.length} total cutting sites</span>
              </div>

              <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table class="w-full text-left text-xs">
                  <thead>
                    <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                      <th class="p-2">Enzyme</th>
                      <th class="p-2">Site</th>
                      <th class="p-2">Overhang</th>
                      <th class="p-2">Cuts</th>
                      <th class="p-2">Cut Positions</th>
                      <th class="p-2">Fragment Sizes (bp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {digest.summary
                      .filter(d => d.cuts > 0)
                      .map((d, i) => (
                        <tr key={i} class="border-b border-slate-100 dark:border-slate-800">
                          <td class="p-2 font-semibold">{d.enzyme}</td>
                          <td class="p-2 mono">{d.site}</td>
                          <td class="p-2 mono">{d.overhang}</td>
                          <td class="p-2 mono">{d.cuts}</td>
                          <td class="p-2 mono">{d.positions.join(', ')}</td>
                          <td class="p-2 mono">{d.fragments.join(', ')}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      }
      actions={<ActionBar onCopy={copyText} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
