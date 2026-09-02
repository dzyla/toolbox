import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { Home } from '@/app/pages/Home';
import { saveProject } from '@/lib/projects';
import { relativeTime } from '@/lib/format';

describe('Home', () => {
  it('filters tools by search', async () => {
    render(<Home />);
    const box = screen.getByRole('searchbox');
    fireEvent.input(box, { target: { value: 'rpm' } });
    await waitFor(() => expect(screen.getByText('Centrifuge')).toBeTruthy());
    expect(screen.queryByText('Molarity & Dilution')).toBeNull();
    fireEvent.input(box, { target: { value: 'zzzz' } });
    await waitFor(() => expect(screen.getByText(/No tools match/)).toBeTruthy());
  });
  it('lists recent projects', async () => {
    await saveProject({ id: 'h1', toolId: 'gel', name: 'My gel', version: 1, state: {} });
    render(<Home />);
    expect(await screen.findByText('My gel')).toBeTruthy();
  });
  it('relative time', () => {
    const now = 1_700_000_000_000;
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2 d ago');
  });
});
