import { describe, expect, it } from 'vitest';
import { infusionAmounts, nebuilderAmounts } from '@/core/cloning/amounts';
import { infusionProtocol, nebuilderProtocol } from '@/core/cloning/protocols';
import { protocolText, waterVolume } from '@/core/cloning/protocol';

describe('assembly protocols', () => {
  it('renders the NEBuilder calculator example as a reaction table that adds up', () => {
    const plan = nebuilderAmounts([
      { name: 'pUC19', bp: 2686, ngPerUl: 50, isVector: true },
      { name: 'insert', bp: 754, ngPerUl: 20, isVector: false },
    ]);
    const protocol = nebuilderProtocol(plan);
    const table = protocol.reactions[0]!;
    expect(table.components.map(component => component.name)).toEqual(['pUC19 (2,686 bp, vector)', 'insert (754 bp)', 'NEBuilder HiFi DNA Assembly Master Mix', 'Deionized water']);
    expect(waterVolume(table)).toBeCloseTo(6, 1);
    const text = protocolText(protocol);
    expect(text).toContain('0.05 pmol (');
    expect(text).toContain('50 °C for 15 minutes');
    expect(text).toContain('Transform 2 µL');
  });

  it('renders In-Fusion with a 5X master mix and the 15 minute incubation', () => {
    const protocol = infusionProtocol(infusionAmounts({ bp: 2686, ngPerUl: 50 }, [{ name: 'GFP', bp: 754, ngPerUl: 40 }], 100), 'pUC19');
    const table = protocol.reactions[0]!;
    expect(table.totalVolumeUl).toBe(10);
    expect(table.components.find(component => component.name.includes('Master Mix'))).toMatchObject({ stock: '5X', volumeUl: 2 });
    expect(waterVolume(table)).toBeGreaterThan(0);
    expect(protocolText(protocol)).toContain('50 °C for 15 min');
  });
});
