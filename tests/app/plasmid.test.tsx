import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import PlasmidView from '@/tools/plasmid/View';
import { CircularMap } from '@/tools/plasmid/CircularMap';
import { LinearMap } from '@/tools/plasmid/LinearMap';
import { SequenceView } from '@/tools/plasmid/SequenceView';
import { AnnotationInspector } from '@/tools/plasmid/AnnotationInspector';
import { AnnotationTable } from '@/tools/plasmid/AnnotationTable';
import { AnalysisPanel } from '@/tools/plasmid/AnalysisPanel';
import { initialWorkspace, selectRange, undoWorkspace } from '@/tools/plasmid/workspace';
import type { DocumentOrf, DocumentRestrictionSite } from '@/core/plasmid/analysis';
import type { PlasmidDocument } from '@/core/plasmid/model';
import type { Selection } from '@/tools/plasmid/selection';
import { route } from '@/app/router';
import { getProject, listRecent, saveProject } from '@/lib/projects';
import { importPlasmidText } from '@/core/plasmid/import';
import { exportGenBank } from '@/core/plasmid/export';
import { locationSequence } from '@/core/plasmid/coordinates';

const IMPORTED_GENBANK = `LOCUS       imported 12 bp DNA circular
FEATURES             Location/Qualifiers
     misc_feature    2..8
                     /label="Imported annotation"
ORIGIN
        1 aaacccgggttt
//`;

