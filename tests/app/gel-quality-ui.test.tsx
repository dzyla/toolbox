import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import GelView from '@/tools/gel/View';

vi.mock('@/lib/image', async orig => {
  const real = await orig<typeof import('@/lib/image')>();
  return {
    ...real,
    decodeImageFile: vi.fn(async () => {
      const width = 60, height = 80, data = new Float32Array(width * height).fill(0.1);
      return { width, height, data, format: 'jpeg', bitDepth: 8, rescaled: false, original: new Blob(['x']) };
    }),
  };
});

describe('data-quality panel in every quantification sub-view', () => {
  it('shows the JPEG compression warning in the band table view after loading a JPEG', async () => {
    const { container } = render(<GelView />);
    const input = container.querySelector('input[type="file"][accept*="image/png"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'gel.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: /Band Quantification & Amounts/i }));
    await waitFor(() => expect(screen.getByRole('region', { name: /Data quality/i }).textContent).toMatch(/JPEG input: compression/i));
    // and still present in the loading sub-view
    fireEvent.click(screen.getByRole('button', { name: /Line Loading \(Ponceau S\)/i }));
    expect(screen.getByRole('region', { name: /Data quality/i }).textContent).toMatch(/compression/i);
  });
});
