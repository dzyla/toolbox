import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import StructureView from '@/tools/structure/View';

describe('3D Structure Viewer', () => {
  it('renders structure viewer with Mol* canvas and structure metrics', () => {
    render(<StructureView />);

    expect(screen.getByRole('heading', { name: /3D Structure Viewer/i })).toBeTruthy();
    expect(screen.getByText(/3D Backbone Canvas/i)).toBeTruthy();
    expect(screen.getByText(/Total Residues/i)).toBeTruthy();
    expect(screen.getAllByText(/Radius of Gyration/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cα Atoms/i)).toBeTruthy();
    expect(screen.getByText(/Total Atoms/i)).toBeTruthy();
  });

  it('renders Mol* Viewer external link and preset benchmarks', () => {
    render(<StructureView />);
    const molstarLinks = screen.getAllByRole('link', { name: /Mol\* Viewer/i });
    expect(molstarLinks.length).toBeGreaterThan(0);
    expect(molstarLinks[0]!.getAttribute('href')).toContain('molstar.org/viewer');

    expect(screen.getByText(/Ubiquitin/i)).toBeTruthy();
    expect(screen.getByText(/Trp-Cage/i)).toBeTruthy();
    expect(screen.getByText(/Lysozyme/i)).toBeTruthy();
    expect(screen.getByText(/Hemoglobin/i)).toBeTruthy();
  });

  it('provides explicit Fetch & Load button and file upload input', () => {
    render(<StructureView />);

    const fetchLoadBtn = screen.getByRole('button', { name: /Fetch & Load/i });
    expect(fetchLoadBtn).toBeTruthy();

    expect(screen.getByText(/Upload Custom Structure File/i)).toBeTruthy();
    expect(screen.getByText(/Primary Sequence & Chain Composition/i)).toBeTruthy();
  });

  it('renders actual PDB ligand names in sequence and displays Ligands & Cofactors section', async () => {
    const { fireEvent } = await import('@testing-library/preact');
    render(<StructureView />);

    const mockPdbWithLigand = [
      'HETNAM     HEM PROTOPORPHYRIN IX CONTAINING FE',
      'ATOM      1  N   GLY A   1      11.104  13.207   9.000  1.00 20.00           N',
      'ATOM      2  CA  GLY A   1      11.104  13.207  10.000  1.00 20.00           C',
      'ATOM      3  C   GLY A   1      11.104  13.207  11.000  1.00 20.00           C',
      'ATOM      4  O   GLY A   1      11.104  13.207  12.000  1.00 20.00           O',
      'HETATM    5  FE  HEM A 142      15.000  15.000  15.000  1.00 15.00          FE',
      'HETATM    6  N   HEM A 142      15.500  15.000  15.000  1.00 15.00           N',
    ].join('\n');

    const file = new File([mockPdbWithLigand], 'myoglobin.pdb', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { files: [file] } });

    // Wait for file reader
    await new Promise(r => setTimeout(r, 50));

    // Verify ligand badge renders with actual PDB name [HEM]
    expect(screen.getByText('[HEM]')).toBeTruthy();
    expect(screen.queryByText('X')).toBeNull();

    // Verify Ligands & Cofactors card renders
    expect(screen.getByText(/Ligands & Cofactors/i)).toBeTruthy();
    expect(screen.getAllByText('HEM').length).toBeGreaterThan(0);
    expect(screen.getByText('PROTOPORPHYRIN IX CONTAINING FE')).toBeTruthy();
  });

  it('renders 1JGQ 30S Ribosome preset benchmark button', () => {
    render(<StructureView />);
    expect(screen.getByText(/1JGQ/i)).toBeTruthy();
    expect(screen.getByText(/30S Ribosome/i)).toBeTruthy();
  });

  it('renders Subunits Overview Table for multi-chain ribosomal complex with search, inspect, and consolidated ligands', async () => {
    const { fireEvent } = await import('@testing-library/preact');
    render(<StructureView />);

    const mockRibosomePdb = [
      'COMPND    MOL_ID: 1;',
      'COMPND   2 MOLECULE: 16S RIBOSOMAL RNA;',
      'COMPND   3 CHAIN: A;',
      'COMPND   4 MOL_ID: 2;',
      'COMPND   5 MOLECULE: TRNA(PHE);',
      'COMPND   6 CHAIN: B, C;',
      'COMPND   7 MOL_ID: 3;',
      'COMPND   8 MOLECULE: 30S RIBOSOMAL PROTEIN S2;',
      'COMPND   9 CHAIN: E;',
      // Chain A: 16S rRNA
      'ATOM      1  P     U A   1     -50.761  76.728 327.188  1.00 20.00           P',
      'ATOM      2  P     G A   2     -48.559  75.043 336.960  1.00 20.00           P',
      // Chain B: tRNA
      'ATOM      3  P     A B   1     -10.000  10.000  10.000  1.00 20.00           P',
      'ATOM      4  P     C B   2     -12.000  12.000  12.000  1.00 20.00           P',
      // Chain C: tRNA
      'ATOM      5  P     G C   1     -20.000  20.000  20.000  1.00 20.00           P',
      // Chain E: Protein S2
      'ATOM      6  CA  MET E   1       6.000   6.000   6.000  1.00 20.00           C',
      'ATOM      7  CA  GLY E   2       8.000   8.000   8.000  1.00 20.00           C',
      // Real ligands (multiple MG ions)
      'HETATM    8 MG    MG A 201     -40.000  70.000 320.000  1.00 15.00          MG',
      'HETATM    9 MG    MG B 202     -42.000  72.000 322.000  1.00 15.00          MG',
    ].join('\n');

    const file = new File([mockRibosomePdb], '1jgq-sample.pdb', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { files: [file] } });
    await new Promise(r => setTimeout(r, 50));

    // 4 chains loaded (>3 chains), so Subunits Overview Table should render by default
    expect(screen.getByText(/16S RIBOSOMAL RNA/i)).toBeTruthy();
    expect(screen.getAllByText(/TRNA\(PHE\)/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/30S RIBOSOMAL PROTEIN S2/i)).toBeTruthy();
    expect(screen.getAllByText('RNA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Protein').length).toBeGreaterThan(0);

    // Filter subunits by search query
    const searchInput = screen.getByPlaceholderText(/Filter subunits/i) as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    fireEvent.input(searchInput, { target: { value: 'S2' } });

    expect(screen.getByText(/30S RIBOSOMAL PROTEIN S2/i)).toBeTruthy();
    expect(screen.queryByText(/16S RIBOSOMAL RNA/i)).toBeNull();

    // Reset search
    fireEvent.input(searchInput, { target: { value: '' } });
    expect(screen.getByText(/16S RIBOSOMAL RNA/i)).toBeTruthy();

    // Inspect Chain A
    const inspectButtons = screen.getAllByRole('button', { name: /Inspect/i });
    expect(inspectButtons.length).toBeGreaterThan(0);
    fireEvent.click(inspectButtons[0]!);

    // Should switch to Chain A detailed view with back button and sequence
    expect(screen.getByText(/Back to Subunits Overview/i)).toBeTruthy();
    expect(screen.getByText('UG')).toBeTruthy(); // Chain A pure sequence (UG)

    // Click back to overview
    fireEvent.click(screen.getByText(/Back to Subunits Overview/i));
    expect(screen.getByText(/16S RIBOSOMAL RNA/i)).toBeTruthy();

    // Verify consolidated ligands card (2 MG ions consolidated into 1 card showing 2 molecules)
    expect(screen.getByText(/2 molecules/i)).toBeTruthy();
    expect(screen.getByText(/Found in Chains: A, B/i)).toBeTruthy();
  });
});
