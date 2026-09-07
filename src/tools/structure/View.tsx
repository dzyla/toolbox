import { useMemo, useState } from 'preact/hooks';
import {
  parsePdb,
  getDemoTrpCagePdb,
  type ParsedStructure,
  type Chain,
} from '@/core/protein/structure';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { MolstarViewer } from './MolstarViewer';
import { downloadText } from '@/lib/export';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  pdbId: string;
}

const DEFAULTS: State = {
  pdbId: '1UBQ',
};

const PRESETS = [
  { id: '1UBQ', name: 'Ubiquitin', desc: '76 aa eukaryotic regulatory fold' },
  { id: '1L2Y', name: 'Trp-Cage', desc: '20 aa fast-folding miniprotein' },
  { id: '1AKI', name: 'Lysozyme', desc: '129 aa antibacterial enzyme' },
  { id: '4HHB', name: 'Hemoglobin', desc: 'Allosteric oxygen-transport tetramer (4 chains)' },
  { id: '1JGQ', name: '30S Ribosome', desc: '16S rRNA + 20 proteins + tRNA/mRNA complex (25 chains)' },
  { id: '1CRN', name: 'Crambin', desc: '46 aa high-resolution plant protein (0.83 Å)' },
  { id: '6M0J', name: 'SARS-CoV-2 RBD / ACE2', desc: 'Viral spike complex' },
];

