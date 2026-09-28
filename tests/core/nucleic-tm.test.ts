import { describe, expect, it } from 'vitest';
import { tmNearestNeighbour, type NNOptions } from '@/core/nucleic/tm';

/*
 * Reference melting temperatures (°C) from Biopython 1.84 Bio.SeqUtils.MeltingTemp.Tm_NN with
 * nn_table=DNA_NN3 (SantaLucia 1998 unified parameters). Biopython saltcorr 5 = SantaLucia 1998 ΔS
 * correction, 6 = Owczarzy 2004, 7 = Owczarzy 2008; Mg2+ with saltcorr 5/6 uses the von Ahsen 2001
 * Na-equivalent 120·√([Mg2+] − [dNTP]). dnac1/dnac2 map to primerNM/templateNM.
 */
const SEQS = {
  p20: 'AGCTGACCTGAATGCTTAGC',
  p24: 'ATGCAAGGCTTACCGTAGGAGATC',
  palindrome: 'GCGCAATTGCGC',
  atRich: 'ATTATAATTTAATTAAATAT',
} as const;

const CONDITIONS: Record<string, NNOptions> = {
  owczarzy2004: { primerNM: 250, templateNM: 250, naMM: 50, saltCorrection: 'owczarzy2004' },
  santalucia1998: { primerNM: 250, templateNM: 250, naMM: 50, saltCorrection: 'santalucia1998' },
  none1M: { primerNM: 250, templateNM: 250, naMM: 1000, saltCorrection: 'none' },
  owczarzy2008MgDntp: { primerNM: 250, templateNM: 250, naMM: 0, kMM: 50, mgMM: 1.5, dntpMM: 0.2, saltCorrection: 'owczarzy2008' },
  owczarzy2008Mg: { primerNM: 500, templateNM: 25, naMM: 20, mgMM: 3, saltCorrection: 'owczarzy2008' },
  owczarzy2004MgAsymmetric: { primerNM: 500, templateNM: 50, naMM: 50, mgMM: 2, dntpMM: 0.8, saltCorrection: 'owczarzy2004' },
};

const BIOPYTHON: Record<keyof typeof SEQS, Record<keyof typeof CONDITIONS, number>> = {
  p20: {
    owczarzy2004: 55.03498421927742,
    santalucia1998: 55.34315859280184,
    none1M: 70.65452138594242,
    owczarzy2008MgDntp: 61.452705371741786,
    owczarzy2008Mg: 64.47055107563779,
    owczarzy2004MgAsymmetric: 65.87331367620754,
  },
  p24: {
    owczarzy2004: 58.79623621656782,
    santalucia1998: 59.0289532588655,
    none1M: 74.78456978542346,
    owczarzy2008MgDntp: 65.43072035882847,
    owczarzy2008Mg: 67.98975569694778,
    owczarzy2004MgAsymmetric: 69.54679552362398,
  },
  palindrome: {
    owczarzy2004: 48.90116711572074,
    santalucia1998: 48.485566940526326,
    none1M: 61.51264724167032,
    owczarzy2008MgDntp: 53.45497258214209,
    owczarzy2008Mg: 56.31437235730499,
    owczarzy2004MgAsymmetric: 57.94026762146564,
  },
  atRich: {
    owczarzy2004: 27.845551310850908,
    santalucia1998: 32.50883872550605,
    none1M: 47.40213513440659,
    owczarzy2008MgDntp: 36.85165400113698,
    owczarzy2008Mg: 40.545432070223285,
    owczarzy2004MgAsymmetric: 39.82272572892447,
  },
};

describe('nearest-neighbour Tm against Biopython Tm_NN (DNA_NN3)', () => {
  for (const [name, seq] of Object.entries(SEQS) as Array<[keyof typeof SEQS, string]>) {
    for (const [condition, opts] of Object.entries(CONDITIONS)) {
      it(`${name} · ${condition}`, () => {
        const r = tmNearestNeighbour(seq, opts);
        expect(r.selfComplementary).toBe(name === 'palindrome');
        expect(r.tm).toBeCloseTo(BIOPYTHON[name][condition]!, 6);
      });
    }
  }
});
