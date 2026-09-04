import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import StructureView from '@/tools/structure/View';

describe('3D Structure & RMSD Superposition View', () => {
  it('renders structure viewer with default benchmark and displays Ca RMSD', () => {
    render(<StructureView />);

    expect(screen.getByRole('heading', { name: /3D Structure/i })).toBeTruthy();
    expect(screen.getByText(/3D Backbone Canvas/i)).toBeTruthy();
    expect(screen.getAllByText(/Cα RMSD/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/20 Cα pairs/i)).toBeTruthy();
    expect(screen.getByText(/Per-Residue Cα Deviation Profile/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download Aligned PDB/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeTruthy();
  });

  it('switches between superposition mode and single structure mode', () => {
    render(<StructureView />);

    // Switch to Single Structure View
    const singleBtn = screen.getByRole('button', { name: /Single Structure View/i });
    fireEvent.click(singleBtn);

    expect(screen.getByText(/Total Residues/i)).toBeTruthy();
    expect(screen.getAllByText(/Radius of Gyration/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Download Aligned PDB/i)).toBeNull();

    // Switch back to Superposition
    const superBtn = screen.getByRole('button', { name: /Superposition & RMSD/i });
    fireEvent.click(superBtn);
    expect(screen.getAllByText(/Cα RMSD/i).length).toBeGreaterThan(0);
  });

  it('renders Mol* Viewer external link', () => {
    render(<StructureView />);
    const molstarLinks = screen.getAllByRole('link', { name: /Mol\* Viewer/i });
    expect(molstarLinks.length).toBeGreaterThan(0);
    expect(molstarLinks[0]!.getAttribute('href')).toContain('molstar.org/viewer');
  });
});
