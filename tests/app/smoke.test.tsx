import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { App } from '@/app/App';

describe('App', () => {
  it('renders the Bio-Bench heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Bio-Bench/ })).toBeTruthy();
  });
});
