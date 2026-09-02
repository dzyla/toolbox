import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Evaluate a browser-global script (window.X = ...) and return the window object. */
export function loadBrowserScript(relPath, win = {}) {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  win.window = win;
  win.console = console;
  win.Math = Math;
  vm.runInNewContext(src, win, { filename: relPath });
  return win;
}

export function readRootFile(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}
