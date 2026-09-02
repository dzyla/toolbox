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