function FormattedSequenceView({ sequence }: { sequence: string }) {
  const lineLength = 60;
  const chunkLength = 10;
  const lines: Array<{ index: number; text: string }> = [];

  for (let i = 0; i < sequence.length; i += lineLength) {
    const chunk = sequence.slice(i, i + lineLength);
    const subChunks: string[] = [];
    for (let j = 0; j < chunk.length; j += chunkLength) {
      subChunks.push(chunk.slice(j, j + chunkLength));
    }
    lines.push({ index: i + 1, text: subChunks.join(' ') });
  }

  return (
    <div class="font-mono text-xs max-h-64 overflow-y-auto rounded-lg bg-slate-950 text-slate-100 p-3 select-all border border-slate-800 space-y-1">
      {lines.map(line => (
        <div key={line.index} class="flex items-start gap-3">
          <span class="text-slate-500 select-none text-[11px] w-12 text-right shrink-0 font-mono">
            {line.index}
          </span>
          <span class="break-all tracking-wider text-slate-200">
            {line.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChainTypeBadge({ type }: { type: Chain['chainType'] }) {
  if (type === 'rna') {
    return (
      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
        RNA
      </span>
    );
  }
  if (type === 'dna') {
    return (
      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
        DNA
      </span>
    );
  }
  if (type === 'protein') {
    return (
      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
        Protein
      </span>
    );
  }
  if (type === 'mixed') {
    return (
      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
        Mixed
      </span>
    );
  }
  return (
    <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
      Ligand
    </span>
  );
}

export default function StructureView() {
  const [state, shareUrl] = useUrlState<State>('structure-viewer', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };

  const [rawPdb, setRawPdb] = useState<string>(() => getDemoTrpCagePdb().refPdb);
  const [inputPdb, setInputPdb] = useState(s.pdbId || '1UBQ');
  const [loadedPdb, setLoadedPdb] = useState(s.pdbId || '1UBQ');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [activeChain, setActiveChain] = useState<string>('all');
  const [copiedMessage, setCopiedMessage] = useState<string>('');
  const [chainSearch, setChainSearch] = useState<string>('');
  const [chainTypeFilter, setChainTypeFilter] = useState<'all' | 'protein' | 'rna' | 'dna' | 'ligand'>('all');
  const [showAllSequencesExpanded, setShowAllSequencesExpanded] = useState<boolean>(false);
  const [groupedLigandsView, setGroupedLigandsView] = useState<boolean>(true);

  async function copyPureSequence(chainOrAll: 'all' | string, e?: Event) {
    if (e) e.stopPropagation();
    if (!parsed) return;
    let textToCopy = '';
    let label = '';
    if (chainOrAll === 'all') {
      const polymerChains = parsed.chains.filter(c => c.polymerResidues.length > 0);
      if (polymerChains.length === 0) return;
      textToCopy = polymerChains
        .map(c => {
          const unit = c.chainType === 'rna' || c.chainType === 'dna' ? 'nt' : 'aa';
          const header = c.description
            ? `>Chain_${c.id} | ${c.description} (${c.polymerResidues.length} ${unit})`
            : `>Chain_${c.id} (${c.polymerResidues.length} ${unit})`;
          return `${header}\n${c.polymerResidues.map(r => r.oneLetter).join('')}`;
        })
        .join('\n');
      label = `all ${polymerChains.length} polymer chains`;
    } else {
      const chain = parsed.chains.find(c => c.id === chainOrAll);
      if (!chain || chain.polymerResidues.length === 0) return;
      textToCopy = chain.polymerResidues.map(r => r.oneLetter).join('');
      const unit = chain.chainType === 'rna' || chain.chainType === 'dna' ? 'nt' : 'aa';
      label = `Chain ${chain.id} (${chain.polymerResidues.length} ${unit})`;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedMessage(`Copied pure sequence for ${label} (heteroatoms excluded)!`);
      setTimeout(() => setCopiedMessage(''), 2500);
    } catch {
      setCopiedMessage('Failed to copy sequence');
      setTimeout(() => setCopiedMessage(''), 2500);
    }
  }

  // Parse structure
  const parsed = useMemo((): ParsedStructure | null => {
    try {
      if (!rawPdb.trim()) return null;
      return parsePdb(rawPdb, loadedPdb || 'Structure');
    } catch {
      return null;
    }
  }, [rawPdb, loadedPdb]);

  async function fetchPdbText(id: string): Promise<string> {
    const trimmed = id.trim().toUpperCase();
    if (!trimmed) throw new Error('Please enter a valid 4-character PDB ID');
    const res = await fetch(`https://files.rcsb.org/download/${trimmed}.pdb`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Could not find PDB entry "${trimmed}" on RCSB`);
    const text = await res.text();
    if (!text.includes('ATOM') && !text.includes('HETATM')) {
      throw new Error(`PDB entry "${trimmed}" does not contain standard atom coordinates`);
    }
    return text;
  }

  async function handleFetch(overrideId?: string) {
    const id = (overrideId || inputPdb).trim().toUpperCase();
    if (!id) return;
    setFetchLoading(true);
    setFetchError('');
    try {
      const text = await fetchPdbText(id);
      setRawPdb(text);
      setLoadedPdb(id);
      setInputPdb(id);
      set({ pdbId: id });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch PDB');
    } finally {
      setFetchLoading(false);
    }
  }

  function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const cleanName = file.name.replace(/\.[^/.]+$/, '').toUpperCase();
      setRawPdb(text);
      setLoadedPdb(cleanName);
      setInputPdb(cleanName);
      set({ pdbId: cleanName });
      setFetchError('');
    };
    reader.readAsText(file);
  }

  function handleDownloadPdb() {
    if (!rawPdb) return;
    const filename = `${(loadedPdb || 'structure').toLowerCase()}.pdb`;
    downloadText(rawPdb, filename, 'chemical/x-pdb');
  }

  const proteinChains = useMemo(() => parsed?.chains.filter(c => c.chainType === 'protein') || [], [parsed]);
  const rnaChains = useMemo(() => parsed?.chains.filter(c => c.chainType === 'rna') || [], [parsed]);
  const dnaChains = useMemo(() => parsed?.chains.filter(c => c.chainType === 'dna') || [], [parsed]);
  const ligandChains = useMemo(() => parsed?.chains.filter(c => c.chainType === 'ligand') || [], [parsed]);

  const filteredChains = useMemo(() => {
    if (!parsed) return [];
    return parsed.chains.filter(c => {
      if (chainTypeFilter !== 'all') {
        if (chainTypeFilter === 'protein' && c.chainType !== 'protein') return false;
        if (chainTypeFilter === 'rna' && c.chainType !== 'rna') return false;
        if (chainTypeFilter === 'dna' && c.chainType !== 'dna') return false;
        if (chainTypeFilter === 'ligand' && c.chainType !== 'ligand') return false;
      }
      if (chainSearch.trim()) {
        const q = chainSearch.trim().toLowerCase();
        const matchId = c.id.toLowerCase().includes(q);
        const matchDesc = c.description?.toLowerCase().includes(q);
        const matchType = c.chainType.toLowerCase().includes(q);
        if (!matchId && !matchDesc && !matchType) return false;
      }
      return true;
    });
  }, [parsed, chainTypeFilter, chainSearch]);

  const groupedLigands = useMemo(() => {
    if (!parsed) return [];
    const map = new Map<string, {
      id: string;
      name: string;
      count: number;
      totalAtoms: number;
      chains: string[];
      sampleResSeq: number;
    }>();
    for (const lig of parsed.ligands) {
      let entry = map.get(lig.id);
      if (!entry) {
        entry = {
          id: lig.id,
          name: lig.name,
          count: 0,
          totalAtoms: 0,
          chains: [],
          sampleResSeq: lig.resSeq,
        };
        map.set(lig.id, entry);
      }
      entry.count++;
      entry.totalAtoms += lig.atomCount;
      if (!entry.chains.includes(lig.chain)) {
        entry.chains.push(lig.chain);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [parsed]);

  const copyText = parsed ? [
    `Structure: ${loadedPdb || parsed.name}`,
    `Residues: ${parsed.sequence.length}`,
    `Chains (${parsed.chains.length}): ${parsed.chains.map(c => `${c.id}${c.description ? ` (${c.description})` : ''} [${c.polymerResidues.length} ${c.chainType === 'rna' || c.chainType === 'dna' ? 'nt' : 'aa'}${c.ligands.length ? ` + ${c.ligands.length} lig` : ''}]`).join(', ')}`,
    parsed.ligands.length > 0 ? `Ligands (${parsed.ligands.length}): ${groupedLigands.map(l => `${l.id} (${l.name}, ${l.count}x across Chains ${l.chains.join(',')})`).join('; ')}` : '',
    `Cα / Backbone Trace Atoms: ${parsed.caAtoms.length} | Total Atoms: ${parsed.allAtoms.length}`,
    `Radius of Gyration (Rg): ${parsed.radiusOfGyration} Å`,
    `Center of Geometry: (${parsed.center.x}, ${parsed.center.y}, ${parsed.center.z}) Å`,
    '',
    scienceText(SCIENCE),
  ].filter(Boolean).join('\n') : 'No structure loaded';

  return (
    <>
      <ToolLayout
      icon="🧊"
      title="3D Structure Viewer"
      blurb="Interactive 3D macromolecular structure viewer powered by Mol*, RCSB PDB fetch, local PDB upload, and coordinate metrics."
      wide={true}
      mobileResultSummary={
        parsed ? (
          <span>{loadedPdb}: <strong>{parsed.sequence.length.toLocaleString()} res</strong> · Rg = {parsed.radiusOfGyration} Å</span>
        ) : (
          <span>3D Viewer</span>
        )
      }
      inputs={
        <div class="space-y-4">
          {/* RCSB Fetch Box */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Fetch from RCSB Protein Data Bank
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                value={inputPdb}
                maxLength={10}
                placeholder="PDB ID (e.g. 1UBQ, 1AKI, 4HHB, 1JGQ)"
                onInput={e => setInputPdb((e.target as HTMLInputElement).value)}
                onKeyDown={e => { if (e.key === 'Enter') handleFetch(); }}
                class="flex-1 font-mono uppercase text-sm p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100 focus:ring-2 focus:ring-accent-500 focus:outline-hidden"
              />
              <button
                type="button"
                disabled={fetchLoading}
                onClick={() => handleFetch()}
                class="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition disabled:opacity-50 shadow-xs cursor-pointer"
              >
                {fetchLoading ? 'Fetching…' : 'Fetch & Load'}
              </button>
            </div>
            {fetchError && <p class="text-xs text-rose-600 dark:text-rose-400 font-medium">{fetchError}</p>}
          </div>

          {/* Benchmark Presets */}
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
              Quick Benchmarks &amp; Presets
            </span>
            <div class="grid grid-cols-2 gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setInputPdb(p.id);
                    handleFetch(p.id);
                  }}
                  class={`p-2 rounded-lg text-left border transition text-xs cursor-pointer ${
                    loadedPdb === p.id
                      ? 'bg-accent-50 border-accent-400 dark:bg-accent-950/40 dark:border-accent-700'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  <div class="font-mono font-bold text-slate-900 dark:text-slate-100">{p.id}</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">{p.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Local File Upload */}
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
              Upload Custom Structure File
            </span>
            <label class="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer hover:border-accent-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
              <span class="text-xs font-medium text-slate-600 dark:text-slate-300">
                Click or drag &amp; drop a <code class="font-mono font-semibold">.pdb</code> or <code class="font-mono font-semibold">.ent</code> file
              </span>
              <span class="text-[10px] text-slate-400 mt-1">Parsed locally in browser</span>
              <input
                type="file"
                accept=".pdb,.ent,.txt"
                onChange={e => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileUpload(file);
                }}
                class="hidden"
              />
            </label>
          </div>

          {/* Loaded Summary Card */}
          {parsed && (
            <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/60 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Current Entry: <strong class="font-mono text-accent-700 dark:text-accent-300">{loadedPdb || parsed.name}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleDownloadPdb}
                  class="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:underline cursor-pointer"
                >
                  Download .pdb ⤓
                </button>
              </div>
              <div class="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <div>Chains: <span class="font-mono font-semibold">{parsed.chains.map(c => c.id).join(', ')}</span></div>
                <div>Bounding box: <span class="font-mono text-[11px]">{(parsed.bounds.max.x - parsed.bounds.min.x).toFixed(1)} × {(parsed.bounds.max.y - parsed.bounds.min.y).toFixed(1)} × {(parsed.bounds.max.z - parsed.bounds.min.z).toFixed(1)} Å</span></div>
              </div>
            </div>
          )}
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Mol* Canvas */}
          <div>
            <div class="flex items-center justify-between pb-2">
              <span class="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                3D Backbone Canvas &amp; Interactive Mol* Visualization
              </span>
              <a
                href={`https://molstar.org/viewer/?pdb=${encodeURIComponent(loadedPdb || '1UBQ')}`}
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition inline-flex items-center gap-1 text-slate-700 dark:text-slate-300"
              >
                <span>Mol* Viewer Tab</span>
                <span>↗</span>
              </a>
            </div>

            <MolstarViewer
              rcsbId={loadedPdb || '1UBQ'}
              onSelectPdb={id => {
                setInputPdb(id);
                handleFetch(id);
              }}
              height={580}
            />
          </div>

          {/* Metrics Row */}
          {parsed && (
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 text-center shadow-xs">
                <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Total Residues</span>
                <span class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">{parsed.sequence.length.toLocaleString()}</span>
                <span class="text-[10px] text-slate-400 block mt-0.5">
                  {rnaChains.length > 0 ? 'amino acids & nucleotides' : 'amino acids'}
                </span>
              </div>

              <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 text-center shadow-xs">
                <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Radius of Gyration</span>
                <span class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">{parsed.radiusOfGyration} Å</span>
                <span class="text-[10px] text-slate-400 block mt-0.5">molecular compactness</span>
              </div>

              <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 text-center shadow-xs">
                <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Chains</span>
                <span class="font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400">{parsed.chains.length}</span>
                <span class="text-[10px] text-slate-400 block mt-0.5">
                  {proteinChains.length > 0 && rnaChains.length > 0
                    ? `${proteinChains.length} prot, ${rnaChains.length} rna`
                    : `${parsed.chains.length} subunits`}
                </span>
              </div>

              <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 text-center shadow-xs">
                <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Cα Atoms</span>
                <span class="font-mono text-2xl font-bold text-cyan-600 dark:text-cyan-400">{parsed.caAtoms.length.toLocaleString()}</span>
                <span class="text-[10px] text-slate-400 block mt-0.5">
                  {rnaChains.length > 0 ? 'Cα & nucleic P trace' : 'backbone alpha carbons'}
                </span>
              </div>

              <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 text-center shadow-xs col-span-2 sm:col-span-1">
                <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Total Atoms</span>
                <span class="font-mono text-2xl font-bold text-slate-800 dark:text-slate-200">{parsed.allAtoms.length.toLocaleString()}</span>
                <span class="text-[10px] text-slate-400 block mt-0.5">ATOM + HETATM</span>
              </div>
            </div>
          )}

          {/* Sequence & Chain Details */}
          {parsed && (
            <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3 shadow-xs">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Primary Sequence &amp; Chain Composition
                </span>

                <div class="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={(e) => copyPureSequence('all', e)}
                    class="px-2 py-1 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 border border-emerald-300 dark:border-emerald-800 transition flex items-center gap-1 cursor-pointer"
                    title="Copy all polymer sequences as FASTA format (heteroatoms excluded)"
                  >
                    <span>📋 Copy All Clean (FASTA)</span>
                  </button>

                  {/* Compact selector for large complexes with >8 chains */}
                  {parsed.chains.length > 8 ? (
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setActiveChain('all'); setShowAllSequencesExpanded(false); }}
                        class={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                          activeChain === 'all'
                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        All Subunits ({parsed.chains.length})
                      </button>
                      <select
                        value={activeChain}
                        onChange={e => {
                          const val = (e.target as HTMLSelectElement).value;
                          setActiveChain(val);
                          if (val === 'all') setShowAllSequencesExpanded(false);
                        }}
                        class="text-xs font-mono p-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100 max-w-[200px] truncate"
                        title="Jump directly to inspect a chain"
                      >
                        <option value="all">Jump to Chain…</option>
                        {parsed.chains.map(c => {
                          const unit = c.chainType === 'rna' || c.chainType === 'dna' ? 'nt' : 'aa';
                          const name = c.description ? ` - ${c.description}` : '';
                          return (
                            <option key={c.id} value={c.id}>
                              Chain {c.id}: {c.polymerResidues.length || c.residues.length} {unit}{name}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ) : (
                    <div class="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { setActiveChain('all'); setShowAllSequencesExpanded(false); }}
                        class={`px-2 py-0.5 rounded text-xs font-medium transition cursor-pointer ${
                          activeChain === 'all'
                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        All ({parsed.chains.length})
                      </button>
                      {parsed.chains.map(c => {
                        const label = c.isLigandOnly
                          ? `Chain ${c.id} [Ligand]`
                          : `Chain ${c.id} (${c.polymerResidues.length || c.residues.length})`;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setActiveChain(c.id)}
                            class={`px-2 py-0.5 rounded text-xs font-medium transition cursor-pointer ${
                              activeChain === c.id
                                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Subunits Composition Table (rendered when activeChain === 'all' and complex has >3 chains, unless user explicitly expands all sequences) */}
              {activeChain === 'all' && parsed.chains.length > 3 && !showAllSequencesExpanded ? (
                <div class="space-y-3">
                  {/* Filter & Search Bar */}
                  <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5 flex-1">
                      <input
                        type="text"
                        placeholder="Filter subunits by chain ID or name (e.g. A, tRNA, S7, 16S)..."
                        value={chainSearch}
                        onInput={e => setChainSearch((e.target as HTMLInputElement).value)}
                        class="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-accent-500 focus:outline-hidden"
                      />
                      {chainSearch && (
                        <button
                          type="button"
                          onClick={() => setChainSearch('')}
                          class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div class="flex items-center gap-1 shrink-0 overflow-x-auto text-xs">
                      <button
                        type="button"
                        onClick={() => setChainTypeFilter('all')}
                        class={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                          chainTypeFilter === 'all'
                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        All ({parsed.chains.length})
                      </button>
                      {proteinChains.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setChainTypeFilter('protein')}
                          class={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                            chainTypeFilter === 'protein'
                              ? 'bg-emerald-700 text-white font-semibold'
                              : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100'
                          }`}
                        >
                          Proteins ({proteinChains.length})
                        </button>
                      )}
                      {rnaChains.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setChainTypeFilter('rna')}
                          class={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                            chainTypeFilter === 'rna'
                              ? 'bg-purple-700 text-white font-semibold'
                              : 'bg-purple-50 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 hover:bg-purple-100'
                          }`}
                        >
                          RNA ({rnaChains.length})
                        </button>
                      )}
                      {dnaChains.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setChainTypeFilter('dna')}
                          class={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                            chainTypeFilter === 'dna'
                              ? 'bg-sky-700 text-white font-semibold'
                              : 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 hover:bg-sky-100'
                          }`}
                        >
                          DNA ({dnaChains.length})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Subunit Overview Banner */}
                  <div class="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 text-xs">
                    <div class="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-400">
                      {proteinChains.length > 0 && (
                        <span class="inline-flex items-center gap-1.5 font-medium">
                          <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          <span>{proteinChains.length} Protein Subunits ({proteinChains.reduce((a, c) => a + c.polymerResidues.length, 0).toLocaleString()} aa)</span>
                        </span>
                      )}
                      {rnaChains.length > 0 && (
                        <span class="inline-flex items-center gap-1.5 font-medium">
                          <span class="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                          <span>{rnaChains.length} RNA Molecules ({rnaChains.reduce((a, c) => a + c.polymerResidues.length, 0).toLocaleString()} nt)</span>
                        </span>
                      )}
                      {dnaChains.length > 0 && (
                        <span class="inline-flex items-center gap-1.5 font-medium">
                          <span class="w-2 h-2 rounded-full bg-sky-500 inline-block" />
                          <span>{dnaChains.length} DNA Strands ({dnaChains.reduce((a, c) => a + c.polymerResidues.length, 0).toLocaleString()} nt)</span>
                        </span>
                      )}
                      {parsed.ligands.length > 0 && (
                        <span class="inline-flex items-center gap-1.5 font-medium">
                          <span class="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                          <span>{parsed.ligands.length} Ligands/Ions</span>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAllSequencesExpanded(true)}
                      class="text-[11px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:underline cursor-pointer"
                    >
                      Show All Sequences Expanded ▾
                    </button>
                  </div>

                  {/* Subunit Composition Table */}
                  <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table class="w-full text-xs text-left border-collapse">
                      <thead class="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] font-bold">
                        <tr>
                          <th class="p-2.5">Chain</th>
                          <th class="p-2.5">Subunit / Molecule Name</th>
                          <th class="p-2.5">Type</th>
                          <th class="p-2.5">Length</th>
                          <th class="p-2.5">Residue Range</th>
                          <th class="p-2.5">Backbone Trace</th>
                          <th class="p-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredChains.map(c => {
                          const unit = c.chainType === 'rna' || c.chainType === 'dna' ? 'nt' : 'aa';
                          const traceLabel = c.chainType === 'rna' || c.chainType === 'dna' ? 'P trace' : 'Cα trace';
                          const caCount = c.polymerResidues.filter(r => r.caAtom).length;
                          return (
                            <tr key={c.id} class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                              <td class="p-2.5 font-mono font-bold text-slate-900 dark:text-slate-100">
                                <span class="px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                                  {c.id}
                                </span>
                              </td>
                              <td class="p-2.5">
                                <div class="font-medium text-slate-800 dark:text-slate-200">
                                  {c.description || (c.isLigandOnly ? 'Hetero/Ligand Group' : `Chain ${c.id}`)}
                                </div>
                                {c.ligands.length > 0 && (
                                  <div class="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                                    +{c.ligands.length} ligand{c.ligands.length !== 1 ? 's' : ''} ({c.ligands.map(l => l.resName).join(', ')})
                                  </div>
                                )}
                              </td>
                              <td class="p-2.5">
                                <ChainTypeBadge type={c.chainType} />
                              </td>
                              <td class="p-2.5 font-mono">
                                {c.polymerResidues.length > 0 ? (
                                  <span>{c.polymerResidues.length.toLocaleString()} {unit}</span>
                                ) : (
                                  <span class="text-slate-400">—</span>
                                )}
                              </td>
                              <td class="p-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                {c.polymerResidues.length > 0
                                  ? `${c.polymerResidues[0]?.resSeq}–${c.polymerResidues[c.polymerResidues.length - 1]?.resSeq}`
                                  : '—'}
                              </td>
                              <td class="p-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                {caCount > 0 ? `${caCount.toLocaleString()} ${traceLabel}` : '—'}
                              </td>
                              <td class="p-2.5 text-right whitespace-nowrap">
                                <div class="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setActiveChain(c.id)}
                                    class="px-2.5 py-1 rounded text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition cursor-pointer shadow-xs"
                                    title={`Inspect Chain ${c.id} detailed sequence and coordinates`}
                                  >
                                    🔍 Inspect
                                  </button>
                                  {c.polymerResidues.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => copyPureSequence(c.id, e)}
                                      class="px-2 py-1 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition cursor-pointer"
                                      title="Copy clean sequence (heteroatoms excluded)"
                                    >
                                      📋 Copy
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Detailed sequence view for inspected chain or expanded chains */
                <div class="space-y-3">
                  {/* If user is inspecting single chain in multi-chain complex, show back button */}
                  {activeChain !== 'all' && (
                    <div class="flex items-center justify-between pb-1">
                      <button
                        type="button"
                        onClick={() => { setActiveChain('all'); setShowAllSequencesExpanded(false); }}
                        class="text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>← Back to Subunits Overview</span>
                      </button>
                    </div>
                  )}

                  {/* If user expanded all sequences in multi-chain complex, show collapse button */}
                  {activeChain === 'all' && parsed.chains.length > 3 && showAllSequencesExpanded && (
                    <div class="flex items-center justify-between pb-1">
                      <span class="text-xs text-slate-500 font-medium">Viewing all {parsed.chains.length} sequences</span>
                      <button
                        type="button"
                        onClick={() => setShowAllSequencesExpanded(false)}
                        class="text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>↑ Collapse to Subunits Table</span>
                      </button>
                    </div>
                  )}

                  <div class="space-y-2">
                    {parsed.chains
                      .filter(c => activeChain === 'all' || activeChain === c.id)
                      .map(c => {
                        const unit = c.chainType === 'rna' || c.chainType === 'dna' ? 'nucleotides' : 'residues';
                        const pureSeq = c.polymerResidues.map(r => r.oneLetter).join('');

                        return (
                          <div key={c.id} class="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                            <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                              <div class="flex flex-wrap items-center gap-2">
                                <span class="font-bold text-slate-900 dark:text-slate-100">Chain {c.id}</span>
                                <ChainTypeBadge type={c.chainType} />
                                {c.description && (
                                  <span class="text-slate-600 dark:text-slate-400 font-normal">
                                    · {c.description}
                                  </span>
                                )}
                                <span>
                                  · {c.polymerResidues.length} {unit}
                                  {c.ligands.length > 0 && (
                                    <span class="text-amber-700 dark:text-amber-400 font-normal">
                                      {' '}+ {c.ligands.length} ligand{c.ligands.length !== 1 ? 's' : ''} ({c.ligands.map(l => l.resName).join(', ')})
                                    </span>
                                  )}
                                </span>
                              </div>

                              <div class="flex items-center gap-2">
                                {!c.isLigandOnly && c.polymerResidues.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => copyPureSequence(c.id, e)}
                                    class="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition flex items-center gap-1 cursor-pointer"
                                    title="Copy pure sequence (excluding heteroatoms and ligands)"
                                  >
                                    <span>📋 Copy Clean Sequence</span>
                                  </button>
                                )}
                                <span class="text-[11px] text-slate-400 font-mono">
                                  {c.polymerResidues.length > 0
                                    ? `Residues ${c.polymerResidues[0]?.resSeq}–${c.polymerResidues[c.polymerResidues.length - 1]?.resSeq}`
                                    : c.residues.length > 0
                                    ? `Residues ${c.residues[0]?.resSeq}–${c.residues[c.residues.length - 1]?.resSeq}`
                                    : ''}
                                </span>
                              </div>
                            </div>

                            {/* Pure polymer sequence (clickable to copy, formatted into scrollable container) */}
                            {!c.isLigandOnly && c.polymerResidues.length > 0 ? (
                              <div
                                onClick={() => copyPureSequence(c.id)}
                                title="Click to copy clean sequence (heteroatoms excluded)"
                                class="cursor-pointer"
                              >
                                <FormattedSequenceView sequence={pureSeq} />
                              </div>
                            ) : (
                              <div class="font-mono text-xs text-slate-800 dark:text-slate-200 tracking-wider break-all leading-relaxed select-all">
                                {c.residues.map(r => {
                                  if (r.isLigand) {
                                    return (
                                      <span
                                        key={`${r.chain}_${r.resSeq}_${r.resName}`}
                                        title={`${r.fullName || r.resName} (Chain ${r.chain}, #${r.resSeq})`}
                                        class="inline-flex items-center px-1.5 py-0.5 mx-0.5 my-0.5 rounded text-[11px] font-bold font-mono bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800 select-all shadow-2xs cursor-help"
                                      >
                                        [{r.resName}]
                                      </span>
                                    );
                                  }
                                  if (r.isWater) return null;
                                  return <span key={`${r.chain}_${r.resSeq}`}>{r.oneLetter}</span>;
                                })}
                              </div>
                            )}

                            {c.ligands.length > 0 && (
                              <div class="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center gap-1.5 text-xs">
                                <span class="text-[11px] font-semibold text-slate-500">Ligands &amp; Heteroatoms in chain ({c.ligands.length}):</span>
                                {c.ligands.map(l => (
                                  <span
                                    key={`${l.chain}_${l.resSeq}_${l.resName}`}
                                    class="inline-flex items-center gap-1 text-[11px] bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800"
                                  >
                                    <strong class="font-mono">[{l.resName}]</strong>
                                    <span class="text-slate-400 font-mono text-[10px]">#{l.resSeq}</span>
                                    {l.fullName && l.fullName !== l.resName && (
                                      <span class="text-slate-500 text-[10px]">({l.fullName})</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dedicated Ligands Card */}
          {parsed && parsed.ligands.length > 0 && (
            <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3 shadow-xs">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <span>🧪</span> Ligands &amp; Cofactors ({parsed.ligands.length})
                </span>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] text-slate-400">
                    {groupedLigands.length} unique species
                  </span>
                  {groupedLigands.length < parsed.ligands.length && (
                    <button
                      type="button"
                      onClick={() => setGroupedLigandsView(!groupedLigandsView)}
                      class="text-[11px] font-semibold px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      {groupedLigandsView ? 'Show Individual Instances' : 'Consolidate by Molecule'}
                    </button>
                  )}
                </div>
              </div>

              {groupedLigandsView ? (
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {groupedLigands.map(group => (
                    <div
                      key={group.id}
                      class="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex flex-col justify-between gap-2"
                    >
                      <div class="flex items-start justify-between gap-2">
                        <div>
                          <div class="flex items-center gap-2">
                            <span class="font-mono font-bold text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                              {group.id}
                            </span>
                            <span class="font-semibold text-xs text-slate-900 dark:text-slate-100">
                              {group.count} {group.count === 1 ? 'molecule' : 'molecules'}
                            </span>
                          </div>
                          <div class="text-xs text-slate-700 dark:text-slate-300 font-medium mt-1" title={group.name}>
                            {group.name}
                          </div>
                        </div>
                        <span class="text-[10px] text-slate-400 shrink-0 font-mono">
                          {group.totalAtoms} atoms
                        </span>
                      </div>

                      <div class="text-[11px] text-slate-500 dark:text-slate-400 font-mono pt-1.5 border-t border-slate-200/60 dark:border-slate-800/80">
                        Found in Chains: {group.chains.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                  {parsed.ligands.map(lig => (
                    <div
                      key={`${lig.chain}_${lig.resSeq}_${lig.id}`}
                      class="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between gap-2"
                    >
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="font-mono font-bold text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                            {lig.id}
                          </span>
                          <span class="font-mono text-[11px] text-slate-500">Chain {lig.chain}:{lig.resSeq}</span>
                        </div>
                        <div class="text-xs text-slate-700 dark:text-slate-300 font-medium truncate mt-0.5" title={lig.name}>
                          {lig.name}
                        </div>
                      </div>
                      <span class="text-[10px] text-slate-400 shrink-0 font-mono">{lig.atomCount} atoms</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
    {copiedMessage && (
      <div class="fixed bottom-4 right-4 z-50 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg flex items-center gap-2">
        <span>✓</span>
        <span>{copiedMessage}</span>
      </div>
    )}
    </>
  );
}