function openText(text: string) {
  fireEvent.input(screen.getByLabelText(/Paste FASTA, GenBank, or raw DNA/i), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Open sequence' }));
}

const MAP_DOCUMENT: PlasmidDocument = {
  id: 'puc19',
  name: 'pUC19',
  sequence: 'A'.repeat(2686),
  topology: 'circular',
  annotations: [
    {
      id: 'ampR',
      name: 'AmpR',
      type: 'CDS',
      location: { strand: 1, segments: [{ start: 0, end: 861 }] },
      qualifiers: {},
      source: 'imported',
    },
    {
      id: 'wrapped-origin',
      name: 'Origin crossing',
      type: 'rep_origin',
      location: { strand: -1, segments: [{ start: 2500, end: 2686 }, { start: 0, end: 140 }] },
      qualifiers: {},
      source: 'imported',
    },
  ],
  provenance: { format: 'genbank', parserVersion: 'test', warnings: [] },
};

const MAP_ORF: DocumentOrf = {
  id: 'predicted-forward',
  start: 100,
  end: 400,
  frame: 1,
  strand: 1,
  lengthBp: 300,
  lengthAa: 99,
  protein: 'M'.repeat(99),
  completeStart: true,
  completeStop: true,
  source: 'detected',
  confidence: 'predicted',
  location: { strand: 1, segments: [{ start: 100, end: 400 }] },
};

const MAP_RESTRICTION_SITE: DocumentRestrictionSite = {
  id: 'EcoRI-500',
  enzyme: 'EcoRI',
  recognitionSeq: 'GAATTC',
  cutPosition: 500,
  cutCount: 1,
  overhang: '5prime',
  start: 499,
  end: 505,
  crossesOrigin: false,
  source: 'detected',
  confidence: 'predicted',
  location: { strand: 1, segments: [{ start: 499, end: 505 }] },
};

const DENSE_CIRCULAR_DOCUMENT: PlasmidDocument = {
  ...MAP_DOCUMENT,
  annotations: Array.from({ length: 10 }, (_, index) => ({
    id: `dense-${index}`,
    name: `Dense lane ${index + 1}`,
    type: 'misc_feature',
    location: { strand: 1 as const, segments: [{ start: 0, end: 700 }] },
    qualifiers: {},
    source: 'imported' as const,
  })),
};

const ARC_DOCUMENT: PlasmidDocument = {
  ...MAP_DOCUMENT,
  sequence: 'A'.repeat(1000),
  annotations: [
    { ...MAP_DOCUMENT.annotations[0]!, id: 'forward-arc', name: 'Forward arc', location: { strand: 1, segments: [{ start: 0, end: 510 }] } },
    { ...MAP_DOCUMENT.annotations[1]!, id: 'reverse-arc', name: 'Reverse arc', location: { strand: -1, segments: [{ start: 0, end: 510 }] } },
  ],
};

const UNSTRANDED_DOCUMENT: PlasmidDocument = {
  ...MAP_DOCUMENT,
  annotations: [{ ...MAP_DOCUMENT.annotations[0]!, id: 'unstranded', name: 'Unstranded feature', location: { strand: 0, segments: [{ start: 10, end: 100 }] } }],
};

function CircularMapHarness() {
  const [selection, setSelection] = useState<Selection | undefined>();
  return <CircularMap document={MAP_DOCUMENT} selection={selection} onSelect={setSelection} />;
}

function LinearMapHarness() {
  const [selection, setSelection] = useState<Selection | undefined>();
  return <LinearMap document={MAP_DOCUMENT} selection={selection} onSelect={setSelection} />;
}

const SEQUENCE_DOCUMENT: PlasmidDocument = {
  ...MAP_DOCUMENT,
  sequence: 'ATG'.repeat(60),
  annotations: [
    { ...MAP_DOCUMENT.annotations[0]!, name: 'Joined CDS', location: { strand: 1, segments: [{ start: 0, end: 3 }, { start: 9, end: 12 }] } },
    { ...MAP_DOCUMENT.annotations[1]!, name: 'Reverse feature', location: { strand: -1, segments: [{ start: 3, end: 6 }] } },
  ],
};

const PANEL_DOCUMENT: PlasmidDocument = {
  ...SEQUENCE_DOCUMENT,
  sequence: 'ATGAAACCCGGGTTTCAT',
  annotations: [
    { ...MAP_DOCUMENT.annotations[0]!, name: 'Zulu imported', location: { strand: -1, segments: [{ start: 0, end: 3 }, { start: 12, end: 18 }] }, qualifiers: { note: ['original', 'preserved'], translation: ['STALE'] } },
    { ...MAP_DOCUMENT.annotations[1]!, name: 'Alpha imported', location: { strand: 0, segments: [{ start: 3, end: 9 }] } },
  ],
};
const PANEL_ORF: DocumentOrf = {
  ...MAP_ORF, id: 'orf-panel', start: 12, end: 3, strand: -1, frame: -1,
  location: { strand: -1, segments: [{ start: 12, end: 18 }, { start: 0, end: 3 }] },
  lengthBp: 9, lengthAa: 3, protein: 'HNE',
};
const PANEL_SITE: DocumentRestrictionSite = {
  ...MAP_RESTRICTION_SITE, start: 14, end: 2, cutPosition: 15, crossesOrigin: true,
  location: { strand: 1, segments: [{ start: 14, end: 18 }, { start: 0, end: 2 }] },
};

function PanelsHarness({ selected = false }: { selected?: boolean }) {
  const [workspace, setWorkspace] = useState(() => selectRange(initialWorkspace(PANEL_DOCUMENT), {
    start: 0, end: 12, source: 'sequence', ...(selected ? { annotationId: 'ampR' } : {}),
  }));
  return <>
    <AnnotationInspector workspace={workspace} onWorkspaceChange={setWorkspace} orfs={[PANEL_ORF]} />
    <AnnotationTable document={workspace.document} selection={workspace.selection} onSelect={selection => setWorkspace(value => selectRange(value, selection))} />
    <AnalysisPanel workspace={workspace} onWorkspaceChange={setWorkspace} orfs={[PANEL_ORF]} restrictionSites={[PANEL_SITE]} />
    <button onClick={() => setWorkspace(undoWorkspace)}>Undo panel edit</button>
    <output data-testid="panel-workspace">{JSON.stringify(workspace)}</output>
  </>;
}

function panelState() {
  return JSON.parse(screen.getByTestId('panel-workspace').textContent!);
}

describe('Canonical workspace panels', () => {
  it('creates an annotation from selection and records an undoable immutable document edit', () => {
    render(<PanelsHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Create annotation from selection' }));
    fireEvent.input(screen.getByLabelText('Annotation name'), { target: { value: 'insert' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));
    expect(screen.getByRole('button', { name: /insert.*1.*12/ })).toBeTruthy();
    const state = panelState();
    expect(state.document.annotations[2]).toMatchObject({ name: 'insert', source: 'manual', location: { strand: 1, segments: [{ start: 0, end: 12 }] } });
    expect(state.history.past).toHaveLength(1);
    expect(PANEL_DOCUMENT.annotations).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Undo panel edit' }));
    expect(panelState().document.annotations).toHaveLength(2);
  });

  it('validates edits and saves all fields while preserving imported provenance', () => {
    render(<PanelsHarness selected />);
    fireEvent.input(screen.getByLabelText('Annotation segments (1-based inclusive)'), { target: { value: '0..3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(panelState().history.past).toHaveLength(0);
    fireEvent.input(screen.getByLabelText('Annotation name'), { target: { value: 'Edited CDS' } });
    fireEvent.input(screen.getByLabelText('Annotation type'), { target: { value: 'CDS' } });
    fireEvent.input(screen.getByLabelText('Annotation color'), { target: { value: '#aabbcc' } });
    fireEvent.change(screen.getByLabelText('Annotation strand'), { target: { value: '0' } });
    fireEvent.input(screen.getByLabelText('Annotation segments (1-based inclusive)'), { target: { value: '13..18, 1..3' } });
    fireEvent.input(screen.getByLabelText('Annotation qualifiers (JSON)'), { target: { value: '{"note":["edited","second"]}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));
    const state = panelState();
    expect(state.document.annotations[0]).toMatchObject({ name: 'Edited CDS', type: 'CDS', color: '#aabbcc', source: 'imported', location: { strand: 0, segments: [{ start: 12, end: 18 }, { start: 0, end: 3 }] }, qualifiers: { note: ['edited', 'second'] } });
    expect(state.document.provenance).toEqual(PANEL_DOCUMENT.provenance);
    expect(PANEL_DOCUMENT.annotations[0]!.name).toBe('Zulu imported');
    expect(state.history.past).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete annotation' }));
    expect(panelState().document.annotations).toHaveLength(1);
    expect(panelState().selection).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Undo panel edit' }));
    expect(panelState().document.annotations[0].name).toBe('Edited CDS');
  });

  it('filters and sorts a copy of table rows and selects compound annotations without history edits', () => {
    render(<PanelsHarness />);
    const original = panelState().document;
    fireEvent.change(screen.getByLabelText('Sort annotations'), { target: { value: 'name' } });
    const table = screen.getByRole('table', { name: 'Annotations' });
    expect(within(table).getAllByRole('row')[1]!.textContent).toContain('Alpha imported');
    fireEvent.input(screen.getByLabelText('Filter annotations'), { target: { value: 'Zulu' } });
    expect(within(table).queryByText('Alpha imported')).toBeNull();
    fireEvent.click(within(table).getByRole('button', { name: /Zulu imported.*1.*3.*13.*18/ }));
    expect(panelState().selection).toEqual({ start: 0, end: 18, annotationId: 'ampR', source: 'table' });
    expect(panelState().history.past).toHaveLength(0);
    expect(panelState().document).toEqual(original);
  });

  it('keeps predictions separate, selects canonical wrapped ranges, and promotes a new predicted CDS', () => {
    render(<PanelsHarness />);
    fireEvent.click(screen.getByRole('button', { name: /Select ORF 1/ }));
    expect(panelState().selection).toEqual({ start: 12, end: 3, source: 'analysis', annotationId: 'orf-panel' });
    fireEvent.click(screen.getByRole('button', { name: /Select EcoRI/ }));
    expect(panelState().selection).toEqual({ start: 14, end: 2, source: 'analysis' });
    expect(panelState().history.past).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Promote ORF 1 to CDS' }));
    expect(screen.getByRole('row', { name: /Predicted CDS/ })).toBeTruthy();
    const state = panelState();
    expect(state.document.annotations.slice(0, 2)).toEqual(PANEL_DOCUMENT.annotations);
    expect(state.document.annotations[2]).toMatchObject({ type: 'CDS', confidence: 'predicted', source: 'detected', location: PANEL_ORF.location });
    expect(state.history.past).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Promote ORF 1 to CDS' }));
    expect(panelState().document.annotations[3].id).not.toBe(state.document.annotations[2].id);
  });

  it('copies reverse compound DNA and freshly translated protein with a manual textarea fallback', async () => {
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    try {
      render(<PanelsHarness selected />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy DNA', exact: true }));
      await waitFor(() => expect((screen.getByLabelText('Sequence to copy') as HTMLTextAreaElement).value).toBe('ATGAAACAT'));
      fireEvent.click(screen.getByRole('button', { name: 'Copy protein', exact: true }));
      await waitFor(() => expect((screen.getByLabelText('Sequence to copy') as HTMLTextAreaElement).value).toBe('MKH'));
      fireEvent.click(screen.getByRole('button', { name: /Select ORF 1/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy DNA', exact: true }));
      await waitFor(() => expect((screen.getByLabelText('Sequence to copy') as HTMLTextAreaElement).value).toBe('CATATGAAA'));
      expect(panelState().history.past).toHaveLength(0);
    } finally {
      if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
});

function SequenceHarness() {
  const [workspace, setWorkspace] = useState(() => initialWorkspace(SEQUENCE_DOCUMENT));
  return <>
    <SequenceView document={workspace.document} selection={workspace.selection} onSelect={selection => setWorkspace(value => selectRange(value, selection))} />
    <output data-testid="sequence-selection">{workspace.selection ? `${workspace.selection.start + 1}–${workspace.selection.end}` : 'None'}</output>
    <output data-testid="sequence-history">{workspace.history.past.length}</output>
  </>;
}

function captureBoundary(element: HTMLElement) {
  const set = vi.fn();
  const release = vi.fn();
  Object.defineProperties(element, {
    setPointerCapture: { value: set, configurable: true },
    releasePointerCapture: { value: release, configurable: true },
  });
  return { set, release };
}

describe('Canonical sequence viewport', () => {
  it('keeps a drag active across mouseleave and preserves the viewport and local document history', () => {
    render(<SequenceHarness />);
    const viewport = screen.getByTestId('plasmid-sequence-viewport');
    viewport.scrollTop = 180;
    const originalUrl = window.location.href;
    const originalDocument = JSON.stringify(SEQUENCE_DOCUMENT);
    const base = screen.getByLabelText('Base 1');
    const capture = captureBoundary(base);
    fireEvent.pointerDown(base, { pointerId: 4, button: 0 });
    expect(capture.set).toHaveBeenCalledWith(4);
    fireEvent.mouseLeave(viewport);
    fireEvent.pointerEnter(screen.getByLabelText('Base 12'), { pointerId: 4 });
    fireEvent.pointerUp(viewport, { pointerId: 4 });
    expect(screen.getByTestId('sequence-selection').textContent).toBe('1–12');
    expect(capture.release).toHaveBeenCalledWith(4);
    expect(screen.getByTestId('plasmid-sequence-viewport')).toBe(viewport);
    expect(viewport.scrollTop).toBe(180);
    expect(screen.getByTestId('sequence-history').textContent).toBe('0');
    expect(window.location.href).toBe(originalUrl);
    expect(JSON.stringify(SEQUENCE_DOCUMENT)).toBe(originalDocument);
    expect(screen.queryByTestId('plasmid-selection')).toBeNull();
  });

  it('uses the captured pointer position to extend a backwards drag, ignoring other pointers and ending on cancel', () => {
    render(<SequenceHarness />);
    const base = screen.getByLabelText('Base 12');
    const capture = captureBoundary(base);
    const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(screen.getByLabelText('Base 1'));
    try {
      fireEvent.pointerDown(base, { pointerId: 4, button: 0 });
      fireEvent.pointerMove(base, { pointerId: 8, clientX: 100, clientY: 100 });
      fireEvent.pointerUp(base, { pointerId: 8 });
      fireEvent.pointerDown(screen.getByLabelText('Base 4'), { pointerId: 8, button: 0 });
      expect(screen.getByTestId('sequence-selection').textContent).toBe('12–12');
      fireEvent.pointerMove(base, { pointerId: 4, clientX: 100, clientY: 100 });
      expect(screen.getByTestId('sequence-selection').textContent).toBe('1–12');
      fireEvent.pointerCancel(base, { pointerId: 4 });
      expect(capture.release).toHaveBeenCalledWith(4);
      fireEvent.pointerEnter(screen.getByLabelText('Base 20'), { pointerId: 4 });
      expect(screen.getByTestId('sequence-selection').textContent).toBe('1–12');
    } finally { hit.mockRestore(); }
  });

  it('ignores secondary-button drags and supports keyboard activation of a base', () => {
    render(<SequenceHarness />);
    fireEvent.pointerDown(screen.getByLabelText('Base 3'), { pointerId: 4, button: 2 });
    expect(screen.getByTestId('sequence-selection').textContent).toBe('None');
    fireEvent.click(screen.getByRole('button', { name: 'Base 3', exact: true }), { detail: 0 });
    expect(screen.getByTestId('sequence-selection').textContent).toBe('3–3');
  });

  it('highlights actual compound segments independently from selection and shows the complement strand', () => {
    render(<SequenceView document={SEQUENCE_DOCUMENT} selection={{ start: 0, end: 2, source: 'sequence' }} onSelect={() => undefined} />);
    expect(screen.getByLabelText('Base 1').title).toContain('Joined CDS');
    expect(screen.getByLabelText('Base 10').title).toContain('Joined CDS');
    expect(screen.getByLabelText('Base 7').title).not.toContain('Joined CDS');
    expect(screen.getByLabelText('Complement base 4').title).toContain('Reverse feature');
    expect(screen.getByLabelText('Complement base 1').textContent).toBe('T');
    expect(screen.getByLabelText('Base 1').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Base 10').getAttribute('aria-pressed')).toBe('false');
  });

  it('scrolls to a validated coordinate inside the viewport in both axes without selecting or moving the page', () => {
    render(<SequenceHarness />);
    const viewport = screen.getByTestId('plasmid-sequence-viewport');
    const target = screen.getByLabelText('Base 121');
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ top: 50, left: 40 } as DOMRect);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 350, left: 440 } as DOMRect);
    fireEvent.input(screen.getByLabelText('Go to coordinate'), { target: { value: '121' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go', exact: true }));
    expect(viewport.scrollTop).toBe(300);
    expect(viewport.scrollLeft).toBe(400);
    expect(document.activeElement).toBe(target);
    expect(screen.getByTestId('sequence-selection').textContent).toBe('None');
    fireEvent.input(screen.getByLabelText('Go to coordinate'), { target: { value: '181' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go', exact: true }));
    expect(screen.getByRole('alert').textContent).toContain('180');
    expect(viewport.scrollTop).toBe(300);
  });

  it('changes translation presentation without changing selection or document history', () => {
    render(<SequenceHarness />);
    expect(screen.getAllByLabelText('Amino acid M, bases 1–3')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Translation display'), { target: { value: 'frame2' } });
    expect(screen.getByLabelText('Amino acid *, bases 2–4')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Translation display'), { target: { value: 'none' } });
    expect(screen.queryByLabelText(/Amino acid/)).toBeNull();
    expect(screen.queryByText('aa')).toBeNull();
    expect(screen.getByTestId('sequence-selection').textContent).toBe('None');
    expect(screen.getByTestId('sequence-history').textContent).toBe('0');
  });
});

describe('Plasmid Viewer tool view', () => {
  it('selects a canonical circular annotation with its one-based display coordinates', () => {
    render(<CircularMapHarness />);

    fireEvent.click(screen.getByRole('button', { name: /AmpR.*1.*861/i }));

    expect(screen.getByTestId('plasmid-selection').textContent).toContain('AmpR');
    expect(screen.getByTestId('plasmid-selection').textContent).toContain('1–861');
  });

  it('renders a keyboard-accessible linear map and preserves origin-spanning annotation segments', () => {
    render(<LinearMapHarness />);

    expect(screen.getByRole('img', { name: 'Linear map of pUC19' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Origin crossing/i })).toHaveLength(2);
  });

  it('gives every circular keyboard target a visible focus treatment and lets ORFs select exact coordinates', () => {
    render(<CircularMap document={MAP_DOCUMENT} orfs={[MAP_ORF]} restrictionSites={[MAP_RESTRICTION_SITE]} onSelect={() => undefined} />);

    const targets = screen.getAllByRole('button');
    expect(targets).toHaveLength(5);
    expect(targets.every(target => target.getAttribute('class')?.includes('focus-visible:outline'))).toBe(true);
    expect(screen.getByRole('button', { name: /Predicted ORF.*101.*400/i })).toBeTruthy();
  });

  it('expands circular geometry for packed annotation lanes while keeping overlay tracks outside them', () => {
    render(<CircularMap document={DENSE_CIRCULAR_DOCUMENT} orfs={[MAP_ORF]} restrictionSites={[MAP_RESTRICTION_SITE]} onSelect={() => undefined} />);

    const viewBox = screen.getByRole('img', { name: 'Circular map of pUC19' }).getAttribute('viewBox')!;
    expect(Number(viewBox.split(' ')[2])).toBeGreaterThan(900);
  });

  it('uses the post-arrowhead body span for circular large arcs in both directions', () => {
    render(<CircularMap document={ARC_DOCUMENT} onSelect={() => undefined} />);

    for (const name of ['Forward arc', 'Reverse arc']) {
      const path = screen.getByRole('button', { name: new RegExp(name) }).querySelector('path')!;
      expect(path.getAttribute('d')).not.toMatch(/A [\d.]+ [\d.]+ 0 1 [01]/);
    }
  });

  it('renders canonical strand zero as an unstranded, non-directional target in both maps', () => {
    const { unmount } = render(<CircularMap document={UNSTRANDED_DOCUMENT} onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: /Unstranded feature.*unstranded/i })).toBeTruthy();
    unmount();

    render(<LinearMap document={UNSTRANDED_DOCUMENT} onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: /Unstranded feature.*unstranded/i })).toBeTruthy();
  });

  it('renders plasmid viewer with default pUC19 plasmid', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);

    expect(screen.getAllByText(/pUC19/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2,686 bp/).length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /Circular map of pUC19/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download GenBank' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download FASTA' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save locally' })).toBeTruthy();
  });

  it('switches between circular, linear, sequence, and table view modes', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);

    // Linear Map
    const linearBtn = screen.getByRole('tab', { name: /Linear/ });
    fireEvent.click(linearBtn);
    expect(screen.getByRole('img', { name: 'Linear map of pUC19' })).toBeTruthy();

    // Sequence & ORFs
    const seqBtn = screen.getByRole('tab', { name: /Sequence/ });
    fireEvent.click(seqBtn);
    expect(screen.getByTestId('plasmid-sequence-viewport')).toBeTruthy();

    // Features Table
    const tableBtn = screen.getByRole('tab', { name: /Annotations/ });
    fireEvent.click(tableBtn);
    expect(screen.getByRole('table', { name: 'Annotations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /AmpR \(bla\)/ })).toBeTruthy();
  });

  it('switches preset vectors to pET-28a(+)', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);

    const select = screen.getByLabelText('Preset vector');
    fireEvent.change(select, { target: { value: 'pet-28a' } });

    expect(screen.getAllByText(/pET-28a\(\+\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5,369 bp/).length).toBeGreaterThan(0);
  });

  it('preserves the composed viewport, ORF count, URL, and undo history when selecting bases', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);

    // Switch to Sequence & ORFs
    const seqBtn = screen.getByRole('tab', { name: /Sequence/ });
    fireEvent.click(seqBtn);

    // Strands are labeled with 5' and 3'
    expect(screen.getAllByText('5′').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3′').length).toBeGreaterThan(0);
    expect(screen.getAllByText('aa').length).toBeGreaterThan(0);

    const viewport = screen.getByTestId('plasmid-sequence-viewport');
    const summary = screen.getByTestId('plasmid-orf-summary');
    const summaryText = summary.textContent;
    const parent = viewport.parentElement;
    const url = window.location.href;
    viewport.scrollTop = 180;
    viewport.scrollLeft = 65;
    fireEvent.click(screen.getByLabelText('Base 2'));
    expect(screen.getByTestId('plasmid-sequence-viewport')).toBe(viewport);
    expect(viewport.parentElement).toBe(parent);
    expect(viewport.scrollTop).toBe(180);
    expect(viewport.scrollLeft).toBe(65);
    expect(screen.getByTestId('plasmid-orf-summary')).toBe(summary);
    expect(summary.textContent).toBe(summaryText);
    expect(window.location.href).toBe(url);
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('complementary', { name: 'Annotation inspector' }).textContent).toContain('2–2 bp');
  });

  it('displays min and max of found ORF sequences and updates filters', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);

    expect(screen.getByLabelText('Minimum ORF size (aa)')).toBeTruthy();
    expect(screen.getByLabelText('Maximum ORF size (aa)')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Minimum ORF size (aa)'), { target: { value: '100000' } });
    expect(screen.getByTestId('plasmid-orf-summary').textContent).toContain('0 ORFs');
  });

  it('loads an annotated GenBank document through the plasmid import control', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);
    openText(IMPORTED_GENBANK);
    fireEvent.click(screen.getByRole('tab', { name: 'Annotations' }));
    fireEvent.click(screen.getByRole('button', { name: /Imported annotation, 2–8/ }));
    fireEvent.input(screen.getByLabelText('Annotation name'), { target: { value: 'Renamed annotation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));
    expect(screen.getByRole('button', { name: /Renamed annotation, 2–8/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: /Imported annotation, 2–8/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByRole('button', { name: /Renamed annotation, 2–8/ })).toBeTruthy();
  });
});

describe('Composed document workspace', () => {
  it('saves a created annotation as schema v2 and restores the current document', async () => {
    const view = render(<PlasmidView />);
    openText(IMPORTED_GENBANK);
    fireEvent.click(screen.getByRole('tab', { name: 'Sequence' }));
    fireEvent.click(screen.getByLabelText('Base 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Create annotation from selection' }));
    fireEvent.input(screen.getByLabelText('Annotation name'), { target: { value: 'Selected base' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save locally' }));
    expect(await screen.findByText(/Saved imported locally/)).toBeTruthy();
    const saved = (await listRecent()).find(project => project.name === 'imported')!;
    expect(saved.version).toBe(2);
    expect(saved.state).toMatchObject({ schemaVersion: 2, document: { sequence: 'AAACCCGGGTTT', annotations: [{ name: 'Imported annotation' }, { name: 'Selected base', location: { segments: [{ start: 1, end: 2 }] } }] } });
    expect(Object.keys(saved.state as object).sort()).toEqual(['document', 'schemaVersion']);
    view.unmount();
    render(<PlasmidView projectId={saved.id} />);
    expect(await screen.findByText(/Restored local project/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Annotations' }));
    expect(screen.getByRole('button', { name: /Selected base, 2–2/ })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('migrates raw document projects and preserves parser warnings through resaving', async () => {
    const document = importPlasmidText(IMPORTED_GENBANK).document;
    document.provenance.warnings = [{ code: 'test-warning', message: 'An unsupported display property was omitted.' }];
    await saveProject({ id: 'plasmid-legacy-migration', toolId: 'plasmid', name: document.name, version: 1, state: document });
    render(<PlasmidView projectId="plasmid-legacy-migration" />);
    expect(await screen.findByText(document.provenance.warnings[0]!.message)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save locally' }));
    await screen.findByText(/Saved imported locally/);
    expect((await getProject('plasmid-legacy-migration'))!.state).toMatchObject({ schemaVersion: 2, document });
  });

  it('shows dismissible parser errors without replacing the open document', () => {
    render(<PlasmidView />);
    openText('LOCUS       broken');
    expect(screen.getByRole('alert').textContent).toContain('missing ORIGIN');
    expect(screen.getByRole('img', { name: 'Circular map of pUC19' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(screen.queryByRole('alert')).toBeNull();
    openText('not DNA!');
    expect(screen.getByRole('alert').textContent).toContain('invalid DNA');
  });

  it('keeps invalid saved documents out of the workspace', async () => {
    await saveProject({ id: 'invalid-plasmid', toolId: 'plasmid', name: 'Broken', version: 2, state: { schemaVersion: 2, document: { name: 'Broken' } } });
    render(<PlasmidView projectId="invalid-plasmid" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Circular map of pUC19' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save locally' }));
    await screen.findByText(/Saved pUC19 locally/);
    expect((await getProject('invalid-plasmid'))!.state).toEqual({ schemaVersion: 2, document: { name: 'Broken' } });
  });

  it('exports current edited annotations, DNA, and the selected map as downloadable artifacts', async () => {
    const blobs: Blob[] = [];
    const capture = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { blobs.push(blob as Blob); return 'blob:plasmid-export'; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      render(<PlasmidView />);
      openText(IMPORTED_GENBANK);
      fireEvent.click(screen.getByRole('tab', { name: 'Annotations' }));
      fireEvent.click(screen.getByRole('button', { name: /Imported annotation, 2–8/ }));
      fireEvent.input(screen.getByLabelText('Annotation name'), { target: { value: 'Current annotation' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));
      fireEvent.click(screen.getByRole('button', { name: 'Download GenBank' }));
      fireEvent.click(screen.getByRole('button', { name: 'Download FASTA' }));
      fireEvent.click(screen.getByRole('tab', { name: 'Linear map' }));
      fireEvent.click(screen.getByRole('button', { name: 'Download SVG' }));
      expect(blobs).toHaveLength(3);
      expect(await blobs[0]!.text()).toContain('/label="Current annotation"');
      expect(await blobs[1]!.text()).toBe('>imported\nAAACCCGGGTTT\n');
      expect(await blobs[2]!.text()).toContain('Linear map of imported');
    } finally { capture.mockRestore(); click.mockRestore(); }
  });

  it('shares only document metadata and omits sequence, selection, and URL state', async () => {
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    try {
      render(<PlasmidView />);
      openText(IMPORTED_GENBANK);
      fireEvent.click(screen.getByRole('tab', { name: 'Sequence' }));
      fireEvent.click(screen.getByLabelText('Base 2'));
      const url = window.location.href;
      fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }));
      expect((await screen.findByLabelText(/Summary to copy/) as HTMLTextAreaElement).value).toBe('imported\n12 bp · circular\n1 annotations');
      expect(window.location.href).toBe(url);
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('promotes analysis predictions into the shared document and exposes them in maps and the table', () => {
    render(<PlasmidView />);
    openText('>ORF fixture\nATGAAATAA');
    fireEvent.input(screen.getByLabelText('Minimum ORF size (aa)'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Promote ORF 1 to CDS' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Annotations' }));
    expect(screen.getByRole('row', { name: /Predicted CDS/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Linear map' }));
    expect(screen.getAllByRole('button', { name: /Predicted ORF \+1/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Annotations' }));
    expect(screen.queryByRole('row', { name: /Predicted CDS/ })).toBeNull();
  });

  it('opens sequence files with metadata and offers safe copy fallback in the composed inspector', async () => {
    render(<PlasmidView />);
    const file = new Blob([IMPORTED_GENBANK]);
    Object.defineProperty(file, 'name', { value: 'annotated.gbk' });
    fireEvent.change(screen.getByLabelText('Open sequence file'), { target: { files: [file] } });
    expect(await screen.findByText(/annotated.gbk/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Sequence' }));
    fireEvent.click(screen.getByLabelText('Base 2'));
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Copy DNA', exact: true }));
      expect((await screen.findByLabelText('Sequence to copy') as HTMLTextAreaElement).value).toBe('A');
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('complements all IUPAC bases when copying reverse-strand canonical locations', () => {
    expect(locationSequence('ACGTRYSWKMBDHVN', { strand: -1, segments: [{ start: 0, end: 15 }] })).toBe('NBDHVKMWSRYACGT');
  });

  it('exports a renamed annotation using its current name while retaining other qualifiers', () => {
    const document = importPlasmidText(IMPORTED_GENBANK).document;
    document.annotations[0]!.name = 'Renamed annotation';
    document.annotations[0]!.qualifiers.note = ['First', 'Second'];
    const exported = exportGenBank(document);
    expect(exported).toContain('/label="Renamed annotation"');
    expect(exported).toContain('/note="First"');
    expect(exported).toContain('/note="Second"');
    expect(document.annotations[0]!.qualifiers.label).toEqual(['Imported annotation']);
  });
});
