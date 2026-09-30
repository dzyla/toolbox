/* Data-quality checks shown above the quantification: things that make densitometry numbers unreliable. */
import type { SourceInfo } from '@/lib/image';
export interface QualityIssue { level: 'warn' | 'info'; text: string }

export function dataQualityIssues(i: { sourceInfo: SourceInfo | null; appliedTransforms: string[]; deskewAngle: number; saturatedBands: number; baselineWarnings: number }): QualityIssue[] {
  const out: QualityIssue[] = [];
  const s = i.sourceInfo;
  if (!s) out.push({ level: 'info', text: 'Image source unknown (saved before source tracking); check it was an uncompressed imager export.' });
  else {
    if (s.lossy) out.push({ level: 'warn', text: `${s.format.toUpperCase()} input: compression distorts densitometry. Use the imager's raw TIFF.` });
    if (s.bitDepth === 8 && s.format !== 'demo') out.push({ level: 'warn', text: '8-bit image: limited dynamic range (256 levels); faint and strong bands cannot both be in range.' });
    if (s.rescaled) out.push({ level: 'warn', text: 'Float image rescaled to its min–max on import: saturation is not assessable.' });
  }
  if (i.saturatedBands > 0) out.push({ level: 'warn', text: `${i.saturatedBands} saturated band(s): signal is clipped, so their amounts are underestimated.` });
  if (i.baselineWarnings > 0) out.push({ level: 'warn', text: `${i.baselineWarnings} band(s) too wide for the rolling-ball radius (band FWHM above half the radius, so the baseline removes ≳ 10 % of their signal): increase the radius.` });
  if (Math.abs(i.deskewAngle) > 1e-6) out.push({ level: 'info', text: `deskew ${i.deskewAngle.toFixed(2)}° (resampled with bilinear interpolation)` });
  for (const t of i.appliedTransforms) out.push({ level: 'info', text: t });
  return out;
}
