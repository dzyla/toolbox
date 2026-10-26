import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIR = join(__dirname, '..', 'fixtures', 'structure');

/** Read a structure fixture as text; `.gz` files are gunzipped. */
export function read(name: string): string {
  const buf = readFileSync(join(DIR, name));
  return (name.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8');
}
