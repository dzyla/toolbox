export { InputError, MATRIX_NAMES, MATRIX_SOURCE, getMatrix, matricesFor, simpleMatrix, scoreOf, compileMatrix } from './matrices';
export type { MatrixType, MatrixName, ScoringMatrix } from './matrices';
export { align, rescore, describeAlignment, MAX_CELLS } from './gotoh';
export type { AlignMode, AlignOptions, AlignmentResult, AlignmentStats, ColumnClass } from './gotoh';
export { parseSequenceInput, detectType, invalidLetters, assertValid, DNA_LETTERS, PROTEIN_LETTERS } from './input';
export type { ParsedInput } from './input';
export { wrapBlocks, toPairwiseText, toClustal, toFasta } from './format';
export type { Block } from './format';
