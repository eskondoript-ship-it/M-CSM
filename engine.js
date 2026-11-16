/* M-CSM reference engine — implements eqs. (2)–(12) and the transition rules of
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


  /* ------------------------------------------------------------------
     Reproducible experiments (used by the simulator tabs and by Node)
     ------------------------------------------------------------------ */
  var INPUT_KEYS = CONT_INPUTS.concat(['FC', 'HO']);
  var MODES = ['literal', 'enforced', 'eq8', 'revised'];

  // Seeded pseudo-random generator (mulberry32): same seed, same sequence everywhere
  function rng(seed) {
    var a = seed | 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* Monte Carlo comparison of the four transition rules.
     o: {N, seed, q:'random'|state, pHO, pFC, p}
     Each context: the 11 continuous inputs uniform on [0,1], FC ~ Bernoulli(pFC),
     HO ~ Bernoulli(pHO), and (if q is 'random') the current state uniform over the six states.
     compareInit + compareStep allow the work to be done in chunks; compareRules does it in one call. */
  function compareInit(o) {
    var R = { N: o.N, seed: o.seed, q: o.q || 'random', pHO: o.pHO, pFC: o.pFC, p: clone(o.p), i: 0,
              next: {}, viol: {}, byC: {}, stable: {}, dis: {}, pairs: {}, rnd: rng(o.seed) };
    MODES.forEach(function (m) {
      R.next[m] = {}; R.viol[m] = 0; R.byC[m] = { '(4)': 0, '(5)': 0, '(6)': 0, '(7)': 0 }; R.stable[m] = {};
    });
    return R;
  }
  function compareStep(R, count, onSample) {
    var end = Math.min(R.N, R.i + count), rnd = R.rnd, p = R.p;
    for (; R.i < end; R.i++) {
      var x = {}, k;
      for (k = 0; k < 11; k++) x[CONT_INPUTS[k]] = rnd();
      x.FC = rnd() < R.pFC ? 1 : 0; x.HO = rnd() < R.pHO ? 1 : 0;
      var q = R.q === 'random' ? STATES[Math.floor(rnd() * 6)] : R.q;
      var d = scores(x, p).delta, nx = [], vi = [], chosen = [];
      for (var j = 0; j < 4; j++) {
        var m = MODES[j], r = decide(q, d, x, p, m);
        // for 'enforced', r.violation describes the published choice before it is replaced by S_H
        chosen.push(m === 'enforced' ? chosen[0] : r.next);
        R.next[m][r.next] = (R.next[m][r.next] || 0) + 1;
        if (r.violation) {
          R.viol[m]++;
          var why = r.A.excluded[chosen[j]] || [], seen = {};
          for (var w = 0; w < why.length; w++) { var c = why[w].slice(0, 3); if (!seen[c]) { seen[c] = 1; R.byC[m][c]++; } }
        }
        nx.push(r.next); vi.push(r.violation);
        var ro = rollout(q, x, p, m, 20), key = ro.stable ? ro.final : (ro.cycle ? 'cycle' : 'none');
        R.stable[m][key] = (R.stable[m][key] || 0) + 1;
      }
      for (var a = 0; a < 4; a++) for (var b = a + 1; b < 4; b++) if (nx[a] !== nx[b]) { var kk = a + '-' + b; R.dis[kk] = (R.dis[kk] || 0) + 1; }
      if (nx[0] !== nx[3]) { var pk = q + '|' + nx[0] + '|' + nx[3]; R.pairs[pk] = (R.pairs[pk] || 0) + 1; }
      if (onSample) onSample({ q: q, x: x, next: nx, viol: vi });
    }
    return R.i >= R.N;
  }
  function compareRules(o) { var R = compareInit(o); compareStep(R, R.N, o.onSample); return R; }

  // 95 % Wilson confidence interval for a proportion k/n
  function wilson(k, n) {
    if (!n) return [0, 0];
    var z = 1.959964, ph = k / n, den = 1 + z * z / n, mid = (ph + z * z / (2 * n)) / den;
    var half = z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / den;
    return [Math.max(0, mid - half), Math.min(1, mid + half)];
  }

  /* Scripted story: base context plus changes [{t, key, v, r}] over T epochs.
     From epoch t the input moves to v, at once (r = 0) or linearly over r epochs. */
  function storyInputs(base, events, T) {
    var xs = [], ser = {}, t;
    INPUT_KEYS.forEach(function (k) { ser[k] = []; for (var u = 0; u < T; u++) ser[k][u] = base[k]; });
    events.slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (e) {
      var k = e.key; if (!ser[k]) return;
      var bin = (k === 'FC' || k === 'HO'), t0 = Math.max(0, Math.min(T - 1, Math.round(e.t)));
      var from = t0 > 0 ? ser[k][t0 - 1] : base[k], r = bin ? 0 : Math.max(0, Math.round(e.r || 0));
      var v = bin ? (e.v >= 0.5 ? 1 : 0) : clip01(+e.v);
      for (var u = t0; u < T; u++) ser[k][u] = (r > 0 && u < t0 + r) ? from + (v - from) * (u - t0 + 1) / r : v;
    });
    for (t = 0; t < T; t++) { var x = {}; INPUT_KEYS.forEach(function (k) { x[k] = ser[k][t]; }); xs.push(x); }
    return { xs: xs, ser: ser };
  }
  function runStory(base, events, T, q0, p, mode) {
    var si = storyInputs(base, events, T), q = q0, rows = [];
    si.xs.forEach(function (x, t) { var r = step(q, x, p, mode); r.t = t; rows.push(r); q = r.next; });
    return { rows: rows, inputs: si };
  }

  /* Tipping points: for each continuous input, the nearest value below and above the
     current one at which the next state changes (all other inputs held fixed). */
  function tippingPoints(q, x, p, mode) {
    function sig(r) { return r.next + (r.violation && !r.fallback ? '!' : ''); }
    function at(k, v) { var x2 = clone(x); x2[k] = v; return step(q, x2, p, mode); }
    var b0 = step(q, x, p, mode), base = sig(b0);
    function find(k, dir) {
      var v0 = x[k], prev = v0, v = v0;
      while (true) {
        v = dir > 0 ? Math.min(1, prev + 0.01) : Math.max(0, prev - 0.01);
        if (v === prev) return null;
        if (sig(at(k, v)) !== base) {
          var lo = prev, hi = v; // lo keeps the current result, hi does not
          for (var i = 0; i < 20; i++) { var mid = (lo + hi) / 2; if (sig(at(k, mid)) === base) lo = mid; else hi = mid; }
          var r = at(k, hi);
          return { at: hi, to: r.next, forbidden: r.violation && !r.fallback, change: hi - v0 };
        }
        prev = v;
      }
    }
    return { base: b0.next, forbidden: b0.violation && !b0.fallback,
             rows: CONT_INPUTS.map(function (k) { return { key: k, value: x[k], down: find(k, -1), up: find(k, 1) }; }) };
  }

  /* Scenario replay as in the validation notebook: start in S_H, repeat for up to four epochs. */
  function replayScenario(x, p, mode) {
    var q = 'S_H', first = null, viol = false;
    for (var k = 0; k < 4; k++) { var r = step(q, x, p, mode); if (first === null) first = r; if (r.violation) viol = true; if (r.next === q) break; q = r.next; }
    return { one: first, stable: q, viol: viol };
  }
  function scenarioCounts(list, p, mode) {
    var c = {}; STATES.forEach(function (s) { c[s] = 0; });
    list.forEach(function (sc) { c[replayScenario(sc.x, p, mode).stable]++; });
    return c;
  }

  return {
    STATES: STATES, STATE_LABEL: STATE_LABEL, HOLDER: HOLDER, DEFAULT_PARAMS: DEFAULT_PARAMS,
    RESP_PRESETS: RESP_PRESETS, CONT_INPUTS: CONT_INPUTS,
    strength: strength, scores: scores, admissible: admissible, step: step, decide: decide, transitionMap: transitionMap, rollout: rollout,
    responsibility: responsibility, sensitivity: sensitivity, perturbRun: perturbRun,
    normWeights: normWeights, clone: clone, clip01: clip01,
    INPUT_KEYS: INPUT_KEYS, MODES: MODES, rng: rng, compareInit: compareInit, compareStep: compareStep, compareRules: compareRules, wilson: wilson,
    storyInputs: storyInputs, runStory: runStory, tippingPoints: tippingPoints, replayScenario: replayScenario, scenarioCounts: scenarioCounts
  };
})();
if (typeof module !== 'undefined') module.exports = MCSM;
