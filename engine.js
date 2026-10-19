/* M-CSM reference engine — implements eqs. (2)–(12) and Algorithm 1 of
   "M-CSM: A Governance-Oriented Complementary Strength Model for Hybrid
   Human–Machine Decision-Making". Pure functions, no DOM. */
var MCSM = (function () {
  'use strict';

  var STATES = ['S_H', 'S_HtoM', 'S_M', 'S_MtoH', 'S_HM', 'S_N'];
  var STATE_LABEL = {
    S_H: 'Human-led', S_HtoM: 'Handover request (H→M)', S_M: 'Machine-led',
    S_MtoH: 'Return request (M→H)', S_HM: 'Shared control', S_N: 'Negotiation / recovery'
  };
  // Who holds authority in each state (used for transfer counting)
  var HOLDER = { S_H: 'H', S_HtoM: 'H', S_M: 'M', S_MtoH: 'M', S_HM: 'HM', S_N: 'N' };

  var DEFAULT_PARAMS = {
    wH: [0.35, 0.20, 0.25, 0.20],
    wM: [0.40, 0.20, 0.20, 0.20],
    thetaM: 0.12, thetaH: 0.10, eps: 0.05, rho: 0.70, tau: 0.60, kappa: 0.80, deadBand: 'negotiate',
    alpha: [1, 1, 1],            // (αa, αk, αd)
    beta: [1.3, 1.2, 0.8, 1.1]   // (βa, βk, βf, βd)
  };

  function clip01(v) { return Math.max(0, Math.min(1, v)); }
  // x^w with the convention 0^0 = 1
  function pw(x, w) { return (w === 0) ? 1 : Math.pow(x, w); }

  // Eq. (2): weighted geometric strength score
  function strength(cp, tr, va, uc, w) {
    return pw(cp, w[0]) * pw(tr, w[1]) * pw(va, w[2]) * pw(1 - uc, w[3]);
  }

  function normWeights(w) {
    var s = w.reduce(function (a, b) { return a + b; }, 0);
    return s > 0 ? w.map(function (v) { return v / s; }) : [0.25, 0.25, 0.25, 0.25];
  }

  // Eqs. (4)–(7): admissible set with the constraint that removed each state
  function admissible(x, p) {
    var excluded = {}; // state -> [constraint labels]
    function ex(s, why) { (excluded[s] = excluded[s] || []).push(why); }
    if (x.HO === 1) {
      ['S_HtoM', 'S_M', 'S_N'].forEach(function (s) { ex(s, '(4) HO = 1'); });
    }
    if (x.ER >= p.rho || x.FC === 1) {
      ex('S_M', x.FC === 1 && x.ER >= p.rho ? '(5) ER ≥ ρ and FC = 1' : (x.FC === 1 ? '(5) FC = 1' : '(5) ER ≥ ρ'));
    }
    if (x.VA_HM < p.tau) ex('S_HM', '(6) VA_HM < τ');
    if (x.TC >= p.kappa) {
      ['S_N', 'S_HtoM', 'S_MtoH'].forEach(function (s) { ex(s, '(7) TC ≥ κ'); });
    }
    var set = STATES.filter(function (s) { return !excluded[s]; });
    return { set: set, excluded: excluded, has: function (s) { return set.indexOf(s) >= 0; } };
  }

  function scores(x, p) {
    var SH = strength(x.CP_H, x.TR_H, x.VA_H, x.UC_H, p.wH);
    var SM = strength(x.CP_M, x.TR_M, x.VA_M, x.UC_M, p.wM);
    return { SH: SH, SM: SM, delta: SM - SH };
  }

  function decide(q, d, x, p, mode, opts) {
    opts = opts || {};
    var A = admissible(x, p), next, line;
    if (mode === 'eq8') {
      if (x.HO === 1 || x.ER >= p.rho || x.FC === 1) { next = 'S_H'; line = 'eq8:1'; }
      else if (d >= p.thetaM && A.has('S_M')) { next = 'S_M'; line = 'eq8:2'; }
      else if (Math.abs(d) < p.eps && x.VA_HM >= p.tau && A.has('S_HM')) { next = 'S_HM'; line = 'eq8:3'; }
      else if (d <= -p.thetaH) { next = 'S_H'; line = 'eq8:4'; }
      else { next = 'S_N'; line = 'eq8:5'; }
    } else if (mode === 'revised') {
      /* Algorithm 2: admissibility-preserving transition policy (mode 'revised').
         Every branch checks A(x_t), so the result is always admissible.
         p.deadBand: 'negotiate' (go to S_N) or 'hold' (keep a stable state). */
      var HtoM = opts.collapse ? 'S_M' : 'S_HtoM', MtoH = opts.collapse ? 'S_H' : 'S_MtoH';
      if (x.HO === 1 || x.ER >= p.rho || x.FC === 1) {
        if (q === 'S_M' && !opts.collapse && A.has('S_MtoH')) { next = 'S_MtoH'; line = 4; } else { next = 'S_H'; line = 4; }
      } else if (d >= p.thetaM && A.has('S_M')) {
        if (q === 'S_M' || q === 'S_HtoM' || q === 'S_MtoH') { next = 'S_M'; line = 6; }
        else if (A.has(HtoM)) { next = HtoM; line = 7; }
        else { next = 'S_M'; line = 8; }
      } else if (d <= -p.thetaH) {
        if (q === 'S_M' && A.has(MtoH)) { next = MtoH; line = 10; } else { next = 'S_H'; line = 11; }
      } else if (Math.abs(d) < p.eps && x.VA_HM >= p.tau && A.has('S_HM')) { next = 'S_HM'; line = 13; }
      else {
        var stable = (q === 'S_H' || q === 'S_M' || q === 'S_HM') && A.has(q);
        if ((p.deadBand || 'negotiate') === 'negotiate') {
          if (A.has('S_N')) { next = 'S_N'; line = 15; } else { next = stable ? q : 'S_H'; line = 15; }
        } else {
          if (stable) { next = q; line = 16; }
          else if (q === 'S_N' && A.has('S_N')) { next = 'S_N'; line = 16; }
          else { next = 'S_H'; line = 16; }
        }
      }
    } else {
      if (x.HO === 1 || x.ER >= p.rho || x.FC === 1) { next = 'S_H'; line = 3; }
      else if (q === 'S_H' && d >= p.thetaM && A.has('S_M')) { next = opts.collapse ? 'S_M' : 'S_HtoM'; line = 5; }
      else if ((q === 'S_M' || q === 'S_HtoM') && d >= p.thetaM && A.has('S_M')) { next = 'S_M'; line = 7; }
      else if (q === 'S_M' && d <= -p.thetaH) { next = opts.collapse ? 'S_H' : 'S_MtoH'; line = 9; }
      else if ((q === 'S_H' || q === 'S_MtoH') && d <= -p.thetaH) { next = 'S_H'; line = 11; }
      else if (Math.abs(d) < p.eps && x.VA_HM >= p.tau && A.has('S_HM')) { next = 'S_HM'; line = 13; }
      else { next = 'S_N'; line = 15; }
    }
    var violation = !A.has(next), fallback = false;
    if (violation && mode === 'enforced') { next = 'S_H'; fallback = true; }
    var gov = line === 3 || line === 4 || line === 'eq8:1';
    return { q: q, next: next, line: line, delta: d, A: A, violation: violation, fallback: fallback, gov: gov };
  }

  /* One decision epoch.
     mode: 'literal'  – Published: Algorithm 1 exactly as printed
           'enforced' – Human fallback: an inadmissible result becomes S_H
           'eq8'      – Compact (eq. 8): the stateless summary policy
     opts.collapse: true skips the logged handover states (S_H→M, S_M→H) */
  function step(q, x, p, mode, opts) {
    var sc = scores(x, p);
    var r = decide(q, sc.delta, x, p, mode, opts);
    r.SH = sc.SH; r.SM = sc.SM;
    return r;
  }

  /* Next state for every (q_t, region of Δ) under the governance signals of x. */
  function transitionMap(x, p, mode) {
    var regions = [];
    regions.push({ key: 'hadv', label: 'Δ ≤ −θH', d: -p.thetaH - 0.05 });
    if (p.thetaH > p.eps) regions.push({ key: 'deadm', label: '−θH < Δ ≤ −ε', d: -(p.thetaH + p.eps) / 2 });
    regions.push({ key: 'shared', label: '|Δ| < ε', d: 0 });
    if (p.thetaM > p.eps) regions.push({ key: 'deadp', label: 'ε ≤ Δ < θM', d: (p.thetaM + p.eps) / 2 });
    regions.push({ key: 'madv', label: 'Δ ≥ θM', d: p.thetaM + 0.05 });
    var rows = STATES.map(function (q) {
      return { q: q, cells: regions.map(function (r) { return decide(q, r.d, x, p, mode); }) };
    });
    return { regions: regions, rows: rows };
  }

  // Repeat the epoch under a fixed context until the state stops changing
  function rollout(q0, x, p, mode, maxEpochs, opts) {
    var trace = [], q = q0, seen = {};
    maxEpochs = maxEpochs || 20;
    for (var t = 0; t < maxEpochs; t++) {
      var r = step(q, x, p, mode, opts);
      r.t = t;
      trace.push(r);
      if (r.next === q) return { trace: trace, final: q, stable: true, cycle: false };
      var key = q + '>' + r.next;
      if (seen[key]) return { trace: trace, final: r.next, stable: false, cycle: true };
      seen[key] = true;
      q = r.next;
    }
    return { trace: trace, final: q, stable: false, cycle: false };
  }

  /* Eqs. (9)–(12). parties: {H:{chi,a,k,f,d}, M:{...}, G:{...}}, y in [0,1] */
  function responsibility(parties, y, p) {
    var ids = ['H', 'M', 'G'];
    var chiSum = ids.reduce(function (s, i) { return s + parties[i].chi; }, 0);
    var out = { ok: chiSum > 0, rows: {} };
    if (!out.ok) return out;
    var al = p.alpha, be = p.beta;
    ids.forEach(function (i) {
      var P = parties[i];
      var psi = P.chi / chiSum;
      var gp = pw(P.a, al[0]) * pw(P.k, al[1]) * pw(P.d, al[2]);
      var gm = pw(P.a, be[0]) * pw(P.k, be[1]) * pw(P.f, be[2]) * pw(P.d, be[3]);
      out.rows[i] = { psi: psi, gp: gp, gm: gm };
    });
    var sp = 0, sm = 0;
    ids.forEach(function (i) { sp += out.rows[i].psi * out.rows[i].gp; sm += out.rows[i].psi * out.rows[i].gm; });
    out.fallbackPlus = sp === 0; out.fallbackMinus = sm === 0;
    var total = 0;
    ids.forEach(function (i) {
      var r = out.rows[i];
      r.rp = y * (sp > 0 ? r.psi * r.gp / sp : r.psi);
      r.rm = (1 - y) * (sm > 0 ? r.psi * r.gm / sm : r.psi);
      r.R = r.rp + r.rm;
      total += r.R;
    });
    out.total = total;
    return out;
  }

  /* Illustrative responsibility presets per regime. NOT from the paper:
     the paper gives no defaults for χ, a, k, f, d. Edit freely. */
  var RESP_PRESETS = {
    S_H:    { H: { chi: .70, a: 1.0, k: .80, f: .90, d: 1.0 }, M: { chi: .20, a: .10, k: .70, f: .20, d: .20 }, G: { chi: .10, a: .60, k: .60, f: .70, d: .80 } },
    S_HtoM: { H: { chi: .50, a: .80, k: .75, f: .80, d: .95 }, M: { chi: .40, a: .40, k: .80, f: .30, d: .25 }, G: { chi: .10, a: .60, k: .60, f: .70, d: .80 } },
    S_M:    { H: { chi: .15, a: .30, k: .60, f: .50, d: .80 }, M: { chi: .75, a: .90, k: .90, f: .50, d: .40 }, G: { chi: .10, a: .60, k: .60, f: .70, d: .80 } },
    S_MtoH: { H: { chi: .40, a: .60, k: .70, f: .60, d: .90 }, M: { chi: .50, a: .60, k: .85, f: .40, d: .30 }, G: { chi: .10, a: .60, k: .60, f: .70, d: .80 } },
    S_HM:   { H: { chi: .45, a: .60, k: .70, f: .70, d: .90 }, M: { chi: .45, a: .50, k: .80, f: .40, d: .30 }, G: { chi: .10, a: .60, k: .60, f: .70, d: .80 } },
    S_N:    { H: { chi: .40, a: .50, k: .65, f: .60, d: .90 }, M: { chi: .30, a: .30, k: .75, f: .30, d: .25 }, G: { chi: .30, a: .80, k: .60, f: .80, d: .90 } }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* One-at-a-time sensitivity screen around the current context
     (thresholds ±20 %, each weight ±20 % then renormalised, continuous inputs ±0.05). */
  var CONT_INPUTS = ['CP_H', 'TR_H', 'VA_H', 'UC_H', 'CP_M', 'TR_M', 'VA_M', 'UC_M', 'VA_HM', 'ER', 'TC'];
  function sensitivity(q, x, p, mode) {
    var base = step(q, x, p, mode).next, flips = [], n = 0;
    function test(label, x2, p2) {
      n++;
      var s = step(q, x2, p2, mode).next;
      if (s !== base) flips.push({ label: label, to: s });
    }
    ['thetaM', 'thetaH', 'eps', 'rho', 'tau', 'kappa'].forEach(function (k) {
      [-0.2, 0.2].forEach(function (f) { var p2 = clone(p); p2[k] = p[k] * (1 + f); test(k + (f > 0 ? ' +20%' : ' −20%'), x, p2); });
    });
    ['wH', 'wM'].forEach(function (w) {
      for (var i = 0; i < 4; i++) {
        [-0.2, 0.2].forEach(function (f) {
          var p2 = clone(p); p2[w][i] = p[w][i] * (1 + f); p2[w] = normWeights(p2[w]);
          test(w + '[' + (i + 1) + ']' + (f > 0 ? ' +20%' : ' −20%'), x, p2);
        });
      }
    });
    CONT_INPUTS.forEach(function (k) {
      [-0.05, 0.05].forEach(function (f) { var x2 = clone(x); x2[k] = clip01(x[k] + f); test(k + (f > 0 ? ' +0.05' : ' −0.05'), x2, p); });
    });
    return { base: base, n: n, flips: flips };
  }

  /* P3 perturbation run (assumptions beyond the paper are documented in the UI).
     cfg: {x0, p, mode, q0, T, kind:'latency'|'silent', onset, duration, magnitude,
           humanLoss, lag, traced, presets} */
  function perturbRun(cfg) {
    var p = cfg.p, x0 = cfg.x0, rows = [], q = cfg.q0, recorded = cfg.q0;
    var transfers = 0, untraced = 0, violations = 0, zeroStates = {};
    for (var t = 0; t < cfg.T; t++) {
      var x = clone(x0);
      var trueCPM = x0.CP_M, trueCPH = x0.CP_H;
      var active = t >= cfg.onset && t < cfg.onset + cfg.duration;
      if (cfg.kind === 'latency' && active) {
        x.TC = clip01(cfg.magnitude);
        trueCPH = clip01(x0.CP_H - cfg.humanLoss);
        x.CP_H = trueCPH; // time pressure is visible to the model
      }
      if (cfg.kind === 'silent' && t >= cfg.onset) {
        trueCPM = clip01(x0.CP_M - cfg.magnitude);
        if (t >= cfg.onset + cfg.lag) x.CP_M = trueCPM; // detected after lag
      }
      var r = step(q, x, p, cfg.mode, { collapse: !cfg.traced });
      if (r.violation) violations++;
      var prevHolder = HOLDER[q], nextHolder = HOLDER[r.next];
      if (prevHolder !== nextHolder) {
        transfers++;
        if (!cfg.traced && ((prevHolder === 'H' && nextHolder === 'M') || (prevHolder === 'M' && nextHolder === 'H'))) untraced++;
      }
      // Actual regime drives functional contribution; the accountability record
      // uses the last logged regime. Untraced runs log one epoch late.
      var actual = cfg.presets[r.next];
      var recState = cfg.traced ? r.next : recorded;
      var rec = cfg.presets[recState];
      var parties = {
        H: Object.assign({}, rec.H, { chi: actual.H.chi }),
        M: Object.assign({}, rec.M, { chi: actual.M.chi }),
        G: Object.assign({}, rec.G, { chi: actual.G.chi })
      };
      var chiSum = actual.H.chi + actual.M.chi + actual.G.chi;
      var zeroChi = !(chiSum > 0);
      var psiH = zeroChi ? NaN : actual.H.chi / chiSum, psiM = zeroChi ? NaN : actual.M.chi / chiSum, psiG = zeroChi ? NaN : actual.G.chi / chiSum;
      var y = zeroChi ? NaN : clip01(psiH * trueCPH + psiM * trueCPM + psiG * (trueCPH + trueCPM) / 2);
      var resp = zeroChi ? null : responsibility(parties, y, p);
      if (zeroChi) zeroStates[r.next] = 1;
      rows.push({
        t: t, q: q, next: r.next, recorded: recState, line: r.line, delta: r.delta, SH: r.SH, SM: r.SM,
        TC: x.TC, CPMobs: x.CP_M, CPMtrue: trueCPM, y: y, active: cfg.kind === 'latency' ? active : t >= cfg.onset,
        violation: r.violation, psiH: psiH, RH: resp ? resp.rows.H.R : NaN, RM: resp ? resp.rows.M.R : NaN, RG: resp ? resp.rows.G.R : NaN,
        gap: resp ? resp.rows.H.R - psiH : NaN
      });
      recorded = r.next;
      q = r.next;
    }
    return { rows: rows, transfers: transfers, untraced: untraced, violations: violations, zeroChi: Object.keys(zeroStates) };
  }

  return {
    STATES: STATES, STATE_LABEL: STATE_LABEL, HOLDER: HOLDER, DEFAULT_PARAMS: DEFAULT_PARAMS,
    RESP_PRESETS: RESP_PRESETS, CONT_INPUTS: CONT_INPUTS,
    strength: strength, scores: scores, admissible: admissible, step: step, decide: decide, transitionMap: transitionMap, rollout: rollout,
    responsibility: responsibility, sensitivity: sensitivity, perturbRun: perturbRun,
    normWeights: normWeights, clone: clone, clip01: clip01
  };
})();
if (typeof module !== 'undefined') module.exports = MCSM;
