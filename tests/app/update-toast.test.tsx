import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';

const pwa = vi.hoisted(() => ({ needRefresh: true, updateServiceWorker: vi.fn(async () => undefined) }));
vi.mock('virtual:pwa-register/preact', async () => {
  const { useState } = await import('preact/hooks');
  return {
    useRegisterSW: () => {
      const need = useState(pwa.needRefresh);
      const ready = useState(false);
      return { needRefresh: need, offlineReady: ready, updateServiceWorker: pwa.updateServiceWorker };
    },
  };
});

const { UpdateToast } = await import('@/app/components/UpdateToast');

/** A fake service worker container whose registration may hold a waiting worker. */
function fakeServiceWorker(waiting: (EventTarget & { state: string }) | null) {
  const container = new EventTarget();
  Object.assign(container, { controller: null, getRegistration: async () => ({ waiting }) });
  vi.stubGlobal('navigator', { ...navigator, serviceWorker: container });
  return container;
}
function fakeWorker(state = 'installed') {
  return Object.assign(new EventTarget(), { state });
}

let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  pwa.updateServiceWorker.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('UpdateToast', () => {
  it('nothing left waiting (the new version already took over an uncontrolled tab): Update reloads', async () => {
    fakeServiceWorker(null);
    render(<UpdateToast />);
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('a waiting worker: Update asks it to take over and reloads once it is activated', async () => {
    const worker = fakeWorker();
    fakeServiceWorker(worker);
    render(<UpdateToast />);
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(pwa.updateServiceWorker).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
    worker.state = 'activated';
    worker.dispatchEvent(new Event('statechange'));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('a controlled tab reloads on controllerchange, only once', async () => {
    const worker = fakeWorker();
    const container = fakeServiceWorker(worker);
    render(<UpdateToast />);
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(pwa.updateServiceWorker).toHaveBeenCalled());
    container.dispatchEvent(new Event('controllerchange'));
    worker.state = 'activated';
    worker.dispatchEvent(new Event('statechange'));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 10));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
