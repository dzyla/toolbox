import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Non-linear regression, 4PL sigmoidal curves, and goodness of fit',
  formulas: [
    'Linear: y = m·x + b',
    '4PL (Sigmoidal): y = Bottom + (Top - Bottom) / [1 + (x / EC50)^HillSlope]',
    'Michaelis-Menten: v = (Vmax · [S]) / (Km + [S])',
    'Exponential Decay: y = (y0 - Plateau) · e^(-k·x) + Plateau,   t1/2 = ln(2) / k',
    'R² = 1 - (SSE / SST) = 1 - [∑(y_i - ŷ_i)² / ∑(y_i - ȳ)²]',
    'RMSE = √[SSE / (N - P)]',
  ],
  assumptions: [
    'Residual errors (y_i - ŷ_i) are assumed to be independent, normally distributed with zero mean and constant variance (homoscedasticity).',
    'Nonlinear least squares minimization utilizes the Nelder-Mead simplex algorithm to find global parameter optima without requiring analytical derivatives.',
    'Replicate measurements at identical X values are summarized as sample mean ȳ, standard deviation (SD), and standard error of the mean (SEM).',
  ],
  references: [
    { text: 'Motulsky, H., & Christopoulos, A. (2004). Fitting Models to Biological Data using Linear and Nonlinear Regression. Oxford University Press.', url: 'https://www.graphpad.com/guides/prism/latest/curve-fitting/' },
    { text: 'Findlay, J. W., & Dillard, R. F. (2007). Appropriate calibration curve fitting in ligand binding assays. The AAPS Journal, 9(2), E260–E267.', url: 'https://doi.org/10.1208/aapsj0902029' },
  ],
  verified: '2026-09-03',
};
