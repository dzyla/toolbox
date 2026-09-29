import { downloadText, downloadBlob, toCsv } from '@/lib/export';
import { formatSize, formatMass } from '@/core/gel/calibration';
import { massFlagSuffix } from '../analysis';
import { applyDisplayTransform, buildGelSvg, type BandAnnotation } from '@/core/gel/svg-export';
import { laneRole } from '../lane-meta';
import { tidyRows, groupSummaryRows, calibrationRows, methodsText } from '../export-tables';
import type { GelCore, GelLadders, GelAnalysis, GelGroups } from '../workspace';

/** Annotated image, SVG, print and CSV exports. */
export function useGelExports(core: GelCore, ladders: GelLadders, analysis: GelAnalysis, groups: GelGroups) {
  const { canvasRef, gelTitle, imageName, laneLabels, lanes, plane, s, showLaneHeaders, showMwLabels, } = core;
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
          massText: s.showMassLabels && massCalibration && m.massEst !== null ? formatMass(m.massEst, massCalibration.unit) + massFlagSuffix(m.massFlags) : null,
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
      footnote: `Quantification: raw-pixel densitometry with ${s.bgMethod} baseline; ${method} ladder calibration (${s.calibMethod}).`,
    });
    downloadText(svg, `${imageName.replace(/\.[^/.]+$/, '')}_annotated.svg`, 'image/svg+xml;charset=utf-8');
  }

  /** PDF export via the print stylesheet (spec §6): the print root renders the annotated image at 100 %. */
  function handlePrintGel() {
    window.print();
  }

  const base = () => imageName.replace(/\.[^/.]+$/, '') || 'gel';
  const sizeUnit = () => (activeLadder.kind === 'protein' ? 'kDa' : 'bp');
  function handleExportTidyCsv() {
    const roles: Record<string, string> = {}, meta: Record<string, { condition: string; replicate: number | null }> = {}, valueByLane: Record<string, { value: number | null; reason: string | null }> = {};
    for (const l of lanes) roles[l.id] = laneRole(l.id, core.laneMeta[l.id], analysis.effectiveLadderLaneId, s.massLaneId);
    for (const r of groups.groupRows) { meta[r.laneId] = { condition: r.condition, replicate: r.replicate }; valueByLane[r.laneId] = { value: r.value, reason: r.reason }; }
    const rows = tidyRows({ analysis: allLanesAnalysis, labels: laneLabels, roles, meta, valueByLane, sizeUnit: sizeUnit(), massUnit: massCalibration?.unit ?? 'ng' });
    downloadText(toCsv(rows), `${base()}_bands_tidy.csv`, 'text/csv;charset=utf-8');
  }
  function handleExportGroupCsv() {
    downloadText(toCsv(groupSummaryRows(groups.groupSummaries, groups.groupControlCondition)), `${base()}_condition_summary.csv`, 'text/csv;charset=utf-8');
  }
  function handleExportCalibrationCsv() {
    const ladder = allLanesAnalysis.find(a => a.lane.id === analysis.effectiveLadderLaneId);
    const ladderRows = (ladder?.metrics ?? []).filter(m => m.ladderAssigned !== null && m.sizeEst !== null)
      .map(m => ({ y: m.peakY ?? 0, assigned: m.ladderAssigned!, fitted: m.sizeEst!, residualPct: m.sizeResidualPct ?? 0 }));
    downloadText(toCsv(calibrationRows({ calibration, ladderRows, mass: massCalibration, sizeUnit: sizeUnit() })), `${base()}_calibration.csv`, 'text/csv;charset=utf-8');
  }
  function currentMethodsText() {
    return methodsText({ source: core.sourceInfo, transforms: core.appliedTransforms, deskewAngle: core.deskewAngle, laneWidths: lanes.map(l => l.width),
      bgMethod: s.bgMethod, radius: s.rollingRadius, prominence: s.prominence, calibModel: s.calibMethod, calibR2: calibration?.r2 ?? null,
      massModel: massCalibration?.model ?? null, massR2: massCalibration?.r2 ?? null, norm: s.groupNorm, welch: s.groupWelch, version: __APP_VERSION__ });
  }
  function handleExportMethods() { downloadText(currentMethodsText(), `${base()}_methods.txt`); }
  async function handleCopyMethods() { await navigator.clipboard?.writeText(currentMethodsText()); }

  return {
    handleExportAnnotatedGel,
    rasterizeDisplay,
    resolvedBands,
    handleExportSvg,
    handlePrintGel,
    handleExportTidyCsv,
    handleExportGroupCsv,
    handleExportCalibrationCsv,
    handleExportMethods,
    handleCopyMethods,
  };
}

export type GelExports = ReturnType<typeof useGelExports>;
