import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import CloningHubView from '@/tools/cloning/View';
import { getProject, listRecent } from '@/lib/projects';
import { restoreHubProject } from '@/tools/cloning/hub/state';
import fixture from '../fixtures/vendor/basechanger/tail-designs.json';

const GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

function addPreset(id: string) {
  fireEvent.change(screen.getByLabelText(/Preset vector/), { target: { value: id } });
}

function paste(text: string) {
  fireEvent.input(screen.getByLabelText(/Paste FASTA/), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted sequence' }));
}

const method = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('cloning hub', () => {
  it('guides an empty hub and offers every method', () => {
    render(<CloningHubView />);
    expect(screen.getByRole('heading', { name: /Cloning hub/ })).toBeTruthy();
    expect(screen.getByText(/No sequences yet/)).toBeTruthy();
    expect(screen.getByText(/Add at least two sequences/)).toBeTruthy();
    for (const name of ['NEBuilder / Gibson', 'In-Fusion', 'Restriction + ligation', 'Amino-acid change', 'Golden Gate']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    cleanup();
  });

  it('opens on the matching method from the old #/t/gibson and #/t/mutagenesis links', () => {
    for (const [hash, label] of [['#/t/mutagenesis', 'Amino-acid change'], ['#/t/gibson', 'NEBuilder / Gibson'], ['#/t/cloning', 'NEBuilder / Gibson']] as const) {
      location.hash = hash;
      render(<CloningHubView />);
      expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true');
      cleanup();
    }
    location.hash = '';
  });

  it('takes the first sequence as the vector (circular) and a pasted insert as linear', () => {
    render(<CloningHubView />);
    addPreset('puc19');
    paste(`>GFP\n${GFP}`);
    const roles = screen.getAllByLabelText(/Role of/) as HTMLSelectElement[];
    expect(roles.map(select => select.value)).toEqual(['vector', 'insert']);
    const topologies = screen.getAllByLabelText(/Topology of/) as HTMLSelectElement[];
    expect(topologies.map(select => select.value)).toEqual(['circular', 'linear']);
    cleanup();
  });

  it('designs an NEBuilder assembly with primers, a reaction and a product', () => {
    render(<CloningHubView />);
    addPreset('puc19');
    paste(`>GFP\n${GFP}`);
    const table = screen.getByRole('table', { name: 'NEBuilder primers' });
    expect(within(table).getByText('GFP_fwd')).toBeTruthy();
    expect(within(table).getByText('GFP_rev')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Assembly junctions' })).toBeTruthy();
    expect(screen.getByText(/Incubate in a thermocycler at 50 °C for 15 minutes/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download GenBank' })).toBeTruthy();
    cleanup();
  });

  it('switches to In-Fusion and shows the Takara homology extension in lower case', () => {
    render(<CloningHubView />);
    addPreset('puc19');
    paste(`>GFP\n${GFP}`);
    method('In-Fusion');
    const table = screen.getByRole('table', { name: 'In-Fusion primers' });
    expect(within(table).getByText('gacggccagtgaatt')).toBeTruthy();
    expect(screen.getByText(/PCR reactions to run/)).toBeTruthy();
    expect(screen.getByText(/In-Fusion Snap Assembly Master Mix/)).toBeTruthy();
    cleanup();
  });

  it('designs a directional EcoRI–HindIII ligation and explains it', () => {
    render(<CloningHubView />);
    addPreset('puc19');
    paste(`>gene\nTTTTTTGAATTC${GFP}AAGCTTTTTTTT`);
    method('Restriction + ligation');
    expect(screen.getByText(/Directional: only one orientation/)).toBeTruthy();
    expect(screen.getByText(/Heat inactivate at 65 °C/)).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Fragments to ligate and their ends' })).toBeTruthy();
    cleanup();
  });

  it('warns clearly when the ends cannot ligate', () => {
    render(<CloningHubView />);
    addPreset('puc19');
    paste(`>gene\nTTTTTTGGATCC${GFP}GGATCCTTTTTTTT`);
    method('Restriction + ligation');
    fireEvent.change(screen.getByLabelText(/Vector: second enzyme/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Vector: first enzyme/), { target: { value: 'EcoRI' } });
    fireEvent.change(screen.getByLabelText(/Insert: first enzyme/), { target: { value: 'BamHI' } });
    expect(screen.getByRole('alert').textContent).toMatch(/do not pair|Overhangs/);
    cleanup();
  });

  it('designs Y40F primers from a pasted plasmid and lists them under the mutation', () => {
    render(<CloningHubView />);
    paste(`>vecGFP\n${fixture.plasmid.sequence}`);
    method('Amino-acid change');
    fireEvent.change(screen.getByLabelText(/Reading frame/), { target: { value: '-1' } });
    fireEvent.input(screen.getByLabelText('Start codon position'), { target: { value: '284' } });
    fireEvent.input(screen.getByLabelText('Mutations'), { target: { value: 'Y40F, T39A' } });
    expect(screen.getByRole('heading', { name: 'Y40F' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'T39A' })).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Primers for Y40F' });
    expect(within(table).getByText('Y40F_F')).toBeTruthy();
    expect(within(table).getByText('tttGGCAAGCTGACCCTG'.slice(0, 3))).toBeTruthy();
    cleanup();
  });

  it('reports unreadable mutations without hiding the readable ones', () => {
    render(<CloningHubView />);
    paste(`>vecGFP\n${fixture.plasmid.sequence}`);
    method('Amino-acid change');
    fireEvent.change(screen.getByLabelText(/Reading frame/), { target: { value: '-1' } });
    fireEvent.input(screen.getByLabelText('Start codon position'), { target: { value: '284' } });
    fireEvent.input(screen.getByLabelText('Mutations'), { target: { value: 'Y40F, banana' } });
    expect(screen.getByRole('alert').textContent).toMatch(/Could not read "banana"/);
    expect(screen.getByRole('heading', { name: 'Y40F' })).toBeTruthy();
    cleanup();
  });

  it('inserts, deletes and replaces bases by position with the verified NEB primers', () => {
    render(<CloningHubView />);
    paste(`>vecGFP\n${fixture.plasmid.sequence}`);
    method('Amino-acid change');
    fireEvent.click(screen.getByRole('button', { name: 'Insert, replace or delete bases' }));
    fireEvent.input(screen.getByLabelText('Insert after base'), { target: { value: '403' } });
    fireEvent.input(screen.getByLabelText('New bases'), { target: { value: 'GGATCC' } });
    const insertTable = screen.getByRole('table', { name: 'Primers for ins403' });
    expect(within(insertTable).getByText('ggatcc')).toBeTruthy();
    expect(within(insertTable).getByText('GGCAAGCTGACCCTG')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'delete' } });
    fireEvent.input(screen.getByLabelText('From base'), { target: { value: '287' } });
    fireEvent.input(screen.getByLabelText('To base'), { target: { value: '313' } });
    const deleteTable = screen.getByRole('table', { name: 'Primers for del287-313' });
    expect(within(deleteTable).getByText('GGGGTGGTGCCCATC')).toBeTruthy();
    expect(within(deleteTable).getByText('CATACCGTGCATCTGCC')).toBeTruthy();
    cleanup();
  });

  it('explains an impossible by-position edit instead of failing silently', () => {
    render(<CloningHubView />);
    paste(`>vecGFP\n${fixture.plasmid.sequence}`);
    method('Amino-acid change');
    fireEvent.click(screen.getByRole('button', { name: 'Insert, replace or delete bases' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Enter the bases to insert/);
    cleanup();
  });

  describe('opening sequence files', () => {
    const upload = (container: Element, file: File) => {
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);
    };

    it('reads binary SnapGene .dna files with the SnapGene parser', async () => {
      const { container } = render(<CloningHubView />);
      const packet = (type: number, data: number[]) => [type, 0, 0, 0, data.length, ...data];
      const ascii = (value: string) => [...value].map(char => char.charCodeAt(0));
      const bytes = new Uint8Array([
        ...packet(0x09, [...ascii('SnapGene'), 0, 1, 0, 1, 0, 1]),
        ...packet(0x00, [1, ...ascii('ATGAAACCCGGGTTTTAA')]),
      ]);
      upload(container, new File([bytes], 'pTest.dna'));
      await waitFor(() => expect(screen.getByText(/^18 bp/)).toBeTruthy());
      expect((screen.getByDisplayValue('pTest') as HTMLInputElement).value).toBe('pTest');
      cleanup();
    });

    it('takes only the ORIGIN sequence from GenBank files, not letters from feature text', async () => {
      const { container } = render(<CloningHubView />);
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
      await waitFor(() => expect(screen.getByText(/^12 bp/)).toBeTruthy());
      expect((screen.getByLabelText('Topology of pGB') as HTMLSelectElement).value).toBe('circular');
      cleanup();
    });

    it('reports unreadable files instead of loading garbage', async () => {
      const { container } = render(<CloningHubView />);
      upload(container, new File([new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x81])], 'broken.dna'));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Could not import broken\.dna/));
      expect(screen.getByText(/No sequences yet/)).toBeTruthy();
      cleanup();
    });
  });

  it('plans Golden Gate amounts from the vector size', () => {
    render(<CloningHubView />);
    method('Golden Gate');
    expect(screen.getByText(/Type IIS digestion-ligation|Golden Gate assembly with BsaI-HFv2/)).toBeTruthy();
    expect(screen.getByText(/30 cycles: 37 °C for 3 minutes/)).toBeTruthy();
    cleanup();
  });

  it('saves a project that reopens with its sequences and method', async () => {
    render(<CloningHubView />);
    addPreset('puc19');
    method('In-Fusion');
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }));
    await waitFor(async () => expect((await listRecent(5)).some(project => project.toolId === 'cloning')).toBe(true));
    const saved = (await listRecent(5)).find(project => project.toolId === 'cloning')!;
    const restored = restoreHubProject((await getProject(saved.id))!);
    expect(restored.method).toBe('infusion');
    expect(restored.sources.map(source => source.document.name)).toEqual(['pUC19']);
    cleanup();
  });
});
