import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScript } from './load.js';

test('harness loads definitions.js and exposes PROTEIN_DEFS and PROTEIN_UTILS', () => {
  const win = loadBrowserScript('definitions.js');
  assert.ok(win.PROTEIN_DEFS.AA.mw.A > 71 && win.PROTEIN_DEFS.AA.mw.A < 72);
  assert.equal(typeof win.PROTEIN_UTILS.countAA, 'function');
});
