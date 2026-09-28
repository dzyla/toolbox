import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { lazyView } from '@/app/components/lazyView';

describe('lazyView', () => {
  it('shows the fallback, then the loaded component with its props, and reuses the module', async () => {
    let loads = 0;
    const Greeting = lazyView(async () => {
      loads++;
      return { default: ({ name }: { name: string }) => <p>Hello {name}</p> };
    }, <p>Loading…</p>);
    const first = render(<Greeting name="Ada" />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(await screen.findByText('Hello Ada')).toBeTruthy();
    first.unmount();
    render(<Greeting name="Bo" />);
    expect(screen.getByText('Hello Bo')).toBeTruthy();
    expect(loads).toBe(1);
  });

  it('reports a failed chunk load instead of spinning forever', async () => {
    const Broken = lazyView<object>(() => Promise.reject(new Error('chunk missing')), <p>Loading…</p>);
    render(<Broken />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/chunk missing/);
  });
});
