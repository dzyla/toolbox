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
  type DiffractionArtifactType,
  DIFFRACTION_PRESETS,
} from '@/core/cryoem';
import { MrcViewer } from './MrcViewer';

interface State {
  tab: 'box' | 'dose' | 'ctf' | 'classes' | 'mag';
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
  diffractionArtifact: DiffractionArtifactType;
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
  diffractionArtifact: 'none',
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
  diffractionArtifact = 'none',
}: {
  voltageKv: number;
  csMm: number;
  dfU_um: number;
  dfV_um: number;
  astAngleDeg: number;
  pixelSize: number;
  amplitudeContrast: number;
  bFactor: number;
  diffractionArtifact?: DiffractionArtifactType;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = 420;

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
      bFactor,
      diffractionArtifact
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

    const cx = size / 2;
    const cy = size / 2;

    // Center crosshairs
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, size);
    ctx.moveTo(0, cy);
    ctx.lineTo(size, cy);
    ctx.stroke();

    // 1/2 Nyquist ring (dashed rose)
    ctx.beginPath();
    ctx.arc(cx, cy, size / 4, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.5)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([3, 3]);
    ctx.stroke();

    // Outer Nyquist boundary
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - 1, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Structural diffraction artifact overlays
    if (diffractionArtifact !== 'none') {
      const preset = DIFFRACTION_PRESETS[diffractionArtifact];
      if (preset) {
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
        if (diffractionArtifact === 'graphene') {
          // 6-fold hexagonal Bragg reflection spots and hexagonal guideline
          const theta0 = (15 * Math.PI) / 180;
          for (let rIdx = 0; rIdx < preset.rings.length; rIdx++) {
            const ring = preset.rings[rIdx]!;
            const rPx = (size * pixelSize) / ring.dSpacingA;
            if (rPx > 6 && rPx <= size / 2) {
              const rotOffset = rIdx === 1 ? Math.PI / 6 : 0;

              // Hexagon guideline
              ctx.beginPath();
              for (let k = 0; k <= 6; k++) {
                const a = theta0 + rotOffset + (k * Math.PI) / 3;
                const hx = cx + rPx * Math.cos(a);
                const hy = cy + rPx * Math.sin(a);
                if (k === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
              }
              ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.stroke();
              ctx.setLineDash([]);

              // Discrete hexagonal reflection spots
              for (let k = 0; k < 6; k++) {
                const a = theta0 + rotOffset + (k * Math.PI) / 3;
                const spotX = cx + rPx * Math.cos(a);
                const spotY = cy + rPx * Math.sin(a);
                ctx.beginPath();
                ctx.arc(spotX, spotY, 3.5, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
              }

              // Label
              ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
              const labelAngle = theta0 + rotOffset;
              ctx.fillText(ring.label, cx + rPx * Math.cos(labelAngle) + 7, cy + rPx * Math.sin(labelAngle) + 3);
            }
          }
        } else {
          // Continuous Debye-Scherrer powder rings (crystalline ice, carbon halo, gold)
          for (const ring of preset.rings) {
            const rPx = (size * pixelSize) / ring.dSpacingA;
            if (rPx > 6 && rPx <= size / 2) {
              ctx.beginPath();
              ctx.arc(cx, cy, rPx, 0, 2 * Math.PI);
              ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)'; // Amber/gold
              ctx.lineWidth = 1.25;
              ctx.setLineDash([4, 4]);
              ctx.stroke();
              ctx.setLineDash([]);

              // Label near top edge of circle
              ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
              ctx.fillText(ring.label, cx + 4, cy - rPx + 11);
            }
          }
        }
      }
    }
  }, [voltageKv, csMm, dfU_um, dfV_um, astAngleDeg, pixelSize, amplitudeContrast, bFactor, diffractionArtifact]);

  const preset = DIFFRACTION_PRESETS[diffractionArtifact || 'none'];

  return (
    <div class="flex flex-col items-center w-full max-w-[440px]">
      <div class="relative w-full aspect-square max-w-[420px]">
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          class="w-full h-full rounded-2xl border border-slate-700 bg-black shadow-xl select-none"
        />
      </div>
      <div class="flex items-center justify-between w-full max-w-[420px] text-[10.5px] text-slate-400 mt-2 font-mono">
        <span>-Nyq ({(2 * pixelSize).toFixed(1)} Å)</span>
        <span class="text-rose-400">½ Nyq ({(4 * pixelSize).toFixed(1)} Å)</span>
        <span class="text-slate-500">DC (0)</span>
        <span class="text-rose-400">½ Nyq</span>
        <span>+Nyq ({(2 * pixelSize).toFixed(1)} Å)</span>
      </div>
      {diffractionArtifact !== 'none' && preset && (
        <div class="mt-2 text-center text-xs text-amber-500 font-medium">
          ⚡ {preset.name}: Bragg diffraction rings overlaid in gold
        </div>
      )}
    </div>
  );
}

