import { describe, expect, it } from 'vitest';
import {
  chargeProfile,
  foldIndexProfile,
  hydropathyProfile,
  hydrophobicMomentProfile,
  secondaryStructureProfiles,
} from '@/core/protein/profiles';
import {
  mergeFeatures,
  parseDomainCsv,
  scanFeatures,
  signalPeptideCandidates,
  transmembraneCandidates,
  type ProteinFeature,
} from '@/core/protein/features';
import { countAA, monoisotopicMass, PROTEASES, digest } from '@/core/protein';
import { esiChargeLadder, matchPeptideMasses } from '@/core/protein/mass';
import modifications from '@/data/protein/modifications.json';

describe('protein profiles', () => {
  it('centres a three-residue Kyte-Doolittle window and truncates it at sequence ends', () => {
    // KD(A)=1.8, KD(I)=4.5, KD(L)=3.8. Expectations are hand-averaged.
    expect(hydropathyProfile('AIL', 3)).toEqual([
      (1.8 + 4.5) / 2,
      (1.8 + 4.5 + 3.8) / 3,
      (4.5 + 3.8) / 2,
    ]);
  });

  it('uses the selected pKa scheme for the per-residue charge profile', () => {
    const bjellqvist = chargeProfile('AKD', 7, 1, 'bjellqvist');
    const emboss = chargeProfile('AKD', 7, 1, 'emboss');
    expect(bjellqvist).toHaveLength(3);
    expect(emboss).not.toEqual(bjellqvist);
  });

  it('classifies poly-K as FoldIndex-negative and poly-L as FoldIndex-positive', () => {
    expect(Math.max(...foldIndexProfile('K'.repeat(61)))).toBeLessThan(0);
    expect(Math.min(...foldIndexProfile('L'.repeat(61)))).toBeGreaterThan(0);
  });

  it('gives an ideal amphipathic helix a larger moment than poly-L', () => {
    const amphipathic = hydrophobicMomentProfile('LKKLLKLLKKLLKL');
    const uniform = hydrophobicMomentProfile('L'.repeat(14));
    expect(Math.max(...amphipathic)).toBeGreaterThan(Math.max(...uniform));
  });

  it('uses the published Chou-Fasman propensities on the /100 scale', () => {
    const profile = secondaryStructureProfiles('A', 1, 1);
    expect(profile.helix[0]).toBeCloseTo(1.42, 12);
    expect(profile.sheet[0]).toBeCloseTo(0.83, 12);
  });
});

describe('protein features', () => {
  it('finds a His6 tag at its 1-based inclusive position', () => {
    const hit = scanFeatures('AAHHHHHHGG').find(feature => feature.name === 'His-Tag (6x)');
    expect(hit).toMatchObject({ start: 3, end: 8, match: 'HHHHHH', kind: 'tag' });
  });

  it('accepts a one-residue change in a large tag above 90 percent identity', () => {
    const egfp = 'MVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK';
    const oneMutation = `${egfp.slice(0, 100)}A${egfp.slice(101)}`;
    const hit = scanFeatures(oneMutation, 0.9).find(feature => feature.name === 'EGFP');
    expect(hit).toMatchObject({ start: 1, end: egfp.length, kind: 'large-tag' });
    expect(hit!.identity).toBeGreaterThan(0.99);
  });

  it('finds a transmembrane candidate in a 23-residue hydrophobic stretch', () => {
    const features = transmembraneCandidates(`KKKK${'L'.repeat(23)}DDDD`);
    expect(features.some(feature => feature.start <= 5 && feature.end >= 27)).toBe(true);
  });

  it('merges overlapping hits only when their names and categories match', () => {
    const input: ProteinFeature[] = [
      { start: 2, end: 5, name: 'motif', category: 'PTM', kind: 'motif', color: '#000' },
      { start: 4, end: 8, name: 'motif', category: 'PTM', kind: 'motif', color: '#000' },
      { start: 4, end: 8, name: 'other', category: 'PTM', kind: 'motif', color: '#000' },
    ];
    expect(mergeFeatures(input)).toEqual([
      { start: 2, end: 8, name: 'motif', category: 'PTM', kind: 'motif', color: '#000' },
      { start: 4, end: 8, name: 'other', category: 'PTM', kind: 'motif', color: '#000' },
    ]);
  });

  it('labels the N-terminal hydrophobic heuristic as a signal-peptide candidate', () => {
    const hit = signalPeptideCandidates(`MKK${'L'.repeat(15)}AAA`)[0];
    expect(hit).toMatchObject({ name: 'Signal peptide (candidate)', kind: 'signal-peptide' });
  });

  it('parses user domain CSV as 1-based inclusive coordinates', () => {
    expect(parseDomainCsv('name,start,end\nCatalytic core,10,42\nTail,50,55')).toEqual([
      { start: 10, end: 42, name: 'Catalytic core', category: 'User domains', kind: 'domain', color: '#6366f1' },
      { start: 50, end: 55, name: 'Tail', category: 'User domains', kind: 'domain', color: '#6366f1' },
    ]);
  });
});

describe('protein mass tools and modification data', () => {
  it('calculates the [M+H]+ mass of GAGAGA as 403.1936', () => {
    const mass = monoisotopicMass(countAA('GAGAGA'));
    expect(esiChargeLadder(mass, 1)[0]!.mz).toBeCloseTo(403.1936, 4);
  });

  it('uses a 10 ppm window to match only the intended digest peptide', () => {
    const peptides = digest('GAGAGAKAAAAAK', PROTEASES.find(protease => protease.name === 'Trypsin')!);
    const observed = monoisotopicMass(countAA('GAGAGAK')) + 1.007276;
    const matches = matchPeptideMasses(peptides, [observed], 10, 'ppm', '[M+H]+');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.peptide.seq).toBe('GAGAGAK');
  });

  it('pins Unimod phosphorylation and carbamidomethyl deltas', () => {
    const phospho = modifications.values.find(modification => modification.id === 'phospho')!;
    const cam = modifications.values.find(modification => modification.id === 'carbamidomethyl')!;
    expect(phospho).toMatchObject({ unimod: 21, monoisotopic: 79.966331, average: 79.9799 });
    expect(cam).toMatchObject({ unimod: 4, monoisotopic: 57.021464, average: 57.0513 });
  });
});
