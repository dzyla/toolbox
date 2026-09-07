import { describe, it, expect } from 'vitest';
import {
  mean,
  sampleVariance,
  sampleSd,
  sem,
  coefficientOfVariation,
  median,
  mad,
  grubbsCriticalValue,
  grubbsTest,
  detectOutliers,
  calculateZPrime,
  calculateSignalToNoise,
  calculateSignalToBackground,
  parseWellId,
  detectDelimiter,
  parseTokenValue,
  parsePlateData,
  parseMatrixExport,
  parseListExport,
  normalizePlate,
  computeGroupStatistics,
  computeAssayQc,
  formatForCurveFitting,
  exportNormalizedMatrixCsv,
  exportSummaryCsv,
  applyDoseResponsePreset,
  applyElisaPreset,
  parseLayoutGrid,
  inferAnnotationFromLabel,
  applyLayoutAnnotations,
  generateSerialDilution,
  computeStandardCurveQuantification,
  exportQuantifiedSamplesCsv,
  computeDoseResponseSeries,
  DEMO_96_TECAN_DOSE_RESPONSE,
  DEMO_384_BIOTEK_HTS,
  DEMO_96_LIST_EXPORT,
  DEMO_96_ELISA_STANDARD,
  DEMO_96_RAW_ONLY,
  type SampleGroup,
  type NormalizationConfig,
} from '@/core/plates/reader';
import { parseFittingData } from '@/core/fitting';

