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
  ],
  assumptions: [
    'Relativistic correction is essential for high-energy transmission electron microscopes (100–300 kV).',
    'Amplitude contrast Q (typically 0.07–0.10 in cryo-EM) shifts the CTF zero positions toward lower spatial frequencies.',
    'Underfocus (Δf > 0) creates positive phase contrast at intermediate frequencies.',
    'Fast Fourier Transforms (FFT) are fastest on dimensions that factor into small primes (2, 3, 5, 7), commonly called "good" box sizes (RELION / cryoSPARC standard).',
    'Dose calculations assume uniform flux over the sensor and perpendicular electron illumination. Typical cryo-EM sample tolerance is 30–60 e⁻/Å² before radiation damage destroys high-resolution features.',
    'Research Preview: The 2D particle gallery and 3D MRC volume viewer are an active research preview. While many features are operational, they are undergoing ongoing work and all calculations, scale calibrations, and contrast levels should be evaluated by the researcher before using for actual laboratory or publication work.',
  ],
  references: [
    { text: 'Frank J (2006) Three-Dimensional Electron Microscopy of Macromolecular Assemblies. Oxford University Press, 2nd ed.' },
    { text: 'Mindell JA, Grigorieff N (2003) Accurate determination of local defocus and specimen tilt in electron microscopy. J Struct Biol 142(3):334-347', url: 'https://doi.org/10.1016/S1047-8477(03)00069-8' },
    { text: 'Rohou A, Grigorieff N (2015) CTFFIND4: Fast and accurate defocus determination from electron micrographs. J Struct Biol 192(2):216-221', url: 'https://doi.org/10.1016/j.jsb.2015.08.008' },
    { text: 'Grant T, Grigorieff N (2015) Measuring the optimal exposure for single particle cryo-EM using a 2.6 Å reconstruction of rotavirus VP6. eLife 4:e06980', url: 'https://doi.org/10.7554/eLife.06980' },
  ],
  verified: '2026-09-03',
};
