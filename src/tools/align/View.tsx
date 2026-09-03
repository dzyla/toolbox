import { useMemo, useState } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import {
  align, getMatrix, matricesFor, simpleMatrix, parseSequenceInput, detectType, invalidLetters, wrapBlocks,
  toPairwiseText, toClustal, toFasta, InputError, MAX_CELLS,
  type AlignMode, type AlignOptions, type AlignmentResult, type MatrixType, type ColumnClass,
} from '@/core/align';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SCIENCE } from './science';

interface State {
  seq1: string; seq2: string;
  type: 'auto' | MatrixType;
  matrix: string;
  match: number; mismatch: number;
  mode: AlignMode;
  gapOpen: number; gapExtend: number;
  width: number;
}
const DEFAULTS: State = {
  seq1: '>seq1\nMSTKYNPTQEEHLKAVFKADNDAVLCAEKLPSL', seq2: '>seq2\nMSTKYNPTQAEHLKAVFKADNDAV',
  type: 'auto', matrix: 'BLOSUM62', match: 5, mismatch: -4, mode: 'global', gapOpen: 10, gapExtend: 0.5, width: 60,
};
/** Above this many DP cells the alignment runs on demand instead of on every keystroke. */
const AUTO_CELLS = 4_000_000;

const MODE_LABEL: Record<AlignMode, string> = { global: 'Global (Needleman–Wunsch)', local: 'Local (Smith–Waterman)', semiglobal: 'Semi-global (free end gaps)' };
const CLASS_STYLE: Record<ColumnClass, string> = {
  identity: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100',
  similar: 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100',
  mismatch: 'bg-rose-100 text-rose-900 dark:bg-rose-900/60 dark:text-rose-100',
  gap: 'text-slate-400 dark:text-slate-500',
};

interface Prepared {
  s1: { name: string; seq: string; removed: string; records: number; detected: MatrixType };
  s2: { name: string; seq: string; removed: string; records: number; detected: MatrixType };
  type: MatrixType;
  opts: AlignOptions;
  cells: number;
  error?: string;
}

function prepare(s: State): Prepared {
  const p1 = parseSequenceInput(s.seq1), p2 = parseSequenceInput(s.seq2);
  const s1 = { ...p1, detected: detectType(p1.seq) }, s2 = { ...p2, detected: detectType(p2.seq) };
  const type: MatrixType = s.type === 'auto' ? (s1.seq && s2.seq && s1.detected !== s2.detected ? 'protein' : s1.detected) : s.type;
  const matrix = s.matrix === 'simple' ? simpleMatrix(s.match, s.mismatch, type)
    : (() => { const m = getMatrix(s.matrix); return m.type === type ? m : getMatrix(type === 'dna' ? 'EDNAFULL' : 'BLOSUM62'); })();
  const opts: AlignOptions = { mode: s.mode, matrix, gapOpen: s.gapOpen, gapExtend: s.gapExtend };
  const cells = (s1.seq.length + 1) * (s2.seq.length + 1);
  let error: string | undefined;
  if (!s1.seq || !s2.seq) error = 'Enter two sequences (FASTA or plain letters).';
  else if (s.type === 'auto' && s1.detected !== s2.detected) error = `Sequence 1 looks like ${s1.detected === 'dna' ? 'DNA' : 'protein'} and sequence 2 like ${s2.detected === 'dna' ? 'DNA' : 'protein'}. Choose the type explicitly to align them anyway.`;
  else {
    const b1 = invalidLetters(s1.seq, type), b2 = invalidLetters(s2.seq, type);
    if (b1 || b2) error = `Letters that are not ${type === 'dna' ? 'IUPAC nucleotides' : 'amino acids'}: ${[b1 && `sequence 1: ${b1}`, b2 && `sequence 2: ${b2}`].filter(Boolean).join('; ')}.`;
  }
  return { s1, s2, type, opts, cells, error };
}

