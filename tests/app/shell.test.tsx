import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { App } from '@/app/App';
import { route } from '@/app/router';

describe('shell', () => {
  it('shows home by default with the search box and categories', async () => {
    route.value = { name: 'home' };
    render(<App />);
    expect(screen.getByRole('searchbox')).toBeTruthy();
    expect(await screen.findByText('Calculators')).toBeTruthy();
  });
  it('shows a placeholder for tools still being ported', async () => {
    route.value = { name: 'tool', toolId: 'protein' };
    render(<App />);
    expect(await screen.findByText(/Being rebuilt/)).toBeTruthy();
  });
  it('shows not found for unknown tools', async () => {
    route.value = { name: 'tool', toolId: 'nothing-here' };
    render(<App />);
    expect(await screen.findByText(/not found/i)).toBeTruthy();
  });
});