function CtfCurvePlot({
  profile,
  zeroD1,
  pixelSize,
  diffractionArtifact = 'none',
}: {
  profile: CtfPoint[];
  zeroD1: number;
  pixelSize: number;
  diffractionArtifact?: DiffractionArtifactType;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [plotMode, setPlotMode] = useState<'both' | 'ctf' | 'power'>('both');

  const w = 520;
  const h = 200;
  const padLeft = 42;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 30;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const midY = padTop + plotH / 2;

  const sMax = 1 / (2 * Math.max(0.1, pixelSize));

  // 1D CTF oscillation curve (-1 to 1)
  const ctfPts = profile.map((p, i) => {
    const x = padLeft + (p.s / sMax) * plotW;
    const y = midY - p.ctf * (plotH / 2);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  // 1D Power spectrum curve (|CTF|² + diffraction) (0 to 1)
  const powerPts = profile.map((p, i) => {
    const x = padLeft + (p.s / sMax) * plotW;
    const y = padTop + plotH - p.power * plotH;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  // Shaded area for diffraction artifact peaks
  const diffAreaPts = useMemo(() => {
    if (diffractionArtifact === 'none') return '';
    const pts: string[] = [];
    let started = false;
    let firstX = 0;
    let lastX = 0;
    const baseY = padTop + plotH;

    for (let i = 0; i < profile.length; i++) {
      const p = profile[i]!;
      const x = padLeft + (p.s / sMax) * plotW;
      const pureSqY = baseY - (p.ctf * p.ctf) * plotH;
      const totalY = baseY - p.power * plotH;

      if ((p.diffraction ?? 0) > 0.01) {
        if (!started) {
          pts.push(`M ${x.toFixed(1)} ${pureSqY.toFixed(1)}`);
          firstX = x;
          started = true;
        }
        pts.push(`L ${x.toFixed(1)} ${totalY.toFixed(1)}`);
        lastX = x;
      } else if (started) {
        pts.push(`L ${lastX.toFixed(1)} ${baseY.toFixed(1)}`);
        started = false;
      }
    }
    return pts.join(' ');
  }, [profile, diffractionArtifact, sMax, plotW, plotH, padLeft, padTop]);

  const zeroX = zeroD1 > 0 ? padLeft + ((1 / zeroD1) / sMax) * plotW : null;
  const hovered = hoverIdx !== null && profile[hoverIdx] ? profile[hoverIdx] : null;

  return (
    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div class="flex items-center gap-2">
          <span class="font-bold text-slate-700 dark:text-slate-300">1D CTF &amp; Diffraction Spectrum</span>
          <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[11px]">
            <button
              type="button"
              onClick={() => setPlotMode('both')}
              class={`px-2 py-0.5 rounded font-medium transition ${plotMode === 'both' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Overlay
            </button>
            <button
              type="button"
              onClick={() => setPlotMode('ctf')}
              class={`px-2 py-0.5 rounded font-medium transition ${plotMode === 'ctf' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              CTF(s)
            </button>
            <button
              type="button"
              onClick={() => setPlotMode('power')}
              class={`px-2 py-0.5 rounded font-medium transition ${plotMode === 'power' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              |CTF|² Power
            </button>
          </div>
        </div>

        {hovered ? (
          <span class="font-mono font-semibold text-accent-600 dark:text-accent-400">
            s: {hovered.s} Å⁻¹ | d: {hovered.d} Å | CTF: {hovered.ctf} | |CTF|²: {hovered.power.toFixed(3)}{hovered.diffraction ? ` | Bragg: +${hovered.diffraction.toFixed(3)}` : ''}
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
          {/* Baseline grid */}
          <line x1={padLeft} y1={midY} x2={w - padRight} y2={midY} stroke="currentColor" class="text-slate-300 dark:text-slate-700" stroke-dasharray="3,3" />
          <line x1={padLeft} y1={padTop} x2={w - padRight} y2={padTop} stroke="currentColor" class="text-slate-100 dark:text-slate-800" />
          <line x1={padLeft} y1={padTop + plotH} x2={w - padRight} y2={padTop + plotH} stroke="currentColor" class="text-slate-200 dark:text-slate-800" />

          {/* First CTF Zero */}
          {zeroX !== null && zeroX >= padLeft && zeroX <= w - padRight && (
            <g>
              <line x1={zeroX} y1={padTop} x2={zeroX} y2={padTop + plotH} stroke="#f43f5e" stroke-dasharray="2,2" stroke-width="1.5" />
              <text x={zeroX} y={padTop + 10} text-anchor="middle" fill="#f43f5e" class="text-[9px] font-mono font-bold">
                d₁: {zeroD1} Å
              </text>
            </g>
          )}

          {/* Diffraction Artifact Markers on 1D spectrum */}
          {diffractionArtifact !== 'none' && DIFFRACTION_PRESETS[diffractionArtifact]?.rings.map(ring => {
            const s0 = 1 / ring.dSpacingA;
            if (s0 > sMax) return null;
            const x = padLeft + (s0 / sMax) * plotW;
            return (
              <g key={ring.label}>
                <line x1={x} y1={padTop} x2={x} y2={padTop + plotH} stroke="#f59e0b" stroke-dasharray="2,2" stroke-width="1.5" />
                <rect x={x - 28} y={padTop + 14} width="56" height="13" rx="3" fill="#fef3c7" class="dark:fill-amber-950" stroke="#f59e0b" stroke-width="0.8" />
                <text x={x} y={padTop + 23} text-anchor="middle" fill="#b45309" class="text-[8px] font-mono font-bold">
                  {ring.label}
                </text>
              </g>
            );
          })}

          {/* Shaded Bragg Diffraction Peak Area */}
          {(plotMode === 'power' || plotMode === 'both') && diffAreaPts && (
            <path d={diffAreaPts} fill="rgba(245, 158, 11, 0.25)" stroke="#f59e0b" stroke-width="1.5" />
          )}

          {/* Power Spectrum curve */}
          {(plotMode === 'power' || plotMode === 'both') && (
            <path d={powerPts} fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray={plotMode === 'both' ? '4,2' : undefined} />
          )}

          {/* CTF amplitude curve */}
          {(plotMode === 'ctf' || plotMode === 'both') && (
            <path d={ctfPts} fill="none" stroke="#0284c7" stroke-width="2" />
          )}

          {/* Y Axis Labels */}
          {plotMode === 'ctf' || plotMode === 'both' ? (
            <>
              <text x={padLeft - 6} y={padTop + 4} text-anchor="end" fill="currentColor" class="text-[9px] fill-slate-400 font-mono">+1</text>
              <text x={padLeft - 6} y={midY + 3} text-anchor="end" fill="currentColor" class="text-[9px] fill-slate-400 font-mono">0</text>
              <text x={padLeft - 6} y={padTop + plotH + 3} text-anchor="end" fill="currentColor" class="text-[9px] fill-slate-400 font-mono">-1</text>
            </>
          ) : (
            <>
              <text x={padLeft - 6} y={padTop + 4} text-anchor="end" fill="currentColor" class="text-[9px] fill-amber-500 font-mono">1.0</text>
              <text x={padLeft - 6} y={midY + 3} text-anchor="end" fill="currentColor" class="text-[9px] fill-amber-500 font-mono">0.5</text>
              <text x={padLeft - 6} y={padTop + plotH + 3} text-anchor="end" fill="currentColor" class="text-[9px] fill-amber-500 font-mono">0.0</text>
            </>
          )}

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
              cy={plotMode === 'power' ? padTop + plotH - hovered.power * plotH : midY - hovered.ctf * (plotH / 2)}
              r="4"
              fill={plotMode === 'power' ? '#f59e0b' : '#0ea5e9'}
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
  const [expandedViewer, setExpandedViewer] = useState(false);

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
        200,
        s.diffractionArtifact
      );
      const dfU_um = s.defocusUm + s.astigmatismUm / 2;
      const dfV_um = s.defocusUm - s.astigmatismUm / 2;
      return { lambdaA, zero, profile, dfU_um, dfV_um };
    } catch {
      return null;
    }
  }, [s.voltageKv, s.csMm, s.defocusUm, s.astigmatismUm, s.pixelSize, s.amplitudeContrast, s.bFactor, s.diffractionArtifact]);

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
      blurb="Pixel size, Nyquist resolution limits, electron dose, relativistic CTF / Thon rings power spectrum, and 2D/3D MRC particle stack viewer."
      wide={true}
      fullWidthResults={s.tab === 'classes' && expandedViewer}
      inputs={
        <div class="space-y-4">
          <div class="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2.5 dark:border-slate-700">
            {(
              [
                ['box', 'Box & Sampling'],
                ['dose', 'Dose Calculator'],
                ['ctf', 'CTF & Thon Rings'],
                ['classes', '2D Classes & 3D Volume'],
                ['mag', 'Magnification'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                class={`min-h-8 rounded-lg px-2.5 py-1 text-xs sm:text-sm font-medium transition flex items-center gap-1.5 ${
                  s.tab === id
                    ? 'bg-accent-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
                onClick={() => set({ tab: id })}
              >
                <span>{label}</span>
                {id === 'classes' && (
                  <span class={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${s.tab === id ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                    Preview
                  </span>
                )}
              </button>
            ))}
          </div>

          {s.tab === 'classes' && (
            <div class="space-y-3 text-xs text-slate-600 dark:text-slate-400">
              {/* Research Preview Disclaimer */}
              <div class="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-1.5">
                <div class="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider">
                  <span>🔬 Research Preview</span>
                </div>
                <p class="text-[11px] leading-relaxed">
                  <strong>Notice:</strong> This is a research preview — a lot of features are here, but they need some work. All outputs, measurements, contrast settings, and projections should be evaluated by a researcher before using it for actual work.
                </p>
              </div>

              <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <h4 class="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
                  📦 MRC / MRCS Format Specifications
                </h4>
                <p>
                  Supports standard CCP4/MRC2014 file headers across Modes 0 (int8), 1 (int16), 2 (float32), and 6 (uint16).
                </p>
                <ul class="list-disc pl-4 space-y-1">
                  <li><strong>2D Stack (.mrcs)</strong>: Curate, select, and export publication-ready grids with calibrated scale bars and contrast leveling.</li>
                  <li><strong>3D Volume (.mrc, .map)</strong>: Scrub synchronized orthogonal slices (XY, XZ, YZ) and compute Maximum Intensity Projections (MIP).</li>
                </ul>
              </div>

              <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <h4 class="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
                  🧪 Negative Stain vs. Cryo-EM
                </h4>
                <ul class="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                  <li>
                    <strong class="text-slate-700 dark:text-slate-300">Cryo-EM:</strong> Vitreous ice matrix; proteins display as light density on darker vitreous ice background (standard contrast).
                  </li>
                  <li>
                    <strong class="text-slate-700 dark:text-slate-300">Negative Stain (NS):</strong> Heavy metal salts (uranyl formate/acetate) accumulate around the particle envelope. Use <em>Invert Contrast</em> or the <em>NS Preset</em> to view dark particles on light background.
                  </li>
                </ul>
              </div>

              <div class="p-3 rounded-xl bg-accent-50/60 dark:bg-accent-950/30 border border-accent-200 dark:border-accent-800 text-accent-800 dark:text-accent-300 text-[11px] space-y-1">
                <strong>💡 Publication Figure Tip:</strong>
                <p>
                  Click <em>Export Options</em> in the viewer to set the exact number of output columns and toggle class numbering (#1, #2) on or off for manuscript figures.
                </p>
              </div>
            </div>
          )}


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

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <label class="block">
                  <span class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Pixel Size (Å/px)</span>
                  <DecimalInput
                    class={FIELD}
                    value={s.pixelSize}
                    onChange={pixelSize => set({ pixelSize })}
                    min={0.1}
                    step={0.01}
                  />
                </label>
                <label class="block">
                  <span class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Diffraction Artifact</span>
                  <select
                    class={FIELD}
                    value={s.diffractionArtifact}
                    onChange={e => set({ diffractionArtifact: (e.target as HTMLSelectElement).value as DiffractionArtifactType })}
                  >
                    <option value="none">Pure Vitreous (None)</option>
                    <option value="ice">Crystalline Ice (3.66 Å, 2.25 Å)</option>
                    <option value="graphene">Graphene Oxide (2.13 Å, 1.23 Å)</option>
                    <option value="carbon">Amorphous Carbon (~4.2 Å)</option>
                    <option value="gold">Gold Grid Foil (2.35 Å, 2.04 Å)</option>
                  </select>
                </label>
              </div>
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
                  diffractionArtifact={s.diffractionArtifact}
                />
              </div>

              {/* 2D Simulated Power Spectrum / Thon Rings */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Simulated 2D Power Spectrum (Thon Rings)
                    </h3>
                    <p class="text-xs text-slate-500">
                      Concentric interference rings displaying astigmatic ellipticity, defocus phase flips (|CTF|²), and diffraction artifacts.
                    </p>
                  </div>
                  <span class="text-xs font-mono text-slate-400">
                    {s.astigmatismUm > 0 ? `Astigmatic: ${s.astAngleDeg}°` : 'Round (No Astigmatism)'}
                  </span>
                </div>

                {/* Enlarged Centered Canvas */}
                <div class="flex flex-col items-center justify-center py-2">
                  <ThonRingsCanvas
                    voltageKv={s.voltageKv}
                    csMm={s.csMm}
                    dfU_um={ctfResults.dfU_um}
                    dfV_um={ctfResults.dfV_um}
                    astAngleDeg={s.astAngleDeg}
                    pixelSize={s.pixelSize}
                    amplitudeContrast={s.amplitudeContrast}
                    bFactor={s.bFactor}
                    diffractionArtifact={s.diffractionArtifact}
                  />
                </div>

                {/* Descriptive Guide & Physics Explanation (Moved BELOW graphics) */}
                <div class="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-slate-600 dark:text-slate-400">
                      <strong class="text-slate-800 dark:text-slate-200 block text-xs">
                        🔬 Interpreting Thon Rings &amp; Astigmatism
                      </strong>
                      <p>• <strong>Bright rings</strong> correspond to maxima of |CTF|² where constructive wave phase interference transfers high-contrast image features.</p>
                      <p>• <strong>Dark circular nodes</strong> mark CTF zero crossings where spatial frequency information transfer drops to 0.</p>
                      <p>• <strong>Elliptical distortion</strong> indicates objective lens astigmatism with defocus disparity Δ = {(s.astigmatismUm * 1000).toFixed(0)} nm along {s.astAngleDeg}°.</p>
                      <p>• <strong>Radial falloff</strong> reflects envelope B-factor decay ({s.bFactor} Å²) from beam partial coherence, energy spread, and motion.</p>
                    </div>

                    <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-slate-600 dark:text-slate-400">
                      <strong class="text-slate-800 dark:text-slate-200 block text-xs">
                        ⚡ {DIFFRACTION_PRESETS[s.diffractionArtifact].name}
                      </strong>
                      <p>{DIFFRACTION_PRESETS[s.diffractionArtifact].description}</p>
                      {s.diffractionArtifact === 'ice' && (
                        <p class="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          ⚠️ <strong>Single-Particle Impact:</strong> Hexagonal ice ($I_h$) rings at 3.66 Å, 2.25 Å, and 1.92 Å produce strong false correlation in 2D/3D classification and degrade high-resolution refinement. Enable ice ring rejection filters in RELION/CryoSPARC.
                        </p>
                      )}
                      {s.diffractionArtifact === 'graphene' && (
                        <p class="text-[11px] text-sky-600 dark:text-sky-400 font-medium">
                          ℹ️ <strong>Single-Particle Impact:</strong> Monolayer single-crystal graphene grids minimize air-water interface denaturation while producing sharp 6-fold hexagonal Bragg diffraction reflections at 2.13 Å {10-10} and 1.23 Å {11-20} without corrupting azimuths between spots.
                        </p>
                      )}
                      {s.diffractionArtifact === 'carbon' && (
                        <p class="text-[11px] text-slate-500 font-medium">
                          ℹ️ <strong>Single-Particle Impact:</strong> Continuous amorphous carbon produces a diffuse scattering halo at ~4.2 Å. It increases background noise but provides isotropic power for CTF fitting at low doses.
                        </p>
                      )}
                      {s.diffractionArtifact === 'gold' && (
                        <p class="text-[11px] text-amber-500 font-medium">
                          ℹ️ <strong>Single-Particle Impact:</strong> UltraAuFoil grids minimize beam-induced specimen motion. FCC gold reflections at 2.35 Å and 2.04 Å provide accurate internal magnification calibration.
                        </p>
                      )}
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

          {s.tab === 'classes' && (
            <div data-testid="cryo-classes-result">
              <MrcViewer
                expanded={expandedViewer}
                onToggleExpand={() => setExpandedViewer(v => !v)}
              />
            </div>
          )}
        </div>
      }
      actions={<ActionBar onCopy={copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
