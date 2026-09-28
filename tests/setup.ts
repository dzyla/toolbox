import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/preact';
import { clearDrafts } from '@/lib/drafts';
import { Blob as NodeBlob } from 'node:buffer';

// happy-dom's Blob cannot pass through IndexedDB's structured clone; Node's can.
globalThis.Blob = NodeBlob as unknown as typeof Blob;

afterEach(async () => {
  cleanup();
  // Tool drafts live in (fake) IndexedDB; keep tests independent of each other's imports.
  await clearDrafts();
});
