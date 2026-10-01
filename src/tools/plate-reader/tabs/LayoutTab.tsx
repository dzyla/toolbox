import { ImportAlert } from '@/app/components/ImportAlert';
import { type SampleType } from '@/core/plates/reader';
import { PlateChassis } from '@/tools/plate/PlateChassis';
import type { PlateReaderModel } from '../PlateReaderModel';

export function LayoutTab({ m }: { m: PlateReaderModel }) {
  const {
    assignedWells,
    detectedLabels,
    dilutionFactor,
    dilutionRole,
    dilutionStartConc,
    dilutionUnit,
    handleApplyPastedLayout,
    handleClearSelection,
    handleExecuteSerialDilution,
    handleLayoutFileUpload,
    handlePaintSelectedWells,
    handleSelectAll,
    handleSelectCol,
    handleSelectRow,
    handleToggleWellSelection,
    handleUpdateLabelOverride,
    layoutAnnotations,
    layoutFileInputRef,
    layoutImportError,
    layoutText,
    onSwitchToGenerator,
    onSyncLayoutToGenerator,
    painterConc,
    painterDilution,
    painterLabel,
    painterRole,
    painterUnit,
    parsedPlate,
    selectedWells,
    setDilutionFactor,
    setDilutionRole,
    setDilutionStartConc,
    setDilutionUnit,
    setLayoutText,
    setPainterConc,
    setPainterDilution,
    setPainterLabel,
    setPainterRole,
    setPainterUnit,
  } = m;
  return (
    <div class="space-y-4">
      {/* Layout Ingestion Section */}
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="font-bold text-sm text-slate-800 dark:text-slate-100">
              1. Upload or Paste Annotation Matrix (96/384 Format or 2-Col List)
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Supply well assignments matching your plate format (8×12 or 16×24 grid) or a 2-column CSV (Well, Label).
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={() => layoutFileInputRef.current?.click()}
              class="px-3 py-1.5 rounded-lg bg-accent-50 text-accent-700 border border-accent-200 hover:bg-accent-100 text-xs font-bold dark:bg-accent-950/40 dark:border-accent-800 dark:text-accent-300"
            >
              📂 Upload Layout CSV
            </button>
            <input
              ref={layoutFileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleLayoutFileUpload}
              class="hidden"
            />

            <button
              type="button"
              onClick={handleApplyPastedLayout}
              class="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold transition shadow-xs"
            >
              Apply Layout
            </button>
          </div>
        </div>
        <ImportAlert message={layoutImportError} />

        <textarea
          rows={4}
          value={layoutText}
          onInput={(e) => setLayoutText((e.target as HTMLTextAreaElement).value)}
          placeholder="Paste 8x12 grid of labels (e.g. Blank, Std 1000, Std 500, Sample 1, Pos Ctrl) or list CSV..."
          class="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs leading-snug dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      {/* Detected Labels Mapping Table */}
      {detectedLabels.length > 0 && (
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold text-sm text-slate-800 dark:text-slate-100">
                2. Detected Labels &amp; Role Assignments
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                Select role (Blank, Standard, Controls, Samples), enter nominal concentrations, and set dilution factors.
              </p>
            </div>
            <span class="text-xs font-mono text-slate-500 dark:text-slate-400">
              {detectedLabels.length} unique labels detected
            </span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
                <tr>
                  <th class="p-2">Detected Label</th>
                  <th class="p-2 text-center">Wells</th>
                  <th class="p-2">Role / Type</th>
                  <th class="p-2">Nominal Conc</th>
                  <th class="p-2">Unit</th>
                  <th class="p-2">Dilution Factor</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {detectedLabels.map(item => (
                  <tr key={item.label} class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td class="p-2 font-sans font-bold text-slate-800 dark:text-slate-200">
                      {item.label}
                    </td>
                    <td class="p-2 text-center text-slate-500 dark:text-slate-400">
                      {item.count}
                    </td>
                    <td class="p-2">
                      <select
                        value={item.currentRole}
                        onChange={(e) => handleUpdateLabelOverride(item.label, { role: (e.target as HTMLSelectElement).value as SampleType })}
                        class="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-sans dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="sample">Sample</option>
                        <option value="blank">Blank (Background)</option>
                        <option value="standard">Standard (Calibrator)</option>
                        <option value="pos-ctrl">Positive Control</option>
                        <option value="neg-ctrl">Negative Control</option>
                        <option value="empty">Empty Well</option>
                      </select>
                    </td>
                    <td class="p-2">
                      <input
                        type="number"
                        step="any"
                        value={item.conc !== undefined ? item.conc : ''}
                        placeholder="e.g. 1000"
                        onChange={(e) => {
                          const val = (e.target as HTMLInputElement).value.trim();
                          handleUpdateLabelOverride(item.label, { concentration: val !== '' ? parseFloat(val) : undefined });
                        }}
                        class="w-24 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </td>
                    <td class="p-2">
                      <input
                        type="text"
                        value={item.unit || ''}
                        placeholder="pg/mL"
                        onChange={(e) => handleUpdateLabelOverride(item.label, { unit: (e.target as HTMLInputElement).value })}
                        class="w-20 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </td>
                    <td class="p-2">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={item.dilution || 1}
                        onChange={(e) => {
                          const val = parseFloat((e.target as HTMLInputElement).value);
                          handleUpdateLabelOverride(item.label, { dilutionFactor: !isNaN(val) && val > 0 ? val : 1 });
                        }}
                        class="w-20 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Visual Plate Painter & Multi-Well Assignment */}
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="font-bold text-sm text-slate-800 dark:text-slate-100">
              3. Interactive Visual Plate Painter
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Click wells or row/col headers to select, then assign roles, concentrations, or generate serial dilutions.
            </p>
          </div>

          <div class="flex items-center gap-1.5 text-xs font-semibold">
            {onSwitchToGenerator && (
              <button
                type="button"
                onClick={onSwitchToGenerator}
                class="px-2.5 py-1 rounded-md bg-accent-50 text-accent-700 dark:bg-accent-950/50 dark:text-accent-300 border border-accent-300 dark:border-accent-700 hover:bg-accent-100 transition"
              >
                ✏️ Full Generator
              </button>
            )}
            <button
              type="button"
              onClick={handleSelectAll}
              class="px-2.5 py-1 rounded-md border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              class="px-2.5 py-1 rounded-md border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Clear ({selectedWells.size})
            </button>
          </div>
        </div>

        {/* Painter Toolbar */}
        <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="flex flex-wrap items-center gap-3">
            <div>
              <span class="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Role</span>
              <select aria-label="Role"
                value={painterRole}
                onChange={(e) => setPainterRole((e.target as HTMLSelectElement).value as SampleType)}
                class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="sample">Sample</option>
                <option value="blank">Blank</option>
                <option value="standard">Standard</option>
                <option value="pos-ctrl">Pos Ctrl</option>
                <option value="neg-ctrl">Neg Ctrl</option>
                <option value="empty">Empty</option>
              </select>
            </div>

            <div>
              <span class="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Label / Group</span>
              <input aria-label="Label / Group"
                type="text"
                value={painterLabel}
                onChange={(e) => setPainterLabel((e.target as HTMLInputElement).value)}
                placeholder="Sample A"
                class="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div>
              <span class="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Conc</span>
              <input aria-label="Conc"
                type="number"
                step="any"
                value={painterConc}
                onChange={(e) => setPainterConc((e.target as HTMLInputElement).value)}
                placeholder="Conc"
                class="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div>
              <span class="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Unit</span>
              <input aria-label="Unit"
                type="text"
                value={painterUnit}
                onChange={(e) => setPainterUnit((e.target as HTMLInputElement).value)}
                placeholder="µM"
                class="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div>
              <span class="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Dilution</span>
              <input aria-label="Dilution"
                type="number"
                min="1"
                step="any"
                value={painterDilution}
                onChange={(e) => setPainterDilution((e.target as HTMLInputElement).value)}
                placeholder="1"
                class="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handlePaintSelectedWells}
            class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-xs"
          >
            🎨 Paint Selected Wells ({selectedWells.size})
          </button>
        </div>

        {/* Serial Dilution Wizard Accordion */}
        <div class="p-3 rounded-lg bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 text-xs space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
              <span>⚡</span>
              <span>Serial Dilution Generator Wizard</span>
            </span>
            <span class="text-[11px] text-purple-700 dark:text-purple-400">
              Calculates geometric concentrations across selected wells
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-3 pt-1">
            <div>
              <span class="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Start Conc</span>
              <input aria-label="Start Conc"
                type="number"
                step="any"
                value={dilutionStartConc}
                onChange={(e) => setDilutionStartConc(parseFloat((e.target as HTMLInputElement).value) || 1000)}
                class="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div>
              <span class="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Dilution Factor</span>
              <select aria-label="Dilution Factor"
                value={dilutionFactor}
                onChange={(e) => setDilutionFactor(parseFloat((e.target as HTMLSelectElement).value) || 2)}
                class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="2">2-Fold (1:2)</option>
                <option value="3">3-Fold (1:3)</option>
                <option value="4">4-Fold (1:4)</option>
                <option value="5">5-Fold (1:5)</option>
                <option value="10">10-Fold (1:10)</option>
              </select>
            </div>

            <div>
              <span class="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Role</span>
              <select aria-label="Role"
                value={dilutionRole}
                onChange={(e) => setDilutionRole((e.target as HTMLSelectElement).value as SampleType)}
                class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="standard">Standard Curve (Calibrator)</option>
                <option value="sample">Sample Dose-Response</option>
              </select>
            </div>

            <div>
              <span class="block text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">Unit</span>
              <input aria-label="Unit"
                type="text"
                value={dilutionUnit}
                onChange={(e) => setDilutionUnit((e.target as HTMLInputElement).value)}
                placeholder="pg/mL"
                class="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <button
              type="button"
              onClick={handleExecuteSerialDilution}
              class="mt-4 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold transition shadow-xs"
            >
              Generate Series on Selected Wells
            </button>
          </div>
        </div>

        {/* Visual Painter Grid via PlateChassis */}
        <PlateChassis
          format={parsedPlate.format}
          rows={parsedPlate.rows.length}
          cols={parsedPlate.cols.length}
          rowLabels={parsedPlate.rows}
          density="compact"
          title={`Layout Annotation Painter · ${parsedPlate.format}-Well Plate`}
          subtitle={`${selectedWells.size} Wells Selected`}
          headerRight={
            <div class="flex items-center gap-2">
              {onSwitchToGenerator && (
                <button
                  type="button"
                  onClick={onSwitchToGenerator}
                  class="px-2.5 py-0.5 rounded-md bg-accent-600 hover:bg-accent-700 text-white text-[11px] font-bold shadow-2xs transition flex items-center gap-1"
                >
                  <span>✏️</span> Generator
                </button>
              )}
              {onSyncLayoutToGenerator && (
                <button
                  type="button"
                  onClick={() => onSyncLayoutToGenerator(layoutAnnotations)}
                  class="px-2.5 py-0.5 rounded-md border border-slate-400 dark:border-slate-600 text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1"
                >
                  <span>🔄</span> Sync to Generator
                </button>
              )}
            </div>
          }
          onRowClick={handleSelectRow}
          onColClick={handleSelectCol}
          onWellClick={handleToggleWellSelection}
          getWellData={(wellId) => {
            const well = assignedWells[wellId];
            const isSelected = selectedWells.has(wellId);
            const role = well?.sampleType || 'unassigned';

            let roleBg = '#f1f5f9';
            if (role === 'blank') roleBg = '#cbd5e1';
            else if (role === 'pos-ctrl') roleBg = '#a7f3d0';
            else if (role === 'neg-ctrl') roleBg = '#bae6fd';
            else if (role === 'standard') roleBg = '#e9d5ff';
            else if (role === 'sample') roleBg = '#fef08a';

            return {
              id: wellId,
              row: wellId.charAt(0),
              col: parseInt(wellId.slice(1), 10),
              bgColor: roleBg,
              textColor: 'text-slate-900 font-bold',
              isSelected,
              topLabel: wellId,
              midLabel: well?.sampleName ? well.sampleName.slice(0, 5) : role === 'unassigned' ? '—' : role,
              title: `Well ${wellId}: ${well?.sampleName || role}`,
            };
          }}
        />
      </div>
    </div>
  );
}
