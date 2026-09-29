import { describe, expect, it } from 'vitest';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { cutSites, digest, findEnzyme, cutCounts } from '@/core/cloning/digest';
import { assembleByOverlap, endsCompatible, ligate } from '@/core/cloning/assemble';
import {
  bluntEnds, dephosphorylate, flipMolecule, overhangSequence, phosphorylate,
  type Molecule,
} from '@/core/cloning/molecule';
import type { Annotation } from '@/core/plasmid/model';
import reference from '../fixtures/cloning/biopython-digest.json';

const PRESETS = Object.fromEntries(PRESET_PLASMIDS.map(plasmid => [plasmid.id, plasmid.seq]));

function feature(id: string, start: number, end: number, strand: 1 | -1 = 1): Annotation {
  return { id, name: id, type: 'misc_feature', location: { segments: [{ start, end }], strand }, qualifiers: {}, source: 'manual' };
}

function circular(sequence: string, annotations: Annotation[] = []): Molecule {
  return { name: 'vector', sequence, topology: 'circular', annotations };
}

function linear(name: string, sequence: string, annotations: Annotation[] = []): Molecule {
  const end = { kind: 'blunt' as const, length: 0, phosphorylated: false, origin: 'PCR' };
  return { name, sequence, topology: 'linear', left: end, right: end, annotations };
}

describe('digest matches Biopython Bio.Restriction', () => {
  for (const testCase of reference.cases) {
    it(`${testCase.plasmid} (${testCase.linear ? 'linear' : 'circular'})`, () => {
      const sequence = PRESETS[testCase.plasmid]!;
      for (const [name, positions] of Object.entries(testCase.cuts)) {
        const enzyme = findEnzyme(name)!;
        expect(enzyme, name).toBeDefined();
        const sites = cutSites({ sequence, topology: testCase.linear ? 'linear' : 'circular' }, [enzyme]);
        // Biopython reports the first nucleotide after the top-strand cut (1-based); a cut at the origin is reported as N+1.
        const ours = sites.map(site => (site.cutTop === 0 ? sequence.length : site.cutTop) + 1).sort((a, b) => a - b);
        expect(ours, name).toEqual([...positions].sort((a, b) => a - b));
      }
    });
  }
});

describe('digest fragments and ends', () => {
  it('linearises a circular plasmid at a single EcoRI site with 5′ AATT on both ends', () => {
    const vector = circular('CCCCCGAATTCGGGGGTTTTTAAAAA');
    const { fragments } = digest(vector, ['EcoRI']);
    expect(fragments).toHaveLength(1);
    const cut = fragments[0]!.molecule;
    expect(cut.sequence).toBe('AATTCGGGGGTTTTTAAAAACCCCCGAATT');
    expect(cut.left).toMatchObject({ kind: "5'", length: 4, phosphorylated: true, origin: 'EcoRI' });
    expect(overhangSequence(cut, 'left')).toBe('AATT');
    expect(overhangSequence(cut, 'right')).toBe('AATT');
    const religated = ligate([cut], true);
    expect(religated.product!.sequence).toBe('AATTCGGGGGTTTTTAAAAACCCCCG');
    expect(religated.product!.sequence).toHaveLength(vector.sequence.length);
  });

  it('gives 3′ overhangs for KpnI', () => {
    const { fragments } = digest(circular('AAAAAGGTACCTTTTTCCCCC'), ['KpnI']);
    const cut = fragments[0]!.molecule;
    expect(cut.left!.kind).toBe("3'");
    expect(overhangSequence(cut, 'left')).toBe('GTAC');
    expect(cut.sequence.startsWith('GTACC')).toBe(true);
  });

  it('cuts a Type IIS site found on the bottom strand at the right place', () => {
    // BsaI GGTCTC(1/5); reverse-strand site GAGACC cuts upstream.
    const sequence = 'TTTTTTTTTTAAAACGAGACCTTTTTTTTTT';
    const [site] = cutSites({ sequence, topology: 'linear' }, [findEnzyme('BsaI')!]);
    expect(site).toMatchObject({ strand: -1, cutTop: 10, cutBottom: 14 });
    const { fragments } = digest(linear('x', sequence), ['BsaI']);
    expect(fragments).toHaveLength(2);
    expect(overhangSequence(fragments[1]!.molecule, 'left')).toBe('AAAA');
  });

  it('ignores a linear-end site whose cut falls outside the molecule', () => {
    const sequence = 'AAAAAAAAAAGGTCTC';
    expect(cutSites({ sequence, topology: 'linear' }, [findEnzyme('BsaI')!])).toHaveLength(0);
  });

  it('finds a site spanning the origin of a circular plasmid', () => {
    const sequence = 'ATTCAAAAAAAAAAAAAAAAGA';
    const { fragments } = digest(circular(sequence), ['EcoRI']);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.molecule.sequence).toBe('AATTCAAAAAAAAAAAAAAAAGAATT');
  });

  it('keeps features inside a fragment and drops features cut through', () => {
    const vector = circular('CCCCCGAATTCGGGGGTTTTTGGATCCAAAAA', [feature('inside', 12, 20), feature('cut', 2, 8)]);
    const { fragments } = digest(vector, ['EcoRI', 'BamHI']);
    const small = fragments.find(fragment => fragment.leftEnzyme === 'EcoRI')!;
    expect(small.molecule.annotations.map(annotation => annotation.id)).toEqual(['inside']);
    expect(small.molecule.annotations[0]!.location.segments[0]).toEqual({ start: 6, end: 14 });
  });

  it('counts single cutters', () => {
    const counts = cutCounts({ sequence: PRESETS.puc19!, topology: 'circular' });
    expect(counts.get('EcoRI')).toBe(1);
    expect(counts.get('HaeIII')).toBe(11);
  });
});

