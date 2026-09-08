import { useState } from 'preact/hooks';
import { orfToAnnotation, type DocumentOrf, type DocumentRestrictionSite } from '@/core/plasmid/analysis';
import { addAnnotation } from '@/core/plasmid/document';
import { applyDocumentEdit, selectRange, type WorkspaceState } from './workspace';

export interface AnalysisPanelProps {
  workspace: WorkspaceState;
  onWorkspaceChange: (workspace: WorkspaceState) => void;
  orfs: DocumentOrf[];
  restrictionSites: DocumentRestrictionSite[];
}

export function AnalysisPanel({ workspace, onWorkspaceChange, orfs, restrictionSites }: AnalysisPanelProps) {
  const [error, setError] = useState('');
  const promote = (orf: DocumentOrf) => {
    try {
      onWorkspaceChange(applyDocumentEdit(workspace, addAnnotation(workspace.document, orfToAnnotation(orf))));
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not promote ORF.'); }
  };
  return <section aria-label="Sequence analysis" class="space-y-5">
    <div>
      <h2 class="font-semibold text-slate-900 dark:text-slate-100">Predicted ORFs</h2>
      <p class="mb-3 text-xs text-slate-500">Predictions become annotations only when promoted to CDS.</p>
      {!orfs.length && <p class="text-sm text-slate-500">No ORFs match the current analysis settings.</p>}
      <ul class="space-y-2">{orfs.map((orf, index) => <li key={orf.id} class="flex flex-wrap items-center justify-between gap-2 rounded border border-teal-200 p-3 text-sm dark:border-teal-900">
        <button class="text-left text-teal-800 focus-visible:outline-2 dark:text-teal-300" aria-label={`Select ORF ${index + 1}, ${orf.location.segments.map(segment => `${segment.start + 1}–${segment.end}`).join(', ')} bp`} onClick={() => onWorkspaceChange(selectRange(workspace, { start: orf.location.segments[0]!.start, end: orf.location.segments[orf.location.segments.length - 1]!.end, source: 'analysis', annotationId: orf.id }))}>
          ORF {index + 1} · frame {orf.frame > 0 ? '+' : ''}{orf.frame} · {orf.lengthAa} aa
          <span class="block font-mono text-xs">{orf.location.segments.map(segment => `${segment.start + 1}–${segment.end}`).join(', ')} bp</span>
        </button>
        <button class="rounded border border-teal-300 px-2 py-1 text-xs focus-visible:outline-2" onClick={() => promote(orf)}>Promote ORF {index + 1} to CDS</button>
      </li>)}</ul>
    </div>
    <div>
      <h2 class="mb-3 font-semibold text-slate-900 dark:text-slate-100">Detected restriction sites</h2>
      {!restrictionSites.length && <p class="text-sm text-slate-500">No restriction sites detected.</p>}
      <ul class="flex flex-wrap gap-2">{restrictionSites.map(site => <li key={site.id}>
        <button class="rounded border border-slate-300 px-3 py-2 text-left text-sm focus-visible:outline-2" aria-label={`Select ${site.enzyme}, recognition ${site.start + 1}–${site.end} bp`} onClick={() => onWorkspaceChange(selectRange(workspace, { start: site.start, end: site.end, source: 'analysis' }))}>{site.enzyme}<span class="block font-mono text-xs text-slate-500">{site.start + 1}–{site.end} bp{site.crossesOrigin ? ' · wraps origin' : ''}</span></button>
      </li>)}</ul>
    </div>
    {error && <p role="alert" class="text-sm text-red-700">{error}</p>}
  </section>;
}
