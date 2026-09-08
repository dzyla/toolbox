import type { PlasmidDocument } from '@/core/plasmid/model';
import type { ConstructPlan, DesignFragment, Finding, JunctionEvidence } from './types';

const IUPAC_DNA = /^[ACGTRYSWKMBDHVN]+$/i;
const COMPLEMENT: Record<string, string> = {
  A: 'T', C: 'G', G: 'C', T: 'A', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K',
  B: 'V', D: 'H', H: 'D', V: 'B', N: 'N',
};

function normaliseDna(raw: string): string {
  return raw.replace(/\s/g, '').toUpperCase();
}

function blocker(code: string, message: string, fragmentId?: string, junctionIndex?: number): Finding {
  return { code, severity: 'blocker', message, fragmentId, junctionIndex };
}

export function orientFragment(fragment: Pick<DesignFragment, 'sourceSequence' | 'orientation'>): string {
  const sequence = normaliseDna(fragment.sourceSequence);
  if (fragment.orientation === 'forward') return sequence;
  return [...sequence].reverse().map(base => COMPLEMENT[base] ?? 'N').join('');
}

function expectedJunction(
  junctions: JunctionEvidence[],
  leftFragmentId: string,
  rightFragmentId: string,
): { junction: JunctionEvidence; index: number } | undefined {
  const index = junctions.findIndex(junction =>
    junction.leftFragmentId === leftFragmentId && junction.rightFragmentId === rightFragmentId
  );
  return index === -1 ? undefined : { junction: junctions[index]!, index };
}

function validateJunction(
  junction: JunctionEvidence,
  junctionIndex: number,
  fragmentIds: Set<string>,
): Finding[] {
  const findings: Finding[] = [];
  if (!fragmentIds.has(junction.leftFragmentId) || !fragmentIds.has(junction.rightFragmentId)) {
    findings.push(blocker('UNKNOWN_JUNCTION_FRAGMENT', 'A junction references a fragment that is not part of this construct.', undefined, junctionIndex));
  }
  if (!Number.isInteger(junction.expectedOverlapLength) || junction.expectedOverlapLength < 0) {
    findings.push(blocker('INVALID_OVERLAP_LENGTH', 'A junction overlap length must be a non-negative integer.', undefined, junctionIndex));
  }
  if (!junction.validated) {
    findings.push(blocker('UNRESOLVED_JUNCTION', 'A junction has not been validated.', undefined, junctionIndex));
  }
  if (junction.expectedOverlapLength > 0) {
    const overlap = normaliseDna(junction.overlap);
    if (overlap.length !== junction.expectedOverlapLength ||
        normaliseDna(junction.observedLeftTerminal) !== overlap ||
        normaliseDna(junction.observedRightTerminal) !== overlap) {
      findings.push(blocker('OVERLAP_MISMATCH', 'The declared overlap is not an exact match at both sides of the junction.', undefined, junctionIndex));
    }
  }
  return findings;
}

function productDocument(plan: Omit<ConstructPlan, 'status' | 'product'>, sequence: string): PlasmidDocument {
  return {
    id: 'cloning-product',
    name: 'Sequence-validated construct',
    sequence,
    topology: plan.topology,
    annotations: [],
    description: `Sequence-validated ${plan.method} construct.`,
    provenance: {
      format: 'fasta',
      parserVersion: 'cloning-construct-1',
      warnings: [],
    },
  };
}

export function finalizeConstructPlan(input: Omit<ConstructPlan, 'status' | 'product'>): ConstructPlan {
  const findings = [...input.findings];
  const ids = new Set<string>();
  const fragments = input.fragments.map(fragment => {
    const sourceSequence = normaliseDna(fragment.sourceSequence);
    if (!fragment.id.trim()) findings.push(blocker('MISSING_FRAGMENT_ID', 'Every fragment needs a stable ID.'));
    else if (ids.has(fragment.id)) findings.push(blocker('DUPLICATE_FRAGMENT_ID', `Fragment ID "${fragment.id}" is used more than once.`, fragment.id));
    else ids.add(fragment.id);
    if (!sourceSequence || !IUPAC_DNA.test(sourceSequence)) {
      findings.push(blocker('INVALID_FRAGMENT_SEQUENCE', `Fragment "${fragment.name || fragment.id}" is empty or contains invalid DNA bases.`, fragment.id));
    }
    return { ...fragment, sourceSequence, orientedSequence: orientFragment({ sourceSequence, orientation: fragment.orientation }) };
  });

  if (fragments.length < 2) findings.push(blocker('INSUFFICIENT_FRAGMENTS', 'A construct requires at least two fragments.'));
  input.junctions.forEach((junction, index) => findings.push(...validateJunction(junction, index, ids)));

  let sequence = fragments[0]?.orientedSequence ?? '';
  for (let index = 1; index < fragments.length; index++) {
    const previous = fragments[index - 1]!;
    const current = fragments[index]!;
    const evidence = expectedJunction(input.junctions, previous.id, current.id);
    if (!evidence) {
      findings.push(blocker('MISSING_JUNCTION', `No junction connects ${previous.name} to ${current.name}.`, undefined, index - 1));
      continue;
    }
    const overlapLength = evidence.junction.expectedOverlapLength;
    sequence += current.orientedSequence.slice(overlapLength);
  }

  if (input.topology === 'circular' && fragments.length > 1) {
    const closure = expectedJunction(input.junctions, fragments[fragments.length - 1]!.id, fragments[0]!.id);
    if (!closure) findings.push(blocker('MISSING_CIRCULAR_CLOSURE', 'A circular construct needs a validated final-to-first junction.'));
  }

  const blocked = findings.some(finding => finding.severity === 'blocker');
  const planBase = { ...input, fragments, findings };
  return blocked
    ? { ...planBase, status: 'blocked' }
    : { ...planBase, status: 'sequence-validated', product: productDocument(planBase, sequence) };
}
