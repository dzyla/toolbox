import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import PlasmidView from '@/tools/plasmid/View';
import { CircularMap } from '@/tools/plasmid/CircularMap';
import { LinearMap } from '@/tools/plasmid/LinearMap';
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
