import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseStar, parseFscTable, parseDelimitedTable, detectFscColumns, buildFscCurves, classifyHeader,
  resolutionAtThreshold, analyzeFscCurve, nyquistSummary, modelFsc, modelCrossing,
  freqToResolution, resolutionToFreq, syntheticFscStar, tokenizeStarLine, FscParseError,
  type FscCurve,
} from '@/core/cryoem';

const fx = (name: string) => readFileSync(join(__dirname, '../fixtures/fsc', name), 'utf8');

function modelCurve(f0: number, n: number, fmax: number, points = 4001, name = 'model'): FscCurve {
  const freq = Array.from({ length: points }, (_, i) => (i * fmax) / (points - 1));
  return { name, freq, fsc: freq.map(f => modelFsc(f, f0, n)) };
}

describe('FSC unit conversions', () => {
  it('converts between 1/Å and Å', () => {
    expect(freqToResolution(0.25)).toBeCloseTo(4, 12);
    expect(resolutionToFreq(2.5)).toBeCloseTo(0.4, 12);
    expect(freqToResolution(0)).toBe(Infinity);
    expect(resolutionToFreq(Infinity)).toBe(0);
  });
});

describe('FSC threshold crossing', () => {
  it.each([
    [0.2, 6, 0.143], [0.2, 6, 0.5], [0.35, 10, 0.143], [0.12, 3, 0.5],
  ])('matches the analytic crossing for f0=%f n=%i t=%f', (f0, n, t) => {
    const c = modelCurve(f0, n, 0.6);
    const r = resolutionAtThreshold(c.freq, c.fsc, t);
    expect(r.status).toBe('crossed');
    expect(r.frequency!).toBeCloseTo(modelCrossing(f0, n, t), 4);
    expect(r.resolution!).toBeCloseTo(1 / modelCrossing(f0, n, t), 2);
    expect(r.reCrosses).toBe(false);
  });

  it('interpolates linearly between the bracketing shells', () => {
    const r = resolutionAtThreshold([0, 0.1, 0.2], [1, 0.6, 0.2], 0.5);
    expect(r.frequency).toBeCloseTo(0.125, 12);
    expect(r.resolution).toBeCloseTo(8, 10);
  });

  it('reports never-crosses and below-start', () => {
    expect(resolutionAtThreshold([0, 0.1, 0.2], [1, 0.9, 0.8], 0.5).status).toBe('never-crosses');
    expect(resolutionAtThreshold([0, 0.1, 0.2], [0.4, 0.3, 0.2], 0.5).status).toBe('below-start');
  });

  it('uses the first downward crossing and flags a later re-crossing', () => {
    const freq = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
    const fsc = [1, 0.8, 0.3, 0.1, 0.25, 0.05];
    const r = resolutionAtThreshold(freq, fsc, 0.2);
    expect(r.status).toBe('crossed');
    expect(r.frequency!).toBeCloseTo(0.2 + (0.1 / 0.2) * 0.1, 12);
    expect(r.reCrosses).toBe(true);
    expect(r.reCrossFrequency).toBe(0.4);
    const a = analyzeFscCurve({ name: 'noisy', freq, fsc }, { thresholds: [0.2], pixelSize: 1 });
    expect(a.warnings.some(w => /rises above/.test(w))).toBe(true);
  });

  it('treats a value exactly at the threshold as still above it', () => {
    const r = resolutionAtThreshold([0, 0.1, 0.2], [1, 0.5, 0.1], 0.5);
    expect(r.frequency).toBeCloseTo(0.1, 12);
  });
});

