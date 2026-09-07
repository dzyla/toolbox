import { describe, it, expect } from 'vitest';
import {
  TAG_DATABASE,
  PROTEASE_DATABASE,
  KAPUST_2002_TEV_P1_PRIME_EFFICIENCY,
  detectTags,
  findCleavageSites,
  calculateFragmentProperties,
  simulateCleavage,
  calculateMobilityY,
  getVirtualGelLanes,
  buildFusionConstruct,
  STANDARD_LADDER_KDA,
} from '@/core/protein/tags';
import { LYSOZYME } from './protein.test';

describe('Tag Library & Protease Cleavage Simulator (core/protein/tags)', () => {
  // -------------------------------------------------------------------------
  // 1. Tag Database & Detection Verification
  // -------------------------------------------------------------------------
  describe('Tag Database & Literature Specifications (Waugh 2011)', () => {
    it('contains all required tags with canonical sequences and physical properties', () => {
      // Hexahistidine
      expect(TAG_DATABASE.his6.sequence).toBe('HHHHHH');
      expect(TAG_DATABASE.his6.resin).toContain('Ni-NTA');

      // Decahistidine
      expect(TAG_DATABASE.his10.sequence).toBe('HHHHHHHHHH');

      // GST (~26 kDa)
      expect(TAG_DATABASE.gst.sequence.length).toBe(220);
      expect(TAG_DATABASE.gst.approxMwDa).toBeCloseTo(26000, 0); // ~26 kDa
      expect(TAG_DATABASE.gst.resin).toContain('Glutathione');

      // MBP (~42.5 kDa)
      expect(TAG_DATABASE.mbp.sequence.length).toBe(371);
      expect(TAG_DATABASE.mbp.approxMwDa).toBeCloseTo(42500, 0); // ~42.5 kDa
      expect(TAG_DATABASE.mbp.resin).toContain('Amylose');

      // SUMO/Smt3 (~11.5 kDa, ends in GG)
      expect(TAG_DATABASE.sumo.sequence.endsWith('GG')).toBe(true);
      expect(TAG_DATABASE.sumo.approxMwDa).toBeCloseTo(11128, 0); // ~11.5 kDa

      // Twin-Strep (~3 kDa)
      expect(TAG_DATABASE.twin_strep.sequence).toBe('WSHPQFEKGGGSGGGSGGSAWSHPQFEK');
      expect(TAG_DATABASE.twin_strep.approxMwDa).toBeCloseTo(2886, 0); // ~3 kDa
      expect(TAG_DATABASE.twin_strep.resin).toContain('Strep-Tactin');

      // Epitope tags: FLAG, HA, Myc
      expect(TAG_DATABASE.flag.sequence).toBe('DYKDDDDK');
      expect(TAG_DATABASE.ha.sequence).toBe('YPYDVPDYA');
      expect(TAG_DATABASE.myc.sequence).toBe('EQKLISEEDL');
    });

    it('accurately detects individual peptide and domain tags in sequence', () => {
      // Single His6
      const hisSeq = 'MGSSHHHHHHSSGRENLYFQG';
      const hisTags = detectTags(hisSeq);
      expect(hisTags.length).toBe(1);
      expect(hisTags[0]!.tag.id).toBe('his6');
      expect(hisTags[0]!.matchSequence).toBe('HHHHHH');
      expect(hisTags[0]!.start).toBe(4);
      expect(hisTags[0]!.end).toBe(10);

      // His10
      const his10Seq = 'MAHHHHHHHHHHSSG';
      const his10Tags = detectTags(his10Seq);
      expect(his10Tags.length).toBe(1);
      expect(his10Tags[0]!.tag.id).toBe('his10');

      // Epitope tags: FLAG, HA, Myc
      const multiEpitope = 'MDYKDDDDKGGGGSYPYDVPDYAGGGEQKLISEEDL';
      const detected = detectTags(multiEpitope);
      const tagIds = detected.map(d => d.tag.id);
      expect(tagIds).toContain('flag');
      expect(tagIds).toContain('ha');
      expect(tagIds).toContain('myc');

      // GST domain detection
      const gstConstruct = TAG_DATABASE.gst.sequence + 'LEVLFQGP';
      const gstTags = detectTags(gstConstruct);
      expect(gstTags.some(t => t.tag.id === 'gst')).toBe(true);

      // MBP domain detection
      const mbpConstruct = TAG_DATABASE.mbp.sequence + 'ENLYFQG';
      const mbpTags = detectTags(mbpConstruct);
      expect(mbpTags.some(t => t.tag.id === 'mbp')).toBe(true);

      // SUMO domain detection
      const sumoConstruct = TAG_DATABASE.sumo.sequence + 'MVSKGEELFT';
      const sumoTags = detectTags(sumoConstruct);
      expect(sumoTags.some(t => t.tag.id === 'sumo')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Protease Specificity & Reference Values (Kapust 2002 & Waugh 2011)
  // -------------------------------------------------------------------------
  describe('Protease Recognition & Cleavage Rules', () => {
    it('pins Kapust et al. (2002) TEV P1\' tolerance reference efficiencies', () => {
      // Table 1 values from Kapust RB et al. (2002) Protein Eng 15:871-874
      expect(KAPUST_2002_TEV_P1_PRIME_EFFICIENCY.G).toBe(100);
      expect(KAPUST_2002_TEV_P1_PRIME_EFFICIENCY.S).toBe(89);
      expect(KAPUST_2002_TEV_P1_PRIME_EFFICIENCY.A).toBe(82);
      expect(KAPUST_2002_TEV_P1_PRIME_EFFICIENCY.C).toBe(65);
      expect(KAPUST_2002_TEV_P1_PRIME_EFFICIENCY.M).toBe(57);
      expect(KAPUST_2002_TEV_P1_PRIME_EFFICIENCY.N).toBe(52);
      expect(KAPUST_2002_TEV_P1_PRIME_EFFICIENCY.P).toBe(0.1); // Proline is non-cleavable
    });

    it('TEV protease cleaves canonical ENLYFQ↓[G/S/A/C/M] strictly after Q (Kapust 2002)', () => {
      const tev = PROTEASE_DATABASE.tev;
      // Test each canonical optimal P1' residue
      for (const p1Prime of ['G', 'S', 'A', 'C', 'M']) {
        const testSeq = `MHHHHHHSSGENLYFQ${p1Prime}KVFGRCELAA`;
        const sites = tev.findSites(testSeq);
        expect(sites.length).toBe(1);
        expect(sites[0]!.p1Residue).toBe('Q');
        expect(sites[0]!.p1PrimeResidue).toBe(p1Prime);
        expect(sites[0]!.specificityRating).toBe('Optimal');
        expect(sites[0]!.siteIndex).toBe(16); // cleaves after Q (offset 16)
        expect(testSeq.slice(sites[0]!.siteIndex, sites[0]!.siteIndex + 1)).toBe(p1Prime);
      }

      // Proline at P1' is resistant (Kapust 2002)
      const proSeq = 'MHHHHHHSSGENLYFQPKVFGRCELAA';
      const strictSites = tev.findSites(proSeq, false);
      expect(strictSites.length).toBe(0); // Not in canonical optimal set
      const relaxedSites = tev.findSites(proSeq, true);
      expect(relaxedSites.length).toBe(1);
      expect(relaxedSites[0]!.specificityRating).toBe('Resistant');
      expect(relaxedSites[0]!.relativeEfficiencyPct).toBe(0.1);
    });

    it('HRV 3C / PreScission cleaves LEVLFQ↓GP after Q', () => {
      const seq = 'MSPILGYWKIKLEVLFQGPMVSKGEELFT';
      const sites = PROTEASE_DATABASE.hrv3c.findSites(seq);
      expect(sites.length).toBe(1);
      const site = sites[0]!;
      expect(site.p1Residue).toBe('Q');
      expect(site.p1PrimeResidue).toBe('G');
      expect(site.motifSequence).toBe('LEVLFQGP');
      // Cut occurs between Q and G
      expect(seq.slice(0, site.siteIndex).endsWith('LEVLFQ')).toBe(true);
      expect(seq.slice(site.siteIndex).startsWith('GPMVSK')).toBe(true);
      expect(site.scarOnTarget).toContain('GP');
    });

    it('Thrombin cleaves LVPR↓GS after R', () => {
      const seq = 'MGSSHHHHHHSSGLVPRGSKVFGRCELAA';
      const sites = PROTEASE_DATABASE.thrombin.findSites(seq);
      expect(sites.length).toBe(1);
      const site = sites[0]!;
      expect(site.p1Residue).toBe('R');
      expect(site.p1PrimeResidue).toBe('G');
      expect(seq.slice(0, site.siteIndex).endsWith('LVPR')).toBe(true);
      expect(seq.slice(site.siteIndex).startsWith('GSKVFG')).toBe(true);
      expect(site.scarOnTarget).toContain('GS');
    });

    it('Factor Xa cleaves IEGR↓ after R with zero scar', () => {
      const seq = 'MKIEEGKLVIWIEGRKVFGRCELAA';
      const sites = PROTEASE_DATABASE.factor_xa.findSites(seq);
      expect(sites.length).toBe(1);
      const site = sites[0]!;
      expect(site.p1Residue).toBe('R');
      expect(seq.slice(0, site.siteIndex).endsWith('IEGR')).toBe(true);
      expect(seq.slice(site.siteIndex).startsWith('KVFGRCELAA')).toBe(true);
      expect(site.scarOnTarget).toContain('None');
    });

    it('Enterokinase cleaves DDDDK↓ after K with zero scar', () => {
      const seq = 'MDYKDDDDKKVFGRCELAA';
      const sites = PROTEASE_DATABASE.enterokinase.findSites(seq);
      expect(sites.length).toBe(1);
      const site = sites[0]!;
      expect(site.p1Residue).toBe('K');
      expect(seq.slice(0, site.siteIndex).endsWith('DDDDK')).toBe(true);
      expect(seq.slice(site.siteIndex).startsWith('KVFGRCELAA')).toBe(true);
      expect(site.scarOnTarget).toContain('None');
    });

    it('SUMO Protease (Ulp1) recognizes SUMO domain and cleaves after C-term GG with zero scar', () => {
      const seq = TAG_DATABASE.sumo.sequence + 'KVFGRCELAA';
      const sites = PROTEASE_DATABASE.ulp1.findSites(seq);
      expect(sites.length).toBe(1);
      const site = sites[0]!;
      expect(site.p1Residue).toBe('G');
      expect(seq.slice(0, site.siteIndex)).toBe(TAG_DATABASE.sumo.sequence);
      expect(seq.slice(site.siteIndex)).toBe('KVFGRCELAA');
      expect(site.scarOnTarget).toContain('None');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Cleavage Simulation, Thermodynamic Properties & Mass Conservation
  // -------------------------------------------------------------------------
  describe('Cleavage Simulator Calculations & Mass Conservation', () => {
    it('simulates cleavage of His6-TEV-Lysozyme construct and obeys mass conservation', () => {
      const construct = 'MHHHHHHSSGRENLYFQG' + LYSOZYME;
      const sim = simulateCleavage(construct, 'tev');

      expect(sim.cleavageSite).not.toBeNull();
      expect(sim.allCleavageSites.length).toBe(1);

      // Verify fragment assignments
      expect(sim.tagFragment).not.toBeNull();
      expect(sim.targetFragment).not.toBeNull();
      expect(sim.tagFragment!.role).toBe('tag');
      expect(sim.targetFragment!.role).toBe('target');

      // Tag fragment is N-terminal: MHHHHHHSSGRENLYFQ (17 aa)
      expect(sim.tagFragment!.seq).toBe('MHHHHHHSSGRENLYFQ');
      expect(sim.tagFragment!.detectedTags[0]!.tag.id).toBe('his6');

      // Target fragment is C-terminal: GLYSOZYME (130 aa) with 'G' scar
      expect(sim.targetFragment!.seq).toBe('G' + LYSOZYME);
      expect(sim.targetFragment!.scarResidues).toContain('G');

      // Biochemical property calculations:
      // Mass conservation: Hydrolysis of 1 peptide bond consumes 1 H2O molecule (18.015 Da)
      // M_intact + 18.015 = M_N + M_C
      const mIntact = sim.intact.mwDa;
      const mN = sim.nTerminalFragment!.mwDa;
      const mC = sim.cTerminalFragment!.mwDa;
      expect(mIntact + 18.015).toBeCloseTo(mN + mC, 1);

      // Lysozyme base MW: 14313.14 Da
      // Target fragment has 1 extra Gly (+57.02 Da): ~14370 Da
      expect(sim.targetFragment!.mwDa).toBeCloseTo(14370.2, 1);
      expect(sim.targetFragment!.pI).toBeCloseTo(9.3, 1);

      // Extinction coefficient ε280 additivity
      expect(sim.intact.extinction280).toBe(
        sim.nTerminalFragment!.extinction280 + sim.cTerminalFragment!.extinction280
      );

      // Abs 0.1% = ε280 / MW
      expect(sim.intact.abs01Percent).toBeCloseTo(
        sim.intact.extinction280 / sim.intact.mwDa,
        4
      );
    });

    it('simulates cleavage of MBP-TEV fusion and identifies ~42.5 kDa tag', () => {
      const mbpConstruct =
        TAG_DATABASE.mbp.sequence + 'ENLYFQS' + 'KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNT';
      const sim = simulateCleavage(mbpConstruct, 'tev');

      expect(sim.cleavageSite).not.toBeNull();
      expect(sim.tagFragment!.mwKda).toBeCloseTo(41.6, 1); // MBP + ENLYFQ (~41.6 kDa)
      expect(sim.tagFragment!.depletionResin).toContain('Amylose');
      expect(sim.tagFragment!.isAffinityDepleted).toBe(true);
      expect(sim.targetFragment!.isAffinityDepleted).toBe(false);
    });

    it('simulates cleavage of GST-HRV3C fusion and identifies ~26 kDa tag', () => {
      const gstConstruct =
        TAG_DATABASE.gst.sequence + 'LEVLFQGP' + 'MVSKGEELFTGVVPILVELDGDVNGHKFSVS';
      const sim = simulateCleavage(gstConstruct, 'hrv3c');

      expect(sim.cleavageSite).not.toBeNull();
      expect(sim.tagFragment!.mwKda).toBeCloseTo(26.4, 1); // GST + LEVLFQ (~26.4 kDa)
      expect(sim.tagFragment!.depletionResin).toContain('Glutathione');
      expect(sim.targetFragment!.scarResidues).toContain('GP');
    });

    it('simulates cleavage of SUMO-Ulp1 fusion and leaves 0 scar residues', () => {
      const sumoConstruct = TAG_DATABASE.sumo.sequence + LYSOZYME;
      const sim = simulateCleavage(sumoConstruct, 'ulp1');

      expect(sim.cleavageSite).not.toBeNull();
      expect(sim.targetFragment!.seq).toBe(LYSOZYME); // 100% exact authentic target!
      expect(sim.targetFragment!.mwDa).toBeCloseTo(14313.14, 1);
      expect(sim.targetFragment!.scarResidues).toContain('None');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Subtractive Resin Depletion & Warnings (Waugh 2011)
  // -------------------------------------------------------------------------
  describe('Subtractive Affinity Resin Depletion (Waugh 2011)', () => {
    it('correctly configures subtractive IMAC workflow for standard His6-tagged construct', () => {
      const construct = 'MHHHHHHSSGRENLYFQG' + LYSOZYME;
      const sim = simulateCleavage(construct, 'tev');

      const sub = sim.subtractiveDepletion;
      expect(sub).not.toBeNull();
      expect(sub!.isSubtractiveFeasible).toBe(true);
      expect(sub!.affinityResin).toContain('Ni-NTA');
      expect(sub!.elutionCondition).toContain('Imidazole');
      expect(sub!.depletedFragments.length).toBe(1);
      expect(sub!.depletedFragments[0]!.seq).toBe('MHHHHHHSSGRENLYFQ');
      expect(sub!.targetFragment.seq).toBe('G' + LYSOZYME);
      expect(sub!.proteaseRemovalNote).toContain('affinity tag');
    });

    it('warns when target protein contains internal affinity epitope or multiple cut sites', () => {
      // Construct with secondary internal TEV site inside target
      const problematicSeq = 'MHHHHHHSSGENLYFQGMVSKGEELFTENLYFQGSAYSRGVFRRD';
      const sim = simulateCleavage(problematicSeq, 'tev');

      expect(sim.allCleavageSites.length).toBe(2);
      expect(sim.warnings.some(w => w.includes('Multiple (2) cleavage sites'))).toBe(true);
    });

    it('warns when target protein contains an unexpected His-tag', () => {
      // Construct with His-tag on BOTH sides (dual-tagged)
      const dualTagSeq = 'MHHHHHHSSGENLYFQGMVSKGEELFTGHHHHHH';
      const sim = simulateCleavage(dualTagSeq, 'tev');

      expect(sim.warnings.some(w => w.includes('Cleaved target protein contains internal'))).toBe(
        true
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Virtual SDS-PAGE Mobility Preview Calculations
  // -------------------------------------------------------------------------
  describe('Virtual SDS-PAGE Mobility Preview (Weber & Osborn 1969)', () => {
    it('exhibits monotonic log-linear mobility across standard ladder bands', () => {
      let prevY = -1;
      for (const kda of STANDARD_LADDER_KDA) {
        const y = calculateMobilityY(kda * 1000);
        // Smaller MW migrates further down the gel (greater y coordinate)
        expect(y).toBeGreaterThan(prevY);
        prevY = y;
      }
    });

    it('places 250 kDa near top (y ~0.06) and 10 kDa near bottom (y ~0.88)', () => {
      const y250 = calculateMobilityY(250_000);
      const y10 = calculateMobilityY(10_000);
      expect(y250).toBeCloseTo(0.06, 2);
      expect(y10).toBeCloseTo(0.88, 2);
    });

    it('places sub-resolving peptides (< 5 kDa) near dye front (> 0.88)', () => {
      const yHis6 = calculateMobilityY(840);
      expect(yHis6).toBeGreaterThan(0.9);
    });

    it('generates 5 virtual gel lanes with bands for intact, cleaved, flow-through, and bound', () => {
      const construct = 'MHHHHHHSSGRENLYFQG' + LYSOZYME;
      const sim = simulateCleavage(construct, 'tev');
      const lanes = getVirtualGelLanes(sim);

      expect(lanes.length).toBe(5);
      const [ladder, intact, cleaved, flowthrough, bound] = lanes;

      expect(ladder!.id).toBe('ladder');
      expect(ladder!.bands.length).toBe(STANDARD_LADDER_KDA.length);

      expect(intact!.id).toBe('intact');
      expect(intact!.bands.length).toBe(1);
      expect(intact!.bands[0]!.mwKda).toBeCloseTo(sim.intact.mwKda, 1);

      expect(cleaved!.id).toBe('cleaved');
      // Contains target, tag, and uncleaved residual band
      expect(cleaved!.bands.length).toBe(3);

      expect(flowthrough!.id).toBe('flowthrough');
      // Contains pure target
      expect(flowthrough!.bands.length).toBe(1);
      expect(flowthrough!.bands[0]!.name).toContain('Pure Target');

      expect(bound!.id).toBe('bound');
      // Contains cut tag and uncleaved
      expect(bound!.bands.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Fusion Construct Builder
  // -------------------------------------------------------------------------
  describe('Construct Builder Helper', () => {
    it('builds canonical N-terminal fusion constructs ready for simulator', () => {
      const constructed = buildFusionConstruct('his6', 'tev', LYSOZYME);
      expect(constructed.startsWith('MHHHHHHSSGENLYFQG')).toBe(true);
      expect(constructed.endsWith(LYSOZYME)).toBe(true);

      const sim = simulateCleavage(constructed, 'tev');
      expect(sim.cleavageSite).not.toBeNull();
      expect(sim.targetFragment!.seq).toBe('G' + LYSOZYME);
    });
  });
});
