import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScript, readRootFile } from './load.js';

const win = loadBrowserScript('bio_align_engine.js');
const BC = win.BioCompute;

// Affine re-scoring of an alignment (Gotoh: first gap column costs gapOpen, following ones gapExt)
function rescore(a1, a2, matrix, gapOpen, gapExt) {
  let s = 0, inX = false, inY = false;
  for (let k = 0; k < a1.length; k++) {
    const x = a1[k], y = a2[k];
    if (y === '-') { s += inX ? gapExt : gapOpen; inX = true; inY = false; }
    else if (x === '-') { s += inY ? gapExt : gapOpen; inY = true; inX = false; }
    else { s += BC.getScore(x, y, matrix); inX = inY = false; }
  }
  return s;
}
function rand(n, alphabet, rng) { let s = ''; for (let i = 0; i < n; i++) s += alphabet[Math.floor(rng() * alphabet.length)]; return s; }
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const AA = 'ACDEFGHIKLMNPQRSTVWY';

test('substitution matrices are symmetric; known typos fixed', () => {
  const order = 'ARNDCQEGHILKMFPSTWYVBZX*';
  for (const name of ['BLOSUM62', 'BLOSUM45', 'PAM250']) {
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++)
      assert.equal(BC.getScore(order[i], order[j], name), BC.getScore(order[j], order[i], name), `${name} ${order[i]}${order[j]}`);
  }
  assert.equal(BC.getScore('Y', 'Z', 'BLOSUM62'), -2);
  assert.equal(BC.getScore('Z', 'P', 'PAM250'), 0);
  assert.equal(BC.getScore('W', 'W', 'BLOSUM62'), 11);
  assert.equal(BC.getScore('A', 'R', 'BLOSUM62'), -1);
});

test('global traceback never emits undefined and re-scores to the reported score', () => {
  const r = BC.run('ACGT', 'GGACGT', 'global', 'EDNAFULL', -10, -1);
  assert.ok(!r.seq1Aligned.includes('undefined') && !r.seq2Aligned.includes('undefined'));
  assert.equal(r.seq1Aligned.length, r.seq2Aligned.length);
  assert.equal(rescore(r.seq1Aligned, r.seq2Aligned, 'EDNAFULL', -10, -1), r.score);
  const rng = mulberry(42);
  for (let t = 0; t < 150; t++) {
    const s1 = rand(5 + Math.floor(rng() * 40), AA, rng);
    const s2 = rand(5 + Math.floor(rng() * 40), AA, rng);
    const g = BC.run(s1, s2, 'global', 'BLOSUM62', -11, -1);
    assert.equal(g.seq1Aligned.replace(/-/g, ''), s1, `s1 preserved ${s1} ${s2}`);
    assert.equal(g.seq2Aligned.replace(/-/g, ''), s2, `s2 preserved ${s1} ${s2}`);
    assert.equal(rescore(g.seq1Aligned, g.seq2Aligned, 'BLOSUM62', -11, -1), g.score, `global ${s1} ${s2} -> ${g.seq1Aligned} / ${g.seq2Aligned}`);
  }
});

test('local traceback keeps gaps and re-scores to the reported score', () => {
  const r = BC.run('CTAAAATGGCAGCACGCCATAC', 'GTAGATGGCACGCCCTA', 'local', 'EDNAFULL', -10, -1);
  assert.equal(rescore(r.seq1Aligned, r.seq2Aligned, 'EDNAFULL', -10, -1), r.score);
  const rng = mulberry(7);
  for (let t = 0; t < 300; t++) {
    const s1 = rand(10 + Math.floor(rng() * 40), AA, rng);
    const s2 = rand(10 + Math.floor(rng() * 40), AA, rng);
    const l = BC.run(s1, s2, 'local', 'BLOSUM62', -10, -1);
    assert.equal(rescore(l.seq1Aligned, l.seq2Aligned, 'BLOSUM62', -10, -1), l.score, `local ${s1} ${s2} -> ${l.seq1Aligned} / ${l.seq2Aligned}`);
    assert.ok(s1.includes(l.seq1Aligned.replace(/-/g, '')));
    assert.ok(s2.includes(l.seq2Aligned.replace(/-/g, '')));
  }
});

test('BLOSUM80 is not offered until it is implemented', () => {
  const html = readRootFile('bio_bench.html');
  assert.equal(html.includes('value="BLOSUM80"'), false);
});
