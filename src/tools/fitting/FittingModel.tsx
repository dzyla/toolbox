import { useUrlState } from '@/lib/url-state';
import { useMemo, useRef, useState } from 'preact/hooks';
import { useDraftText } from '@/lib/drafts';
import { SAMPLE_DATASETS, computeEnzymeTransforms, fitModel, parseFittingData, type FitModelType } from '@/core/fitting';
import { importErrorMessage, readTextFile } from '@/lib/file-import';
import { downloadSvg, downloadText, toCsv } from '@/lib/export';
import type { Analysis } from './modes/shared';
import type { ConcUnit } from '@/core/fitting/spr';
import type { HeatUnit } from '@/core/fitting/itc';
import { scienceText } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';

export interface State {
  modelType: FitModelType;
  xLogScale: boolean;
  showErrorBars: boolean;
  presetKey: string;
  enzymeConc: number;
  analyteConc: number;
  dissociationRate: number;
  activeDiagnosticPlot: 'none' | 'lineweaver_burk' | 'eadie_hofstee' | 'hanes_woolf';
  analysis: Analysis;
  /** Growth models: fit ln(y/y₀) so µmax is a specific growth rate. */
  growthLog: boolean;
  inh: { kind: 'mechanism' | 'morrison'; enzymeConc: number; fitEnzyme: boolean; substrateConc: number; km: number };
  itc: { cellVolumeUl: number; cellConcUm: number; syringeConcUm: number; temperatureC: number; heatUnit: HeatUnit; defaultVolumeUl: number; fixN: boolean; n: number; fitOffset: boolean; skipFirst: boolean };
  spr: { tDissStart: number; tAssocStart: number; concUnit: ConcUnit; globalRmax: boolean; fitBaseline: boolean };
}
export const DEFAULTS: State = {
  modelType: '4pl',
  xLogScale: true,
  showErrorBars: true,
  presetKey: 'dose_response',
  enzymeConc: 0.05,
  analyteConc: 100,
  dissociationRate: 0.01,
  activeDiagnosticPlot: 'none',
  analysis: 'curve',
  growthLog: true,
  inh: { kind: 'mechanism', enzymeConc: 5, fitEnzyme: false, substrateConc: 0, km: 0 },
  itc: { cellVolumeUl: 200, cellConcUm: 20, syringeConcUm: 200, temperatureC: 25, heatUnit: 'ucal', defaultVolumeUl: 2, fixN: false, n: 1, fitOffset: false, skipFirst: false },
  spr: { tDissStart: 300, tAssocStart: 0, concUnit: 'nM', globalRmax: true, fitBaseline: false },
};