describe('Nyquist handling', () => {
  it('flags a crossing at the Nyquist resolution', () => {
    const c = modelCurve(0.39, 8, 0.5); // pixel 1 Å: Nyquist 2 Å (f = 0.5)
    const a = analyzeFscCurve(c, { pixelSize: 1 });
    expect(a.nyquistResolution).toBe(2);
    expect(a.crossings[0]!.nyquist).toBe('near');
    expect(nyquistSummary(a)).toBe('At/near Nyquist');
    expect(a.warnings.some(w => /Nyquist/.test(w))).toBe(true);
  });
  it('is ok for a well-sampled curve and infers Nyquist without a pixel size', () => {
    const c = modelCurve(0.2, 6, 0.5);
    const a = analyzeFscCurve(c, { pixelSize: 1 });
    expect(a.crossings.every(x => x.nyquist === 'ok')).toBe(true);
    const inferred = analyzeFscCurve(c);
    expect(inferred.nyquistInferred).toBe(true);
    expect(inferred.nyquistResolution).toBeCloseTo(2, 10);
  });
  it('reports not-reached when the curve stays above the threshold', () => {
    const a = analyzeFscCurve({ name: 'x', freq: [0, 0.25, 0.5], fsc: [1, 0.9, 0.8] }, { pixelSize: 1 });
    expect(a.crossings[0]!.nyquist).toBe('not-reached');
    expect(nyquistSummary(a)).toMatch(/No crossing/);
  });
  it('warns when the pixel size contradicts the curve extent or the crossing beats Nyquist', () => {
    const c = modelCurve(0.3, 8, 0.5);
    const a = analyzeFscCurve(c, { pixelSize: 2 }); // Nyquist 4 Å but curve goes to 2 Å
    expect(a.warnings.some(w => /check the pixel size/.test(w))).toBe(true);
    expect(a.crossings[0]!.nyquist).toBe('beyond');
  });
});

describe('RELION STAR parsing', () => {
  it('reads data_fsc of a postprocess.star and ignores other blocks', () => {
    const table = parseFscTable(fx('postprocess.star'));
    expect(table.source).toBe('star');
    expect(table.headers).toContain('rlnFourierShellCorrelationCorrected');
    expect(table.columns[0]!.length).toBe(51);
    const map = detectFscColumns(table);
    expect(map.confident).toBe(true);
    expect(map.freqKind).toBe('invAngstrom');
    expect(map.fscCols.length).toBe(4);
    const curves = buildFscCurves(table, map);
    expect(curves.map(c => c.name)).toEqual([
      'Corrected', 'Unmasked maps', 'Masked maps', 'Phase-randomised masked (corrected)',
    ]);
    const r = resolutionAtThreshold(curves[0]!.freq, curves[0]!.fsc, 0.143);
    // shell spacing 0.01 1/Å: about 1% accuracy
    expect(r.frequency! / modelCrossing(0.2, 6, 0.143)).toBeCloseTo(1, 1);
    expect(resolutionAtThreshold(curves[0]!.freq, curves[0]!.fsc, 0.5).frequency!).toBeCloseTo(0.2, 2);
    expect(resolutionAtThreshold(curves[1]!.freq, curves[1]!.fsc, 0.5).frequency!).toBeCloseTo(0.22, 2);
  });

  it('handles comments, blank lines, quotes, split rows, inf and #N labels', () => {
    const blocks = parseStar(fx('quoted-odd.star'));
    expect(blocks.map(b => b.name)).toEqual(['other', 'fsc']);
    expect(blocks[0]!.pairs._rlnSomething).toBe('a b');
    const fsc = blocks[1]!;
    expect(fsc.labels.length).toBe(3);
    expect(fsc.rows.length).toBe(6);
    const table = parseFscTable(fx('quoted-odd.star'));
    const map = detectFscColumns(table);
    expect(map.freqKind).toBe('angstrom');
    const curves = buildFscCurves(table, map);
    expect(curves[0]!.freq[0]).toBe(0); // inf Å -> 0 1/Å
    const r = resolutionAtThreshold(curves[0]!.freq, curves[0]!.fsc, 0.143);
    const fa = 0.25, fb = 1 / 3;
    expect(r.frequency!).toBeCloseTo(fa + ((0.3 - 0.143) / 0.2) * (fb - fa), 10);
  });

  it('tokenises quoted values containing spaces', () => {
    expect(tokenizeStarLine(`a "b c" 'd e' f'g h # note`)).toEqual(['a', 'b c', 'd e', "f'g", 'h']);
  });

  it('accepts Windows line endings and multiple data blocks', () => {
    const text = 'data_a\r\n_x 1\r\ndata_fsc\r\nloop_\r\n_rlnResolution\r\n_rlnFourierShellCorrelationCorrected\r\n0 1\r\n0.1 0.5\r\n0.2 0.1\r\n';
    const table = parseFscTable(text);
    const curves = buildFscCurves(table, detectFscColumns(table));
    expect(curves[0]!.fsc).toEqual([1, 0.5, 0.1]);
  });

  it('reads the bundled synthetic example', () => {
    const text = syntheticFscStar(0.83, 256);
    expect(text).toMatch(/SYNTHETIC/);
    const table = parseFscTable(text);
    const curves = buildFscCurves(table, detectFscColumns(table));
    expect(curves.length).toBe(3);
    const a = analyzeFscCurve(curves[0]!, { pixelSize: 0.83 });
    expect(a.crossings[0]!.resolution!).toBeCloseTo(3.1, 1);
    expect(a.crossings[0]!.nyquist).toBe('ok');
  });

  it.each([
    ['malformed.star', /not a whole number of rows/],
    ['no-loop.star', /does not look like a STAR file|No FSC table/],
  ])('gives a readable error for %s', (name, re) => {
    expect(() => parseFscTable(fx(name))).toThrowError(re);
    expect(() => parseFscTable(fx(name))).toThrowError(FscParseError);
  });

  it('explains when the STAR file has loops but no FSC', () => {
    expect(() => parseFscTable('data_x\nloop_\n_rlnA\n1\n2\n')).toThrowError(/No FSC table found.*data_x/);
  });
  it('rejects data outside a loop and loop_ before data_', () => {
    expect(() => parseStar('loop_\n_a\n1\n')).toThrowError(/before any data_/);
    expect(() => parseStar('data_a\n1 2 3\n')).toThrowError(/outside a loop/);
  });
});

