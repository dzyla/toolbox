import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { decodeImageFile } from '@/lib/image';
import { demoGel } from '@/core/gel/synthetic';
import { autoLanes, equalLanes } from '@/core/gel/lanes';
import { sampleLane, laneProfile, detectBands, type LaneSamples, type BandPeak } from '@/core/gel/profile';
import { rollingBaseline, valleyBaseline } from '@/core/gel/background';
import { quantifyBands, percentOfLane, detectPolarity, SATURATION_WARN, type BandMetrics } from '@/core/gel/quant';
import { fitCalibration, formatSize, type Calibration, type CalibrationModel } from '@/core/gel/calibration';
import type { Plane, Polarity, Lane, Band } from '@/core/gel/types';
import laddersData from '@/data/ladders.json';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { SCIENCE } from './science';

interface LadderPreset {
  id: string;
  name: string;
  supplier: string;
  catalog: string;
  kind: 'protein' | 'dna';
  unit: 'kDa' | 'bp';
  sizes: number[];
  notes?: string;
}

interface State {
  polarity: Polarity;
  bgMethod: 'rolling' | 'valley' | 'none';
  rollingRadius: number;
  prominence: number;
  ladderId: string;
  ladderLaneId: string;
  calModel: CalibrationModel;
  refBandId: string;
  brightness: number;
  contrast: number;
  invertDisplay: boolean;
}

const DEFAULTS: State = {
  polarity: 'dark',
  bgMethod: 'rolling',
  rollingRadius: 30,
  prominence: 0.05,
  ladderId: 'biorad-precision-plus',
  ladderLaneId: '',
  calModel: 'linear',
  refBandId: '',
  brightness: 1,
  contrast: 1,
  invertDisplay: false,
};

const LADDERS = laddersData.ladders as LadderPreset[];

