import { useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { designAminoAcidChanges, sdmProtocol, translateCodon } from '@/core/cloning/methods/basechanger';
import { sdmProduct } from '@/core/cloning/products';
import { moleculeFromDocument } from '@/core/cloning/molecule';
import { findORFs } from '@/core/plasmid';
import { reverseComplement } from '@/core/nucleic/sequence';
import { DecimalInput } from '@/app/components/DecimalInput';
import type { HubSource, SdmSettings } from './state';
import { sdmPrimers } from './adapters';
import { FIELD, FindingsList, Labeled, PrimerTable, ProductCard, ProtocolCard, Section } from './results';

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
  const workingMolecule = molecule && reverse ? { ...molecule, sequence: working, annotations: [] } : molecule;

  const preview = useMemo(() => {
    if (!working) return '';
    let residues = '';
    for (let index = start0; index + 3 <= working.length && residues.length < 400; index += 3) {
      const aa = translateCodon(working.slice(index, index + 3));
      residues += aa;
      if (aa === '*') break;
    }
    return residues;
  }, [working, start0]);

  return <div class="space-y-4">
    {!source && <p class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-400">Add the plasmid that carries your gene above.</p>}
    {source && molecule && <Section id="sdm-settings" title="2 · Gene and mutations" aside="Q5 site-directed mutagenesis with KLD, back-to-back primers">
      <div class="grid gap-3 sm:grid-cols-2">
        <Labeled label="Plasmid">
          <select class={FIELD} value={source.id} onChange={event => onSettings({ sourceId: event.currentTarget.value, orfIndex: 0 })}>
            {sources.map(item => <option key={item.id} value={item.id}>{item.document.name} ({item.document.sequence.length.toLocaleString()} bp)</option>)}
          </select>
        </Labeled>
        <Labeled label="Reading frame (ORF)" hint="Detected on both strands, longest first">
          <select class={FIELD} value={manual ? -1 : settings.orfIndex} onChange={event => onSettings({ orfIndex: Number(event.currentTarget.value) })}>
            {orfs.map((item, index) => <option key={item.id} value={index}>{item.strand === 1 ? '+' : '−'} strand, bp {item.start}–{item.end}, {item.lengthAa} aa</option>)}
            <option value={-1}>Enter the start position myself…</option>
          </select>
        </Labeled>
        {manual && <Labeled label="Start codon position (1-based)" hint="First base of the ATG, on the strand shown">
          <DecimalInput aria-label="Start codon position" class={FIELD} value={settings.manualStart} min={1} step={1} onChange={value => onSettings({ manualStart: Math.max(1, Math.round(value)) })} />
        </Labeled>}
      </div>
      {reverse && <p class="text-xs text-amber-900 dark:text-amber-200">This gene is on the bottom strand, so primers are designed on the reverse complement of the plasmid.</p>}
      {preview && <p class="break-all font-mono text-xs text-slate-600 dark:text-slate-400" aria-label="Translated reading frame">{preview.slice(0, 120)}{preview.length > 120 ? '…' : ''}</p>}
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
    </Section>}

    {result && result.errors.length > 0 && <div role="alert" class="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100"><ul>{result.errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
    {result && workingMolecule && result.results.map(item => <Section key={item.label} id={`sdm-${item.label}`} title={item.label} aside={item.design ? item.design.description : undefined}>
      <FindingsList findings={item.findings} />
      {(item.rounds ?? (item.design ? [item.design] : [])).map((design, index, all) => <div key={design.label} class="space-y-3">
        {all.length > 1 && <h3 class="text-xs font-semibold">Round {index + 1}: {design.label}</h3>}
        <PrimerTable primers={sdmPrimers(design)} fileName={design.label.replace(/\W+/g, '-')} caption={`Primers for ${design.label}`} />
        <p class="text-xs">Annealing temperature <strong>{design.ta} °C</strong> (lower primer Tm + 1 °C, Q5).</p>
        <LazyDetails summary={`Protocol and product for ${design.label}`}>
          <div class="space-y-4">
            <ProtocolCard protocol={sdmProtocol(design, workingMolecule.sequence.length)} />
            <ProductCard product={sdmProduct(workingMolecule, design)} fileName={design.label.replace(/\W+/g, '-')} />
          </div>
        </LazyDetails>
      </div>)}
    </Section>)}
  </div>;
}
