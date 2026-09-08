import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';

const { downloadText } = vi.hoisted(() => ({ downloadText: vi.fn() }));
vi.mock('@/lib/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  downloadText,
}));

import QpcrView from '@/tools/qpcr/View';

describe('qPCR guided analyzer', () => {
  beforeEach(() => downloadText.mockReset());

  it('imports a pasted Cq table and exposes visible column mapping controls', () => {
    render(<QpcrView />);
    fireEvent.input(screen.getByLabelText(/Cq table/i), {
      target: { value: 'sample,target,Cq\nS1,GAPDH,20\n' },
    });

    expect(screen.getByText(/1 observation/i)).toBeTruthy();
    expect(screen.getByText(/map controls/i)).toBeTruthy();
  });

  it('keeps undetermined Cq entries visible as an import warning', () => {
    render(<QpcrView />);
    fireEvent.input(screen.getByLabelText(/Cq table/i), {
      target: { value: 'sample,target,Cq\nS1,GAPDH,Undetermined\n' },
    });

    expect(screen.getByRole('alert').textContent).toMatch(/undetermined/i);
  });

  it('blocks delta-delta Cq results until comparable efficiencies are confirmed', () => {
    render(<QpcrView />);
    fireEvent.click(screen.getByRole('button', { name: /Load example/i }));

    expect(screen.getByText(/confirm comparable.*efficien/i)).toBeTruthy();
    expect(screen.getByText(/blocked/i)).toBeTruthy();
  });

  it('exports raw source rows and derived results as CSV and JSON', () => {
    render(<QpcrView />);
    fireEvent.click(screen.getByRole('button', { name: /Load example/i }));
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    fireEvent.click(screen.getByRole('button', { name: /Export JSON/i }));

    expect(downloadText).toHaveBeenCalledWith(expect.stringMatching(/raw source rows/i), 'qpcr-analysis.csv', 'text/csv;charset=utf-8');
    expect(downloadText).toHaveBeenCalledWith(expect.stringMatching(/"observations"/), 'qpcr-analysis.json', 'application/json;charset=utf-8');
  });
});
