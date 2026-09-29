import { describe, it, expect } from 'vitest';
import { dataQualityIssues } from '@/tools/gel/quality';
const base = { appliedTransforms: [], deskewAngle: 0, saturatedBands: 0, baselineWarnings: 0 };
describe('dataQualityIssues', () => {
  it('warns about lossy, 8-bit and rescaled sources', () => {
    const t = dataQualityIssues({ ...base, sourceInfo: { format: 'jpeg', bitDepth: 8, lossy: true, rescaled: false } }).map(i => i.text).join(' ');
    expect(t).toMatch(/compression/i);
    expect(t).toMatch(/8-bit/i);
    expect(dataQualityIssues({ ...base, sourceInfo: { format: 'tiff', bitDepth: 32, lossy: false, rescaled: true } }).map(i => i.text).join(' ')).toMatch(/not assessable/i);
  });
  it('reports unknown source, saturated bands and resampling', () => {
    const t = dataQualityIssues({ ...base, sourceInfo: null, saturatedBands: 2, deskewAngle: 1.5, appliedTransforms: ['crop (exact)'] }).map(i => i.text).join(' ');
    expect(t).toMatch(/source unknown/i);
    expect(t).toMatch(/2 saturated/i);
    expect(t).toMatch(/deskew 1\.50°/);
  });
  it('is empty for a clean 16-bit TIFF', () => {
    expect(dataQualityIssues({ ...base, sourceInfo: { format: 'tiff', bitDepth: 16, lossy: false, rescaled: false } })).toEqual([]);
  });
});
