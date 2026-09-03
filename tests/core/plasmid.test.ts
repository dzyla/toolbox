import { describe, it, expect } from 'vitest';
import {
  calculateGC,
  findRestrictionSites,
  findORFs,
  translateDNA,
  reverseComplement,
  PRESET_PLASMIDS,
  parseFastaPlasmid,
  detectPlasmidElements,
} from '@/core/plasmid';

describe('plasmid core analysis', () => {
  it('calculates GC content correctly', () => {
    expect(calculateGC('GCGC')).toBe(100);
    expect(calculateGC('ATAT')).toBe(0);
    expect(calculateGC('ACGT')).toBe(50);
  });

  it('reverse complements and translates DNA', () => {
    expect(reverseComplement('ATG')).toBe('CAT');
    expect(translateDNA('ATGGGCTAA')).toBe('MG*');
  });

  it('finds expected restriction sites in pUC19', () => {
    const puc19 = PRESET_PLASMIDS.find(p => p.id === 'puc19')!;
    const sites = findRestrictionSites(puc19.seq);
    expect(sites.length).toBeGreaterThan(5);

    // EcoRI and BamHI should be single (unique) cutters in pUC19
    const ecori = sites.filter(s => s.enzyme === 'EcoRI');
    expect(ecori.length).toBe(1);
    expect(ecori[0]!.cutCount).toBe(1);

    const bamhi = sites.filter(s => s.enzyme === 'BamHI');
    expect(bamhi.length).toBe(1);
    expect(bamhi[0]!.cutCount).toBe(1);
  });

  it('detects ORFs in plasmids', () => {
    const puc19 = PRESET_PLASMIDS.find(p => p.id === 'puc19')!;
    const orfs = findORFs(puc19.seq, 30);
    expect(orfs.length).toBeGreaterThan(0);
    // Should detect the beta-lactamase (AmpR) or lacZ alpha ORF
    const longest = orfs[0]!;
    expect(longest.lengthAa).toBeGreaterThan(50);
  });

  it('parses FASTA plasmids', () => {
    const fasta = `>MyVector Test\nATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGA\nTCGATCGATCGATCGATCGATC`;
    const plasmid = parseFastaPlasmid(fasta);
    expect(plasmid.name).toBe('MyVector Test');
    expect(plasmid.length).toBe(84);
    expect(plasmid.isCircular).toBe(true);
  });

  it('detects standard biological elements and tags', () => {
    // Construct test sequence with T7 promoter and 6xHis tag
    const seq = 'TAATACGACTCACTATAGGG' + 'ATGGCT' + 'CATCATCATCATCATCAT' + 'TAA';
    const detected = detectPlasmidElements(seq, false);
    expect(detected.some(f => f.name === 'T7 Promoter')).toBe(true);
    expect(detected.some(f => f.name === '6xHis Tag')).toBe(true);
  });
});
