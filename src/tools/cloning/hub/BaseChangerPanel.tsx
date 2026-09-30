import { useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { designAminoAcidChanges, designSdm, isSdmDesign, sdmProtocol, type SdmDesign } from '@/core/cloning/methods/basechanger';
import { sdmMarks, sdmProduct } from '@/core/cloning/products';
import { moleculeFromDocument, type Molecule } from '@/core/cloning/molecule';
import { findORFs } from '@/core/plasmid';
import { reverseComplement } from '@/core/nucleic/sequence';
import { DecimalInput } from '@/app/components/DecimalInput';
import type { HubSource, SdmSettings } from './state';
import { sdmPrimers } from './adapters';
import { FIELD, FindingsList, Labeled, PrimerTable, ProtocolCard, Section } from './results';
import { ProductPreview } from './ProductPreview';
import { EditView } from './EditView';
import { MutationCards, NumberedProtein } from './ProteinView';
import { mutationMarks, translateFrom } from '@/core/cloning/mutation-view';

/** The numbered protein shows at most this many residues. */
const PROTEIN_CAP = 1200;

interface Props {
  sources: HubSource[];
  settings: SdmSettings;
  onSettings: (patch: Partial<SdmSettings>) => void;
}

function LazyDetails({ summary, children }: { summary: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700" onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary class="cursor-pointer text-xs font-semibold">{summary}</summary>
    {open && <div class="mt-3">{children}</div>}
  </details>;
}

/** The SDM product and its edit mark, built once per design (not on every keystroke elsewhere in the hub). */
function SdmProduct({ molecule, design, fileName }: { molecule: Molecule; design: SdmDesign; fileName: string }) {
  const product = useMemo(() => sdmProduct(molecule, design), [molecule, design]);
  const marks = useMemo(() => sdmMarks(design), [design]);
  return <ProductPreview product={product} fileName={fileName} marks={marks} />;
}

export function BaseChangerPanel({ sources, settings, onSettings }: Props) {
  const source = sources.find(item => item.id === settings.sourceId) ?? sources.find(item => item.role === 'vector') ?? sources[0];
  const molecule = useMemo(() => source ? moleculeFromDocument(source.document) : null, [source]);
  const orfs = useMemo(() => molecule ? findORFs(molecule.sequence, 40, molecule.topology === 'circular').filter(orf => orf.end <= molecule.sequence.length).sort((a, b) => b.lengthAa - a.lengthAa).slice(0, 30) : [], [molecule]);
  const manual = settings.orfIndex < 0 || settings.orfIndex >= orfs.length;
  const orf = manual ? undefined : orfs[settings.orfIndex];

  // Design in the ORF's own orientation: a gene on the bottom strand is designed on the reverse complement.
  const reverse = orf?.strand === -1;
  const working = molecule ? (reverse ? reverseComplement(molecule.sequence) : molecule.sequence) : '';
  const start0 = molecule && orf ? (reverse ? molecule.sequence.length - orf.end : orf.start - 1) : Math.max(0, settings.manualStart - 1);
  const result = useMemo(() => molecule && settings.mutations.trim()
    ? designAminoAcidChanges(working, { start: start0 }, settings.mutations, { strategy: settings.strategy, host: settings.host, minPrimerLength: settings.minPrimerLength })
    : null, [working, start0, settings.mutations, settings.strategy, settings.host, settings.minPrimerLength]);
  const workingMolecule = useMemo(() => molecule && reverse ? { ...molecule, sequence: working, annotations: [] } : molecule, [molecule, reverse, working]);

  // Insert, replace or delete bases by position (NEBaseChanger's Indel/Substitution mode).
  const generalResult = useMemo(() => {
    if (settings.mode !== 'sequence' || !molecule) return null;
    const n = molecule.sequence.length;
    const clean = settings.sequence.replace(/[^ACGTacgt]/g, '').toUpperCase();
    const from = Math.round(settings.from);
    const to = Math.round(settings.to);
    if (settings.edit === 'insert') {
      if (!clean) return { findings: [{ code: 'EMPTY_INSERT', severity: 'blocker' as const, message: 'Enter the bases to insert.' }] };
      if (from < 0 || from > n) return { findings: [{ code: 'INVALID_EDIT', severity: 'blocker' as const, message: `Choose a position from 0 to ${n}.` }] };
      return designSdm(molecule.sequence, { start: from, end: from, replacement: clean, label: `ins${from}` });
    }
    if (from < 1 || to < from || to > n) return { findings: [{ code: 'INVALID_EDIT', severity: 'blocker' as const, message: `Choose bases from 1 to ${n}, with the last not before the first.` }] };
    if (settings.edit === 'replace' && !clean) return { findings: [{ code: 'EMPTY_REPLACEMENT', severity: 'blocker' as const, message: 'Enter the new bases, or choose Delete.' }] };
    return designSdm(molecule.sequence, { start: from - 1, end: to, replacement: settings.edit === 'delete' ? '' : clean, label: `${settings.edit === 'delete' ? 'del' : 'sub'}${from}-${to}` });
  }, [molecule, settings.mode, settings.edit, settings.from, settings.to, settings.sequence]);
  const generalDesign: SdmDesign | null = generalResult && isSdmDesign(generalResult) ? generalResult : null;

  const protein = useMemo(() => translateFrom(working, start0, PROTEIN_CAP), [working, start0]);
  const totalResidues = useMemo(() => translateFrom(working, start0).replace(/\*/g, '').length, [working, start0]);
  const marks = useMemo(() => mutationMarks(result?.results ?? []), [result]);

  return <div class="space-y-4">
    {!source && <p class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-400">Add the plasmid that carries your gene above.</p>}
    {source && molecule && <Section id="sdm-settings" title="2 · Gene and mutations" aside="Q5 site-directed mutagenesis with KLD, back-to-back primers">
      <div role="group" aria-label="Kind of change" class="flex flex-wrap gap-2">
        {([['aa', 'Amino-acid change'], ['sequence', 'Insert, replace or delete bases']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={settings.mode === value} class={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${settings.mode === value ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 dark:border-slate-600'}`} onClick={() => onSettings({ mode: value })}>{label}</button>)}
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <Labeled label="Plasmid">
          <select class={FIELD} value={source.id} onChange={event => onSettings({ sourceId: event.currentTarget.value, orfIndex: 0 })}>
            {sources.map(item => <option key={item.id} value={item.id}>{item.document.name} ({item.document.sequence.length.toLocaleString()} bp)</option>)}
          </select>
        </Labeled>
        {settings.mode === 'aa' && <>
        <Labeled label="Reading frame (ORF)" hint="Detected on both strands, longest first">
          <select class={FIELD} value={manual ? -1 : settings.orfIndex} onChange={event => onSettings({ orfIndex: Number(event.currentTarget.value) })}>
            {orfs.map((item, index) => <option key={item.id} value={index}>{item.strand === 1 ? '+' : '−'} strand, bp {item.start}–{item.end}, {item.lengthAa} aa</option>)}
            <option value={-1}>Enter the start position myself…</option>
          </select>
        </Labeled>
        {manual && <Labeled label="Start codon position (1-based)" hint="First base of the ATG, on the strand shown">
          <DecimalInput aria-label="Start codon position" class={FIELD} value={settings.manualStart} min={1} step={1} onChange={value => onSettings({ manualStart: Math.max(1, Math.round(value)) })} />
        </Labeled>}
        </>}
      </div>
      {settings.mode === 'aa' && <>
      {reverse && <p class="text-xs text-amber-900 dark:text-amber-200">This gene is on the bottom strand, so primers are designed on the reverse complement of the plasmid.</p>}
      {protein && <NumberedProtein protein={protein} marks={marks} total={totalResidues} />}
      <Labeled label="Mutations" hint="One-letter (Y127F) or three-letter (p.Tyr127Phe). Commas or spaces make separate designs; + joins mutations into one multi-mutant (T39A+Y40F). Add :TTC to force a codon; * means stop.">
        <textarea aria-label="Mutations" class={`${FIELD} font-mono`} rows={3} value={settings.mutations} placeholder="Y127F, H443T" onInput={event => onSettings({ mutations: event.currentTarget.value })} />
      </Labeled>
      <div class="grid gap-3 sm:grid-cols-3">
        <Labeled label="New codon" hint="Most used, or fewest base changes">
          <select class={FIELD} value={settings.strategy} onChange={event => onSettings({ strategy: event.currentTarget.value as SdmSettings['strategy'] })}>
            <option value="usage">Codon usage</option><option value="minimal">Parsimony (minimal change)</option>
          </select>
        </Labeled>
        <Labeled label="Codon usage table">
          <select class={FIELD} value={settings.host} onChange={event => onSettings({ host: event.currentTarget.value as SdmSettings['host'] })}>
            <option value="ecoli">E. coli</option><option value="human">Human</option><option value="yeast">Yeast</option><option value="insect">Insect (Sf9)</option>
          </select>
        </Labeled>
        <Labeled label="Minimum primer length (nt)">
          <DecimalInput aria-label="Minimum primer length (nt)" class={FIELD} value={settings.minPrimerLength} min={15} max={40} step={1} onChange={value => onSettings({ minPrimerLength: Math.min(40, Math.max(15, Math.round(value))) })} />
        </Labeled>
      </div>
      <p class="text-xs text-slate-600 dark:text-slate-400">Primers place the new codon in the 5′ tail of the forward primer (NEBaseChanger’s “confine mutations to primer 5′ tails” design), with the Q5 Tm calculator. NEBaseChanger’s default design for edits of five bases or fewer, which puts the change inside the primer and needs a mismatch-aware Tm, is not implemented.</p>
      </>}
      {settings.mode === 'sequence' && <div class="space-y-3">
        <div class="grid gap-3 sm:grid-cols-3">
          <Labeled label="Change">
            <select class={FIELD} value={settings.edit} onChange={event => onSettings({ edit: event.currentTarget.value as SdmSettings['edit'] })}>
              <option value="insert">Insert bases after a position</option><option value="replace">Replace bases</option><option value="delete">Delete bases</option>
            </select>
          </Labeled>
          <Labeled label={settings.edit === 'insert' ? 'After base (0 = before the first)' : 'From base (1-based)'}>
            <DecimalInput aria-label={settings.edit === 'insert' ? 'Insert after base' : 'From base'} class={FIELD} value={settings.from} min={0} step={1} onChange={value => onSettings({ from: Math.max(0, Math.round(value)) })} />
          </Labeled>
          {settings.edit !== 'insert' && <Labeled label="To base (inclusive)">
            <DecimalInput aria-label="To base" class={FIELD} value={settings.to} min={1} step={1} onChange={value => onSettings({ to: Math.max(1, Math.round(value)) })} />
          </Labeled>}
        </div>
        {settings.edit !== 'delete' && <Labeled label={settings.edit === 'insert' ? 'Bases to insert' : 'New bases'} hint="Up to 6 bases go on one primer; longer sequences are split across both primers (tags, sites).">
          <textarea aria-label="New bases" class={`${FIELD} font-mono`} rows={2} value={settings.sequence} placeholder="GGATCC" onInput={event => onSettings({ sequence: event.currentTarget.value.toUpperCase().replace(/[^ACGT]/g, '') })} />
        </Labeled>}
        <p class="text-xs text-slate-600 dark:text-slate-400">Positions count from the first base of the plasmid as given, {molecule.sequence.length.toLocaleString()} bp in all.</p>
      </div>}
    </Section>}

    {generalResult && <Section id="sdm-general" title={generalDesign ? generalDesign.label : 'Design'} aside={generalDesign?.description}>
      <FindingsList findings={generalResult.findings} />
      {generalDesign && molecule && <div class="space-y-3">
        <EditView plasmid={molecule.sequence} design={generalDesign} plasmidName={molecule.name} />
        <PrimerTable primers={sdmPrimers(generalDesign)} fileName={generalDesign.label} caption={`Primers for ${generalDesign.label}`} />
        <p class="text-xs">Annealing temperature <strong>{generalDesign.ta} °C</strong> (lower primer Tm + 1 °C, Q5).</p>
        <LazyDetails summary={`Protocol and product for ${generalDesign.label}`}>
          <div class="space-y-4">
            <ProtocolCard protocol={sdmProtocol(generalDesign, molecule.sequence.length)} />
            <SdmProduct molecule={molecule} design={generalDesign} fileName={generalDesign.label} />
          </div>
        </LazyDetails>
      </div>}
    </Section>}

    {settings.mode === 'aa' && result && result.errors.length > 0 && <div role="alert" class="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100"><ul>{result.errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
    {settings.mode === 'aa' && result && workingMolecule && result.results.map(item => <Section key={item.label} id={`sdm-${item.label}`} title={item.label} aside={item.design ? item.design.description : undefined}>
      <FindingsList findings={item.findings} />
      <MutationCards result={item} wildDna={working} orfStart={start0} />
      {(item.rounds ?? (item.design ? [item.design] : [])).map((design, index, all) => <div key={design.label} class="space-y-3">
        {all.length > 1 && <h3 class="text-xs font-semibold">Round {index + 1}: {design.label}</h3>}
        <PrimerTable primers={sdmPrimers(design)} fileName={design.label.replace(/\W+/g, '-')} caption={`Primers for ${design.label}`} />
        <p class="text-xs">Annealing temperature <strong>{design.ta} °C</strong> (lower primer Tm + 1 °C, Q5).</p>
        <LazyDetails summary={`Protocol and product for ${design.label}`}>
          <div class="space-y-4">
            <ProtocolCard protocol={sdmProtocol(design, workingMolecule.sequence.length)} />
            <SdmProduct molecule={workingMolecule} design={design} fileName={design.label.replace(/\W+/g, '-')} />
          </div>
        </LazyDetails>
      </div>)}
    </Section>)}
  </div>;
}
