import { useState } from 'preact/hooks';
import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { SequenceCanvas } from '@/tools/sequence/SequenceCanvas';
import type { Selection } from '@/core/sequence-annotator';
import { route } from '@/app/router';
import SequenceView from '@/tools/sequence/View';

function CanvasHarness() {
  const [selection, setSelection] = useState<Selection | null>(null);
  return (
    <>
      <SequenceCanvas
        sequence="ACDEFG"
        annotations={[{ id: 'domain', name: 'Catalytic domain', type: 'domain', start: 2, end: 4, color: '#2563eb', note: '', evidence: 'user' }]}
        selection={selection}
        residuesPerRow={6}
        colourFor={() => 'bg-slate-100'}
        onSelectionChange={setSelection}
      />
      <output>{selection ? `Selection: ${selection.start}–${selection.end}` : 'No selection'}</output>
    </>
  );
}

describe('SequenceCanvas', () => {
  it('selects a contiguous range by dragging across residue buttons', () => {
    render(<CanvasHarness />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Residue 2: C' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Residue 5: F' }));
    fireEvent.mouseUp(screen.getByRole('button', { name: 'Residue 5: F' }));
    expect(screen.getByText('Selection: 2–5')).toBeTruthy();
  });

  it('exposes an annotation band that selects its exact range', () => {
    render(<CanvasHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Annotation: Catalytic domain, residues 2–4' }));
    expect(screen.getByText('Selection: 2–4')).toBeTruthy();
  });
});

describe('Sequence Annotator route', () => {
  it('creates a durable user annotation from the active mouse selection', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);

    expect(await screen.findByRole('heading', { name: /Sequence Annotator/i })).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'ACDEFG' } });
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Residue 2: C' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Residue 4: E' }));
    fireEvent.mouseUp(screen.getByRole('button', { name: 'Residue 4: E' }));
    fireEvent.input(screen.getByLabelText('Annotation name'), { target: { value: 'Active loop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }));

    expect(screen.getByRole('button', { name: 'Annotation: Active loop, residues 2–4' })).toBeTruthy();
  });

  it('shows protein range mass and pI but DNA range GC percentage', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);

    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'ACDEFG' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Residue 1: A' }));
    expect(await screen.findByText('Selected protein range')).toBeTruthy();
    expect(screen.getByText('Monoisotopic mass')).toBeTruthy();
    expect(screen.getByText('Theoretical pI')).toBeTruthy();

    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'ACGTAC' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Residue 1: A' }));
    expect(await screen.findByText('Selected nucleic-acid range')).toBeTruthy();
    expect(screen.getByText('GC content')).toBeTruthy();
  });
});
