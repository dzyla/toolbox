import type { ComponentType } from 'preact';

export type Category = 'calculators' | 'sequences' | 'gels' | 'counting' | 'plates' | 'timing' | 'figures';
export interface ToolProps { projectId?: string }
export interface ToolMeta {
  id: string; name: string; category: Category; icon: string; blurb: string;
  keywords: string[]; hasProjects?: boolean; status?: 'ready' | 'legacy' | 'planned';
  /** Relative to the app base, for status 'legacy'. */
  legacyHref?: string;
  load?: () => Promise<{ default: ComponentType<ToolProps> }>;
}

export const CATEGORIES: Record<Category, { label: string; blurb: string; order: number }> = {
  calculators: { label: 'Calculators', blurb: 'Molarity, buffers, centrifuge, mixes', order: 1 },
  sequences:   { label: 'Sequences & Proteins', blurb: 'Protein parameters, DNA tools, alignment, binding', order: 2 },
  gels:        { label: 'Gels & Images', blurb: 'Annotate, quantify, measure', order: 3 },
  counting:    { label: 'Counting', blurb: 'Colonies, cells, tallies', order: 4 },
  plates:      { label: 'Plates & Culture', blurb: 'Layouts, seeding, passaging', order: 5 },
  timing:      { label: 'Timing & Protocols', blurb: 'Timers and step-by-step protocols', order: 6 },
  figures:     { label: 'Figures', blurb: 'Colours and export helpers', order: 7 },
};

const L = (file: string) => `legacy/${file}`;