describe('ligation', () => {
  const vector = circular('CCCCCGAATTCGGGGGTTTTTGGATCCAAAAA');
  const backbone = digest(vector, ['EcoRI', 'BamHI']).fragments.find(fragment => fragment.leftEnzyme === 'BamHI');
  const insert = digest(linear('insert', 'TTGAATTCATGAAACCCGGGTAAGGATCCTT'), ['EcoRI', 'BamHI']).fragments[1]!.molecule;

  it('clones an EcoRI–BamHI insert directionally', () => {
    const result = ligate([backbone!.molecule, insert], true, 'pClone');
    expect(result.findings).toEqual([]);
    const product = result.product!;
    expect(product.sequence).toHaveLength(37);
    expect(product.sequence + product.sequence).toContain('GAATTCATGAAACCCGGGTAAGGATCC');
    expect(result.junctions.map(junction => junction.sequence)).toEqual(['AATT', 'GATC']);
  });

  it('blocks the reversed insert because the ends no longer pair', () => {
    const result = ligate([backbone!.molecule, flipMolecule(insert)], true);
    expect(result.product).toBeNull();
    expect(result.findings[0]!.code).toBe('INCOMPATIBLE_ENDS');
  });

  it('treats BamHI and BglII ends as compatible', () => {
    const bgl = digest(linear('b', 'AAAAAAAGATCTAAAAAAA'), ['BglII']).fragments[1]!.molecule;
    const bam = digest(linear('a', 'CCCCCCCGGATCCCCCCCC'), ['BamHI']).fragments[0]!.molecule;
    expect(endsCompatible(bam, bgl).compatible).toBe(true);
  });

  it('fills in 5′ overhangs and chews back 3′ overhangs to blunt ends', () => {
    const eco = digest(linear('e', 'AAAAAAAGAATTCAAAAAA'), ['EcoRI']).fragments[0]!.molecule;
    const filled = bluntEnds(eco);
    expect(filled.right!.kind).toBe('blunt');
    expect(filled.sequence).toBe('AAAAAAAGAATT');
    const kpn = digest(linear('k', 'AAAAAAAGGTACCAAAAAA'), ['KpnI']).fragments[0]!.molecule;
    const chewed = bluntEnds(kpn);
    expect(chewed.sequence).toBe('AAAAAAAG');
  });

  it('refuses to ligate an unphosphorylated PCR insert into a dephosphorylated vector', () => {
    const open = dephosphorylate(bluntEnds(digest(vector, ['EcoRI']).fragments[0]!.molecule));
    const pcr = linear('pcr', 'ATGAAATAA');
    const blocked = ligate([open, pcr], true);
    expect(blocked.findings.map(finding => finding.code)).toContain('NO_5_PHOSPHATE');
    const ok = ligate([open, phosphorylate(pcr)], true);
    expect(ok.product).not.toBeNull();
  });
});

describe('overlap assembly', () => {
  it('joins parts on shared homology without duplicating it and carries features', () => {
    const result = assembleByOverlap([
      { name: 'vec', sequence: 'GGGGGAAAAACCCCC', annotations: [feature('v', 0, 5)] },
      { name: 'ins', sequence: 'CCCCCTTTTTGGGGG', annotations: [feature('i', 5, 10)] },
    ], [5, 5], true);
    expect(result.findings).toEqual([]);
    expect(result.product!.sequence).toBe('GGGGGAAAAACCCCCTTTTT');
    expect(result.product!.annotations.find(annotation => annotation.id === 'i')!.location.segments[0]).toEqual({ start: 15, end: 20 });
  });

  it('reports a junction whose ends do not overlap', () => {
    const result = assembleByOverlap([
      { name: 'a', sequence: 'AAAAACCCCC' },
      { name: 'b', sequence: 'GGGGGTTTTT' },
    ], [5], false);
    expect(result.findings[0]!.code).toBe('OVERLAP_MISMATCH');
  });
});
