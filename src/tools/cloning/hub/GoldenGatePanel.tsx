import { DecimalInput } from '@/app/components/DecimalInput';
import { dsDnaMolecularWeight, pmolToNg } from '@/core/cloning/amounts';
import type { CloningProtocol } from '@/core/cloning/protocol';
import type { GoldenGateSettings } from './state';
import { FIELD, Labeled, ProtocolCard, Section } from './results';

export const GG_ENZYMES = [
  { id: 'BsaI', name: 'BsaI-HFv2', site: 'GGTCTC (N1/N5)', temperatureC: 37, note: 'Most widely used; MoClo Level 1 and general assemblies' },
  { id: 'BsmBI', name: 'BsmBI-v2 / Esp3I', site: 'CGTCTC (N1/N5)', temperatureC: 42, note: 'MoClo Level 2 and higher; runs warmer' },
  { id: 'BbsI', name: 'BbsI-HF', site: 'GAAGAC (N2/N6)', temperatureC: 37, note: 'CRISPR guide cloning and MoClo Level 0' },
  { id: 'PaqCI', name: 'PaqCI', site: 'CACCTGC (N4/N8)', temperatureC: 37, note: '7-base site; suited to assemblies of five or more fragments' },
  { id: 'SapI', name: 'SapI', site: 'GCTCTTC (N1/N4)', temperatureC: 37, note: 'Makes 3-base overhangs' },
];

const FMOL = 40;

export function goldenGateProtocol(settings: GoldenGateSettings): CloningProtocol {
  const enzyme = GG_ENZYMES.find(item => item.id === settings.enzyme) ?? GG_ENZYMES[0]!;
  const vectorNg = pmolToNg(FMOL / 1000, settings.vectorBp);
  return {
    title: `Golden Gate assembly with ${enzyme.name}`,
    source: 'One-pot Type IIS digestion-ligation (Engler et al. 2009); amounts of 40 fmol per part; enzyme temperatures per NEB',
    reactions: [{
      title: 'Golden Gate reaction',
      totalVolumeUl: 20,
      components: [
        { name: 'Destination vector', amount: `${FMOL} fmol (${Number(vectorNg.toPrecision(3))} ng at ${settings.vectorBp.toLocaleString()} bp)`, volumeUl: 0 },
        { name: `${settings.fragmentCount} insert fragment${settings.fragmentCount === 1 ? '' : 's'}`, amount: `${FMOL} fmol each`, volumeUl: 0 },
        { name: 'T4 DNA Ligase Buffer', stock: '10X', volumeUl: 2 },
        { name: `Type IIS enzyme (${enzyme.name})`, volumeUl: 1 },
        { name: 'T4 DNA Ligase', volumeUl: 1 },
        { name: 'Nuclease-free water', volumeUl: null },
      ],
      notes: ['Volumes for the DNA depend on your stock concentrations; the DNA rows show amounts only. Calculate each volume as ng ÷ concentration.'],
    }],
    steps: [
      { text: `30 cycles: ${enzyme.temperatureC} °C for 3 minutes (digest), then 16 °C for 4 minutes (ligate).` },
      { text: 'Final digest: 50 °C for 5 minutes, which cuts remaining parental and mis-assembled products.', temperatureC: 50, minutes: 5 },
      { text: 'Heat inactivate at 80 °C for 5 minutes.', temperatureC: 80, minutes: 5 },
      { text: 'Transform 2–5 µL into competent cells.' },
    ],
  };
}

export function GoldenGatePanel({ settings, onSettings }: { settings: GoldenGateSettings; onSettings: (patch: Partial<GoldenGateSettings>) => void }) {
  const enzyme = GG_ENZYMES.find(item => item.id === settings.enzyme) ?? GG_ENZYMES[0]!;
  return <div class="space-y-4">
    <Section id="gg-settings" title="Golden Gate planning calculator" aside="Amounts and cycling only; overhang design is planned for a later release">
      <div class="grid gap-3 sm:grid-cols-3">
        <Labeled label="Type IIS enzyme" hint={enzyme.note}>
          <select class={FIELD} value={settings.enzyme} onChange={event => onSettings({ enzyme: event.currentTarget.value })}>
            {GG_ENZYMES.map(item => <option key={item.id} value={item.id}>{item.name} — {item.site}</option>)}
          </select>
        </Labeled>
        <Labeled label="Destination vector size (bp)">
          <DecimalInput aria-label="Destination vector size (bp)" class={FIELD} value={settings.vectorBp} min={500} step={100} onChange={value => onSettings({ vectorBp: Math.max(500, Math.round(value)) })} />
        </Labeled>
        <Labeled label="Insert fragments">
          <DecimalInput aria-label="Insert fragments" class={FIELD} value={settings.fragmentCount} min={1} max={30} step={1} onChange={value => onSettings({ fragmentCount: Math.min(30, Math.max(1, Math.round(value))) })} />
        </Labeled>
      </div>
      <p class="text-xs text-slate-600 dark:text-slate-400">Molecular weight of a {settings.vectorBp.toLocaleString()} bp vector: {Math.round(dsDnaMolecularWeight(settings.vectorBp)).toLocaleString()} g/mol.</p>
    </Section>
    <Section id="gg-protocol" title="Reaction and cycling"><ProtocolCard protocol={goldenGateProtocol(settings)} /></Section>
  </div>;
}
