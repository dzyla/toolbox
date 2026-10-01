import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Flow Cytometry (FCS): Scales, Gates and Population Statistics',
  formulas: [
    'Log-amplified channel to scale value: v = 10^(f1 · x / R) · f2; where $PnE = f1,f2, R = $PnR and x is the stored channel value (f2 = 0 is read as 1)',
    'Linear scale value: v = x / G; where G is the $PnG amplifier gain (not applied to Time)',
    'Compensation: true = observed × S⁻¹; where S is the $SPILLOVER matrix (rows: emitting dye, columns: detector) and observed and true are event row vectors',
    'Arcsinh display scale: d = asinh(x / c); with cofactor c (150 default for fluorescence, about 5 for mass cytometry)',
    'Log display scale: d = log10(max(x, floor)); values below the floor are clipped to it',
    'Geometric mean = exp(mean(ln x)) over positive values',
    'CV = 100 · SD / mean, with the sample SD (n − 1)',
    'Robust CV = 100 · 0.5 · (P84.13 − P15.87) / median',
    '% of parent = 100 · events in gate / events in parent gate; % of total = 100 · events in gate / all events',
  ],
  assumptions: [
    'Only list-mode (L) FCS 2.0, 3.0 and 3.1 files are read, and only the first data set in a file. Correlated modes (C, U) and multi-data-set files are not supported.',
    'Arcsinh is used for the bi-exponential axis instead of logicle. The two agree near zero and on the high end, but they are not identical, so gate positions will not match a logicle-transformed plot in other software.',
    'A gate is stored on the scale it was drawn on. Changing the plot scale afterwards redraws it through the data values, and a polygon edge is drawn straight between its vertices on the new scale.',
    'Gates apply in order of their hierarchy: an event is in a gate only if it is also in the parent gate.',
    'Compensation uses the matrix stored in the file ($SPILLOVER, then $SPILL, then $COMP). It is only as good as the single-stain controls it came from.',
    'Event values are held as 32-bit floats, so 64-bit integer or double data loses precision beyond about seven significant digits.',
    'Density and dot plots clip off-scale events to the plot edge. Dot plots show at most 100,000 events chosen at even spacing, so they are identical on every run.',
    'The synthetic example is generated in the browser and is not real cytometry data.',
  ],
  references: [
    {
      text: 'Spidlen J, Moore W, Parks D, et al. (2010) Data File Standard for Flow Cytometry, version FCS 3.1. Cytometry A 77A(1):97–100.',
      url: 'https://doi.org/10.1002/cyto.a.20825',
    },
    {
      text: 'Roederer M (2001) Spectral compensation for flow cytometry: visualization artifacts, limitations, and caveats. Cytometry 45(3):194–205.',
      url: 'https://doi.org/10.1002/1097-0320(20011101)45:3<194::AID-CYTO1163>3.0.CO;2-C',
    },
    {
      text: 'Bendall SC, Simonds EF, Qiu P, et al. (2011) Single-cell mass cytometry of differential immune and drug responses across a human hematopoietic continuum. Science 332(6030):687–696 (arcsinh transform for CyTOF).',
      url: 'https://doi.org/10.1126/science.1198704',
    },
  ],
  verified: '2026-09-30',
};
