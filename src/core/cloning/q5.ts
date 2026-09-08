import {
  cleanDna,
  designFlexibleMutagenesis,
  GENETIC_CODE,
  PREFERRED_CODONS_ECOLI,
} from '@/core/mutagenesis';
import type { ConstructPlan, Finding } from './types';
import type { CloningSource } from './sources';

export type CodonStrategy = 'ecoli-max-usage' | 'maximum-parsimony';
export type Q5Edit =
  | { kind: 'amino-acid'; expression: string; orfStart: number; strategy: CodonStrategy }
  | { kind: 'replace'; start: number; end: number; replacement: string };

export interface Q5Options {
  partial: boolean;
  minPrimerLength: number;
  minAnnealTm: number;
  confineChangesToFivePrimeTails: boolean;
  constructName: string;
}

export interface Q5Primer {
  name: string;
  direction: 'forward' | 'reverse';
  sequence: string;
  annealTm: number;
  length: number;
}

export interface Q5Plan extends ConstructPlan {
  primers: Q5Primer[];
  edits: Q5Edit[];
}

function finding(code: string, message: string): Finding {
  return { code, severity: 'blocker', message };
}

function parsimonyCodon(wildType: string, aminoAcid: string): string {
  const candidates = Object.entries(GENETIC_CODE)
    .filter(([, aa]) => aa === aminoAcid)
    .map(([codon]) => codon);
  return candidates.sort((a, b) => {
    const aDistance = [...a].filter((base, index) => base !== wildType[index]).length;
    const bDistance = [...b].filter((base, index) => base !== wildType[index]).length;
    return aDistance - bDistance || a.localeCompare(b);
  })[0] ?? '';
}

function emptyPlan(source: CloningSource, edits: Q5Edit[], findings: Finding[]): Q5Plan {
  return {
    method: 'q5-sdm', status: 'blocked', topology: source.document.topology,
    fragments: [], junctions: [], findings, provenance: { workflow: 'q5-sdm' }, primers: [], edits,
  };
}

export function planQ5Mutagenesis(source: CloningSource, edits: Q5Edit[], options: Q5Options): Q5Plan {
  const sourceSequence = cleanDna(source.document.sequence);
  const findings: Finding[] = [];
  if (edits.length !== 1) return emptyPlan(source, edits, [finding('Q5_SINGLE_EDIT_REQUIRED', 'Q5 planning currently requires one explicit edit per reaction.')]);
  const edit = edits[0]!;
  let start = 0;
  let replacedLength = 0;
  let replacement = '';
  let label = '';

  if (edit.kind === 'amino-acid') {
    const parsed = edit.expression.trim().toUpperCase().match(/^([ACDEFGHIKLMNPQRSTVWY*])(\d+)([ACDEFGHIKLMNPQRSTVWY*])(?::([ACGT]{3}))?$/);
    if (!parsed) return emptyPlan(source, edits, [finding('INVALID_AMINO_ACID_MUTATION', 'Use mutation syntax such as S2T or S2G:GGG.')]);
    const [, wildTypeAa, positionText, mutantAa, explicitCodon] = parsed;
    const position = Number(positionText);
    start = edit.orfStart - 1 + (position - 1) * 3;
    replacedLength = 3;
    const wildTypeCodon = sourceSequence.slice(start, start + 3);
    if (GENETIC_CODE[wildTypeCodon] !== wildTypeAa) {
      return emptyPlan(source, edits, [finding('WILDTYPE_AMINO_ACID_MISMATCH', `Expected ${wildTypeAa}${position}, but the source encodes ${GENETIC_CODE[wildTypeCodon] ?? 'unknown'}.`)]);
    }
    replacement = explicitCodon ?? (edit.strategy === 'maximum-parsimony'
      ? parsimonyCodon(wildTypeCodon, mutantAa!)
      : PREFERRED_CODONS_ECOLI[mutantAa!] ?? '');
    label = `${wildTypeAa}${position}${mutantAa}`;
  } else {
    start = edit.start - 1;
    replacedLength = edit.end - edit.start + 1;
    replacement = cleanDna(edit.replacement);
    label = `edit_${edit.start}_${edit.end}`;
  }

  if (start < 0 || start + replacedLength > sourceSequence.length || !replacement) {
    return emptyPlan(source, edits, [finding('INVALID_EDIT_BOUNDARY', 'The requested mutation does not fit within the supplied sequence.')]);
  }
  if (options.partial && (start < 35 || sourceSequence.length - (start + replacedLength) < 25)) {
    return emptyPlan(source, edits, [finding('INSUFFICIENT_PARTIAL_FLANKS', 'Partial sequences require at least 35 nt upstream and 25 nt downstream of the edit.')]);
  }

  const design = designFlexibleMutagenesis(sourceSequence, start, replacedLength, replacement, Math.max(55, options.minAnnealTm), options.constructName, label);
  const product = {
    ...source.document,
    id: `${source.id}-q5-product`,
    name: `${source.name} ${label}`,
    sequence: design.mutantPlasmidSeq,
    annotations: source.document.annotations,
    description: `Sequence-validated Q5 mutation ${label}.`,
    provenance: { ...source.document.provenance, warnings: source.document.provenance.warnings },
  };
  return {
    method: 'q5-sdm', status: 'sequence-validated', topology: source.document.topology,
    fragments: [], junctions: [], findings, provenance: { workflow: 'q5-sdm', partial: options.partial },
    product, edits,
    primers: [
      { name: design.forwardPrimer.name, direction: 'forward', sequence: design.forwardPrimer.sequence, annealTm: design.forwardPrimer.tm, length: design.forwardPrimer.length },
      { name: design.reversePrimer.name, direction: 'reverse', sequence: design.reversePrimer.sequence, annealTm: design.reversePrimer.tm, length: design.reversePrimer.length },
    ],
  };
}
