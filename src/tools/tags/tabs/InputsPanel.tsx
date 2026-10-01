import { CONSTRUCT_PRESETS, PROTEASE_DATABASE, TAG_DATABASE } from '@/core/protein/tags';
import type { TagsModel } from '../TagsModel';
import { FIELD, SELECT } from '../TagsModel';

export function InputsPanel({ m }: { m: TagsModel }) {
  const {
    applyBuilderConstruct,
    availableSites,
    builderLinker,
    builderOrientation,
    builderProtease,
    builderProteases,
    current,
    isSumoBuilder,
    loadPreset,
    set,
    setBuilderTag,
    simulation,
  } = m;
  return (
    <div class="space-y-4">
      {/* Main Tab Navigation */}
      <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 text-xs font-semibold">
        <button
          type="button"
          class={`flex-1 rounded-lg py-1.5 transition ${current.tab === 'simulator' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-200'}`}
          onClick={() => set({ tab: 'simulator' })}
        >
          🔬 Simulator
        </button>
        <button
          type="button"
          class={`flex-1 rounded-lg py-1.5 transition ${current.tab === 'builder' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-200'}`}
          onClick={() => set({ tab: 'builder' })}
        >
          🧬 Construct Builder
        </button>
        <button
          type="button"
          class={`flex-1 rounded-lg py-1.5 transition ${current.tab === 'library' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-200'}`}
          onClick={() => set({ tab: 'library' })}
        >
          📚 Tag &amp; Protease Library
        </button>
      </div>

      {current.tab === 'simulator' && (
        <>
          {/* Presets Bar */}
          <div>
            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
              Benchmark Constructs:
            </span>
            <div class="flex flex-wrap gap-1.5">
              {CONSTRUCT_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => loadPreset(preset.id)}
                  class="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Protease Selection */}
          <div>
            <label for="protease-select" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Site-Specific Protease
            </label>
            <select
              id="protease-select"
              class={SELECT}
              value={current.proteaseId}
              onChange={e =>
                set({
                  proteaseId: (e.target as HTMLSelectElement).value,
                  selectedSiteIndex: null,
                })
              }
            >
              {Object.values(PROTEASE_DATABASE).map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.recognitionMotif}
                </option>
              ))}
            </select>
            <div class="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Rule: {simulation.protease.cleavageRule}</span>
              <span>{simulation.protease.optimalTemp}</span>
            </div>
          </div>

          {/* Kapust Relaxed Mode for TEV */}
          {current.proteaseId === 'tev' && (
            <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-900/50 cursor-pointer">
              <input
                type="checkbox"
                checked={current.relaxedTev}
                onChange={e => set({ relaxedTev: (e.target as HTMLInputElement).checked })}
                class="h-4 w-4 rounded border-slate-300 text-accent-600 dark:text-accent-400 focus:ring-accent-500"
              />
              <div class="text-xs">
                <span class="font-medium text-slate-700 dark:text-slate-300 block">
                  Include non-canonical P1' residues (Kapust 2002)
                </span>
                <span class="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Screen non-optimal P1' residues (Asn, Tyr, His, etc.) with relative cleavage efficiencies.
                </span>
              </div>
            </label>
          )}

          {/* Cleavage Site Selector if multiple sites exist */}
          {availableSites.length > 1 && (
            <div>
              <label for="site-select" class="block text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                Multiple Sites ({availableSites.length}) — Select Primary Cut:
              </label>
              <select
                id="site-select"
                class={SELECT}
                value={current.selectedSiteIndex ?? availableSites[0]!.siteIndex}
                onChange={e => set({ selectedSiteIndex: Number((e.target as HTMLSelectElement).value) })}
              >
                {availableSites.map((site, i) => (
                  <option key={site.siteIndex} value={site.siteIndex}>
                    Site {i + 1}: After {site.p1Residue}{site.position1Based} ({site.motifSequence}) — {site.cleavageDescription}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sequence Input */}
          <div>
            <div class="flex items-center justify-between mb-1">
              <label for="sequence-input" class="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Fusion Protein Sequence
              </label>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {simulation.intact.length} amino acids
              </span>
            </div>
            <textarea
              id="sequence-input"
              rows={7}
              class={`${FIELD} mono text-xs uppercase leading-relaxed resize-y`}
              value={current.sequence}
              onInput={e =>
                set({
                  sequence: (e.target as HTMLTextAreaElement).value,
                  selectedSiteIndex: null,
                })
              }
              placeholder="Paste fusion amino acid sequence (e.g. MHHHHHHSSGRENLYFQG...)"
            />
          </div>

          {/* Quick Sequence Tools */}
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => set({ sequence: '' })}
            >
              Clear Sequence
            </button>
            <button
              type="button"
              class="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() =>
                set({
                  sequence: current.sequence.replace(/[^A-Za-z]/g, '').toUpperCase(),
                })
              }
            >
              Sanitize &amp; Strip Spaces
            </button>
          </div>
        </>
      )}

      {current.tab === 'builder' && (
        <div class="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Assemble Fusion Construct
          </h3>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="builder-tag" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Affinity Tag
              </label>
              <select
                id="builder-tag"
                class={SELECT}
                value={current.builderTag}
                onChange={e => setBuilderTag((e.target as HTMLSelectElement).value)}
              >
                {Object.values(TAG_DATABASE).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.shortName} ({t.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label for="builder-protease" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Protease Cleavage Site
              </label>
              <select
                id="builder-protease"
                class={SELECT}
                value={builderProtease}
                onChange={e => set({ builderProtease: (e.target as HTMLSelectElement).value })}
              >
                {builderProteases.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.shortName} ({p.recognitionMotif})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="builder-orientation" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tag Orientation
              </label>
              <select
                id="builder-orientation"
                class={SELECT}
                value={builderOrientation}
                onChange={e =>
                  set({
                    builderOrientation: (e.target as HTMLSelectElement).value as 'N-term' | 'C-term',
                  })
                }
              >
                <option value="N-term">N-terminal Fusion (Standard)</option>
                <option value="C-term" disabled={isSumoBuilder}>C-terminal Fusion</option>
              </select>
            </div>

            <div>
              <label for="builder-linker" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Linker Sequence
              </label>
              <input
                id="builder-linker"
                type="text"
                class={FIELD}
                value={builderLinker}
                disabled={isSumoBuilder}
                onInput={e => set({ builderLinker: (e.target as HTMLInputElement).value })}
                placeholder={isSumoBuilder ? 'Locked for native SUMO cleavage' : 'e.g. SSG or GSAGSA'}
              />
              {isSumoBuilder && (
                <p class="mt-1 text-[11px] text-violet-700 dark:text-violet-300">
                  SUMO ends in GG↓ and must join the target directly for native N-terminal release.
                </p>
              )}
            </div>
          </div>

          <div>
            <label for="builder-target-sequence" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Target Protein Sequence
            </label>
            <textarea
              id="builder-target-sequence"
              rows={4}
              class={`${FIELD} mono text-xs uppercase resize-y`}
              value={current.builderTargetSeq}
              onInput={e => set({ builderTargetSeq: (e.target as HTMLTextAreaElement).value })}
              placeholder="Paste target protein sequence..."
            />
          </div>

          <button
            type="button"
            class="w-full rounded-lg bg-accent-600 py-2 text-xs font-semibold text-white transition hover:bg-accent-700"
            onClick={applyBuilderConstruct}
          >
            Assemble &amp; Load into Simulator
          </button>
        </div>
      )}

      {current.tab === 'library' && (
        <div class="space-y-3 text-xs">
          <p class="text-slate-600 dark:text-slate-300">
            Browse properties of common affinity tags and site-specific proteases curated from Waugh (2011) and Kapust (2002).
          </p>
          <div class="space-y-2">
            {Object.values(TAG_DATABASE).map(tag => (
              <div
                key={tag.id}
                class="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="font-bold text-slate-900 dark:text-slate-100">{tag.name}</span>
                  <span class="font-mono text-[11px] text-slate-500 dark:text-slate-400">{tag.approxMwDa >= 1000 ? `${(tag.approxMwDa / 1000).toFixed(1)} kDa` : `${tag.approxMwDa.toFixed(0)} Da`}</span>
                </div>
                <div class="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                  <div><strong class="text-slate-700 dark:text-slate-300">Resin:</strong> {tag.resin}</div>
                  <div><strong class="text-slate-700 dark:text-slate-300">Elution:</strong> {tag.elution}</div>
                  <div class="text-slate-500 dark:text-slate-400 mt-1">{tag.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