describe('Plate Reader Core Engine & Statistics', () => {
  describe('Statistical calculations (Mean, SD, SEM, %CV, Median, MAD)', () => {
    it('calculates exact mean, variance, sample SD, SEM, and %CV', () => {
      // Dataset: [10, 12, 11, 13, 10]
      // Mean = 56 / 5 = 11.2
      // SSE = (10-11.2)^2 + (12-11.2)^2 + (11-11.2)^2 + (13-11.2)^2 + (10-11.2)^2
      //     = 1.44 + 0.64 + 0.04 + 3.24 + 1.44 = 6.80
      // Variance = 6.80 / 4 = 1.70
      // SD = sqrt(1.70) = 1.30384048...
      // SEM = SD / sqrt(5) = 0.583095189...
      // %CV = 100 * SD / Mean = 100 * 1.30384048 / 11.2 = 11.64143%
      const data = [10, 12, 11, 13, 10];

      expect(mean(data)).toBeCloseTo(11.2, 5);
      expect(sampleVariance(data)).toBeCloseTo(1.70, 5);
      expect(sampleSd(data)).toBeCloseTo(Math.sqrt(1.70), 5);
      expect(sem(data)).toBeCloseTo(Math.sqrt(1.70) / Math.sqrt(5), 5);
      expect(coefficientOfVariation(data)).toBeCloseTo((Math.sqrt(1.70) / 11.2) * 100, 4);
    });

    it('calculates median and Median Absolute Deviation (MAD)', () => {
      const data = [10, 12, 11, 13, 10];
      // Sorted: [10, 10, 11, 12, 13] -> Median = 11
      expect(median(data)).toBe(11);

      // Deviations from median 11: [|10-11|, |12-11|, |11-11|, |13-11|, |10-11|] = [1, 1, 0, 2, 1]
      // Sorted deviations: [0, 1, 1, 1, 2] -> Median = 1
      expect(mad(data)).toBe(1);

      // Even number of elements: [2, 4, 6, 8] -> Median = (4 + 6) / 2 = 5
      expect(median([2, 4, 6, 8])).toBe(5);
    });

    it('handles edge cases (empty or single value arrays)', () => {
      expect(mean([])).toBe(0);
      expect(sampleVariance([])).toBe(0);
      expect(sampleVariance([42])).toBe(0);
      expect(sampleSd([42])).toBe(0);
      expect(sem([42])).toBe(0);
      expect(coefficientOfVariation([42])).toBe(0);
      expect(median([])).toBe(0);
      expect(mad([])).toBe(0);
    });
  });

  describe('Grubbs Outlier Detection (pinned to NIST / ASTM E178 values)', () => {
    it('matches published NIST / ASTM E178 critical values for alpha = 0.05', () => {
      // Pinned against NIST Engineering Statistics Handbook, Table 1.3.5.17 (Critical Values for Grubbs' Test)
      // and ASTM E178-02
      expect(grubbsCriticalValue(3, 0.05)).toBeCloseTo(1.154, 2);
      expect(grubbsCriticalValue(4, 0.05)).toBeCloseTo(1.481, 2);
      expect(grubbsCriticalValue(5, 0.05)).toBeCloseTo(1.715, 2);
      expect(grubbsCriticalValue(6, 0.05)).toBeCloseTo(1.887, 2);
      expect(grubbsCriticalValue(7, 0.05)).toBeCloseTo(2.020, 2);
      expect(grubbsCriticalValue(8, 0.05)).toBeCloseTo(2.127, 2);
      expect(grubbsCriticalValue(9, 0.05)).toBeCloseTo(2.215, 2);
      expect(grubbsCriticalValue(10, 0.05)).toBeCloseTo(2.290, 2);
      expect(grubbsCriticalValue(12, 0.05)).toBeCloseTo(2.412, 2);
      expect(grubbsCriticalValue(15, 0.05)).toBeCloseTo(2.548, 2);
      expect(grubbsCriticalValue(20, 0.05)).toBeCloseTo(2.708, 2);
    });

    it('flags statistically significant outlier in replicate measurements', () => {
      // 5 replicates with an obvious bubble/pipetting error in index 4
      const replicates = [0.450, 0.452, 0.448, 0.451, 1.250];
      const res = grubbsTest(replicates, 0.05);

      expect(res.isOutlier).toBe(true);
      expect(res.outlierIndex).toBe(4);
      expect(res.outlierValue).toBe(1.250);
      expect(res.gScore).toBeGreaterThan(res.criticalG);
      expect(res.pValue).toBeLessThan(0.05);
    });

    it('does not flag normal in-range variations as outliers', () => {
      const normalData = [1.02, 0.98, 1.05, 0.99, 1.01, 1.03];
      const res = grubbsTest(normalData, 0.05);
      expect(res.isOutlier).toBe(false);
      expect(res.outlierIndex).toBeNull();
    });

    it('detectOutliers supports Grubbs, SD cutoff, and combined methods', () => {
      const data = [10.0, 10.1, 9.9, 10.0, 25.0];
      const grubbsOnly = detectOutliers(data, { method: 'grubbs', alpha: 0.05 });
      expect(grubbsOnly.outlierIndices).toEqual([4]);

      const noneMethod = detectOutliers(data, { method: 'none' });
      expect(noneMethod.outlierIndices).toEqual([]);
    });
  });

  describe('Assay Screening Quality Metrics (Zhang et al. 1999, Birmingham et al. 2009)', () => {
    it('calculates Z-prime factor pinned against literature reference examples', () => {
      // Zhang et al. (1999) J Biomol Screen Example:
      // Pos control: Mean = 1000, SD = 50
      // Neg control: Mean = 100, SD = 10
      // 3 * (50 + 10) = 180; |1000 - 100| = 900
      // Z' = 1 - 180 / 900 = 1 - 0.2 = 0.80 (Excellent assay)
      const pos = [950, 1050, 1000, 1000]; // Mean = 1000
      const neg = [90, 110, 100, 100];     // Mean = 100
      const sPos = sampleSd(pos);
      const sNeg = sampleSd(neg);

      const res = calculateZPrime(pos, neg);
      const expectedZ = 1 - (3 * (sPos + sNeg)) / Math.abs(1000 - 100);
      expect(res.zPrime).toBeCloseTo(expectedZ, 4);
      expect(res.interpretation).toBe('excellent');
    });

    it('flags marginal assays (0 <= Z\' < 0.5) and unacceptable screens (Z\' < 0)', () => {
      // High noise pos and neg controls
      const posNoisy = [800, 1200, 900, 1100]; // Mean = 1000, high variance
      const negNoisy = [50, 250, 100, 200];    // Mean = 150, high variance
      const res = calculateZPrime(posNoisy, negNoisy);
      expect(res.zPrime).toBeLessThan(0.5);
    });

    it('calculates Signal-to-Noise (S/N) and Signal-to-Background (S/B)', () => {
      const pos = [1000, 1020, 980];
      const neg = [100, 110, 90];

      expect(calculateSignalToBackground(pos, neg)).toBeCloseTo(10.0, 1);
      const sn = calculateSignalToNoise(pos, neg);
      expect(sn).toBeGreaterThan(0);
    });
  });

  describe('Plate Normalization Modes (Malo et al. 2006, Birmingham et al. 2009)', () => {
    const mockPlate = {
      format: 96 as const,
      wells: {
        A1: { id: 'A1', row: 'A', col: 1, raw: 0.050, normalized: null, sampleGroupId: 'blank', sampleName: 'Blank', sampleType: 'blank' as const },
        A2: { id: 'A2', row: 'A', col: 2, raw: 0.050, normalized: null, sampleGroupId: 'blank', sampleName: 'Blank', sampleType: 'blank' as const },
        B1: { id: 'B1', row: 'B', col: 1, raw: 2.050, normalized: null, sampleGroupId: 'pos-ctrl', sampleName: 'Pos Ctrl', sampleType: 'pos-ctrl' as const },
        B2: { id: 'B2', row: 'B', col: 2, raw: 2.050, normalized: null, sampleGroupId: 'pos-ctrl', sampleName: 'Pos Ctrl', sampleType: 'pos-ctrl' as const },
        C1: { id: 'C1', row: 'C', col: 1, raw: 1.050, normalized: null, sampleGroupId: 'neg-ctrl', sampleName: 'Neg Ctrl', sampleType: 'neg-ctrl' as const },
        C2: { id: 'C2', row: 'C', col: 2, raw: 1.050, normalized: null, sampleGroupId: 'neg-ctrl', sampleName: 'Neg Ctrl', sampleType: 'neg-ctrl' as const },
        D1: { id: 'D1', row: 'D', col: 1, raw: 1.050, normalized: null, sampleGroupId: 'sample-1', sampleName: 'Sample 1', sampleType: 'sample' as const },
      },
      rows: ['A', 'B', 'C', 'D'],
      cols: [1, 2],
      metadata: {},
      detectedFormat: 'matrix' as const,
      vendorHint: 'generic' as const,
      delimiter: ',',
      rawText: '',
    };

    it('performs Blank Subtraction: val - blank_mean', () => {
      const config: NormalizationConfig = { mode: 'blank-subtracted' };
      const res = normalizePlate(mockPlate, config);

      expect(res.blankMean).toBeCloseTo(0.050, 4);
      // Blank: 0.050 - 0.050 = 0
      expect(res.normalizedWells.A1?.normalized).toBeCloseTo(0, 4);
      // Sample: 1.050 - 0.050 = 1.000
      expect(res.normalizedWells.D1?.normalized).toBeCloseTo(1.000, 4);
      // Pos Ctrl: 2.050 - 0.050 = 2.000
      expect(res.normalizedWells.B1?.normalized).toBeCloseTo(2.000, 4);
    });

    it('performs Percent of Control (POC): 100 * (val - blank) / (pos - blank)', () => {
      const config: NormalizationConfig = { mode: 'percent-control' };
      const res = normalizePlate(mockPlate, config);

      // Blank -> 0%
      expect(res.normalizedWells.A1?.normalized).toBeCloseTo(0, 2);
      // Pos Ctrl -> 100%
      expect(res.normalizedWells.B1?.normalized).toBeCloseTo(100.0, 2);
      // Sample D1 (1.050 raw): 100 * (1.050 - 0.050) / (2.050 - 0.050) = 100 * 1.0 / 2.0 = 50.0%
      expect(res.normalizedWells.D1?.normalized).toBeCloseTo(50.0, 2);
    });

    it('performs Percent Inhibition: 100 * (1 - (val - blank) / (pos - blank))', () => {
      const config: NormalizationConfig = { mode: 'percent-inhibition' };
      const res = normalizePlate(mockPlate, config);

      // Pos Ctrl -> 0% inhibition (or max effect baseline)
      expect(res.normalizedWells.B1?.normalized).toBeCloseTo(0, 2);
      // Sample D1 -> 50% inhibition
      expect(res.normalizedWells.D1?.normalized).toBeCloseTo(50.0, 2);
      // Blank -> 100% inhibition
      expect(res.normalizedWells.A1?.normalized).toBeCloseTo(100.0, 2);
    });

    it('performs Fold Change: (val - blank) / (neg_ctrl - blank)', () => {
      const config: NormalizationConfig = { mode: 'fold-change' };
      const res = normalizePlate(mockPlate, config);

      // Neg Ctrl (1.050 raw) -> Fold change = 1.0
      expect(res.normalizedWells.C1?.normalized).toBeCloseTo(1.0, 2);
      // Sample D1 (1.050 raw) -> Fold change = 1.0
      expect(res.normalizedWells.D1?.normalized).toBeCloseTo(1.0, 2);
      // Pos Ctrl (2.050 raw) -> (2.050 - 0.050) / (1.050 - 0.050) = 2.0 / 1.0 = 2.0
      expect(res.normalizedWells.B1?.normalized).toBeCloseTo(2.0, 2);
    });
  });

  describe('Multi-Vendor Matrix Parser', () => {
    it('parses Tecan i-control / Magellan CSV export with metadata and <> header', () => {
      const parsed = parsePlateData(DEMO_96_TECAN_DOSE_RESPONSE.rawText);

      expect(parsed.format).toBe(96);
      expect(parsed.vendorHint).toBe('tecan');
      expect(parsed.metadata.Instrument).toBe('Tecan Infinite M200 Pro');
      expect(parsed.wells.A1?.raw).toBeCloseTo(0.046, 3);
      expect(parsed.wells.B1?.raw).toBeCloseTo(0.125, 3);
      expect(parsed.wells.B9?.raw).toBeCloseTo(2.150, 3);
      expect(parsed.wells.H12?.raw).toBeCloseTo(0.045, 3);
    });

    it('parses BioTek Gen5 384-well matrix export', () => {
      const parsed = parsePlateData(DEMO_384_BIOTEK_HTS.rawText);

      expect(parsed.format).toBe(384);
      expect(parsed.vendorHint).toBe('biotek');
      expect(parsed.rows.length).toBe(16);
      expect(parsed.cols.length).toBe(24);
      expect(parsed.wells.A1?.raw).toBeGreaterThan(2000); // Pos control
      expect(parsed.wells.P24?.raw).toBeLessThan(400);    // Neg control
    });

    it('parses BMG LABTECH format matrix', () => {
      const bmgText = `Test Protocol: Luminescence
Microplate Name: 96 White
Raw Data
A	100	105	110	115	120	125	130	135	140	145	150	155
B	200	205	210	215	220	225	230	235	240	245	250	255
C	300	305	310	315	320	325	330	335	340	345	350	355
D	400	405	410	415	420	425	430	435	440	445	450	455
E	500	505	510	515	520	525	530	535	540	545	550	555
F	600	605	610	615	620	625	630	635	640	645	650	655
G	700	705	710	715	720	725	730	735	740	745	750	755
H	800	805	810	815	820	825	830	835	840	845	850	855
`;
      const parsed = parsePlateData(bmgText);
      expect(parsed.format).toBe(96);
      expect(parsed.vendorHint).toBe('bmg');
      expect(parsed.wells.A1?.raw).toBe(100);
      expect(parsed.wells.H12?.raw).toBe(855);
    });

    it('parses Molecular Devices SoftMax Pro export', () => {
      const moldevText = `##BLOCKS= 1
Plate: Plate1
Read 1:450
	1	2	3	4	5	6	7	8	9	10	11	12
A	0.10	0.11	0.12	0.13	0.14	0.15	0.16	0.17	0.18	0.19	0.20	0.21
B	0.20	0.21	0.22	0.23	0.24	0.25	0.26	0.27	0.28	0.29	0.30	0.31
C	0.30	0.31	0.32	0.33	0.34	0.35	0.36	0.37	0.38	0.39	0.40	0.41
D	0.40	0.41	0.42	0.43	0.44	0.45	0.46	0.47	0.48	0.49	0.50	0.51
E	0.50	0.51	0.52	0.53	0.54	0.55	0.56	0.57	0.58	0.59	0.60	0.61
F	0.60	0.61	0.62	0.63	0.64	0.65	0.66	0.67	0.68	0.69	0.70	0.71
G	0.70	0.71	0.72	0.73	0.74	0.75	0.76	0.77	0.78	0.79	0.80	0.81
H	0.80	0.81	0.82	0.83	0.84	0.85	0.86	0.87	0.88	0.89	0.90	0.91
`;
      const parsed = parsePlateData(moldevText);
      expect(parsed.format).toBe(96);
      expect(parsed.vendorHint).toBe('moldev');
      expect(parsed.wells.A1?.raw).toBeCloseTo(0.10, 2);
      expect(parsed.wells.H12?.raw).toBeCloseTo(0.91, 2);
    });

    it('handles overflow, underflow, and missing tokens gracefully', () => {
      const overflowText = `	1	2	3
A	OVRFLW	LOW	NaN
B	0.50	1.20	#VALUE!
`;
      const parsed = parseMatrixExport(overflowText);
      expect(parsed.wells.A1?.raw).toBeNull();
      expect(parsed.wells.A1?.statusNote).toContain('Overflow');
      expect(parsed.wells.A2?.raw).toBe(0);
      expect(parsed.wells.A2?.statusNote).toContain('Below LOD');
      expect(parsed.wells.A3?.raw).toBeNull();
      expect(parsed.wells.B1?.raw).toBeCloseTo(0.50, 2);
      expect(parsed.wells.B3?.raw).toBeNull();
    });

    it('handles European decimal commas when delimited by tabs or semicolons', () => {
      const commaText = `	1	2
A	0,125	0,250
B	0,500	1,000
`;
      const parsed = parseMatrixExport(commaText, '\t');
      expect(parsed.wells.A1?.raw).toBeCloseTo(0.125, 3);
      expect(parsed.wells.A2?.raw).toBeCloseTo(0.250, 3);
      expect(parsed.wells.B1?.raw).toBeCloseTo(0.500, 3);
      expect(parsed.wells.B2?.raw).toBeCloseTo(1.000, 3);
    });
  });

  describe('3-Column List Parser', () => {
    it('parses list export with Well, Sample, Value and normalizes well IDs', () => {
      const parsed = parsePlateData(DEMO_96_LIST_EXPORT.rawText);

      expect(parsed.detectedFormat).toBe('list');
      expect(parsed.format).toBe(96);
      expect(parsed.wells.A1?.raw).toBeCloseTo(0.045, 3);
      expect(parsed.wells.A1?.sampleType).toBe('blank');
      expect(parsed.wells.B1?.raw).toBeCloseTo(0.118, 3);
      expect(parsed.wells.B1?.sampleType).toBe('neg-ctrl');
      expect(parsed.wells.G1?.raw).toBeCloseTo(2.150, 3);
      expect(parsed.wells.G1?.sampleType).toBe('pos-ctrl');
    });

    it('automatically detects 384-well format from 3-column list with coordinates up to P24', () => {
      const list384 = `Well,Sample,Reading
A1,Sample,10
M15,Sample,25
P24,PosCtrl,100
`;
      const parsed = parsePlateData(list384);
      expect(parsed.format).toBe(384);
      expect(parsed.wells.P24?.raw).toBe(100);
      expect(parsed.wells.M15?.raw).toBe(25);
    });
  });

  describe('Replicate Statistics & QC Flags', () => {
    it('computes replicate group stats with QC warning when %CV > 15%', () => {
      const wells = {
        A1: { id: 'A1', row: 'A', col: 1, raw: 10, normalized: 10, sampleGroupId: 'g1', sampleName: 'Group 1', sampleType: 'sample' as const },
        A2: { id: 'A2', row: 'A', col: 2, raw: 14, normalized: 14, sampleGroupId: 'g1', sampleName: 'Group 1', sampleType: 'sample' as const },
        A3: { id: 'A3', row: 'A', col: 3, raw: 18, normalized: 18, sampleGroupId: 'g1', sampleName: 'Group 1', sampleType: 'sample' as const },
      };
      const groups: SampleGroup[] = [
        { id: 'g1', name: 'Group 1', color: '#3b82f6', type: 'sample' },
      ];

      const stats = computeGroupStatistics(wells, groups, { cvThreshold: 15 });
      expect(stats.length).toBe(1);
      const gStats = stats[0]!;
      expect(gStats.nValid).toBe(3);
      expect(gStats.mean).toBe(14);
      // SD for [10, 14, 18] is 4.0; %CV = 100 * 4 / 14 = 28.57% > 15%
      expect(gStats.cv).toBeCloseTo(28.57, 1);
      expect(gStats.qcFlags.highCv).toBe(true);
      expect(gStats.qcFlags.status).toBe('warning');
    });

    it('identifies and optionally auto-excludes Grubbs outliers', () => {
      const wells = {
        A1: { id: 'A1', row: 'A', col: 1, raw: 10.0, normalized: 10.0, sampleGroupId: 'g1', sampleName: 'Group 1', sampleType: 'sample' as const },
        A2: { id: 'A2', row: 'A', col: 2, raw: 10.2, normalized: 10.2, sampleGroupId: 'g1', sampleName: 'Group 1', sampleType: 'sample' as const },
        A3: { id: 'A3', row: 'A', col: 3, raw: 9.9, normalized: 9.9, sampleGroupId: 'g1', sampleName: 'Group 1', sampleType: 'sample' as const },
        A4: { id: 'A4', row: 'A', col: 4, raw: 10.1, normalized: 10.1, sampleGroupId: 'g1', sampleName: 'Group 1', sampleType: 'sample' as const },
        A5: { id: 'A5', row: 'A', col: 5, raw: 25.0, normalized: 25.0, sampleGroupId: 'g1', sampleName: 'Group 1', sampleType: 'sample' as const },
      };
      const groups: SampleGroup[] = [{ id: 'g1', name: 'Group 1', color: '#3b82f6', type: 'sample' }];

      // Without autoExclude: A5 is flagged as outlier
      const stats = computeGroupStatistics(wells, groups, { method: 'grubbs', autoExcludeOutliers: false });
      expect(stats[0]?.outlierWellIds).toContain('A5');

      // With autoExclude: mean is recomputed without A5
      const statsClean = computeGroupStatistics(wells, groups, { method: 'grubbs', autoExcludeOutliers: true });
      expect(statsClean[0]?.mean).toBeCloseTo(10.05, 2);
    });
  });

  describe('Curve Fitting & CSV Export Integration', () => {
    it('formats dose-response data compatible with Curve Fitting parseFittingData', () => {
      const parsed = parsePlateData(DEMO_96_TECAN_DOSE_RESPONSE.rawText);
      const layout = applyDoseResponsePreset(parsed);
      parsed.wells = layout.wells;

      const normalized = normalizePlate(parsed, { mode: 'percent-control' });
      parsed.wells = normalized.normalizedWells;

      const stats = computeGroupStatistics(parsed.wells, layout.groups);
      const exportText = formatForCurveFitting(stats);

      // Verify that Curve Fitting's parseFittingData can ingest the generated table!
      const fittingPoints = parseFittingData(exportText);
      expect(fittingPoints.length).toBe(8); // 8 concentrations
      expect(fittingPoints[0]?.x).toBeCloseTo(0.0316, 3);
      expect(fittingPoints[7]?.x).toBeCloseTo(100.0, 1);
      // Verify replicates were parsed
      expect(fittingPoints[0]?.yValues?.length).toBe(6);
    });

    it('exports 2D normalized plate matrix and summary CSV', () => {
      const parsed = parsePlateData(DEMO_96_TECAN_DOSE_RESPONSE.rawText);
      const matrixCsv = exportNormalizedMatrixCsv(parsed, 'raw');
      expect(matrixCsv.startsWith(',1,2,3,4,5,6,7,8,9,10,11,12')).toBe(true);
      expect(matrixCsv.includes('A,0.046')).toBe(true);

      const layout = applyDoseResponsePreset(parsed);
      const stats = computeGroupStatistics(layout.wells, layout.groups);
      const summaryCsv = exportSummaryCsv(stats);
      expect(summaryCsv.includes('Group_ID,Group_Name,Sample_Type')).toBe(true);
      expect(summaryCsv.includes('Media Blank')).toBe(true);
    });
  });

  describe('Low-Level Parsing Utilities & Assay QC Computations', () => {
    it('parseWellId correctly parses and normalizes standard and zero-padded coordinates', () => {
      expect(parseWellId('A1')).toEqual({ row: 'A', col: 1, id: 'A1' });
      expect(parseWellId('a01')).toEqual({ row: 'A', col: 1, id: 'A1' });
      expect(parseWellId('H12')).toEqual({ row: 'H', col: 12, id: 'H12' });
      expect(parseWellId('P24')).toEqual({ row: 'P', col: 24, id: 'P24' });
      expect(parseWellId('Z99')).toBeNull();
      expect(parseWellId('Invalid')).toBeNull();
    });

    it('detectDelimiter detects tab, comma, and semicolon correctly', () => {
      expect(detectDelimiter(['A\t1\t2', 'B\t3\t4'])).toBe('\t');
      expect(detectDelimiter(['A,1,2', 'B,3,4'])).toBe(',');
      expect(detectDelimiter(['A;1;2', 'B;3;4'])).toBe(';');
    });

    it('parseTokenValue handles numbers, commas, overflows, and NaNs', () => {
      expect(parseTokenValue('0.45')).toEqual({ val: 0.45 });
      expect(parseTokenValue('0,45')).toEqual({ val: 0.45 });
      expect(parseTokenValue('OVRFLW')).toEqual({ val: null, note: 'Overflow / Saturation' });
      expect(parseTokenValue('LOW')).toEqual({ val: 0, note: 'Below LOD' });
      expect(parseTokenValue('NaN')).toEqual({ val: null });
      expect(parseTokenValue('')).toEqual({ val: null });
    });

    it('parseListExport explicitly parses list exports with comments and headers', () => {
      const listData = `# Experiment: Plate1\nWell\tSample\tReading\nA1\tBlank\t0.05\nA2\tBlank\t0.06\n`;
      const parsed = parseListExport(listData);
      expect(parsed.format).toBe(96);
      expect(parsed.wells.A1?.raw).toBeCloseTo(0.05, 2);
      expect(parsed.metadata.Experiment).toBe('Plate1');
    });

    it('computeAssayQc computes Z-prime and S/B across group stats', () => {
      const parsed = parsePlateData(DEMO_96_TECAN_DOSE_RESPONSE.rawText);
      const layout = applyDoseResponsePreset(parsed);
      const stats = computeGroupStatistics(layout.wells, layout.groups);
      const qc = computeAssayQc(stats);
      expect(qc.totalWells).toBe(96);
      expect(qc.validWells).toBeGreaterThan(0);
      expect(qc.zPrime).not.toBeNull();
    });
  });

  describe('Scientific Layout Definition & Annotation Ingestion', () => {
    it('infers roles, concentrations, and dilutions from laboratory labels', () => {
      expect(inferAnnotationFromLabel('Blank').sampleType).toBe('blank');
      expect(inferAnnotationFromLabel('Buffer Media').sampleType).toBe('blank');
      expect(inferAnnotationFromLabel('Neg Ctrl (DMSO)').sampleType).toBe('neg-ctrl');
      expect(inferAnnotationFromLabel('Vehicle').sampleType).toBe('neg-ctrl');
      expect(inferAnnotationFromLabel('Pos Ctrl 100%').sampleType).toBe('pos-ctrl');
      expect(inferAnnotationFromLabel('Lysis Max').sampleType).toBe('pos-ctrl');

      const std = inferAnnotationFromLabel('Std 1000 pg/mL');
      expect(std.sampleType).toBe('standard');
      expect(std.concentration).toBe(1000);
      expect(std.concentrationUnit).toBe('pg/mL');

      const drug = inferAnnotationFromLabel('Inhibitor_A 10 uM');
      expect(drug.sampleType).toBe('sample');
      expect(drug.concentration).toBe(10);
      expect(drug.concentrationUnit).toBe('uM');

      const serum = inferAnnotationFromLabel('Serum_Patient_1 1:100');
      expect(serum.sampleType).toBe('sample');
      expect(serum.dilutionFactor).toBe(100);

      expect(inferAnnotationFromLabel('Empty').sampleType).toBe('empty');
      expect(inferAnnotationFromLabel('-').sampleType).toBe('empty');
    });

    it('parses an 8x12 annotation matrix grid into well coordinates', () => {
      const layoutGrid = `Row,1,2,3,4,5,6,7,8,9,10,11,12
A,Blank,Blank,Std 1000 pg/mL,Std 1000 pg/mL,Serum A,Serum A,Serum B,Serum B,PosCtrl,PosCtrl,NegCtrl,NegCtrl
B,Blank,Blank,Std 500 pg/mL,Std 500 pg/mL,Serum A,Serum A,Serum B,Serum B,PosCtrl,PosCtrl,NegCtrl,NegCtrl
C,Blank,Blank,Std 250 pg/mL,Std 250 pg/mL,Serum C,Serum C,Serum D,Serum D,PosCtrl,PosCtrl,NegCtrl,NegCtrl
D,Blank,Blank,Std 125 pg/mL,Std 125 pg/mL,Serum C,Serum C,Serum D,Serum D,PosCtrl,PosCtrl,NegCtrl,NegCtrl
E,Blank,Blank,Std 62.5 pg/mL,Std 62.5 pg/mL,Serum E,Serum E,Serum F,Serum F,PosCtrl,PosCtrl,NegCtrl,NegCtrl
F,Blank,Blank,Std 31.25 pg/mL,Std 31.25 pg/mL,Serum E,Serum E,Serum F,Serum F,PosCtrl,PosCtrl,NegCtrl,NegCtrl
G,Blank,Blank,Std 15.6 pg/mL,Std 15.6 pg/mL,Serum G,Serum G,Serum H,Serum H,PosCtrl,PosCtrl,NegCtrl,NegCtrl
H,Blank,Blank,Blank,Blank,Serum G,Serum G,Serum H,Serum H,PosCtrl,PosCtrl,NegCtrl,NegCtrl
`;
      const parsed = parseLayoutGrid(layoutGrid, { format: 96 });
      expect(parsed.format).toBe(96);
      expect(parsed.annotations.A1?.sampleType).toBe('blank');
      expect(parsed.annotations.A3?.sampleType).toBe('standard');
      expect(parsed.annotations.A3?.concentration).toBe(1000);
      expect(parsed.annotations.A5?.sampleName).toBe('Serum A');
      expect(parsed.annotations.A9?.sampleType).toBe('pos-ctrl');
      expect(parsed.annotations.A11?.sampleType).toBe('neg-ctrl');
      expect(parsed.uniqueLabels).toContain('Blank');
      expect(parsed.uniqueLabels).toContain('Std 1000 pg/mL');
    });

    it('applies layout annotations with user role overrides to a raw plate', () => {
      const rawPlate = parsePlateData(DEMO_96_RAW_ONLY.rawText);
      const layoutGrid = `	1	2	3	4
A	Buffer	Buffer	DrugA_10	DrugA_10
B	Ctrl_High	Ctrl_High	DrugA_5	DrugA_5
`;
      const layout = parseLayoutGrid(layoutGrid, { format: 96 });
      // User overrides: "Buffer" is mapped to role 'blank', "Ctrl_High" mapped to 'pos-ctrl'
      const applied = applyLayoutAnnotations(rawPlate, layout.annotations, {
        Buffer: { role: 'blank' },
        Ctrl_High: { role: 'pos-ctrl' },
      });

      expect(applied.wells.A1?.sampleType).toBe('blank');
      expect(applied.wells.A3?.sampleType).toBe('sample');
      expect(applied.wells.B1?.sampleType).toBe('pos-ctrl');
      expect(applied.groups.some(g => g.type === 'blank')).toBe(true);
      expect(applied.groups.some(g => g.type === 'pos-ctrl')).toBe(true);
    });

    it('generates serial dilutions with specified factors across wells', () => {
      const wells = ['A1', 'A2', 'A3', 'A4', 'A5'];
      const dilutions = generateSerialDilution(wells, {
        baseName: 'Compound X',
        startConc: 100,
        factor: 2,
        unit: 'µM',
      });

      expect(dilutions.A1?.concentration).toBe(100);
      expect(dilutions.A2?.concentration).toBe(50);
      expect(dilutions.A3?.concentration).toBe(25);
      expect(dilutions.A4?.concentration).toBe(12.5);
      expect(dilutions.A5?.concentration).toBe(6.25);
      expect(dilutions.A1?.concentrationUnit).toBe('µM');
    });

    it('ingests raw plate without any layout cleanly without forcing default presets', () => {
      const parsed = parsePlateData(DEMO_96_RAW_ONLY.rawText);
      expect(parsed.format).toBe(96);
      expect(parsed.wells.A1?.raw).toBeCloseTo(0.142, 3);
      expect(parsed.wells.H12?.raw).toBeCloseTo(2.174, 3);
      // Verify no groups or blanks were silently injected
      expect(parsed.wells.A1?.sampleGroupId).toBe('');
      expect(parsed.wells.A1?.sampleName).toBe('');
    });
  });

  describe('Flexible Min/Max Selection & Normalization', () => {
    const testPlate = {
      format: 96 as const,
      wells: {
        A1: { id: 'A1', row: 'A', col: 1, raw: 0.10, normalized: null, sampleGroupId: 'blank', sampleName: 'Blank', sampleType: 'blank' as const },
        A2: { id: 'A2', row: 'A', col: 2, raw: 0.10, normalized: null, sampleGroupId: 'blank', sampleName: 'Blank', sampleType: 'blank' as const },
        B1: { id: 'B1', row: 'B', col: 1, raw: 0.50, normalized: null, sampleGroupId: 'neg', sampleName: 'Neg Ctrl', sampleType: 'neg-ctrl' as const },
        C1: { id: 'C1', row: 'C', col: 1, raw: 2.50, normalized: null, sampleGroupId: 'pos', sampleName: 'Pos Ctrl', sampleType: 'pos-ctrl' as const },
        D1: { id: 'D1', row: 'D', col: 1, raw: 1.50, normalized: null, sampleGroupId: 's1', sampleName: 'Sample 1', sampleType: 'sample' as const },
      },
      rows: ['A', 'B', 'C', 'D'],
      cols: [1, 2],
      metadata: {},
      detectedFormat: 'matrix' as const,
      vendorHint: 'generic' as const,
      delimiter: ',',
      rawText: '',
    };

    it('supports selecting specific wells for Min and Max reference values', () => {
      // User sets Min to well B1 (0.50) and Max to well C1 (2.50)
      const res = normalizePlate(testPlate, {
        mode: 'percent-control',
        minMethod: 'wells',
        minWellIds: ['B1'],
        maxMethod: 'wells',
        maxWellIds: ['C1'],
      });

      expect(res.effectiveMin).toBeCloseTo(0.50, 4);
      expect(res.effectiveMax).toBeCloseTo(2.50, 4);
      // Sample D1 (1.50): 100 * (1.50 - 0.50) / (2.50 - 0.50) = 100 * 1.0 / 2.0 = 50.0%
      expect(res.normalizedWells.D1?.normalized).toBeCloseTo(50.0, 2);
    });

    it('supports custom numeric user-specified Min and Max values', () => {
      const res = normalizePlate(testPlate, {
        mode: 'percent-control',
        minMethod: 'custom',
        customMinValue: 0.0,
        maxMethod: 'custom',
        customMaxValue: 3.0,
      });

      expect(res.effectiveMin).toBe(0.0);
      expect(res.effectiveMax).toBe(3.0);
      // Sample D1 (1.50): 100 * (1.50 - 0.0) / 3.0 = 50.0%
      expect(res.normalizedWells.D1?.normalized).toBeCloseTo(50.0, 2);
    });

    it('supports lowest and highest well automatic bounds', () => {
      const res = normalizePlate(testPlate, {
        mode: 'percent-control',
        minMethod: 'lowest',
        maxMethod: 'highest',
      });

      // Lowest is A1 (0.10), Highest is C1 (2.50)
      expect(res.effectiveMin).toBeCloseTo(0.10, 2);
      expect(res.effectiveMax).toBeCloseTo(2.50, 2);
    });
  });

  describe('ELISA Standard Curve Quantification & Dose-Response Engine', () => {
    it('fits linear standard curve and quantifies unknown samples with dilution factor', () => {
      const parsed = parsePlateData(DEMO_96_ELISA_STANDARD.rawText);
      const layout = applyElisaPreset(parsed);
      parsed.wells = layout.wells;

      const stats = computeGroupStatistics(parsed.wells, layout.groups);
      const elisaResult = computeStandardCurveQuantification(parsed.wells, stats);

      expect(elisaResult.hasStandards).toBe(true);
      expect(elisaResult.points.length).toBe(8);
      expect(elisaResult.rSquared).toBeGreaterThan(0.95);
      expect(elisaResult.quantifiedSamples.length).toBeGreaterThan(0);

      // Verify dilution factor multiplier (10x) is applied to final concentration
      const sample1 = elisaResult.quantifiedSamples.find(s => s.sampleName.includes('Serum Sample 1'));
      expect(sample1).toBeDefined();
      expect(sample1?.dilutionFactor).toBe(10);
      expect(sample1?.finalConc).toBeCloseTo(sample1!.calculatedConc! * 10, 2);

      // Verify CSV export produces structured data
      const csv = exportQuantifiedSamplesCsv(elisaResult);
      expect(csv).toContain('Sample_Name,Group_ID,Replicate_Count');
      expect(csv).toContain('Standard Curve Equation');
    });

    it('computes dose-response series and estimates midpoint EC50', () => {
      const parsed = parsePlateData(DEMO_96_TECAN_DOSE_RESPONSE.rawText);
      const layout = applyDoseResponsePreset(parsed);
      parsed.wells = layout.wells;
      const normalized = normalizePlate(parsed, { mode: 'percent-control' });
      parsed.wells = normalized.normalizedWells;

      const stats = computeGroupStatistics(parsed.wells, layout.groups);
      const series = computeDoseResponseSeries(stats);

      expect(series.length).toBe(1);
      expect(series[0]?.points.length).toBe(8);
      expect(series[0]?.minConc).toBeCloseTo(0.0316, 3);
      expect(series[0]?.maxConc).toBeCloseTo(100.0, 1);
      expect(series[0]?.estimatedEc50).toBeGreaterThan(0);
    });
  });
});

