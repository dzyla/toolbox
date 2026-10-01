import { importErrorMessage, readTextFile } from '@/lib/file-import';
import { ImportAlert } from '@/app/components/ImportAlert';
import { PROTEASES, type Organism, type PKaScheme } from '@/core/protein';
import { type MassToleranceUnit, type PeptideMassMode } from '@/core/protein/mass';
import type { ProteinModel } from '../ProteinModel';
import { FIELD, FeatureControls, NumberField, ProfileControls } from '../ProteinModel';

export function InputsPanel({ m }: { m: ProteinModel }) {
  const {
    current,
    domainImportError,
    domainResult,
    fastaImportError,
    set,
    setDomainImportError,
    setFastaImportError,
  } = m;
  return (
    <>
      <label for="protein-fasta" class="block">
        <span class="mb-1 block text-sm font-medium">Protein sequence or FASTA</span>
        <textarea
          id="protein-fasta"
          rows={8}
          class={`${FIELD} mono text-xs`}
          value={current.fasta}
          onInput={event => set({ fasta: (event.target as HTMLTextAreaElement).value })}
        />
      </label>

      <label for="protein-file" class="block">
        <span class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Upload FASTA or text file (multiple entries supported)
        </span>
        <input
          id="protein-file"
          class="block min-h-11 w-full text-xs"
          type="file"
          accept=".fasta,.fa,.faa,.txt,text/plain"
          onChange={async event => {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            input.value = '';
            if (!file) return;
            setFastaImportError('');
            try { set({ fasta: await readTextFile(file) }); }
            catch (err) { setFastaImportError(importErrorMessage(err, file.name)); }
          }}
        />
      </label>
      <ImportAlert message={fastaImportError} />

      <a
        href="#/tool/structure"
        class="flex items-center justify-between p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/60 dark:border-indigo-900/50 dark:bg-indigo-950/20 text-xs font-semibold text-indigo-900 dark:text-indigo-300 transition"
      >
        <span class="flex items-center gap-1.5">
          <span>🧊</span>
          <span>Open 3D Structure Viewer &amp; Kabsch RMSD Superposition</span>
        </span>
        <span>→</span>
      </a>

      <div class="grid gap-3 sm:grid-cols-2">
        <label for="protein-pka" class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">pKa scheme</span>
          <select
            id="protein-pka"
            class={FIELD}
            value={current.scheme}
            onChange={event => set({ scheme: (event.target as HTMLSelectElement).value as PKaScheme })}
          >
            <option value="bjellqvist">Bjellqvist (ExPASy)</option>
            <option value="emboss">EMBOSS</option>
          </select>
        </label>
        <label for="protein-half-life" class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Half-life system</span>
          <select
            id="protein-half-life"
            class={FIELD}
            value={current.organism}
            onChange={event => set({ organism: (event.target as HTMLSelectElement).value as Organism })}
          >
            <option value="mammal">Mammalian reticulocytes</option>
            <option value="yeast">Yeast in vivo</option>
            <option value="ecoli">E. coli in vivo</option>
          </select>
        </label>
      </div>

      <div class="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
        <div class="flex items-center justify-between mb-1.5">
          <label for="protein-ph" class="text-xs font-medium text-slate-600 dark:text-slate-400">
            Charge pH
          </label>
          <output class="mono text-xs font-bold text-accent-600 dark:text-accent-400" for="protein-ph">
            {current.pH.toFixed(1)}
          </output>
        </div>
        <input
          id="protein-ph"
          class="min-h-11 w-full accent-accent-600"
          type="range"
          min="0"
          max="14"
          step="0.1"
          value={current.pH}
          onInput={event => set({ pH: Number((event.target as HTMLInputElement).value) })}
        />
      </div>

      <ProfileControls state={current} set={set} />
      <FeatureControls state={current} set={set} />

      <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          User Custom Domains (CSV)
        </summary>
        <div class="mt-3 space-y-2">
          <textarea
            id="protein-domains"
            rows={3}
            class={`${FIELD} mono text-xs`}
            placeholder={'name,start,end\nCatalytic domain,10,80'}
            value={current.domainCsv}
            onInput={event => set({ domainCsv: (event.target as HTMLTextAreaElement).value })}
          />
          <input
            id="protein-domain-file"
            class="block w-full text-xs"
            type="file"
            accept=".csv,text/csv"
            onChange={async event => {
              const input = event.target as HTMLInputElement;
              const file = input.files?.[0];
              input.value = '';
              if (!file) return;
              setDomainImportError('');
              try { set({ domainCsv: await readTextFile(file) }); }
              catch (err) { setDomainImportError(importErrorMessage(err, file.name)); }
            }}
          />
          <ImportAlert message={domainImportError} />
          {domainResult.error && <p role="alert" class="text-xs text-red-600 dark:text-red-400">{domainResult.error}</p>}
        </div>
      </details>

      <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-800" open>
        <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Digest and Mass Matcher
        </summary>
        <div class="mt-3 space-y-3">
          <div class="grid gap-2 sm:grid-cols-2">
            <label for="protein-protease" class="block">
              <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Protease</span>
              <select
                id="protein-protease"
                class={FIELD}
                value={current.protease}
                onChange={event => set({ protease: (event.target as HTMLSelectElement).value })}
              >
                {PROTEASES.map(protease => (
                  <option key={protease.name} value={protease.name}>
                    {protease.name}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              id="protein-missed"
              label="Missed cleavages"
              value={current.missedCleavages}
              min={0}
              max={5}
              set={missedCleavages => set({ missedCleavages })}
            />
          </div>

          <label for="protein-observed" class="block">
            <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Observed masses (comma, space, or line separated)
            </span>
            <textarea
              id="protein-observed"
              rows={2}
              class={`${FIELD} mono text-xs`}
              placeholder="e.g. 1024.52, 1432.71"
              value={current.observedMasses}
              onInput={event => set({ observedMasses: (event.target as HTMLTextAreaElement).value })}
            />
          </label>

          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NumberField
              id="protein-tolerance"
              label="Tolerance"
              value={current.massTolerance}
              min={0}
              step="any"
              set={massTolerance => set({ massTolerance })}
            />
            <label for="protein-tolerance-unit" class="block">
              <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Unit</span>
              <select
                id="protein-tolerance-unit"
                class={FIELD}
                value={current.massToleranceUnit}
                onChange={event => set({ massToleranceUnit: (event.target as HTMLSelectElement).value as MassToleranceUnit })}
              >
                <option>ppm</option>
                <option>Da</option>
              </select>
            </label>
            <label for="protein-mass-mode" class="block">
              <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Mode</span>
              <select
                id="protein-mass-mode"
                class={FIELD}
                value={current.massMode}
                onChange={event => set({ massMode: (event.target as HTMLSelectElement).value as PeptideMassMode })}
              >
                <option value="[M+H]+">[M+H]+</option>
                <option value="M">Neutral M</option>
              </select>
            </label>
            <NumberField
              id="protein-zmax"
              label="Max charge"
              value={current.zmax}
              min={1}
              max={50}
              set={zmax => set({ zmax })}
            />
          </div>
        </div>
      </details>
    </>
  );
}
