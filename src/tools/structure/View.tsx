import { useMemo, useState } from 'preact/hooks';
import {
  parsePdb,
  superimposeStructures,
  getDemoTrpCagePdb,
  type ParsedStructure,
  type StructureSuperpositionResult,
} from '@/core/protein/structure';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { StructureCanvas, type ColorScheme } from './StructureCanvas';
import { downloadText, toCsv } from '@/lib/export';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  mode: 'superposition' | 'single';
  colorA: ColorScheme;
  colorB: ColorScheme;
  showVectors: boolean;
  selectedPreset: string;
}

const DEFAULTS: State = {
  mode: 'superposition',
  colorA: 'secondary',
  colorB: 'solidB',
  showVectors: true,
  selectedPreset: 'trpcage',
};

export default function StructureView() {
  const [state, shareUrl] = useUrlState<State>('structure-viewer', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };

  const [rawPdbA, setRawPdbA] = useState<string>(() => getDemoTrpCagePdb().refPdb);
  const [rawPdbB, setRawPdbB] = useState<string>(() => getDemoTrpCagePdb().targetPdb);
  const [rcsbId, setRcsbId] = useState('1L2Y');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Parse structures
  const parsedA = useMemo((): ParsedStructure | null => {
    try {
      if (!rawPdbA.trim()) return null;
      return parsePdb(rawPdbA, 'Structure A');
    } catch {
      return null;
    }
  }, [rawPdbA]);

  const parsedB = useMemo((): ParsedStructure | null => {
    try {
      if (!rawPdbB.trim()) return null;
      return parsePdb(rawPdbB, 'Structure B');
    } catch {
      return null;
    }
  }, [rawPdbB]);

  // Compute Kabsch superposition
  const superposition = useMemo((): StructureSuperpositionResult | null => {
    if (s.mode !== 'superposition' || !parsedA || !parsedB) return null;
    try {
      return superimposeStructures(parsedA, parsedB);
    } catch {
      return null;
    }
  }, [s.mode, parsedA, parsedB]);

  // Handlers for loading PDB files
  function handleFileUpload(file: File, target: 'A' | 'B') {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      if (target === 'A') setRawPdbA(text);
      else setRawPdbB(text);
    };
    reader.readAsText(file);
  }

  async function handleFetchRcsb() {
    if (!rcsbId.trim()) return;
    setFetchLoading(true);
    setFetchError('');
    try {
      const id = rcsbId.trim().toUpperCase();
      const res = await fetch(`https://files.rcsb.org/download/${id}.pdb`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Could not find PDB entry "${id}"`);
      const text = await res.text();
      setRawPdbA(text);
      set({ mode: 'single' });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch from RCSB');
    } finally {
      setFetchLoading(false);
    }
  }

  function handleLoadPreset(presetKey: string) {
    set({ selectedPreset: presetKey });
    if (presetKey === 'trpcage') {
      const { refPdb, targetPdb } = getDemoTrpCagePdb();
      setRawPdbA(refPdb);
      setRawPdbB(targetPdb);
      set({ mode: 'superposition' });
    }
  }

  function handleExportSuperimposedPdb() {
    if (!superposition) return;
    const aligned = superposition.transformedStructureA;
    const lines = [
      `REMARK 200 SUPERIMPOSED WITH KABSCH ALGORITHM (1976)`,
      `REMARK 200 RMSD: ${superposition.rmsd.toFixed(3)} ANGSTROMS OVER ${superposition.pairedCount} CA ATOMS`,
      `REMARK 200 ROTATION MATRIX:`,
      `REMARK 200   ${superposition.rotation[0]!.join('  ')}`,
      `REMARK 200   ${superposition.rotation[1]!.join('  ')}`,
      `REMARK 200   ${superposition.rotation[2]!.join('  ')}`,
      `REMARK 200 TRANSLATION VECTOR:`,
      `REMARK 200   X: ${superposition.translation.x}  Y: ${superposition.translation.y}  Z: ${superposition.translation.z}`,
    ];

    aligned.allAtoms.forEach(a => {
      const sStr = a.serial.toString().padStart(5);
      const aStr = a.name.padEnd(4);
      const rStr = a.resName.padStart(3);
      const rsStr = a.resSeq.toString().padStart(4);
      const xStr = a.coord.x.toFixed(3).padStart(8);
      const yStr = a.coord.y.toFixed(3).padStart(8);
      const zStr = a.coord.z.toFixed(3).padStart(8);
      lines.push(`ATOM  ${sStr} ${aStr} ${rStr} ${a.chain}${rsStr}    ${xStr}${yStr}${zStr}  1.00 20.00           ${a.element}`);
    });
    lines.push('END');

    downloadText(lines.join('\n'), 'superimposed_aligned_A.pdb', 'chemical/x-pdb');
  }

  function handleExportDeviationsCsv() {
    if (!superposition) return;
    const rows = [
      ['Pair_Index', 'Residue_A', 'Chain_A', 'ResSeq_A', 'Residue_B', 'Chain_B', 'ResSeq_B', 'Deviation_Angstrom'],
      ...superposition.alignedResidues.map(r => [
        r.pairIndex,
        r.resA.resName,
        r.resA.chain,
        r.resA.resSeq,
        r.resB.resName,
        r.resB.chain,
        r.resB.resSeq,
        r.deviation,
      ]),
    ];
    downloadText(
      [
        `# Kabsch Ca Superposition Deviations`,
        `# Overall RMSD: ${superposition.rmsd} A`,
        toCsv(rows),
      ].join('\n'),
      'ca_rmsd_deviations.csv',
      'text/csv;charset=utf-8'
    );
  }

  const copyText = superposition ? [
    `3D Protein Superposition (Kabsch 1976):`,
    `Overall Cα RMSD: ${superposition.rmsd.toFixed(3)} Å across ${superposition.pairedCount} paired residues`,
    `Max Deviation: ${superposition.maxDeviation.toFixed(3)} Å | Median Deviation: ${superposition.medianDeviation.toFixed(3)} Å`,
    `Translation: (${superposition.translation.x}, ${superposition.translation.y}, ${superposition.translation.z}) Å`,
    '',
    scienceText(SCIENCE),
  ].join('\n') : (parsedA ? `Protein: ${parsedA.name} (${parsedA.sequence.length} aa, Rg = ${parsedA.radiusOfGyration} Å)` : '');

  return (
    <ToolLayout
      icon="🧊"
      title="3D Structure & RMSD Superposition"
      blurb="Interactive 3D protein viewer, PDB upload, and exact Kabsch Cα RMSD superposition."
      mobileResultSummary={
        s.mode === 'superposition' && superposition ? (
          <span>Cα RMSD: <strong class="text-accent-700 dark:text-accent-300 font-mono text-sm">{superposition.rmsd.toFixed(3)} Å</strong> ({superposition.pairedCount} res)</span>
        ) : (
          parsedA ? <span>{parsedA.sequence.length} residues · Rg = {parsedA.radiusOfGyration} Å</span> : <span>3D Viewer</span>
        )
      }
      inputs={
        <div class="space-y-4">
          {/* View Mode Toggle */}
          <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => set({ mode: 'superposition' })}
              class={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${s.mode === 'superposition' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              🔄 Superposition &amp; RMSD (2 Structures)
            </button>
            <button
              type="button"
              onClick={() => set({ mode: 'single' })}
              class={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${s.mode === 'single' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              🔬 Single Structure View
            </button>
          </div>

          {/* Quick Presets */}
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Load Preset Benchmark
            </label>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => handleLoadPreset('trpcage')}
                class={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition border ${s.selectedPreset === 'trpcage' ? 'bg-accent-600 text-white border-accent-600' : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                Trp-cage Miniprotein (1L2Y Ref vs Model 2)
              </button>
            </div>
          </div>

          {/* RCSB Direct Fetch */}
          <div class="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Fetch from RCSB Protein Data Bank:
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                value={rcsbId}
                maxLength={4}
                placeholder="4-letter PDB ID (e.g. 1UBQ, 1AKI, 1L2Y)"
                onInput={e => setRcsbId((e.target as HTMLInputElement).value)}
                class="flex-1 font-mono uppercase text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={fetchLoading}
                onClick={handleFetchRcsb}
                class="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 transition disabled:opacity-50"
              >
                {fetchLoading ? 'Fetching…' : 'Fetch PDB'}
              </button>
            </div>
            {fetchError && <p class="text-xs text-rose-600 dark:text-rose-400 font-semibold">{fetchError}</p>}
          </div>

          {/* Structure A Input */}
          <div class="space-y-2 rounded-xl border border-cyan-200 bg-cyan-50/30 p-3 dark:border-cyan-900/40 dark:bg-cyan-950/20">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-cyan-900 dark:text-cyan-300 uppercase tracking-wider">
                {s.mode === 'superposition' ? 'Structure A (Mobile / Transformed)' : 'Active Structure'}
              </span>
              <label class="text-[11px] font-semibold text-cyan-700 dark:text-cyan-400 cursor-pointer hover:underline">
                Upload .pdb
                <input
                  type="file"
                  accept=".pdb,.ent,.txt"
                  onChange={e => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleFileUpload(file, 'A');
                  }}
                  class="hidden"
                />
              </label>
            </div>

            {parsedA ? (
              <div class="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                <p><strong>{parsedA.caAtoms.length}</strong> Cα atoms · <strong>{parsedA.sequence.length}</strong> aa</p>
                <p class="font-mono text-[11px] text-slate-400 truncate">{parsedA.sequence}</p>
              </div>
            ) : (
              <p class="text-xs text-rose-600">No valid ATOM coordinates loaded</p>
            )}

            <div class="flex items-center gap-2 pt-1">
              <span class="text-[11px] text-slate-500">Coloring:</span>
              <select
                value={s.colorA}
                onChange={e => set({ colorA: (e.target as HTMLSelectElement).value as ColorScheme })}
                class="text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1"
              >
                <option value="secondary">Secondary Structure</option>
                <option value="rainbow">Rainbow (N → C)</option>
                <option value="rmsd">Cα RMSD Heatmap</option>
                <option value="solidA">Solid Cyan</option>
                <option value="chain">Chain ID</option>
              </select>
            </div>
          </div>

          {/* Structure B Input (Only in Superposition Mode) */}
          {s.mode === 'superposition' && (
            <div class="space-y-2 rounded-xl border border-orange-200 bg-orange-50/30 p-3 dark:border-orange-900/40 dark:bg-orange-950/20">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-orange-900 dark:text-orange-300 uppercase tracking-wider">
                  Structure B (Fixed Reference Target)
                </span>
                <label class="text-[11px] font-semibold text-orange-700 dark:text-orange-400 cursor-pointer hover:underline">
                  Upload .pdb
                  <input
                    type="file"
                    accept=".pdb,.ent,.txt"
                    onChange={e => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleFileUpload(file, 'B');
                    }}
                    class="hidden"
                  />
                </label>
              </div>

              {parsedB ? (
                <div class="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                  <p><strong>{parsedB.caAtoms.length}</strong> Cα atoms · <strong>{parsedB.sequence.length}</strong> aa</p>
                  <p class="font-mono text-[11px] text-slate-400 truncate">{parsedB.sequence}</p>
                </div>
              ) : (
                <p class="text-xs text-rose-600">No valid ATOM coordinates loaded</p>
              )}

              <div class="flex items-center gap-2 pt-1">
                <span class="text-[11px] text-slate-500">Coloring:</span>
                <select
                  value={s.colorB}
                  onChange={e => set({ colorB: (e.target as HTMLSelectElement).value as ColorScheme })}
                  class="text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1"
                >
                  <option value="solidB">Solid Orange</option>
                  <option value="secondary">Secondary Structure</option>
                  <option value="rainbow">Rainbow (N → C)</option>
                </select>
              </div>

              <label class="flex items-center gap-2 text-xs cursor-pointer select-none text-slate-600 dark:text-slate-300 pt-1">
                <input
                  type="checkbox"
                  checked={s.showVectors}
                  onChange={e => set({ showVectors: (e.target as HTMLInputElement).checked })}
                  class="rounded text-accent-600"
                />
                <span>Show Cα displacement vectors (dashed lines)</span>
              </label>
            </div>
          )}

          {/* External Mol* link */}
          <div class="pt-2 border-t border-slate-200 dark:border-slate-800">
            <a
              href={`https://molstar.org/viewer/?pdb=${rcsbId}`}
              target="_blank"
              rel="noopener noreferrer"
              class="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <span>Explore in Mol* Viewer (External WebGL)</span>
              <span>↗</span>
            </a>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* 3D Canvas Visualizer */}
          <div>
            <div class="flex items-center justify-between pb-2">
              <div class="flex items-center gap-2 text-xs font-semibold">
                <span class="text-slate-900 dark:text-slate-100">3D Backbone Canvas</span>
                {s.mode === 'superposition' && (
                  <span class="text-slate-400 font-normal">
                    · Cyan: Struct A (transformed) · Orange: Struct B (fixed)
                  </span>
                )}
              </div>
              {s.mode === 'superposition' && superposition && (
                <div class="flex gap-2">
                  <button
                    type="button"
                    onClick={handleExportSuperimposedPdb}
                    class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 transition shadow-2xs"
                  >
                    Download Aligned PDB
                  </button>
                  <button
                    type="button"
                    onClick={handleExportDeviationsCsv}
                    class="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Export CSV
                  </button>
                </div>
              )}
            </div>

            <StructureCanvas
              structureA={s.mode === 'superposition' && superposition ? superposition.transformedStructureA : parsedA}
              structureB={s.mode === 'superposition' ? parsedB : null}
              colorSchemeA={s.colorA}
              colorSchemeB={s.colorB}
              perResidueDeviations={superposition?.perResidueDeviations}
              showDistanceVectors={s.showVectors}
              height={440}
            />
          </div>

          {/* Superposition Metrics Cards */}
          {s.mode === 'superposition' && superposition && (
            <div class="space-y-3">
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/20 text-center">
                  <span class="text-xs text-indigo-700 dark:text-indigo-300 block font-semibold uppercase tracking-wider">Cα RMSD</span>
                  <span class="font-mono text-2xl font-bold text-indigo-900 dark:text-indigo-200">
                    {superposition.rmsd.toFixed(3)} Å
                  </span>
                  <span class="text-[11px] text-slate-400 block">{superposition.pairedCount} Cα pairs</span>
                </div>

                <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 text-center">
                  <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Max Deviation</span>
                  <span class="font-mono text-2xl font-bold text-rose-600 dark:text-rose-400">
                    {superposition.maxDeviation.toFixed(3)} Å
                  </span>
                  <span class="text-[11px] text-slate-400 block">worst aligned residue</span>
                </div>

                <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 text-center">
                  <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Median Deviation</span>
                  <span class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {superposition.medianDeviation.toFixed(3)} Å
                  </span>
                  <span class="text-[11px] text-slate-400 block">50th percentile</span>
                </div>

                <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 text-center">
                  <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Translation Norm</span>
                  <span class="font-mono text-2xl font-bold text-slate-800 dark:text-slate-200">
                    {Math.hypot(superposition.translation.x, superposition.translation.y, superposition.translation.z).toFixed(2)} Å
                  </span>
                  <span class="text-[11px] text-slate-400 block">shift applied to A</span>
                </div>
              </div>

              {/* Per-Residue Deviation Profile */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex items-center justify-between">
                  <h4 class="font-bold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                    Per-Residue Cα Deviation Profile along Sequence
                  </h4>
                  <span class="text-[11px] text-slate-400">Distance δ_i (Å)</span>
                </div>

                <div class="h-28 flex items-end gap-1 overflow-x-auto pb-2 pt-4 px-1 border-b border-slate-200 dark:border-slate-800">
                  {superposition.alignedResidues.map(r => {
                    const maxH = 80;
                    const maxDevVal = Math.max(3.0, superposition.maxDeviation);
                    const h = Math.max(4, Math.round((r.deviation / maxDevVal) * maxH));
                    const barColor = r.deviation < 0.5 ? '#3b82f6' : r.deviation < 1.2 ? '#10b981' : r.deviation < 2.5 ? '#f59e0b' : '#ef4444';
                    return (
                      <div
                        key={r.pairIndex}
                        title={`Res ${r.pairIndex}: ${r.resA.resName}${r.resA.resSeq} ↔ ${r.resB.resName}${r.resB.resSeq}: ${r.deviation.toFixed(3)} Å`}
                        class="flex flex-col items-center flex-1 min-w-4 group relative cursor-pointer"
                      >
                        <span class="text-[9px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition absolute -top-4">
                          {r.deviation.toFixed(1)}
                        </span>
                        <div
                          style={{ height: `${h}px`, backgroundColor: barColor }}
                          class="w-full rounded-t-xs transition hover:brightness-125"
                        />
                        <span class="text-[8px] font-mono text-slate-400 mt-1">
                          {r.resA.oneLetter}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Single Structure Metrics */}
          {s.mode === 'single' && parsedA && (
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 text-center">
                <span class="text-xs text-slate-500 block font-semibold uppercase">Total Residues</span>
                <span class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">{parsedA.sequence.length}</span>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 text-center">
                <span class="text-xs text-slate-500 block font-semibold uppercase">Radius of Gyration</span>
                <span class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">{parsedA.radiusOfGyration} Å</span>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 text-center">
                <span class="text-xs text-slate-500 block font-semibold uppercase">Chains</span>
                <span class="font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400">{parsedA.chains.length}</span>
              </div>
            </div>
          )}
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
