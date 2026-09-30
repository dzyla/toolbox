import { describe, expect, it } from 'vitest';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { designNebuilder, NEBUILDER_DEFAULTS, type NebuilderFragment } from '@/core/cloning/methods/nebuilder';
import { wallaceTm } from '@/core/cloning/neb-tm';
import { reverseComplement } from '@/core/nucleic/sequence';
import { randomDna } from './helpers';

const A: NebuilderFragment = { name: 'A', sequence: randomDna(300, 31), topology: 'linear', kind: 'pcr' };
const B: NebuilderFragment = { name: 'B', sequence: randomDna(300, 32), topology: 'linear', kind: 'pcr' };
const linear = { ...NEBUILDER_DEFAULTS, circularize: false };

describe('fwdTailShare', () => {
  it.each([0, 0.25, 0.5, 0.75, 1])('share %s puts that fraction on the downstream forward primer', share => {
    const design = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: share }] });
    expect(design.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    const junction = design.junctions[0]!;
    const onForward = junction.upstreamTail.length;
    const onReverse = junction.downstreamTail.length;
    expect(onForward + onReverse).toBe(junction.overlapLength);
    expect(onForward).toBe(Math.min(junction.overlapLength, Math.round(junction.overlapLength * share)));
    const overlap = A.sequence.slice(A.sequence.length - onForward) + B.sequence.slice(0, onReverse);
    expect(wallaceTm(overlap)).toBeGreaterThanOrEqual(48);
    expect(design.primers.find(p => p.name === 'B_fwd')!.overlap).toBe(junction.upstreamTail);
    expect(design.primers.find(p => p.name === 'A_rev')!.overlap).toBe(junction.downstreamTail);
    expect(junction.downstreamTail).toBe(reverseComplement(B.sequence.slice(0, onReverse)));
    // After PCR the two products share the overlap.
    const productA = A.sequence + B.sequence.slice(0, onReverse);
    const productB = A.sequence.slice(A.sequence.length - onForward) + B.sequence;
    expect(productA.endsWith(overlap)).toBe(true);
    expect(productB.startsWith(overlap)).toBe(true);
  });

  it('share 0 matches the existing all-downstream placement', () => {
    const shared = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 0 }] });
    const forced = designNebuilder([A, B], { ...linear, junctions: [{ mode: 'downstream' }] });
    expect(shared.primers).toEqual(forced.primers);
  });

  it('share 1 matches the existing all-upstream placement', () => {
    const shared = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 1 }] });
    const forced = designNebuilder([A, B], { ...linear, junctions: [{ mode: 'upstream' }] });
    expect(shared.primers).toEqual(forced.primers);
  });

  it('leaves designs without a share exactly as before', () => {
    expect(designNebuilder([A, B], { ...linear, junctions: [{}] })).toEqual(designNebuilder([A, B], linear));
    expect(designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: undefined }] })).toEqual(designNebuilder([A, B], linear));
  });

  it('moves the whole overlap to the PCR side when the neighbour is a restriction digest', () => {
    const puc19 = PRESET_PLASMIDS.find(plasmid => plasmid.id === 'puc19')!.seq;
    const backbone: NebuilderFragment = { name: 'bb', sequence: puc19, topology: 'circular', kind: 'digest', leftEnzyme: 'HindIII', rightEnzyme: 'EcoRI', isVectorBackbone: true };
    const design = designNebuilder([backbone, A], { ...NEBUILDER_DEFAULTS, junctions: [{ fwdTailShare: 0.5 }, undefined] });
    expect(design.findings.some(f => f.code === 'SHARE_ADJUSTED' && f.severity === 'info')).toBe(true);
    const junction = design.junctions[0]!;
    expect(junction.downstreamTail).toBe('');
    expect(junction.upstreamTail.length).toBeGreaterThanOrEqual(20);
  });

  it('blocks a spacer with a genuine split but allows one at share 0', () => {
    const blocked = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 0.5, spacer: 'GGATCC' }] });
    expect(blocked.findings.some(f => f.code === 'SPACER_NEEDS_PLACEMENT')).toBe(true);
    const allowed = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 0, spacer: 'GGATCC' }] });
    expect(allowed.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    expect(allowed.junctions[0]!.spacer).toBe('GGATCC');
  });

  it('warns about primers longer than 60 nt only when a share was chosen', () => {
    const long = designNebuilder([A, B], { ...linear, minOverlap: 75, junctions: [{ fwdTailShare: 1 }] });
    expect(long.findings.some(f => f.code === 'LONG_PRIMER' && f.severity === 'warning')).toBe(true);
    const plain = designNebuilder([A, B], { ...linear, minOverlap: 75 });
    expect(plain.findings.some(f => f.code === 'LONG_PRIMER')).toBe(false);
  });

  it('clamps a share outside 0–1', () => {
    const over = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 7 }] });
    const one = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 1 }] });
    expect(over.primers).toEqual(one.primers);
  });

  it('ignores a NaN share but clamps the infinities', () => {
    const plain = designNebuilder([A, B], linear);
    expect(designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: Number.NaN }] })).toEqual(plain);
    const high = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: Infinity }] });
    expect(high.primers).toEqual(designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 1 }] }).primers);
    const low = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: -Infinity }] });
    expect(low.primers).toEqual(designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 0 }] }).primers);
    expect(high.junctions[0]!.downstreamTail).toBe('');
    expect(low.junctions[0]!.upstreamTail).toBe('');
  });

  it('runs the long-primer check for an infinite share, and not for NaN', () => {
    expect(designNebuilder([A, B], { ...linear, minOverlap: 75, junctions: [{ fwdTailShare: Infinity }] }).findings.some(f => f.code === 'LONG_PRIMER')).toBe(true);
    expect(designNebuilder([A, B], { ...linear, minOverlap: 75, junctions: [{ fwdTailShare: Number.NaN }] }).findings.some(f => f.code === 'LONG_PRIMER')).toBe(false);
  });

  it('says so when neither neighbour can carry a tail, whatever the share', () => {
    const puc19 = PRESET_PLASMIDS.find(plasmid => plasmid.id === 'puc19')!.seq;
    const one: NebuilderFragment = { name: 'one', sequence: puc19, topology: 'circular', kind: 'digest', leftEnzyme: 'HindIII', rightEnzyme: 'EcoRI' };
    const two: NebuilderFragment = { name: 'two', sequence: puc19, topology: 'circular', kind: 'digest', leftEnzyme: 'EcoRI', rightEnzyme: 'HindIII' };
    for (const share of [0, 0.5, 1]) {
      const design = designNebuilder([one, two], { ...linear, junctions: [{ fwdTailShare: share }] });
      const note = design.findings.find(f => f.code === 'SHARE_ADJUSTED');
      expect(note, `share ${share}`).toMatchObject({ severity: 'info' });
      expect(note!.message).toContain('neither side can carry a tail');
      expect(design.junctions[0]!.mode).toBe('none');
    }
  });

  it('puts the whole overlap on the other side when the downstream neighbour is a digest', () => {
    const puc19 = PRESET_PLASMIDS.find(plasmid => plasmid.id === 'puc19')!.seq;
    const backbone: NebuilderFragment = { name: 'bb', sequence: puc19, topology: 'circular', kind: 'digest', leftEnzyme: 'HindIII', rightEnzyme: 'EcoRI', isVectorBackbone: true };
    const design = designNebuilder([A, backbone], { ...linear, junctions: [{ fwdTailShare: 0.5 }] });
    expect(design.findings.some(f => f.code === 'SHARE_ADJUSTED' && f.severity === 'info')).toBe(true);
    const junction = design.junctions[0]!;
    expect(junction.upstreamTail).toBe('');
    expect(junction.downstreamTail.length).toBeGreaterThanOrEqual(20);
  });

  it('warns when a fragment is too short to carry its share of the overlap', () => {
    const tiny: NebuilderFragment = { name: 'tiny', sequence: randomDna(70, 33), topology: 'linear', kind: 'pcr' };
    const design = designNebuilder([tiny, B], { ...linear, minOverlap: 75, junctions: [{ fwdTailShare: 1 }] });
    const note = design.findings.find(f => f.code === 'OVERLAP_SHORTER_THAN_REQUESTED');
    expect(note).toMatchObject({ severity: 'warning' });
    expect(design.junctions[0]!.overlapLength).toBeLessThan(75);
    // No warning for a normal split.
    expect(designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 0.5 }] }).findings.some(f => f.code === 'OVERLAP_SHORTER_THAN_REQUESTED')).toBe(false);
  });
});
