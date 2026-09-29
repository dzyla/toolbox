import { useEffect, useMemo, useState } from 'preact/hooks';
import { moleculeToDocument, type Molecule } from '@/core/cloning/molecule';
import type { ProductMark } from '@/core/cloning/products';
import { findDocumentOrfs, findDocumentRestrictionSites } from '@/core/plasmid/analysis';
import { exportFasta, exportGenBank } from '@/core/plasmid/export';
import { navigate } from '@/app/router';
import { downloadText } from '@/lib/export';
import { newId } from '@/lib/id';
import { saveProject } from '@/lib/projects';
import { CircularMap } from '@/tools/plasmid/CircularMap';
import { LinearMap } from '@/tools/plasmid/LinearMap';
import { SequenceView } from '@/tools/plasmid/SequenceView';
import type { Selection } from '@/tools/plasmid/selection';
import { BUTTON } from './results';

const MARK = 'rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800';

/**
 * The finished construct: an interactive map (click a feature for its details), the junctions or edit as
 * selectable marks, an optional sequence view, overlays, and hand-off to the plasmid workspace.
 */
export function ProductPreview({ product, fileName, marks }: { product: Molecule; fileName: string; marks: ProductMark[] }) {
  const document = useMemo(() => moleculeToDocument(product, 'cloning-product', 'Designed with the Bio-Bench cloning hub'), [product.sequence, product.annotations, product.name, product.topology]);
  const [selection, setSelection] = useState<Selection | undefined>();
  const [showSequence, setShowSequence] = useState(false);
  const [showSites, setShowSites] = useState(false);
  const [showOrfs, setShowOrfs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sequenceId = useMemo(() => `product-sequence-${newId()}`, []);
  useEffect(() => setSelection(undefined), [product.sequence]);

  // Computed only while their overlay is on.
  const sites = useMemo(() => showSites ? findDocumentRestrictionSites(document).filter(site => site.cutCount === 1) : [], [document, showSites]);
  const orfs = useMemo(() => showOrfs ? findDocumentOrfs(document, { minLengthAa: 50, maxLengthAa: 0 }) : [], [document, showOrfs]);

  const openInWorkspace = async () => {
    setSaving(true);
    setError('');
    try {
      const id = newId();
      await saveProject({ id, toolId: 'plasmid', name: product.name, version: 2, state: { schemaVersion: 2, document } });
      navigate({ name: 'tool', toolId: 'plasmid', projectId: id });
    } catch (cause) {
      setError(`Could not open the product in the plasmid workspace: ${cause instanceof Error ? cause.message : 'the project could not be saved.'}`);
    } finally { setSaving(false); }
  };

  const length = product.sequence.length;
  const activeMark = selection && !selection.annotationId ? marks.find(mark => mark.start === selection.start && mark.end === selection.end) : undefined;
  // The map's own overlay checkboxes are the only controls; sites are unique cutters, ORFs 50 aa or longer.
  const mapProps = {
    document, selection, onSelect: setSelection, orfs, restrictionSites: sites,
    showRestrictions: showSites, onShowRestrictionsChange: setShowSites, showOrfs, onShowOrfsChange: setShowOrfs,
    selectionLabel: activeMark ? `${activeMark.label} · ${activeMark.detail}` : undefined,
  };
  return <section aria-label={`Product preview: ${product.name}`} class="space-y-3">
    <p class="text-xs">
      <strong>{product.name}</strong> · {length.toLocaleString()} bp · {product.topology} · {product.annotations.length} features carried from the inputs
    </p>

    {product.topology === 'circular'
      ? <CircularMap {...mapProps} />
      : <LinearMap {...mapProps} />}

    {marks.length > 0 && <div class="space-y-1">
      <h3 class="text-xs font-semibold">{marks.some(mark => mark.kind === 'edit') ? 'Edit' : 'Junctions'}</h3>
      <ul class="flex flex-col items-start gap-1">
        {marks.map(mark => {
          const active = selection?.start === mark.start && selection?.end === mark.end && !selection.annotationId;
          return <li key={`${mark.label}-${mark.start}`}>
            <button type="button" aria-pressed={active} class={active ? `${MARK} border-accent-600 ring-1 ring-accent-600 dark:border-accent-400 dark:ring-accent-400` : `${MARK} border-slate-300 dark:border-slate-600`}
              onClick={() => setSelection({ start: mark.start, end: mark.end, source: 'analysis' })}>{mark.label} · {mark.detail}</button>
          </li>;
        })}
      </ul>
    </div>}

    <div>
      <button type="button" class={BUTTON} aria-expanded={showSequence} aria-controls={sequenceId} onClick={() => setShowSequence(open => !open)}>
        {showSequence ? 'Hide sequence' : `Show sequence (${length.toLocaleString()} bp)`}
      </button>
      {showSequence && <div id={sequenceId} class="mt-2"><SequenceView document={document} selection={selection} onSelect={setSelection} /></div>}
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class={BUTTON} disabled={saving} onClick={() => void openInWorkspace()}>Open in plasmid workspace</button>
      <button type="button" class={BUTTON} onClick={() => downloadText(exportGenBank(document), `${fileName}.gb`)}>Download GenBank</button>
      <button type="button" class={BUTTON} onClick={() => downloadText(exportFasta(document), `${fileName}.fasta`)}>Download FASTA</button>
    </div>
    {error && <p role="alert" class="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">{error}</p>}
  </section>;
}
