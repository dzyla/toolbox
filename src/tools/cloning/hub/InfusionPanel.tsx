import { useMemo, useState } from 'preact/hooks';
import { designInfusion, type InfusionLinearization } from '@/core/cloning/methods/infusion';
import { infusionAmounts } from '@/core/cloning/amounts';
import { infusionProtocol } from '@/core/cloning/protocols';
import { infusionMarks, infusionProduct } from '@/core/cloning/products';
import { infusionSegments } from '@/core/cloning/segments';
import { infusionGeometry } from '@/core/cloning/geometry';
import { moleculeFromDocument } from '@/core/cloning/molecule';
import { DecimalInput } from '@/app/components/DecimalInput';
import type { HubSource, InfusionSettings } from './state';
import { singleCutters, suggestPair } from './enzymes';
import { infusionPrimers } from './adapters';
import { FIELD, FindingsList, Labeled, PrimerTable, ProtocolCard, Section } from './results';
import { ProductPreview } from './ProductPreview';
import { PrimerMap } from './PrimerMap';

interface Props {
  sources: HubSource[];
  settings: InfusionSettings;
  onSettings: (patch: Partial<InfusionSettings>) => void;
}

export function InfusionPanel({ sources, settings, onSettings }: Props) {
  const [activeName, setActiveName] = useState<string | undefined>();
  const vectorSource = sources.find(source => source.role === 'vector');
  const insertSources = useMemo(() => sources.filter(source => source.role === 'insert'), [sources]);
  const vector = useMemo(() => vectorSource ? moleculeFromDocument(vectorSource.document) : null, [vectorSource]);
  const cutters = useMemo(() => vector && vector.topology === 'circular' ? singleCutters(vector) : [], [vector]);
  const inserts = useMemo(() => insertSources.map(source => moleculeFromDocument(source.document)), [insertSources]);

  const [defaultA, defaultB] = suggestPair(cutters);
  // '' for the first enzyme means automatic; 'auto' for the second means automatic, '' means a single cut.
  const enzymeA = cutters.includes(settings.enzymeA) ? settings.enzymeA : defaultA;
  const enzymeB = settings.enzymeB === 'auto' ? defaultB : settings.enzymeB === '' || cutters.includes(settings.enzymeB) ? settings.enzymeB : defaultB;
  const caret = Math.max(1, settings.caret);
  const linearization: InfusionLinearization | null = !vector ? null
    : vector.topology === 'linear' ? { method: 'linear' }
      : settings.linearize === 'linear' ? { method: 'linear' }
        : settings.linearize === 'pcr-caret' ? { method: 'pcr', caret: Math.max(0, caret - 1) }
          : settings.linearize === 'pcr-region' ? { method: 'pcr', region: { start: Math.max(0, settings.regionStart - 1), end: Math.max(0, settings.regionEnd) } }
            : { method: 'digest', enzymes: enzymeB && enzymeB !== enzymeA ? [enzymeA, enzymeB] : [enzymeA], includeSites: { first: settings.includeFirst, second: settings.includeSecond } };

  const vectorShare = linearization && 'method' in linearization && linearization.method === 'pcr' ? settings.vectorShare : 0;
  const design = useMemo(() => vector && linearization && inserts.length
    ? designInfusion(vector.sequence, vector.topology, linearization, insertSources.map((source, index) => ({ name: source.document.name, sequence: inserts[index]!.sequence })), { vectorShare: vectorShare / 100 })
    : null, [vector, JSON.stringify(linearization), vectorShare, inserts.map(insert => insert.sequence).join('|')]);
  const pieces = useMemo(() => {
    if (!design || !vectorSource || !vector) return [];
    const hubIndex = (id: string) => sources.findIndex(source => source.id === id);
    return infusionGeometry(design, { sourceIndex: hubIndex(vectorSource.id), name: vectorSource.document.name, length: vector.sequence.length, topology: vector.topology },
      insertSources.map((source, index) => ({ sourceIndex: hubIndex(source.id), name: source.document.name, length: inserts[index]!.sequence.length })));
  }, [design, vectorSource, vector, insertSources, inserts, sources]);
  const vectorRevTail = design?.primers.find(primer => primer.name === 'vector_rev')?.extension.length ?? 0;
  const insertFwdTail = design?.primers.find(primer => primer.role === 'insert' && primer.direction === 'forward')?.extension.length ?? 0;

  const product = useMemo(() => design && design.product && vector ? infusionProduct(design, vector, inserts, 'In-Fusion construct') : null, [design, vector, inserts]);
  const marks = useMemo(() => design ? infusionMarks(design, inserts) : [], [design, inserts]);
  const segments = useMemo(() => {
    if (!design || !vectorSource) return [];
    const hubIndex = (id: string) => sources.findIndex(source => source.id === id);
    return infusionSegments(design, { sourceIndex: hubIndex(vectorSource.id), name: vectorSource.document.name },
      insertSources.map((source, index) => ({ sourceIndex: hubIndex(source.id), name: source.document.name, length: inserts[index]!.sequence.length })));
  }, [design, vectorSource, insertSources, inserts, sources]);
  const amounts = design && design.product ? infusionAmounts(
    { bp: design.vector.length, ngPerUl: settings.vectorConcentration },
    insertSources.map((source, index) => ({ name: source.document.name, bp: inserts[index]!.sequence.length, ngPerUl: settings.insertConcentration })),
    settings.vectorNg,
  ) : null;

  return <div class="space-y-4">
    {!vectorSource && <p class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-400">Add a vector (role “Vector”) and at least one insert above.</p>}
    {vectorSource && vector && <Section id="if-settings" title="2 · Open the vector" aside="Takara In-Fusion rules: 15 bp extensions (20 bp for two or more inserts)">
      <div class="grid gap-3 sm:grid-cols-2">
        <Labeled label="Linearize the vector by">
          <select aria-label="Linearize the vector by" class={FIELD} value={vector.topology === 'linear' ? 'linear' : settings.linearize} disabled={vector.topology === 'linear'} onChange={event => onSettings({ linearize: event.currentTarget.value as InfusionSettings['linearize'] })}>
            <option value="digest">Restriction digest</option>
            <option value="pcr-caret">Inverse PCR: insert at a position</option>
            <option value="pcr-region">Inverse PCR: replace a region</option>
            <option value="linear">Already linearized</option>
          </select>
        </Labeled>
        {vector.topology === 'linear' && <p class="self-end text-xs text-slate-600 dark:text-slate-400">This vector is linear, so it is used as it is.</p>}
      </div>
      {vector.topology === 'circular' && settings.linearize === 'digest' && <div class="space-y-2">
        <div class="grid gap-3 sm:grid-cols-2">
          <Labeled label="First cut (start of the removed region)" hint="Single cutters only">
            <select class={FIELD} value={enzymeA} onChange={event => onSettings({ enzymeA: event.currentTarget.value })}>
              {cutters.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </Labeled>
          <Labeled label="Second cut" hint="Choose the same enzyme, or none, for a single cut">
            <select class={FIELD} value={enzymeB} onChange={event => onSettings({ enzymeB: event.currentTarget.value })}>
              <option value="">(single cut)</option>
              {cutters.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </Labeled>
        </div>
        <div class="flex flex-wrap gap-4 text-xs">
          <label class="flex items-center gap-2"><input type="checkbox" checked={settings.includeFirst} onChange={event => onSettings({ includeFirst: event.currentTarget.checked })} /> Include the first restriction site in the product</label>
          <label class="flex items-center gap-2"><input type="checkbox" checked={settings.includeSecond} onChange={event => onSettings({ includeSecond: event.currentTarget.checked })} /> Include the second site</label>
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-400">The removed region runs from the first cut to the second, in the direction of the vector sequence. Bases opposite a 5′ overhang go into the homology; 3′ overhang bases do not.</p>
      </div>}
      {vector.topology === 'circular' && settings.linearize === 'pcr-caret' && <Labeled label="Insert before base (1-based)" hint={`The vector has ${vector.sequence.length.toLocaleString()} bp`}>
        <DecimalInput aria-label="Insert before base" class={`${FIELD} w-40`} value={caret} min={1} max={vector.sequence.length} step={1} onChange={value => onSettings({ caret: Math.min(vector.sequence.length, Math.max(1, Math.round(value))) })} />
      </Labeled>}
      {vector.topology === 'circular' && settings.linearize === 'pcr-region' && <div class="flex flex-wrap gap-3">
        <Labeled label="Replace from base (1-based)"><DecimalInput aria-label="Replace from base" class={`${FIELD} w-32`} value={settings.regionStart} min={1} step={1} onChange={value => onSettings({ regionStart: Math.max(1, Math.round(value)) })} /></Labeled>
        <Labeled label="to base (inclusive)"><DecimalInput aria-label="Replace to base" class={`${FIELD} w-32`} value={settings.regionEnd} min={1} step={1} onChange={value => onSettings({ regionEnd: Math.max(1, Math.round(value)) })} /></Labeled>
      </div>}
      {vector.topology === 'circular' && (settings.linearize === 'pcr-caret' || settings.linearize === 'pcr-region') && <div class="space-y-1">
        <Labeled label="Share of the vector homology carried by the vector primers" hint="0% = Takara’s rule: all on the insert primers. Higher values put part of the overlap on the vector primers (a Bio-Bench option, not in the Takara tool).">
          <input type="range" min={0} max={100} step={1} value={settings.vectorShare} aria-label="Share of the vector homology carried by the vector primers" onInput={event => onSettings({ vectorShare: Number(event.currentTarget.value) })} />
        </Labeled>
        {insertSources[0] && <p data-testid="share-summary" class="text-xs">{vectorRevTail} nt on vector_rev · {insertFwdTail} nt on {insertSources[0].document.name}_fwd</p>}
      </div>}
    </Section>}

    {design && <>
      <FindingsList findings={design.findings} />
      {pieces.length > 0 && <Section id="if-maps" title="Primer maps" aside="Where each primer binds; click the vector map to move the opening">
        <div class="grid gap-4 lg:grid-cols-2">
          {pieces.map((piece, index) => {
            const isVector = index === 0 && piece.topology === 'circular';
            const circularPcr = isVector && piece.kind === 'pcr';
            const n = piece.length;
            return <PrimerMap key={piece.sourceIndex} piece={piece} activeId={activeName} onActive={setActiveName}
              onPick={isVector ? position => onSettings({ linearize: 'pcr-caret', caret: Math.min(n, position + 1) }) : undefined}
              onRegion={isVector ? (start, end) => onSettings({ linearize: 'pcr-region', regionStart: start + 1, regionEnd: end }) : undefined}
              marker={circularPcr && settings.linearize === 'pcr-caret' ? { position: caret - 1, label: `Insert before ${caret}` } : undefined} />;
          })}
        </div>
      </Section>}
      {design.primers.length > 0 && <Section id="if-primers" title="Primers" aside="Extensions match Takara exactly at 0% sharing; the gene-specific part may differ by a base or two">
        <PrimerTable primers={infusionPrimers(design)} fileName="in-fusion" caption="In-Fusion primers" activeName={activeName} onActiveName={setActiveName} />
        <div>
          <h3 class="text-xs font-semibold">PCR reactions to run</h3>
          <ol class="mt-1 list-decimal space-y-0.5 pl-5 text-xs">
            {[...insertSources.map(source => ({ template: source.document.name, primers: design.primers.filter(primer => primer.target === source.document.name) })),
              ...(design.primers.some(primer => primer.role === 'vector') ? [{ template: vectorSource?.document.name ?? 'vector', primers: design.primers.filter(primer => primer.role === 'vector') }] : [])]
              .map(reaction => <li key={reaction.template}>{reaction.primers.map(primer => primer.name).join(' + ')} on template <strong>{reaction.template}</strong></li>)}
          </ol>
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-400">Gene-specific part: 18–25 nt, Tm 58–65 °C, at most 2 G/C in the last five bases (Takara guidelines), Tm by SantaLucia/Owczarzy. Takara’s own Tm formula is not public, so lengths can differ from its tool by a base or two; the homology extensions do not.</p>
      </Section>}
      {amounts && <Section id="if-protocol" title="Reaction" aside="Takara In-Fusion Snap Assembly manual">
        <div class="flex flex-wrap gap-3">
          <Labeled label="Vector (ng)"><DecimalInput aria-label="Vector amount (ng)" class={`${FIELD} w-28`} value={settings.vectorNg} min={10} step={10} onChange={value => onSettings({ vectorNg: Math.max(10, value) })} /></Labeled>
          <Labeled label="Vector (ng/µL)"><DecimalInput aria-label="Vector concentration (ng/µL)" class={`${FIELD} w-28`} value={settings.vectorConcentration} min={0.1} step={5} onChange={value => onSettings({ vectorConcentration: Math.max(0.1, value) })} /></Labeled>
          <Labeled label="Inserts (ng/µL)"><DecimalInput aria-label="Insert concentration (ng/µL)" class={`${FIELD} w-28`} value={settings.insertConcentration} min={0.1} step={5} onChange={value => onSettings({ insertConcentration: Math.max(0.1, value) })} /></Labeled>
        </div>
        <ProtocolCard protocol={infusionProtocol(amounts, vectorSource?.document.name ?? 'Vector')} />
      </Section>}
      {product && <Section id="if-product" title="Assembled product"><ProductPreview product={product} fileName="in-fusion-construct" marks={marks} segments={segments} /></Section>}
    </>}
  </div>;
}
