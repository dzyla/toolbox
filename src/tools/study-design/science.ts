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
    'Paired, repeated-measures, clustered, multi-arm, unequal-variance, non-inferiority, and multiplicity-adjusted designs are outside this method. Achieved power here uses an anticipated effect, not an observed-data significance claim.',
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
