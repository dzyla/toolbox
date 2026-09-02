import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

// happy-dom's Blob cannot pass through IndexedDB's structured clone; Node's can.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
