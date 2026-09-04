import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { DecimalInput } from '@/app/components/DecimalInput';
import { SCIENCE } from './science';
import GibsonView from '@/tools/gibson/View';
import MutagenesisView from '@/tools/mutagenesis/View';
import { RESTRICTION_ENZYMES } from '@/core/plasmid';

type CloningTab = 'gibson' | 'mutagenesis' | 'restriction' | 'goldengate';

interface State {
  activeTab: CloningTab;
  // Restriction Ligation State
  vectorBp: number;
  insertBp: number;
  vectorNg: number;
  vectorConc: number; // ng/uL
  insertConc: number; // ng/uL
  molarRatio: number; // e.g. 3 for 1:3
  enzyme5: string;
  enzyme3: string;
  // Golden Gate State
  ggEnzyme: string;
  ggVectorBp: number;
  ggFragmentCount: number;
}

const DEFAULTS: State = {
  activeTab: 'gibson',
  vectorBp: 4000,
  insertBp: 1200,
  vectorNg: 50,
  vectorConc: 25,
  insertConc: 20,
  molarRatio: 3,
  enzyme5: 'EcoRI',
  enzyme3: 'BamHI',
  ggEnzyme: 'BsaI',
  ggVectorBp: 4500,
  ggFragmentCount: 3,
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono';

const GG_ENZYMES = [
  { id: 'BsaI', name: 'BsaI-HFv2', site: 'GGTCTC(N1/N5)', temp: 37, overhangLen: 4, desc: 'Most widely used for MoClo Level 1 & general assemblies' },
  { id: 'BsmBI', name: 'BsmBI-v2 / Esp3I', site: 'CGTCTC(N1/N5)', temp: 42, overhangLen: 4, desc: 'Used for MoClo Level 2 & higher temperature assemblies' },
  { id: 'BbsI', name: 'BbsI-HF', site: 'GAAGAC(N2/N6)', temp: 37, overhangLen: 4, desc: 'Common in CRISPR guide cloning & MoClo Level 0' },
  { id: 'PaqCI', name: 'PaqCI', site: 'CACCTGC(N4/N8)', temp: 37, overhangLen: 4, desc: '7-base recognition with high fidelity for 5+ fragment assemblies' },
  { id: 'SapI', name: 'SapI', site: 'GCTCTTC(N1/N4)', temp: 37, overhangLen: 3, desc: '3-base overhang Type IIS assembly' },
];

export default function CloningSuiteView() {
  const [stateSig, shareUrl] = useUrlState<State>('cloning', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  // Restriction Ligation Math
  const requiredInsertNg = Math.round((s.vectorNg * (s.insertBp / Math.max(1, s.vectorBp)) * s.molarRatio) * 10) / 10;
  const vectorVolUl = Math.round((s.vectorNg / Math.max(0.1, s.vectorConc)) * 100) / 100;
  const insertVolUl = Math.round((requiredInsertNg / Math.max(0.1, s.insertConc)) * 100) / 100;
  const bufferVolUl = 2.0;
  const ligaseVolUl = 1.0;
  const totalDnaVol = vectorVolUl + insertVolUl;
  const waterVolUl = Math.max(0, Math.round((20.0 - totalDnaVol - bufferVolUl - ligaseVolUl) * 100) / 100);

  const enzyme5Obj = RESTRICTION_ENZYMES.find(e => e.enzyme === s.enzyme5);
  const enzyme3Obj = RESTRICTION_ENZYMES.find(e => e.enzyme === s.enzyme3);
  const isDirectional = s.enzyme5 !== s.enzyme3 && enzyme5Obj?.overhang !== 'blunt' && enzyme3Obj?.overhang !== 'blunt';
  const hasBlunt = enzyme5Obj?.overhang === 'blunt' || enzyme3Obj?.overhang === 'blunt';

  // Golden Gate 40 fmol calculation
  // Mass (ng) = fmol × 1e-6 × bp × 660
  const ggVectorMassNg = Math.round(40 * 1e-6 * s.ggVectorBp * 660 * 10) / 10;

  const copySummary = () => {
    if (s.activeTab === 'restriction') {
      const lines = [
        `Restriction-Ligation Reaction Plan:`,
        `Vector (${s.vectorBp} bp): ${s.vectorNg} ng (${vectorVolUl} µL at ${s.vectorConc} ng/µL)`,
        `Insert (${s.insertBp} bp): ${requiredInsertNg} ng (${insertVolUl} µL at ${s.insertConc} ng/µL) [${s.molarRatio}:1 molar ratio]`,
        `Cloning Enzymes: 5' ${s.enzyme5} + 3' ${s.enzyme3} (${isDirectional ? 'Directional' : hasBlunt ? 'Blunt-end' : 'Single-cut'})`,
        `Reaction Mix (20 µL Total):`,
        `  Vector DNA: ${vectorVolUl} µL`,
        `  Insert DNA: ${insertVolUl} µL`,
        `  10X T4 DNA Ligase Buffer: 2.0 µL`,
        `  T4 DNA Ligase (400 U/µL): 1.0 µL`,
        `  Nuclease-free Water: ${waterVolUl} µL`,
        `Incubation: ${hasBlunt ? '16°C overnight (or Rapid Ligation Buffer at 25°C)' : '16°C for 2 hours or room temp (25°C) for 15–30 min'}`,
      ];
      return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
    }
    if (s.activeTab === 'goldengate') {
      const selectedGg = GG_ENZYMES.find(e => e.id === s.ggEnzyme) ?? GG_ENZYMES[0]!;
      const lines = [
        `Golden Gate Assembly Plan (${selectedGg.name}):`,
        `Destination Vector (${s.ggVectorBp} bp): ~40 fmol (${ggVectorMassNg} ng)`,
        `Inserts (${s.ggFragmentCount} fragments): ~40 fmol each (1:1 molar ratio with vector)`,
        `Reaction Mix (20 µL): 40 fmol vector + 40 fmol each insert + 2 µL 10X T4 Ligase Buffer + 1 µL Type IIS Enzyme + 1 µL T4 DNA Ligase + H2O to 20 µL`,
        `Thermocycling Program:`,
        `  30 cycles: ${selectedGg.temp}°C for 3 min (digest) -> 16°C for 4 min (ligate)`,
        `  Final digest: 50°C for 5 min (cleaves remaining non-recombinant sites)`,
        `  Heat kill: 80°C for 5 min`,
      ];
      return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
    }
    return scienceText(SCIENCE);
  };

  return (
    <div class="space-y-4">
      {/* Top Suite Header & Tab Navigator */}
      <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-2xl">🧬</span>
              <h1 class="text-xl font-bold text-slate-900 dark:text-slate-100">
                Molecular Cloning Workbench
              </h1>
              <span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Unified Suite
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-1">
              Select and design recombinant constructs with all primary modern and classical cloning methodologies.
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 pt-4">
          <button
            type="button"
            onClick={() => set({ activeTab: 'gibson' })}
            class={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition ${
              s.activeTab === 'gibson'
                ? 'bg-accent-50 border-accent-500 text-accent-700 dark:bg-accent-950/60 dark:border-accent-400 dark:text-accent-300 shadow-sm ring-1 ring-accent-500'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <span>🧬</span>
            <span>Gibson / In-Fusion</span>
          </button>

          <button
            type="button"
            onClick={() => set({ activeTab: 'mutagenesis' })}
            class={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition ${
              s.activeTab === 'mutagenesis'
                ? 'bg-accent-50 border-accent-500 text-accent-700 dark:bg-accent-950/60 dark:border-accent-400 dark:text-accent-300 shadow-sm ring-1 ring-accent-500'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <span>🎯</span>
            <span>Site-Directed Mutagenesis</span>
          </button>

          <button
            type="button"
            onClick={() => set({ activeTab: 'restriction' })}
            class={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition ${
              s.activeTab === 'restriction'
                ? 'bg-accent-50 border-accent-500 text-accent-700 dark:bg-accent-950/60 dark:border-accent-400 dark:text-accent-300 shadow-sm ring-1 ring-accent-500'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <span>✂️</span>
            <span>Restriction &amp; Ligation</span>
          </button>

          <button
            type="button"
            onClick={() => set({ activeTab: 'goldengate' })}
            class={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition ${
              s.activeTab === 'goldengate'
                ? 'bg-accent-50 border-accent-500 text-accent-700 dark:bg-accent-950/60 dark:border-accent-400 dark:text-accent-300 shadow-sm ring-1 ring-accent-500'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <span>🔗</span>
            <span>Golden Gate (Type IIS)</span>
          </button>
        </div>
      </div>

      {/* Render Active Tab Tool View */}
      {s.activeTab === 'gibson' && <GibsonView embedded={true} />}
      {s.activeTab === 'mutagenesis' && <MutagenesisView embedded={true} />}

      {/* Restriction & Ligation View */}
      {s.activeTab === 'restriction' && (
        <ToolLayout
          icon="✂️"
          title="Restriction Digest &amp; Ligation Calculator"
          blurb="Calculate vector and insert stoichiometric masses, reaction volumes, compatible cohesive/blunt ends, and control setups."
          wide={true}
          embedded={true}
          inputs={
            <div class="space-y-4">
              {/* DNA Sizes & Vector Mass */}
              <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  DNA Construct Parameters
                </label>

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-slate-500 mb-1 font-medium">Vector Length (bp)</label>
                    <DecimalInput
                      class={FIELD}
                      value={s.vectorBp}
                      onChange={vectorBp => set({ vectorBp: Math.max(100, Math.round(vectorBp)) })}
                      min={100}
                      step={100}
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-slate-500 mb-1 font-medium">Insert Length (bp)</label>
                    <DecimalInput
                      class={FIELD}
                      value={s.insertBp}
                      onChange={insertBp => set({ insertBp: Math.max(10, Math.round(insertBp)) })}
                      min={10}
                      step={50}
                    />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label class="block text-xs text-slate-500 mb-1 font-medium">Vector Mass (ng)</label>
                    <DecimalInput
                      class={FIELD}
                      value={s.vectorNg}
                      onChange={vectorNg => set({ vectorNg: Math.max(5, Math.round(vectorNg)) })}
                      min={5}
                      step={10}
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-slate-500 mb-1 font-medium">Molar Ratio (Ins : Vec)</label>
                    <select
                      value={s.molarRatio}
                      onChange={e => set({ molarRatio: parseFloat((e.target as HTMLSelectElement).value) || 3 })}
                      class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold"
                    >
                      <option value="1">1 : 1 (Equal molarity)</option>
                      <option value="2">2 : 1 (Conservative)</option>
                      <option value="3">3 : 1 (Standard Sticky Ends)</option>
                      <option value="5">5 : 1 (High efficiency)</option>
                      <option value="7">7 : 1 (Blunt Ends / Difficult)</option>
                    </select>
                  </div>
                </div>

                {/* Concentrations */}
                <div class="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label class="block text-xs text-slate-500 mb-1 font-medium">Vector Conc (ng/µL)</label>
                    <DecimalInput
                      class={FIELD}
                      value={s.vectorConc}
                      onChange={vectorConc => set({ vectorConc: Math.max(0.1, vectorConc) })}
                      min={0.1}
                      step={1}
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-slate-500 mb-1 font-medium">Insert Conc (ng/µL)</label>
                    <DecimalInput
                      class={FIELD}
                      value={s.insertConc}
                      onChange={insertConc => set({ insertConc: Math.max(0.1, insertConc) })}
                      min={0.1}
                      step={1}
                    />
                  </div>
                </div>
              </div>

              {/* Restriction Enzymes */}
              <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Restriction Endonucleases
                </label>

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">5' Upstream Enzyme</label>
                    <select
                      value={s.enzyme5}
                      onChange={e => set({ enzyme5: (e.target as HTMLSelectElement).value })}
                      class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold"
                    >
                      {RESTRICTION_ENZYMES.map(en => (
                        <option key={en.enzyme} value={en.enzyme}>
                          {en.enzyme} ({en.pattern}, {en.overhang})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">3' Downstream Enzyme</label>
                    <select
                      value={s.enzyme3}
                      onChange={e => set({ enzyme3: (e.target as HTMLSelectElement).value })}
                      class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold"
                    >
                      {RESTRICTION_ENZYMES.map(en => (
                        <option key={en.enzyme} value={en.enzyme}>
                          {en.enzyme} ({en.pattern}, {en.overhang})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-500">Cloning Geometry:</span>
                    <span class={`font-bold ${isDirectional ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {isDirectional ? '✓ Directional (Dual Sticky)' : hasBlunt ? '⚠️ Blunt End' : '⚠️ Non-Directional (Single Cut)'}
                    </span>
                  </div>
                  {!isDirectional && (
                    <p class="text-[11px] text-amber-600 dark:text-amber-400">
                      Recommendation: Treat linearized vector with Alkaline Phosphatase (rSAP or CIP) to dephosphorylate 5' ends and eliminate background vector self-ligation.
                    </p>
                  )}
                </div>
              </div>
            </div>
          }
          results={
            <div class="space-y-4">
              {/* Ligation Overview Banner */}
              <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
                <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Calculated Insert Required
                    </span>
                    <div class="text-3xl font-black text-accent-600 dark:text-accent-400 font-mono mt-0.5">
                      {requiredInsertNg} <span class="text-sm font-bold text-slate-500">ng</span>
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="text-xs text-slate-400 block">Molar Ratio</span>
                    <span class="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {s.molarRatio} : 1
                    </span>
                  </div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Vector DNA Vol</span>
                    <span class="text-base font-bold font-mono text-slate-700 dark:text-slate-300">{vectorVolUl} µL</span>
                    <span class="text-[10px] text-slate-400 block">({s.vectorNg} ng)</span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Insert DNA Vol</span>
                    <span class="text-base font-bold font-mono text-accent-600 dark:text-accent-400">{insertVolUl} µL</span>
                    <span class="text-[10px] text-slate-400 block">({requiredInsertNg} ng)</span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">10X Ligase Buffer</span>
                    <span class="text-base font-bold font-mono text-slate-700 dark:text-slate-300">2.0 µL</span>
                    <span class="text-[10px] text-slate-400 block">Contains ATP</span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Nuclease-free H2O</span>
                    <span class="text-base font-bold font-mono text-slate-700 dark:text-slate-300">{waterVolUl} µL</span>
                    <span class="text-[10px] text-slate-400 block">Total 20 µL</span>
                  </div>
                </div>
              </div>

              {/* Pipetting Protocol Card */}
              <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Standard T4 DNA Ligation Setup (20 µL Reaction)
                </h3>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-400">
                        <th class="py-2 font-semibold">Component</th>
                        <th class="py-2 font-semibold text-right">Volume</th>
                        <th class="py-2 font-semibold text-right">Mass / Units</th>
                        <th class="py-2 font-semibold pl-4">Notes</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      <tr>
                        <td class="py-2 font-sans font-medium text-slate-700 dark:text-slate-300">Linearized Vector DNA</td>
                        <td class="py-2 text-right font-bold text-slate-900 dark:text-slate-100">{vectorVolUl} µL</td>
                        <td class="py-2 text-right text-slate-500">{s.vectorNg} ng</td>
                        <td class="py-2 font-sans text-slate-400 pl-4">Gel purified / dephosphorylated</td>
                      </tr>
                      <tr>
                        <td class="py-2 font-sans font-medium text-slate-700 dark:text-slate-300">Purified Insert DNA</td>
                        <td class="py-2 text-right font-bold text-accent-600 dark:text-accent-400">{insertVolUl} µL</td>
                        <td class="py-2 text-right text-slate-500">{requiredInsertNg} ng</td>
                        <td class="py-2 font-sans text-slate-400 pl-4">{s.molarRatio}:1 molar ratio over vector</td>
                      </tr>
                      <tr>
                        <td class="py-2 font-sans font-medium text-slate-700 dark:text-slate-300">10X T4 DNA Ligase Buffer</td>
                        <td class="py-2 text-right font-bold text-slate-900 dark:text-slate-100">2.0 µL</td>
                        <td class="py-2 text-right text-slate-500">1X final</td>
                        <td class="py-2 font-sans text-slate-400 pl-4">Thaw thoroughly and vortex (contains ATP)</td>
                      </tr>
                      <tr>
                        <td class="py-2 font-sans font-medium text-slate-700 dark:text-slate-300">T4 DNA Ligase</td>
                        <td class="py-2 text-right font-bold text-slate-900 dark:text-slate-100">1.0 µL</td>
                        <td class="py-2 text-right text-slate-500">400 Units</td>
                        <td class="py-2 font-sans text-slate-400 pl-4">Add last, mix gently by pipetting</td>
                      </tr>
                      <tr>
                        <td class="py-2 font-sans font-medium text-slate-700 dark:text-slate-300">Nuclease-free Water</td>
                        <td class="py-2 text-right font-bold text-slate-900 dark:text-slate-100">{waterVolUl} µL</td>
                        <td class="py-2 text-right text-slate-500">-</td>
                        <td class="py-2 font-sans text-slate-400 pl-4">Bring reaction volume to 20 µL</td>
                      </tr>
                      <tr class="font-bold border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                        <td class="py-2 font-sans">Total Volume</td>
                        <td class="py-2 text-right text-emerald-600 dark:text-emerald-400">20.0 µL</td>
                        <td class="py-2 text-right">-</td>
                        <td class="py-2 font-sans text-slate-400 pl-4">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                    <strong class="text-slate-700 dark:text-slate-300 block">Incubation Protocol</strong>
                    <p class="text-slate-600 dark:text-slate-400">
                      {hasBlunt
                        ? '• Incubate at 16°C overnight OR 2 hours at room temperature with high concentration T4 Ligase.'
                        : '• Incubate at 16°C for 2 hours OR at room temperature (25°C) for 10–30 minutes.'}
                    </p>
                    <p class="text-slate-600 dark:text-slate-400">• Heat inactivate at 65°C for 10 minutes (optional).</p>
                    <p class="text-slate-600 dark:text-slate-400">• Transform 2–5 µL into 50 µL competent E. coli cells.</p>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                    <strong class="text-slate-700 dark:text-slate-300 block">Recommended Controls</strong>
                    <p class="text-slate-600 dark:text-slate-400">• <strong>Control 1 (Self-ligation):</strong> Vector + Ligase (no insert) → measures background vector re-circularization.</p>
                    <p class="text-slate-600 dark:text-slate-400">• <strong>Control 2 (Undigested):</strong> Vector alone (no ligase) → measures uncut parent plasmid contamination.</p>
                  </div>
                </div>
              </div>
            </div>
          }
          actions={<ActionBar onCopy={copySummary} shareUrl={shareUrl} />}
          science={<SciencePanel science={SCIENCE} />}
        />
      )}

      {/* Golden Gate Assembly View */}
      {s.activeTab === 'goldengate' && (
        <ToolLayout
          icon="🔗"
          title="Golden Gate (Type IIS) Assembly Designer"
          blurb="One-pot simultaneous digestion and ligation using Type IIS restriction enzymes (BsaI, BsmBI, BbsI, PaqCI, SapI)."
          wide={true}
          embedded={true}
          inputs={
            <div class="space-y-4">
              <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Type IIS Enzyme System
                </label>
                <div class="space-y-2">
                  {GG_ENZYMES.map(en => (
                    <label
                      key={en.id}
                      class={`flex items-start gap-3 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                        s.ggEnzyme === en.id
                          ? 'border-accent-500 bg-accent-50/50 dark:border-accent-400 dark:bg-accent-950/40'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="gg_enzyme"
                        checked={s.ggEnzyme === en.id}
                        onChange={() => set({ ggEnzyme: en.id })}
                        class="mt-0.5 text-accent-600 focus:ring-accent-500"
                      />
                      <div class="flex-1">
                        <div class="flex items-center justify-between">
                          <strong class="text-slate-900 dark:text-slate-100 font-bold">{en.name}</strong>
                          <span class="font-mono text-[11px] text-accent-600 dark:text-accent-400 font-semibold">{en.temp}°C</span>
                        </div>
                        <div class="font-mono text-[11px] text-slate-500 mt-0.5">{en.site} ({en.overhangLen} bp overhang)</div>
                        <p class="text-[11px] text-slate-500 mt-0.5">{en.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Construct Metrics
                </label>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Destination Vector Length (bp)</label>
                  <DecimalInput
                    class={FIELD}
                    value={s.ggVectorBp}
                    onChange={ggVectorBp => set({ ggVectorBp: Math.max(500, Math.round(ggVectorBp)) })}
                    min={500}
                    step={100}
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Number of Inserts</label>
                  <DecimalInput
                    class={FIELD}
                    value={s.ggFragmentCount}
                    onChange={ggFragmentCount => set({ ggFragmentCount: Math.max(1, Math.min(12, Math.round(ggFragmentCount))) })}
                    min={1}
                    max={12}
                    step={1}
                  />
                </div>
              </div>
            </div>
          }
          results={
            <div class="space-y-4">
              {/* Assembly Overview Banner */}
              <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
                <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Golden Gate Assembly System
                    </span>
                    <div class="text-2xl font-black text-accent-600 dark:text-accent-400 font-mono mt-0.5">
                      {s.ggEnzyme} One-Pot Reaction
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="text-xs text-slate-400 block">Optimal Stoichiometry</span>
                    <span class="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      ~40 fmol each
                    </span>
                  </div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Destination Vector</span>
                    <span class="text-base font-bold font-mono text-slate-700 dark:text-slate-300">~{ggVectorMassNg} ng</span>
                    <span class="text-[10px] text-slate-400 block">40 fmol ({s.ggVectorBp} bp)</span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Inserts</span>
                    <span class="text-base font-bold font-mono text-accent-600 dark:text-accent-400">{s.ggFragmentCount} Fragments</span>
                    <span class="text-[10px] text-slate-400 block">40 fmol each</span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Overhang Type</span>
                    <span class="text-xs font-bold text-emerald-600 dark:text-emerald-400">4 bp Non-Palindromic</span>
                    <span class="text-[10px] text-slate-400 block">Cohesive Type IIS</span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Cycling Profile</span>
                    <span class="text-xs font-bold text-sky-600 dark:text-sky-400">30 Cycles</span>
                    <span class="text-[10px] text-slate-400 block">Digest ⇄ Ligate</span>
                  </div>
                </div>
              </div>

              {/* Standard MoClo / Golden Gate 4-bp Overhangs Guide */}
              <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Standard MoClo / Plant / Yeast Golden Gate Overhangs
                </h3>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div class="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <span class="text-[10px] text-slate-400 block font-sans">Promoter ➔ 5' UTR</span>
                    <strong class="text-indigo-600 dark:text-indigo-400 text-sm">GGAG ... AATG</strong>
                  </div>
                  <div class="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <span class="text-[10px] text-slate-400 block font-sans">CDS / Open Reading Frame</span>
                    <strong class="text-emerald-600 dark:text-emerald-400 text-sm">AATG ... GCTT</strong>
                  </div>
                  <div class="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <span class="text-[10px] text-slate-400 block font-sans">Terminator / 3' UTR</span>
                    <strong class="text-rose-600 dark:text-rose-400 text-sm">GCTT ... CGCT</strong>
                  </div>
                  <div class="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <span class="text-[10px] text-slate-400 block font-sans">Vector Backbone</span>
                    <strong class="text-amber-600 dark:text-amber-400 text-sm">CGCT ... GGAG</strong>
                  </div>
                </div>
              </div>

              {/* Thermocycling Protocol Card */}
              <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Recommended One-Pot Golden Gate Thermocycling Protocol
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <strong class="text-slate-700 dark:text-slate-300 block">Cycling Profile (30 Cycles)</strong>
                    <p class="text-slate-600 dark:text-slate-400">
                      1. <strong>Digestion:</strong> {s.ggEnzyme === 'BsmBI' ? '42°C' : '37°C'} for 3 minutes (Type IIS endonuclease cuts).
                    </p>
                    <p class="text-slate-600 dark:text-slate-400">
                      2. <strong>Ligation:</strong> 16°C for 4 minutes (T4 DNA ligase covalently seals cohesive overhangs).
                    </p>
                    <p class="text-slate-600 dark:text-slate-400">
                      3. <strong>Final Digestion:</strong> 50°C for 5 minutes (cleaves any residual parental non-recombinants; recombinant construct loses the recognition sites).
                    </p>
                    <p class="text-slate-600 dark:text-slate-400">
                      4. <strong>Heat Inactivation:</strong> 80°C for 5 minutes.
                    </p>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <strong class="text-slate-700 dark:text-slate-300 block">Reaction Mixture (20 µL Total)</strong>
                    <p class="text-slate-600 dark:text-slate-400">• Destination Vector: ~40 fmol (~{ggVectorMassNg} ng)</p>
                    <p class="text-slate-600 dark:text-slate-400">• Insert Fragments: ~40 fmol each ({s.ggFragmentCount} fragments)</p>
                    <p class="text-slate-600 dark:text-slate-400">• 10X T4 DNA Ligase Buffer: 2.0 µL (or T4 Ligase Buffer with 1 mM ATP)</p>
                    <p class="text-slate-600 dark:text-slate-400">• Type IIS Restriction Enzyme ({s.ggEnzyme}): 1.0 µL</p>
                    <p class="text-slate-600 dark:text-slate-400">• T4 DNA Ligase: 1.0 µL</p>
                    <p class="text-slate-600 dark:text-slate-400">• Nuclease-free H2O to 20 µL</p>
                  </div>
                </div>
              </div>
            </div>
          }
          actions={<ActionBar onCopy={copySummary} shareUrl={shareUrl} />}
          science={<SciencePanel science={SCIENCE} />}
        />
      )}
    </div>
  );
}
