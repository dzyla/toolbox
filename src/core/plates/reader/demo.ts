import { type PlateFormat, ROW_LABELS_384 } from './types';

/* ========================================================================= */
/* 6. Built-In Demo Datasets                                                 */
/* ========================================================================= */

export const DEMO_96_TECAN_DOSE_RESPONSE = {
  name: '96-Well Dose-Response Assay (Tecan i-control)',
  description: '8-point cytotoxicity dilution series (100 µM to 0.03 µM) in sextuplicate, with vehicle, positive lysis control, blanks, and one outlier well.',
  format: 96 as PlateFormat,
  rawText: `Plate	Cytotoxicity Assay 01
Instrument	Tecan Infinite M200 Pro
Date	2026-09-02
Time	11:45:10
Measurement	Absorbance 450 nm

<>	1	2	3	4	5	6	7	8	9	10	11	12
A	0.046	0.045	0.044	0.045	0.047	0.046	0.045	0.044	0.045	0.046	0.045	0.044
B	0.125	0.185	0.345	0.612	1.050	1.580	1.890	2.120	2.150	0.120	0.046	0.045
C	0.128	0.182	0.340	0.608	1.045	1.575	1.895	2.115	2.140	0.122	0.044	0.045
D	0.122	0.189	0.348	1.250	1.055	1.585	1.885	2.125	2.155	0.119	0.045	0.046
E	0.126	0.184	0.342	0.615	1.048	1.570	1.892	2.110	2.145	0.124	0.047	0.044
F	0.124	0.186	0.346	0.610	1.052	1.582	1.888	2.122	2.152	0.121	0.045	0.043
G	0.127	0.183	0.344	0.614	1.051	1.578	1.891	2.118	2.148	0.123	0.046	0.045
H	0.045	0.044	0.046	0.045	0.045	0.047	0.044	0.046	0.045	0.044	0.045	0.045
`,
};

export function generate384HtsDemo(): { name: string; description: string; format: PlateFormat; rawText: string } {
  const lines: string[] = [
    'Software Version\t3.11.19',
    'Date\t9/2/2026',
    'Time\t15:30:00',
    'Plate\tHTS_Kinase_Screen_01',
    'Read\tFluorescence 485/535 nm',
    '',
    '\t' + Array.from({ length: 24 }, (_, i) => i + 1).join('\t'),
  ];

  for (let r = 0; r < 16; r++) {
    const rowChar = ROW_LABELS_384[r]!;
    const rowVals: string[] = [rowChar];

    for (let c = 1; c <= 24; c++) {
      if (c <= 2) {
        const v = 2500 + Math.sin(r * 3 + c * 5) * 90 + Math.cos(r * 7) * 40;
        rowVals.push(v.toFixed(1));
      } else if (c >= 23) {
        const v = 260 + Math.sin(r * 2 + c) * 20 + Math.cos(c * 4) * 10;
        rowVals.push(v.toFixed(1));
      } else {
        let v = 320 + Math.sin(r * 4 + c * 2) * 60 + Math.cos(r + c * 3) * 50;
        if ((r === 4 && c === 8) || (r === 11 && c === 18)) {
          v = 2200;
        } else if (r === 7 && c === 14) {
          v = 1850;
        }
        rowVals.push(v.toFixed(1));
      }
    }
    lines.push(rowVals.join('\t'));
  }

  return {
    name: '384-Well High-Throughput Screen (BioTek Gen5)',
    description: '16x24 HTS kinase inhibitor screen with 32 positive and 32 negative controls, exhibiting Z\' > 0.75 (high-quality screening window) and active compound hits.',
    format: 384,
    rawText: lines.join('\n'),
  };
}

export const DEMO_384_BIOTEK_HTS = generate384HtsDemo();

export const DEMO_96_LIST_EXPORT = {
  name: '96-Well 3-Column List Format',
  description: 'Three-column tabular export (Well, Sample Name, Raw Value) common in automated liquid handlers, SoftMax Pro, and LIMS databases.',
  format: 96 as PlateFormat,
  rawText: `Well,Sample,Absorbance
A01,Blank,0.045
A02,Blank,0.046
A03,Blank,0.044
B01,Vehicle Control,0.118
B02,Vehicle Control,0.124
B03,Vehicle Control,0.120
C01,Staurosporine 0.01 uM,0.185
C02,Staurosporine 0.01 uM,0.182
C03,Staurosporine 0.01 uM,0.188
D01,Staurosporine 0.1 uM,0.612
D02,Staurosporine 0.1 uM,0.608
D03,Staurosporine 0.1 uM,0.615
E01,Staurosporine 1.0 uM,1.580
E02,Staurosporine 1.0 uM,1.575
E03,Staurosporine 1.0 uM,1.585
F01,Staurosporine 10 uM,2.120
F02,Staurosporine 10 uM,2.115
F03,Staurosporine 10 uM,2.125
G01,Positive Control 100%,2.150
G02,Positive Control 100%,2.140
G03,Positive Control 100%,2.155
`,
};