function run(p: Prepared): { result?: AlignmentResult; error?: string } {
  try { return { result: align(p.s1.seq, p.s2.seq, p.opts) }; }
  catch (e) { if (e instanceof InputError) return { error: e.message }; throw e; }
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const inputCls = 'mono w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';
const selectCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

export default function View() {
  const [state, shareUrl] = useUrlState<State>('align', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const [requested, setRequested] = useState('');
  const [msg, setMsg] = useState('');
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 1500); };

  const prep = useMemo(() => prepare(s), [s]);
  const key = `${prep.s1.seq}|${prep.s2.seq}|${s.mode}|${prep.opts.matrix.name}|${s.gapOpen}|${s.gapExtend}`;
  const auto = prep.cells <= AUTO_CELLS;
  const { result, error } = useMemo(() => {
    if (prep.error) return { error: prep.error };
    if (!auto && requested !== key) return {};
    return run(prep);
  }, [prep, auto, requested, key]);
  const names: [string, string] = [prep.s1.name || 'seq1', prep.s2.name || 'seq2'];
  const blocks = useMemo(() => result ? wrapBlocks(result, s.width) : [], [result, s.width]);
  const copy = async (text: string, m: string) => { try { await navigator.clipboard.writeText(text); flash(m); } catch { flash('Copy failed'); } };

  const seqInput = (k: 'seq1' | 'seq2', label: string, p: Prepared['s1']) => (
    <label class="block">
      <span class="mb-1 flex items-baseline justify-between text-sm font-medium"><span>{label}</span>
        <span class="text-xs font-normal text-slate-500">{p.seq.length ? `${p.detected === 'dna' ? 'DNA' : 'protein'} · ${p.seq.length} ${p.detected === 'dna' ? 'nt' : 'aa'}${p.name ? ` · ${p.name}` : ''}` : 'empty'}</span></span>
      <textarea value={s[k]} onInput={e => set({ [k]: (e.target as HTMLTextAreaElement).value })} rows={4} spellcheck={false}
        placeholder="FASTA or raw sequence" class={`${inputCls} text-sm`} />
      {(p.removed || p.records > 1) && <span class="mt-1 block text-xs text-amber-700 dark:text-amber-300">
        {p.removed && `Ignored characters: ${p.removed}. `}{p.records > 1 && `${p.records} FASTA records found; only the first is used.`}</span>}
    </label>
  );
  const num = (k: 'gapOpen' | 'gapExtend' | 'match' | 'mismatch', label: string, min?: number, step: string = 'any') => (
    <label class="block"><span class="mb-1 block text-sm font-medium">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={s[k]}
        onInput={e => {
          const val = parseFloat((e.target as HTMLInputElement).value);
          if (Number.isFinite(val)) set({ [k]: val });
        }}
        class={inputCls}
      />
    </label>
  );

  const stats = result?.stats;
  const tile = (label: string, value: string, hint?: string) => (
    <div class="rounded-lg bg-slate-50 p-2 dark:bg-slate-800"><div class="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div class="mono text-lg font-semibold">{value}</div>{hint && <div class="text-xs text-slate-500">{hint}</div>}</div>
  );

  return (
    <ToolLayout icon="🔗" title="Alignment" blurb="Pairwise global, local and semi-global alignment with affine gaps (Gotoh), BLOSUM/PAM matrices and CLUSTAL/FASTA export."
      inputs={<>
        {seqInput('seq1', 'Sequence 1', prep.s1)}
        {seqInput('seq2', 'Sequence 2', prep.s2)}
        <div class="grid grid-cols-2 gap-3">
          <label class="block"><span class="mb-1 block text-sm font-medium">Sequence type</span>
            <select value={s.type} onChange={e => set({ type: (e.target as HTMLSelectElement).value as State['type'] })} class={selectCls}>
              <option value="auto">Auto ({prep.type === 'dna' ? 'DNA' : 'protein'})</option><option value="dna">DNA / RNA</option><option value="protein">Protein</option>
            </select></label>
          <label class="block"><span class="mb-1 block text-sm font-medium">Mode</span>
            <select value={s.mode} onChange={e => set({ mode: (e.target as HTMLSelectElement).value as AlignMode })} class={selectCls}>
              {(Object.keys(MODE_LABEL) as AlignMode[]).map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select></label>
        </div>
        <label class="block"><span class="mb-1 block text-sm font-medium">Substitution matrix</span>
          <select value={s.matrix === 'simple' ? 'simple' : prep.opts.matrix.name} onChange={e => set({ matrix: (e.target as HTMLSelectElement).value })} class={selectCls}>
            {matricesFor(prep.type).map(m => <option key={m.name} value={m.name}>{m.name}{m.scaling ? ` (${m.scaling.replace(/^.*?(1\/\d Bit|ln\(2\)\/\d).*$/, '$1')})` : ''}</option>)}
            <option value="simple">Simple match / mismatch</option>
          </select>
          <span class="mt-1 block text-xs text-slate-500">{prep.opts.matrix.notes ?? (s.matrix === 'simple' ? 'Every identical pair scores "match", every other pair "mismatch".' : prep.opts.matrix.source)}</span></label>
        {s.matrix === 'simple' && <div class="grid grid-cols-2 gap-3">{num('match', 'Match score')}{num('mismatch', 'Mismatch score')}</div>}
        <div class="grid grid-cols-2 gap-3">{num('gapOpen', 'Gap open penalty', 0)}{num('gapExtend', 'Gap extend penalty', 0)}</div>
        <p class="text-xs text-slate-500">A gap of k columns costs open + (k − 1) × extend, in matrix units. EMBOSS defaults are 10 / 0.5.</p>
        <label class="block"><span class="mb-1 block text-sm font-medium">Residues per line</span>
          <select value={s.width} onChange={e => set({ width: Number((e.target as HTMLSelectElement).value) })} class={selectCls}>
            {[40, 60, 80, 100].map(w => <option key={w} value={w}>{w}</option>)}</select></label>
        {!auto && <div class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-900/30">
          <p>{prep.s1.seq.length.toLocaleString()} × {prep.s2.seq.length.toLocaleString()} residues ({prep.cells.toLocaleString()} cells{prep.cells > MAX_CELLS ? `, above the ${MAX_CELLS.toLocaleString()} cell limit` : ''}); alignment runs on demand.</p>
          <button type="button" onClick={() => setRequested(key)} disabled={prep.cells > MAX_CELLS || !!prep.error}
            class="mt-2 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50">Align</button>
        </div>}
      </>}
      results={error ? <p role="alert" class="text-red-600">{error}</p> : !result ? <p class="text-slate-500">Press Align to run.</p> : <div class="space-y-4">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {tile('Score', Number.isInteger(result.score) ? String(result.score) : result.score.toFixed(2), `${prep.opts.matrix.name}, gaps ${s.gapOpen}/${s.gapExtend}`)}
          {stats && tile('Identity', `${stats.identityPct.toFixed(1)} %`, `${stats.identities}/${stats.columns} columns`)}
          {stats && tile('Similarity', `${stats.similarityPct.toFixed(1)} %`, `${stats.similarities}/${stats.columns} columns`)}
          {stats && tile('Gaps', `${stats.gapPct.toFixed(1)} %`, `${stats.gapColumns}/${stats.columns} columns`)}
          {tile('Length', String(result.stats.columns), result.mode === 'local' ? `${names[0]} ${result.start1}–${result.end1}, ${names[1]} ${result.start2}–${result.end2}` : result.mode === 'semiglobal' ? `scored ${result.scored1[0]}–${result.scored1[1]} / ${result.scored2[0]}–${result.scored2[1]}` : MODE_LABEL[result.mode].split(' ')[0])}
        </div>
        <p class="text-xs text-slate-500">Identity, similarity and gaps are per alignment column, gap columns included (EMBOSS convention). Similar = identical or positive matrix score.</p>
        <div data-testid="alignment" class="overflow-x-auto rounded-lg border border-slate-200 p-3 dark:border-slate-700" aria-label="Aligned sequences">
          {result.stats.columns === 0 ? <p class="text-slate-500">No positive-scoring local alignment; every aligned pair would score ≤ 0.</p> :
            blocks.map(b => {
              const w = Math.max(names[0].length, names[1].length, 4);
              const row = (name: string, from: number, seq: string, to: number, classes: ColumnClass[]) => (
                <div class="mono whitespace-pre text-sm leading-5">
                  <span class="text-slate-500">{name.padEnd(w)} {String(from).padStart(5)} </span>
                  {[...seq].map((ch, i) => <span key={i} class={CLASS_STYLE[classes[i]!]}>{ch}</span>)}
                  <span class="text-slate-500"> {to}</span>
                </div>
              );
              const cls = result.classes.slice(b.offset, b.offset + b.a1.length);
              return <div key={b.offset} class="mb-3">
                {row(names[0].slice(0, w), b.from1, b.a1, b.to1, cls)}
                <div class="mono whitespace-pre text-sm leading-5 text-slate-500">{' '.repeat(w + 7)}{b.mid}</div>
                {row(names[1].slice(0, w), b.from2, b.a2, b.to2, cls)}
              </div>;
            })}
        </div>
        <ul class="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300" aria-label="Legend">
          <li><span class={`mono rounded px-1 ${CLASS_STYLE.identity}`}>A</span> | identical</li>
          <li><span class={`mono rounded px-1 ${CLASS_STYLE.similar}`}>A</span> : similar (score &gt; 0)</li>
          <li><span class={`mono rounded px-1 ${CLASS_STYLE.mismatch}`}>A</span> . mismatch</li>
          <li><span class={`mono rounded px-1 ${CLASS_STYLE.gap}`}>-</span> gap</li>
        </ul>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" onClick={() => copy(toClustal(result, names, s.width), 'CLUSTAL copied')}>Copy CLUSTAL</button>
          <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" onClick={() => copy(toFasta(result, names, s.width), 'FASTA copied')}>Copy FASTA</button>
          <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" onClick={() => download('alignment.aln', toClustal(result, names, s.width))}>Download .aln</button>
          <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" onClick={() => download('alignment.fasta', toFasta(result, names, s.width))}>Download .fasta</button>
          <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" onClick={() => download('alignment.txt', `${toPairwiseText(result, names, prep.opts, s.width)}\n${scienceText(SCIENCE)}\n`)}>Download report</button>
          <span role="status" class="text-xs text-slate-500">{msg}</span>
        </div>
      </div>}
      actions={<ActionBar onCopy={() => result ? `${toPairwiseText(result, names, prep.opts, s.width)}\n${scienceText(SCIENCE)}` : (error ?? '')} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
