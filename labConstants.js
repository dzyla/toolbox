window.LAB_CONSTANTS = {
  chemicals: [
    // --- BUFFERS (Good's Buffers & Standards) ---
    { name: "Tris-base", mw: 121.14, type: "buffer" },
    { name: "Tris-HCl", mw: 157.60, type: "buffer" },
    { name: "HEPES", mw: 238.30, type: "buffer" },
    { name: "HEPES Sodium Salt", mw: 260.29, type: "buffer" },
    { name: "MOPS", mw: 209.26, type: "buffer" },
    { name: "MES (monohydrate)", mw: 213.25, type: "buffer" }, // Common hydration
    { name: "MES (anhydrous)", mw: 195.24, type: "buffer" },
    { name: "PIPES", mw: 302.37, type: "buffer" },
    { name: "TES", mw: 229.25, type: "buffer" },
    { name: "Tricine", mw: 179.17, type: "buffer" },
    { name: "Bicine", mw: 163.17, type: "buffer" },
    { name: "TAPS", mw: 243.28, type: "buffer" },
    { name: "CAPS", mw: 221.32, type: "buffer" },
    { name: "BES", mw: 213.25, type: "buffer" },
    { name: "Bis-Tris", mw: 209.24, type: "buffer" },
    { name: "Bis-Tris Propane", mw: 282.34, type: "buffer" },
    { name: "ADA", mw: 190.22, type: "buffer" },
    { name: "ACES", mw: 182.20, type: "buffer" },
    { name: "Cholamine chloride", mw: 139.63, type: "buffer" },
    { name: "Acetate (Sodium salt, trihydrate)", mw: 136.08, type: "buffer" },
    { name: "Acetate (Ammonium salt)", mw: 77.08, type: "buffer" },
    { name: "Citrate (Sodium salt, dihydrate)", mw: 294.10, type: "buffer" },
    { name: "Borate (Boric Acid)", mw: 61.83, type: "buffer" },
    { name: "Sodium Bicarbonate", mw: 84.01, type: "buffer" },
    { name: "Sodium Carbonate", mw: 105.99, type: "buffer" },
    { name: "Imidazole", mw: 68.08, type: "buffer component" },
    { name: "Glycine", mw: 75.07, type: "buffer component" },

    // --- PHOSPHATES (Na/K systems) ---
    { name: "Sodium Phosphate Monobasic (NaH2PO4) monohydrate", mw: 137.99, type: "buffer" },
    { name: "Sodium Phosphate Monobasic (NaH2PO4) anhydrous", mw: 119.98, type: "buffer" },
    { name: "Sodium Phosphate Dibasic (Na2HPO4) anhydrous", mw: 141.96, type: "buffer" },
    { name: "Sodium Phosphate Dibasic (Na2HPO4) heptahydrate", mw: 268.07, type: "buffer" },
    { name: "Potassium Phosphate Monobasic (KH2PO4) anhydrous", mw: 136.09, type: "buffer" },
    { name: "Potassium Phosphate Dibasic (K2HPO4) anhydrous", mw: 174.18, type: "buffer" },

    // --- SALTS (Common Lab Salts) ---
    { name: "NaCl", mw: 58.44, type: "salt" },
    { name: "KCl", mw: 74.55, type: "salt" },
    { name: "LiCl", mw: 42.39, type: "salt" },
    { name: "MgCl2 (hexahydrate)", mw: 203.30, type: "salt" },
    { name: "MgCl2 (anhydrous)", mw: 95.21, type: "salt" },
    { name: "MgSO4 (heptahydrate)", mw: 246.47, type: "salt" },
    { name: "MgSO4 (anhydrous)", mw: 120.37, type: "salt" },
    { name: "CaCl2 (dihydrate)", mw: 147.02, type: "salt" },
    { name: "CaCl2 (anhydrous)", mw: 110.98, type: "salt" },
    { name: "MnCl2 (tetrahydrate)", mw: 197.91, type: "salt" },
    { name: "ZnCl2", mw: 136.29, type: "salt" },
    { name: "Zinc Acetate (dihydrate)", mw: 219.50, type: "salt" },
    { name: "Ammonium Sulfate", mw: 132.14, type: "salt" },
    { name: "Sodium Sulfate", mw: 142.04, type: "salt" },
    { name: "Potassium Sulfate", mw: 174.26, type: "salt" },
    { name: "Sodium Nitrate", mw: 84.99, type: "salt" },
    { name: "Potassium Nitrate", mw: 101.10, type: "salt" },
    { name: "Sodium Tartrate (dihydrate)", mw: 230.08, type: "salt" },
    { name: "Potassium Sodium Tartrate", mw: 282.22, type: "salt" },

    // --- DETERGENTS (Structural Bio / Membrane Proteins) ---
    { name: "SDS (Sodium Dodecyl Sulfate)", mw: 288.38, type: "detergent" },
    { name: "Triton X-100", mw: 647.00, type: "detergent" },
    { name: "Tween 20", mw: 1228.00, type: "detergent" },
    { name: "Tween 80", mw: 1310.00, type: "detergent" },
    { name: "DDM (n-Dodecyl-β-D-maltoside)", mw: 510.60, type: "detergent" },
    { name: "DM (n-Decyl-β-D-maltoside)", mw: 482.56, type: "detergent" },
    { name: "OG (n-Octyl-β-D-glucoside)", mw: 292.37, type: "detergent" },
    { name: "NG (n-Nonyl-β-D-glucoside)", mw: 306.40, type: "detergent" },
    { name: "LDAO", mw: 229.40, type: "detergent" },
    { name: "C12E8", mw: 538.80, type: "detergent" },
    { name: "CHAPS", mw: 614.88, type: "detergent" },
    { name: "CHAPSO", mw: 630.88, type: "detergent" },
    { name: "Digitonin", mw: 1229.30, type: "detergent" },
    { name: "LMNG (Lauryl Maltose Neopentyl Glycol)", mw: 1005.20, type: "detergent" },
    { name: "Sodium Cholate", mw: 430.55, type: "detergent" },
    { name: "Sodium Deoxycholate", mw: 414.55, type: "detergent" },
    { name: "Fos-Choline 12", mw: 351.50, type: "detergent" },
    { name: "Brij-35", mw: 1198.00, type: "detergent" },

    // --- REDUCING & OXIDIZING AGENTS ---
    { name: "DTT (Dithiothreitol)", mw: 154.25, type: "reducing agent" },
    { name: "DTE (Dithioerythritol)", mw: 154.25, type: "reducing agent" },
    { name: "TCEP-HCl", mw: 286.65, type: "reducing agent" },
    { name: "TCEP (Neutral)", mw: 250.19, type: "reducing agent" },
    { name: "B-ME (Beta-mercaptoethanol)", mw: 78.13, type: "reducing agent" },
    { name: "GSH (Glutathione, Reduced)", mw: 307.32, type: "reducing agent" },
    { name: "GSSG (Glutathione, Oxidized)", mw: 612.63, type: "oxidizing agent" },
    { name: "Ascorbic Acid", mw: 176.12, type: "reducing agent" },
    { name: "Sodium Ascorbate", mw: 198.11, type: "reducing agent" },

    // --- CHELATORS ---
    { name: "EDTA (disodium, dihydrate)", mw: 372.24, type: "chelator" },
    { name: "EDTA (tetrasodium, dihydrate)", mw: 416.20, type: "chelator" },
    { name: "EDTA (anhydrous)", mw: 292.24, type: "chelator" },
    { name: "EGTA", mw: 380.35, type: "chelator" },
    { name: "DTPA", mw: 393.35, type: "chelator" },

    // --- ANTIBIOTICS ---
    { name: "Ampicillin (Sodium salt)", mw: 371.39, type: "antibiotic" },
    { name: "Carbenicillin (Disodium)", mw: 422.36, type: "antibiotic" },
    { name: "Kanamycin Sulfate", mw: 582.58, type: "antibiotic" },
    { name: "Chloramphenicol", mw: 323.13, type: "antibiotic" },
    { name: "Tetracycline HCl", mw: 480.90, type: "antibiotic" },
    { name: "Streptomycin Sulfate", mw: 1457.40, type: "antibiotic" },
    { name: "Gentamicin Sulfate", mw: 575.60, type: "antibiotic" },
    { name: "Spectinomycin HCl", mw: 495.35, type: "antibiotic" },
    { name: "Rifampicin", mw: 822.94, type: "antibiotic" },
    { name: "Hygromycin B", mw: 527.50, type: "antibiotic" },
    { name: "G418 (Geneticin)", mw: 692.70, type: "antibiotic" },

    // --- NUCLEOTIDES & COFACTORS ---
    { name: "ATP (Disodium)", mw: 551.14, type: "nucleotide" },
    { name: "ADP (Disodium)", mw: 471.16, type: "nucleotide" },
    { name: "AMP (Disodium)", mw: 391.19, type: "nucleotide" },
    { name: "GTP (Disodium)", mw: 567.14, type: "nucleotide" },
    { name: "GDP (Disodium)", mw: 487.16, type: "nucleotide" },
    { name: "CTP (Disodium)", mw: 527.12, type: "nucleotide" },
    { name: "UTP (Trisodium)", mw: 550.09, type: "nucleotide" },
    { name: "NAD+", mw: 663.43, type: "cofactor" },
    { name: "NADH (Disodium)", mw: 709.40, type: "cofactor" },
    { name: "NADP+ (Disodium)", mw: 787.37, type: "cofactor" },
    { name: "NADPH (Tetrasodium)", mw: 833.35, type: "cofactor" },
    { name: "Coenzyme A (Lithium)", mw: 785.33, type: "cofactor" },
    { name: "Acetyl-CoA", mw: 809.57, type: "cofactor" },
    { name: "FAD (Disodium)", mw: 829.51, type: "cofactor" },
    { name: "FMN (Sodium)", mw: 478.33, type: "cofactor" },
    { name: "SAM (S-Adenosylmethionine)", mw: 398.44, type: "cofactor" },
    { name: "PLP (Pyridoxal 5'-phosphate)", mw: 247.14, type: "cofactor" },

    // --- ADDITIVES / CRYO-PROTECTANTS / STABILIZERS ---
    { name: "Glycerol", mw: 92.09, type: "additive" },
    { name: "Sucrose", mw: 342.30, type: "additive" },
    { name: "Glucose", mw: 180.16, type: "additive" },
    { name: "Trehalose (dihydrate)", mw: 378.33, type: "additive" },
    { name: "Mannitol", mw: 182.17, type: "additive" },
    { name: "Sorbitol", mw: 182.17, type: "additive" },
    { name: "Urea", mw: 60.06, type: "denaturant" },
    { name: "Guanidine HCl", mw: 95.53, type: "denaturant" },
    { name: "Guanidine Thiocyanate", mw: 118.16, type: "denaturant" },
    { name: "L-Arginine", mw: 174.20, type: "additive" },
    { name: "L-Glutamate", mw: 147.13, type: "additive" },
    { name: "Spermine", mw: 202.34, type: "additive" },
    { name: "Spermidine", mw: 145.25, type: "additive" },
    { name: "MPD (2-Methyl-2,4-pentanediol)", mw: 118.17, type: "precipitant" },
    { name: "Sodium Azide", mw: 65.01, type: "preservative" },

    // --- MOLECULAR BIOLOGY REAGENTS ---
    { name: "IPTG", mw: 238.31, type: "inducer" },
    { name: "X-Gal", mw: 408.63, type: "substrate" },
    { name: "X-Gluc", mw: 521.79, type: "substrate" },
    { name: "ONPG", mw: 301.25, type: "substrate" },
    { name: "PMSF", mw: 174.19, type: "inhibitor" },
    { name: "AEBSF HCl", mw: 239.69, type: "inhibitor" },
    { name: "Benzamidine HCl", mw: 156.61, type: "inhibitor" },
    { name: "Leupeptin", mw: 426.64, type: "inhibitor" },
    { name: "Pepstatin A", mw: 685.89, type: "inhibitor" },
    { name: "Bestatin", mw: 308.38, type: "inhibitor" },
    { name: "E-64", mw: 342.41, type: "inhibitor" },
    { name: "Agarose", mw: 306.12, type: "matrix" }, // Approx unit
    { name: "Acrylamide", mw: 71.08, type: "monomer" },
    { name: "Bis-acrylamide", mw: 154.17, type: "crosslinker" },
    { name: "Ammonium Persulfate (APS)", mw: 228.20, type: "catalyst" },
    { name: "TEMED", mw: 116.21, type: "catalyst" },

    // --- DYES & STAINS ---
    { name: "Bromophenol Blue", mw: 669.96, type: "dye" },
    { name: "Xylene Cyanol FF", mw: 538.61, type: "dye" },
    { name: "Coomassie G-250", mw: 854.02, type: "dye" },
    { name: "Coomassie R-250", mw: 825.97, type: "dye" },
    { name: "Ethidium Bromide", mw: 394.31, type: "dye" },
    { name: "Ponceau S", mw: 760.57, type: "dye" },
    { name: "Crystal Violet", mw: 407.98, type: "dye" },
    { name: "Methylene Blue", mw: 319.85, type: "dye" }
  ],

  // Monoisotopic masses (approximate) used for protein Calc
  aminoAcids: {
      'A': 71.03711, 'R': 156.10111, 'N': 114.04293, 'D': 115.02694, 'C': 103.00919,
      'Q': 128.05858, 'E': 129.04259, 'G': 57.02146, 'H': 137.05891, 'I': 113.08406,
      'L': 113.08406, 'K': 128.09496, 'M': 131.04049, 'F': 147.06841, 'P': 97.05276,
      'S': 87.03203, 'T': 101.04768, 'W': 186.07931, 'Y': 163.06333, 'V': 99.06841
  },

  // Average weights for Nucleic Acids (approx for concentration conversion)
  nucleic: {
      'dsDNA_bp': 650, // g/mol per base pair (Sodium salt)
      'ssDNA_nt': 330, // g/mol per nucleotide
      'ssRNA_nt': 340  // g/mol per nucleotide
  },

  // Common physical constants for lab calc
  constants: {
      'Avogadro': 6.022e23,
      'R_gas': 8.314,
      'g_force_const': 1.118e-5 // for RPM to RCF
  }
};
