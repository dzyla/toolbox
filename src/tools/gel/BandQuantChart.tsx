/* Band quantification chart (lane profiles, band shares, western-blot target matching) for the gel tool. */
import { useEffect, useState, useMemo } from 'preact/hooks';
import { formatSize } from '@/core/gel/calibration';
import { type Plane, type Lane } from '@/core/gel/types';
import { type LaneAnalysisItem, type QuantBandMetric, getMassColor, type TargetBandCluster, computeTargetBandClusters, findTargetBandInLane } from './analysis';

function westernBlotSliceDataUrl(opts: {
  plane: Plane;
  lane: Lane;
  targetY: number;
  windowHeightPx?: number;
  stripWidthPx?: number;
  display: { minClip: number; maxClip: number; gamma: number; contrast: number; brightness: number; invert: boolean };
}): string | null {
  const { plane, lane, targetY, windowHeightPx = 96, stripWidthPx = 44, display } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = stripWidthPx;
  canvas.height = windowHeightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(stripWidthPx, windowHeightPx);
  const data = img.data;
  const halfH = windowHeightPx / 2;
  const halfW = lane.width / 2;
  const laneLen = Math.max(1, lane.y1 - lane.y0);
  const clipRange = Math.max(0.01, display.maxClip - display.minClip);

  for (let r = 0; r < windowHeightPx; r++) {
    const curY = lane.y0 + targetY - halfH + r;
    const t = Math.max(0, Math.min(1, (curY - lane.y0) / laneLen));
    const curX = lane.x + t * lane.tilt;

    for (let c = 0; c < stripWidthPx; c++) {
      const v = (c / (stripWidthPx - 1) - 0.5) * 2;
      const gx = Math.max(0, Math.min(plane.width - 1, Math.round(curX + v * halfW)));
      const gy = Math.max(0, Math.min(plane.height - 1, Math.round(curY)));

      let val = 0;
      if (curY >= 0 && curY < plane.height) {
        val = plane.data[gy * plane.width + gx] ?? 0;
      }
      let adj = Math.max(0, Math.min(1, (val - display.minClip) / clipRange));
      if (display.gamma !== 1) adj = Math.pow(adj, 1 / display.gamma);
      adj = (adj - 0.5) * display.contrast + 0.5;
      adj = adj * display.brightness;
      if (display.invert) adj = 1 - adj;
      adj = Math.max(0, Math.min(1, adj));
      const g = Math.round(adj * 255);
      const i = (r * stripWidthPx + c) * 4;
      data[i] = g; data[i + 1] = g; data[i + 2] = g; data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Center alignment guide tick marks on the edges (without crossing the band)
  ctx.fillStyle = '#10b981';
  ctx.fillRect(0, halfH - 1, 3, 2);
  ctx.fillRect(stripWidthPx - 3, halfH - 1, 3, 2);

  return canvas.toDataURL();
}

export function BandQuantChart({
  analysis,
  ladderKind,
  laneLabels,
  selectedLaneId,
  onSelectLane,
  ladderLaneId,
  ladderSizes = [],
  loadingRefLaneId,
  initialMode = 'lane',
  plane,
  display,
}: {
  analysis: LaneAnalysisItem[];
  ladderKind: 'protein' | 'dna';
  laneLabels: Record<string, string>;
  selectedLaneId?: string;
  onSelectLane?: (laneId: string) => void;
  ladderLaneId?: string;
  ladderSizes?: number[];
  loadingRefLaneId?: string;
  initialMode?: 'lane' | 'mass' | 'loading';
  /** Gel plane + display settings, used to render the whole-lane preview strips in WB (mass) mode. */
  plane?: Plane;
  display?: { minClip: number; maxClip: number; gamma: number; contrast: number; brightness: number; invert: boolean };
}) {
  const [chartMode, setChartMode] = useState<'lane' | 'mass' | 'loading'>(initialMode);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [detectionMarginPct, setDetectionMarginPct] = useState<number>(15);
  const [massRefLaneId, setMassRefLaneId] = useState<string>('');
  const [metric, setMetric] = useState<'net' | 'raw' | 'share'>('net');
  const [hoveredBar, setHoveredBar] = useState<{
    laneIdx: number;
    bandNum?: number;
    val: number;
    size?: string;
    share?: number;
    fold?: string;
    loadingRatio?: number;
    loadingDev?: number;
  } | null>(null);

  useEffect(() => {
    if (initialMode) setChartMode(initialMode);
  }, [initialMode]);

  const targetBandClusters = useMemo(() => {
    return computeTargetBandClusters(analysis, detectionMarginPct, ladderKind, ladderSizes);
  }, [analysis, detectionMarginPct, ladderKind, ladderSizes]);

  const activeTarget = useMemo<TargetBandCluster | null>(() => {
    if (targetBandClusters.length === 0) return null;
    if (selectedTargetId) {
      const found = targetBandClusters.find(c => c.id === selectedTargetId);
      if (found) return found;
    }
    // Default to the cluster that appears in the most lanes
    const sorted = [...targetBandClusters].sort((a, b) => b.matchingLanesCount - a.matchingLanesCount);
    return sorted[0] || targetBandClusters[0] || null;
  }, [targetBandClusters, selectedTargetId]);

  const matchedBandsPerLane = useMemo<Record<string, QuantBandMetric | null>>(() => {
    const map: Record<string, QuantBandMetric | null> = {};
    if (!activeTarget) return map;
    for (const item of analysis) {
      map[item.lane.id] = findTargetBandInLane(
        item,
        activeTarget.avgSize,
        activeTarget.avgRf,
        detectionMarginPct,
      );
    }
    return map;
  }, [analysis, activeTarget, detectionMarginPct]);

  // WB (mass) mode whole-lane strip previews, memoised per (plane, lanes, target band, display).
  const disp = display;
  const wbStripUrls = useMemo<Record<string, string>>(() => {
    const urls: Record<string, string> = {};
    if (chartMode !== 'mass' || !plane || !disp || !activeTarget) return urls;

    // Find median targetY across lanes that have this band detected
    const validTargetYs = analysis
      .map(a => matchedBandsPerLane[a.lane.id]?.peakY)
      .filter((y): y is number => typeof y === 'number' && Number.isFinite(y));
    const medianTargetY = validTargetYs.length > 0
      ? validTargetYs.slice().sort((a, b) => a - b)[Math.floor(validTargetYs.length / 2)]!
      : activeTarget.medianPeakY;

    for (const item of analysis) {
      const matched = matchedBandsPerLane[item.lane.id];
      const targetY = matched?.peakY !== undefined
        ? matched.peakY
        : medianTargetY;

      const url = westernBlotSliceDataUrl({
        plane,
        lane: item.lane,
        targetY,
        windowHeightPx: 96,
        stripWidthPx: 44,
        display: disp,
      });
      if (url) urls[item.lane.id] = url;
    }
    return urls;
  }, [chartMode, plane, analysis, activeTarget, matchedBandsPerLane, disp?.minClip, disp?.maxClip, disp?.gamma, disp?.contrast, disp?.brightness, disp?.invert]);

  if (analysis.length === 0) return null;

  const chartW = 750;
  const chartH = 260;
  const padLeft = 65;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 50;
  const innerW = chartW - padLeft - padRight;
  const innerH = chartH - padTop - padBottom;

  const getMetricVal = (m?: { net: number; raw: number; share: number }) => {
    if (!m) return 0;
    if (metric === 'net') return Math.max(0, m.net);
    if (metric === 'raw') return Math.max(0, m.raw);
    return Math.max(0, m.share);
  };

  // Compute maxVal based on mode
  const maxVal = Math.max(
    1,
    chartMode === 'loading'
      ? Math.max(...analysis.map(a => a.totalLaneSignal))
      : chartMode === 'mass'
        ? Math.max(1, ...analysis.map(a => getMetricVal(matchedBandsPerLane[a.lane.id] ?? undefined)))
        : Math.max(1, ...analysis.flatMap(a => a.metrics.map(getMetricVal)))
  );

  // Reference for fold-change in mass mode (defaults to first non-ladder lane with matched band)
  const defaultRefLane = (loadingRefLaneId ? analysis.find(a => a.lane.id === loadingRefLaneId) : null)
    || analysis.find(a => a.lane.id !== ladderLaneId && matchedBandsPerLane[a.lane.id] !== null)
    || analysis.find(a => matchedBandsPerLane[a.lane.id] !== null)
    || analysis[0];

  const activeRefLaneId = massRefLaneId && analysis.some(a => a.lane.id === massRefLaneId)
    ? massRefLaneId
    : (defaultRefLane?.lane.id || '');

  const refMetric = matchedBandsPerLane[activeRefLaneId];
  const refVal = refMetric ? getMetricVal(refMetric) : 0;

  // Reference for loading comparison
  const refLaneItem = (loadingRefLaneId ? analysis.find(a => a.lane.id === loadingRefLaneId) : null) || analysis[0];
  const refLaneSignal = refLaneItem?.totalLaneSignal || 1;

  // Mass legend bins
  const proteinMassBins = [
    { label: '>180', color: '#581c87' },
    { label: '130-180', color: '#7c3aed' },
    { label: '95-130', color: '#2563eb' },
    { label: '68-95', color: '#0284c7' },
    { label: '50-68', color: '#0d9488' },
    { label: '38-50', color: '#16a34a' },
    { label: '28-38', color: '#65a30d' },
    { label: '20-28', color: '#d97706' },
    { label: '14-20', color: '#ea580c' },
    { label: '<14 kDa', color: '#e11d48' },
  ];

  const dnaMassBins = [
    { label: '>8 kb', color: '#581c87' },
    { label: '5-8 kb', color: '#7c3aed' },
    { label: '3-5 kb', color: '#2563eb' },
    { label: '1.5-3 kb', color: '#0284c7' },
    { label: '1-1.5 kb', color: '#0d9488' },
    { label: '700-1k', color: '#16a34a' },
    { label: '400-700', color: '#65a30d' },
    { label: '200-400', color: '#d97706' },
    { label: '<200 bp', color: '#e11d48' },
  ];

  const legendBins = ladderKind === 'protein' ? proteinMassBins : dnaMassBins;

  return (
    <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
            📊 Quantification &amp; Densitometry Chart
          </span>
          {/* Mode toggle (not shown in the locked Loading-control view) */}
          {initialMode !== 'loading' && (
          <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900 text-xs">
            <button
              type="button"
              onClick={() => setChartMode('lane')}
              class={`px-2.5 py-0.5 rounded font-medium transition ${chartMode === 'lane' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              By lane
            </button>
            <button
              type="button"
              onClick={() => setChartMode('mass')}
              class={`px-2.5 py-0.5 rounded font-medium transition ${chartMode === 'mass' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              By band size (Western blot)
            </button>
          </div>
          )}

          {chartMode === 'mass' && (
            <div class="flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-1">
                <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Target:</span>
                <select aria-label="Target"
                  value={activeTarget?.id || ''}
                  onChange={(e) => setSelectedTargetId((e.target as HTMLSelectElement).value)}
                  class="text-xs px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold max-w-[210px] truncate"
                  title="Target band to compare across all wells"
                >
                  {targetBandClusters.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div class="flex items-center gap-1">
                <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Margin:</span>
                <select aria-label="Margin"
                  value={String(detectionMarginPct)}
                  onChange={(e) => setDetectionMarginPct(parseInt((e.target as HTMLSelectElement).value) || 15)}
                  class="text-xs px-1.5 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-mono font-medium"
                  title="Margin of detection / tolerance window for matching target band across lanes"
                >
                  <option value="5">±5% (Strict)</option>
                  <option value="10">±10%</option>
                  <option value="15">±15% (Std)</option>
                  <option value="20">±20%</option>
                  <option value="25">±25%</option>
                  <option value="30">±30% (Permissive)</option>
                </select>
              </div>

              <div class="flex items-center gap-1">
                <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Ref:</span>
                <select aria-label="Ref"
                  value={activeRefLaneId}
                  onChange={(e) => setMassRefLaneId((e.target as HTMLSelectElement).value)}
                  class="text-xs px-1.5 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-medium max-w-[130px] truncate"
                  title="Reference lane for relative fold change"
                >
                  {analysis.map((item, idx) => (
                    <option key={item.lane.id} value={item.lane.id}>
                      {laneLabels[item.lane.id] || `Lane ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {chartMode !== 'loading' ? (
          <div class="flex items-center gap-2 text-xs">
            <span class="text-slate-500 dark:text-slate-400">Metric:</span>
            <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setMetric('net')}
                class={`px-2.5 py-0.5 rounded font-medium transition ${metric === 'net' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
              >
                Net OD
              </button>
              <button
                type="button"
                onClick={() => setMetric('raw')}
                class={`px-2.5 py-0.5 rounded font-medium transition ${metric === 'raw' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
              >
                Raw Volume
              </button>
              <button
                type="button"
                onClick={() => setMetric('share')}
                class={`px-2.5 py-0.5 rounded font-medium transition ${metric === 'share' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
              >
                % Share
              </button>
            </div>
          </div>
        ) : (
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Green: within ±15% of the reference lane · amber: moderate difference · red: large difference
          </p>
        )}
      </div>

      {/* Detail inspect bar */}
      <div class="min-h-[32px] flex items-center">
        {hoveredBar ? (
          <div class="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-4 w-full shadow-2xs">
            <span>Lane: <strong>L{hoveredBar.laneIdx + 1}</strong></span>
            {hoveredBar.bandNum !== undefined && <span>Band: <strong>#{hoveredBar.bandNum}</strong></span>}
            {hoveredBar.size && <span>Est. MW: <strong class="text-accent-600 dark:text-accent-400">{hoveredBar.size}</strong></span>}
            <span>Value: <strong>{Math.round(hoveredBar.val).toLocaleString()} {chartMode === 'loading' ? 'Total OD · px' : (metric === 'share' ? '%' : 'OD')}</strong></span>
            {hoveredBar.fold && <span>Relative Fold: <strong class="text-emerald-700 dark:text-emerald-400">{hoveredBar.fold}</strong></span>}
            {hoveredBar.loadingRatio !== undefined && (
              <span>Loading Ratio: <strong class={Math.abs((hoveredBar.loadingRatio - 1) * 100) > 20 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}>
                {hoveredBar.loadingRatio.toFixed(2)}× ({hoveredBar.loadingDev! > 0 ? `+${hoveredBar.loadingDev!.toFixed(1)}%` : `${hoveredBar.loadingDev!.toFixed(1)}%`})
              </strong></span>
            )}
          </div>
        ) : (
          <div class="text-xs text-slate-500 dark:text-slate-400 italic px-1">
            {chartMode === 'loading'
              ? 'Total signal per lane; bars far from the reference lane indicate unequal loading.'
              : 'Hover over any bar in the chart to inspect quantification details without layout shift.'}
          </div>
        )}
      </div>

      <div class="overflow-x-auto">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} class="w-full h-auto min-w-[500px] select-none">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => {
            const y = padTop + innerH * (1 - frac);
            const labelVal = frac * maxVal;
            return (
              <g key={frac}>
                <line x1={padLeft} x2={chartW - padRight} y1={y} y2={y} stroke="#e2e8f0" stroke-dasharray="3,3" />
                <text x={padLeft - 6} y={y + 4} font-size="9" text-anchor="end" fill="#94a3b8" font-family="monospace">
                  {chartMode === 'loading' ? Math.round(labelVal).toLocaleString() : (metric === 'share' ? `${Math.round(labelVal)}%` : Math.round(labelVal).toLocaleString())}
                </text>
              </g>
            );
          })}

          {chartMode === 'loading' && (
            /* Reference lane horizontal guideline and ±15% equal loading corridor */
            (() => {
              const refY = padTop + innerH - (refLaneSignal / maxVal) * innerH;
              const topY = padTop + innerH - ((refLaneSignal * 1.15) / maxVal) * innerH;
              const botY = padTop + innerH - ((refLaneSignal * 0.85) / maxVal) * innerH;
              return (
                <g>
                  {/* Equal loading target corridor (±15%) */}
                  <rect
                    x={padLeft}
                    y={Math.max(padTop, topY)}
                    width={innerW}
                    height={Math.max(1, botY - topY)}
                    fill="rgba(16, 185, 129, 0.08)"
                  />
                  <line
                    x1={padLeft}
                    x2={chartW - padRight}
                    y1={refY}
                    y2={refY}
                    stroke="#10b981"
                    stroke-dasharray="4,3"
                    stroke-width="1.5"
                  />
                  <text
                    x={chartW - padRight - 4}
                    y={refY - 4}
                    font-size="8"
                    font-weight="bold"
                    text-anchor="end"
                    fill="#059669"
                  >
                    100% Target Ref Loading (±15% Equal Band)
                  </text>
                </g>
              );
            })()
          )}

          {chartMode === 'lane' ? (
            /* Multi-band columns per lane with mass color coding */
            analysis.map((item, lIdx) => {
              const groupW = innerW / Math.max(1, analysis.length);
              const groupX = padLeft + lIdx * groupW;
              const bCount = Math.max(1, item.metrics.length);
              const colW = Math.min(26, Math.max(4, (groupW - 12) / bCount));
              const isSelectedLane = item.lane.id === selectedLaneId;
              const customLabel = laneLabels[item.lane.id] || `L${lIdx + 1}`;

              return (
                <g key={item.lane.id} onClick={() => onSelectLane?.(item.lane.id)} class="cursor-pointer">
                  {isSelectedLane && (
                    <rect x={groupX + 2} y={padTop} width={groupW - 4} height={innerH} fill="rgba(37, 99, 235, 0.08)" rx="4" />
                  )}
                  {item.metrics.map((m, bIdx) => {
                    const val = getMetricVal(m);
                    const barH = (val / maxVal) * innerH;
                    const barX = groupX + (groupW - bCount * colW) / 2 + bIdx * colW;
                    const barY = padTop + innerH - barH;
                    const laneH = item.lane.y1 - item.lane.y0 || 1;
                    const color = getMassColor(m.sizeEst, ladderKind, (m.peakY ?? 0) / laneH);
                    const szText = m.sizeEst ? formatSize(m.sizeEst, ladderKind) : '';

                    return (
                      <g
                        key={m.bandId}
                        onMouseEnter={() => setHoveredBar({ laneIdx: lIdx, bandNum: bIdx + 1, val, size: szText, share: m.share })}
                        onMouseLeave={() => setHoveredBar(null)}
                      >
                        <rect
                          x={barX + 1}
                          y={barY}
                          width={Math.max(2, colW - 2)}
                          height={Math.max(2, barH)}
                          fill={color}
                          rx="2"
                          opacity={hoveredBar && hoveredBar.laneIdx === lIdx && hoveredBar.bandNum === bIdx + 1 ? 1 : 0.88}
                        />
                        {barH > 22 && colW >= 12 && (
                          <text
                            x={barX + colW / 2}
                            y={barY + 11}
                            font-size="8"
                            font-weight="bold"
                            text-anchor="middle"
                            fill="#ffffff"
                          >
                            {bIdx + 1}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text
                    x={groupX + groupW / 2}
                    y={chartH - padBottom + 16}
                    font-size="10"
                    font-weight={isSelectedLane ? 'bold' : 'normal'}
                    text-anchor="middle"
                    fill={isSelectedLane ? '#2563eb' : '#64748b'}
                  >
                    {customLabel.length > 10 ? `${customLabel.slice(0, 9)}…` : customLabel}
                  </text>
                </g>
              );
            })
          ) : chartMode === 'mass' ? (
            /* Target Mass mode (Western Blot cross-lane comparison) */
            analysis.map((item, lIdx) => {
              const groupW = innerW / Math.max(1, analysis.length);
              const groupX = padLeft + lIdx * groupW;
              const m = matchedBandsPerLane[item.lane.id];
              const val = getMetricVal(m ?? undefined);
              const barH = (val / maxVal) * innerH;
              const colW = Math.min(45, Math.max(14, groupW - 16));
              const barX = groupX + (groupW - colW) / 2;
              const barY = padTop + innerH - barH;
              const isSelectedLane = item.lane.id === selectedLaneId;
              const customLabel = laneLabels[item.lane.id] || `L${lIdx + 1}`;
              const foldStr = refVal > 0 && m ? `${(val / refVal).toFixed(2)}×` : '—';
              const szText = m?.sizeEst ? formatSize(m.sizeEst, ladderKind) : (activeTarget?.avgSize ? `~${formatSize(activeTarget.avgSize, ladderKind)}` : '');
              const barColor = getMassColor(m?.sizeEst ?? activeTarget?.avgSize, ladderKind);

              return (
                <g key={item.lane.id} onClick={() => onSelectLane?.(item.lane.id)} class="cursor-pointer">
                  {isSelectedLane && (
                    <rect x={groupX + 2} y={padTop} width={groupW - 4} height={innerH} fill="rgba(37, 99, 235, 0.08)" rx="4" />
                  )}
                  {m ? (
                    <g
                      onMouseEnter={() => setHoveredBar({ laneIdx: lIdx, bandNum: m.number, val, size: szText, share: m.share, fold: foldStr })}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      <rect
                        x={barX}
                        y={barY}
                        width={colW}
                        height={Math.max(2, barH)}
                        fill={barColor}
                        rx="3"
                        opacity={hoveredBar && hoveredBar.laneIdx === lIdx ? 1 : 0.88}
                      />
                      {/* Fold change label on top of bar */}
                      <text
                        x={barX + colW / 2}
                        y={Math.max(padTop + 10, barY - 4)}
                        font-size="9"
                        font-weight="bold"
                        text-anchor="middle"
                        fill={barColor}
                        font-family="monospace"
                      >
                        {foldStr}
                      </text>
                    </g>
                  ) : (
                    <text
                      x={groupX + groupW / 2}
                      y={padTop + innerH - 8}
                      font-size="9"
                      font-style="italic"
                      fill="#94a3b8"
                      text-anchor="middle"
                    >
                      n/d
                    </text>
                  )}
                  <text
                    x={groupX + groupW / 2}
                    y={chartH - padBottom + 16}
                    font-size="10"
                    font-weight={isSelectedLane ? 'bold' : 'normal'}
                    text-anchor="middle"
                    fill={isSelectedLane ? '#2563eb' : '#64748b'}
                  >
                    {customLabel.length > 10 ? `${customLabel.slice(0, 9)}…` : customLabel}
                  </text>
                </g>
              );
            })
          ) : (
            /* Line Loading Comparison mode (Ponceau S / Total integrated signal per lane) */
            analysis.map((item, lIdx) => {
              const groupW = innerW / Math.max(1, analysis.length);
              const groupX = padLeft + lIdx * groupW;
              const val = item.totalLaneSignal;
              const barH = (val / maxVal) * innerH;
              const colW = Math.min(50, Math.max(16, groupW - 14));
              const barX = groupX + (groupW - colW) / 2;
              const barY = padTop + innerH - barH;
              const isSelectedLane = item.lane.id === selectedLaneId;
              const isRefLane = item.lane.id === refLaneItem?.lane.id;
              const customLabel = laneLabels[item.lane.id] || `L${lIdx + 1}`;
              const ratio = refLaneSignal > 0 ? val / refLaneSignal : 1;
              const devPct = (ratio - 1) * 100;
              const ratioStr = isRefLane ? '1.00× (Ref)' : `${ratio.toFixed(2)}×`;

              // Color coding by loading quality relative to reference lane
              const barColor = isRefLane
                ? '#10b981' // Green for reference
                : Math.abs(devPct) <= 15
                  ? '#059669' // Good loading (within 15%)
                  : Math.abs(devPct) <= 25
                    ? '#d97706' // Moderate deviation (15-25%)
                    : '#e11d48'; // High deviation (>25%)

              return (
                <g key={item.lane.id} onClick={() => onSelectLane?.(item.lane.id)} class="cursor-pointer">
                  {isSelectedLane && (
                    <rect x={groupX + 2} y={padTop} width={groupW - 4} height={innerH} fill="rgba(37, 99, 235, 0.08)" rx="4" />
                  )}
                  <g
                    onMouseEnter={() => setHoveredBar({ laneIdx: lIdx, val, loadingRatio: ratio, loadingDev: devPct })}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    <rect
                      x={barX}
                      y={barY}
                      width={colW}
                      height={Math.max(2, barH)}
                      fill={barColor}
                      rx="3"
                      opacity={hoveredBar && hoveredBar.laneIdx === lIdx ? 1 : 0.88}
                    />
                    {/* Ratio on top */}
                    <text
                      x={barX + colW / 2}
                      y={Math.max(padTop + 10, barY - 4)}
                      font-size="8.5"
                      font-weight="bold"
                      text-anchor="middle"
                      fill={barColor}
                      font-family="monospace"
                    >
                      {ratioStr}
                    </text>
                  </g>
                  <text
                    x={groupX + groupW / 2}
                    y={chartH - padBottom + 16}
                    font-size="10"
                    font-weight={isSelectedLane ? 'bold' : 'normal'}
                    text-anchor="middle"
                    fill={isSelectedLane ? '#2563eb' : '#64748b'}
                  >
                    {customLabel.length > 10 ? `${customLabel.slice(0, 9)}…` : customLabel}
                  </text>
                </g>
              );
            })
          )}
        </svg>
      </div>

      {/* Western-blot (target mass) publication preview: each lane shown as an aligned vertical strip
          centered on the target band, with a dashed alignment guideline across all lanes. */}
      {chartMode === 'mass' && plane && display && (
        <div class="rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-700 text-white">
                Western Blot Mode
              </span>
              <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
                Target Mass Alignment &bull; {activeTarget?.label || 'Target Band'}
              </span>
            </div>
            <div class="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              <span class="inline-flex items-center gap-1.5">
                <span class="w-3 h-0.5 bg-emerald-500 inline-block"></span>
                Horizontally Aligned Center Line
              </span>
            </div>
          </div>

          <div class="relative overflow-x-auto py-2">
            {/* Dashed green horizontal alignment reference line running across all lane strips right through vertical center (y = 70px) */}
            <div class="absolute left-0 right-0 top-[70px] h-0 border-t border-dashed border-emerald-500/70 pointer-events-none z-10" />

            <div class="flex items-start gap-4 min-w-max">
              {analysis.map((item, lIdx) => {
                const strip = wbStripUrls[item.lane.id];
                const m = matchedBandsPerLane[item.lane.id];
                const sz = m?.sizeEst ? formatSize(m.sizeEst, ladderKind) : (activeTarget?.avgSize ? `~${formatSize(activeTarget.avgSize, ladderKind)}` : '');
                const label = laneLabels[item.lane.id] || `L${lIdx + 1}`;
                const val = m ? getMetricVal(m) : 0;
                const fold = refVal > 0 && val > 0 ? (val / refVal).toFixed(2) : undefined;
                const isSelected = item.lane.id === selectedLaneId;

                return (
                  <div
                    key={item.lane.id}
                    onClick={() => onSelectLane?.(item.lane.id)}
                    class={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition cursor-pointer border ${isSelected ? 'border-accent-500 bg-white dark:bg-slate-800 shadow-sm ring-1 ring-accent-400' : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/60 dark:bg-slate-900/60'}`}
                  >
                    <span class="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                      {label}
                    </span>

                    {/* Vertical Publication Blot Strip */}
                    <div class="relative rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shadow-2xs">
                      <img
                        src={strip ?? undefined}
                        alt={`${label} target band`}
                        class="w-11 h-24 object-cover block"
                      />
                    </div>

                    <div class="text-center space-y-0.5">
                      <span class="block text-[11px] font-mono font-bold text-accent-700 dark:text-accent-300">
                        {sz || '—'}
                      </span>
                      {val > 0 ? (
                        <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                          {fold ? `${fold}×` : `${Math.round(val)} OD`}
                        </span>
                      ) : (
                        <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                          n/d
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mass color scale legend */}
      {chartMode === 'lane' && (
        <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 text-[11px]">
          <span class="font-semibold text-slate-500 dark:text-slate-400 shrink-0">Mass Color Coding:</span>
          <div class="flex flex-wrap items-center gap-1.5">
            {legendBins.map(bin => (
              <span key={bin.label} class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px]">
                <span class="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: bin.color }}></span>
                <span class="font-mono font-medium text-slate-600 dark:text-slate-300">{bin.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