export const DEMO_96_ELISA_STANDARD = {
  name: '96-Well ELISA Standard Curve & Serum Quantification (BioTek)',
  description: 'Human IL-6 Sandwich ELISA with 8-point standard curve in duplicate (0 to 1000 pg/mL, OD450) and unknown patient serum samples (1:10 dilution).',
  format: 96 as PlateFormat,
  rawText: `Experiment\tHuman IL-6 ELISA
Date\t2026-09-04
Instrument\tBioTek Synergy H1
Read\tAbsorbance 450 nm

	1	2	3	4	5	6	7	8	9	10	11	12
A	2.482	2.510	0.845	0.852	0.412	0.420	1.250	1.265	0.185	0.190	0.550	0.045
B	1.312	1.289	0.838	0.849	0.415	0.418	1.242	1.258	0.182	0.188	0.542	0.044
C	0.685	0.672	0.295	0.301	0.985	0.992	0.155	0.160	0.742	0.755	0.880	0.046
D	0.358	0.364	0.298	0.305	0.978	0.988	0.152	0.158	0.738	0.749	0.875	0.045
E	0.198	0.205	1.620	1.645	0.220	0.228	0.612	0.620	0.335	0.342	1.105	0.044
F	0.118	0.124	1.615	1.638	0.218	0.225	0.608	0.615	0.332	0.338	1.098	0.046
G	0.082	0.085	0.450	0.458	0.710	0.722	1.850	1.865	0.125	0.130	0.265	0.045
H	0.045	0.046	0.448	0.452	0.705	0.718	1.842	1.858	0.122	0.128	0.260	0.045
`,
  layoutCsv: `Row,1,2,3,4,5,6,7,8,9,10,11,12
A,Std 1000 pg/mL,Std 1000 pg/mL,Serum 1,Serum 1,Serum 5,Serum 5,Serum 9,Serum 9,Serum 13,Serum 13,Serum 15,Blank
B,Std 500 pg/mL,Std 500 pg/mL,Serum 1,Serum 1,Serum 5,Serum 5,Serum 9,Serum 9,Serum 13,Serum 13,Serum 15,Blank
C,Std 250 pg/mL,Std 250 pg/mL,Serum 2,Serum 2,Serum 6,Serum 6,Serum 10,Serum 10,Serum 14,Serum 14,Serum 16,Blank
D,Std 125 pg/mL,Std 125 pg/mL,Serum 2,Serum 2,Serum 6,Serum 6,Serum 10,Serum 10,Serum 14,Serum 14,Serum 16,Blank
E,Std 62.5 pg/mL,Std 62.5 pg/mL,Serum 3,Serum 3,Serum 7,Serum 7,Serum 11,Serum 11,Serum 17,Serum 17,Serum 18,Blank
F,Std 31.25 pg/mL,Std 31.25 pg/mL,Serum 3,Serum 3,Serum 7,Serum 7,Serum 11,Serum 11,Serum 17,Serum 17,Serum 18,Blank
G,Std 15.6 pg/mL,Std 15.6 pg/mL,Serum 4,Serum 4,Serum 8,Serum 8,Serum 12,Serum 12,Serum 19,Serum 19,Serum 20,Blank
H,Blank,Blank,Serum 4,Serum 4,Serum 8,Serum 8,Serum 12,Serum 12,Serum 19,Serum 19,Serum 20,Blank
`,
};

export const DEMO_96_RAW_ONLY = {
  name: '96-Well Raw Absorbance Read (No Layout Defined)',
  description: 'Raw microplate export from a plate reader without any annotations or layout metadata. Demonstrates clean unnormalized ingestion and raw heatmap rendering.',
  format: 96 as PlateFormat,
  rawText: `Plate\tRead 1
Instrument\tSpectraMax iD3
Read Type\tEndpoint
Wavelength\t595 nm

	1	2	3	4	5	6	7	8	9	10	11	12
A	0.142	0.155	0.280	0.410	0.590	0.820	1.120	1.350	1.620	1.850	2.010	2.180
B	0.138	0.150	0.275	0.405	0.585	0.815	1.115	1.345	1.615	1.845	2.005	2.175
C	0.140	0.152	0.278	0.408	0.588	0.818	1.118	1.348	1.618	1.848	2.008	2.178
D	0.145	0.158	0.282	0.412	0.592	0.822	1.122	1.352	1.622	1.852	2.012	2.182
E	0.139	0.151	0.276	0.406	0.586	0.816	1.116	1.346	1.616	1.846	2.006	2.176
F	0.141	0.153	0.279	0.409	0.589	0.819	1.119	1.349	1.619	1.849	2.009	2.179
G	0.143	0.156	0.281	0.411	0.591	0.821	1.121	1.351	1.621	1.851	2.011	2.181
H	0.137	0.149	0.274	0.404	0.584	0.814	1.114	1.344	1.614	1.844	2.004	2.174
`,
};
