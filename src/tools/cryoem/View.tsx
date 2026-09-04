import { useMemo, useRef, useEffect, useState } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { DecimalInput } from '@/app/components/DecimalInput';
import { SCIENCE } from './science';
import {
  compareBoxes, nextGoodBox, isGoodBox, dosePlan, exposureForDose,
  pixelSizeFromMag, magFromPixelSize,
  relativisticWavelength, firstCtfZero, generateCtfProfile, generateThonRingsMatrix,
  CtfPoint,
} from '@/core/cryoem';

interface State {
  tab: 'box' | 'dose' | 'ctf' | 'mag';
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
  // CTF parameters
  voltageKv: number;
  csMm: number;
  defocusUm: number;
  astigmatismUm: number;
  astAngleDeg: number;
  amplitudeContrast: number;
  bFactor: number;
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
  voltageKv: 300,
  csMm: 2.7,
  defocusUm: 1.5,
  astigmatismUm: 0.05,
  astAngleDeg: 30,
  amplitudeContrast: 0.07,
  bFactor: 50,
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

function ThonRingsCanvas({
  voltageKv,
  csMm,
  dfU_um,
  dfV_um,
  astAngleDeg,
  pixelSize,
  amplitudeContrast,
  bFactor,
}: {
  voltageKv: number;
  csMm: number;
  dfU_um: number;
  dfV_um: number;
  astAngleDeg: number;
  pixelSize: number;
  amplitudeContrast: number;
  bFactor: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = 220;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const matrix = generateThonRingsMatrix(
      size,
      voltageKv,
      csMm,
      dfU_um,
      dfV_um,
      astAngleDeg,
      pixelSize,
      amplitudeContrast,
      bFactor
    );

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let i = 0; i < matrix.length; i++) {
      const val = Math.min(1, Math.max(0, matrix[i] ?? 0));
      const brightness = Math.pow(val, 0.45);
      const pixelIndex = i * 4;
      const c = Math.floor(brightness * 255);
      data[pixelIndex] = c;
      data[pixelIndex + 1] = c;
      data[pixelIndex + 2] = c;
      data[pixelIndex + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 4, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [voltageKv, csMm, dfU_um, dfV_um, astAngleDeg, pixelSize, amplitudeContrast, bFactor]);

  return (
    <div class="flex flex-col items-center">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        class="rounded-xl border border-slate-700 bg-black shadow-lg"
      />
      <div class="flex items-center justify-between w-full max-w-[220px] text-[10px] text-slate-400 mt-1.5 font-mono">
        <span>-Nyquist</span>
        <span class="text-rose-400">½ Nyquist</span>
        <span>+Nyquist</span>
      </div>
    </div>
  );
}

function CtfCurvePlot({
  profile,
  zeroD1,
  pixelSize,
}: {
  profile: CtfPoint[];
  zeroD1: number;
  pixelSize: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const w = 520;
  const h = 200;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 30;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const midY = padTop + plotH / 2;

  const sMax = 1 / (2 * Math.max(0.1, pixelSize));

  const pts = profile.map((p, i) => {
    const x = padLeft + (p.s / sMax) * plotW;
    const y = midY - p.ctf * (plotH / 2);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const zeroX = zeroD1 > 0 ? padLeft + ((1 / zeroD1) / sMax) * plotW : null;
  const hovered = hoverIdx !== null && profile[hoverIdx] ? profile[hoverIdx] : null;

  return (
    <div class="space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="font-bold text-slate-700 dark:text-slate-300">1D CTF Oscillation Curve &amp; First Zero</span>
        {hovered ? (
          <span class="font-mono font-semibold text-accent-600 dark:text-accent-400">
            s: {hovered.s} Å⁻¹ | d: {hovered.d} Å | CTF: {hovered.ctf}
          </span>
        ) : (
          <span class="text-slate-400 text-[11px]">Hover over curve to inspect frequency &amp; resolution</span>
        )}
      </div>

      <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-2 overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          class="w-full h-auto select-none"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <line x1={padLeft} y1={midY} x2={w - padRight} y2={midY} stroke="currentColor" class="text-slate-300 dark:text-slate-700" stroke-dasharray="3,3" />
          <line x1={padLeft} y1={padTop} x2={w - padRight} y2={padTop} stroke="currentColor" class="text-slate-100 dark:text-slate-800" />
          <line x1={padLeft} y1={padTop + plotH} x2={w - padRight} y2={padTop + plotH} stroke="currentColor" class="text-slate-100 dark:text-slate-800" />

          {zeroX !== null && zeroX >= padLeft && zeroX <= w - padRight && (
            <g>
              <line x1={zeroX} y1={padTop} x2={zeroX} y2={padTop + plotH} stroke="#f43f5e" stroke-dasharray="2,2" stroke-width="1.5" />
              <text x={zeroX} y={padTop + 10} text-anchor="middle" fill="#f43f5e" class="text-[9px] font-mono font-bold">
                d₁: {zeroD1} Å
              </text>
            </g>
          )}

          <path d={pts} fill="none" stroke="#0284c7" stroke-width="2" />

          <text x={padLeft - 6} y={padTop + 4} text-anchor="end" fill="currentColor" class="text-[9px] fill-slate-400 font-mono">+1</text>
          <text x={padLeft - 6} y={midY + 3} text-anchor="end" fill="currentColor" class="text-[9px] fill-slate-400 font-mono">0</text>
          <text x={padLeft - 6} y={padTop + plotH + 3} text-anchor="end" fill="currentColor" class="text-[9px] fill-slate-400 font-mono">-1</text>

          <text x={padLeft} y={h - 8} text-anchor="start" fill="currentColor" class="text-[9px] fill-slate-400 font-mono">0 Å⁻¹ (DC)</text>
          <text x={w - padRight} y={h - 8} text-anchor="end" fill="currentColor" class="text-[9px] fill-slate-400 font-mono">
            {sMax.toFixed(2)} Å⁻¹ ({ (2 * pixelSize).toFixed(1) } Å Nyq)
          </text>

          {profile.map((p, i) => {
            const x = padLeft + (p.s / sMax) * plotW;
            return (
              <rect
                key={i}
                x={x - (plotW / profile.length) / 2}
                y={padTop}
                width={plotW / profile.length}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
            );
          })}

          {hovered && hoverIdx !== null && (
            <circle
              cx={padLeft + (hovered.s / sMax) * plotW}
              cy={midY - hovered.ctf * (plotH / 2)}
              r="4"
              fill="#0ea5e9"
              stroke="#ffffff"
              stroke-width="1.5"
            />
          )}
        </svg>
      </div>
    </div>
  );
}

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

  const ctfResults = useMemo(() => {
    try {
      if (!(s.voltageKv > 0) || !(s.defocusUm > 0) || !(s.pixelSize > 0)) return null;
      const lambdaA = relativisticWavelength(s.voltageKv);
      const zero = firstCtfZero(s.defocusUm, s.voltageKv, s.csMm, s.amplitudeContrast);
      const profile = generateCtfProfile(
        s.voltageKv,
        s.csMm,
        s.defocusUm,
        s.pixelSize,
        s.amplitudeContrast,
        s.bFactor,
        200
      );
      const dfU_um = s.defocusUm + s.astigmatismUm / 2;
      const dfV_um = s.defocusUm - s.astigmatismUm / 2;
      return { lambdaA, zero, profile, dfU_um, dfV_um };
    } catch {
      return null;
    }
  }, [s.voltageKv, s.csMm, s.defocusUm, s.astigmatismUm, s.pixelSize, s.amplitudeContrast, s.bFactor]);

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
    if (ctfResults && s.tab === 'ctf') {
      lines.push(`Voltage: ${s.voltageKv} kV (λ = ${ctfResults.lambdaA.toFixed(4)} Å), Cs: ${s.csMm} mm`);
      lines.push(`Defocus: ${s.defocusUm} µm (U: ${ctfResults.dfU_um.toFixed(3)} µm, V: ${ctfResults.dfV_um.toFixed(3)} µm, Astigmatism: ${s.astigmatismUm} µm at ${s.astAngleDeg}°)`);
      lines.push(`First CTF Zero d1: ${ctfResults.zero.d1.toFixed(2)} Å (s1: ${ctfResults.zero.s1.toFixed(4)} Å⁻¹)`);
      lines.push(`Amplitude contrast: ${(s.amplitudeContrast * 100).toFixed(0)}%, B-factor: ${s.bFactor} Å²`);
    }
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <ToolLayout
      icon="❄️"
      title="Cryo-EM Geometry & Dose"
      blurb="Pixel size, Nyquist resolution limits, electron dose, and relativistic CTF / Thon rings power spectrum simulation."
      inputs={
        <div class="space-y-4">
          <div class="flex gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
            {(
              [
                ['box', 'Box & Sampling'],
                ['dose', 'Dose Calculator'],
                ['ctf', 'CTF & Thon Rings'],
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

          {s.tab === 'ctf' && (
            <div class="space-y-4">
              {/* Microscope Presets */}
              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Microscope Optics Presets
                </label>
                <div class="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    class="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    onClick={() => set({ voltageKv: 300, csMm: 2.7 })}
                  >
                    <strong class="block text-slate-800 dark:text-slate-200">Titan Krios</strong>
                    <span class="text-[10px] text-slate-400">300 kV, Cs 2.7 mm</span>
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    onClick={() => set({ voltageKv: 200, csMm: 2.7 })}
                  >
                    <strong class="block text-slate-800 dark:text-slate-200">Glacios / Arctica</strong>
                    <span class="text-[10px] text-slate-400">200 kV, Cs 2.7 mm</span>
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    onClick={() => set({ voltageKv: 300, csMm: 0.01 })}
                  >
                    <strong class="block text-slate-800 dark:text-slate-200">Cs-Corrected Krios</strong>
                    <span class="text-[10px] text-slate-400">300 kV, Cs 0.01 mm</span>
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    onClick={() => set({ voltageKv: 100, csMm: 2.0 })}
                  >
                    <strong class="block text-slate-800 dark:text-slate-200">100 kV Screening</strong>
                    <span class="text-[10px] text-slate-400">100 kV, Cs 2.0 mm</span>
                  </button>
                </div>
              </div>

              {/* Optics Settings */}
              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Voltage (kV)</span>
                  <DecimalInput
                    class={FIELD}
                    value={s.voltageKv}
                    onChange={voltageKv => set({ voltageKv })}
                    min={50}
                    max={400}
                    step={10}
                  />
                </label>
                <label class="block">
                  <span class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Spherical Aberration Cs (mm)</span>
                  <DecimalInput
                    class={FIELD}
                    value={s.csMm}
                    onChange={csMm => set({ csMm })}
                    min={0}
                    step={0.1}
                  />
                </label>
              </div>

              {/* Defocus & Astigmatism */}
              <div class="space-y-3 pt-1">
                <label class="block">
                  <span class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Mean Underfocus (µm)</span>
                  <DecimalInput
                    class={FIELD}
                    value={s.defocusUm}
                    onChange={defocusUm => set({ defocusUm })}
                    min={0.1}
                    max={10.0}
                    step={0.1}
                  />
                </label>

                <div class="grid grid-cols-2 gap-3">
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Astigmatism (µm)</span>
                    <DecimalInput
                      class={FIELD}
                      value={s.astigmatismUm}
                      onChange={astigmatismUm => set({ astigmatismUm })}
                      min={0}
                      max={2.0}
                      step={0.01}
                    />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Astigmatism Angle (°)</span>
                    <DecimalInput
                      class={FIELD}
                      value={s.astAngleDeg}
                      onChange={astAngleDeg => set({ astAngleDeg })}
                      min={-180}
                      max={180}
                      step={5}
                    />
                  </label>
                </div>
              </div>

              {/* Advanced Envelope & Contrast */}
              <div class="grid grid-cols-2 gap-3 pt-1">
                <label class="block">
                  <span class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Amplitude Contrast (Q)</span>
                  <DecimalInput
                    class={FIELD}
                    value={s.amplitudeContrast}
                    onChange={amplitudeContrast => set({ amplitudeContrast })}
                    min={0}
                    max={1}
                    step={0.01}
                  />
                </label>
                <label class="block">
                  <span class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Envelope B-factor (Å²)</span>
                  <DecimalInput
                    class={FIELD}
                    value={s.bFactor}
                    onChange={bFactor => set({ bFactor })}
                    min={0}
                    max={500}
                    step={10}
                  />
                </label>
              </div>

              <label class="block pt-1">
                <span class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Pixel Size (Å/px)</span>
                <DecimalInput
                  class={FIELD}
                  value={s.pixelSize}
                  onChange={pixelSize => set({ pixelSize })}
                  min={0.1}
                  step={0.01}
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

          {s.tab === 'ctf' && ctfResults && (
            <div class="space-y-4" data-testid="cryo-ctf-result">
              {/* CTF Metrics Banner */}
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">First CTF Zero (d₁)</div>
                  <div class="mono text-xl font-bold text-accent-600">
                    {ctfResults.zero.d1.toFixed(2)} Å
                  </div>
                  <div class="text-xs text-slate-500">s₁: {ctfResults.zero.s1.toFixed(4)} Å⁻¹</div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Electron Wavelength (λ)</div>
                  <div class="mono text-xl font-bold text-slate-800 dark:text-slate-200">
                    {ctfResults.lambdaA.toFixed(4)} Å
                  </div>
                  <div class="text-xs text-slate-500">at {s.voltageKv} kV (rel.)</div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Defocus (U / V)</div>
                  <div class="mono text-base font-bold text-slate-800 dark:text-slate-200">
                    {ctfResults.dfU_um.toFixed(2)} / {ctfResults.dfV_um.toFixed(2)} µm
                  </div>
                  <div class="text-xs text-slate-500">Δ = {s.astigmatismUm} µm ({s.astAngleDeg}°)</div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Nyquist Limit</div>
                  <div class="mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    {(2 * s.pixelSize).toFixed(2)} Å
                  </div>
                  <div class="text-xs text-slate-500">at {s.pixelSize.toFixed(3)} Å/px</div>
                </div>
              </div>

              {/* 1D CTF Oscillation Curve */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
                <CtfCurvePlot
                  profile={ctfResults.profile}
                  zeroD1={ctfResults.zero.d1}
                  pixelSize={s.pixelSize}
                />
              </div>

              {/* 2D Simulated Power Spectrum / Thon Rings */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Simulated 2D Power Spectrum (Thon Rings)
                    </h3>
                    <p class="text-xs text-slate-500">
                      Concentric interference rings displaying astigmatic ellipticity and defocus phase flips (|CTF|²).
                    </p>
                  </div>
                  <span class="text-xs font-mono text-slate-400">
                    {s.astigmatismUm > 0 ? `Astigmatic: ${s.astAngleDeg}°` : 'Round (No Astigmatism)'}
                  </span>
                </div>

                <div class="flex flex-col sm:flex-row items-center justify-around gap-4 pt-2">
                  <ThonRingsCanvas
                    voltageKv={s.voltageKv}
                    csMm={s.csMm}
                    dfU_um={ctfResults.dfU_um}
                    dfV_um={ctfResults.dfV_um}
                    astAngleDeg={s.astAngleDeg}
                    pixelSize={s.pixelSize}
                    amplitudeContrast={s.amplitudeContrast}
                    bFactor={s.bFactor}
                  />

                  <div class="space-y-2 text-xs text-slate-600 dark:text-slate-400 max-w-xs">
                    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                      <strong class="text-slate-700 dark:text-slate-300 block">Interpreting Thon Rings</strong>
                      <p>• Bright rings mark maxima of |CTF|² (constructive phase contrast).</p>
                      <p>• Dark concentric bands correspond to CTF zeros where information transfer drops to 0.</p>
                      <p>• Oval / elliptical rings indicate astigmatism with major/minor axes along the {s.astAngleDeg}° angle.</p>
                      <p>• Rings fade toward the perimeter due to the envelope B-factor decay ({s.bFactor} Å²).</p>
                    </div>
                  </div>
                </div>
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
