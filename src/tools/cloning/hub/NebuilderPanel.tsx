import { useMemo, useState } from 'preact/hooks';
import { designNebuilder, type NebuilderFragment, type OpenSite, type OverlapMode } from '@/core/cloning/methods/nebuilder';
import { NEB_POLYMERASES, findPolymerase } from '@/core/cloning/methods/neb-polymerases';
import { designedPrimers, designToIdt, exportNebuilderProject, openedFragments, fragmentsToFasta, parseNebuilderProject } from '@/core/cloning/interchange';
import { nebuilderAmounts } from '@/core/cloning/amounts';
import { nebuilderProtocol } from '@/core/cloning/protocols';
import { nebuilderMarks, nebuilderProduct } from '@/core/cloning/products';
import { nebuilderSegments } from '@/core/cloning/segments';
import { nebuilderGeometry } from '@/core/cloning/geometry';
import { moleculeFromDocument } from '@/core/cloning/molecule';
import { importPlasmidText } from '@/core/plasmid/import';
import { downloadText } from '@/lib/export';
import { readTextFile, importErrorMessage } from '@/lib/file-import';
import { ImportAlert } from '@/app/components/ImportAlert';
import { DecimalInput } from '@/app/components/DecimalInput';
import type { FragmentOption, HubSource, NebuilderSettings } from './state';
import { orderEnzymes, singleCutters, suggestPair } from './enzymes';
import { BUTTON, FIELD, FindingsList, Labeled, PrimerTable, ProtocolCard, Section } from './results';
import { ProductPreview } from './ProductPreview';
import { PrimerMap } from './PrimerMap';

interface Props {
  sources: HubSource[];
  settings: NebuilderSettings;
  onSettings: (patch: Partial<NebuilderSettings>) => void;
  onReplaceSources: (sources: HubSource[]) => void;
}

function defaultOption(source: HubSource): FragmentOption {
  const molecule = moleculeFromDocument(source.document);
  if (molecule.topology === 'linear') return { kind: 'pcr', enzymeA: '', enzymeB: '' };
  const [a, b] = suggestPair(singleCutters(molecule));
  return { kind: 'digest', enzymeA: a, enzymeB: b };
}

const OPEN_DEFAULTS = { caret: 1, start: 1, end: 2 };

function toOpenSite(chosen: FragmentOption): OpenSite | undefined {
  const open = chosen.open;
  if (!open || open.mode === 'whole') return undefined;
  if (open.mode === 'caret') return { caret: Math.round(open.caret) - 1 };
  return { start: Math.round(open.start) - 1, end: Math.round(open.end) };
}

