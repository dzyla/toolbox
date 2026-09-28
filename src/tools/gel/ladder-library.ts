import { isPositiveNumber, isRecord, type LibrarySpec } from '@/lib/local-library';

export interface StandardLadder {
  id: string;
  name: string;
  kind: 'protein' | 'dna';
  sizes: number[];
  unit?: string;
  supplier?: string;
}

export const CUSTOM_LADDERS: LibrarySpec<StandardLadder> = {
  key: 'bb.library.gel-ladders',
  version: 1,
  legacyKeys: ['bio-bench-custom-ladders'],
  validate: (v): v is StandardLadder => isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string'
    && (v.kind === 'protein' || v.kind === 'dna') && Array.isArray(v.sizes) && v.sizes.length > 0 && v.sizes.every(isPositiveNumber),
};
