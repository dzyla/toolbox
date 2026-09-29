import type { PlasmidDocument } from '@/core/plasmid/model';

export type SourceRole = 'vector' | 'insert';

export interface HubSource {
  id: string;
  role: SourceRole;
  document: PlasmidDocument;
}
