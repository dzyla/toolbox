import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Cryo-EM sampling, dose, and Contrast Transfer Function (CTF)',
  formulas: [
    'Relativistic wavelength: λ = h / √(2 m_e e V (1 + e V / (2 m_e c²))) ; de Broglie electron wavelength',
    'Wave aberration: χ(s, α) = π λ s² Δf(α) - ½ π Cs λ³ s⁴ ; Phase aberration function',
    'CTF: CTF(s, α) = - [√(1 - Q²) sin(χ) + Q cos(χ)] × exp(-B s² / 4) ; Amplitude contrast & B-factor envelope',
    'First CTF Zero: d1 ≈ √(λ Δf) ; First Thon ring resolution limit',
    'Nyquist limit: d_Nyquist = 2 × pixel_size (Å) ; Shannon-Nyquist spatial frequency limit',
    'Total electron dose: Dose (e⁻/Å²) = dose_rate (e⁻/px/s) × exposure_time (s) / (pixel_size)² (Å²)',
    'Pixel size from magnification: pixel_size (Å) = physical_detector_pixel (µm) × 10,000 / magnification',
    'FSC resolution: f* from FSC(f*) = t at the first downward crossing, linearly interpolated in spatial frequency between the bracketing shells ; Resolution d = 1/f* (Å); t = 0.143 gold-standard, 0.5 conventional',
    'Shell index to frequency: f = k / (B × pixel_size) (1/Å) ; Box size B in px; only needed when a file lists shell indices',
    'Multi-defocus composite transfer: P_comp(s) = (1/K) Σ_{k=1}^K |CTF_k(s)|² ; Eliminates CTF zeros (zero filling)',
  ],
  assumptions: [
    'Relativistic correction is essential for high-energy transmission electron microscopes (100–300 kV).',
    'Amplitude contrast Q (typically 0.07–0.10 in cryo-EM) shifts the CTF zero positions toward lower spatial frequencies.',
    'Underfocus (Δf > 0) creates positive phase contrast at intermediate frequencies.',
    'In single-particle acquisition, micrographs are collected over a spread of defocus values (e.g. 0.8–2.2 µm). Combining multiple defoci fills in the zeros of individual CTFs so that no spatial frequencies are lost.',
    'Fast Fourier Transforms (FFT) are fastest on dimensions that factor into small primes (2, 3, 5, 7), commonly called "good" box sizes (RELION / cryoSPARC standard).',
    'Dose calculations assume uniform flux over the sensor and perpendicular electron illumination. Typical cryo-EM sample tolerance is 30–60 e⁻/Å² before radiation damage destroys high-resolution features.',
    'FSC tab: curves are imported (RELION postprocess.star or delimited text), never computed from maps. The 0.143 criterion applies to independent half-map (gold-standard) FSC; 0.5 is the older criterion for a map against a model or non-independent halves. Applying either to a curve of another kind is the user\'s responsibility.',
    'FSC column auto-detection (frequency column, units, which columns are FSC) is heuristic, based on header names and value ranges. RELION STAR layouts follow the documented labels; delimited layouts such as cryoSPARC exports were not tested against real exports. Always check the column mapping and override it if it is wrong.',
    'A crossing at or within 5% of the Nyquist resolution (2 × pixel size) is limited by sampling, not necessarily by the data. Without a pixel size, Nyquist is inferred from the last shell, which is usually Nyquist for RELION output. If the curve rises above the threshold again after the first crossing the first crossing is reported and a warning is shown.',
  ],
  references: [
    { text: 'Rosenthal PB, Henderson R (2003) Optimal determination of particle orientation, absolute hand, and contrast loss in single-particle electron cryomicroscopy. J Mol Biol 333(4):721-745 (FSC = 0.143 criterion)', url: 'https://doi.org/10.1016/j.jmb.2003.07.013' },
    { text: 'van Heel M, Schatz M (2005) Fourier shell correlation threshold criteria. J Struct Biol 151(3):250-262', url: 'https://doi.org/10.1016/j.jsb.2005.05.009' },
    { text: 'Scheres SHW, Chen S (2012) Prevention of overfitting in cryo-EM structure determination. Nat Methods 9(9):853-854 (gold-standard FSC)', url: 'https://doi.org/10.1038/nmeth.2115' },
    { text: 'Frank J (2006) Three-Dimensional Electron Microscopy of Macromolecular Assemblies. Oxford University Press, 2nd ed.' },
    { text: 'Penczek PA (2010) Image restoration in cryo-electron microscopy. Methods Enzymol 482:35-72', url: 'https://doi.org/10.1016/S0076-6879(10)82003-8' },
    { text: 'Mindell JA, Grigorieff N (2003) Accurate determination of local defocus and specimen tilt in electron microscopy. J Struct Biol 142(3):334-347', url: 'https://doi.org/10.1016/S1047-8477(03)00069-8' },
    { text: 'Rohou A, Grigorieff N (2015) CTFFIND4: Fast and accurate defocus determination from electron micrographs. J Struct Biol 192(2):216-221', url: 'https://doi.org/10.1016/j.jsb.2015.08.008' },
    { text: 'Grant T, Grigorieff N (2015) Measuring the optimal exposure for single particle cryo-EM using a 2.6 Å reconstruction of rotavirus VP6. eLife 4:e06980', url: 'https://doi.org/10.7554/eLife.06980' },
  ],
  verified: '2026-09-03',
};
