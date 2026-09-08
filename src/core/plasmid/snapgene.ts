import type { ImportResult } from './import';
import type { Annotation } from './model';

const MAX_PACKET_BYTES = 32 * 1024 * 1024;

/** Strict packet framing guard for native SnapGene files. Payload decoding is added packet-by-packet. */
export function parseSnapGene(bytes: ArrayBuffer): ImportResult {
  const view = new DataView(bytes);
  const decoder = new TextDecoder('ascii', { fatal: true });
  let offset = 0;
  let sawCookie = false;
  let sequence: string | null = null;
  let circular = false;
  const featurePackets: string[] = [];
  while (offset < view.byteLength) {
    if (view.byteLength - offset < 5) throw new Error('Truncated SnapGene packet header.');
    const type = view.getUint8(offset);
    const length = view.getUint32(offset + 1, false);
    offset += 5;
    if (length > MAX_PACKET_BYTES) throw new Error('SnapGene packet exceeds the safety limit.');
    if (view.byteLength - offset < length) throw new Error('Truncated SnapGene packet payload.');
    const payload = new Uint8Array(bytes, offset, length);
    if (!sawCookie) {
      if (type !== 0x09 || length !== 14 || decoder.decode(payload.slice(0, 8)) !== 'SnapGene') throw new Error('Invalid SnapGene cookie packet.');
      sawCookie = true;
    } else if (type === 0x00) {
      if (sequence !== null || length < 2) throw new Error('Invalid SnapGene DNA packet.');
      circular = (payload[0]! & 1) === 1;
      sequence = decoder.decode(payload.slice(1)).toUpperCase();
    } else if (type === 0x0a) {
      featurePackets.push(new TextDecoder('utf-8', { fatal: true }).decode(payload));
    }
    offset += length;
  }
  if (!sequence) throw new Error('SnapGene file contains no supported DNA packet.');
  const annotations = featurePackets.flatMap((xml, packetIndex) => parseFeatures(xml, sequence!.length, packetIndex));
  return { document: { id: 'imported-snapgene', name: 'Imported SnapGene sequence', sequence, topology: circular ? 'circular' : 'linear', annotations, provenance: { format: 'snapgene', parserVersion: 'snapgene-import-1', warnings: [] } } };
}

function parseFeatures(xml: string, sequenceLength: number, packetIndex: number): Annotation[] {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror')) throw new Error('Invalid SnapGene feature XML.');

  return Array.from(parsed.getElementsByTagName('Feature')).map((feature, featureIndex) => {
    const directionality = Number(feature.getAttribute('directionality') || '1');
    const strand = directionality === 2 ? -1 : directionality === 0 ? 0 : 1;
    const rawSegments = Array.from(feature.getElementsByTagName('Segment'))
      .filter(segment => segment.getAttribute('type') !== 'gap')
      .flatMap(segment => parseRange(segment.getAttribute('range'), sequenceLength));
    if (!rawSegments.length) throw new Error('SnapGene feature has no valid segments.');
    if (strand === -1) rawSegments.reverse();

    const qualifiers: Record<string, string[]> = {};
    for (const qualifier of Array.from(feature.getElementsByTagName('Q'))) {
      const key = qualifier.getAttribute('name');
      if (!key) continue;
      const values = Array.from(qualifier.getElementsByTagName('V'))
        .map(value => value.getAttribute('text') ?? value.getAttribute('predef') ?? value.getAttribute('int'))
        .filter((value): value is string => value !== null)
        .map(value => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
      if (values.length) qualifiers[key] = values;
    }

    const name = feature.getAttribute('name') || qualifiers.label?.[0] || qualifiers.gene?.[0] || 'Untitled feature';
    if (!qualifiers.label) qualifiers.label = [name];
    const firstSegment = feature.getElementsByTagName('Segment')[0];
    return {
      id: `snapgene-feature-${packetIndex + 1}-${featureIndex + 1}`,
      name,
      type: feature.getAttribute('type') || 'misc_feature',
      location: { strand, segments: rawSegments },
      qualifiers,
      color: firstSegment?.getAttribute('color') || undefined,
      source: 'imported',
      confidence: 'annotated',
    };
  });
}

function parseRange(range: string | null, sequenceLength: number): Array<{ start: number; end: number }> {
  const match = range?.match(/^(\d+)-(\d+)$/);
  if (!match) throw new Error(`Invalid SnapGene feature range: ${range || '(missing)'}.`);
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < 1 || start > sequenceLength || end > sequenceLength) {
    throw new Error(`SnapGene feature range is outside the sequence: ${range}.`);
  }
  if (start <= end) return [{ start: start - 1, end }];
  return [{ start: start - 1, end: sequenceLength }, { start: 0, end }];
}
