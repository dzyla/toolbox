import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import SecView from '@/tools/sec/View';
import GibsonView from '@/tools/gibson/View';
import MutagenesisView from '@/tools/mutagenesis/View';
import DiafiltrationView from '@/tools/diafiltration/View';
import RareCodonsView from '@/tools/rare-codons/View';
import { route } from '@/app/router';

describe('Biophysical & Molecular Biology Tools Views Suite', () => {
  it('renders SEC Calibration tool and performs bidirectional prediction', () => {
    route.value = { name: 'tool', toolId: 'sec' };
    render(<SecView />);
    expect(screen.getByText(/SEC Calibration & Stokes Radius/)).toBeTruthy();
    expect(screen.getByText(/Molecular Weight Standards/)).toBeTruthy();
    expect(screen.getByText(/Apparent Molecular Weight/)).toBeTruthy();

    // Switch to MW -> Elution Volume mode
    const modeBtn = screen.getByRole('button', { name: /Target MW → Predict Ve/i });
    fireEvent.click(modeBtn);
    expect(screen.getByText(/Predicted Elution Volume/)).toBeTruthy();
  });

  it('renders Gibson & In-Fusion Assembly tool and calculates primers', () => {
    route.value = { name: 'tool', toolId: 'gibson' };
    render(<GibsonView />);
    expect(screen.getByText(/Gibson & (NEBuilder HiFi|In-Fusion) Assembly Designer/)).toBeTruthy();
    expect(screen.getByText(/PCR Primers for (Assembly|Insert Amplification)/)).toBeTruthy();
    expect(screen.getByText(/Homology Overlap Junctions/)).toBeTruthy();
  });

  it('renders Site-Directed Mutagenesis tool and updates targeted codon', () => {
    route.value = { name: 'tool', toolId: 'mutagenesis' };
    render(<MutagenesisView />);
    expect(screen.getByText(/Site-Directed Mutagenesis Designer/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Codon Picker|Point Mutation/i }));
    expect(screen.getByText(/Target Codon to Mutate/)).toBeTruthy();
    expect(screen.getByText(/Non-Overlapping Primers for Whole-Plasmid PCR/)).toBeTruthy();
    expect(screen.getByText(/Recommended Q5 PCR & KLD Protocol/)).toBeTruthy();
  });

  describe('Site-Directed Mutagenesis construct upload', () => {
    const upload = (container: Element, file: File) => {
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);
    };

    it('imports binary SnapGene .dna files through the SnapGene parser', async () => {
      route.value = { name: 'tool', toolId: 'mutagenesis' };
      const { container } = render(<MutagenesisView />);
      const packet = (type: number, data: number[]) => [type, 0, 0, 0, data.length, ...data];
      const ascii = (value: string) => [...value].map(char => char.charCodeAt(0));
      const bytes = new Uint8Array([
        ...packet(0x09, [...ascii('SnapGene'), 0, 1, 0, 1, 0, 1]),
        ...packet(0x00, [1, ...ascii('ATGAAACCCGGGTTTTAA')]),
      ]);
      upload(container, new File([bytes], 'pTest.dna'));
      await waitFor(() => expect(screen.getByText('18 bp')).toBeTruthy());
      expect((screen.getByDisplayValue('pTest') as HTMLInputElement).value).toBe('pTest');
    });

    it('takes only the ORIGIN sequence from GenBank files, not letters from feature text', async () => {
      route.value = { name: 'tool', toolId: 'mutagenesis' };
      const { container } = render(<MutagenesisView />);
      const genbank = [
        'LOCUS       pGB   12 bp    DNA     circular',
        'FEATURES             Location/Qualifiers',
        '     CDS             1..12',
        '                     /note="A CAT GATE"',
        'ORIGIN',
        '        1 atgcatgcat gc',
        '//',
      ].join('\n');
      upload(container, new File([genbank], 'pGB.gb'));
      await waitFor(() => expect(screen.getByText('12 bp')).toBeTruthy());
    });

    it('reports unreadable files instead of loading garbage', async () => {
      route.value = { name: 'tool', toolId: 'mutagenesis' };
      const { container } = render(<MutagenesisView />);
      upload(container, new File([new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x81])], 'broken.dna'));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Could not import broken\.dna/));
    });
  });

  it('renders Diafiltration & Dialysis Simulator and toggles modes', () => {
    route.value = { name: 'tool', toolId: 'diafiltration' };
    render(<DiafiltrationView />);
    expect(screen.getByText(/Ultrafiltration & Dialysis Simulator/)).toBeTruthy();
    expect(screen.getByText(/Expected Protein Retention/)).toBeTruthy();
    expect(screen.getByText(/Exchange Step-by-Step Trajectory/)).toBeTruthy();

    // Toggle to Dialysis Cassette / Tubing mode
    const dialysisTab = screen.getByRole('button', { name: /Dialysis Cassette \/ Tubing/i });
    fireEvent.click(dialysisTab);
    expect(screen.getByText(/Exchange Step-by-Step Trajectory/)).toBeTruthy();
  });

  it('renders Rare Codon Optimizer and shows host recommendation', () => {
    route.value = { name: 'tool', toolId: 'rare-codons' };
    render(<RareCodonsView />);
    expect(screen.getByText(/Rare Codon & Expression Optimizer/)).toBeTruthy();
    expect(screen.getAllByText(/Codon Adaptation Index/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Recommended Host Strain:/)).toBeTruthy();
    expect(screen.getByText(/Synonymously Optimized Sequence/)).toBeTruthy();
  });
});
