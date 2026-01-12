window.PROTEIN_DEFS = {
  /* ===== Scientific constants ===== */
  AA: {
    mw: { A:71.0788,R:156.1875,N:114.1038,D:115.0886,C:103.1388,Q:128.1307,E:129.1155,G:57.0519,H:137.1411,I:113.1594,L:113.1594,K:128.1741,M:131.1926,F:147.1766,P:97.1167,S:87.0782,T:101.1051,W:186.2132,Y:163.1760,V:99.1326,U:150.0388,O:237.3018,B:114.5962,Z:128.6231,J:113.1594,X:110.0 },
    ext: { Y:1490, W:5500, CYS_DISULFIDE_PAIR:125 },
    kd: { A:1.8,R:-4.5,N:-3.5,D:-3.5,C:2.5,Q:-3.5,E:-3.5,G:-0.4,H:-3.2,I:4.5,L:3.8,K:-3.9,M:1.9,F:2.8,P:-1.6,S:-0.8,T:-0.7,W:-0.9,Y:-1.3,V:4.2,U:0.0,O:0.0,B:-3.5,Z:-3.5,J:3.8,X:0.0 },
    pKa_side: { C:8.5, D:3.9, E:4.07, H:6.5, K:10.4, R:12.5, Y:10.0 },
    pKa_term: { N:8.6, C:3.55 },
    // Atomic composition of RESIDUES (C, H, N, O, S). Add H2O for free AA.
    atoms: {
      A: {C:3,H:5,N:1,O:1,S:0}, R: {C:6,H:12,N:4,O:1,S:0}, N: {C:4,H:6,N:2,O:2,S:0},
      D: {C:4,H:5,N:1,O:3,S:0}, C: {C:3,H:5,N:1,O:1,S:1}, Q: {C:5,H:8,N:2,O:2,S:0},
      E: {C:5,H:7,N:1,O:3,S:0}, G: {C:2,H:3,N:1,O:1,S:0}, H: {C:6,H:7,N:3,O:1,S:0},
      I: {C:6,H:11,N:1,O:1,S:0}, L: {C:6,H:11,N:1,O:1,S:0}, K: {C:6,H:12,N:2,O:1,S:0},
      M: {C:5,H:9,N:1,O:1,S:1}, F: {C:9,H:9,N:1,O:1,S:0}, P: {C:5,H:7,N:1,O:1,S:0},
      S: {C:3,H:5,N:1,O:2,S:0}, T: {C:4,H:7,N:1,O:2,S:0}, W: {C:11,H:10,N:2,O:1,S:0},
      Y: {C:9,H:9,N:1,O:2,S:0}, V: {C:5,H:9,N:1,O:1,S:0},
      U: {C:3,H:5,N:1,O:1,Se:1}, // Selenocysteine
      O: {C:12,H:19,N:3,O:2,S:0} // Pyrrolysine
    }
  },

  /* DIWV unstable dipeptides (instability index) */
  DIWV: {A:{A:4,C:0,D:-2,E:-1,F:-3,G:0,H:-2,I:-1,K:-1,L:-2,M:-1,N:-2,P:-1,Q:-1,R:-1,S:1,T:0,V:0,W:-3,Y:-2},C:{A:0,C:9,D:-3,E:-4,F:-2,G:-3,H:-3,I:1,K:-3,L:-1,M:-1,N:-3,P:-3,Q:-3,R:-3,S:-1,T:-1,V:1,W:-2,Y:-2},D:{A:-2,C:-3,D:6,E:2,F:-3,G:-1,H:-1,I:-3,K:-1,L:-4,M:-3,N:1,P:-1,Q:0,R:-2,S:0,T:-1,V:-3,W:-4,Y:-3},E:{A:-1,C:-4,D:2,E:5,F:-3,G:-2,H:0,I:-3,K:1,L:-3,M:-2,N:0,P:-1,Q:2,R:0,S:0,T:-1,V:-2,W:-3,Y:-2},F:{A:-3,C:-2,D:-3,E:-3,F:6,G:-4,H:-1,I:0,K:-3,L:0,M:0,N:-3,P:-4,Q:-3,R:-3,S:-2,T:-2,V:-1,W:1,Y:3},G:{A:0,C:-3,D:-1,E:-2,F:-4,G:6,H:-2,I:-4,K:-2,L:-4,M:-3,N:0,P:-2,Q:-2,R:-2,S:0,T:-2,V:-3,W:-2,Y:-3},H:{A:-2,C:-3,D:-1,E:0,F:-1,G:-2,H:8,I:-3,K:-1,L:-3,M:-2,N:1,P:-2,Q:0,R:0,S:-1,T:-2,V:-3,W:-2,Y:2},I:{A:-1,C:1,D:-3,E:-3,F:0,G:-4,H:-3,I:4,K:-3,L:2,M:1,N:-3,P:-3,Q:-3,R:-3,S:-2,T:-1,V:3,W:-3,Y:-1},K:{A:-1,C:-3,D:-1,E:1,F:-3,G:-2,H:-1,I:-3,K:5,L:-2,M:-1,N:0,P:-1,Q:1,R:2,S:0,T:-1,V:-2,W:-3,Y:-2},L:{A:-2,C:-1,D:-4,E:-3,F:0,G:-4,H:-3,I:2,K:-2,L:4,M:2,N:-3,P:-3,Q:-2,R:-2,S:-2,T:-1,V:1,W:-2,Y:-1},M:{A:-1,C:-1,D:-3,E:-2,F:0,G:-3,H:-2,I:1,K:-1,L:2,M:5,N:-2,P:-2,Q:0,R:-1,S:-1,T:-1,V:1,W:-1,Y:-1},N:{A:-2,C:-3,D:1,E:0,F:-3,G:0,H:1,I:-3,K:0,L:-3,M:-2,N:6,P:-2,Q:0,R:0,S:1,T:0,V:-3,W:-4,Y:-2},P:{A:-1,C:-3,D:-1,E:-1,F:-4,G:-2,H:-2,I:-3,K:-1,L:-3,M:-2,N:-2,P:7,Q:-1,R:-2,S:-1,T:-1,V:-2,W:-4,Y:-3},Q:{A:-1,C:-3,D:0,E:2,F:-3,G:-2,H:0,I:-3,K:1,L:-2,M:0,N:0,P:-1,Q:5,R:1,S:0,T:-1,V:-2,W:-2,Y:-1},R:{A:-1,C:-3,D:-2,E:0,F:-3,G:-2,H:0,I:-3,K:2,L:-2,M:-1,N:0,P:-2,Q:1,R:5,S:-1,T:-1,V:-3,W:-3,Y:-2},S:{A:1,C:-1,D:0,E:0,F:-2,G:0,H:-1,I:-2,K:0,L:-2,M:-1,N:1,P:-1,Q:0,R:-1,S:4,T:1,V:-2,W:-3,Y:-2},T:{A:0,C:-1,D:-1,E:-1,F:-2,G:-2,H:-2,I:-1,K:-1,L:-1,M:-1,N:0,P:-1,Q:-1,R:-1,S:1,T:5,V:0,W:-2,Y:-2},V:{A:0,C:1,D:-3,E:-2,F:-1,G:-3,H:-3,I:3,K:-2,L:1,M:1,N:-3,P:-2,Q:-2,R:-3,S:-2,T:0,V:4,W:-3,Y:-1},W:{A:-3,C:-2,D:-4,E:-3,F:1,G:-2,H:-2,I:-3,K:-3,L:-2,M:-1,N:-4,P:-4,Q:-2,R:-3,S:-3,T:-2,V:-3,W:11,Y:2},Y:{A:-2,C:-2,D:-3,E:-2,F:3,G:-3,H:2,I:-1,K:-2,L:-1,M:-1,N:-2,P:-3,Q:-1,R:-2,S:-2,T:-2,V:-1,W:2,Y:7} },

  /* N-end rule half-life (Varshavsky et al.) */
  HALF_LIFE: {
    mammal: { A: "4.4 h", C: "1.2 h", D: "1.1 h", E: "1 h", F: "1.1 h", G: "30 h", H: "3.5 h", I: "20 h", K: "1.3 h", L: "5.5 h", M: "30 h", N: "1.4 h", P: ">20 h", Q: "0.8 h", R: "1 h", S: "1.9 h", T: "7.2 h", V: "100 h", W: "2.8 h", Y: "2.8 h" },
    yeast: { A: ">20 h", C: ">20 h", D: "3 min", E: "30 min", F: "3 min", G: ">20 h", H: "10 min", I: "30 min", K: "3 min", L: "3 min", M: ">20 h", N: "3 min", P: ">20 h", Q: "10 min", R: "2 min", S: ">20 h", T: ">20 h", V: ">20 h", W: "3 min", Y: "10 min" },
    ecoli: { A: ">10 h", C: ">10 h", D: ">10 h", E: ">10 h", F: "2 min", G: ">10 h", H: ">10 h", I: ">10 h", K: "2 min", L: "2 min", M: ">10 h", N: ">10 h", P: "?", Q: ">10 h", R: "2 min", S: ">10 h", T: ">10 h", V: ">10 h", W: "2 min", Y: "2 min" }
  },

  /* Chou-Fasman Propensities (scaled by 100) */
  CHOU_FASMAN: {
    A: {H: 142, E: 83}, R: {H: 98, E: 93}, N: {H: 67, E: 89}, D: {H: 101, E: 54},
    C: {H: 70, E: 119}, Q: {H: 111, E: 110}, E: {H: 151, E: 37}, G: {H: 57, E: 75},
    H: {H: 100, E: 87}, I: {H: 108, E: 160}, L: {H: 121, E: 130}, K: {H: 114, E: 74},
    M: {H: 145, E: 105}, F: {H: 113, E: 138}, P: {H: 57, E: 55}, S: {H: 77, E: 75},
    T: {H: 83, E: 119}, W: {H: 108, E: 137}, Y: {H: 69, E: 147}, V: {H: 106, E: 170}
  },

  /* Common Proteases for in silico digestion */
  PROTEASES: [
    { name: "Trypsin",    cut: "After K/R", noCut: "Before P", regex: /([KR])(?=[^P])/g, desc: "Cuts at carboxyl side of lysine and arginine residues, except when followed by proline." },
    { name: "Trypsin/P",  cut: "After K/R", noCut: "None",     regex: /([KR])/g,         desc: "Trypsin cutting even before Proline." },
    { name: "Chymotrypsin", cut: "After F/Y/W", noCut: "Before P", regex: /([FYW])(?=[^P])/g, desc: "Cuts at carboxyl side of tyrosine, tryptophan, and phenylalanine." },
    { name: "LysC",       cut: "After K",   noCut: "Before P", regex: /(K)(?=[^P])/g,    desc: "Cuts at carboxyl side of lysine." },
    { name: "AspN",       cut: "Before D",  noCut: "None",     regex: /(?=[D])/g,        desc: "Cuts at amino side of aspartic acid." },
    { name: "GluC",       cut: "After E",   noCut: "Before P", regex: /(E)(?=[^P])/g,    desc: "Cuts at carboxyl side of glutamic acid." },
    { name: "ArgC",       cut: "After R",   noCut: "Before P", regex: /(R)(?=[^P])/g,    desc: "Cuts at carboxyl side of arginine." },
    { name: "Proteinase K", cut: "After A/F/I/L/V/W/Y", noCut: "", regex: /([AFILVWY])/g, desc: "Broad specificity, cuts aliphatic/aromatic." },
    { name: "CNBr",       cut: "After M",   noCut: "None",     regex: /(M)/g,            desc: "Cyanogen bromide cuts after Methionine." }
  ],

  /* Combined Tags & Motifs */
  TAGS: {
    /* ===== Small Purification & Detection Tags ===== */
    "His-Tag (6x)":         { seqs:["HHHHHH"],                                  color:"#14b8a6", category:"Tags & Sites", note:"Purification via Immobilized Metal Affinity Chromatography (IMAC)." },
    "His-Tag (8x–10x)":     { seqs:["HHHHHHHH","HHHHHHHHH","HHHHHHHHHH"],        color:"#0ea5e9", category:"Tags & Sites", note:"Longer His-tags for stronger binding to IMAC resins." },
    "FLAG":                 { seqs:["DYKDDDDK"],                                color:"#6366f1", category:"Tags & Sites", note:"Hydrophilic; contains Enterokinase cleavage site." },
    "3xFLAG":               { seqs:["DYKDHDGDYKDHDIDYKDDDDK"],                  color:"#7c3aed", category:"Tags & Sites", note:"Tandem tag for higher affinity detection and purification." },
    "HA":                   { seqs:["YPYDVPDYA"],                               color:"#f59e0b", category:"Tags & Sites", note:"From Influenza Hemagglutinin; widely used for detection." },
    "3xHA":                 { seqs:["YPYDVPDYAGYPYDVPDYAGYPYDVPDYA"],             color:"#fb923c", category:"Tags & Sites", note:"Tandem tag for higher affinity detection." },
    "Myc":                  { seqs:["EQKLISEEDL"],                              color:"#ec4899", category:"Tags & Sites", note:"From human c-Myc. WARNING: Antibody binding (e.g., 9E10 clone) can be context-dependent." },
    "V5":                   { seqs:["GKPIPNPLLGLDST"],                          color:"#22d3ee", category:"Tags & Sites", note:"From P and V proteins of Simian Virus 5." },
    "T7":                   { seqs:["MASMTGGQQMG"],                             color:"#06b6d4", category:"Tags & Sites", note:"Leader sequence from T7 bacteriophage major capsid protein." },
    "S-tag":                { seqs:["KETAAAKFERQHMDS"],                         color:"#8b5cf6", category:"Tags & Sites", note:"Binds to S-protein (derived from RNase A)." },
    "Strep-II":             { seqs:["WSHPQFEK"],                                color:"#06b6d4", category:"Tags & Sites", note:"Binds with high affinity to Strep-Tactin resin." },
    "Twin-Strep":           { seqs:["WSHPQFEKGGGSGGGSGGSAWSHPQFEK"],            color:"#0891b2", category:"Tags & Sites", note:"Tandem tag for enhanced binding to Strep-Tactin." },
    "ALFA-tag":             { seqs:["SRLEEELRRRLTE"],                           color:"#ef4444", category:"Tags & Sites", note:"Small, stable alpha-helical tag for capture and detection." },
    "AviTag":               { seqs:["GLNDIFEAQKIEWHE"],                         color:"#3b82f6", category:"Tags & Sites", note:"Site for specific in vivo or in vitro biotinylation by BirA ligase." },
    "SBP-tag":              { seqs:["MDEKTTGWRGGHVVEGLAGELEQLRARLEHHPQGQREP"],  color:"#2563eb", category:"Tags & Sites", note:"Streptavidin-Binding Peptide for affinity purification." },
    "Calmodulin-Binding":   { seqs:["KRRWKKNFIAVSAANRFKKISSSGAL"],              color:"#16a34a", category:"Tags & Sites", note:"Ca2+-dependent binding to Calmodulin resin; allows for gentle elution with EGTA." },
    "Rho1D4":               { seqs:["TETSQVAPA"],                               color:"#059669", category:"Tags & Sites", note:"C-terminal tag for membrane protein purification." },
    "VSV-G":                { seqs:["YTDIEMNRLGK"],                             color:"#0ea5e9", category:"Tags & Sites", note:"Epitope from Vesicular Stomatitis Virus Glycoprotein." },
    "SpyTag":               { seqs:["AHIVMVDAYKPTK"],                           color:"#f472b6", category:"Tags & Sites", note:"Forms a spontaneous, covalent isopeptide bond with its SpyCatcher protein partner." },
    "SnoopTag":             { seqs:["KLGDIEFIKVNK"],                            color:"#a78bfa", category:"Tags & Sites", note:"Forms a covalent bond with its SnoopCatcher partner; orthogonal to SpyTag." },
    "Spot-Tag":             { seqs:["PDRVRAVSHWSS"],                            color:"#10b981", category:"Tags & Sites", note:"Binds Spot-Nanobody with high affinity for detection and IP." },
    "HiBiT":                { seqs:["VSGWRLFKKIS"],                             color:"#14b8a6", category:"Tags & Sites", note:"Luminescent tag; reconstitutes NanoLuciferase with the LgBiT protein fragment." },
    "TEV site":             { seqs:["ENLYFQG","ENLYFQS"],                       color:"#64748b", category:"Tags & Sites", note:"Tobacco Etch Virus protease site. Cleavage between Q and G/S." },
    "Thrombin site":        { seqs:["LVPRGS"],                                  color:"#78716c", category:"Tags & Sites", note:"Common recognition site; cleaves after R. Can have off-target effects." },
    "HRV 3C / PreScission": { seqs:["LEVLFQGP"],                                color:"#71717a", category:"Tags & Sites", note:"Human Rhinovirus 3C protease. Cleavage between Q and G." },
    "Factor Xa site":       { seqs:["IEGR", "IDGR"],                            color:"#854d0e", category:"Tags & Sites", note:"Cleavage after R. Can have off-target effects." },
    "Enterokinase site":    { seqs:["DDDDK"],                                   color:"#6366f1", category:"Tags & Sites", note:"Highly specific; cleaves after K." },
    "RGD motif":            { seqs:["RGD"],                                     color:"#34d399", category:"Site",       note:"Integrin-binding motif involved in cell adhesion." }
  },

  LARGE_TAGS: {
    "GST (S. japonicum)": {
      seq: "MSPILGYWKIKGLVQPTRLLLEYLEEKYEEHLYERDEGDKWRNKKFELGLEFPNLPYYIDGDVKLTQSMAIIRYIADKHNMLGGCPKERAEISMLEGAVLDIRYGVSRIAYSKDFETLKVDFLSKLPEMLKMFEDRLCHKTYLNGDHVTHPDFMLYDALDVVLYMDPMCLDAFPKLVCFKKRIEAIPQIDKYLKSSKYIAWPLQGWQATFGGGDHPPKSD",
      color: "#a16207", category: "Tags & Sites", note: "Glutathione S-Transferase (~26 kDa). Enhances solubility and allows for affinity purification on glutathione resin."
    },
    "MBP (E. coli)": {
      seq: "MKIEEGKLVIWINGDKGYNGLAEVGKKFEKDTGIKVTVEHPDKLEEKFPQVAATGDGPDIIFWAHDRFGGYAQSGLLAEITPDKAFQDKLYPFTWDAVRYNGKLIAYPIAVEALSLIYNKDLLPNPPKTWEEIPALDKEIKAKGKSALMFNLQEPYFTWPLIAADGGYAFKYENGKYDIKDVGVDNAGAKAGLTFLVDLIKNKHMNADTDYSIAEAAFNKGETAMTINGPWAWSNIDTSKVNYGVTVLPTFKGQPSKPFVGVLSAGINAASPNKELAKEFLENYLLTDEGLEAVNKDKPLGAVALKSYEEELAKDPRIAATMENAQKGEIMPNIPQMSAFWYAVRTAVINAASGRQTVDEALKDAQTRITK",
      color: "#4d7c0f", category: "Tags & Sites", note: "Maltose-Binding Protein (~42 kDa). One of the most effective solubility-enhancing tags; allows purification on amylose resin."
    },
    "MBP (general)": {
      seq: "KIEEGKLVIWINGDKGYNGLAEVGKKFEKDTGIKVTVEHPDKLEEKFPQVAATGDGPDIIFWAHDRFGGYAQSGLLAEITPDKAFQDKLYPFTWDAVRYNGKLIAYPIAVEALSLIYNKDLLPNPPKTWEEIPALDKELKAKGKSALMFNLQEPYFTWPLIAADGGYAFKYENGKYDIKDVGVDNAGAKAGLTFLVDLIKNKHMNADTDYSIAEAAFNKGETAMTINGPWAWSNIDTSKVNYGVTVLPTFKGQPSKPFVGVLSAGINAASPNKELAKEFLENYLLTDEGLEAVNKDKPLGAVALKSYEEELAKDPRIAATMENAQKGEIMPNIPQMSAFWYAVRTAVINAASGRQTVDEAPKDAQT",
      color: "#4d7c0f", category: "Tags & Sites", note: "Maltose-Binding Protein (~59 kDa). Generalized version for solubility enhancement; allows purification on amylose resin."
    },
    "Thioredoxin (E. coli)": {
      seq: "SDKIIHLTDDSFDTDVLKADGAILVDFWAEWCGPCKMIAPILDEIADEYQGKLTVAKLNIDQNPGTAPKYGIRGIPTLLLFKNGEVAATKVGALSKGQLKEFLDANLA",
      color: "#15803d", category: "Tags & Sites", note: "Thioredoxin 1 (~12 kDa). Enhances solubility and can aid in correct disulfide bond formation in the cytoplasm."
    },
    "SUMO (S. cerevisiae)": {
      seq: "MSDSEVNQEAKPEVKPEVKPETHINLKVSDGSSEIFFKIKKTTPLRRLMEAFAKRQGKEMDSLRFLYDGIRIQADQTPEDLDMEDNDIIEAHREQIGG",
      color: "#7e22ce", category: "Tags & Sites", note: "Smt3 protein (~11 kDa). Enhances solubility. Cleavage by a SUMO-specific protease (e.g., Ulp1) yields a native N-terminus."
    },
    "EGFP": {
      seq: "MVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK",
      color: "#4ade80", category: "Tags & Sites", note: "Enhanced Green Fluorescent Protein (~27 kDa). Intrinsically fluorescent reporter for live-cell imaging."
    },
    "mCherry": {
      seq: "MVSKGEEDNMAIIKEFMRFKVHMEGSVNGHEFEIEGEGEGRPYEGTQTAKLKVTKGGPLPFAWDILSPQFMYGSKAYVKHPADIPDYLKLSFPEGFKWERVMNFEDGGVVTVTQDSSLQDGEFIYKVKLRGTNFPSDGPVMQKKTMGWEASSERMYPEDGALKGEIKMRLKLKDGGHYDAEVKTTYMAKKPVQLPGAYKTDIKLDITSHNEDYTIVEQYERAEGRHSTGGMDELYK",
      color: "#f43f5e", category: "Tags & Sites", note: "Monomeric Red Fluorescent Protein (~27 kDa). Intrinsically fluorescent reporter for multicolor imaging."
    }
  },

  MOTIFS: [
  /* ===== Post-Translational Modifications (PTMs) ===== */
  { name:"N-glycosylation (N-X-[ST])",   category:"PTM", color:"#f97316",
    note:"N-linked glycosylation consensus (X cannot be Proline).", regex:/N[^P][ST]/g },
  { name:"C-mannosylation (W-x-x-W)",    category:"PTM", color:"#fb923c",
    note:"Tryptophan C-mannosylation motif.",                    regex:/W..W/g },
  { name:"Tyrosine sulfation ([DE]Y)",   category:"PTM", color:"#f59e0b",
    note:"Acidic residue before Tyr; common heuristic.",         regex:/[DE]Y/g },
  { name:"SUMOylation (ψ-K-x-[DE])",     category:"PTM", color:"#84cc16",
    note:"Hydrophobic ψ (V/I/L/M/F/Y/W/C) before Lys; acidic at +2.", regex:/[VILMFYWC]K.[DE]/g },
  { name:"Lysine Acetylation (K)",       category:"PTM", color:"#a3e635",
    note:"Heuristic for Lys acetylation. HIGH FALSE-POSITIVE RATE. Use dedicated predictors for validation.", regex:/K/g },
  { name:"Arg Methylation (GAR motif)",  category:"PTM", color:"#4ade80",
    note:"Glycine-Arginine Rich motif heuristic for PRMTs. HIGH FALSE-POSITIVE RATE.", regex:/G.{0,3}R.{0,3}G/g },
  { name:"CK2 phosphorylation",          category:"PTM", color:"#22c55e",
    note:"Casein Kinase 2 site: (S/T)x(D/E).",                   regex:/[ST]..[DE]/g },
  { name:"PKA phosphorylation",          category:"PTM", color:"#f59e0b",
    note:"Protein Kinase A site: (R/K)(R/K)x(S/T), no Pro at +1.", regex:/(?:R|K){2}.[ST](?!P)/g },
  { name:"PKC phosphorylation",          category:"PTM", color:"#f43f5e",
    note:"Protein Kinase C site: (S/T)x(R/K).",                  regex:/[ST].[RK]/g },
  { name:"Akt/PKB phosphorylation",      category:"PTM", color:"#10b981",
    note:"Akt/PKB site: RxRxx(S/T).",                            regex:/R.R..[ST]/g },
  { name:"CDK phosphorylation",          category:"PTM", color:"#0ea5e9",
    note:"Cyclin-Dependent Kinase site: (S/T)P x (K/R).",        regex:/[ST]P.[KR]/g },
  { name:"MAPK phosphorylation",         category:"PTM", color:"#ef4444",
    note:"Mitogen-Activated Protein Kinase site: Px(S/T)P.",     regex:/P.[ST]P/g },
  { name:"ATM/ATR phosphorylation",      category:"PTM", color:"#fbbf24",
    note:"DNA damage response kinase site: (S/T)Q.",            regex:/[ST]Q/g },
  { name:"N-myristoylation (N-term)",    category:"PTM", color:"#65a30d",
    note:"Gly at pos 2 required; simple heuristic.",            regex:/^M?G(?![EDRKHP])[A-Z]{3}[STAGCNV]/g },
  { name:"Prenylation (CaaX, C-term)",   category:"PTM", color:"#16a34a",
    note:"Cys + two aliphatic + [LIVM] at C-terminus.",          regex:/C[AILVFM][A-Z][LIVM]$/g },
  { name:"C-term Amidation (G-R/K-R/K)", category:"PTM", color:"#0d9488",
    note:"PROSITE PS00009. Signal for C-terminal amidation of peptide hormones after cleavage.", regex:/G[RK][RK]$/g },

  /* ===== Protease & Enzyme Sites (Regex-based) ===== */
  { name:"Furin Cleavage (R-x-K/R-R)",   category:"Tags & Sites", color:"#a16207",
    note:"Proprotein convertase site for maturation in secretory pathway.", regex:/R.[KR]R/g },
  { name:"Caspase-3 Cleavage (DEVD)",    category:"Tags & Sites", color:"#991b1b",
    note:"Apoptotic executioner caspase site.",                  regex:/DEVD/g },
  { name:"Caspase-8 Cleavage ([IL]ETD)", category:"Tags & Sites", color:"#b91c1c",
    note:"Apoptotic initiator caspase site.",                    regex:/[IL]ETD/g },
  { name:"Sortase A (LPXTG)",            category:"Tags & Sites", color:"#0ea5e9",
    note:"Transpeptidation signal in Gram-positive bacteria.",   regex:/LP[A-Z]TG/g },
  { name:"Tetracysteine Tag",            category:"Tags & Sites", color:"#fb7185",
    note:"Binds biarsenical dyes (FlAsH/ReAsH). Minimal motif is CCxxCC.", regex:/CC[A-Z]{2}CC/g },

  /* ===== Localization Signals ===== */
  { name:"Signal Peptide (N-term)",      category:"Localization", color:"#67e8f9",
    note:"Heuristic for secretory signal peptide. HIGHLY VARIABLE. Use SignalP for validation.", regex:/^M[A-Z]{0,20}[KR][A-Z]{2,8}[LIFVAGMW]{8,15}/g },
  { name:"Transmembrane Domain",         category:"Localization", color:"#22d3ee",
    note:"Heuristic for hydrophobic transmembrane helix. HIGH FALSE-POSITIVE RATE. Use TMHMM for validation.", regex:/[LIFVAGMW]{18,25}/g },
  { name:"Monopartite NLS",              category:"Localization", color:"#a855f7",
    note:"Classical nuclear localization signal, K(K/R)x(K/R).", regex:/K[KR][A-Z][KR]/g },
  { name:"Bipartite NLS",                category:"Localization", color:"#8b5cf6",
    note:"Two basic clusters separated by ~10aa spacer.",        regex:/[KR]{2}.{10,12}[KR]{3,}/g },
  { name:"NES (Leu-rich, heuristic)",    category:"Localization", color:"#ec4899",
    note:"Φ-x(2,3)-Φ-x(2,3)-Φ-x-Φ; Φ=LIVFM.",                   regex:/[LIVFM][A-Z]{2,3}[LIVFM][A-Z]{2,3}[LIVFM][A-Z][LIVFM]/g },
  { name:"PTS1 (peroxisome, C-term)",    category:"Localization", color:"#22d3ee",
    note:"C-terminal [SAC][KRH][LM].",                          regex:/[SAC][RKH][LM]$/g },
  { name:"PTS2 (peroxisome, N-term)",    category:"Localization", color:"#06b6d4",
    note:"Within first ~40 aa: [RK][LVI].{5}[HQ][LA].",         regex:/(?=^.{0,40})[RK][LVI][A-Z]{5}[HQ][LA]/g },
  { name:"ER retention (KDEL/HDEL)",     category:"Localization", color:"#10b981",
    note:"Luminal ER retrieval signal (C-terminus).",            regex:/(KDEL|HDEL)$/g },
  { name:"ER retrieval (KKXX, C-term)",  category:"Localization", color:"#059669",
    note:"Cytosolic KKxx at extreme C-terminus.",                regex:/KK[A-Z]{2}$/g },

  /* ===== Domains & Binding / Degrons ===== */
  { name:"Walker A (P-loop)",            category:"Domain", color:"#a78bfa",
    note:"ATP/GTP binding motif: GxxxxGKS/T.",                 regex:/G[A-Z]{4}GK[ST]/g },
  { name:"Zn finger C2H2",               category:"Domain", color:"#7c3aed",
    note:"Classical Cys2-His2 zinc finger.",                   regex:/C.{2,4}C.{12}H.{3,5}H/g },
  { name:"Coiled-Coil Heptad Repeat",    category:"Domain", color:"#94a3b8",
    note:"Heuristic for coiled-coil structure: [h]xxxxx[h]xxxxx[h]. h=hydrophobic.", regex:/[LIVMF][A-Z]{6}[LIVMF][A-Z]{6}[LIVMF]/g },
  { name:"SH3-binding (Class I)",        category:"Domain", color:"#60a5fa",
    note:"Proline-rich motif: RxxPxxP.",                       regex:/R..P..P/g },
  { name:"WW-binding (PPxY)",            category:"Domain", color:"#38bdf8",
    note:"PPxY motif.",                                         regex:/PP.Y/g },
  { name:"PDZ-binding (Class I, C-term)",category:"Domain", color:"#14b8a6",
    note:"(S/T)xV at C-terminus.",                              regex:/[ST][A-Z]V$/g },
  { name:"KEN box (APC/C degron)",       category:"Degron", color:"#ef4444",
    note:"Degradation signal for APC/C E3 ligase.",            regex:/KEN.{0,3}N/g },
  { name:"D-box (RxxL)",                 category:"Degron", color:"#f87171",
    note:"Destruction box for APC/C E3 ligase.",               regex:/R..L..[ILV]/g }
  ]
};

