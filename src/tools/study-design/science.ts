import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Two independent groups: pooled-variance t-test planning',
  formulas: [
    "d = |anticipated difference| / common SD ; Cohen's standardized effect magnitude",
    'df = n1 + n2 − 2; Independent analysable observations in each group',
    'δ = d / √(1/n1 + 1/n2); Noncentrality parameter of the noncentral t distribution',
    'Power = P(T > c) + P(T < −c), T ~ noncentral t(df, δ); Two-sided c = t(1 − α/2, df). One-sided power uses only P(T > c), with c = t(1 − α, df).',
    'n2 = max(2, ceil(n1 × allocation ratio)); Integer search chooses the smallest n1 meeting target power along this allocation rule',
    'Enrollment = ceil(analysable n / (1 − dropout fraction)); Inflation is applied independently to each group without changing analytical power',
  ],
  assumptions: [
    'Two independent groups, independent observations, a continuous outcome with approximately normal within-group errors, and a common population variance. Technical replicates are not independent samples.',
    'Specify a scientifically meaningful effect and a credible common SD before collecting data. The default d = 0.5 is illustrative, not a recommendation for a particular assay.',
    'A one-sided test needs its direction specified before data collection. The positive effect magnitude represents that direction; changing the sign of the difference does not choose a hypothesis.',
    'This is a planning estimate. A power calculation does not validate the assay or statistical analysis plan, experimental execution, distributional assumptions, or clinical use.',
    'Dropout inflation assumes enough independent analysable samples remain in each group; it does not correct bias from missing data or guarantee the enrollment yield.',
    'Repeated-measures, clustered, unequal-variance, non-inferiority, and multiplicity-adjusted designs are outside this method; choose Paired or One-way ANOVA in the Design selector for those two designs. Achieved power here uses an anticipated effect, not an observed-data significance claim.',
    'The noncentral t calculation uses bounded numerical integration and inversion, with explicit failure handling and a limit of one million analysable samples per group. Software reference tests do not establish wet-lab validity.',
    'For equal-group comparisons with R power.t.test, use type="two.sample" and strict=TRUE to include both rejection tails. The R interface assumes equal group sizes.',
  ],
  references: [
    { text: 'Cohen J. Statistical Power Analysis for the Behavioral Sciences, 2nd ed. (1988).', url: 'https://doi.org/10.4324/9780203771587' },
    { text: 'R stats::power.t.test documentation: power calculations for one and two sample t tests.', url: 'https://stat.ethz.ch/R-manual/R-devel/library/stats/html/power.t.test.html' },
    { text: 'G*Power 3.1 manual, section 21: Means — difference between two independent means (two groups).', url: 'https://www.psychologie.hhu.de/fileadmin/redaktion/Fakultaeten/Mathematisch-Naturwissenschaftliche_Fakultaet/Psychologie/AAP/gpower/GPowerManual.pdf' },
  ],
  verified: '2026-09-11 (software method review only)',
};

const SOFTWARE_NOTE = 'This is a planning estimate. A power calculation does not validate the assay or statistical analysis plan, experimental execution, distributional assumptions, or clinical use. Software reference tests do not establish wet-lab validity.';
const DROPOUT_NOTE = 'Dropout inflation assumes enough independent analysable samples remain; it does not correct bias from missing data or guarantee the enrollment yield.';

