import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/tools/registry';
import PlateReaderView from '@/tools/plate-reader/View';

describe('tool registry', () => {
  it('opens the dedicated plate-reader analysis workflow', async () => {
    const plateReader = TOOLS.find(tool => tool.id === 'plate-reader');

    expect(plateReader).toBeDefined();
    expect(plateReader?.load).toBeDefined();
    expect((await plateReader!.load!()).default).toBe(PlateReaderView);
  });
});
