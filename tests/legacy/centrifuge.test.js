import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScript, readRootFile } from './load.js';

test('labConstants exposes RCF constants for cm and mm', () => {
  const { LAB_CONSTANTS } = loadBrowserScript('labConstants.js');
  assert.equal(LAB_CONSTANTS.constants.g_force_const, 1.118e-5);      // r in cm
  assert.equal(LAB_CONSTANTS.constants.rcf_per_mm_rpm2, 1.118e-6);   // r in mm
  // 100 mm, 10 000 rpm -> 11 180 g
  assert.equal(Math.round(1.118e-6 * 100 * 1e4 * 1e4), 11180);
});

test('bio_bench uses the mm constant with the mm label', () => {
  const html = readRootFile('bio_bench.html');
  assert.match(html, /Rotor Radius \(mm\)/);
  assert.equal((html.match(/1\.118e-5/g) || []).length, 0, 'cm constant must not appear');
  assert.ok((html.match(/1\.118e-6/g) || []).length >= 2, 'mm constant used in both directions');
});