/* ===== SHARED PROTEIN UTILITIES ===== */
window.PROTEIN_UTILS = {
  countAA: function(seq) {
    const c = Object.create(null);
    if (!seq) return c;
    for (const ch of seq) c[ch] = (c[ch] || 0) + 1;
    return c;
  },

  molecularWeight: function(counts) {
    let m = 18.01528; // Water mass for N-term H and C-term OH (H2O)
    const AA_MW = window.PROTEIN_DEFS.AA.mw;
    for (const a in counts) {
      m += (counts[a] || 0) * (AA_MW[a] || 0);
    }
    return m;
  },

  // Calculate Extinction Coefficients (Reduced and Oxidized)
  // Returns: { reduced, cystines }
  extinctionCoefficients: function(counts, mw) {
    const AA_EXT = window.PROTEIN_DEFS.AA.ext;
    const nY = counts.Y || 0;
    const nW = counts.W || 0;
    const nC = counts.C || 0;

    // Reduced: No Disulfides
    const reduced = (nY * AA_EXT.Y) + (nW * AA_EXT.W);

    // Oxidized: All pairs form disulfides
    // Each bond adds ~125 M-1 cm-1 (actually ranges, but 60-125 is common per bond).
    // Some sources say +60 per bond. Edelhoch method usually just counts W and Y.
    // Expasy ProtParam uses: Ext(Cystine) = 125.
    // Note: It's 125 per bond.
    const nCystine = Math.floor(nC / 2);
    const cystines = reduced + (nCystine * AA_EXT.CYS_DISULFIDE_PAIR);

    return { reduced, cystines };
  },

  // Unified Protein Parameter Calculation
  getProteinParams: function(seq) {
      if(!seq) return { mw: 0, epsRed: 0, epsOx: 0, counts: {} };
      const s = seq.toUpperCase().replace(/[^A-Z]/g, '');
      const counts = this.countAA(s);
      const mw = this.molecularWeight(counts);
      const ext = this.extinctionCoefficients(counts, mw);

      return {
          mw: mw / 1000, // kDa
          mwDa: mw,
          epsRed: ext.reduced,
          epsOx: ext.cystines,
          counts: counts,
          length: s.length
      };
  },

  parseFastaFlexible: function(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const out = [];
    let header = null, seq = [];
    let sawHeader = false;

    for (const raw of lines) {
      const l = raw.trim();
      if (!l) continue;
      if (l.startsWith(';')) continue; // Comment
      if (l.startsWith('>')) {
        if (header !== null) out.push({ header, seq: seq.join('') });
        const after = l.slice(1).trim();
        // Heuristic: check if header line ends with sequence
        const tailAA = after.match(/([ACDEFGHIKLMNPQRSTVWYUBZOJX]+)\s*$/);
        if (tailAA && tailAA[1].length >= 5) {
           // It might be "Header SEQUENCE" on one line? Rare but possible.
           // Usually FASTA is >Header\nSEQUENCE
           // Let's assume standard behavior primarily.
           header = after;
           seq = [];
        } else {
           header = after || `Sequence ${out.length + 1}`;
           seq = [];
        }
        sawHeader = true;
      } else {
        seq.push(l);
      }
    }
    if (header !== null) out.push({ header, seq: seq.join('') });

    // If no header found, treat whole text as one sequence if it looks like AA
    if (!sawHeader) {
        const joined = lines.join('').replace(/\s/g,'');
        if (/[A-Z]/.test(joined)) {
            out.push({ header: 'Sequence 1', seq: joined });
        }
    }
    return out;
  },

  sanitizeSequenceWithLog: function(raw) {
    const upper = raw.toUpperCase();
    const removed = { whitespace: 0, digits: 0, dashes: 0, stars: 0, punctuation: 0, other: 0 };
    const keepRe = /[ACDEFGHIKLMNPQRSTVWYUBZOJX]/;
    let cleanedArr = [];

    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i];
      if (keepRe.test(ch)) { cleanedArr.push(ch); continue; }
      if (/\s/.test(ch)) { removed.whitespace++; continue; }
      if (/[0-9]/.test(ch)) { removed.digits++; continue; }
      if (/[-–—_]/.test(ch)) { removed.dashes++; continue; }
      if (ch === '*') { removed.stars++; continue; }
      if (/[.,:;\/|()\[\]{}'"+=<>?~`!@#$%^&]/.test(ch)) { removed.punctuation++; continue; }
      removed.other++;
    }

    const seq = cleanedArr.join('');
    // Note: Do not throw error here, return empty if must.
    const notes = [];
    if (removed.digits) notes.push(`digits ${removed.digits}`);
    if (removed.stars) notes.push(`stars ${removed.stars}`);

    return {
        seq,
        issues: removed.other ? `Invalid letters removed: ${removed.other}` : '',
        notes: notes.join(', '),
        removed
    };
  }
};
