/**
 * Protocol parser, step-by-step checklist, and bundled molecular biology protocols.
 */

export interface ProtocolStep {
  id: string;
  text: string;
  completed: boolean;
  timerMinutes?: number;
  notes?: string;
  critical?: boolean;
}

export interface Protocol {
  id: string;
  title: string;
  category: string;
  description: string;
  materials?: string[];
  steps: ProtocolStep[];
}

/** Parse markdown text into a structured Protocol */
export function parseMarkdownProtocol(markdown: string): Protocol {
  const lines = markdown.split(/\r?\n/);
  let title = 'Custom Protocol';
  const category = 'General';
  const description = '';
  const materials: string[] = [];
  const steps: ProtocolStep[] = [];

  let inMaterials = false;
  let stepIdx = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      title = trimmed.slice(2).trim();
      continue;
    }
    if (trimmed.startsWith('## Materials') || trimmed.startsWith('### Reagents')) {
      inMaterials = true;
      continue;
    }
    if (trimmed.startsWith('## Procedure') || trimmed.startsWith('## Steps')) {
      inMaterials = false;
      continue;
    }

    if (inMaterials && (trimmed.startsWith('- ') || trimmed.startsWith('* '))) {
      materials.push(trimmed.slice(2).trim());
      continue;
    }

    // Check for checkbox step: - [ ] or - [x] or 1. [ ]
    const stepMatch = trimmed.match(/^(?:[-*]|\d+\.)\s+\[([ xX])\]\s+(.+)$/);
    if (stepMatch) {
      const isDone = stepMatch[1]?.toLowerCase() === 'x';
      const text = stepMatch[2]!;

      // Extract timer if specified: [timer: 15 min] or [timer 10m] or (10 min)
      let timerMinutes: number | undefined;
      const timerMatch = text.match(/\[timer:\s*(\d+(?:\.\d+)?)\s*(?:min|m)?\]/i) || text.match(/\b(?:incubate|spin|wait|heat|rest)\s*(?:for)?\s*(\d+(?:\.\d+)?)\s*min/i);
      if (timerMatch) {
        timerMinutes = parseFloat(timerMatch[1]!);
      }

      const isCritical = /critical|immediately|exact|careful|do not exceed/i.test(text);

      steps.push({
        id: `step-${stepIdx++}`,
        text,
        completed: isDone,
        timerMinutes,
        critical: isCritical,
      });
    }
  }

  return {
    id: `protocol-${Date.now()}`,
    title,
    category,
    description,
    materials: materials.length > 0 ? materials : undefined,
    steps,
  };
}

