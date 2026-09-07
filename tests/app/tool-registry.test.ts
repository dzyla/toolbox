import { describe, expect, it } from 'vitest';
import { findTool, TOOLS } from '@/tools/registry';
import PlateReaderView from '@/tools/plate-reader/View';

describe('tool registry', () => {
  it('finds the ready qPCR analyzer', () => {
    const qpcr = findTool('qpcr');

    expect(qpcr).toMatchObject({
      id: 'qpcr',
      name: 'qPCR / RT-qPCR Analyzer',
      category: 'sequences',
      status: 'ready',
    });
    expect(qpcr?.load).toBeDefined();
  });

  it('opens the dedicated plate-reader analysis workflow', async () => {
    const plateReader = TOOLS.find(tool => tool.id === 'plate-reader');

    expect(plateReader).toBeDefined();
    expect(plateReader?.load).toBeDefined();
    expect((await plateReader!.load!()).default).toBe(PlateReaderView);
  });
});
