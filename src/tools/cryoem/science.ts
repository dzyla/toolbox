import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Cryo-EM sampling, box sizing, dose and magnification',
  formulas: [
    'Nyquist resolution limit: d_Nyquist = 2 × pixel_size (Å)',
    'Physical box dimension: W (Å) = box_size (px) × pixel_size (Å/px)',
    'Fourier cropping / binning: pixel_size_binned = pixel_size_raw × (raw_box / cropped_box)',
    'Total electron dose: Dose (e⁻/Å²) = dose_rate (e⁻/px/s) × exposure_time (s) / (pixel_size)² (Å²)',
    'Dose per frame: Dose_frame = Dose_total / number_of_frames',
    'Pixel size from magnification: pixel_size (Å) = physical_detector_pixel (µm) × 10,000 / magnification',
  ],
  assumptions: [
    'Nyquist limit assumes a perfect optical system and Shannon–Whittaker sampling theorem. In practice, the modulation transfer function (MTF) of the detector attenuates high frequencies near Nyquist.',
    'Fast Fourier Transforms (FFT) are fastest on dimensions that factor into small primes (2, 3, 5, 7), commonly called "good" box sizes (RELION / cryoSPARC standard).',
    'Dose calculations assume uniform flux over the sensor and perpendicular electron illumination. Typical cryo-EM sample tolerance is 30–60 e⁻/Å² before radiation damage destroys high-resolution features.',
    'Detector magnification corresponds to calibrated magnification at the detector plane, accounting for camera-length distortions.',
  ],
  references: [
    { text: 'Frank J (2006) Three-Dimensional Electron Microscopy of Macromolecular Assemblies. Oxford University Press, 2nd ed.' },
    { text: 'Zivanov J et al. (2018) New tools for automated high-resolution cryo-EM structure determination in RELION-3. eLife 7:e42166', url: 'https://doi.org/10.7554/eLife.42166' },
    { text: 'Grant T, Grigorieff N (2015) Measuring the optimal exposure for single particle cryo-EM using a 2.6 Å reconstruction of rotavirus VP6. eLife 4:e06980', url: 'https://doi.org/10.7554/eLife.06980' },
  ],
  verified: '2026-09-03',
};
