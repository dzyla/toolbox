import { useState } from 'preact/hooks';
import { fireEvent, render, screen, within } from '@testing-library/preact';
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

  it('keeps residues at a fixed readable pitch and allows intentional density scrolling', () => {
    render(<CanvasHarness />);
    const canvas = screen.getByLabelText('Interactive sequence canvas');
    expect(canvas.className).toContain('overflow-x-auto');
    expect(screen.getByRole('button', { name: 'Residue 1: A' }).className).toContain('w-[0.9rem]');
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
  it('keeps opt-in protein feature hits compact and shows their detail in the inspector', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);
    fireEvent.click(screen.getByRole('radio', { name: 'Protein' }));
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'AAHHHHHHGG' } });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Protein feature candidates' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Residue 5: H' }), { detail: 1 });
    expect(await screen.findByText('Selection: 3–8')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Feature candidate: His-Tag \(6x\), residues 3–8/ }));
    expect(await screen.findByText('Selection: 3–8')).toBeTruthy();
    const inspector = screen.getByLabelText('Selection inspector');
    expect(within(inspector).getByText('His-Tag (6x)', { selector: 'strong' })).toBeTruthy();
    expect(within(inspector).getByText(/Immobilized Metal Affinity Chromatography/)).toBeTruthy();
    expect(screen.queryByLabelText('Detected protein features')).toBeNull();
  });

  it('lets a mouse-made selection be corrected start-first by exact coordinates', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);
    fireEvent.click(screen.getByRole('radio', { name: 'Protein' }));
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'M'.repeat(250) } });
    fireEvent.click(await screen.findByRole('button', { name: 'Residue 100: M' }));

    const end = screen.getByLabelText('Selection end');
    const start = screen.getByLabelText('Selection start');
    fireEvent.input(end, { target: { value: '200' } });
    fireEvent.blur(end);
    fireEvent.input(start, { target: { value: '201' } });
    fireEvent.blur(start);
    fireEvent.input(end, { target: { value: '250' } });
    fireEvent.blur(end);

    expect(await screen.findByText('Selection: 201–250')).toBeTruthy();
    expect(screen.getByText('50 aa selected')).toBeTruthy();
  });

  it('updates the canvas selection immediately when either coordinate is edited', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);
    fireEvent.click(screen.getByRole('radio', { name: 'Protein' }));
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'M'.repeat(250) } });
    fireEvent.click(await screen.findByRole('button', { name: 'Residue 100: M' }));

    fireEvent.input(screen.getByLabelText('Selection start'), { target: { value: '120' } });
    expect(await screen.findByText('Selection: 100–120')).toBeTruthy();
    expect(screen.getByText('21 aa selected')).toBeTruthy();

    fireEvent.input(screen.getByLabelText('Selection end'), { target: { value: '150' } });
    expect(await screen.findByText('Selection: 120–150')).toBeTruthy();
    expect(screen.getByText('31 aa selected')).toBeTruthy();
  });

  it('creates a durable user annotation from the active pointer selection', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);

    expect(await screen.findByRole('heading', { name: /Sequence Annotator/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Protein' }));
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
    fireEvent.click(screen.getByRole('radio', { name: 'Protein' }));
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

  it('shows protein mass and pI but DNA GC percentage in the selection inspector', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);

    fireEvent.click(screen.getByRole('radio', { name: 'Protein' }));
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'ACDEFG' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Residue 1: A' }));
    expect(within(screen.getByLabelText('Selection inspector')).getByText('Monoisotopic mass')).toBeTruthy();
    expect(within(screen.getByLabelText('Selection inspector')).getByText('Theoretical pI')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'DNA' }));
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'ACGTAC' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Residue 1: A' }));
    expect(within(screen.getByLabelText('Selection inspector')).getByText('GC content')).toBeTruthy();
  });

  it('keeps selection metrics in the fixed inspector, including quick nucleic Tm', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);
    fireEvent.click(screen.getByRole('radio', { name: 'Protein' }));
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'ACDEFG' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Residue 1: A' }));
    const proteinInspector = screen.getByLabelText('Selection inspector');
    expect(within(proteinInspector).getByText('Theoretical pI')).toBeTruthy();
    expect(within(proteinInspector).getByText('Monoisotopic mass')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'DNA' }));
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'ACGTACGTACGTACGT' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Residue 1: A' }));
    const nucleicInspector = screen.getByLabelText('Selection inspector');
    expect(within(nucleicInspector).getByText('GC content')).toBeTruthy();
    expect(within(nucleicInspector).getByText(/Quick oligo Tm/)).toBeTruthy();
  });

  it('uses an explicit sequence kind while showing detection as non-mutating advice', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);
    fireEvent.click(screen.getByRole('radio', { name: 'Protein' }));
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'ATCGATCG' } });
    expect(screen.getByText('Possibly DNA')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Protein' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'RNA' }));
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'ACGUACGU' } });
    expect(screen.getByRole('radio', { name: 'RNA' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/8 nt · RNA/)).toBeTruthy();
  });

  it('keeps protein candidate scanning off until its optional analysis layer is enabled', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);
    fireEvent.click(screen.getByRole('radio', { name: 'Protein' }));
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'AAHHHHHHGG' } });
    expect(screen.queryByLabelText('Detected protein features')).toBeNull();
    const layer = screen.getByRole('checkbox', { name: 'Protein feature candidates' });
    expect((layer as HTMLInputElement).checked).toBe(false);
    fireEvent.click(layer);
    expect((layer as HTMLInputElement).checked).toBe(true);
  });

  it('renders an opt-in quick RNA pairing sketch in the stable inspector', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);
    fireEvent.click(screen.getByRole('radio', { name: 'RNA' }));
    fireEvent.input(screen.getByLabelText('Sequence input'), { target: { value: 'GGGAAACCC' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Residue 1: G' }));
    fireEvent.input(screen.getByLabelText('Selection end'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'RNA secondary structure' }));

    const inspector = screen.getByLabelText('Selection inspector');
    expect(within(inspector).getByLabelText('Quick RNA secondary structure')).toBeTruthy();
    expect(within(inspector).getByText('(((...)))')).toBeTruthy();
    expect(within(inspector).getByLabelText('RNA base-pair arc map')).toBeTruthy();
  });
});
