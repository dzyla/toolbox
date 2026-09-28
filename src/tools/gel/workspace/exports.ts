import { downloadText, downloadBlob, toCsv } from '@/lib/export';
import { formatSize, formatMass } from '@/core/gel/calibration';
import { applyDisplayTransform, buildGelSvg, type BandAnnotation } from '@/core/gel/svg-export';
import { SATURATION_WARN } from '../analysis';
import type { GelCore, GelLadders, GelAnalysis } from '../workspace';

/** Annotated image, SVG, print and CSV exports. */
export function useGelExports(core: GelCore, ladders: GelLadders, analysis: GelAnalysis) {
  const { canvasRef, gelTitle, imageName, laneLabels, lanes, plane, s, showLaneHeaders, showMwLabels, stripLanePrefix } = core;
  const { activeLadder } = ladders;
  const { allLanesAnalysis, calibration, massCalibration, selectedLane } = analysis;

  // Export Annotated Gel Image
  function handleExportAnnotatedGel() {
    if (!plane) return;
    const exportCanvas = document.createElement('canvas');
    const headerHeight = 50;
    exportCanvas.width = plane.width;
    exportCanvas.height = plane.height + headerHeight;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Background banner
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, exportCanvas.width, headerHeight);

    // Title text
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(gelTitle, 16, 26);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${plane.width} × ${plane.height} px · Bio-Bench Annotated Gel Export`, 16, 42);

    // Draw gel image below header
    if (canvasRef.current) {
      ctx.drawImage(canvasRef.current, 0, headerHeight);
    }

    exportCanvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `${imageName.replace(/\.[^/.]+$/, '')}_annotated.png`);
      }
    }, 'image/png');
  }

  /** Rasterise the raw plane through the same display pipeline as the on-screen renderer. */
  function rasterizeDisplay(): HTMLCanvasElement | null {
    if (!plane) return null;
    const out = applyDisplayTransform(plane.data, {
      brightness: s.brightness,
      contrast: s.contrast,
      minClip: s.minClip ?? 0,
      maxClip: s.maxClip ?? 1,
      gamma: s.gamma ?? 1,
      invert: s.invertDisplay,
    });
    const cnv = document.createElement('canvas');
    cnv.width = plane.width;
    cnv.height = plane.height;
    const ctx = cnv.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(plane.width, plane.height);
    for (let i = 0; i < out.length; i++) {
      const byte = Math.round(out[i]! * 255);
      img.data[i * 4] = byte;
      img.data[i * 4 + 1] = byte;
      img.data[i * 4 + 2] = byte;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cnv;
  }

  /** Resolved band annotations (formatted text) shared by the SVG and print exports. */
  function resolvedBands(): BandAnnotation[] {
    const out: BandAnnotation[] = [];
    for (const item of allLanesAnalysis) {
      for (const m of item.metrics) {
        if (m.peakY === undefined) continue;
        out.push({
          laneId: item.lane.id,
          y: (item.lane.y0 ?? 0) + m.peakY,
          sizeText: showMwLabels && calibration && m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : null,
          massText: s.showMassLabels && massCalibration && m.massEst !== null ? formatMass(m.massEst, massCalibration.unit) : null,
        });
      }
    }
    return out;
  }

  /** SVG export: embedded image + every annotation as vector text (spec §6). */
  function handleExportSvg() {
    if (!plane) return;
    const cnv = rasterizeDisplay();
    if (!cnv) return;
    const method = activeLadder.kind === 'protein' ? 'protein' : 'DNA';
    const subtitle = `${plane.width} × ${plane.height} px · Bio-Bench vector export · ${new Date().toISOString().slice(0, 10)}`;
    const svg = buildGelSvg({
      width: plane.width,
      height: plane.height,
      imageDataUrl: cnv.toDataURL('image/png'),
      display: { brightness: s.brightness, contrast: s.contrast, minClip: s.minClip ?? 0, maxClip: s.maxClip ?? 1, gamma: s.gamma ?? 1, invert: s.invertDisplay },
      lanes,
      laneLabels,
      ladderLaneId: s.ladderLaneId,
      selectedLaneId: selectedLane?.id ?? null,
      showHeaders: showLaneHeaders,
      showMwLabels,
      showMassLabels: s.showMassLabels,
      bands: resolvedBands(),
      title: gelTitle,
      subtitle,
      footnote: `Quantification: raw-pixel densitometry with ${s.bgMethod} baseline; ${method} ladder calibration (${s.calibMethod}); compare bands within one gel only.`,
    });
    downloadText(svg, `${imageName.replace(/\.[^/.]+$/, '')}_annotated.svg`, 'image/svg+xml;charset=utf-8');
  }

  /** PDF export via the print stylesheet (spec §6): the print root renders the annotated image at 100 %. */
  function handlePrintGel() {
    window.print();
  }

  // Export CSV
  function handleExportCsv() {
    const unit = activeLadder.kind === 'protein' ? 'kDa' : 'bp';
    const massUnit = massCalibration?.unit || 'ng';
    const rows = [
      ['Lane_Number', 'Lane_ID', 'Lane_Custom_Name', 'Band_Number', 'Migration_Y_px', 'Estimated_Size', 'Size_Unit', 'Calibrated_Mass', 'Mass_Unit', 'Raw_Area', 'Baseline_Area', 'Net_Intensity', 'Percent_Of_Lane', 'Ratio_To_Reference', 'Saturated'],
      ...allLanesAnalysis.flatMap(item =>
        item.metrics.map(m => {
          let label = laneLabels[item.lane.id] || `Lane ${item.laneIdx + 1}`;
          if (stripLanePrefix) {
            label = label.replace(/^(?:L\d+|Lane\s*\d+)[\s:\-_]*/i, '').trim() || label;
          }
          return [
            item.laneIdx + 1,
            stripLanePrefix ? item.lane.id.replace(/^l/i, '') : item.lane.id,
            label,
            m.number,
            m.peakY ? Number(m.peakY.toFixed(2)) : '',
            m.sizeEst ? Number(m.sizeEst.toFixed(1)) : '',
            unit,
            m.massEst ? Number(m.massEst.toFixed(2)) : '',
            massUnit,
            Number(m.raw.toFixed(1)),
            Number(m.background.toFixed(1)),
            Number(m.net.toFixed(1)),
            Number(m.share.toFixed(2)),
            Number(m.ratio.toFixed(2)),
            m.saturation >= SATURATION_WARN ? 'YES' : 'NO',
          ];
        })
      ),
    ];
    downloadText(toCsv(rows), `${imageName.replace(/\.[^/.]+$/, '')}_all_lanes_quantification.csv`, 'text/csv;charset=utf-8');
  }

  // Export Whole-Lane Loading CSV
  function handleExportLoadingCsv() {
    const rows = [
      ['Lane_Number', 'Lane_ID', 'Lane_Custom_Name', 'Total_Integrated_Signal_OD_px', 'Total_Bands_Signal_OD_px', 'Relative_Loading_Ratio', 'Loading_Deviation_Pct', 'TPN_Normalization_Factor', 'Is_Reference_Lane'],
      ...allLanesAnalysis.map(item => {
        let label = laneLabels[item.lane.id] || `Lane ${item.laneIdx + 1}`;
        if (stripLanePrefix) {
          label = label.replace(/^(?:L\d+|Lane\s*\d+)[\s:\-_]*/i, '').trim() || label;
        }
        const isRef = item.lane.id === (s.loadingRefLaneId || allLanesAnalysis[0]?.lane.id);
        return [
          item.laneIdx + 1,
          stripLanePrefix ? item.lane.id.replace(/^l/i, '') : item.lane.id,
          label,
          Number(item.totalLaneSignal.toFixed(1)),
          Number(item.totalBandsSignal.toFixed(1)),
          Number(item.loadingRatio.toFixed(3)),
          Number(item.loadingDeviationPct.toFixed(2)),
          Number(item.normFactor.toFixed(3)),
          isRef ? 'YES' : 'NO',
        ];
      }),
    ];
    downloadText(toCsv(rows), `${imageName.replace(/\.[^/.]+$/, '')}_lane_loading_comparison.csv`, 'text/csv;charset=utf-8');
  }

  return {
    handleExportAnnotatedGel,
    rasterizeDisplay,
    resolvedBands,
    handleExportSvg,
    handlePrintGel,
    handleExportCsv,
    handleExportLoadingCsv,
  };
}

export type GelExports = ReturnType<typeof useGelExports>;