export const TOOLS: ToolMeta[] = [
  { id: 'molarity', name: 'Molarity & Dilution', category: 'calculators', icon: '⚖️',
    blurb: 'Mass, moles, concentration and C1V1 = C2V2', keywords: ['molarity', 'dilution', 'c1v1', 'mass', 'moles', 'mw', 'stock'],
    status: 'ready', load: () => import('./molarity/View') },
  { id: 'buffers', name: 'Buffer & Media Recipes', category: 'calculators', icon: '🧪',
    blurb: 'Recipes from stocks and solids, hydrates, presets', keywords: ['buffer', 'recipe', 'tae', 'pbs', 'hepes', 'tris', 'media'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'centrifuge', name: 'Centrifuge', category: 'calculators', icon: '🌀',
    blurb: 'RPM ↔ RCF and k-factor', keywords: ['rpm', 'rcf', 'g force', 'rotor', 'k-factor', 'centrifuge'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'master-mix', name: 'Master Mix', category: 'calculators', icon: '🧫',
    blurb: 'Reaction mixes with excess and dead volume', keywords: ['pcr', 'master mix', 'reaction'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'ammonium-sulfate', name: 'Ammonium Sulfate', category: 'calculators', icon: '🧂',
    blurb: 'Salt to add for a saturation cut', keywords: ['ammonium sulfate', 'precipitation', 'saturation', 'salting out'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'cryoem', name: 'Cryo-EM', category: 'calculators', icon: '❄️',
    blurb: 'Pixel size, Nyquist, box sizes', keywords: ['cryo-em', 'nyquist', 'box size', 'pixel', 'em'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'protein', name: 'Protein Workbench', category: 'sequences', icon: '🧬',
    blurb: 'MW, pI, ε280, instability, digests, plots', keywords: ['protein', 'pi', 'extinction', 'protparam', 'mw', 'kda', 'digest'],
    status: 'legacy', legacyHref: L('protein_params.html') },
  { id: 'protein-conc', name: 'Protein Concentration', category: 'sequences', icon: '📏',
    blurb: 'A280 to mg/mL and µM', keywords: ['a280', 'concentration', 'nanodrop', 'bradford', 'bca'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'nucleic', name: 'Nucleic Acids', category: 'sequences', icon: '🧫',
    blurb: 'ng/µL to nM, Tm, oligo mass', keywords: ['dna', 'rna', 'tm', 'primer', 'oligo', 'a260'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'sequence', name: 'Sequence Viewer', category: 'sequences', icon: '🔤',
    blurb: 'View, edit and annotate sequences', keywords: ['sequence', 'fasta', 'viewer'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'align', name: 'Alignment', category: 'sequences', icon: '🔗',
    blurb: 'Pairwise global and local alignment', keywords: ['alignment', 'blosum', 'needleman', 'smith-waterman', 'align'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'binding', name: 'Binding Calculator', category: 'sequences', icon: '🧲',
    blurb: 'Kd, complex fractions, cooperativity, Ki', keywords: ['kd', 'binding', 'affinity', 'cheng-prusoff', 'hill', 'ki'],
    status: 'legacy', legacyHref: L('binding_calculator.html') },
  { id: 'gel', name: 'Gel / Blot', category: 'gels', icon: '🩻',
    blurb: 'Annotate lanes, ladders and bands; quantify', keywords: ['gel', 'blot', 'western', 'ladder', 'densitometry', 'band'],
    status: 'legacy', legacyHref: L('gel_annotator.html'), hasProjects: true },
  { id: 'measure', name: 'Image Measurer', category: 'gels', icon: '📐',
    blurb: 'Calibrate and measure distances and areas', keywords: ['measure', 'scale bar', 'distance', 'area', 'ruler'],
    status: 'planned' },
  { id: 'colonies', name: 'Colony Counter', category: 'counting', icon: '🔴',
    blurb: 'Count colonies on a plate photo, on device', keywords: ['colony', 'cfu', 'plate', 'count', 'plaque'],
    status: 'planned' },
  { id: 'hemocytometer', name: 'Hemocytometer', category: 'counting', icon: '🔬',
    blurb: 'Cell counts, viability and seeding', keywords: ['hemocytometer', 'cells', 'viability', 'trypan', 'count'],
    status: 'planned' },
  { id: 'tally', name: 'Tally Counter', category: 'counting', icon: '🔢',
    blurb: 'Named counters with limits', keywords: ['counter', 'tally'],
    status: 'planned' },
  { id: 'plate', name: 'Plate Layout', category: 'plates', icon: '🟦',
    blurb: 'Lay out 6 to 384 wells', keywords: ['plate', '96', '384', 'wells', 'layout'],
    status: 'planned' },
  { id: 'culture', name: 'Cell Culture', category: 'plates', icon: '🧫',
    blurb: 'Passaging and seeding density', keywords: ['cell culture', 'passage', 'seeding', 'confluence', 'doubling'],
    status: 'planned' },
  { id: 'timers', name: 'Timers', category: 'timing', icon: '⏱️',
    blurb: 'Multiple countdowns and a stopwatch', keywords: ['timer', 'stopwatch', 'countdown', 'alarm'],
    status: 'planned' },
  { id: 'protocols', name: 'Protocols', category: 'timing', icon: '📋',
    blurb: 'Step-by-step protocols with timers', keywords: ['protocol', 'steps', 'checklist'],
    status: 'planned', hasProjects: true },
  { id: 'colors', name: 'Figure Colours', category: 'figures', icon: '🎨',
    blurb: 'Palettes, colour-blind check, PyMOL export', keywords: ['colors', 'colours', 'palette', 'pymol', 'colorblind', 'viridis', 'matplotlib', 'contrast'],
    status: 'ready', load: () => import('./colors/View') },
];

export function findTool(id: string): ToolMeta | undefined { return TOOLS.find(t => t.id === id); }

export function searchTools(query: string): ToolMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOOLS;
  return TOOLS.filter(t => t.name.toLowerCase().includes(q) || t.blurb.toLowerCase().includes(q) || t.keywords.some(k => k.includes(q)));
}

export function toolsByCategory(tools: ToolMeta[] = TOOLS) {
  return (Object.keys(CATEGORIES) as Category[])
    .sort((a, b) => CATEGORIES[a].order - CATEGORIES[b].order)
    .map(category => ({ category, ...CATEGORIES[category], tools: tools.filter(t => t.category === category) }))
    .filter(g => g.tools.length > 0);
}