export function NebuilderPanel({ sources, settings, onSettings, onReplaceSources }: Props) {
  const [importError, setImportError] = useState('');
  const [activeName, setActiveName] = useState<string | undefined>();
  const molecules = useMemo(() => sources.map(source => moleculeFromDocument(source.document)), [sources]);
  const cutters = useMemo(() => molecules.map(molecule => molecule.topology === 'circular' ? singleCutters(molecule) : []), [molecules]);
  const option = (source: HubSource): FragmentOption => settings.fragments[source.id] ?? defaultOption(source);
  const setOption = (source: HubSource, patch: Partial<FragmentOption>) => onSettings({ fragments: { ...settings.fragments, [source.id]: { ...option(source), ...patch } } });

  const fragments: NebuilderFragment[] = sources.map((source, index) => {
    const chosen = option(source);
    const molecule = molecules[index]!;
    const digest = chosen.kind === 'digest' && molecule.topology === 'circular';
    const [left, right] = digest ? orderEnzymes(molecule, chosen.enzymeA, chosen.enzymeB, source.role === 'vector' ? 'larger' : 'smaller') : ['', ''];
    return {
      name: source.document.name,
      sequence: molecule.sequence,
      topology: molecule.topology,
      kind: digest ? 'digest' : 'pcr',
      isVectorBackbone: source.role === 'vector',
      leftEnzyme: digest ? left : undefined,
      rightEnzyme: digest ? right : undefined,
      open: digest ? undefined : toOpenSite(chosen),
    };
  });
  const junctionOptions = fragments.map((_, index) => {
    const entry = settings.junctions[String(index)];
    if (!entry || (!entry.spacer && entry.mode === 'default')) return undefined;
    if (entry.mode === 'custom') return { spacer: entry.spacer, fwdTailShare: (entry.share ?? 50) / 100 };
    return { spacer: entry.spacer, mode: entry.mode === 'default' ? undefined : (entry.mode as OverlapMode) };
  });
  const design = useMemo(() => fragments.length < 2 ? null : designNebuilder(fragments, {
    polymeraseId: settings.polymeraseId,
    minOverlap: settings.minOverlap,
    minPrimerLength: settings.minPrimerLength,
    maxTmDifference: settings.maxTmDifference,
    circularize: settings.circularize,
    junctions: junctionOptions,
  }), [JSON.stringify(fragments), settings.polymeraseId, settings.minOverlap, settings.minPrimerLength, settings.maxTmDifference, settings.circularize, JSON.stringify(junctionOptions)]);

  const pieces = useMemo(() => design ? nebuilderGeometry(design, fragments) : [], [design]);
  const product = useMemo(() => design && design.product ? nebuilderProduct(design, molecules, 'NEBuilder assembly', settings.circularize) : null, [design, molecules, settings.circularize]);
  const marks = useMemo(() => design ? nebuilderMarks(design) : [], [design]);
  const segments = useMemo(() => design ? nebuilderSegments(design) : [], [design]);
  const amounts = design && design.product ? nebuilderAmounts(design.templates.map((template, index) => ({
    name: template.name,
    bp: template.sequence.length,
    ngPerUl: settings.concentrations[sources[index]!.id] ?? 50,
    isVector: sources[index]!.role === 'vector',
  }))) : null;
  const polymerase = findPolymerase(settings.polymeraseId);

  const importProject = async (file: File) => {
    setImportError('');
    try {
      const parsed = parseNebuilderProject(await readTextFile(file));
      const imported: HubSource[] = parsed.fragments.map((fragment, index) => {
        const document = importPlasmidText(`>${fragment.name}\n${fragment.sequence}`).document;
        return { id: `src-${Date.now().toString(36)}-${index}`, role: fragment.isVectorBackbone ? 'vector' : 'insert', document: { ...document, topology: fragment.topology } };
      });
      const fragmentOptions: Record<string, FragmentOption> = {};
      parsed.fragments.forEach((fragment, index) => {
        fragmentOptions[imported[index]!.id] = { kind: fragment.kind, enzymeA: fragment.leftEnzyme ?? '', enzymeB: fragment.rightEnzyme ?? '' };
      });
      const junctions: NebuilderSettings['junctions'] = {};
      (parsed.settings.junctions ?? []).forEach((entry, index) => { if (entry) junctions[String(index)] = { spacer: entry.spacer ?? '', mode: entry.mode && entry.mode !== 'none' ? entry.mode : 'default' }; });
      onReplaceSources(imported);
      onSettings({
        polymeraseId: parsed.settings.polymeraseId, minOverlap: parsed.settings.minOverlap, minPrimerLength: parsed.settings.minPrimerLength,
        maxTmDifference: parsed.settings.maxTmDifference, circularize: parsed.settings.circularize, fragments: fragmentOptions, junctions,
      });
      if (parsed.warnings.length) setImportError(parsed.warnings.join(' '));
    } catch (cause) { setImportError(importErrorMessage(cause, file.name)); }
  };

  return <div class="space-y-4">
    <Section id="nb-settings" title="2 · NEBuilder settings" aside="Defaults follow the NEBuilder Assembly Tool (E5520, Q5)">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Labeled label="PCR polymerase / kit">
          <select class={FIELD} value={settings.polymeraseId} onChange={event => onSettings({ polymeraseId: event.currentTarget.value })}>
            {NEB_POLYMERASES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Labeled>
        <Labeled label="Minimum overlap (nt)" hint="NEBuilder: 20; 25 for more than 3 fragments">
          <DecimalInput aria-label="Minimum overlap (nt)" class={FIELD} value={settings.minOverlap} min={10} max={75} step={1} onChange={value => onSettings({ minOverlap: Math.min(75, Math.max(10, Math.round(value))) })} />
        </Labeled>
        <Labeled label="Minimum primer length (nt)">
          <DecimalInput aria-label="Minimum primer length (nt)" class={FIELD} value={settings.minPrimerLength} min={10} max={60} step={1} onChange={value => onSettings({ minPrimerLength: Math.min(60, Math.max(10, Math.round(value))) })} />
        </Labeled>
        <Labeled label="Maximum Tm difference (°C)">
          <DecimalInput aria-label="Maximum Tm difference (°C)" class={FIELD} value={settings.maxTmDifference} min={1} step={1} onChange={value => onSettings({ maxTmDifference: Math.max(1, value) })} />
        </Labeled>
      </div>
      <label class="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.circularize} onChange={event => onSettings({ circularize: event.currentTarget.checked })} /> Circularize the assembly (join the last fragment back to the first)</label>
      {polymerase && <p class="text-xs text-slate-600 dark:text-slate-400">Tm: NEB Tm calculator ({polymerase.taRule === 'phusion' ? 'Breslauer, Phusion' : 'SantaLucia 1998 + Owczarzy 2004'}), buffer {polymerase.monovalentMm} mM Na⁺.</p>}
      <div class="flex flex-wrap items-center gap-3">
        <label class="text-xs font-medium">Import a NEBuilder project file
          <input class="mt-1 block max-w-full text-xs" type="file" accept=".json,application/json" onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void importProject(file);
          }} />
        </label>
      </div>
      {importError && <ImportAlert message={importError} />}
    </Section>

    {sources.length > 0 && <Section id="nb-fragments" title="How each fragment is made" aside="PCR-amplified, or cut out with two enzymes">
      <ul class="space-y-2">
        {sources.map((source, index) => {
          const chosen = option(source);
          const molecule = molecules[index]!;
          return <li key={source.id} class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2 text-xs dark:border-slate-700">
            <strong class="min-w-24">{index + 1}. {source.document.name}</strong>
            <span class="text-slate-600 dark:text-slate-400">{source.role}, {molecule.sequence.length.toLocaleString()} bp</span>
            <select aria-label={`How ${source.document.name} is made`} class="rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600" value={chosen.kind} disabled={molecule.topology === 'linear'} onChange={event => setOption(source, { kind: event.currentTarget.value as 'pcr' | 'digest' })}>
              <option value="pcr">PCR product</option>
              <option value="digest" disabled={molecule.topology === 'linear'}>Restriction digest</option>
            </select>
            {chosen.kind === 'digest' && molecule.topology === 'circular' && <>
              <select aria-label={`First enzyme for ${source.document.name}`} class="rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600" value={chosen.enzymeA} onChange={event => setOption(source, { enzymeA: event.currentTarget.value })}>
                {cutters[index]!.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <select aria-label={`Second enzyme for ${source.document.name}`} class="rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600" value={chosen.enzymeB} onChange={event => setOption(source, { enzymeB: event.currentTarget.value })}>
                {cutters[index]!.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <span class="text-slate-600 dark:text-slate-400">single cutters only; the {source.role === 'vector' ? 'larger' : 'smaller'} piece is kept</span>
            </>}
            {chosen.kind === 'pcr' && molecule.topology === 'circular' && <>
              <select aria-label={`Where to open ${source.document.name}`} class="rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600" value={chosen.open?.mode ?? 'whole'}
                onChange={event => setOption(source, { open: { ...OPEN_DEFAULTS, ...chosen.open, mode: event.currentTarget.value as 'whole' | 'caret' | 'region' } })}>
                <option value="whole">Amplify the whole circle</option>
                <option value="caret">Open at a position (insert goes there)</option>
                <option value="region">Replace a region</option>
              </select>
              {chosen.open?.mode === 'caret' && <DecimalInput aria-label={`Open ${source.document.name} before base`} class={`${FIELD} w-28`} value={chosen.open.caret} min={1} max={molecule.sequence.length} step={1}
                onChange={value => setOption(source, { open: { ...chosen.open!, caret: Math.min(molecule.sequence.length, Math.max(1, Math.round(value))) } })} />}
              {chosen.open?.mode === 'region' && <>
                <DecimalInput aria-label={`Replace ${source.document.name} from base`} class={`${FIELD} w-24`} value={chosen.open.start} min={1} max={molecule.sequence.length} step={1} onChange={value => setOption(source, { open: { ...chosen.open!, start: Math.min(molecule.sequence.length, Math.max(1, Math.round(value))) } })} />
                <DecimalInput aria-label={`Replace ${source.document.name} to base`} class={`${FIELD} w-24`} value={chosen.open.end} min={1} max={molecule.sequence.length} step={1} onChange={value => setOption(source, { open: { ...chosen.open!, end: Math.min(molecule.sequence.length, Math.max(1, Math.round(value))) } })} />
              </>}
            </>}
          </li>;
        })}
      </ul>
    </Section>}

    {sources.length < 2 && <p class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-400">Add at least two sequences (a vector and an insert) above to design an assembly.</p>}

    {design && <>
      <FindingsList findings={design.findings} />
      {pieces.some(piece => piece.kind === 'pcr' || piece.removed) && <Section id="nb-maps" title="Primer maps" aside="Where each primer binds; click a circular map to move the opening">
        <div class="grid gap-4 lg:grid-cols-2">
          {pieces.map(piece => {
            const source = sources[piece.sourceIndex]!;
            const chosen = option(source);
            const circularPcr = piece.kind === 'pcr' && piece.topology === 'circular';
            const open = { ...OPEN_DEFAULTS, ...chosen.open };
            return <PrimerMap key={source.id} piece={piece} activeId={activeName} onActive={setActiveName}
              onPick={circularPcr ? position => setOption(source, { open: { ...open, mode: 'caret', caret: Math.min(piece.length, position + 1) } }) : undefined}
              onRegion={circularPcr ? (start, end) => setOption(source, { open: { ...open, mode: 'region', start: start + 1, end } }) : undefined}
              marker={circularPcr && chosen.open?.mode === 'caret' ? { position: chosen.open.caret - 1, label: `Open before ${chosen.open.caret}` } : undefined} />;
          })}
        </div>
      </Section>}
      {design.primers.length > 0 && <Section id="nb-primers" title="Primers" aside={`${design.primers.length} oligos`}>
        <PrimerTable primers={designedPrimers(design)} fileName="nebuilder" caption="NEBuilder primers" activeName={activeName} onActiveName={setActiveName} />
        <div class="flex flex-wrap gap-2">
          <button type="button" class={BUTTON} onClick={() => downloadText(designToIdt(design), 'nebuilder-idt.txt')}>Download IDT (NEBuilder-compatible)</button>
          <button type="button" class={BUTTON} onClick={() => downloadText(fragmentsToFasta(design.templates), 'nebuilder-fragments.fasta')}>Download fragments FASTA</button>
          <button type="button" class={BUTTON} onClick={() => downloadText(exportNebuilderProject('Bio-Bench assembly', openedFragments(fragments, design), {
            polymeraseId: settings.polymeraseId, minOverlap: settings.minOverlap, minPrimerLength: settings.minPrimerLength, maxTmDifference: settings.maxTmDifference, circularize: settings.circularize,
          }), 'nebuilder-project.json', 'application/json')}>Download project (unsigned)</button>
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-400">NEBuilder signs its own project files, so it may refuse this one; to continue in NEBuilder, load the fragments FASTA and use the same settings. An opened circle is written as its opened linear piece; custom overlap splits are not exported (NEBuilder has no equivalent).</p>
      </Section>}
      {design.junctions.length > 0 && design.primers.length > 0 && <Section id="nb-junctions" title="Junctions" aside="Where the homology sits, and optional spacers">
        <p class="text-xs text-slate-600 dark:text-slate-400">Drag the slider to decide how much of each overlap sits on the left (upstream) or right (downstream) primer. Half and half is NEB’s usual choice.</p>
        <div class="overflow-x-auto"><table class="w-full border-collapse text-left text-xs">
          <caption class="sr-only">Assembly junctions</caption>
          <thead class="text-slate-600 dark:text-slate-400"><tr><th scope="col" class="py-1 pr-3">Junction</th><th scope="col" class="py-1 pr-3">Homology</th><th scope="col" class="py-1 pr-3">Placement</th><th scope="col" class="py-1">Spacer (top strand)</th></tr></thead>
          <tbody>{design.junctions.map((junction, index) => {
            const entry = settings.junctions[String(index)] ?? { spacer: '', mode: 'default' as const };
            const patch = (next: Partial<typeof entry>) => onSettings({ junctions: { ...settings.junctions, [String(index)]: { ...entry, ...next } } });
            return <tr key={`${junction.upstream}-${junction.downstream}`} class="border-t border-slate-200 dark:border-slate-700">
              <th scope="row" class="py-1.5 pr-3 font-medium">{junction.upstream} → {junction.downstream}</th>
              <td class="py-1.5 pr-3 tabular-nums">{junction.overlapLength} nt{junction.intrinsicOverlap ? ' (already present)' : ''}</td>
              <td class="py-1.5 pr-3"><select aria-label={`Placement for ${junction.upstream} to ${junction.downstream}`} class="rounded border border-slate-300 bg-transparent px-1.5 py-1 dark:border-slate-600" value={entry.mode} onChange={event => patch({ mode: event.currentTarget.value as typeof entry.mode })}>
                <option value="default">Automatic ({junction.mode})</option><option value="upstream">On upstream fragment</option><option value="downstream">On downstream fragment</option><option value="split">Split</option><option value="custom">Custom split…</option>
              </select>
              {entry.mode === 'custom' && <div class="mt-1 space-y-1">
                <div class="flex flex-wrap gap-1">
                  {([['All on the left primer', 0], ['Half and half', 50], ['All on the right primer', 100]] as const).map(([label, value]) =>
                    <button key={label} type="button" class={BUTTON} onClick={() => patch({ share: value })}>{label}</button>)}
                </div>
                <input type="range" min={0} max={100} step={1} value={entry.share ?? 50} aria-label={`Share of the overlap on the right primer for ${junction.upstream} to ${junction.downstream}`} onInput={event => patch({ share: Number(event.currentTarget.value) })} />
                <p data-testid="share-summary" class="text-xs">{junction.downstreamTail.length} nt on {junction.upstream}_rev · {junction.upstreamTail.length} nt on {junction.downstream}_fwd</p>
              </div>}
              </td>
              <td class="py-1.5"><input aria-label={`Spacer for ${junction.upstream} to ${junction.downstream}`} class="w-40 rounded border border-slate-300 bg-transparent px-1.5 py-1 font-mono dark:border-slate-600" value={entry.spacer} maxLength={100} placeholder="none" onInput={event => patch({ spacer: event.currentTarget.value.toUpperCase().replace(/[^ACGT]/g, '') })} /></td>
            </tr>;
          })}</tbody>
        </table></div>
      </Section>}
      {amounts && <Section id="nb-protocol" title="Reaction" aside="NEBuilder Protocol Calculator amounts">
        <div class="flex flex-wrap gap-3 text-xs">
          {sources.map(source => <Labeled key={source.id} label={`${source.document.name} (ng/µL)`}>
            <DecimalInput aria-label={`${source.document.name} concentration (ng/µL)`} class={`${FIELD} w-28`} value={settings.concentrations[source.id] ?? 50} min={0.1} step={5} onChange={value => onSettings({ concentrations: { ...settings.concentrations, [source.id]: Math.max(0.1, value) } })} />
          </Labeled>)}
        </div>
        <ProtocolCard protocol={nebuilderProtocol(amounts)} />
      </Section>}
      {product && <Section id="nb-product" title="Assembled product"><ProductPreview product={product} fileName="nebuilder-assembly" marks={marks} segments={segments} /></Section>}
    </>}
  </div>;
}

