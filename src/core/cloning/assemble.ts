/* Joining molecules: sticky/blunt ligation and homology (overlap) assembly. */

import type { Annotation } from '@/core/plasmid/model';
import type { Finding } from './types';
import {
  annotationsInWindow,
  overhangSequence,
  shiftAnnotations,
  type Molecule,
  type MoleculeEnd,
} from './molecule';

export interface ProductJunction {
  index: number;
  leftName: string;
  rightName: string;
  /** Position in the product of the first base after the junction (0-based). */
  position: number;
  kind: 'sticky' | 'blunt' | 'overlap';
  /** Overhang or homology sequence (top-strand sense). */
  sequence: string;
  description: string;
}

export interface JoinResult {
  product: Molecule | null;
  junctions: ProductJunction[];
  findings: Finding[];
}

function blocker(code: string, message: string, junctionIndex?: number): Finding {
  return { code, severity: 'blocker', message, junctionIndex };
}

function endLabel(end: MoleculeEnd, overhang: string): string {
  if (end.kind === 'blunt') return `blunt (${end.origin})`;
  return `${end.origin} ${end.kind === "5'" ? '5′' : '3′'}-${overhang}`;
}

/** Can the right end of `left` ligate to the left end of `right`? */
export function endsCompatible(left: Molecule, right: Molecule): { compatible: boolean; reason?: string } {
  const a = left.right;
  const b = right.left;
  if (!a || !b) return { compatible: false, reason: 'Circular molecules have no free ends.' };
  if (a.kind === 'blunt' && b.kind === 'blunt') return { compatible: true };
  if (a.kind === 'blunt' || b.kind === 'blunt') return { compatible: false, reason: 'A sticky end cannot ligate to a blunt end without blunting it first.' };
  if (a.kind !== b.kind) return { compatible: false, reason: `A 5′ overhang cannot pair with a 3′ overhang.` };
  if (a.length !== b.length) return { compatible: false, reason: `Overhang lengths differ (${a.length} vs ${b.length} nt).` };
  const x = overhangSequence(left, 'right');
  const y = overhangSequence(right, 'left');
  if (x !== y) return { compatible: false, reason: `Overhangs do not pair (${x} vs ${y}).` };
  return { compatible: true };
}

function ligationFinding(left: Molecule, right: Molecule, index: number): Finding[] {
  const a = left.right!;
  const b = right.left!;
  // Each junction has two nicks; T4 ligase needs a 5′ phosphate at a nick. One sealed strand is enough to transform.
  if (!a.phosphorylated && !b.phosphorylated) {
    return [blocker('NO_5_PHOSPHATE', `Junction ${index + 1} (${left.name} → ${right.name}) has no 5′ phosphate on either strand, so it cannot be ligated. Phosphorylate the insert (T4 PNK or phosphorylated primers) or skip dephosphorylation.`, index)];
  }
  return [];
}

/**
 * Ligate linear molecules in order. When `circularize` is true the last molecule's
 * right end is joined to the first molecule's left end.
 */
