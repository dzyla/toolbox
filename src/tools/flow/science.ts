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
    'Several files share one gate tree. Parameters are matched across files by $PnN name, never by column position; a gate whose parameter a file lacks is not evaluated on that file (shown as "not evaluated", not as 0%). Axis ranges are the union over the shown samples so plots are comparable.',
    'Overlaid histograms are normalised per sample, either to its own mode (tallest bin = 100) or to % of its events per bin, so samples of different size share one axis. With all samples in one plot, the 2-D density pools the events of every shown sample into one heatmap, and the dot plot colours them by sample (at most 20,000 evenly spaced events per sample).',
    'Pooled population statistics (the default with several samples) sum events, parent events and total events over the shown samples where the gate can be evaluated, and take mean, median and CV over their events together; any single sample can be shown instead.',
    'A split gate is one vertical threshold t on the x parameter that makes two sibling gates: left (x < t) and right (x ≥ t). Every event with a readable value is in exactly one half, and both halves always move together.',
    'Gate files (JSON, format "bio-bench-flow-gates", version 1) store each gate\'s type, name, parent, parameter $PnN names, display scales (kind, cofactor, log floor) and coordinates in data units, so they re-apply to other files with the same parameter names. On import, malformed gates and gates on parameters no loaded file has are skipped with a warning.',
    'Compensation uses the matrix stored in the file ($SPILLOVER, then $SPILL, then $COMP). It is only as good as the single-stain controls it came from.',
    'Spillover names are matched to parameters by exact $PnN, then $PnS, then case- and whitespace-insensitively, then a purely numeric name k as parameter number k. Names that still do not match are dropped with their rows and columns (compensation is then approximate), and with fewer than two matched channels, or a malformed or singular matrix, the file loads uncompensated with a warning.',
    'Spillover names are matched to parameters by exact $PnN, then $PnS, then ignoring case and spaces, then as a parameter number (1-based); unmatched names are dropped with a visible warning, and if fewer than two match or the matrix is malformed or singular the file loads uncompensated.',
    'Event values are held as 32-bit floats, so 64-bit integer or double data loses precision beyond about seven significant digits.',
    'Density and dot plots clip off-scale events to the plot edge. Dot plots show at most 100,000 events chosen at even spacing, so they are identical on every run.',
    'The synthetic example (four samples: Unstained, Stim 0 h, 6 h and 24 h, with debris, doublets, three scatter populations, a viability dye and CD3/CD4/CD8) is generated in the browser from a fixed seed and is not real cytometry data.',
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
  verified: '2026-10-27',
};
