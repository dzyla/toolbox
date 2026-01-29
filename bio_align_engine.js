(function(global) {
    // --- 1. BIOLOGICAL DATASETS ---

    // Standard Amino Acid Order
    const AA_ORDER = "ARNDCQEGHILKMFPSTWYVBZX*";

    // Matrices Library
    const MATRICES = {
        // DNA
        EDNAFULL: {
            type: 'dna',
            match: 5,
            mismatch: -4
        },
        // PROTEIN
        BLOSUM62: { type: 'protein', scores: [
            [ 4,-1,-2,-2, 0,-1,-1, 0,-2,-1,-1,-1,-1,-2,-1, 1, 0,-3,-2, 0,-2,-1, 0,-4], // A
            [-1, 5, 0,-2,-3, 1, 0,-2, 0,-3,-2, 2,-1,-3,-2,-1,-1,-3,-2,-3,-1, 0,-1,-4], // R
            [-2, 0, 6, 1,-3, 0, 0, 0, 1,-3,-3, 0,-2,-3,-2, 1, 0,-4,-2,-3, 3, 0,-1,-4], // N
            [-2,-2, 1, 6,-3, 0, 2,-1,-1,-3,-4,-1,-3,-3,-1, 0,-1,-4,-3,-3, 4, 1,-1,-4], // D
            [ 0,-3,-3,-3, 9,-3,-4,-3,-3,-1,-1,-3,-1,-2,-3,-1,-1,-2,-2,-1,-3,-3,-2,-4], // C
            [-1, 1, 0, 0,-3, 5, 2,-2, 0,-3,-2, 1, 0,-3,-1, 0,-1,-2,-1,-2, 0, 3,-1,-4], // Q
            [-1, 0, 0, 2,-4, 2, 5,-2, 0,-3,-3, 1,-2,-3,-1, 0,-1,-3,-2,-2, 1, 4,-1,-4], // E
            [ 0,-2, 0,-1,-3,-2,-2, 6,-2,-4,-4,-2,-3,-3,-2, 0,-2,-2,-3,-3,-1,-2,-1,-4], // G
            [-2, 0, 1,-1,-3, 0, 0,-2, 8,-3,-3,-1,-2,-1,-2,-1,-2,-2, 2,-3, 0, 0,-1,-4], // H
            [-1,-3,-3,-3,-1,-3,-3,-4,-3, 4, 2,-3, 1, 0,-3,-2,-1,-3,-1, 3,-3,-3,-1,-4], // I
            [-1,-2,-3,-4,-1,-2,-3,-4,-3, 2, 4,-2, 2, 0,-3,-2,-1,-2,-1, 1,-4,-3,-1,-4], // L
            [-1, 2, 0,-1,-3, 1, 1,-2,-1,-3,-2, 5,-1,-3,-1, 0,-1,-3,-2,-2, 0, 1,-1,-4], // K
            [-1,-1,-2,-3,-1, 0,-2,-3,-2, 1, 2,-1, 5, 0,-2,-1,-1,-1,-1, 1,-3,-1,-1,-4], // M
            [-2,-3,-3,-3,-2,-3,-3,-3,-1, 0, 0,-3, 0, 6,-4,-2,-2, 1, 3,-1,-3,-3,-1,-4], // F
            [-1,-2,-2,-1,-3,-1,-1,-2,-2,-3,-3,-1,-2,-4, 7,-1,-1,-4,-3,-2,-2,-1,-2,-4], // P
            [ 1,-1, 1, 0,-1, 0, 0, 0,-1,-2,-2, 0,-1,-2,-1, 4, 1,-3,-2,-2, 0, 0, 0,-4], // S
            [ 0,-1, 0,-1,-1,-1,-1,-2,-2,-1,-1,-1,-1,-2,-1, 1, 5,-2,-2, 0,-1,-1, 0,-4], // T
            [-3,-3,-4,-4,-2,-2,-3,-2,-2,-3,-2,-3,-1, 1,-4,-3,-2,11, 2,-3,-4,-3,-2,-4], // W
            [-2,-2,-2,-3,-2,-1,-2,-3, 2,-1,-1,-2,-1, 3,-3,-2,-2, 2, 7,-1,-3,-3,-1,-4], // Y
            [ 0,-3,-3,-3,-1,-2,-2,-3,-3, 3, 1,-2, 1,-1,-2,-2, 0,-3,-1, 4,-3,-2,-1,-4], // V
            [-2,-1, 3, 4,-3, 0, 1,-1, 0,-3,-4, 0,-3,-3,-2, 0,-1,-4,-3,-3, 4, 1,-1,-4], // B
            [-1, 0, 0, 1,-3, 3, 4,-2, 0,-3,-3, 1,-1,-3,-1, 0,-1,-3,-2,-2, 1, 4,-1,-4], // Z
            [ 0,-1,-1,-1,-2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-2, 0, 0,-2,-1,-1,-1,-1,-1,-4], // X
            [-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4, 1], // *
        ]},
        BLOSUM45: { type: 'protein', scores: [
            [ 5,-2,-2,-2,-1,-1,-1, 0,-2,-1,-1,-1,-1,-2,-1, 1, 0,-3,-2, 0,-2,-1, 0,-5],
            [-2, 7, 0,-2,-4, 1, 0,-2, 0,-3,-3, 3,-2,-3,-3,-1,-1,-3,-2,-3,-1, 0,-1,-5],
            [-2, 0, 6, 2,-3, 0, 0, 0, 1,-3,-4, 0,-2,-3,-2, 1, 0,-4,-2,-3, 4, 0,-1,-5],
            [-2,-2, 2, 7,-4, 0, 2,-1,-1,-4,-4,-1,-4,-4,-1, 0,-1,-5,-3,-4, 5, 1,-1,-5],
            [-1,-4,-3,-4,12,-3,-3,-3,-3,-3,-2,-3,-2,-2,-4,-1,-1,-5,-3,-1,-3,-3,-2,-5],
            [-1, 1, 0, 0,-3, 7, 2,-2, 1,-3,-2, 1, 0,-4,-1, 0,-1,-2,-1,-3, 1, 4,-1,-5],
            [-1, 0, 0, 2,-3, 2, 6,-2, 0,-3,-2, 1,-2,-3,-1, 0,-1,-3,-2,-3, 1, 5,-1,-5],
            [ 0,-2, 0,-1,-3,-2,-2, 7,-2,-4,-4,-2,-2,-3,-2, 0,-2,-2,-3,-3,-1,-2,-1,-5],
            [-2, 0, 1,-1,-3, 1, 0,-2,10,-4,-3, 0,-2,-2,-2,-1,-2,-3, 2,-3, 0, 0,-1,-5],
            [-1,-3,-3,-4,-3,-3,-3,-4,-4, 5, 2,-3, 2, 0,-2,-2,-1,-3,-1, 3,-3,-3,-1,-5],
            [-1,-3,-4,-4,-2,-2,-2,-4,-3, 2, 5,-3, 2, 0,-3,-3,-1,-2,-1, 1,-4,-2,-1,-5],
            [-1, 3, 0,-1,-3, 1, 1,-2, 0,-3,-3, 5,-2,-3,-1,-1,-1,-3,-2,-3, 0, 1,-1,-5],
            [-1,-2,-2,-4,-2, 0,-2,-2,-2, 2, 2,-2, 6, 0,-2,-2,-1,-2,-1, 1,-3, 0,-1,-5],
            [-2,-3,-3,-4,-2,-4,-3,-3,-2, 0, 0,-3, 0, 8,-4,-2,-2, 1, 3,-1,-3,-3,-1,-5],
            [-1,-3,-2,-1,-4,-1,-1,-2,-2,-2,-3,-1,-2,-4, 9,-1,-1,-3,-3,-3,-2,-1,-2,-5],
            [ 1,-1, 1, 0,-1, 0, 0, 0,-1,-2,-3,-1,-2,-2,-1, 4, 1,-4,-2,-2, 0, 0, 0,-5],
            [ 0,-1, 0,-1,-1,-1,-1,-2,-2,-1,-1,-1,-1,-2,-1, 1, 5,-3,-2, 0,-1,-1, 0,-5],
            [-3,-3,-4,-5,-5,-2,-3,-2,-3,-3,-2,-3,-2, 1,-3,-4,-3,15, 2,-3,-5,-2,-3,-5],
            [-2,-2,-2,-3,-3,-1,-2,-3, 2,-1,-1,-2,-1, 3,-3,-2,-2, 2, 8,-1,-3,-2,-1,-5],
            [ 0,-3,-3,-4,-1,-3,-3,-3,-3, 3, 1,-3, 1,-1,-3,-2, 0,-3,-1, 5,-3,-3,-1,-5],
            [-2,-1, 4, 5,-3, 1, 1,-1, 0,-3,-4, 0,-3,-3,-2, 0,-1,-5,-3,-3, 5, 2,-1,-5],
            [-1, 0, 0, 1,-3, 4, 5,-2, 0,-3,-2, 1, 0,-3,-1, 0,-1,-2,-2,-3, 2, 5,-1,-5],
            [ 0,-1,-1,-1,-2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-2, 0, 0,-3,-1,-1,-1,-1,-1,-5],
            [-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5, 1]
        ]},
        PAM250: { type: 'protein', scores: [
            [ 2,-2, 0, 0,-2, 0, 0, 1,-1,-1,-2,-1,-1,-3, 1, 1, 1,-6,-3, 0, 0, 0, 0,-8],
            [-2, 6, 0,-1,-4, 1,-1,-3, 2,-2,-3, 3, 0,-4, 0, 0,-1, 2,-4,-2,-1, 0,-1,-8],
            [ 0, 0, 2, 2,-4, 1, 1, 0, 2,-2,-3, 1,-2,-3, 0, 1, 0,-4,-2,-2, 2, 1, 0,-8],
            [ 0,-1, 2, 4,-5, 2, 3, 1, 1,-2,-4, 0,-3,-6,-1, 0, 0,-7,-4,-2, 3, 3,-1,-8],
            [-2,-4,-4,-5,12,-5,-5,-3,-3,-2,-6,-5,-5,-4,-3, 0,-2,-8, 0,-2,-4,-5,-3,-8],
            [ 0, 1, 1, 2,-5, 4, 2,-1, 3,-2,-2, 1,-1,-5, 0,-1,-1,-5,-4,-2, 1, 3,-1,-8],
            [ 0,-1, 1, 3,-5, 2, 4, 0, 1,-2,-3, 0,-2,-5,-1, 0, 0,-7,-4,-2, 3, 3,-1,-8],
            [ 1,-3, 0, 1,-3,-1, 0, 5,-2,-3,-4,-2,-3,-5, 0, 1, 0,-7,-5,-1, 0, 0,-1,-8],
            [-1, 2, 2, 1,-3, 3, 1,-2, 6,-2,-2, 0,-2,-2, 0,-1,-1,-3, 0,-2, 1, 2,-1,-8],
            [-1,-2,-2,-2,-2,-2,-2,-3,-2, 5, 2,-2, 2, 1,-2,-1, 0,-5,-1, 4,-2,-2,-1,-8],
            [-2,-3,-3,-4,-6,-2,-3,-4,-2, 2, 6,-3, 4, 2,-3,-3,-2,-2,-1, 2,-3,-3,-1,-8],
            [-1, 3, 1, 0,-5, 1, 0,-2, 0,-2,-3, 5, 0,-5,-1, 0, 0,-3,-4,-2, 1, 0,-1,-8],
            [-1, 0,-2,-3,-5,-1,-2,-3,-2, 2, 4, 0, 6, 0,-2,-2,-1,-4,-2, 2,-2,-2,-1,-8],
            [-3,-4,-3,-6,-4,-5,-5,-5,-2, 1, 2,-5, 0, 9,-5,-3,-3, 0, 7,-1,-4,-5,-2,-8],
            [ 1, 0, 0,-1,-3, 0,-1, 0, 0,-2,-3,-1,-2,-5, 6, 1, 0,-6,-5,-1,-1, 0,-1,-8],
            [ 1, 0, 1, 0, 0,-1, 0, 1,-1,-1,-3, 0,-2,-3, 1, 2, 1,-2,-3,-1, 0, 0, 0,-8],
            [ 1,-1, 0, 0,-2,-1, 0, 0,-1, 0,-2, 0,-1,-3, 0, 1, 3,-5,-3, 0, 0,-1, 0,-8],
            [-6, 2,-4,-7,-8,-5,-7,-7,-3,-5,-2,-3,-4, 0,-6,-2,-5,17, 0,-6,-5,-6,-4,-8],
            [-3,-4,-2,-4, 0,-4,-4,-5, 0,-1,-1,-4,-2, 7,-5,-3,-3, 0,10,-2,-3,-4,-2,-8],
            [ 0,-2,-2,-2,-2,-2,-2,-1,-2, 4, 2,-2, 2,-1,-1,-1, 0,-6,-2, 4,-2,-2,-1,-8],
            [ 0,-1, 2, 3,-4, 1, 3, 0, 1,-2,-3, 1,-2,-4,-1, 0, 0,-5,-3,-2, 3, 2,-1,-8],
            [ 0, 0, 1, 3,-5, 3, 3, 0, 2,-2,-3, 0,-2,-5,-1, 0,-1,-6,-4,-2, 2, 3,-1,-8],
            [ 0,-1, 0,-1,-3,-1,-1,-1,-1,-1,-1,-1,-1,-2,-1, 0, 0,-4,-2,-1,-1,-1,-1,-8],
            [-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8, 1]
        ]}
    };

    // --- 2. ALIGNMENT ENGINE (Gotoh's Algorithm) ---
    class BioCompute {
        constructor() {
            this.NEG_INF = -1e9;
        }

        getScore(charA, charB, matrixName) {
            const mat = MATRICES[matrixName];
            if (!mat) throw new Error(`Matrix ${matrixName} not found`);

            // DNA Simple
            if (mat.type === 'dna') {
                if (charA === charB && charA !== '-' && charB !== '-') return mat.match;
                return mat.mismatch;
            }

            // Protein Lookup
            const idxA = AA_ORDER.indexOf(charA);
            const idxB = AA_ORDER.indexOf(charB);

            if (idxA === -1 || idxB === -1) return -4; // Unknown/Gap penalty fallback
            return mat.scores[idxA][idxB];
        }

        /*
         * Run Alignment
         * algo: 'local' (Smith-Waterman) or 'global' (Needleman-Wunsch)
         * s1, s2: sequences
         * matrixName: key in MATRICES
         * gapOpen, gapExt: negative integers (e.g., -10, -1)
         */
        run(s1, s2, algo, matrixName, gapOpen, gapExt) {
            const n = s1.length;
            const m = s2.length;
            const isLocal = algo === 'local';

            // DP Matrices
            // M: Best score ending with s1[i] aligned to s2[j]
            // X: Best score ending with a gap in s2 (insertion in s1)
            // Y: Best score ending with a gap in s1 (insertion in s2)

            // Note: We use flat arrays for memory efficiency if needed, but 2D is clearer.
            // Given standard browser memory, 2D arrays for <3000 residues is fine.

            const M = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
            const X = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
            const Y = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));

            // Backtrack matrices: Stores which matrix (M=0, X=1, Y=2) gave the max score
            // We need 3 backtrack matrices because each state could have come from different predecessors
            const BtM = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
            const BtX = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
            const BtY = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));

            // Initialization
            M[0][0] = 0;
            X[0][0] = this.NEG_INF;
            Y[0][0] = this.NEG_INF;

            // Initialize Borders
            for (let i = 1; i <= n; i++) {
                if (isLocal) {
                    M[i][0] = X[i][0] = Y[i][0] = 0;
                } else {
                    M[i][0] = this.NEG_INF;
                    X[i][0] = gapOpen + (i - 1) * gapExt;
                    Y[i][0] = this.NEG_INF;
                }
            }

            for (let j = 1; j <= m; j++) {
                if (isLocal) {
                    M[0][j] = X[0][j] = Y[0][j] = 0;
                } else {
                    M[0][j] = this.NEG_INF;
                    X[0][j] = this.NEG_INF;
                    Y[0][j] = gapOpen + (j - 1) * gapExt;
                }
            }

            let maxScore = this.NEG_INF;
            let maxPos = { i: n, j: m };

            // Fill DP Tables
            for (let i = 1; i <= n; i++) {
                for (let j = 1; j <= m; j++) {
                    const subScore = this.getScore(s1[i-1], s2[j-1], matrixName);

                    // Update X (Gap in Seq2)
                    // Either open a new gap from M, or extend existing gap in X
                    const xOpen = M[i-1][j] + gapOpen;
                    const xExt  = X[i-1][j] + gapExt;
                    // For local, X[i][j] cannot be negative IF it contributes to future local score?
                    // Actually, standard Gotoh local alignment usually allows X/Y to be negative,
                    // but M is clipped at 0.
                    if (xOpen >= xExt) { X[i][j] = xOpen; BtX[i][j] = 0; } // From M
                    else               { X[i][j] = xExt;  BtX[i][j] = 1; } // From X

                    // Update Y (Gap in Seq1)
                    const yOpen = M[i][j-1] + gapOpen;
                    const yExt  = Y[i][j-1] + gapExt;
                    if (yOpen >= yExt) { Y[i][j] = yOpen; BtY[i][j] = 0; } // From M
                    else               { Y[i][j] = yExt;  BtY[i][j] = 2; } // From Y

                    // Update M (Match/Mismatch)
                    const fromM = M[i-1][j-1] + subScore;
                    const fromX = X[i-1][j-1] + subScore; // Closing gap X
                    const fromY = Y[i-1][j-1] + subScore; // Closing gap Y

                    let bestM = fromM;
                    let srcM = 0; // 0=M

                    if (fromX > bestM) { bestM = fromX; srcM = 1; } // 1=X
                    if (fromY > bestM) { bestM = fromY; srcM = 2; } // 2=Y

                    if (isLocal && bestM < 0) {
                        M[i][j] = 0;
                        srcM = -1; // Stop
                    } else {
                        M[i][j] = bestM;
                    }
                    BtM[i][j] = srcM;

                    // Track Max for Local
                    if (isLocal && M[i][j] >= maxScore) {
                        maxScore = M[i][j];
                        maxPos = { i, j };
                    }
                }
            }

            // Global max is just the bottom right corner
            if (!isLocal) {
                // We need to check which matrix ends best
                const endM = M[n][m];
                const endX = X[n][m];
                const endY = Y[n][m];
                maxScore = Math.max(endM, endX, endY);
                maxPos = { i: n, j: m };
            }

            // --- Traceback ---
            let align1 = "";
            let align2 = "";
            let i = maxPos.i;
            let j = maxPos.j;

            // Determine starting state (matrix) for traceback
            let state = 0; // 0=M, 1=X, 2=Y
            if (!isLocal) {
                if (maxScore === X[n][m]) state = 1;
                else if (maxScore === Y[n][m]) state = 2;
                else state = 0;
            } else {
                state = 0; // Local always starts from M (peak match)
            }

            while ((isLocal && M[i][j] > 0) || (!isLocal && (i > 0 || j > 0))) {
                if (state === 0) { // M state
                    if (isLocal && M[i][j] === 0) break;

                    // Current characters align
                    align1 = s1[i-1] + align1;
                    align2 = s2[j-1] + align2;

                    const src = BtM[i][j];
                    i--; j--;
                    state = src;
                } else if (state === 1) { // X state (Gap in S2, S1 consumes char)
                    align1 = s1[i-1] + align1;
                    align2 = '-' + align2;

                    const src = BtX[i][j];
                    i--;
                    // If src is 0, we go to M, if 1 we stay in X
                    state = src;
                } else if (state === 2) { // Y state (Gap in S1, S2 consumes char)
                    align1 = '-' + align1;
                    align2 = s2[j-1] + align2;

                    const src = BtY[i][j];
                    j--;
                    state = src;
                }
            }

            return {
                score: maxScore,
                seq1Aligned: align1,
                seq2Aligned: align2,
                startI: i + 1, // 1-based start index
                startJ: j + 1
            };
        }
    }

    global.BioCompute = new BioCompute();

})(window);
