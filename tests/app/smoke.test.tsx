import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { App } from '@/app/App';
import { route } from '@/app/router';

describe('App', () => {
  it('renders the Bio-Bench brand link and footer', () => {
    route.value = { name: 'home' };
    render(<App />);
    expect(screen.getByRole('link', { name: /Bio-Bench/ })).toBeTruthy();
    expect(screen.getByText(/Report a wrong value/)).toBeTruthy();
  });
});