describe('delimited text parsing and detection', () => {
  it('reads CSV with a 1/Å header and several FSC columns', () => {
    const table = parseFscTable(fx('curves.csv'));
    const map = detectFscColumns(table);
    expect(map).toMatchObject({ freqCol: 0, freqKind: 'invAngstrom', fscCols: [1, 2], confident: true });
    const curves = buildFscCurves(table, map);
    expect(curves.map(c => c.name)).toEqual(['FSC corrected', 'FSC tight']);
    expect(resolutionAtThreshold(curves[0]!.freq, curves[0]!.fsc, 0.5).frequency!).toBeCloseTo(0.2, 2);
  });
  it('reads TSV and finds the frequency column by name', () => {
    const table = parseFscTable(fx('curves.tsv'));
    expect(table.source).toBe('delimited');
    const map = detectFscColumns(table);
    expect(map.freqKind).toBe('invAngstrom');
    expect(map.fscCols).toEqual([1, 2]);
  });
  it('requires pixel and box for a shell-index column and converts with them', () => {
    const table = parseFscTable(fx('shells.csv'));
    const map = detectFscColumns(table);
    expect(map.freqKind).toBe('index');
    expect(() => buildFscCurves(table, map)).toThrowError(/pixel size and box size/);
    const [c] = buildFscCurves(table, map, { pixelSize: 1, box: 100 });
    expect(resolutionAtThreshold(c!.freq, c!.fsc, 0.5).frequency!).toBeCloseTo(0.2, 2);
    const [d] = buildFscCurves(table, map, { pixelSize: 2, box: 100 });
    expect(d!.freq[1]).toBeCloseTo(1 / 200, 12);
  });
  it('accepts whitespace-separated numbers with # comments and a #-prefixed header', () => {
    const text = '# FSC of job J12\n# res_A fsc_masked\n50 1.0\n10 0.9\n5 0.4\n3 0.1\n2 0.0\n';
    const table = parseFscTable(text);
    expect(table.headers).toEqual(['res_A', 'fsc_masked']);
    const [c] = buildFscCurves(table, detectFscColumns(table));
    expect(c!.freq[0]).toBeCloseTo(0.02, 12); // sorted ascending after 1/Å conversion
    expect(c!.freq.at(-1)).toBeCloseTo(0.5, 12);
  });
  it('handles quoted headers, semicolons and Å symbols', () => {
    const text = '"Resolution (Å)";"FSC (masked)"\n20;1\n10;0.8\n5;0.3\n3;0.05\n';
    const table = parseFscTable(text);
    expect(table.headers).toEqual(['Resolution (Å)', 'FSC (masked)']);
    expect(detectFscColumns(table)).toMatchObject({ freqKind: 'angstrom', fscCols: [1], confident: true });
  });
  it('guesses unrecognised headers from the data and marks the mapping unconfident', () => {
    const table = parseFscTable('a,b,c\n0,1,0.9\n0.1,0.8,0.7\n0.2,0.4,0.3\n0.3,0.1,0.1\n');
    const map = detectFscColumns(table);
    expect(map.confident).toBe(false);
    expect(map.freqCol).toBe(0);
    expect(map.freqKind).toBe('invAngstrom');
    expect(map.fscCols).toEqual([1, 2]);
    const [c] = buildFscCurves(table, { ...map, fscCols: [2] }); // user override
    expect(c!.name).toBe('c');
  });
  it('names columns when there is no header and reports skipped lines', () => {
    const table = parseDelimitedTable('0 1\n0.1 0.5\nbad line here\n0.2 0.1\n');
    expect(table.headers).toEqual(['Column 1', 'Column 2']);
    expect(table.notes.join(' ')).toMatch(/Skipped 1 line/);
  });
  it('classifies common headers', () => {
    expect(classifyHeader('rlnResolution')).toBe('invAngstrom');
    expect(classifyHeader('Spatial frequency (1/Å)')).toBe('invAngstrom');
    expect(classifyHeader('Resolution (Å)')).toBe('angstrom');
    expect(classifyHeader('Shell')).toBe('index');
    expect(classifyHeader('Tight mask FSC')).toBe('fsc');
  });
  it.each([
    ['', /Nothing to read/],
    ['hello\nworld\n', /No numeric data rows/],
    ['1\n2\n3\n', /Only one numeric column/],
  ])('rejects %j with a readable message', (text, re) => {
    expect(() => parseFscTable(text)).toThrowError(re);
  });
  it('rejects a column with too few usable values', () => {
    const table = parseFscTable('f,fsc\n0,1\n0.1,0.5\n');
    expect(() => buildFscCurves(table, detectFscColumns(table))).toThrowError(/at least 3/);
  });
});

