import { useMemo } from 'preact/hooks';
import { designLigation, ligationProtocol } from '@/core/cloning/methods/ligation';
import { cutCounts, ENZYME_TABLE } from '@/core/cloning/digest';
import { describeEnd, moleculeFromDocument } from '@/core/cloning/molecule';
import { DecimalInput } from '@/app/components/DecimalInput';
import type { HubSource, LigationSettings } from './state';
import { singleCutters, suggestPair } from './enzymes';
import { FIELD, FindingsList, Labeled, ProtocolCard, Section } from './results';
import { ProductPreview } from './ProductPreview';
import { ligationMarks } from '@/core/cloning/products';

interface Props {
  sources: HubSource[];
  settings: LigationSettings;
  onSettings: (patch: Partial<LigationSettings>) => void;
}

/** Enzymes that cut a molecule once or twice, NEB enzymes first (the ends of an insert are cut, not its middle). */
function endCutters(molecule: { sequence: string; topology: 'linear' | 'circular' }): string[] {
  const counts = cutCounts(molecule, ENZYME_TABLE);
  return ENZYME_TABLE.filter(enzyme => (counts.get(enzyme.name) ?? 0) >= 1 && (counts.get(enzyme.name) ?? 0) <= 2)
    .map(enzyme => enzyme.name)
    .sort((a, b) => Number((ENZYME_TABLE.find(e => e.name === b)?.suppliers ?? '').includes('N')) - Number((ENZYME_TABLE.find(e => e.name === a)?.suppliers ?? '').includes('N')) || a.localeCompare(b));
}

