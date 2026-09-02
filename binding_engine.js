/* Bio-Bench binding engine — pure equilibrium math, no DOM. Concentrations in nM.
   1:1 and n-mer single-step: bisection on the mass-balance polynomial
   (for n = 1 this is the Morrison 1969 tight-binding quadratic).
   Stepwise: n identical sites with cooperativity factor alpha (Adair binding polynomial;
   alpha < 1 = positive cooperativity, micro-Kd of step k = Kd * alpha^(k-1)). */
(function (global) {
  'use strict';

  function fSingleStep(x, P1_tot, P2_tot, Kd_int, n) {
    const P1_free = P1_tot - x;
    const P2_free = P2_tot - n * x;
    if (P1_free < 0 || P2_free < 0) return Number.POSITIVE_INFINITY;
    return P1_free * Math.pow(P2_free, n) - Kd_int * x;
  }

  function solveSingleStep(P1_tot, P2_tot, Kd_int, n) {
    let low = 0;
    let high = Math.min(P1_tot, P2_tot / n);
    if (P1_tot <= 0 || P2_tot <= 0) return 0;
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (low + high);
      const fmid = fSingleStep(mid, P1_tot, P2_tot, Kd_int, n);
      if (Math.abs(fmid) < 1e-12) return mid;
      const flow = fSingleStep(low, P1_tot, P2_tot, Kd_int, n);
      if (Math.sign(flow) === Math.sign(fmid)) { low = mid; } else { high = mid; }
    }
    return 0.5 * (low + high);
  }

  function solveStepwise(P_tot, L_tot, Kd_intrinsic, n, alpha) {
      if (P_tot <= 0) return { L: Math.max(L_tot, 0), theta: 0, probs: Array(n+1).fill(0), concs: Array(n+1).fill(0) };
      const betas = [1];
      for (let k = 1; k <= n; k++) {
          const micro_Kd_k = Kd_intrinsic * Math.pow(alpha, k - 1);
          if (micro_Kd_k <= 0) betas.push(Number.POSITIVE_INFINITY);
          else betas.push(betas[k - 1] * (1 / micro_Kd_k) * (n - k + 1) / k);
      }
      const f = (L) => {
          let Z = 0, sum_k_beta_Lk = 0;
          for (let k = 0; k <= n; k++) {
              const term = betas[k] * Math.pow(L, k);
              Z += term;
              sum_k_beta_Lk += k * term;
          }
          const v_bar = Z > 0 ? (sum_k_beta_Lk / Z) : 0;
          return L + P_tot * v_bar - L_tot;
      };
      let low = 0, high = Math.max(L_tot, Kd_intrinsic * 1e3);
      if (f(high) < 0) { while(f(high) < 0) { high *= 2; if (high > 1e18) break; } }
      for (let i = 0; i < 100; i++) {
          const mid = 0.5 * (low + high);
          const val = f(mid);
          if (Math.abs(val) < 1e-12 * (L_tot + 1e-9)) { low = high = mid; break; }
          if (val > 0) high = mid; else low = mid;
      }
      const L = 0.5 * (low + high);
      const species_rel = [];
      let Z = 0;
      for(let k=0; k<=n; k++){
          const term = betas[k] * Math.pow(L, k);
          species_rel.push(term);
          Z += term;
      }
      const probs = species_rel.map(v => v/Z);
      const concs = probs.map(p => p * P_tot);
      let avg_bound = 0;
      for(let k=0; k<=n; k++) avg_bound += k * probs[k];
      const theta = avg_bound / n;
      return { L, theta, probs, concs };
  }

  /* Total ligand needed so that the fraction of P with >=1 ligand ('any_bound') or with all n
     sites filled ('fully_bound') equals targetFrac, using the exact stepwise model. NaN if unreachable. */
  function targetStepwise(P_tot, Kd_site, n, alpha, mode, targetFrac) {
    if (!(targetFrac > 0 && targetFrac < 1)) return NaN;
    const frac = (Ltot) => {
      const r = solveStepwise(P_tot, Ltot, Kd_site, n, alpha);
      return mode === 'fully_bound' ? r.probs[n] : 1 - r.probs[0];
    };
    let lo = 0, hi = Math.max(Kd_site, 1) * 10;
    let guard = 0;
    while (frac(hi) < targetFrac) { hi *= 4; if (++guard > 60) return NaN; }
    for (let i = 0; i < 100; i++) {
      const mid = 0.5 * (lo + hi);
      if (frac(mid) < targetFrac) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  global.BindingEngine = { solveSingleStep, solveStepwise, targetStepwise };
})(window);
