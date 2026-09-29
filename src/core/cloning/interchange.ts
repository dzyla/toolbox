/* Exchange formats with the NEBuilder Assembly Tool.

   - Import: NEBuilder "Load/Save" project files (JSON with prefs / fragments / junctions).
   - Export: our own project JSON in the same shape, fragment multi-FASTA, IDT bulk oligos.
   NEBuilder signs its project files and warns that edited files may not load, so the
   project we write carries no signature and NEBuilder may refuse it; FASTA/IDT are the
   reliable route into NEBuilder. */

import { findPolymerase, NEB_POLYMERASES } from './methods/neb-polymerases';
import { NEBUILDER_DEFAULTS, type NebuilderDesign, type NebuilderFragment, type NebuilderSettings } from './methods/nebuilder';
import { primersToIdtBulk, gcPercent, type DesignedPrimer } from './oligo';

export interface ImportedNebuilderProject {
  name: string;
  settings: NebuilderSettings;
  fragments: NebuilderFragment[];
  warnings: string[];
}

interface RawFragment {
  name?: unknown; seq?: unknown; topology?: unknown; type?: unknown; isVectorBackbone?: unknown;
  subseq?: unknown; leftREName?: unknown; rightREName?: unknown; customFwdPrimer?: unknown; customRevPrimer?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseNebuilderProject(text: string): ImportedNebuilderProject {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('This is not a NEBuilder project file (it is not valid JSON).'); }
  if (!isRecord(raw) || !Array.isArray(raw.fragments) || !isRecord(raw.prefs)) {
    throw new Error('This does not look like a NEBuilder project file (no fragments or settings found).');
  }
  const warnings: string[] = [];
  const prefs = raw.prefs;
  const polymerase = isRecord(prefs.pcrPol) && typeof prefs.pcrPol.id === 'string' ? findPolymerase(prefs.pcrPol.id) : undefined;
  if (!polymerase) warnings.push(`The project's PCR polymerase is not available here; using ${NEB_POLYMERASES[0]!.name}.`);
  const number = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const settings: NebuilderSettings = {
    polymeraseId: polymerase?.id ?? NEBUILDER_DEFAULTS.polymeraseId,
    minOverlap: number(prefs.minOverlapLength, NEBUILDER_DEFAULTS.minOverlap),
    minPrimerLength: number(prefs.primerMinLen, NEBUILDER_DEFAULTS.minPrimerLength),
    maxTmDifference: number(prefs.primerMaxTmDiff, NEBUILDER_DEFAULTS.maxTmDifference),
    circularize: prefs.disallowLinearAssemblies !== false,
    primerNm: number(prefs.primerCt, 0) || undefined,
  };

  const fragments: NebuilderFragment[] = [];
  (raw.fragments as RawFragment[]).forEach((fragment, index) => {
    const name = typeof fragment.name === 'string' && fragment.name.trim() ? fragment.name.trim() : `Fragment ${index + 1}`;
    if (typeof fragment.seq !== 'string' || !/^[ACGT]+$/i.test(fragment.seq)) {
      throw new Error(`${name}: the sequence is missing or contains characters other than A, C, G and T.`);
    }
    const type = fragment.type;
    if (type !== 'pcr' && type !== 'redig') {
      throw new Error(`${name}: ${type === 'synth' ? 'synthetic fragments' : `fragment type "${String(type)}"`} are not supported yet.`);
    }
    let sequence = fragment.seq.toUpperCase();
    if (Array.isArray(fragment.subseq) && fragment.subseq.length === 2 && type === 'pcr') {
      const [start, end] = fragment.subseq as number[];
      if (Number.isInteger(start) && Number.isInteger(end) && start! >= 1 && end! <= sequence.length && start! < end!) sequence = sequence.slice(start! - 1, end);
    }
    if (fragment.customFwdPrimer || fragment.customRevPrimer) warnings.push(`${name}: custom primers are not supported yet and were replaced by designed primers.`);
    fragments.push({
      name,
      sequence,
      topology: fragment.topology === 'circular' ? 'circular' : 'linear',
      kind: type === 'redig' ? 'digest' : 'pcr',
      isVectorBackbone: fragment.isVectorBackbone === true,
      leftEnzyme: typeof fragment.leftREName === 'string' ? fragment.leftREName : undefined,
      rightEnzyme: typeof fragment.rightREName === 'string' ? fragment.rightREName : undefined,
    });
  });
  if (Array.isArray(raw.junctions)) {
    const junctions: NonNullable<NebuilderSettings['junctions']> = [];
    for (const junction of raw.junctions as Array<Record<string, unknown>>) {
      const upstream = Number(junction.upstreamFrag);
      if (!Number.isInteger(upstream) || upstream < 1 || upstream > fragments.length) continue;
      const mode = junction.overlapMode;
      junctions[upstream - 1] = {
        spacer: typeof junction.customspacer === 'string' ? junction.customspacer : undefined,
        mode: mode === 'split' || mode === 'upstream' || mode === 'downstream' || mode === 'none' ? mode : undefined,
      };
    }
    if (junctions.length) settings.junctions = junctions;
  }
  return { name: typeof raw.name === 'string' && raw.name ? raw.name : 'NEBuilder project', settings, fragments, warnings };
}

/** Project JSON in NEBuilder's shape, without NEBuilder's signature. */
export function exportNebuilderProject(name: string, fragments: NebuilderFragment[], settings: NebuilderSettings): string {
  const polymerase = findPolymerase(settings.polymeraseId) ?? NEB_POLYMERASES[0]!;
  return JSON.stringify({
    name,
    prefs: {
      minOverlapLength: settings.minOverlap,
      disallowLinearAssemblies: settings.circularize,
      primerMinLen: settings.minPrimerLength,
      primerCt: settings.primerNm ?? (polymerase.taRule === 'phusion' || polymerase.taRule === 'q5' || polymerase.taRule === 'q5u' ? 500 : 200),
      primerMaxTmDiff: settings.maxTmDifference,
      pcrPol: { name: polymerase.name, id: polymerase.id },
    },
    fragments: fragments.map(fragment => ({
      name: fragment.name,
      seq: fragment.sequence,
      topology: fragment.topology,
      type: fragment.kind === 'digest' ? 'redig' : 'pcr',
      isVectorBackbone: fragment.isVectorBackbone ?? false,
      ...(fragment.kind === 'digest' ? { leftREName: fragment.leftEnzyme, rightREName: fragment.rightEnzyme } : {}),
    })),
    note: 'Exported by Bio-Bench. Unsigned: NEBuilder may not load this file; use the FASTA and IDT exports to move a design into NEBuilder.',
  }, null, 1) + '\n';
}

export function fragmentsToFasta(fragments: Array<{ name: string; sequence: string }>): string {
  return fragments.map(fragment => `>${fragment.name} len=${fragment.sequence.length}\n${(fragment.sequence.match(/.{1,60}/g) ?? []).join('\n')}\n`).join('');
}

export function designedPrimers(design: NebuilderDesign): DesignedPrimer[] {
  return design.primers.map(primer => ({
    name: primer.name,
    sequence: primer.overlap + primer.spacer + primer.anneal,
    tail: primer.overlap + primer.spacer,
    anneal: primer.anneal,
    annealTmC: primer.tm,
    gcPercent: gcPercent(primer.overlap + primer.spacer + primer.anneal),
    target: primer.fragment,
    direction: primer.direction === 'fwd' ? 'forward' : 'reverse',
    notes: [`Ta ${primer.ta.toFixed(1)} °C`],
  }));
}

export function designToIdt(design: NebuilderDesign): string {
  return primersToIdtBulk(designedPrimers(design));
}