export const BUNDLED_PROTOCOLS: Protocol[] = [
  {
    id: 'miniprep',
    title: 'Plasmid DNA Miniprep (Alkaline Lysis)',
    category: 'Molecular Biology',
    description: 'Isolation of high-purity plasmid DNA from 1–5 mL bacterial culture using silica-column alkaline lysis.',
    materials: [
      'Bacterial culture (overnight in LB + antibiotic)',
      'Resuspension Buffer P1 (with RNase A)',
      'Lysis Buffer P2 (NaOH / SDS)',
      'Neutralization Buffer P3 (Potassium Acetate)',
      'Wash Buffer PB / PE (with ethanol)',
      'Elution Buffer EB (10 mM Tris-Cl, pH 8.5) or sterile nuclease-free water',
      'Silica spin columns and collection tubes',
    ],
    steps: [
      { id: 'm1', text: 'Pellet 1.5–3 mL overnight bacterial culture by centrifugation at 8,000 × g for 3 min at room temperature. Discard supernatant thoroughly.', completed: false, timerMinutes: 3 },
      { id: 'm2', text: 'Resuspend pellet completely in 250 µL Buffer P1 (vortex or pipet up and down until no cell clumps remain).', completed: false },
      { id: 'm3', text: 'Add 250 µL Buffer P2 and invert tube gently 4–6 times. Do not vortex. Incubate at room temperature for up to 4 min (CRITICAL: do not exceed 5 min to prevent irreversible plasmid denaturation).', completed: false, timerMinutes: 4, critical: true },
      { id: 'm4', text: 'Add 350 µL Buffer P3 and invert immediately 4–6 times until lysate becomes cloudy with white precipitate.', completed: false, critical: true },
      { id: 'm5', text: 'Centrifuge at maximum speed (≥ 13,000 × g) for 10 min at room temperature.', completed: false, timerMinutes: 10 },
      { id: 'm6', text: 'Carefully transfer clear supernatant (~800 µL) into a silica spin column. Avoid disturbing the white debris pellet.', completed: false },
      { id: 'm7', text: 'Centrifuge spin column at 13,000 × g for 1 min. Discard flow-through.', completed: false, timerMinutes: 1 },
      { id: 'm8', text: 'Wash column with 750 µL Buffer PE (containing ethanol). Centrifuge at 13,000 × g for 1 min. Discard flow-through.', completed: false, timerMinutes: 1 },
      { id: 'm9', text: 'Centrifuge empty column at 13,000 × g for an additional 1 min to remove residual wash buffer ethanol.', completed: false, timerMinutes: 1, critical: true },
      { id: 'm10', text: 'Place column into a clean 1.5 mL tube. Add 50 µL Elution Buffer EB to the center of the silica membrane. Incubate at room temp for 1 min.', completed: false, timerMinutes: 1 },
      { id: 'm11', text: 'Centrifuge at 13,000 × g for 1 min to elute pure plasmid DNA. Store at -20 °C.', completed: false, timerMinutes: 1 },
    ],
  },
  {
    id: 'transformation',
    title: 'Heat-Shock Transformation of Chemically Competent Cells',
    category: 'Molecular Biology',
    description: 'Introduction of plasmid DNA into chemically competent E. coli (DH5α, BL21(DE3), TOP10).',
    materials: [
      'Chemically competent E. coli cells (stored at -80 °C)',
      'Plasmid DNA (1–10 ng) or ligation mixture (2–5 µL)',
      'SOC or LB recovery medium',
      'Selective agar plates with appropriate antibiotic',
      'Water bath pre-heated to 42 °C',
      'Ice bucket',
    ],
    steps: [
      { id: 't1', text: 'Thaw competent cells slowly on wet ice for 10–15 min. Pre-warm SOC medium to 37 °C and agar plates.', completed: false, timerMinutes: 10 },
      { id: 't2', text: 'Add 1–5 µL (10–50 ng) of plasmid DNA directly to 50 µL competent cells. Swirl tube gently; do not pipet up and down or vortex.', completed: false },
      { id: 't3', text: 'Incubate cell-DNA mixture on ice for 30 min.', completed: false, timerMinutes: 30 },
      { id: 't4', text: 'Heat-shock cells in a 42 °C water bath for exactly 45 seconds (CRITICAL: timing is essential for high transformation efficiency).', completed: false, timerMinutes: 0.75, critical: true },
      { id: 't5', text: 'Quickly transfer tubes back onto wet ice and chill for 2 min.', completed: false, timerMinutes: 2 },
      { id: 't6', text: 'Aseptically add 450 µL of room-temperature SOC medium to each tube.', completed: false },
      { id: 't7', text: 'Incubate shaking at 37 °C (225 rpm) for 60 min to express antibiotic resistance genes.', completed: false, timerMinutes: 60 },
      { id: 't8', text: 'Spread 50–100 µL of transformed culture onto pre-warmed selective agar plates. Incubate inverted at 37 °C overnight (14–16 h).', completed: false },
    ],
  },
  {
    id: 'sds-page',
    title: 'SDS-PAGE Gel Electrophoresis',
    category: 'Protein Biochemistry',
    description: 'Denaturing polyacrylamide gel electrophoresis for protein separation by molecular weight.',
    materials: [
      'Precast or freshly poured Tris-Glycine polyacrylamide gel',
      '1× SDS-PAGE Running Buffer (25 mM Tris, 192 mM Glycine, 0.1% SDS)',
      '4× or 2× Laemmli Sample Loading Buffer (with beta-mercaptoethanol or DTT)',
      'Prestained protein molecular weight ladder',
      'Heating block at 95 °C',
      'Electrophoresis chamber and power supply',
    ],
    steps: [
      { id: 's1', text: 'Mix protein samples with sample loading buffer (e.g. 3 parts sample + 1 part 4× Laemmli buffer).', completed: false },
      { id: 's2', text: 'Heat samples in heating block at 95 °C for 5 min to completely denature proteins.', completed: false, timerMinutes: 5 },
      { id: 's3', text: 'Centrifuge tubes briefly at 10,000 × g for 30 seconds to collect condensation.', completed: false, timerMinutes: 0.5 },
      { id: 's4', text: 'Assemble gel cassette into electrophoresis tank and fill inner and outer chambers with 1× Running Buffer. Wash wells thoroughly with a syringe or pipet.', completed: false },
      { id: 's5', text: 'Load 5–10 µL of prestained protein ladder into lane 1, then load 10–25 µL of denatured protein samples into adjacent wells.', completed: false },
      { id: 's6', text: 'Run gel at 80 V through the stacking gel (~15 min) until dye front enters resolving gel, then increase to 120–150 V for 60 min until dye front reaches bottom.', completed: false, timerMinutes: 60 },
      { id: 's7', text: 'Turn off power supply, disassemble cassette, and proceed to Coomassie staining or Western blot transfer.', completed: false },
    ],
  },
  {
    id: 'western-blot',
    title: 'Western Blot (Wet Transfer & Chemiluminescent Detection)',
    category: 'Protein Biochemistry',
    description: 'Electrophoretic transfer of proteins from SDS-PAGE to PVDF membrane and detection via primary/secondary HRP antibodies.',
    materials: [
      'Resolved SDS-PAGE gel',
      'PVDF or Nitrocellulose membrane (0.2 or 0.45 µm)',
      '100% Methanol (for PVDF activation)',
      '1× Transfer Buffer (25 mM Tris, 192 mM Glycine, 20% Methanol)',
      '1× TBST (Tris-buffered saline with 0.1% Tween-20)',
      'Blocking Buffer (5% w/v non-fat dry milk in TBST)',
      'Primary antibody and HRP-conjugated secondary antibody',
      'ECL Chemiluminescent substrate',
    ],
    steps: [
      { id: 'w1', text: 'Activate PVDF membrane in 100% methanol for 1 min, rinse in deionized water for 2 min, then equilibrate in 1× Transfer Buffer for 5 min.', completed: false, timerMinutes: 5 },
      { id: 'w2', text: 'Equilibrate SDS-PAGE gel and transfer filter pads in 1× Transfer Buffer for 10 min.', completed: false, timerMinutes: 10 },
      { id: 'w3', text: 'Assemble transfer sandwich: Cathode (-) -> Sponge -> Filter Paper -> Gel -> Membrane -> Filter Paper -> Sponge -> Anode (+). Roll out air bubbles carefully.', completed: false, critical: true },
      { id: 'w4', text: 'Place cassette in transfer tank with ice pack and stir bar. Run wet transfer at 100 V for 60 min at 4 °C.', completed: false, timerMinutes: 60 },
      { id: 'w5', text: 'Disassemble sandwich. Block membrane in 5% milk in TBST for 60 min at room temperature with gentle rocking.', completed: false, timerMinutes: 60 },
      { id: 'w6', text: 'Incubate membrane with primary antibody diluted in 5% milk/TBST overnight at 4 °C (or 2 h at room temp).', completed: false, timerMinutes: 120 },
      { id: 'w7', text: 'Wash membrane 3 times for 10 min each with TBST on an orbital shaker.', completed: false, timerMinutes: 30 },
      { id: 'w8', text: 'Incubate with HRP-conjugated secondary antibody (1:5,000–1:10,000) for 60 min at room temperature.', completed: false, timerMinutes: 60 },
      { id: 'w9', text: 'Wash membrane 3 times for 10 min each with TBST.', completed: false, timerMinutes: 30 },
      { id: 'w10', text: 'Mix equal volumes of ECL Luminol and Peroxide solutions. Apply to membrane for 1–2 min and image chemiluminescence immediately.', completed: false, timerMinutes: 2 },
    ],
  },
];
