import type { PieceGeometry } from '@/core/cloning/geometry';
import { sourceColor } from '@/core/cloning/source-colors';
import { ConstructDiagram } from './ConstructDiagram';

interface Props {
  piece: PieceGeometry;
  activeId?: string;
  onActive?: (id: string | undefined) => void;
  onPick?: (position: number) => void;
  onRegion?: (start: number, end: number) => void;
  marker?: { position: number; label: string };
}

/** Two sources may share a name, so a primer is keyed by its source's index as well: `<sourceIndex>:<name>`. */
export const primerKey = (sourceIndex: number, name: string) => `${sourceIndex}:${name}`;

/** Ids tie a drawn primer to its row in the primer table (`primer-<key>`). */
export const primerRowId = (key: string) => `primer-${key}`;

/**
 * The key of each table row, in the table's order: the drawn primer of the same name that has not been used yet
 * (so two same-named sources pair up in order). A row with no drawn primer gets a key of its own from its index.
 */
export function primerRowKeys(names: string[], pieces: PieceGeometry[]): string[] {
  const drawn = new Map<string, string[]>();
  for (const piece of pieces) for (const primer of piece.primers) drawn.set(primer.name, [...(drawn.get(primer.name) ?? []), primerKey(piece.sourceIndex, primer.name)]);
  const used = new Map<string, number>();
  return names.map((name, row) => {
    const seen = used.get(name) ?? 0;
    used.set(name, seen + 1);
    return drawn.get(name)?.[seen] ?? `row${row}:${name}`;
  });
}

export function PrimerMap({ piece, activeId, onActive, onPick, onRegion, marker }: Props) {
  const what = piece.kind === 'pcr' ? 'amplified region and primers' : 'piece cut out by digestion';
  return <div class="min-w-0 space-y-1">
    <h3 class="text-xs font-semibold">{piece.sourceIndex + 1} · {piece.name}: {what}</h3>
    <ConstructDiagram
      title={`${piece.name}: ${what}`}
      length={piece.length}
      circular={piece.topology === 'circular'}
      color={sourceColor(piece.sourceIndex)}
      region={piece.region}
      removed={piece.removed}
      primers={piece.primers.map(primer => ({
        id: primerKey(piece.sourceIndex, primer.name), label: primer.name, strand: primer.strand, start: primer.start, length: primer.length,
        tailLength: primer.tailLength, tailColor: sourceColor(primer.tailNeighborIndex ?? -1),
      }))}
      marker={marker}
      activeId={activeId}
      onActive={onActive}
      onPick={onPick}
      onRegion={onRegion}
    />
  </div>;
}
