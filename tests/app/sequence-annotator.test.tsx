import { useState } from 'preact/hooks';
import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
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

function MultiRowCanvasHarness() {
  const [selection, setSelection] = useState<Selection | null>(null);
  return (
    <>
      <SequenceCanvas
        sequence={'A'.repeat(31)}
        annotations={[]}
        selection={selection}
        residuesPerRow={30}
        colourFor={() => 'bg-slate-100'}
        onSelectionChange={setSelection}
      />
      <output>{selection ? `Selection: ${selection.start}–${selection.end}` : 'No selection'}</output>
    </>
  );
}

function makePointerCapturable(element: HTMLElement) {
  Object.defineProperties(element, {
    setPointerCapture: { value: vi.fn(), configurable: true },
    releasePointerCapture: { value: vi.fn(), configurable: true },
  });
}

describe('SequenceCanvas', () => {
  it('selects a contiguous range through captured pointer dragging', () => {
    render(<CanvasHarness />);
    const start = screen.getByRole('button', { name: 'Residue 2: C' });
    makePointerCapturable(start);
    fireEvent.pointerDown(start, { pointerId: 4, button: 0 });
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Residue 5: F' }), { pointerId: 4 });
    fireEvent.pointerUp(start, { pointerId: 4 });
    expect(screen.getByText('Selection: 2–5')).toBeTruthy();
  });

  it('uses hit testing to extend a captured drag after the pointer leaves its start residue', () => {
    render(<CanvasHarness />);
    const canvas = screen.getByLabelText('Interactive sequence canvas');
    const start = screen.getByRole('button', { name: 'Residue 2: C' });
    makePointerCapturable(start);
    const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(screen.getByRole('button', { name: 'Residue 5: F' }));
    try {
      fireEvent.pointerDown(start, { pointerId: 4, button: 0 });
      fireEvent.pointerMove(canvas, { pointerId: 4, clientX: 100, clientY: 100 });
      fireEvent.pointerUp(canvas, { pointerId: 4 });
      expect(screen.getByText('Selection: 2–5')).toBeTruthy();
    } finally {
      hit.mockRestore();
    }
  });

  it('continues a captured drag into the next rendered sequence row', () => {
    render(<MultiRowCanvasHarness />);
    const canvas = screen.getByLabelText('Interactive sequence canvas');
    const start = screen.getByRole('button', { name: 'Residue 30: A' });
    makePointerCapturable(start);
    const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(screen.getByRole('button', { name: 'Residue 31: A' }));
    try {
      fireEvent.pointerDown(start, { pointerId: 4, button: 0 });
      fireEvent.pointerMove(canvas, { pointerId: 4, clientX: 100, clientY: 100 });
      fireEvent.pointerUp(canvas, { pointerId: 4 });
      expect(screen.getByText('Selection: 30–31')).toBeTruthy();
    } finally {
      hit.mockRestore();
    }
  });

  it('keeps the residue grid responsive rather than creating a horizontal scroller', () => {
    render(<CanvasHarness />);
    const canvas = screen.getByLabelText('Interactive sequence canvas');
    expect(canvas.className).not.toContain('overflow-x-auto');
    expect(canvas.style.userSelect).toBe('none');
    expect(canvas.style.touchAction).toBe('none');
  });

  it('exposes an annotation band that selects its exact range', () => {
    render(<CanvasHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Annotation: Catalytic domain, residues 2–4' }));
    expect(screen.getByText('Selection: 2–4')).toBeTruthy();
  });
});

describe('Sequence Annotator route', () => {
  it('creates a durable user annotation from the active pointer selection', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);

    expect(await screen.findByRole('heading', { name: /Sequence Annotator/i })).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'ACDEFG' } });
    const start = await screen.findByRole('button', { name: 'Residue 2: C' });
    makePointerCapturable(start);
    fireEvent.pointerDown(start, { pointerId: 4, button: 0 });
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Residue 4: E' }), { pointerId: 4 });
    fireEvent.pointerUp(start, { pointerId: 4 });
    fireEvent.input(screen.getByLabelText('Annotation name'), { target: { value: 'Active loop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }));

    expect(screen.getByRole('button', { name: 'Annotation: Active loop, residues 2–4' })).toBeTruthy();
  });

  it('keeps a long selected sequence preview concise', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);
    const sequence = 'ACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWY';
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: sequence } });
    const start = await screen.findByRole('button', { name: 'Residue 1: A' });
    makePointerCapturable(start);
    fireEvent.pointerDown(start, { pointerId: 4, button: 0 });
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Residue 60: Y' }), { pointerId: 4 });
    fireEvent.pointerUp(start, { pointerId: 4 });

    expect(await screen.findByText('Selection: 1–60')).toBeTruthy();
    expect(screen.getByText('60 aa selected')).toBeTruthy();
    expect(screen.queryByText(sequence)).toBeNull();
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
