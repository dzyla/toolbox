import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScript } from './load.js';

export const LYSOZYME = 'KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL';
export const INSULIN_B = 'FVNQHLCGSHLVEALYLVCGERGFFYTPKT';

function instability(seq, DIWV) {
  let s = 0;
  for (let i = 0; i < seq.length - 1; i++) s += DIWV[seq[i]][seq[i + 1]];
  return (10 / seq.length) * s;
}

test('DIWV matches Guruprasad 1990 spot values and reproduces ProtParam II', () => {
  const { PROTEIN_DEFS } = loadBrowserScript('definitions.js');
  const D = PROTEIN_DEFS.DIWV;
  assert.equal(D.A.C, 44.94);
  assert.equal(D.R.R, 58.28);
  assert.equal(D.M.H, 58.28);
  assert.equal(D.A.P, 20.26);
  assert.equal(D.G.A, -7.49);
  assert.equal(D.Y.R, -15.91);
  let n = 0; for (const a in D) for (const b in D[a]) n++;
  assert.equal(n, 400);
  assert.ok(Math.abs(instability(LYSOZYME, D) - 16.09) < 0.05, 'lysozyme II (ProtParam 16.09)');
  assert.ok(Math.abs(instability(INSULIN_B, D) - 9.85) < 0.05, 'insulin B II');
});

test('true Bjellqvist pI reproduces ExPASy; EMBOSS set still available', () => {
  const { PROTEIN_UTILS: U } = loadBrowserScript('definitions.js');
  const lys = U.countAA(LYSOZYME), ins = U.countAA(INSULIN_B);
  assert.ok(Math.abs(U.isoelectricPoint(lys, 'bjellqvist', LYSOZYME) - 9.32) < 0.02, 'lysozyme pI');
  assert.ok(Math.abs(U.isoelectricPoint(ins, 'bjellqvist', INSULIN_B) - 6.90) < 0.02, 'insulin B pI');
  assert.deepEqual({ ...U.pKaSets.emboss.side }, { K: 10.8, R: 12.5, H: 6.5, D: 3.9, E: 4.1, C: 8.5, Y: 10.1 }); // EMBOSS Epk.dat
  assert.deepEqual([U.pKaSets.emboss.nTerm.default, U.pKaSets.emboss.cTerm.default], [8.6, 3.6]);
  assert.deepEqual({ ...U.pKaSets.bjellqvist.side }, { K: 10.0, R: 12.0, H: 5.98, D: 4.05, E: 4.45, C: 9.0, Y: 10.0 });
  assert.equal(U.pKaSets.bjellqvist.nTerm.default, 7.5);
  assert.equal(U.pKaSets.bjellqvist.nTerm.P, 8.36);
  assert.equal(U.pKaSets.bjellqvist.cTerm.E, 4.75);
  // charge at the pI is zero by definition
  assert.ok(Math.abs(U.netCharge(lys, U.isoelectricPoint(lys, 'bjellqvist', LYSOZYME), 'bjellqvist', LYSOZYME)) < 1e-6);
});

test('extinction coefficients: native (Pace) and denatured (6 M GdnHCl)', () => {
  const { PROTEIN_UTILS: U } = loadBrowserScript('definitions.js');
  const c = U.countAA(LYSOZYME);
  const mw = U.molecularWeight(c);
  assert.ok(Math.abs(mw - 14313.14) < 0.01, 'lysozyme MW');
  const nat = U.extinctionCoefficients(c, mw, 'native');
  assert.equal(nat.reduced, 37470);
  assert.equal(nat.cystines, 37970);
  const den = U.extinctionCoefficients(c, mw, 'denatured');
  assert.equal(den.reduced, 37965);   // 6 W * 5685 + 3 Y * 1285
  assert.equal(den.cystines, 38465);  // + 4 cystines * 125
  assert.ok(Math.abs(nat.absCys - 2.653) < 0.002, 'Abs 0.1% with cystines');
  assert.deepEqual({ ...U.extinctionCoefficients(c, mw) }, { ...nat }, 'default state is native');
});
