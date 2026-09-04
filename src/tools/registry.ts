import type { ComponentType } from 'preact';

export type Category = 'calculators' | 'sequences' | 'gels' | 'counting' | 'plates' | 'timing' | 'figures';
export interface ToolProps { projectId?: string }
export interface ToolMeta {
  id: string; name: string; category: Category; icon: string; blurb: string;
  keywords: string[]; hasProjects?: boolean; status?: 'ready' | 'porting' | 'planned';
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

export const TOOLS: ToolMeta[] = [
  { id: 'molarity', name: 'Molarity & Dilution', category: 'calculators', icon: '⚖️',
    blurb: 'Mass, moles, concentration and C1V1 = C2V2', keywords: ['molarity', 'dilution', 'c1v1', 'mass', 'moles', 'mw', 'stock'],
    status: 'ready', load: () => import('./molarity/View') },
  { id: 'buffers', name: 'Buffer & Media Recipes', category: 'calculators', icon: '🧪',
    blurb: 'Recipes from stocks and solids, hydrates, presets', keywords: ['buffer', 'recipe', 'tae', 'pbs', 'hepes', 'tris', 'media'],
    status: 'ready', load: () => import('./buffers/View') },
  { id: 'centrifuge', name: 'Centrifuge', category: 'calculators', icon: '🌀',
    blurb: 'RPM ↔ RCF and k-factor', keywords: ['rpm', 'rcf', 'g force', 'rotor', 'k-factor', 'centrifuge'],
    status: 'ready', load: () => import('./centrifuge/View') },
  { id: 'master-mix', name: 'Master Mix', category: 'calculators', icon: '🧫',
    blurb: 'Reaction mixes with excess and dead volume', keywords: ['pcr', 'master mix', 'reaction'],
    status: 'ready', load: () => import('./master-mix/View') },
  { id: 'ammonium-sulfate', name: 'Ammonium Sulfate', category: 'calculators', icon: '🧂',
    blurb: 'Salt to add for a saturation cut', keywords: ['ammonium sulfate', 'precipitation', 'saturation', 'salting out'],
    status: 'ready', load: () => import('./ammonium-sulfate/View') },
  { id: 'cryoem', name: 'Cryo-EM', category: 'calculators', icon: '❄️',
    blurb: 'Pixel size, Nyquist, box sizes', keywords: ['cryo-em', 'nyquist', 'box size', 'pixel', 'em'],
    status: 'ready', load: () => import('./cryoem/View') },
  { id: 'fitting', name: 'Curve Fitting', category: 'calculators', icon: '📈',
    blurb: 'Fit 4PL (EC50), linear, Michaelis-Menten, and exponential models', keywords: ['fit', 'curve', 'regression', 'logistic', '4pl', 'ic50', 'ec50', 'exponential', 'michaelis-menten', 'linear', 'r2', 'residuals'],
    status: 'ready', load: () => import('./fitting/View') },
  { id: 'sec', name: 'SEC Calibration', category: 'calculators', icon: '🧪',
    blurb: 'Column calibration (Kav, Stokes radius, MW ↔ Ve)', keywords: ['sec', 'gel filtration', 'chromatography', 'superdex', 'superose', 'kav', 'stokes radius', 'molecular weight', 'fplc', 'akta'],
    status: 'ready', load: () => import('./sec/View') },
  { id: 'diafiltration', name: 'Ultrafiltration & Dialysis', category: 'calculators', icon: '🔄',
    blurb: 'Centrifugal spin concentrator cycles (DFV) and dialysis kinetics', keywords: ['diafiltration', 'ultrafiltration', 'dialysis', 'amicon', 'vivaspin', 'mwco', 'buffer exchange', 'desalting', 'dfv'],
    status: 'ready', load: () => import('./diafiltration/View') },
  { id: 'protein', name: 'Protein Workbench', category: 'sequences', icon: '🧬',
    blurb: 'MW, pI, ε280, instability, digests, plots', keywords: ['protein', 'pi', 'extinction', 'protparam', 'mw', 'kda', 'digest'],
    status: 'ready', load: () => import('./protein/View') },
  { id: 'protein-conc', name: 'Protein Concentration', category: 'sequences', icon: '📏',
    blurb: 'A280 to mg/mL and µM', keywords: ['a280', 'concentration', 'nanodrop', 'bradford', 'bca'],
    status: 'ready', load: () => import('./protein-conc/View') },
  { id: 'nucleic', name: 'Nucleic Acids', category: 'sequences', icon: '🧫',
    blurb: 'ng/µL to nM, Tm, oligo mass', keywords: ['dna', 'rna', 'tm', 'primer', 'oligo', 'a260'],
    status: 'ready', load: () => import('./nucleic/View') },
  { id: 'sequence', name: 'Sequence Viewer', category: 'sequences', icon: '🔤',
    blurb: 'View, edit and annotate sequences', keywords: ['sequence', 'fasta', 'viewer'],
    status: 'ready', load: () => import('./sequence/View') },
  { id: 'plasmid', name: 'Plasmid Viewer', category: 'sequences', icon: '⭕',
    blurb: 'Circular & linear plasmid maps, ORFs, features, restriction sites', keywords: ['plasmid', 'snapgene', 'map', 'circular', 'restriction', 'orf', 'vector'],
    status: 'ready', load: () => import('./plasmid/View') },
  { id: 'cloning', name: 'Cloning Suite', category: 'sequences', icon: '🧬',
    blurb: 'Unified cloning suite: Gibson/In-Fusion, Mutagenesis, Restriction & Ligation, Golden Gate', keywords: ['cloning', 'gibson', 'infusion', 'mutagenesis', 'restriction', 'ligation', 'golden gate', 'assembly'],
    status: 'ready', load: () => import('./cloning/View') },
  { id: 'rare-codons', name: 'Rare Codon Optimizer', category: 'sequences', icon: '⚠️',
    blurb: 'Codon Adaptation Index (CAI), pause clusters, and Rosetta strain advisor', keywords: ['codon', 'rare codon', 'cai', 'expression', 'rosetta', 'bl21', 'synonymous', 'translation', 'pause'],
    status: 'ready', load: () => import('./rare-codons/View') },
  { id: 'align', name: 'Alignment', category: 'sequences', icon: '🔗',
    blurb: 'Pairwise global and local alignment', keywords: ['alignment', 'blosum', 'needleman', 'smith-waterman', 'align'],
    status: 'ready', load: () => import('./align/View') },
  { id: 'seq-matrix', name: 'Sequence Identity Matrix', category: 'sequences', icon: '🧬',
    blurb: 'Multi-sequence identity & similarity matrix with heatmap, Clustal MSA, and conservation', keywords: ['matrix', 'identity', 'similarity', 'heatmap', 'msa', 'multiple sequence alignment', 'clustal', 'blosum62', 'phylogeny', 'pairwise', 'conservation'],
    status: 'ready', load: () => import('./seq-matrix/View') },
  { id: 'binding', name: 'Binding Calculator', category: 'sequences', icon: '🧲',
    blurb: 'Kd, complex fractions, cooperativity, Ki', keywords: ['kd', 'binding', 'affinity', 'cheng-prusoff', 'hill', 'ki'],
    status: 'ready', load: () => import('./binding/View') },
  { id: 'gel', name: 'Gel / Blot', category: 'gels', icon: '🩻',
    blurb: 'Annotate lanes, ladders and bands; quantify', keywords: ['gel', 'blot', 'western', 'ladder', 'densitometry', 'band'],
    status: 'ready', hasProjects: true, load: () => import('./gel/View') },
  { id: 'measure', name: 'Image Measurer', category: 'gels', icon: '📐',
    blurb: 'Calibrate and measure distances and areas', keywords: ['measure', 'scale bar', 'distance', 'area', 'ruler'],
    status: 'ready', load: () => import('./measure/View') },
  { id: 'colonies', name: 'Colony Counter', category: 'counting', icon: '🔴',
    blurb: 'Count colonies on a plate photo, on device', keywords: ['colony', 'cfu', 'plate', 'count', 'plaque'],
    status: 'ready', load: () => import('./colonies/View') },
  { id: 'hemocytometer', name: 'Hemocytometer', category: 'counting', icon: '🔬',
    blurb: 'Cell counts, viability and seeding', keywords: ['hemocytometer', 'cells', 'viability', 'trypan', 'count'],
    status: 'ready', load: () => import('./hemocytometer/View') },
  { id: 'tally', name: 'Tally Counter', category: 'counting', icon: '🔢',
    blurb: 'Named counters with limits', keywords: ['counter', 'tally'],
    status: 'ready', load: () => import('./tally/View') },
  { id: 'plate', name: 'Plate Layout', category: 'plates', icon: '🟦',
    blurb: 'Lay out 6 to 384 wells', keywords: ['plate', '96', '384', 'wells', 'layout'],
    status: 'ready', load: () => import('./plate/View') },
  { id: 'culture', name: 'Cell Culture', category: 'plates', icon: '🧫',
    blurb: 'Passaging and seeding density', keywords: ['cell culture', 'passage', 'seeding', 'confluence', 'doubling'],
    status: 'ready', load: () => import('./culture/View') },
  { id: 'timers', name: 'Timers', category: 'timing', icon: '⏱️',
    blurb: 'Multiple countdowns and a stopwatch', keywords: ['timer', 'stopwatch', 'countdown', 'alarm'],
    status: 'ready', load: () => import('./timers/View') },
  { id: 'protocols', name: 'Protocols', category: 'timing', icon: '📋',
    blurb: 'Step-by-step protocols with timers', keywords: ['protocol', 'steps', 'checklist'],
    status: 'ready', hasProjects: true, load: () => import('./protocols/View') },
  { id: 'colors', name: 'Figure Colours', category: 'figures', icon: '🎨',
    blurb: 'Palettes, colour-blind check, PyMOL export', keywords: ['colors', 'colours', 'palette', 'pymol', 'colorblind', 'viridis', 'matplotlib', 'contrast'],
    status: 'ready', load: () => import('./colors/View') },
];

export function findTool(id: string): ToolMeta | undefined {
  if (id === 'gibson' || id === 'mutagenesis') {
    return TOOLS.find(t => t.id === 'cloning');
  }
  return TOOLS.find(t => t.id === id);
}

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
