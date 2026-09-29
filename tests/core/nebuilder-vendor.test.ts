import { describe, expect, it } from 'vitest';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { designNebuilder, type NebuilderFragment } from '@/core/cloning/methods/nebuilder';
import reference from '../fixtures/vendor/nebuilder/assemblies.json';

interface FixtureFragment { name: string; seq?: string; preset?: string; type: 'pcr' | 'redig'; topology: 'linear' | 'circular'; isVectorBackbone?: boolean; leftREName?: string; rightREName?: string }
interface FixtureCase {
  id: string;
  settings: { polymerase: string; minOverlap: number; minLen: number; maxDiff: number; circular: boolean };
  fragments: FixtureFragment[];
  expected: { primers: Array<{ name: string; overlap: string; spacer: string; anneal: string; tm: number; ta: number; gc: number; gc3: number }>; product: string };
}

const PRESETS = Object.fromEntries(PRESET_PLASMIDS.map(plasmid => [plasmid.id, plasmid.seq]));

function toFragment(fragment: FixtureFragment): NebuilderFragment {
  return {
    name: fragment.name,
    sequence: fragment.seq ?? PRESETS[fragment.preset!]!,
    topology: fragment.topology,
    kind: fragment.type === 'redig' ? 'digest' : 'pcr',
    isVectorBackbone: fragment.isVectorBackbone,
    leftEnzyme: fragment.leftREName,
    rightEnzyme: fragment.rightREName,
  };
}

describe('NEBuilder designs match NEBuilder Assembly Tool v2.11.2', () => {
  for (const testCase of (reference.cases as unknown as FixtureCase[])) {
    it(testCase.id, () => {
      const design = designNebuilder(testCase.fragments.map(toFragment), {
        polymeraseId: testCase.settings.polymerase,
        minOverlap: testCase.settings.minOverlap,
        minPrimerLength: testCase.settings.minLen,
        maxTmDifference: testCase.settings.maxDiff,
        circularize: testCase.settings.circular,
      });
      expect(design.findings.filter(finding => finding.severity === 'blocker')).toEqual([]);
      expect(design.primers.map(primer => ({ name: primer.name, overlap: primer.overlap, spacer: primer.spacer, anneal: primer.anneal, tm: primer.tm, ta: primer.ta, gc: primer.gc, gc3: primer.annealGc })))
        .toEqual(testCase.expected.primers);
      expect(design.product).toBe(testCase.expected.product);
    });
  }
});
