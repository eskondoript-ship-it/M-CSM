/* Time-pressure extension: reproduces every number reported for it in the paper draft.
   Run with:  node tools/time_pressure.js                                                 */
const M = require('../engine.js');
const { scenarios } = require('../data/scenarios.json');
const P0 = M.clone(M.DEFAULT_PARAMS);
const ORDER = ['S_H', 'S_HM', 'S_N', 'S_M', 'S_HtoM', 'S_MtoH'];

function evaluate(p, mode, tc) {
  const c = {}, one = {}; ORDER.forEach(s => { c[s] = 0; one[s] = 0; });
  let viol = 0, R = [0, 0, 0];
  for (const s of scenarios) {
    const x = M.clone(s.x); if (tc !== undefined) x.TC = tc;
    const r = M.replayScenario(x, p, mode);
    c[r.stable]++; one[r.one.next]++; if (r.viol) viol++;
    const rr = M.respFor(s.P, s.y, p, mode, x);
    R[0] += rr.rows.H.R; R[1] += rr.rows.M.R; R[2] += rr.rows.G.R;
  }
  return { stable: c, one, viol, R: R.map(v => +v.toFixed(1)) };
}
const line = o => ORDER.map(s => `${s} ${o.stable[s]}`).join('  ') + `  | forbidden ${o.viol} | R_H/R_M/R_G ${o.R.join(' / ')} %`;

function run() {
  const out = {};
  out.published = evaluate(P0, 'literal');
  out.time = evaluate(P0, 'time');
  out.timeZero = evaluate({ ...P0, gammaH: 0, gammaM: 0, eta: 0, lambdaF: 0 }, 'time');
  out.grid = [];
  for (const g of [0.25, 0.5, 0.75]) for (const e of [0, 0.5, 1]) out.grid.push({ gammaH: g, eta: e, ...evaluate({ ...P0, gammaH: g, eta: e }, 'time') });
  out.stress = [0, 0.2, 0.4, 0.6, 0.8, 1].map(tc => ({ tc, published: evaluate(P0, 'literal', tc), time: evaluate(P0, 'time', tc) }));
  out.mc = M.compareRules({ N: 200000, seed: 2026, q: 'random', pHO: 0.1, pFC: 0.1, p: P0 });
  return out;
}
module.exports = { run, evaluate };

if (require.main === module) {
  const o = run(), pct = (k, n) => (100 * k / n).toFixed(2) + ' %';
  console.log('Reference parameters: γ_H = %s, γ_M = %s, η = %s, λ = %s', P0.gammaH, P0.gammaM, P0.eta, P0.lambdaF);
  console.log('\n100 scenarios (time pressure = TC as mapped, max 0.445)');
  console.log('  published rule             ', line(o.published));
  console.log('  time-aware, parameters 0   ', line(o.timeZero));
  console.log('  time-aware, reference      ', line(o.time));
  console.log('\nSensitivity of the time-aware rule (λ = 0.5)');
  o.grid.forEach(g => console.log(`  γ_H = ${g.gammaH}, η = ${g.eta}`.padEnd(30), line(g)));
  console.log('\nStress test: every scenario at the same time pressure');
  o.stress.forEach(r => { console.log(`  TC = ${r.tc}  published  `, line(r.published)); console.log(`  TC = ${r.tc}  time-aware `, line(r.time)); });
  const R = o.mc, N = R.N, ti = M.MODES.indexOf('time');
  console.log(`\nRule comparison, ${N.toLocaleString('en')} random contexts, seed 2026`);
  M.MODES.forEach(m => console.log('  ' + m.padEnd(10), 'forbidden', pct(R.viol[m], N)));
  console.log('  published vs time-aware disagree in', pct(R.dis['0-' + ti] || 0, N));
}
