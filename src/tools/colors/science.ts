import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Figure colours',
  formulas: [
    'Continuous palette: colour_i = scheme(t_i), t_i = i / (n − 1), i = 0 … n − 1',
    'Colour-blind simulation: RGB_lin(sim) = M · RGB_lin, M = Machado et al. 2009 matrix at severity 1.0; linear = sRGB decoded (IEC 61966-2-1)',
    'Achromatopsia: Y = 0.2126 R + 0.7152 G + 0.0722 B (linear, ITU-R BT.709)',
    'WCAG contrast = (L_lighter + 0.05) / (L_darker + 0.05); AA text ≥ 4.5, large text ≥ 3, AAA ≥ 7',
    'ΔE*ab (CIE76) = √(ΔL² + Δa² + Δb²) in CIELAB, D65; just-noticeable ≈ 2.3',
    'Tint = mix(colour, white, k/6), tone = mix(colour, grey #808080, k/6), shade = mix(colour, black, k/6), k = 1 … 5, mixed in sRGB',
    'PyMOL: set_color name_i, [R/255, G/255, B/255]',
  ],
  assumptions: [
    'Colours are sRGB as shown on a calibrated display; print and projectors shift them.',
    'The simulation shows a typical dichromat (complete loss of one cone type). Anomalous trichromacy (milder and far more common) is not modelled, and no simulation reproduces an individual\'s perception. Use it to catch palettes that collapse, not to certify them.',
    'Out-of-gamut simulation results are clamped per channel.',
    'The "closest pair" ΔE is a screening number for categorical use; for sequential maps rely on perceptually uniform schemes (Viridis, Cividis, …) and check the greyscale (achromatopsia) view.',
    'Sequential and diverging ColorBrewer schemes are spline-interpolated by d3, so sampled colours differ slightly from the fixed ColorBrewer classes.',
  ],
  references: [
    { text: 'Machado G. M., Oliveira M. M., Fernandes L. A. F. (2009) A physiologically-based model for simulation of color vision deficiency. IEEE TVCG 15(6):1291–1298', url: 'https://doi.org/10.1109/TVCG.2009.113' },
    { text: 'Machado et al. simulation matrices (severity 1.0) as published by the authors', url: 'https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html' },
    { text: 'WCAG 2.1, relative luminance and contrast ratio', url: 'https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio' },
    { text: 'Mahy M., Van Eycken L., Oosterlinck A. (1994) Evaluation of uniform color spaces developed after the adoption of CIELAB and CIELUV. Color Res. Appl. 19(2):105–121', url: 'https://doi.org/10.1002/col.5080190204' },
    { text: 'Brewer C. A. et al., ColorBrewer 2.0', url: 'https://colorbrewer2.org' },
    { text: 'van der Walt S., Smith N. (2015) Viridis, Plasma, Inferno, Magma (matplotlib)', url: 'https://bids.github.io/colormap/' },
    { text: 'Nuñez J. R., Anderton C. R., Renslow R. S. (2018) Cividis. PLoS ONE 13(7):e0199239', url: 'https://doi.org/10.1371/journal.pone.0199239' },
    { text: 'd3-scale-chromatic (scheme implementations)', url: 'https://github.com/d3/d3-scale-chromatic' },
    { text: 'PyMOL wiki: set_color', url: 'https://pymolwiki.org/index.php/Set_Color' },
  ],
  verified: '2026-09-03',
};
