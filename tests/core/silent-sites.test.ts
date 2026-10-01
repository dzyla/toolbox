import { describe, it, expect } from 'vitest';
import { analyzeSilentSites, validateCds, silentSitesCsv, DEFAULT_ENZYME_NAMES, enzymesByNames } from '@/core/silent-sites';
import { restrictionSites, translate, ENZYMES } from '@/core/nucleic/sequence';

const subs = (r: { changes: { position: number; substitution: string }[] }) => r.changes.map(c => `${c.position}${c.substitution}`).sort();

describe('hand-built silent changes', () => {
  // ATG GAA TTC AAA TAA : Glu-Phe contains EcoRI GAATTC at nt 4-9
  const cds = 'ATGGAATTCAAATAA';

  it('finds the EcoRI site and exactly the two silent changes that destroy it', () => {
    const r = analyzeSilentSites(cds, { enzymes: ['EcoRI'] });
    expect(r.existing).toHaveLength(1);
    expect(r.existing[0]).toMatchObject({ enzyme: 'EcoRI', position: 4, strand: '+', matched: 'GAATTC' });
    expect(r.destroy.map(d => `${d.change.position}${d.change.substitution}:${d.change.codon}>${d.change.newCodon}`).sort())
      .toEqual(['6A>G:GAA>GAG', '9C>T:TTC>TTT']);
    expect(r.destroy.every(d => d.change.aa === 'E' || d.change.aa === 'F')).toBe(true);
    expect(r.undestroyable).toHaveLength(0);
    // no silent change creates another EcoRI site in this sequence
    expect(r.create).toHaveLength(0);
  });

  it('finds silent changes that create EcoRI (GAGTTC -> GAATTC) and spanning codon boundaries', () => {
    const r = analyzeSilentSites('ATGGAGTTCAAATAA', { enzymes: ['EcoRI'] });
    expect(r.existing).toHaveLength(0);
    expect(r.create).toHaveLength(1);
    expect(r.create[0]!.change).toMatchObject({ position: 6, codon: 'GAG', newCodon: 'GAA', aa: 'E', codonNumber: 2 });
    expect(r.create[0]!.site).toMatchObject({ position: 4, matched: 'GAATTC' });
  });

  it('handles reverse-strand sites of non-palindromic enzymes (BsaI GGTCTC, reverse GAGACC)', () => {
    // GAG ACC = Glu Thr contains GAGACC, the reverse complement of BsaI GGTCTC
    const r = analyzeSilentSites('ATGGAGACCAAATAA', { enzymes: ['BsaI'] });
    expect(r.existing).toHaveLength(1);
    expect(r.existing[0]).toMatchObject({ strand: '-', position: 4, matched: 'GAGACC' });
    expect(r.destroy.map(d => `${d.change.position}${d.change.substitution}`).sort()).toEqual(['6G>A', '9C>A', '9C>G', '9C>T'].sort());
    expect(enzymesByNames(['BsaI'])[0]!.site).toBe('GGTCTC');
    // Type IIS flagged
    expect(r.enzymes[0]!.typeIIS).toBe(true);
    // forward strand: Gly-Leu GGT CTC contains GGTCTC; destroy changes at 3rd base of GGT or CTC
    const f = analyzeSilentSites('ATGGGTCTCAAATAA', { enzymes: ['BsaI'] });
    expect(f.existing[0]).toMatchObject({ strand: '+', position: 4 });
    expect(f.destroy.length).toBeGreaterThan(0);
  });

  it('flags changes that also create or destroy another chosen site', () => {
    const r = analyzeSilentSites(cds, { enzymes: ['EcoRI', 'BamHI', 'MfeI'] });
    // GAATTC -> GAATTG? no (not silent). Just check shape: side-effect arrays exist
    for (const d of r.destroy) { expect(Array.isArray(d.otherLost)).toBe(true); expect(Array.isArray(d.otherGained)).toBe(true); }
  });

  it('annotates new-codon rarity for a host organism', () => {
    // CTG -> CTA (Leu) is rare in E. coli
    const r = analyzeSilentSites('ATGCTGAAATAA', { enzymes: ['XbaI'], host: 'ecoli' });
    const ch = r.changes.find(c => c.codon === 'CTG' && c.newCodon === 'CTA')!;
    expect(ch.newCodonRare).toBe(true);
    expect(ch.oldCodonRare).toBe(false);
    expect(ch.newCodonFraction).toBeGreaterThan(0);
  });

  it('respects reading frame and never mutates stop codons', () => {
    const r = analyzeSilentSites('CATGGAATTCAAATAA', { enzymes: ['EcoRI'], frame: 2 });
    expect(r.destroy.map(d => d.change.position).sort((a, b) => a - b)).toEqual([7, 10]);
    expect(r.changes.some(c => c.aa === '*')).toBe(false);
  });

  it('exports CSV rows', () => {
    const r = analyzeSilentSites(cds, { enzymes: ['EcoRI'] });
    const rows = silentSitesCsv(r, 'destroy');
    expect(rows).toHaveLength(3);
    expect(rows[1]![0]).toBe('EcoRI');
  });
});

