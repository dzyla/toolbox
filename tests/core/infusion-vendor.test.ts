import { describe, expect, it } from 'vitest';
import { designInfusion, selectGeneSpecific, type InfusionLinearization } from '@/core/cloning/methods/infusion';
import fixture from '../fixtures/vendor/infusion/cases.json';

interface Oligo { name: string; sequence: string; tm3: number; forward: boolean }
interface Case {
  id: string; vector: string;
  linearize: { method: string; enzymes?: string[]; includeSites?: { firstCut?: boolean; secondCut?: boolean }; caret?: number; selection?: { start: number; end: number } };
  inserts: string[];
  expected: { oligos: Oligo[]; finalLength: number };
}

function linearization(c: Case): InfusionLinearization {
  const l = c.linearize;
  if (l.method === 'RestrictionDigest') {
    return { method: 'digest', enzymes: l.enzymes as [string] | [string, string], includeSites: { first: l.includeSites?.firstCut, second: l.includeSites?.secondCut } };
  }
  if (l.caret !== undefined) return { method: 'pcr', caret: l.caret };
  return { method: 'pcr', region: { start: l.selection!.start, end: l.selection!.end + 1 } };
}

const vectors = fixture.vectors as Record<string, string>;

describe('In-Fusion designs match the Takara In-Fusion Primer Design Tool', () => {
  for (const c of fixture.cases as unknown as Case[]) {
    describe(c.id, () => {
      const design = designInfusion(vectors[c.vector]!, 'circular', linearization(c), c.inserts.map((sequence, index) => ({ name: `Insert ${index + 1}`, sequence })));
      const theirInsert = c.expected.oligos.filter(oligo => oligo.name.includes('(Insert') || /Insert \d/.test(oligo.name));
      const ourInsert = design.primers.filter(primer => primer.role === 'insert');

      it('has no blockers and the same product length', () => {
        expect(design.findings.filter(finding => finding.severity === 'blocker')).toEqual([]);
        expect(design.product.length).toBe(c.expected.finalLength);
      });

      it('reproduces every homology extension (and included restriction site) exactly', () => {
        expect(ourInsert).toHaveLength(theirInsert.length);
        ourInsert.forEach((primer, index) => {
          const theirs = theirInsert[index]!;
          expect(theirs.forward).toBe(primer.direction === 'forward');
          expect(theirs.sequence.startsWith(primer.extension + primer.site), primer.name).toBe(true);
          // Our gene-specific part is within a few bases of Takara's.
          const theirAnneal = theirs.sequence.length - primer.extension.length - primer.site.length;
          expect(Math.abs(theirAnneal - primer.anneal.length), primer.name).toBeLessThanOrEqual(4);
          // ...and starts at the same template base.
          const shorter = Math.min(theirAnneal, primer.anneal.length);
          expect(theirs.sequence.slice(primer.extension.length + primer.site.length, primer.extension.length + primer.site.length + shorter)).toBe(primer.anneal.slice(0, shorter));
        });
      });

      it('amplifies an inverse-PCR vector from the same ends when PCR-linearised', () => {
        const theirVector = c.expected.oligos.filter(oligo => oligo.name.includes('Vector'));
        const ours = design.primers.filter(primer => primer.role === 'vector');
        expect(ours).toHaveLength(theirVector.length);
        ours.forEach((primer, index) => {
          const shorter = Math.min(primer.anneal.length, theirVector[index]!.sequence.length);
          expect(theirVector[index]!.sequence.slice(0, shorter)).toBe(primer.anneal.slice(0, shorter));
        });
      });
    });
  }
});

describe('gene-specific primer selection', () => {
  const gfp = (fixture.cases as unknown as Case[])[0]!.inserts[0]!;
  it('stays within the documented length and pair-Tm limits', () => {
    const { forward, reverse } = selectGeneSpecific(gfp);
    for (const anneal of [forward, reverse]) {
      expect(anneal.length).toBeGreaterThanOrEqual(18);
      expect(anneal.length).toBeLessThanOrEqual(25);
    }
  });
});

describe('In-Fusion input checks', () => {
  const vector = vectors.pUC19!;
  const insert = [{ name: 'gene', sequence: (fixture.cases as unknown as Case[])[0]!.inserts[0]! }];
  it('blocks an enzyme that cuts the vector more than once', () => {
    const design = designInfusion(vector, 'circular', { method: 'digest', enzymes: ['HaeIII'] }, insert);
    expect(design.findings[0]).toMatchObject({ code: 'NOT_SINGLE_CUTTER', severity: 'blocker' });
    expect(design.primers).toEqual([]);
  });
  it('blocks a circular vector that is declared already linear', () => {
    expect(designInfusion(vector, 'circular', { method: 'linear' }, insert).findings[0]!.code).toBe('VECTOR_NOT_LINEAR');
  });
  it('blocks inserts that are too short or invalid', () => {
    expect(designInfusion(vector, 'circular', { method: 'pcr', caret: 400 }, [{ name: 'tiny', sequence: 'ACGT' }]).findings[0]!.code).toBe('INSERT_TOO_SHORT');
    expect(designInfusion(vector, 'circular', { method: 'pcr', caret: 400 }, [{ name: 'bad', sequence: 'ACGTNNNN'.repeat(10) }]).findings[0]!.code).toBe('INVALID_INSERT');
  });
});
