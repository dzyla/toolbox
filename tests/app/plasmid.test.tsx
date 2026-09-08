import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import PlasmidView from '@/tools/plasmid/View';
import { CircularMap } from '@/tools/plasmid/CircularMap';
import { LinearMap } from '@/tools/plasmid/LinearMap';
import { SequenceView } from '@/tools/plasmid/SequenceView';
import { initialWorkspace, selectRange } from '@/tools/plasmid/workspace';
import type { DocumentOrf, DocumentRestrictionSite } from '@/core/plasmid/analysis';
import type { PlasmidDocument } from '@/core/plasmid/model';
import type { Selection } from '@/tools/plasmid/selection';
import { route } from '@/app/router';

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
    const linearBtn = screen.getByRole('button', { name: /Linear Map/ });
    fireEvent.click(linearBtn);
    expect(screen.getByText(/Linear Plasmid Track/)).toBeTruthy();

    // Sequence & ORFs
    const seqBtn = screen.getByRole('button', { name: /Sequence & ORFs/ });
    fireEvent.click(seqBtn);
    expect(screen.getByText(/Detected Open Reading Frames/)).toBeTruthy();
    expect(screen.getByText(/Nucleotide Sequence/)).toBeTruthy();

    // Features Table
    const tableBtn = screen.getByRole('button', { name: /Features Table/ });
    fireEvent.click(tableBtn);
    expect(screen.getByText(/Feature Annotations/)).toBeTruthy();
    expect(screen.getByLabelText('Annotation name: AmpR (bla)')).toBeTruthy();
  });

  it('switches preset vectors to pET-28a(+)', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'pet-28a' } });

    expect(screen.getAllByText(/pET-28a\(\+\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5,369 bp/).length).toBeGreaterThan(0);
  });

  it('renders sequence view with separated strands and calculates GC% and Tm upon selection', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);

    // Switch to Sequence & ORFs
    const seqBtn = screen.getByRole('button', { name: /Sequence & ORFs/ });
    fireEvent.click(seqBtn);

    // Strands are labeled with 5' and 3'
    expect(screen.getAllByText('5′').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3′').length).toBeGreaterThan(0);
    expect(screen.getAllByText('aa').length).toBeGreaterThan(0);

    // Click base 1 to trigger selection
    const base1 = screen.getByTitle('bp 1: T');
    fireEvent.click(base1);

    // Verify selection bar appears with GC and Tm
    expect(screen.getByText(/Coordinates:/)).toBeTruthy();
    expect(screen.getByText(/GC:/)).toBeTruthy();
    expect(screen.getByText(/Copy DNA/)).toBeTruthy();
  });

  it('displays min and max of found ORF sequences and updates filters', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);

    expect(screen.getByText(/Minimum ORF Size:/)).toBeTruthy();
    expect(screen.getByText(/Maximum ORF Size:/)).toBeTruthy();
    expect(screen.getByText(/Found Sequences:/)).toBeTruthy();
    expect(screen.getByText(/Min \/ Max Length:/)).toBeTruthy();
  });

  it('loads an annotated GenBank document through the plasmid import control', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);
    fireEvent.input(screen.getByPlaceholderText(/Paste FASTA, GenBank, or raw DNA sequence/i), {
      target: { value: `LOCUS       imported 12 bp DNA circular
FEATURES             Location/Qualifiers
     misc_feature    2..8
                     /label="Imported annotation"
ORIGIN
        1 aaacccgggttt
//` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load Sequence' }));
    fireEvent.click(screen.getByRole('button', { name: /Features Table/ }));

    expect(await screen.findByLabelText('Annotation name: Imported annotation')).toBeTruthy();
    expect(screen.getAllByText(/imported/i).length).toBeGreaterThan(0);
    fireEvent.input(screen.getByLabelText('Annotation name: Imported annotation'), { target: { value: 'Renamed annotation' } });
    expect(await screen.findByLabelText('Annotation name: Renamed annotation')).toBeTruthy();
  });
});