export function LigationPanel({ sources, settings, onSettings }: Props) {
  const vectorSource = sources.find(source => source.role === 'vector');
  const insertSource = sources.find(source => source.role === 'insert');
  const vector = useMemo(() => vectorSource ? moleculeFromDocument(vectorSource.document) : null, [vectorSource]);
  const insert = useMemo(() => insertSource ? moleculeFromDocument(insertSource.document) : null, [insertSource]);
  const vectorList = useMemo(() => vector && vector.topology === 'circular' ? singleCutters(vector) : [], [vector]);
  const insertList = useMemo(() => insert ? endCutters(insert) : [], [insert]);

  const [autoA, autoB] = suggestPair(vectorList);
  const vectorA = vectorList.includes(settings.vectorEnzymeA) ? settings.vectorEnzymeA : autoA;
  const vectorB = settings.vectorEnzymeB === 'auto' ? autoB : settings.vectorEnzymeB === '' || vectorList.includes(settings.vectorEnzymeB) ? settings.vectorEnzymeB : autoB;
  const vectorEnzymes = vector && vector.topology === 'circular' ? [vectorA, ...(vectorB && vectorB !== vectorA ? [vectorB] : [])].filter(Boolean) : [];
  // The insert defaults to the vector's enzymes when it has sites for them (directional cloning).
  const insertDefault = (name: string) => vectorEnzymes.includes(name) && insertList.includes(name) ? name : '';
  const insertA = settings.insertEnzymeA === 'auto' ? insertDefault(vectorEnzymes[0] ?? '') : settings.insertEnzymeA;
  const insertB = settings.insertEnzymeB === 'auto' ? insertDefault(vectorEnzymes[1] ?? '') : settings.insertEnzymeB;
  const insertEnzymes = insert && (insert.topology === 'circular' || insertA || insertB) ? [insertA, ...(insertB && insertB !== insertA ? [insertB] : [])].filter(Boolean) : [];

  const design = useMemo(() => vector && insert
    ? designLigation({
      vector, insert, vectorEnzymes, insertEnzymes,
      vectorFragment: settings.vectorFragment >= 0 ? settings.vectorFragment : undefined,
      insertFragment: settings.insertFragment >= 0 ? settings.insertFragment : undefined,
      makeBlunt: settings.makeBlunt, dephosphorylateVector: settings.dephosphorylateVector, phosphorylateInsert: settings.phosphorylateInsert,
    })
    : null, [vector, insert, vectorEnzymes.join('+'), insertEnzymes.join('+'), settings.vectorFragment, settings.insertFragment, settings.makeBlunt, settings.dephosphorylateVector, settings.phosphorylateInsert]);

  const protocol = design ? ligationProtocol(design, { vectorNg: settings.vectorNg, ratio: settings.ratio, vectorNgPerUl: settings.vectorConcentration, insertNgPerUl: settings.insertConcentration }) : null;
  const optionList = (list: string[], none?: string) => <>{none !== undefined && <option value="">{none}</option>}{list.map(name => <option key={name} value={name}>{name}</option>)}</>;

  return <div class="space-y-4">
    {(!vectorSource || !insertSource) && <p class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-400">Add a vector (role “Vector”) and an insert above.</p>}
    {vector && insert && <Section id="lg-settings" title="2 · Enzymes and ends" aside="Sticky ends pair by overhang; BamHI and BglII ends are compatible">
      <div class="grid gap-3 sm:grid-cols-2">
        {vector.topology === 'circular' ? <>
          <Labeled label="Vector: first enzyme" hint="Single cutters only"><select class={FIELD} value={vectorA} onChange={event => onSettings({ vectorEnzymeA: event.currentTarget.value })}>{optionList(vectorList)}</select></Labeled>
          <Labeled label="Vector: second enzyme"><select class={FIELD} value={vectorB} onChange={event => onSettings({ vectorEnzymeB: event.currentTarget.value })}>{optionList(vectorList, '(single cut)')}</select></Labeled>
        </> : <p class="text-xs text-slate-600 dark:text-slate-400 sm:col-span-2">The vector is linear and is used as it is.</p>}
        <Labeled label={insert.topology === 'circular' ? 'Insert source: first enzyme' : 'Insert: first enzyme'} hint="Enzymes that cut once or twice"><select class={FIELD} value={insertA} onChange={event => onSettings({ insertEnzymeA: event.currentTarget.value })}>{optionList(insertList, '(none: use as it is)')}</select></Labeled>
        <Labeled label="Insert: second enzyme"><select class={FIELD} value={insertB} onChange={event => onSettings({ insertEnzymeB: event.currentTarget.value })}>{optionList(insertList, '(same as first / none)')}</select></Labeled>
      </div>
      <div class="flex flex-wrap gap-4 text-xs">
        <label class="flex items-center gap-2"><input type="checkbox" checked={settings.makeBlunt} onChange={event => onSettings({ makeBlunt: event.currentTarget.checked })} /> Make both ends blunt (fill in 5′ overhangs, chew back 3′)</label>
        <label class="flex items-center gap-2"><input type="checkbox" checked={settings.dephosphorylateVector} onChange={event => onSettings({ dephosphorylateVector: event.currentTarget.checked })} /> Dephosphorylate the vector (rSAP / CIP)</label>
        <label class="flex items-center gap-2"><input type="checkbox" checked={settings.phosphorylateInsert} onChange={event => onSettings({ phosphorylateInsert: event.currentTarget.checked })} /> Phosphorylate the insert (T4 PNK)</label>
      </div>
      {design && design.vectorChoices.length > 2 && <Labeled label="Vector fragment to use"><select class={FIELD} value={settings.vectorFragment} onChange={event => onSettings({ vectorFragment: Number(event.currentTarget.value) })}>
        <option value={-1}>Automatic (largest)</option>{design.vectorChoices.map(choice => <option key={choice.index} value={choice.index}>Fragment {choice.index + 1}: {choice.length.toLocaleString()} bp ({choice.leftEnzyme ?? 'end'} → {choice.rightEnzyme ?? 'end'})</option>)}
      </select></Labeled>}
      {design && design.insertChoices.length > 1 && <Labeled label="Insert fragment to use"><select class={FIELD} value={settings.insertFragment} onChange={event => onSettings({ insertFragment: Number(event.currentTarget.value) })}>
        <option value={-1}>Automatic (smallest between two cuts)</option>{design.insertChoices.map(choice => <option key={choice.index} value={choice.index}>Fragment {choice.index + 1}: {choice.length.toLocaleString()} bp ({choice.leftEnzyme ?? 'end'} → {choice.rightEnzyme ?? 'end'})</option>)}
      </select></Labeled>}
    </Section>}

    {design && <>
      <FindingsList findings={design.findings} />
      {design.vectorFragment && design.insertFragment && <Section id="lg-ends" title="Fragments and ends">
        <div class="overflow-x-auto"><table class="w-full border-collapse text-left text-xs">
          <caption class="sr-only">Fragments to ligate and their ends</caption>
          <thead class="text-slate-600 dark:text-slate-400"><tr><th scope="col" class="py-1 pr-3">Fragment</th><th scope="col" class="py-1 pr-3 text-right">Length</th><th scope="col" class="py-1 pr-3">Left end</th><th scope="col" class="py-1">Right end</th></tr></thead>
          <tbody>{[['Vector', design.vectorFragment] as const, ['Insert', design.insertFragment] as const].map(([label, molecule]) => <tr key={label} class="border-t border-slate-200 dark:border-slate-700">
            <th scope="row" class="py-1.5 pr-3 font-medium">{label}: {molecule.name}</th>
            <td class="py-1.5 pr-3 text-right tabular-nums">{molecule.sequence.length.toLocaleString()} bp</td>
            <td class="py-1.5 pr-3 font-mono">{describeEnd(molecule, 'left')}</td>
            <td class="py-1.5 font-mono">{describeEnd(molecule, 'right')}</td>
          </tr>)}</tbody>
        </table></div>
        {design.product && <p class="text-xs">
          {design.directional ? 'Directional: only one orientation of the insert can ligate.' : 'Not directional: the insert can ligate either way round.'}
          {design.insertFlipped ? ' The insert is used in the reverse orientation of its source.' : ''}
          {' '}Junctions: {design.junctions.map(junction => junction.description).join(' | ')}.
          {design.regeneratedSites.some(names => names.length) ? ` Sites regenerated: ${design.regeneratedSites.map(names => names.join(', ') || 'none').join(' | ')}.` : ' No enzyme site is regenerated at the junctions.'}
        </p>}
      </Section>}
      {protocol && <Section id="lg-protocol" title="Reaction" aside="NEB T4 DNA Ligase protocol; insert mass from the NEBioCalculator formula">
        <div class="flex flex-wrap gap-3">
          <Labeled label="Vector (ng)"><DecimalInput aria-label="Vector amount (ng)" class={`${FIELD} w-28`} value={settings.vectorNg} min={1} step={5} onChange={value => onSettings({ vectorNg: Math.max(1, value) })} /></Labeled>
          <Labeled label="Insert : vector (molar)"><DecimalInput aria-label="Insert to vector molar ratio" class={`${FIELD} w-28`} value={settings.ratio} min={0.1} step={1} onChange={value => onSettings({ ratio: Math.max(0.1, value) })} /></Labeled>
          <Labeled label="Vector (ng/µL)"><DecimalInput aria-label="Vector concentration (ng/µL)" class={`${FIELD} w-28`} value={settings.vectorConcentration} min={0.1} step={5} onChange={value => onSettings({ vectorConcentration: Math.max(0.1, value) })} /></Labeled>
          <Labeled label="Insert (ng/µL)"><DecimalInput aria-label="Insert concentration (ng/µL)" class={`${FIELD} w-28`} value={settings.insertConcentration} min={0.1} step={5} onChange={value => onSettings({ insertConcentration: Math.max(0.1, value) })} /></Labeled>
        </div>
        <ProtocolCard protocol={protocol} />
      </Section>}
      {design.product && <Section id="lg-product" title="Ligation product"><ProductPreview product={design.product} fileName="ligation-product" marks={ligationMarks(design.junctions)} /></Section>}
    </>}
  </div>;
}