export default function GelView() {
  const [stateSig, shareUrl] = useUrlState<State>('gel', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };
  const [plane, setPlane] = useState<Plane | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [selectedLaneId, setSelectedLaneId] = useState<string>('');
  const [bandMap, setBandMap] = useState<Record<string, Band[]>>({});
  const [numLanesInput, setNumLanesInput] = useState<number>(5);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load demo gel on initial mount if none loaded
  useEffect(() => {
    if (!plane) {
      loadDemo();
    }
  }, []);

  function loadDemo() {
    const demo = demoGel();
    setPlane(demo.plane);
    setImageName('demo_gel.png');
    const detectedPolarity = detectPolarity(demo.plane);
    set({ polarity: detectedPolarity });

    // Initial lanes across image
    const initialLanes = autoLanes(demo.plane, { x: 0, y: 0, w: demo.plane.width, h: demo.plane.height }, detectedPolarity);
    setLanes(initialLanes);
    if (initialLanes.length > 0) {
      setSelectedLaneId(initialLanes[0]!.id);
      set({ ladderLaneId: initialLanes[0]!.id });
    }
  }

  async function handleFileUpload(file: File) {
    try {
      const decoded = await decodeImageFile(file);
      setPlane({ width: decoded.width, height: decoded.height, data: decoded.data });
      setImageName(file.name);
      const pol = detectPolarity({ width: decoded.width, height: decoded.height, data: decoded.data });
      set({ polarity: pol });

      const detected = autoLanes({ width: decoded.width, height: decoded.height, data: decoded.data }, { x: 0, y: 0, w: decoded.width, h: decoded.height }, pol);
      setLanes(detected);
      setBandMap({});
      if (detected.length > 0) {
        setSelectedLaneId(detected[0]!.id);
        set({ ladderLaneId: detected[0]!.id });
      }
    } catch (err) {
      alert(`Error loading image: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Active ladder preset
  const activeLadder = useMemo(() => {
    return LADDERS.find(l => l.id === s.ladderId) || LADDERS[0]!;
  }, [s.ladderId]);

  // Calibration from ladder lane
  const calibration: Calibration | null = useMemo(() => {
    if (!plane || !s.ladderLaneId) return null;
    const ladderLane = lanes.find(l => l.id === s.ladderLaneId);
    if (!ladderLane) return null;

    try {
      const ladderSamples = sampleLane(plane, ladderLane, s.polarity);
      const prof = laneProfile(ladderSamples);
      const peaks: BandPeak[] = detectBands(prof, { minProminence: s.prominence });
      if (peaks.length < (s.calModel === 'spline' ? 3 : 2)) return null;

      const sortedSizes = [...activeLadder.sizes].sort((a, b) => b - a);
      let chosenPeaks = [...peaks].sort((a, b) => b.prominence - a.prominence).slice(0, sortedSizes.length);
      chosenPeaks = chosenPeaks.sort((a, b) => a.index - b.index);

      const points = chosenPeaks.map((p, i) => ({ y: p.index, size: sortedSizes[i]! }));
      return fitCalibration(points, s.calModel);
    } catch {
      return null;
    }
  }, [plane, lanes, s.ladderLaneId, s.polarity, s.prominence, activeLadder, s.calModel]);

  // Selected lane calculations
  const selectedLane = useMemo(() => {
    return lanes.find(l => l.id === selectedLaneId) || lanes[0] || null;
  }, [lanes, selectedLaneId]);

  const laneAnalysis = useMemo(() => {
    if (!plane || !selectedLane) return null;
    const samples: LaneSamples = sampleLane(plane, selectedLane, s.polarity);
    const prof = laneProfile(samples);

    const bands: Band[] = bandMap[selectedLane.id] || detectBands(prof, { minProminence: s.prominence }).map((p, i) => ({
      id: `b-${i + 1}`,
      y0: p.y0,
      y1: p.y1,
      peakY: p.index,
    }));

    let baseline: Float32Array;
    if (s.bgMethod === 'rolling') {
      baseline = rollingBaseline(prof, s.rollingRadius);
    } else if (s.bgMethod === 'valley') {
      baseline = valleyBaseline(prof, bands);
    } else {
      baseline = new Float32Array(prof.length);
    }

    const metrics: BandMetrics[] = quantifyBands(samples, bands, baseline);
    const shares = percentOfLane(metrics);

    // Reference band ratio
    const refMetric = metrics.find(m => m.bandId === s.refBandId);
    const refNet = refMetric ? refMetric.net : (metrics[0]?.net ?? 1);

    const table = metrics.map((m, idx) => {
      const share = shares[idx]?.percentOfLane ?? 0;
      const ratio = refNet > 0 ? m.net / refNet : NaN;
      const sizeEst = calibration && m.peakY !== undefined ? calibration.sizeAt(m.peakY) : null;

      return {
        ...m,
        number: idx + 1,
        share,
        ratio,
        sizeEst,
      };
    });

    return { samples, profile: prof, baseline, bands, metrics: table };
  }, [plane, selectedLane, s.polarity, s.bgMethod, s.rollingRadius, s.prominence, bandMap, s.refBandId, calibration]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plane) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = plane.width;
    canvas.height = plane.height;

    const imgData = ctx.createImageData(plane.width, plane.height);
    const d = imgData.data;

    const b = s.brightness;
    const c = s.contrast;
    const inv = s.invertDisplay;

    for (let i = 0; i < plane.data.length; i++) {
      let val = plane.data[i]!;
      if (inv) val = 1 - val;
      val = (val - 0.5) * c + 0.5;
      val = val * b;
      const byte = Math.max(0, Math.min(255, Math.round(val * 255)));
      const pIdx = i * 4;
      d[pIdx] = byte;
      d[pIdx + 1] = byte;
      d[pIdx + 2] = byte;
      d[pIdx + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    // Draw lanes
    lanes.forEach((l, idx) => {
      const isSelected = l.id === selectedLane?.id;
      const isLadder = l.id === s.ladderLaneId;

      ctx.save();
      ctx.strokeStyle = isSelected ? '#3b82f6' : isLadder ? '#eab308' : '#64748b';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.setLineDash(isSelected ? [] : [4, 4]);

      const half = l.width / 2;
      ctx.strokeRect(l.x - half, l.y0, l.width, l.y1 - l.y0);

      // Label
      ctx.fillStyle = isSelected ? '#3b82f6' : isLadder ? '#eab308' : '#94a3b8';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`L${idx + 1}${isLadder ? ' (Ladder)' : ''}`, l.x - half + 4, l.y0 + 16);

      // Draw bands for this lane if available
      const bands = (isSelected && laneAnalysis ? laneAnalysis.bands : bandMap[l.id]) || [];
      bands.forEach(b => {
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.4)' : 'rgba(148, 163, 184, 0.3)';
        ctx.fillRect(l.x - half, b.y0, l.width, Math.max(1, b.y1 - b.y0));

        if (b.peakY !== undefined) {
          ctx.strokeStyle = isSelected ? '#2563eb' : '#94a3b8';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(l.x - half, b.peakY);
          ctx.lineTo(l.x + half, b.peakY);
          ctx.stroke();

          // Size text if calibrated
          if (calibration) {
            const sz = calibration.sizeAt(b.peakY);
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px sans-serif';
            ctx.fillText(formatSize(sz, activeLadder.kind), l.x + half + 4, b.peakY + 3);
          }
        }
      });

      ctx.restore();
    });
  }, [plane, lanes, selectedLane, laneAnalysis, bandMap, s.brightness, s.contrast, s.invertDisplay, s.ladderLaneId, calibration, activeLadder]);

  function handleAutoLanes() {
    if (!plane) return;
    const detected = autoLanes(plane, { x: 0, y: 0, w: plane.width, h: plane.height }, s.polarity);
    setLanes(detected);
    if (detected.length > 0) setSelectedLaneId(detected[0]!.id);
  }

  function handleEqualLanes() {
    if (!plane) return;
    const eq = equalLanes(numLanesInput, { x: 0, y: 0, w: plane.width, h: plane.height });
    setLanes(eq);
    if (eq.length > 0) setSelectedLaneId(eq[0]!.id);
  }

  function handleAddLane() {
    if (!plane) return;
    const newX = lanes.length > 0 ? Math.min(plane.width - 20, (lanes[lanes.length - 1]?.x ?? 50) + 50) : 50;
    const newLane: Lane = {
      id: `lane-${Date.now()}`,
      x: newX,
      y0: 0,
      y1: plane.height,
      width: 40,
      tilt: 0,
    };
    const updated = [...lanes, newLane];
    setLanes(updated);
    setSelectedLaneId(newLane.id);
  }

  function handleDeleteSelectedLane() {
    if (!selectedLane) return;
    const updated = lanes.filter(l => l.id !== selectedLane.id);
    setLanes(updated);
    if (updated.length > 0) setSelectedLaneId(updated[0]!.id);
  }

  function updateSelectedLane(delta: Partial<Lane>) {
    if (!selectedLane) return;
    setLanes(lanes.map(l => l.id === selectedLane.id ? { ...l, ...delta } : l));
  }

  function exportCsv() {
    if (!laneAnalysis) return;
    const headers = ['Lane', 'Band', 'Peak Y (px)', 'Size', 'Raw Area', 'Background', 'Net Intensity', 'Percent of Lane (%)', 'Ratio to Ref'];
    const rows = laneAnalysis.metrics.map(m => [
      `L${lanes.findIndex(l => l.id === selectedLane?.id) + 1}`,
      `Band ${m.number}`,
      m.peakY !== undefined ? m.peakY.toFixed(1) : '',
      m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '',
      m.raw.toFixed(1),
      m.background.toFixed(1),
      m.net.toFixed(1),
      m.share.toFixed(2),
      Number.isFinite(m.ratio) ? m.ratio.toFixed(3) : '',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${imageName || 'gel'}_quantification.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <ToolLayout
      icon="🧬"
      title="Gel & Blot Analysis"
      blurb="Densitometry, relative quantification and molecular-weight calibration for SDS-PAGE, Western blots and agarose gels"
      inputs={
        <div class="space-y-6">
          {/* Image & Demo */}
          <div class="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 class="text-sm font-semibold text-foreground flex items-center justify-between">
              Image Source
              <span class="text-xs font-normal text-muted-foreground truncate max-w-[120px]">{imageName}</span>
            </h3>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                class="px-3 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
              >
                Upload File / TIFF
              </button>
              <button
                type="button"
                onClick={loadDemo}
                class="px-3 py-2 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition"
              >
                Load Demo Gel
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.tif,.tiff"
                class="hidden"
                onChange={(e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>

            <div class="pt-2 border-t border-border/50">
              <label class="text-xs font-medium text-muted-foreground block mb-1">Signal Polarity</label>
              <select
                value={s.polarity}
                onChange={(e) => set({ polarity: (e.target as HTMLSelectElement).value as Polarity })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background"
              >
                <option value="dark">Dark bands on light (Coomassie, Silver, UV ethidium)</option>
                <option value="light">Light bands on dark (ECL Chemiluminescence, Fluorescence)</option>
              </select>
            </div>
          </div>

          {/* Display Adjustments */}
          <div class="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 class="text-sm font-semibold text-foreground">Display Adjustments</h3>
            <p class="text-xs text-muted-foreground">Adjust display for visibility; densitometry operates strictly on raw pixel values.</p>
            <div class="space-y-2">
              <div>
                <div class="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Brightness</span>
                  <span>{s.brightness.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3"
                  step="0.05"
                  value={s.brightness}
                  onInput={(e) => set({ brightness: parseFloat((e.target as HTMLInputElement).value) })}
                  class="w-full"
                />
              </div>
              <div>
                <div class="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Contrast</span>
                  <span>{s.contrast.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3"
                  step="0.05"
                  value={s.contrast}
                  onInput={(e) => set({ contrast: parseFloat((e.target as HTMLInputElement).value) })}
                  class="w-full"
                />
              </div>
              <label class="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={s.invertDisplay}
                  onChange={(e) => set({ invertDisplay: (e.target as HTMLInputElement).checked })}
                  class="rounded border-border"
                />
                Invert Display View
              </label>
            </div>
          </div>

          {/* Lanes Management */}
          <div class="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 class="text-sm font-semibold text-foreground">Lanes</h3>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAutoLanes}
                class="px-2.5 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition"
              >
                Auto-Find Lanes
              </button>
              <button
                type="button"
                onClick={handleAddLane}
                class="px-2.5 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition"
              >
                + Add Lane
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedLane}
                disabled={lanes.length <= 1}
                class="px-2.5 py-1.5 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition disabled:opacity-50"
              >
                Delete
              </button>
            </div>

            <div class="flex items-center gap-2 pt-2">
              <input
                type="number"
                min="1"
                max="30"
                value={numLanesInput}
                onChange={(e) => setNumLanesInput(parseInt((e.target as HTMLInputElement).value) || 5)}
                class="w-16 text-xs px-2 py-1.5 rounded-lg border border-border bg-background"
              />
              <button
                type="button"
                onClick={handleEqualLanes}
                class="px-2.5 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition flex-1"
              >
                Set Equal Lanes
              </button>
            </div>

            {selectedLane && (
              <div class="pt-3 border-t border-border/50 space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-medium text-muted-foreground">Active Lane</label>
                  <select
                    value={selectedLane.id}
                    onChange={(e) => setSelectedLaneId((e.target as HTMLSelectElement).value)}
                    class="text-xs px-2 py-1 rounded border border-border bg-background"
                  >
                    {lanes.map((l, i) => (
                      <option key={l.id} value={l.id}>Lane {i + 1}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div class="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Lane Width</span>
                    <span>{selectedLane.width} px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="150"
                    value={selectedLane.width}
                    onInput={(e) => updateSelectedLane({ width: parseInt((e.target as HTMLInputElement).value) })}
                    class="w-full"
                  />
                </div>
                <div>
                  <div class="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Horizontal Position</span>
                    <span>{Math.round(selectedLane.x)} px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max={plane ? plane.width - 10 : 400}
                    value={selectedLane.x}
                    onInput={(e) => updateSelectedLane({ x: parseInt((e.target as HTMLInputElement).value) })}
                    class="w-full"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Molecular Weight Calibration (Ladder) */}
          <div class="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 class="text-sm font-semibold text-foreground">Molecular Weight Calibration</h3>
            <div>
              <label class="text-xs font-medium text-muted-foreground block mb-1">Ladder Lane</label>
              <select
                value={s.ladderLaneId}
                onChange={(e) => set({ ladderLaneId: (e.target as HTMLSelectElement).value })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background"
              >
                <option value="">None (no calibration)</option>
                {lanes.map((l, i) => (
                  <option key={l.id} value={l.id}>Lane {i + 1}</option>
                ))}
              </select>
            </div>

            <div>
              <label class="text-xs font-medium text-muted-foreground block mb-1">Standard Ladder Preset</label>
              <select
                value={s.ladderId}
                onChange={(e) => set({ ladderId: (e.target as HTMLSelectElement).value })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background"
              >
                {LADDERS.map(ladder => (
                  <option key={ladder.id} value={ladder.id}>
                    {ladder.name} ({ladder.supplier}) [{ladder.kind.toUpperCase()}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label class="text-xs font-medium text-muted-foreground block mb-1">Fitting Model</label>
              <select
                value={s.calModel}
                onChange={(e) => set({ calModel: (e.target as HTMLSelectElement).value as CalibrationModel })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background"
              >
                <option value="linear">Log-Linear (Weber & Osborn, R²)</option>
                <option value="piecewise">Piecewise Linear</option>
                <option value="spline">Natural Cubic Spline</option>
              </select>
            </div>

            {calibration && (
              <div class="p-2.5 bg-muted/40 rounded-lg text-xs space-y-1">
                <div class="flex justify-between">
                  <span class="text-muted-foreground">Calibration Fit R²:</span>
                  <span class="font-mono font-medium">{calibration.r2.toFixed(4)}</span>
                </div>
                {calibration.slope !== undefined && (
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Slope:</span>
                    <span class="font-mono">{calibration.slope.toFixed(5)}</span>
                  </div>
                )}
                <div class="text-[11px] text-muted-foreground pt-1">
                  Ladder standards: {activeLadder.sizes.join(', ')} {activeLadder.unit}
                </div>
              </div>
            )}
          </div>

          {/* Densitometry & Background */}
          <div class="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 class="text-sm font-semibold text-foreground">Background & Detection</h3>
            <div>
              <label class="text-xs font-medium text-muted-foreground block mb-1">Baseline Subtraction</label>
              <select
                value={s.bgMethod}
                onChange={(e) => set({ bgMethod: (e.target as HTMLSelectElement).value as 'rolling' | 'valley' | 'none' })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background"
              >
                <option value="rolling">Rolling Ball (Morphological Opening)</option>
                <option value="valley">Valley-to-Valley Baseline</option>
                <option value="none">No Background Subtraction</option>
              </select>
            </div>

            {s.bgMethod === 'rolling' && (
              <div>
                <div class="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Rolling Ball Radius</span>
                  <span>{s.rollingRadius} px</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={s.rollingRadius}
                  onInput={(e) => set({ rollingRadius: parseInt((e.target as HTMLInputElement).value) })}
                  class="w-full"
                />
              </div>
            )}

            <div>
              <div class="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Band Detection Sensitivity</span>
                <span>{(s.prominence * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.30"
                step="0.01"
                value={s.prominence}
                onInput={(e) => set({ prominence: parseFloat((e.target as HTMLInputElement).value) })}
                class="w-full"
              />
            </div>
          </div>
        </div>
      }
      results={
        <div class="space-y-6">
          {/* Canvas Area */}
        <div class="bg-card border border-border rounded-xl p-4 overflow-hidden">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-foreground flex items-center gap-2">
              <span>Gel Image & Annotations</span>
              <span class="text-xs font-normal text-muted-foreground">
                {plane ? `${plane.width} × ${plane.height} px` : ''}
              </span>
            </h3>
            <div class="text-xs text-muted-foreground">
              Click & drag lanes in sidebar to adjust. Yellow = Ladder lane, Blue = Active lane.
            </div>
          </div>
          <div class="w-full overflow-auto bg-black/5 dark:bg-black/40 rounded-lg p-2 flex justify-center items-center min-h-[320px]">
            <canvas
              ref={canvasRef}
              class="max-w-full h-auto object-contain shadow rounded border border-border/50"
            />
          </div>
        </div>

        {/* Densitometry Profile Chart */}
        {laneAnalysis && (
          <div class="bg-card border border-border rounded-xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-foreground">
                Densitometry Profile — Lane {lanes.findIndex(l => l.id === selectedLane?.id) + 1}
              </h3>
              <div class="text-xs text-muted-foreground flex gap-4">
                <span class="flex items-center gap-1.5"><span class="w-3 h-0.5 bg-blue-500 inline-block"></span> Signal</span>
                <span class="flex items-center gap-1.5"><span class="w-3 h-0.5 bg-amber-500 inline-block border-t border-dashed"></span> Baseline</span>
              </div>
            </div>

            <div class="h-44 w-full bg-muted/20 rounded-lg p-2 relative overflow-hidden">
              <svg class="w-full h-full" viewBox={`0 0 ${laneAnalysis.profile.length} 100`} preserveAspectRatio="none">
                {/* Find max value for scaling */}
                {(() => {
                  let maxVal = 0.001;
                  for (let i = 0; i < laneAnalysis.profile.length; i++) {
                    if (laneAnalysis.profile[i]! > maxVal) maxVal = laneAnalysis.profile[i]!;
                  }
                  maxVal *= 1.1;

                  // Signal path
                  let sigPath = `M 0 ${100 - (laneAnalysis.profile[0]! / maxVal) * 100}`;
                  for (let i = 1; i < laneAnalysis.profile.length; i++) {
                    sigPath += ` L ${i} ${100 - (laneAnalysis.profile[i]! / maxVal) * 100}`;
                  }

                  // Baseline path
                  let basePath = `M 0 ${100 - (laneAnalysis.baseline[0]! / maxVal) * 100}`;
                  for (let i = 1; i < laneAnalysis.baseline.length; i++) {
                    basePath += ` L ${i} ${100 - (laneAnalysis.baseline[i]! / maxVal) * 100}`;
                  }

                  return (
                    <g>
                      {/* Grid lines */}
                      <line x1="0" y1="25" x2={laneAnalysis.profile.length} y2="25" stroke="currentColor" stroke-opacity="0.05" />
                      <line x1="0" y1="50" x2={laneAnalysis.profile.length} y2="50" stroke="currentColor" stroke-opacity="0.05" />
                      <line x1="0" y1="75" x2={laneAnalysis.profile.length} y2="75" stroke="currentColor" stroke-opacity="0.05" />

                      {/* Band regions */}
                      {laneAnalysis.bands.map(b => (
                        <rect
                          key={b.id}
                          x={b.y0}
                          y="0"
                          width={Math.max(1, b.y1 - b.y0)}
                          height="100"
                          fill="rgba(59, 130, 246, 0.08)"
                        />
                      ))}

                      {/* Baseline */}
                      <path d={basePath} fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3,3" />

                      {/* Signal */}
                      <path d={sigPath} fill="none" stroke="#3b82f6" stroke-width="1.5" />

                      {/* Detected peak dots */}
                      {laneAnalysis.bands.map((b) => {
                        if (b.peakY === undefined) return null;
                        const yVal = laneAnalysis.profile[Math.round(b.peakY)] ?? 0;
                        return (
                          <circle
                            key={b.id}
                            cx={b.peakY}
                            cy={100 - (yVal / maxVal) * 100}
                            r="3"
                            fill="#ef4444"
                          />
                        );
                      })}
                    </g>
                  );
                })()}
              </svg>
            </div>
          </div>
        )}

        {/* Quantification Table */}
        {laneAnalysis && (
          <div class="bg-card border border-border rounded-xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-foreground">
                Band Quantification — Lane {lanes.findIndex(l => l.id === selectedLane?.id) + 1}
              </h3>
              <button
                type="button"
                onClick={exportCsv}
                class="px-3 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition"
              >
                Export CSV
              </button>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-xs text-left">
                <thead class="border-b border-border text-muted-foreground">
                  <tr>
                    <th class="py-2 px-3 font-medium">#</th>
                    <th class="py-2 px-3 font-medium">Migration (px)</th>
                    <th class="py-2 px-3 font-medium">Est. Size</th>
                    <th class="py-2 px-3 font-medium">Raw Area</th>
                    <th class="py-2 px-3 font-medium">Baseline</th>
                    <th class="py-2 px-3 font-medium">Net Intensity</th>
                    <th class="py-2 px-3 font-medium">% of Lane</th>
                    <th class="py-2 px-3 font-medium">Ratio to Ref</th>
                    <th class="py-2 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border/50">
                  {laneAnalysis.metrics.map(m => (
                    <tr key={m.bandId} class="hover:bg-muted/30 transition-colors">
                      <td class="py-2 px-3 font-medium text-foreground">Band {m.number}</td>
                      <td class="py-2 px-3 font-mono">{m.peakY !== undefined ? m.peakY.toFixed(1) : '–'}</td>
                      <td class="py-2 px-3 font-medium text-blue-600 dark:text-blue-400">
                        {m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '–'}
                      </td>
                      <td class="py-2 px-3 font-mono">{m.raw.toFixed(1)}</td>
                      <td class="py-2 px-3 font-mono text-muted-foreground">{m.background.toFixed(1)}</td>
                      <td class="py-2 px-3 font-mono font-semibold text-foreground">{m.net.toFixed(1)}</td>
                      <td class="py-2 px-3 font-mono">{m.share.toFixed(2)} %</td>
                      <td class="py-2 px-3 font-mono">{Number.isFinite(m.ratio) ? m.ratio.toFixed(2) : '–'}</td>
                      <td class="py-2 px-3">
                        {m.saturation > SATURATION_WARN ? (
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200">
                            Saturated ({(m.saturation * 100).toFixed(0)}%)
                          </span>
                        ) : (
                          <span class="text-muted-foreground text-[11px]">Linear</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      }
      actions={
        <ActionBar
          onCopy={() => {
            if (!laneAnalysis) return '';
            return laneAnalysis.metrics.map(m =>
              `Band ${m.number}: Net=${m.net.toFixed(1)} (${m.share.toFixed(1)}%) ${m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : ''}`
            ).join('\n');
          }}
          shareUrl={shareUrl}
        />
      }
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