export function ligate(parts: Molecule[], circularize: boolean, name = 'Ligation product'): JoinResult {
  const findings: Finding[] = [];
  const junctions: ProductJunction[] = [];
  if (!parts.length) return { product: null, junctions, findings: [blocker('NO_PARTS', 'Nothing to ligate.')] };
  if (parts.some(part => part.topology !== 'linear')) {
    return { product: null, junctions, findings: [blocker('CIRCULAR_PART', 'Only linear molecules can be ligated; digest or amplify circular sources first.')] };
  }
  const pairs = parts.map((part, index) => [part, parts[index + 1] ?? (circularize ? parts[0]! : null)] as const)
    .filter((pair): pair is readonly [Molecule, Molecule] => pair[1] !== null);
  pairs.forEach(([left, right], index) => {
    const check = endsCompatible(left, right);
    if (!check.compatible) {
      findings.push(blocker('INCOMPATIBLE_ENDS', `Junction ${index + 1} (${left.name} → ${right.name}): ${check.reason}`, index));
    } else {
      findings.push(...ligationFinding(left, right, index));
    }
  });
  if (findings.some(finding => finding.severity === 'blocker')) return { product: null, junctions, findings };

  let sequence = parts[0]!.sequence;
  let annotations: Annotation[] = [...parts[0]!.annotations];
  for (let index = 1; index < parts.length; index++) {
    const left = parts[index - 1]!;
    const part = parts[index]!;
    const overlap = part.left!.length;
    const offset = sequence.length - overlap;
    junctions.push({
      index: index - 1,
      leftName: left.name,
      rightName: part.name,
      position: offset + overlap,
      kind: part.left!.kind === 'blunt' ? 'blunt' : 'sticky',
      sequence: overhangSequence(part, 'left'),
      description: `${endLabel(left.right!, overhangSequence(left, 'right'))} + ${endLabel(part.left!, overhangSequence(part, 'left'))}`,
    });
    sequence = sequence.slice(0, offset) + part.sequence;
    annotations = [...annotations, ...shiftAnnotations(part.annotations, offset)];
  }

  if (!circularize) {
    return {
      product: { name, sequence, topology: 'linear', left: parts[0]!.left, right: parts[parts.length - 1]!.right, annotations },
      junctions,
      findings,
    };
  }
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const closing = first.left!.length;
  const length = sequence.length - closing;
  junctions.push({
    index: parts.length - 1,
    leftName: last.name,
    rightName: first.name,
    position: 0,
    kind: first.left!.kind === 'blunt' ? 'blunt' : 'sticky',
    sequence: overhangSequence(first, 'left'),
    description: `${endLabel(last.right!, overhangSequence(last, 'right'))} + ${endLabel(first.left!, overhangSequence(first, 'left'))}`,
  });
  return {
    product: {
      name,
      sequence: sequence.slice(0, length),
      topology: 'circular',
      annotations: annotationsInWindow(annotations, sequence.length, false, 0, length),
    },
    junctions,
    findings,
  };
}

/**
 * Homology assembly: each part's 3′ end already shares `overlaps[i]` nt with the next
 * part's 5′ end (as after PCR with tailed primers). Joins without duplicating the overlap.
 */
export function assembleByOverlap(parts: Array<{ name: string; sequence: string; annotations?: Annotation[] }>, overlaps: number[], circularize: boolean, name = 'Assembly product'): JoinResult {
  const findings: Finding[] = [];
  const junctions: ProductJunction[] = [];
  const count = circularize ? parts.length : parts.length - 1;
  for (let index = 0; index < count; index++) {
    const left = parts[index]!;
    const right = parts[(index + 1) % parts.length]!;
    const n = overlaps[index] ?? 0;
    if (n <= 0 || left.sequence.slice(-n) !== right.sequence.slice(0, n)) {
      findings.push(blocker('OVERLAP_MISMATCH', `Junction ${index + 1} (${left.name} → ${right.name}): the ends do not share the expected ${n} nt overlap.`, index));
    }
  }
  if (findings.length) return { product: null, junctions, findings };

  let sequence = parts[0]!.sequence;
  let annotations: Annotation[] = [...(parts[0]!.annotations ?? [])];
  for (let index = 1; index < parts.length; index++) {
    const n = overlaps[index - 1]!;
    const offset = sequence.length - n;
    junctions.push({
      index: index - 1,
      leftName: parts[index - 1]!.name,
      rightName: parts[index]!.name,
      position: offset,
      kind: 'overlap',
      sequence: parts[index]!.sequence.slice(0, n),
      description: `${n} bp homology`,
    });
    sequence = sequence.slice(0, offset) + parts[index]!.sequence;
    annotations = [...annotations, ...shiftAnnotations(parts[index]!.annotations ?? [], offset)];
  }
  if (!circularize) return { product: { name, sequence, topology: 'linear', annotations }, junctions, findings };

  const n = overlaps[parts.length - 1]!;
  const length = sequence.length - n;
  junctions.push({
    index: parts.length - 1,
    leftName: parts[parts.length - 1]!.name,
    rightName: parts[0]!.name,
    position: length,
    kind: 'overlap',
    sequence: parts[0]!.sequence.slice(0, n),
    description: `${n} bp homology`,
  });
  return {
    product: { name, sequence: sequence.slice(0, length), topology: 'circular', annotations: annotationsInWindow(annotations, sequence.length, false, 0, length) },
    junctions,
    findings,
  };
}
