import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScript, readRootFile } from './load.js';
const { BindingEngine: BE } = loadBrowserScript('binding_engine.js');

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('1:1 matches Morrison closed form across regimes', () => {
  for (const [P, L, Kd] of [[10, 50, 100], [100, 5, 0.01], [1, 1, 1], [1000, 10, 5]]) {
    const x = ((P + L + Kd) - Math.sqrt((P + L + Kd) ** 2 - 4 * P * L)) / 2;
    assert.ok(near(BE.solveSingleStep(P, L, Kd, 1), x, 1e-6), `P=${P} L=${L} Kd=${Kd}`);
  }
});

test('stepwise with alpha=1 is binomial; alpha=0.1 is not', () => {
  const r1 = BE.solveStepwise(10, 50, 100, 2, 1);
  assert.ok(near(r1.probs[0], (1 - r1.theta) ** 2, 1e-6));
  const r = BE.solveStepwise(10, 50, 100, 2, 0.1);
  assert.ok(near(r.probs[0], 0.307, 2e-3), `P0 ${r.probs[0]}`);
  assert.ok(near(r.probs[2], 0.456, 2e-3), `P2 ${r.probs[2]}`);
  assert.ok(!near(r.probs[0], (1 - r.theta) ** 2, 1e-2), 'binomial must not be used when alpha != 1');
});

test('target solver hits the requested fraction through the exact model', () => {
  for (const mode of ['any_bound', 'fully_bound']) {
    const Lreq = BE.targetStepwise(10, 100, 2, 0.1, mode, 0.5);
    const r = BE.solveStepwise(10, Lreq, 100, 2, 0.1);
    const got = mode === 'any_bound' ? 1 - r.probs[0] : r.probs[2];
    assert.ok(near(got, 0.5, 1e-4), `${mode}: got ${got}`);
  }
  assert.ok(Number.isNaN(BE.targetStepwise(10, 100, 2, 1, 'any_bound', 1.0)));
});

test('binding_calculator.html loads the engine and uses exact species in tiles', () => {
  const html = readRootFile('binding_calculator.html');
  assert.match(html, /<script src="binding_engine\.js"><\/script>/);
  assert.match(html, /const prob0 = probs\[0\];/);
  assert.match(html, /window\.BindingEngine\.targetStepwise\(/);
  assert.equal(html.includes('Math.pow(1 - theta, n)'), false);
});
