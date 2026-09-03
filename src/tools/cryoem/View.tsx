import { useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { DecimalInput } from '@/app/components/DecimalInput';
import { SCIENCE } from './science';
import {
  compareBoxes, nextGoodBox, isGoodBox, dosePlan, exposureForDose,
  pixelSizeFromMag, magFromPixelSize,
} from '@/core/cryoem';

interface State {
  tab: 'box' | 'dose' | 'mag';
  pixelSize: number;
  box: number;
  cropBox: number;
  targetNyquist: number;
  doseRate: number;
  exposureTime: number;
  frames: number;
  targetDose: number;
  detectorUm: number;
  mag: number;
}

const DEFAULTS: State = {
  tab: 'box',
  pixelSize: 0.83,
  box: 256,
  cropBox: 128,
  targetNyquist: 3.5,
  doseRate: 15,
  exposureTime: 2.0,
  frames: 40,
  targetDose: 40,
  detectorUm: 5.0, // K3
  mag: 60241,
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

export default function CryoEmView() {
  const [state, shareUrl] = useUrlState<State>('cryoem', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };

  const boxComparison = useMemo(() => {
    try {
      if (!(s.pixelSize > 0) || !(s.box > 0) || !(s.cropBox > 0)) return null;
      return compareBoxes(s.pixelSize, s.box, s.cropBox);
    } catch {
      return null;
    }
  }, [s.pixelSize, s.box, s.cropBox]);

  const doseResults = useMemo(() => {
    try {
      if (!(s.doseRate > 0) || !(s.pixelSize > 0) || !(s.exposureTime > 0) || !(s.frames > 0)) return null;
      const plan = dosePlan(s.doseRate, s.pixelSize, s.exposureTime, s.frames);
      const reqExp = s.targetDose > 0 ? exposureForDose(s.doseRate, s.pixelSize, s.targetDose) : 0;
      return { plan, reqExp };
    } catch {
      return null;
    }
  }, [s.doseRate, s.pixelSize, s.exposureTime, s.frames, s.targetDose]);

  const magResults = useMemo(() => {
    try {
      if (!(s.detectorUm > 0) || !(s.mag > 0)) return null;
      const derivedPx = pixelSizeFromMag(s.detectorUm, s.mag);
      return { derivedPx };
    } catch {
      return null;
    }
  }, [s.detectorUm, s.mag]);

  const copyText = () => {
    const lines = [
      `Cryo-EM Settings (${s.tab}):`,
      `Pixel size: ${s.pixelSize.toFixed(3)} Å/px, Box size: ${s.box} px`,
    ];
    if (boxComparison) {
      lines.push(`Raw Nyquist: ${boxComparison.raw.nyquist.toFixed(2)} Å, Width: ${boxComparison.raw.width.toFixed(1)} Å`);
      lines.push(`Binned Nyquist (${boxComparison.binned.bin.toFixed(2)}x): ${boxComparison.binned.nyquist.toFixed(2)} Å, Binned px: ${boxComparison.binned.pixelSize.toFixed(3)} Å/px`);
    }
    if (doseResults) {
      lines.push(`Total Dose: ${doseResults.plan.totalDose.toFixed(1)} e⁻/Å², ${doseResults.plan.dosePerFrame.toFixed(2)} e⁻/Å²/frame across ${s.frames} frames`);
    }
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <ToolLayout
      icon="❄️"
      title="Cryo-EM Geometry & Dose"
      blurb="Pixel size, Nyquist resolution limits, FFT-friendly box cropping, electron dose and magnification conversions."
      inputs={
        <div class="space-y-4">
          <div class="flex gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
            {(
              [
                ['box', 'Box & Sampling'],
                ['dose', 'Dose Calculator'],
                ['mag', 'Magnification'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                class={`min-h-9 rounded-lg px-3 text-sm font-medium transition ${
                  s.tab === id
                    ? 'bg-accent-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
                onClick={() => set({ tab: id })}
              >
                {label}
              </button>
            ))}
          </div>

          {s.tab === 'box' && (
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">Pixel Size (Å/px)</label>
                <DecimalInput
                  class={FIELD}
                  value={s.pixelSize}
                  onChange={pixelSize => set({ pixelSize })}
                  min={0.001}
                  step={0.01}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">Original Box Size (px)</label>
                <input
                  type="number"
                  step="2"
                  min="16"
                  class={FIELD}
                  value={s.box}
                  onInput={e => set({ box: Number((e.target as HTMLInputElement).value) })}
                />
                {!isGoodBox(s.box) && (
                  <button
                    type="button"
                    class="mt-1 text-xs text-amber-600 dark:text-amber-400 underline"
                    onClick={() => set({ box: nextGoodBox(s.box) })}
                  >
                    Not 2·3·5·7-smooth. Snap to {nextGoodBox(s.box)} px?
                  </button>
                )}
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">Cropped Box Size (px)</label>
                <input
                  type="number"
                  step="2"
                  min="16"
                  class={FIELD}
                  value={s.cropBox}
                  onInput={e => set({ cropBox: Number((e.target as HTMLInputElement).value) })}
                />
                {!isGoodBox(s.cropBox) && (
                  <button
                    type="button"
                    class="mt-1 text-xs text-amber-600 dark:text-amber-400 underline"
                    onClick={() => set({ cropBox: nextGoodBox(s.cropBox) })}
                  >
                    Not 2·3·5·7-smooth. Snap to {nextGoodBox(s.cropBox)} px?
                  </button>
                )}
              </div>
            </div>
          )}

          {s.tab === 'dose' && (
            <div class="space-y-3">
              <label class="block">
                <span class="block text-sm font-medium mb-1">Pixel Size (Å/px)</span>
                <DecimalInput
                  class={FIELD}
                  value={s.pixelSize}
                  onChange={pixelSize => set({ pixelSize })}
                  min={0.001}
                  step={0.01}
                />
              </label>

              <label class="block">
                <span class="block text-sm font-medium mb-1">Dose Rate (e⁻/px/s on detector)</span>
                <DecimalInput
                  class={FIELD}
                  value={s.doseRate}
                  onChange={doseRate => set({ doseRate })}
                  min={0.001}
                  step={0.5}
                />
              </label>

              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="block text-sm font-medium mb-1">Total Exposure (s)</span>
                  <DecimalInput
                    class={FIELD}
                    value={s.exposureTime}
                    onChange={exposureTime => set({ exposureTime })}
                    min={0.001}
                    step={0.1}
                  />
                </label>
                <label class="block">
                  <span class="block text-sm font-medium mb-1">Number of Frames</span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    class={FIELD}
                    value={s.frames}
                    onInput={e => set({ frames: Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1) })}
                  />
                </label>
              </div>

              <label class="block pt-2">
                <span class="block text-xs text-slate-500 mb-1">Target Desired Dose (e⁻/Å²)</span>
                <DecimalInput
                  class={FIELD}
                  value={s.targetDose}
                  onChange={targetDose => set({ targetDose })}
                  min={0.01}
                  step={1}
                />
              </label>
            </div>
          )}

          {s.tab === 'mag' && (
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">Detector Physical Pixel (µm)</label>
                <div class="flex gap-2">
                  <DecimalInput
                    class={`${FIELD} flex-1`}
                    value={s.detectorUm}
                    onChange={detectorUm => set({ detectorUm })}
                    min={0.1}
                    step={0.5}
                  />
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    onClick={() => set({ detectorUm: 5.0 })}
                  >
                    K3 (5 µm)
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    onClick={() => set({ detectorUm: 14.0 })}
                  >
                    Falcon 4 (14 µm)
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">Magnification</label>
                <DecimalInput
                  class={FIELD}
                  value={s.mag}
                  onChange={mag => set({ mag })}
                  min={1}
                  step={1000}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">Target Pixel Size (Å/px) → Calculate Mag</label>
                <DecimalInput
                  class={FIELD}
                  value={s.pixelSize}
                  placeholder="Type a pixel size to update magnification"
                  onChange={px => {
                    if (px > 0 && s.detectorUm > 0) set({ pixelSize: px, mag: Math.round(magFromPixelSize(s.detectorUm, px)) });
                  }}
                  min={0.001}
                  step={0.01}
                />
              </div>
            </div>
          )}
        </div>
      }
      results={
        <div class="space-y-4">
          {s.tab === 'box' && boxComparison && (
            <div class="space-y-4" data-testid="cryo-box-result">
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Raw Nyquist</div>
                  <div class="mono text-xl font-bold text-accent-600">
                    {boxComparison.raw.nyquist.toFixed(2)} Å
                  </div>
                  <div class="text-xs text-slate-500">at {boxComparison.raw.pixelSize.toFixed(3)} Å/px</div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Binned Nyquist</div>
                  <div class="mono text-xl font-bold">
                    {boxComparison.binned.nyquist.toFixed(2)} Å
                  </div>
                  <div class="text-xs text-slate-500">at {boxComparison.binned.pixelSize.toFixed(3)} Å/px</div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Physical Box Size</div>
                  <div class="mono text-xl font-bold">
                    {boxComparison.raw.width.toFixed(1)} Å
                  </div>
                  <div class="text-xs text-slate-500">{boxComparison.raw.box} px raw</div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Binning Factor</div>
                  <div class="mono text-xl font-bold">
                    {boxComparison.binned.bin.toFixed(2)}×
                  </div>
                  <div class="text-xs text-slate-500">{boxComparison.binned.box} px cropped</div>
                </div>
              </div>

              <div class="overflow-x-auto rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500">
                      <th class="pb-2">Metric</th>
                      <th class="pb-2">Original</th>
                      <th class="pb-2">Cropped / Binned</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr class="border-b border-slate-100 dark:border-slate-800">
                      <td class="py-2">Pixel Size</td>
                      <td class="mono">{boxComparison.raw.pixelSize.toFixed(3)} Å</td>
                      <td class="mono font-semibold text-accent-600">{boxComparison.binned.pixelSize.toFixed(3)} Å</td>
                    </tr>
                    <tr class="border-b border-slate-100 dark:border-slate-800">
                      <td class="py-2">Nyquist Limit</td>
                      <td class="mono">{boxComparison.raw.nyquist.toFixed(2)} Å</td>
                      <td class="mono">{boxComparison.binned.nyquist.toFixed(2)} Å</td>
                    </tr>
                    <tr class="border-b border-slate-100 dark:border-slate-800">
                      <td class="py-2">Box Dimension</td>
                      <td class="mono">{boxComparison.raw.box} px</td>
                      <td class="mono">{boxComparison.binned.box} px</td>
                    </tr>
                    <tr>
                      <td class="py-2">Field of View</td>
                      <td class="mono">{boxComparison.raw.width.toFixed(1)} Å</td>
                      <td class="mono">{boxComparison.binned.width.toFixed(1)} Å</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {s.tab === 'dose' && doseResults && (
            <div class="space-y-4" data-testid="cryo-dose-result">
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Total Dose</div>
                  <div class="mono text-2xl font-bold text-accent-600">
                    {doseResults.plan.totalDose.toFixed(1)}
                  </div>
                  <div class="text-xs text-slate-500">e⁻/Å² (target: {s.targetDose})</div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Dose per Frame</div>
                  <div class="mono text-2xl font-bold">
                    {doseResults.plan.dosePerFrame.toFixed(2)}
                  </div>
                  <div class="text-xs text-slate-500">e⁻/Å² over {s.frames} frames</div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Frame Time</div>
                  <div class="mono text-2xl font-bold">
                    {(doseResults.plan.frameTime * 1000).toFixed(0)} ms
                  </div>
                  <div class="text-xs text-slate-500">{doseResults.plan.frameTime.toFixed(3)} s/frame</div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Rate at Specimen</div>
                  <div class="mono text-2xl font-bold">
                    {doseResults.plan.rateAtSpecimen.toFixed(1)}
                  </div>
                  <div class="text-xs text-slate-500">e⁻/Å²/s</div>
                </div>
              </div>

              <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700 text-sm">
                <span class="font-medium">Exposure required for {s.targetDose} e⁻/Å²: </span>
                <strong class="mono text-accent-600">{doseResults.reqExp.toFixed(2)} seconds</strong>
              </div>
            </div>
          )}

          {s.tab === 'mag' && magResults && (
            <div class="space-y-4" data-testid="cryo-mag-result">
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Calibrated Pixel Size</div>
                  <div class="mono text-2xl font-bold text-accent-600">
                    {magResults.derivedPx.toFixed(4)} Å
                  </div>
                  <div class="text-xs text-slate-500">at {s.mag.toLocaleString()}×</div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Nyquist Resolution</div>
                  <div class="mono text-2xl font-bold">
                    {(magResults.derivedPx * 2).toFixed(2)} Å
                  </div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Detector Pixel</div>
                  <div class="mono text-2xl font-bold">
                    {s.detectorUm} µm
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      }
      actions={<ActionBar onCopy={copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
