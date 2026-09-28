/**
 * Plate Reader CSV Processor & Normalization Engine
 *
 * Literature references:
 * - Birmingham A et al. (2009) Statistical methods for analysis of high-throughput
 *   RNA interference screens. Nat Methods 6:569-575.
 * - Malo N et al. (2006) Statistical practice in high-throughput screening
 *   data analysis. Nat Biotechnol 24:167-175.
 * - Zhang JH, Chung TD, Oldenburg KR (1999) A Simple Statistical Parameter for Use in
 *   Evaluation and Validation of High Throughput Screening Assays. J Biomol Screen 4:67-73.
 * - ASTM E178-02 Standard Practice for Dealing With Outlying Observations.
 *
 * Pure TypeScript with zero DOM dependencies.
 */

export * from './types';
export * from './stats';
export * from './parse';
export * from './layout';
export * from './qc';
export * from './curves';
export * from './export';
export * from './demo';