export const PAIRED_SCIENCE: Science = {
  title: 'Paired design: one-sample t-test on within-pair differences',
  formulas: [
    "d_z = |mean difference| / SD of the differences ; Cohen's standardized effect for paired data (not the SD of the raw measurements)",
    'df = n − 1; n is the number of pairs',
    'δ = d_z √n ; Noncentrality parameter of the noncentral t distribution',
    'Power = P(T > c) + P(T < −c), T ~ noncentral t(df, δ) ; Two-sided c = t(1 − α/2, df). One-sided power uses only P(T > c), with c = t(1 − α, df).',
    'n = smallest integer with power ≥ target ; Found by bounded integer search; the minimum detectable d_z inverts the same power function by bisection',
    'Enrollment = ceil(n / (1 − dropout fraction)) ; Does not change analytical power',
  ],
  assumptions: [
    'Each pair is one independent unit measured twice (before/after, matched, or two conditions on the same sample). Differences are approximately normal.',
    'The SD of the differences is the SD to specify, not the SD of the raw measurements. Pilot data or the correlation r between the pair members give it: SD_diff = √(SD₁² + SD₂² − 2 r SD₁ SD₂).',
    'A one-sided test needs its direction specified before data collection.',
    SOFTWARE_NOTE, DROPOUT_NOTE,
    'The exact noncentral t is evaluated by a Poisson-mixture series of incomplete betas (Lenth 1989, AS 243) with convergence control, accurate to about 1e-10 in the supported range, with a limit of one million pairs.',
  ],
  references: [
    { text: 'Cohen J. Statistical Power Analysis for the Behavioral Sciences, 2nd ed. (1988), ch. 2 (t test for means).', url: 'https://doi.org/10.4324/9780203771587' },
    { text: 'Lenth RV. Algorithm AS 243: Cumulative distribution function of the non-central t distribution. Appl Stat 1989;38:185-189.' },
    { text: 'G*Power 3.1 manual: Means — difference from constant (one sample case); matched pairs.', url: 'https://www.psychologie.hhu.de/fileadmin/redaktion/Fakultaeten/Mathematisch-Naturwissenschaftliche_Fakultaet/Psychologie/AAP/gpower/GPowerManual.pdf' },
  ],
  verified: '2026-09-30 (exact noncentral t; Cohen/G*Power d_z = 0.5 designs and seeded Monte Carlo)',
};

export const ANOVA_SCIENCE: Science = {
  title: 'Balanced one-way ANOVA: omnibus F-test planning',
  formulas: [
    "f = σ_means / σ_within = √[Σ(μᵢ − μ̄)² / k] / σ ; Cohen's f for k group means and a common within-group SD",
    'N = k n, df₁ = k − 1, df₂ = N − k; n analysable samples in each of k groups',
    'λ = f² N ; Noncentrality parameter of the noncentral F distribution',
    'Power = P(F′ > c), F′ ~ noncentral F(df₁, df₂, λ), c = F(1 − α; df₁, df₂) ; The omnibus test is inherently upper-tailed',
    'n = smallest integer with power ≥ target ; Bounded integer search; the minimum detectable f inverts the power function by bisection',
    'Enrollment = ceil(n / (1 − dropout fraction)) per group ; Does not change analytical power',
  ],
  assumptions: [
    'Independent observations, a continuous outcome with approximately normal within-group errors, a common variance in all groups, and equal group sizes.',
    "Cohen's conventions (f = 0.10 small, 0.25 medium, 0.40 large) are generic benchmarks, not recommendations for a particular assay. Prefer group means and a common SD from pilot data or the smallest meaningful difference.",
    'Power is for the omnibus F-test only. Power for post-hoc pairwise comparisons, planned contrasts, or multiplicity corrections is lower and is not computed here.',
    'Group means entered as a pattern give the effect for exactly that pattern; a different arrangement of the same spread of means has a different f.',
    SOFTWARE_NOTE, DROPOUT_NOTE,
    'The exact noncentral F is evaluated as a Poisson-weighted sum of incomplete betas (Johnson, Kotz & Balakrishnan 1995) with convergence control, accurate to about 1e-10 in the supported range, with a limit of one million samples in total.',
  ],
  references: [
    { text: 'Cohen J. Statistical Power Analysis for the Behavioral Sciences, 2nd ed. (1988), ch. 8 (F test for analysis of variance).', url: 'https://doi.org/10.4324/9780203771587' },
    { text: 'Johnson NL, Kotz S, Balakrishnan N. Continuous Univariate Distributions, vol. 2, 2nd ed. (1995), noncentral F distribution.' },
    { text: 'G*Power 3.1 manual: F tests — ANOVA: fixed effects, omnibus, one-way.', url: 'https://www.psychologie.hhu.de/fileadmin/redaktion/Fakultaeten/Mathematisch-Naturwissenschaftliche_Fakultaet/Psychologie/AAP/gpower/GPowerManual.pdf' },
  ],
  verified: '2026-09-30 (exact noncentral F; Cohen/G*Power f = 0.25 and 0.40 designs, k = 2 equals two-sample t, seeded Monte Carlo)',
};
