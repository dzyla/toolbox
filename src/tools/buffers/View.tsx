import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import { PRESETS, useBuffersModel } from './BuffersModel';
import { ConditionsBar } from './components/ConditionsBar';
import { ComponentRow } from './components/ComponentRow';
import { ContributeModal } from './components/ContributeModal';
import { PresetBar } from './components/PresetBar';
import { RecipeSheet } from './components/RecipeSheet';
import { SCIENCE } from './science';

export default function View() {
  const m = useBuffersModel();
  const { s, calculation } = m;

  return (
    <>
      <ToolLayout
        icon="🧪"
        title="Buffer & Media Recipes"
        blurb="Build recipes from exact chemical forms, solids and liquid stocks with automated unit-safe solving."
        wide={true}
        mobileResultSummary={
          calculation.error ? (
            <span class="font-semibold text-rose-700 dark:text-rose-400">{calculation.error}</span>
          ) : (
            <span><strong>{calculation.result?.rows.length} lines</strong> for <strong class="font-mono text-accent-700 dark:text-accent-300">{s.volume.value} {s.volume.unit}</strong></span>
          )
        }
        inputs={
          <div class="space-y-4">
            <PresetBar
              presets={PRESETS} customPresets={m.customPresets} saveName={m.saveName} showSaveDialog={m.showSaveDialog}
              onSaveName={m.setSaveName} onShowSave={m.setShowSaveDialog} onSave={m.saveCustomBuffer}
              onDelete={m.deleteCustomBuffer} onLoad={m.loadPreset} onContribute={() => m.setShowContributeModal(true)}
            />
            <ConditionsBar
              volume={s.volume} workingTemp_C={s.workingTemp_C} ionicCorrection={s.ionicCorrection}
              onVolume={volume => m.set({ volume })} onTemp={workingTemp_C => m.set({ workingTemp_C })} onIonic={ionicCorrection => m.set({ ionicCorrection })}
            />
            <div class="space-y-3">
              <div class="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>Recipe Components ({s.components.length})</span>
              </div>
              {s.components.map((component, index) => (
                <ComponentRow
                  key={component.id} component={component} index={index} total={s.components.length}
                  onChange={patch => m.update(index, patch)} onKind={kind => m.setKind(index, kind)}
                  onRemove={() => m.removeComponent(index)} onLookup={() => void m.lookup(index)}
                  workingTemp_C={s.workingTemp_C}
                  report={calculation.result?.buffers.find(b => b.componentIndex === index)}
                  ionicStrength={calculation.result?.ionicStrength ?? 0}
                  onSystem={id => m.setSystem(index, id)} onBuffer={p => m.setBuffer(index, p)}
                  onMethod={x => m.setMethod(index, x)} onMakeBuffer={() => m.makeBuffer(index)}
                />
              ))}
            </div>
            <button
              type="button" onClick={m.addComponent}
              class="w-full rounded-xl border-2 border-dashed border-slate-300 p-3 text-xs font-semibold text-slate-600 transition hover:border-accent-500 hover:text-accent-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-accent-400"
            >+ Add Component</button>
            {m.lookupStatus && <p role="status" class="px-1 text-xs text-slate-500 dark:text-slate-400">{m.lookupStatus}</p>}
          </div>
        }
        results={
          calculation.result ? (
            <RecipeSheet result={calculation.result} components={s.components} volume={s.volume} workingTemp_C={s.workingTemp_C} checked={m.checked} onToggle={m.toggleChecked} />
          ) : (
            <p role="alert" class="p-4 text-red-600 dark:text-red-400">{calculation.error}</p>
          )
        }
        actions={
          <div class="flex flex-wrap items-center gap-2">
            <ActionBar onCopy={() => m.copyText} shareUrl={m.shareUrl} />
            <button
              type="button" onClick={m.exportCsv}
              class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >📥 Export Recipe CSV</button>
          </div>
        }
        science={<SciencePanel science={SCIENCE} />}
      />
      {m.showContributeModal && (
        <ContributeModal recipeJson={m.recipeJson} title={m.saveName || s.components[0]?.name || 'New Buffer'} onClose={() => m.setShowContributeModal(false)} />
      )}
    </>
  );
}
