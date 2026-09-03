import { describe, it, expect } from 'vitest';
import { TOOLS, CATEGORIES, findTool, searchTools, toolsByCategory } from '@/tools/registry';

describe('registry', () => {
  it('has unique ids and valid categories', () => {
    const ids = TOOLS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOOLS) expect(CATEGORIES[t.category]).toBeTruthy();
    for (const t of TOOLS) expect(t.status === 'ready' ? t.load : true).toBeTruthy();
  });
  it('finds and searches', () => {
    expect(findTool('molarity')?.name).toMatch(/Molarity/);
    expect(searchTools('').length).toBe(TOOLS.length);
    expect(searchTools('C1V1').map(t => t.id)).toContain('molarity');
    expect(searchTools('zzzz-none')).toEqual([]);
  });
  it('groups by category in order', () => {
    const groups = toolsByCategory();
    const orders = groups.map(g => CATEGORIES[g.category].order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const g of groups) expect(g.tools.length).toBeGreaterThan(0);
  });
  it('registers all ported tools as ready and loadable', () => {
    const porting = TOOLS.filter(t => t.status === 'porting');
    expect(porting).toEqual([]);
    const readyTools = [
      'molarity', 'buffers', 'centrifuge', 'master-mix', 'ammonium-sulfate',
      'cryoem', 'protein', 'protein-conc', 'nucleic', 'sequence', 'plasmid',
      'align', 'binding', 'gel', 'colors',
    ];
    for (const id of readyTools) {
      expect(findTool(id)).toMatchObject({ status: 'ready', load: expect.any(Function) });
    }
  });
});
