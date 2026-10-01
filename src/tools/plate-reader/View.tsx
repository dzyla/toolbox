import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';
import { usePlateReaderModel, type PlateReaderViewProps, type State } from './PlateReaderModel';
import { HeatmapTab } from './tabs/HeatmapTab';
import { LayoutTab } from './tabs/LayoutTab';
import { TableTab } from './tabs/TableTab';
import { ElisaTab } from './tabs/ElisaTab';
import { CurveFittingTab } from './tabs/CurveFittingTab';
import { QcTab } from './tabs/QcTab';
import { CsvTab } from './tabs/CsvTab';
import { InputsPanel } from './tabs/InputsPanel';

export type { PlateReaderViewProps } from './PlateReaderModel';

export default function PlateReaderView(props: PlateReaderViewProps = {}) {
  const m = usePlateReaderModel(props);
  const {
    assayQc,
    copyReport,
    derivedGroups,
    externalLayoutAnnotations,
    handleGoToGenerator,
    hasLayout,
    layoutAnnotations,
    parsedPlate,
    s,
    set,
    shareUrl,
    toastMsg,
  } = m;

  return (
    <ToolLayout
      icon="🧪"
      title="Plate Reader CSV Processor & Normalization"
      blurb="Scientific microplate data processor for Tecan, BMG, BioTek & SoftMax exports. Flexible layout definitions, ELISA standard curve regression, dose-response analysis, and customizable Min/Max references."
      wide={true}
      mobileResultSummary={
        <span>
          {parsedPlate.format}-well · Display: <strong class="font-mono text-accent-700 dark:text-accent-300">{s.displayMode.toUpperCase()}</strong> · {hasLayout ? `${derivedGroups.length} groups` : 'No layout'}
        </span>
      }
      inputs={
        <InputsPanel m={m} />
      }
      results={
        <div class="space-y-4">
          {/* Main Mode Toggle: Generator vs Plate Reader */}
          <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-linear-to-r from-slate-100 to-indigo-50/40 dark:from-slate-800/80 dark:to-indigo-950/20 border border-slate-200 dark:border-slate-700 shadow-xs">
            <div class="inline-flex p-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <button
                type="button"
                onClick={handleGoToGenerator}
                class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <span>🟦</span>
                <span>Plate Layout Generator</span>
              </button>
              <button
                type="button"
                class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 bg-purple-600 text-white shadow-xs"
              >
                <span>📊</span>
                <span>Plate Reader Processor</span>
              </button>
            </div>

            <div class="flex items-center gap-2 text-xs">
              <span class="text-slate-500 dark:text-slate-400 font-medium">
                {externalLayoutAnnotations && Object.keys(externalLayoutAnnotations).length > 0 ? (
                  <span>Layout: <strong>{Object.keys(externalLayoutAnnotations).length} wells defined in Generator</strong></span>
                ) : (
                  <span>{hasLayout ? `${Object.keys(layoutAnnotations).length} wells annotated` : 'Raw Ingestion Mode'}</span>
                )}
              </span>
              <button
                type="button"
                onClick={handleGoToGenerator}
                class="px-3 py-1.5 rounded-xl border border-accent-300 dark:border-accent-700 bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 font-bold hover:bg-accent-100 transition flex items-center gap-1 shadow-2xs"
              >
                <span>✏️</span> Return to Generator
              </button>
            </div>
          </div>

          {/* Assay QC Overview Dashboard Banner */}
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Z'-Factor Card */}
            <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>Z'-Factor (HTS Window)</span>
                <span title="Zhang et al. 1999: >= 0.5 is an excellent screening assay">ℹ️</span>
              </div>
              <div class="flex items-baseline gap-2">
                <span class={`text-xl font-extrabold font-mono ${assayQc.zPrime !== null && assayQc.zPrime >= 0.5 ? 'text-emerald-700 dark:text-emerald-400' : assayQc.zPrime !== null && assayQc.zPrime >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}`}>
                  {assayQc.zPrime !== null ? assayQc.zPrime.toFixed(3) : 'N/A'}
                </span>
                {assayQc.zFactorInterpretation && (
                  <span class={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${assayQc.zFactorInterpretation === 'excellent' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : assayQc.zFactorInterpretation === 'marginal' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                    {assayQc.zFactorInterpretation}
                  </span>
                )}
              </div>
            </div>

            {/* Signal-to-Background */}
            <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Signal-to-Background (S/B)</span>
              <span class="text-xl font-extrabold font-mono text-slate-800 dark:text-slate-100">
                {assayQc.signalToBackground !== null ? `${assayQc.signalToBackground.toFixed(1)}×` : 'N/A'}
              </span>
            </div>

            {/* Signal-to-Noise */}
            <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Signal-to-Noise (S/N)</span>
              <span class="text-xl font-extrabold font-mono text-slate-800 dark:text-slate-100">
                {assayQc.signalToNoise !== null ? assayQc.signalToNoise.toFixed(1) : 'N/A'}
              </span>
            </div>

            {/* Plate Mean %CV */}
            <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Plate Mean %CV</span>
              <div class="flex items-baseline gap-2">
                <span class={`text-xl font-extrabold font-mono ${assayQc.plateMeanCv !== null && assayQc.plateMeanCv <= s.cvThreshold ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {assayQc.plateMeanCv !== null ? `${assayQc.plateMeanCv.toFixed(1)}%` : 'N/A'}
                </span>
                {assayQc.outlierCount > 0 && (
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold dark:bg-rose-950 dark:text-rose-300">
                    {assayQc.outlierCount} Outlier{assayQc.outlierCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div class="flex items-center justify-between border-b border-slate-200 pb-1.5 dark:border-slate-800">
            <div class="flex flex-wrap gap-1 text-xs font-semibold">
              {[
                { id: 'heatmap', label: '🗺️ Plate Heatmap' },
                { id: 'layout', label: '📐 Layout & Annotations' },
                { id: 'table', label: '📊 Replicate Statistics' },
                { id: 'elisa', label: '🧪 ELISA & Standard Curve' },
                { id: 'curve-fitting', label: '📈 Curve Fitting Export' },
                { id: 'qc', label: '🎯 HTS Screen QC' },
                { id: 'csv', label: '📋 CSV Matrix Export' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => set({ activeTab: tab.id as State['activeTab'] })}
                  class={`px-3 py-1.5 rounded-lg transition ${s.activeTab === tab.id ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {toastMsg && (
              <span role="status" class="text-xs font-medium text-accent-600 dark:text-accent-400 animate-pulse">
                {toastMsg}
              </span>
            )}
          </div>

          {/* TAB 1: INTERACTIVE PLATE HEATMAP GRID */}
          {s.activeTab === 'heatmap' && <HeatmapTab m={m} />}

          {/* TAB 2: PLATE LAYOUT DEFINITION & ANNOTATIONS */}
          {s.activeTab === 'layout' && <LayoutTab m={m} />}

          {/* TAB 2: GROUP REPLICATE STATISTICS TABLE */}
          {s.activeTab === 'table' && <TableTab m={m} />}

          {/* TAB 4: ELISA STANDARD CURVE & QUANTIFICATION */}
          {s.activeTab === 'elisa' && <ElisaTab m={m} />}

          {/* TAB 5: CURVE FITTING EXPORT & INTEGRATION */}
          {s.activeTab === 'curve-fitting' && <CurveFittingTab m={m} />}

          {/* TAB 6: HTS SCREENING QC DASHBOARD */}
          {s.activeTab === 'qc' && <QcTab m={m} />}

          {/* TAB 7: CSV EXPORT */}
          {s.activeTab === 'csv' && <CsvTab m={m} />}
        </div>
      }
      actions={
        <ActionBar
          onCopy={copyReport}
          shareUrl={shareUrl}
        />
      }
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
