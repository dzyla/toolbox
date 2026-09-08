import { type Annotation, type PlasmidDocument, validateDocument } from './model';
import type { Location, Segment, Strand } from './coordinates';
import { parseSnapGene } from './snapgene';

export interface ImportResult { document: PlasmidDocument }

function parseLocation(raw: string): Location {
  let text = raw.replace(/\s+/g, '');
  let strand: Strand = 1;
  if (text.startsWith('complement(') && text.endsWith(')')) {
    strand = -1;
    text = text.slice(11, -1);
  }
  if ((text.startsWith('join(') || text.startsWith('order(')) && text.endsWith(')')) text = text.slice(text.indexOf('(') + 1, -1);
  const segments: Segment[] = text.split(',').map(part => {
    const match = part.match(/^(\d+)\.\.(\d+)$/);
    if (!match) throw new Error(`Unsupported GenBank location: ${raw}`);
    const start = Number(match[1]); const end = Number(match[2]);
    if (start <= 0 || end < start) throw new Error(`Invalid GenBank location: ${raw}`);
    return { start: start - 1, end };
  });
  return { strand, segments };
}

function importFasta(text: string): ImportResult {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0]?.startsWith('>') ? lines.shift()!.slice(1).trim() : 'Untitled sequence';
  const sequence = lines.join('').replace(/\s/g, '').toUpperCase();
  if (!sequence) throw new Error('FASTA record contains no sequence.');
  return { document: { id: 'imported-fasta', name: header || 'Untitled sequence', sequence, topology: 'circular', annotations: [], provenance: { format: 'fasta', parserVersion: 'plasmid-import-1', warnings: [] } } };
}

function importGenBank(text: string): ImportResult {
  const lines = text.split(/\r?\n/);
  const locus = lines.find(line => line.startsWith('LOCUS'));
  if (!locus) throw new Error('GenBank record is missing LOCUS.');
  const name = locus.trim().split(/\s+/)[1] || 'Untitled sequence';
  const topology = /\bcircular\b/i.test(locus) ? 'circular' : 'linear';
  const origin = lines.findIndex(line => line.startsWith('ORIGIN'));
  if (origin < 0) throw new Error('GenBank record is missing ORIGIN sequence data.');
  const sequenceLines = lines.slice(origin + 1).filter(line => !line.startsWith('//'));
  const bases = sequenceLines.join('').replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!bases) throw new Error('GenBank record contains no sequence.');
  const featureStart = lines.findIndex(line => line.startsWith('FEATURES'));
  const annotations: Annotation[] = [];
  let current: Annotation | null = null;
  let continuation: { annotation: Annotation; key: string; valueIndex: number } | null = null;
  if (featureStart >= 0) {
    for (const line of lines.slice(featureStart + 1, origin)) {
      const feature = line.match(/^\s{5}(\S+)\s+(.+)$/);
      if (feature) {
        current = { id: `feature-${annotations.length + 1}`, name: feature[1]!, type: feature[1]!, location: parseLocation(feature[2]!), qualifiers: {}, source: 'imported', confidence: 'annotated' };
        annotations.push(current); continuation = null; continue;
      }
      const qualifier = line.match(/^\s+\/([^=\s]+)(?:=(.*))?$/);
      if (qualifier && current) {
        const [, key, rawValue = ''] = qualifier;
        const quoted = rawValue.startsWith('"');
        const closes = quoted && rawValue.length > 1 && rawValue.endsWith('"');
        const value = quoted ? rawValue.slice(1, closes ? -1 : undefined) : rawValue;
        current.qualifiers[key!] = [...(current.qualifiers[key!] || []), value];
        continuation = quoted && !closes ? { annotation: current, key: key!, valueIndex: current.qualifiers[key!]!.length - 1 } : null;
        if (/^apeinfo_(?:fwd|rev)color$/i.test(key!)) current.color = value;
        continue;
      }
      if (continuation) {
        const fragment = line.trim();
        if (fragment) {
          const closes = fragment.endsWith('"');
          const value = fragment.slice(0, closes ? -1 : undefined);
          const values = continuation.annotation.qualifiers[continuation.key]!;
          values[continuation.valueIndex] = `${values[continuation.valueIndex]} ${value}`.trim();
          if (closes) continuation = null;
        }
      }
    }
  }
  for (const annotation of annotations) {
    const label = annotation.qualifiers.label?.[0];
    const gene = annotation.qualifiers.gene?.[0];
    if (label !== undefined) annotation.name = label;
    else if (gene !== undefined) annotation.name = gene;
  }
  const document: PlasmidDocument = { id: 'imported-genbank', name, sequence: bases, topology, annotations, provenance: { format: 'genbank', parserVersion: 'plasmid-import-1', warnings: [] } };
  const validation = validateDocument(document);
  if (!validation.valid) throw new Error(validation.reason);
  return { document };
}

export function importPlasmidText(text: string): ImportResult {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('No plasmid text was provided.');
  return trimmed.startsWith('LOCUS') ? importGenBank(trimmed) : importFasta(trimmed);
}

/** Choose a parser from bytes so a `.dna` file is never mistaken for text. */
export async function importPlasmidFile(file: Blob): Promise<ImportResult> {
  const bytes = await file.arrayBuffer();
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 13));
  const magic = new TextDecoder('ascii').decode(header.slice(5, 13));
  if (header[0] === 0x09 && magic === 'SnapGene') return parseSnapGene(bytes);
  return importPlasmidText(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
