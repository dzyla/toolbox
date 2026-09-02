import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScript, readRootFile } from './load.js';

const { LAB_CONSTANTS } = loadBrowserScript('labConstants.js');
const byName = Object.fromEntries(LAB_CONSTANTS.chemicals.map(c => [c.name, c]));

test('chemical MW corrections', () => {
  assert.equal(byName['E-64'].mw, 357.41);
  assert.equal(byName['dTTP (Disodium)'].mw, 526.13);
  assert.equal(byName['ADA'].mw, 190.16);
  assert.equal(byName['Cholamine chloride hydrochloride'].mw, 175.10);
  assert.equal(byName['L-Glutamic acid'].mw, 147.13);
  for (const gone of ['Agarose', 'Glycogen', 'EDTA (0.5M soln, pH 8.0 approx)', 'L-Glutamate', 'Cholamine chloride'])
    assert.equal(byName[gone], undefined, `${gone} should be removed`);
  // spot checks of entries verified correct in the audit
  assert.equal(byName['Tris-base'].mw, 121.14);
  assert.equal(byName['HEPES (Free Acid)'].mw, 238.30);
});

test('TAE preset uses 17.4 M glacial acetic acid stock', () => {
  const html = readRootFile('bio_bench.html');
  assert.match(html, /name: "Acetic Acid \(glacial, 17\.4 M\)", mw: 17\.4, isLiquid: true, conc: 20, unit: "mM", stockUnit: "M"/);
});

test('ammonium sulfate uses 533/0.30 at 25 °C and 515/0.27 at 0 °C', () => {
  const html = readRootFile('bio_bench.html');
  assert.match(html, /temp === "25" \? 533 : 515/);
  assert.match(html, /temp === "25" \? 0\.3 : 0\.27/);
  assert.match(html, /<option value="25">25 °C \(room temperature\)<\/option>/);
  assert.match(html, /<option value="0">0–4 °C \(cold room\)<\/option>/);
  // 0 -> 50 % at 25 °C in 1 L: 533*50/(100-15) = 313.5 g
  assert.ok(Math.abs(533 * 50 / (100 - 0.3 * 50) - 313.5) < 0.1);
});

test('gel densitometry maps display rect into source with crop offset', () => {
  const html = readRootFile('gel_annotator.html');
  assert.match(html, /const sx = gel\.crop\.x \+ \(x - gr\.x\) \/ scale;/);
  assert.match(html, /const sy = gel\.crop\.y \+ \(y - gr\.y\) \/ scale;/);
});