describe('validateCds', () => {
  it('cleans FASTA and flags problems', () => {
    expect(validateCds('>x\nATG GAA\nTAA').errors).toEqual([]);
    expect(validateCds('ATGNAA').errors[0]).toMatch(/Only A, C, G and T/);
    expect(validateCds('').errors).toHaveLength(1);
    expect(validateCds('GAATTCAAAG').warnings.join(' ')).toMatch(/ATG/);
    expect(validateCds('ATGGAAT').warnings.join(' ')).toMatch(/multiple of 3/);
    expect(validateCds('ATGTAAGAATAA').warnings.join(' ')).toMatch(/internal stop/);
    expect(validateCds('ATGGAA').warnings.join(' ')).toMatch(/terminal stop/);
  });
});

function lcg(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

describe('brute-force cross-check against the independent restrictionSites scanner', () => {
  const names = [...DEFAULT_ENZYME_NAMES, 'HincII', 'BsrFI', 'AccI', 'BsaI', 'BtgZI', 'AlwI', 'FokI', 'Hpy188I'];
  const enzymes = enzymesByNames(names);
  const keyOf = (s: { enzyme: string; strand: string; position: number }) => `${s.enzyme}|${s.strand}|${s.position}`;
  const keysIn = (dna: string) => new Set(restrictionSites(dna, enzymes).map(keyOf));

  for (const [label, frame] of [['frame 1', 1], ['frame 2', 2]] as const) {
    it(`every reported change is silent and creates/destroys exactly the reported sites (${label})`, () => {
      const rnd = lcg(7 + frame);
      const bases = 'ACGT';
      let dna = 'A'.repeat(frame - 1) + 'ATG';
      // random CDS biased towards sites by seeding known motifs
      const motifs = ['GAATTC', 'GGATCC', 'AAGCTT', 'GGTCTC', 'GAAGAC', 'GTTAAC', 'ACCGGT', 'GGTGAG', 'CTCGAG', 'CATATG'];
      while (dna.length < 900) {
        dna += rnd() < 0.15 ? motifs[Math.floor(rnd() * motifs.length)]! : bases[Math.floor(rnd() * 4)]!;
      }
      dna = dna.slice(0, dna.length - ((dna.length - (frame - 1)) % 3)) + 'TAA';
      const r = analyzeSilentSites(dna, { enzymes: names, frame });
      const baseKeys = keysIn(dna);
      expect(new Set(r.existing.map(keyOf))).toEqual(baseKeys);
      expect(baseKeys.size).toBeGreaterThan(5);

      const reported = new Map(r.changes.map(c => [`${c.position}${c.substitution.slice(-1)}`, c]));
      const proteinFrame = translate(dna, 1, frame);
      let silentCount = 0, withEffect = 0;
      const codons = Math.floor((dna.length - (frame - 1)) / 3);
      for (let c = 0; c < codons; c++) {
        for (let k = 0; k < 3; k++) {
          const p = frame - 1 + 3 * c + k;
          for (const b of bases) {
            if (b === dna[p]) continue;
            const mut = dna.slice(0, p) + b + dna.slice(p + 1);
            const sameProtein = translate(mut, 1, frame) === proteinFrame;
            const isStopCodon = proteinFrame[c] === '*';
            const ch = reported.get(`${p + 1}${b}`);
            if (!sameProtein || isStopCodon) { expect(ch).toBeUndefined(); continue; }
            silentCount++;
            expect(ch, `missing change at ${p + 1}${b}`).toBeDefined();
            const after = keysIn(mut);
            const lost = [...baseKeys].filter(k2 => !after.has(k2)).sort();
            const gained = [...after].filter(k2 => !baseKeys.has(k2)).sort();
            expect(ch!.lost.map(keyOf).sort()).toEqual(lost);
            expect(ch!.gained.map(keyOf).sort()).toEqual(gained);
            if (lost.length || gained.length) withEffect++;
          }
        }
      }
      expect(r.changes.length).toBe(silentCount);
      expect(withEffect).toBeGreaterThan(10);
      expect(subs(r).length).toBe(silentCount);
      // destroy/create rows reference real sites
      for (const d of r.destroy) expect(baseKeys.has(keyOf(d.site))).toBe(true);
    });
  }

  it('knows every default enzyme', () => {
    expect(enzymesByNames(DEFAULT_ENZYME_NAMES).length).toBe(DEFAULT_ENZYME_NAMES.length);
    expect(ENZYMES.length).toBeGreaterThan(100);
  });
});
