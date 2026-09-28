import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';

let failNext = true;
vi.mock('@/tools/registry', () => ({
  findTool: (id: string) => id === 'flaky' ? {
    id: 'flaky', name: 'Flaky Tool', icon: '🧪', blurb: '', category: 'calculators', keywords: [], status: 'ready',
    load: () => failNext
      ? (failNext = false, Promise.reject(new TypeError('Failed to fetch dynamically imported module')))
      : Promise.resolve({ default: () => <p>Flaky tool loaded</p> }),
  } : undefined,
}));

const { ToolPage } = await import('@/app/pages/ToolPage');

describe('ToolPage', () => {
  it('explains a failed chunk load and recovers with Try again', async () => {
    render(<ToolPage toolId="flaky" />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Flaky Tool could not be loaded/);
    expect(alert.textContent).toMatch(/Failed to fetch dynamically imported module/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Flaky tool loaded')).toBeTruthy();
  });
});
