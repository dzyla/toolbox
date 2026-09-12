import type { SequenceKind } from './index';

export interface SequenceTypeHint {
  kind: SequenceKind | null;
  confidence: 'likely' | 'possible' | 'uncertain';
  label: string;
}

const NUCLEIC = 'ACGTUNRYSWKMBDHV';
const PROTEIN = 'ACDEFGHIKLMNPQRSTVWYBXZJUO';

/** Advisory only: callers retain ownership of the selected sequence kind. */
export function sequenceTypeHint(raw: string): SequenceTypeHint {
  const sequence = raw.replace(/\r/g, '').split('\n').filter(line => !line.trim().startsWith('>')).join('').toUpperCase().replace(/[^A-Z]/g, '');
  if (!sequence) return { kind: null, confidence: 'uncertain', label: 'Enter a sequence to assess its alphabet' };
  const hasT = sequence.includes('T');
  const hasU = sequence.includes('U');
  if (hasT && hasU) return { kind: null, confidence: 'uncertain', label: 'Contains both T and U; choose DNA or RNA explicitly' };
  const nucleicOnly = [...sequence].every(letter => NUCLEIC.includes(letter));
  if (nucleicOnly) {
    const ambiguous = [...sequence].some(letter => !'ACGTU'.includes(letter));
    if (ambiguous) return { kind: hasU ? 'RNA' : 'DNA', confidence: 'uncertain', label: `Possibly ${hasU ? 'RNA' : 'DNA'}; IUPAC ambiguity codes present` };
    return { kind: hasU ? 'RNA' : 'DNA', confidence: 'possible', label: `Possibly ${hasU ? 'RNA' : 'DNA'}` };
  }
  if ([...sequence].every(letter => PROTEIN.includes(letter))) return { kind: 'protein', confidence: 'likely', label: 'Likely protein' };
  return { kind: null, confidence: 'uncertain', label: 'Mixed or unsupported letters; choose the sequence type explicitly' };
}