export function useFittingModel() {
  const [stateSig, shareUrl] = useUrlState<State>('fitting', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };
  /** Patch one of the nested per-analysis option groups. */
  const setSub = <K extends 'inh' | 'itc' | 'spr'>(key: K, patch: Partial<State[K]>) => { stateSig.value = { ...stateSig.value, [key]: { ...stateSig.value[key], ...patch } }; };

  // Data handed over from the Plate Reader (sessionStorage) wins over a saved draft.
  const [piped] = useState<string | null>(() => {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const handed = sessionStorage.getItem('biobench_fitting_input');
        if (handed) {
          sessionStorage.removeItem('biobench_fitting_input');
          return handed;
        }
      }
    } catch {}
    return null;
  });
  const [rawText, setRawText] = useDraftText(
    'fitting:raw',
    () => piped ?? SAMPLE_DATASETS.dose_response!.text,
    () => set({ presetKey: '' }),
    { restore: piped === null },
  );
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; yFit: number; residual: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importError, setImportError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  function handleSelectPreset(key: string) {
    const preset = SAMPLE_DATASETS[key];
    if (preset) {
      set({
        presetKey: key,
        modelType: preset.model,
        xLogScale: preset.model === '4pl' || preset.model === '5pl' || preset.model === 'two_site_binding',
        activeDiagnosticPlot: 'none',
      });
      setRawText(preset.text, { persist: false });
    }
  }

  async function handleFileUpload(file: File) {
    setImportError('');
    try {
      setRawText(await readTextFile(file));
      set({ presetKey: '' });
    } catch (err) {
      setImportError(importErrorMessage(err, file.name));
    }
  }

  const parsedData = useMemo(() => {
    return parseFittingData(rawText);
  }, [rawText]);

  const fitResult = useMemo(() => {
    if (parsedData.length < 2) return null;
    try {
      return fitModel(s.modelType, parsedData, { logTransform: s.growthLog });
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [s.modelType, parsedData, s.growthLog]);

  const enzymeDiagnostics = useMemo(() => {
    if (!fitResult || 'error' in fitResult) return null;
    if (s.modelType !== 'michaelis_menten' && s.modelType !== 'substrate_inhibition') return null;

    const vmaxParam = fitResult.parameters.find(p => p.symbol === 'Vmax');
    const kmParam = fitResult.parameters.find(p => p.symbol === 'Km');
    const kiParam = fitResult.parameters.find(p => p.symbol === 'Ki');

    const vmax = vmaxParam?.value ?? 0;
    const km = kmParam?.value ?? 0;
    const ki = kiParam?.value;

    const e0 = s.enzymeConc > 0 ? s.enzymeConc : null;
    const kcatMin = e0 && e0 > 0 ? vmax / e0 : null; // min^-1
    const kcatSec = kcatMin !== null ? kcatMin / 60 : null; // s^-1
    const kcatKm = kcatSec !== null && km > 0 ? (kcatSec / (km * 1e-6)) : null; // M^-1 s^-1

    const sOpt = ki && km > 0 && ki > 0 ? Math.sqrt(km * ki) : null;
    const vOpt = sOpt && vmax > 0 && km > 0 && ki ? (vmax * sOpt) / (km + sOpt + (sOpt * sOpt) / ki) : null;

    return {
      vmax,
      km,
      ki,
      e0,
      kcatMin,
      kcatSec,
      kcatKm,
      sOpt,
      vOpt,
    };
  }, [fitResult, s.modelType, s.enzymeConc]);

  const bliDiagnostics = useMemo(() => {
    if (!fitResult || 'error' in fitResult) return null;
    if (s.modelType === 'spr_association') {
      const kobsParam = fitResult.parameters.find(p => p.symbol === 'kobs');
      const reqParam = fitResult.parameters.find(p => p.symbol === 'Req');
      const kobs = kobsParam?.value ?? 0;
      const req = reqParam?.value ?? 0;
      const concM = s.analyteConc * 1e-9;
      const koff = s.dissociationRate;
      const kon = concM > 0 ? Math.max(0, (kobs - koff) / concM) : null;
      const kd = kon && kon > 0 ? (koff / kon) * 1e9 : null; // in nM
      return { kobs, req, kon, kd, koff };
    }
    if (s.modelType === 'spr_dissociation') {
      const koffParam = fitResult.parameters.find(p => p.symbol.includes('koff'));
      const koff = koffParam?.value ?? 0;
      const tHalf = koff > 0 ? Math.LN2 / koff : null;
      return { koff, tHalf };
    }
    if (s.modelType === 'spr_sensorgram') {
      const konParam = fitResult.parameters.find(p => p.symbol === 'kon');
      const koffParam = fitResult.parameters.find(p => p.symbol === 'koff');
      const rmaxParam = fitResult.parameters.find(p => p.symbol === 'Rmax');
      const kon = konParam?.value ?? 0;
      const koff = koffParam?.value ?? 0;
      const rmax = rmaxParam?.value ?? 0;
      const kd = kon > 0 ? (koff / kon) * 1e9 : null; // in nM
      const tHalf = koff > 0 ? Math.LN2 / koff : null;
      return { kon, koff, kd, tHalf, rmax };
    }
    return null;
  }, [fitResult, s.modelType, s.analyteConc, s.dissociationRate]);

  const diagnosticPlotData = useMemo(() => {
    if (!fitResult || 'error' in fitResult) return null;
    if (s.modelType !== 'michaelis_menten' && s.modelType !== 'substrate_inhibition') return null;
    if (s.activeDiagnosticPlot === 'none') return null;

    const transforms = computeEnzymeTransforms(parsedData);
    const vmaxParam = fitResult.parameters.find(p => p.symbol === 'Vmax');
    const kmParam = fitResult.parameters.find(p => p.symbol === 'Km');
    const vmax = vmaxParam?.value ?? 1;
    const km = kmParam?.value ?? 1;

    let pts: { x: number; y: number }[] = [];
    let xLabel = '';
    let yLabel = '';
    let title = '';
    let slope = 0;
    let intercept = 0;
    let xInt: number | null = null;
    let yInt: number | null = null;

    if (s.activeDiagnosticPlot === 'lineweaver_burk') {
      title = 'Lineweaver-Burk Double-Reciprocal Plot (1/v vs 1/[S])';
      xLabel = '1 / [S] (µM⁻¹)';
      yLabel = '1 / v (min · µM⁻¹)';
      pts = transforms.lineweaverBurk.map(p => ({ x: p.invS, y: p.invV }));
      slope = km / vmax;
      intercept = 1 / vmax;
      xInt = -1 / km;
      yInt = 1 / vmax;
    } else if (s.activeDiagnosticPlot === 'eadie_hofstee') {
      title = 'Eadie-Hofstee Linear Diagnostic Plot (v vs v/[S])';
      xLabel = 'v / [S] (min⁻¹)';
      yLabel = 'v (µM / min)';
      pts = transforms.eadieHofstee.map(p => ({ x: p.vOverS, y: p.v }));
      slope = -km;
      intercept = vmax;
      xInt = vmax / km;
      yInt = vmax;
    } else if (s.activeDiagnosticPlot === 'hanes_woolf') {
      title = 'Hanes-Woolf Linear Diagnostic Plot ([S]/v vs [S])';
      xLabel = '[S] (µM)';
      yLabel = '[S] / v (min)';
      pts = transforms.hanesWoolf.map(p => ({ x: p.s, y: p.sOverV }));
      slope = 1 / vmax;
      intercept = km / vmax;
      xInt = -km;
      yInt = km / vmax;
    }

    if (pts.length === 0) return null;

    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(xInt !== null && xInt < 0 ? xInt * 1.15 : 0, Math.min(...xs));
    const maxX = Math.max(...xs) * 1.15;
    const minY = 0;
    const maxY = Math.max(...ys, intercept > 0 ? intercept * 1.1 : 0) * 1.15;

    return {
      title,
      xLabel,
      yLabel,
      pts,
      slope,
      intercept,
      xInt,
      yInt,
      minX,
      maxX,
      minY,
      maxY,
    };
  }, [fitResult, parsedData, s.activeDiagnosticPlot, s.modelType]);



  // SVG Plot sizing and bounds
  const plotWidth = 650;
  const plotHeight = 350;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 45;

  const innerWidth = plotWidth - padLeft - padRight;
  const innerHeight = plotHeight - padTop - padBottom;

  const bounds = useMemo(() => {
    if (parsedData.length === 0) return { minX: 0, maxX: 10, minY: 0, maxY: 10 };
    const xVals = parsedData.map(d => d.x);
    const yVals = parsedData.flatMap(d => d.yValues || [d.y]);
    let minX = Math.min(...xVals);
    let maxX = Math.max(...xVals);
    let minY = Math.min(...yVals);
    let maxY = Math.max(...yVals);

    if (minX === maxX) { minX -= 1; maxX += 1; }
    if (minY === maxY) { minY -= 1; maxY += 1; }

    // Padding
    const yMargin = (maxY - minY) * 0.08;
    minY -= yMargin;
    maxY += yMargin;

    if (s.xLogScale) {
      minX = Math.max(1e-4, Math.min(...xVals.filter(x => x > 0)));
      maxX = Math.max(minX * 10, maxX);
    } else {
      const xMargin = (maxX - minX) * 0.05;
      minX -= xMargin;
      maxX += xMargin;
    }

    return { minX, maxX, minY, maxY };
  }, [parsedData, s.xLogScale]);

  function scaleX(val: number): number {
    if (s.xLogScale) {
      const minLog = Math.log10(Math.max(1e-4, bounds.minX));
      const maxLog = Math.log10(Math.max(1e-4, bounds.maxX));
      const curLog = Math.log10(Math.max(1e-4, val));
      const frac = (curLog - minLog) / Math.max(1e-4, maxLog - minLog);
      return padLeft + frac * innerWidth;
    }
    const frac = (val - bounds.minX) / (bounds.maxX - bounds.minX);
    return padLeft + frac * innerWidth;
  }

  function scaleY(val: number): number {
    const frac = (val - bounds.minY) / (bounds.maxY - bounds.minY);
    return plotHeight - padBottom - frac * innerHeight;
  }

  // Generate smooth fitted curve path
  const curvePath = useMemo(() => {
    if (!fitResult || 'error' in fitResult) return '';
    const numPoints = 120;
    const pts: string[] = [];

    for (let i = 0; i <= numPoints; i++) {
      let x: number;
      if (s.xLogScale) {
        const minLog = Math.log10(Math.max(1e-4, bounds.minX));
        const maxLog = Math.log10(Math.max(1e-4, bounds.maxX));
        const logX = minLog + (i / numPoints) * (maxLog - minLog);
        x = Math.pow(10, logX);
      } else {
        x = bounds.minX + (i / numPoints) * (bounds.maxX - bounds.minX);
      }
      const y = fitResult.predict(x);
      const px = scaleX(x);
      const py = scaleY(y);
      if (!isNaN(px) && !isNaN(py) && py >= padTop - 100 && py <= plotHeight - padBottom + 100) {
        pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
      }
    }
    return pts.join(' ');
  }, [fitResult, bounds, s.xLogScale]);

  function handleExportCsv() {
    if (!fitResult || 'error' in fitResult) return;
    const rows = [
      ['# Model', fitResult.modelName],
      ['# Equation', `"${fitResult.equationStr}"`],
      ['# R^2', fitResult.r2.toFixed(6)],
      ['# Adj R^2', fitResult.adjR2.toFixed(6)],
      ['# RMSE', fitResult.rmse.toFixed(6)],
      ['# SSE', fitResult.sse.toFixed(6)],
      ['# DF', fitResult.df],
      [],
      ['Parameter', 'Symbol', 'Value', 'Std_Error', 'CI_95_Low', 'CI_95_High'],
      ...fitResult.parameters.map(p => [
        p.name,
        p.symbol,
        p.value,
        p.standardError ?? '',
        p.ci95Low ?? '',
        p.ci95High ?? '',
      ]),
      [],
      ['X', 'Observed_Y', 'Fitted_Y', 'SE_Fit', 'Residual', 'SD', 'SEM'],
      ...parsedData.map((d, i) => {
        const fp = fitResult.fittedPoints[i];
        return [
          d.x,
          d.y,
          fp ? fp.yFit.toFixed(4) : '',
          fp && fp.seFit !== undefined ? fp.seFit.toFixed(4) : '',
          fp ? fp.residual.toFixed(4) : '',
          d.sd !== undefined ? d.sd.toFixed(4) : '',
          d.sem !== undefined ? d.sem.toFixed(4) : '',
        ];
      }),
    ];
    downloadText(toCsv(rows), `fit_results_${s.modelType}.csv`, 'text/csv;charset=utf-8');
  }

  function handleExportSvg() {
    if (!svgRef.current) return;
    downloadSvg(svgRef.current, `curve_fit_${s.modelType}.svg`);
  }

  const copyText = !fitResult || 'error' in fitResult ? (fitResult?.error || 'No fit available.') : [
    `Model: ${fitResult.modelName}`,
    `Equation: ${fitResult.equationStr}`,
    `R²: ${fitResult.r2.toFixed(4)} (Adj R²: ${fitResult.adjR2.toFixed(4)})`,
    `RMSE: ${fitResult.rmse.toFixed(4)} | SSE: ${fitResult.sse.toFixed(4)} (DF: ${fitResult.df})`,
    'Parameters:',
    ...fitResult.parameters.map(p => `  - ${p.name} (${p.symbol}): ${p.value.toPrecision(5)}${p.standardError !== undefined ? ` ± ${p.standardError.toPrecision(3)}` : ''}${p.ci95Low !== undefined && p.ci95High !== undefined ? ` [95% CI: ${p.ci95Low.toPrecision(3)} to ${p.ci95High.toPrecision(3)}]` : ''}`),
    '',
    scienceText(SCIENCE),
  ].join('\n');

  return {
    stateSig,
    shareUrl,
    s,
    set,
    setSub,
    piped,
    rawText,
    setRawText,
    hoveredPoint,
    setHoveredPoint,
    fileInputRef,
    importError,
    setImportError,
    svgRef,
    handleSelectPreset,
    handleFileUpload,
    parsedData,
    fitResult,
    enzymeDiagnostics,
    bliDiagnostics,
    diagnosticPlotData,
    plotWidth,
    plotHeight,
    padLeft,
    padRight,
    padTop,
    padBottom,
    innerWidth,
    innerHeight,
    bounds,
    scaleX,
    scaleY,
    curvePath,
    handleExportCsv,
    handleExportSvg,
    copyText,
  };
}

export type FittingModel = ReturnType<typeof useFittingModel>;
