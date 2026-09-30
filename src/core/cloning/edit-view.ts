/* Before/after view of a sequence edit (insert, replace, delete) and where its primers sit. */

import type { SdmDesign } from './methods/basechanger';

export interface EditView {
  kind: 'insert' | 'replace' | 'delete';
  beforeStart: number;
  afterStart: number;
  before: { left: string; removed: string; right: string };
  after: { left: string; added: string; right: string };
  removedCount: number;
  addedCount: number;
  delta: number;
  primers: Array<{ name: string; strand: 'fwd' | 'rev'; start: number; length: number; tailLength: number }>;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function sdmEditView(plasmid: string, design: SdmDesign, context = 30): EditView {
  const sequence = plasmid.replace(/\s/g, '').toUpperCase();
  const n = sequence.length;
  const { start, end, replacement } = design.edit;
  const from = Math.max(0, start - context);
  const to = Math.min(n, end + context);
  const removedCount = end - start;
  const addedCount = replacement.length;
  const left = sequence.slice(from, start);
  const right = sequence.slice(end, to);
  return {
    kind: removedCount === 0 ? 'insert' : addedCount === 0 ? 'delete' : 'replace',
    beforeStart: from + 1,
    afterStart: from + 1,
    before: { left, removed: sequence.slice(start, end), right },
    after: { left, added: replacement, right },
    removedCount, addedCount, delta: addedCount - removedCount,
    primers: [
      { name: design.forward.name, strand: 'fwd', start: mod(end, n), length: design.forward.anneal.length, tailLength: design.forward.tail.length },
      { name: design.reverse.name, strand: 'rev', start: mod(start - design.reverse.anneal.length, n), length: design.reverse.anneal.length, tailLength: design.reverse.tail.length },
    ],
  };
}