describe('real RELION 4 postprocess.star (excerpt)', () => {
  const text = fx('relion4-postprocess.star');
  it('reads the final resolution and the pixel size from the file', () => {
    const t = parseFscTable(text);
    expect(t.meta).toEqual({ relionFinalResolution: 2.843428, pixelSize: 1.244 });
  });
  it('does not offer the particle-mask-fraction column as an FSC curve', () => {
    const t = parseFscTable(text);
    const m = detectFscColumns(t);
    expect(m.fscCols.map(i => t.headers[i])).not.toContain('rlnFourierShellCorrelationParticleMaskFraction');
    expect(m.fscCols.length).toBe(4);
  });
  it("matches RELION's own number: the last shell with corrected FSC >= 0.143 is 2.843428 Å, the interpolated crossing is slightly better", () => {
    const t = parseFscTable(text);
    const curves = buildFscCurves(t, detectFscColumns(t));
    const corrected = curves.find(c => c.name === 'Corrected')!;
    const a = analyzeFscCurve(corrected, { pixelSize: t.meta!.pixelSize });
    const c = a.crossings.find(x => x.threshold === 0.143)!;
    expect(c.lastShellResolution!).toBeCloseTo(2.843428, 4);
    expect(c.resolution!).toBeLessThan(2.843428);
    expect(c.resolution!).toBeGreaterThan(2.80);
    expect(c.nyquist).toBe('ok');
  });
});
