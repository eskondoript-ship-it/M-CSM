/* Reproduces the key numbers of the M-CSM simulator from the command line.
   Run with:  node tools/reproduce.js [contexts] [seed]            (defaults: 200000 2026) */
const M = require('../engine.js');
const { scenarios } = require('../data/scenarios.json');
const N = +process.argv[2] || 200000, seed = process.argv[3] !== undefined ? +process.argv[3] : 2026;
const p = M.clone(M.DEFAULT_PARAMS);
const NAME = { literal: 'Published', enforced: 'Human fallback', eq8: 'Compact', revised: 'Admissibility-preserving', time: 'Time-aware' };
const pct = (k, n) => (100 * k / n).toFixed(2) + ' %';

console.log('M-CSM: 100-scenario replay (stable states)');
console.log('  rule'.padEnd(30), M.STATES.join('  '));
for (const m of M.MODES) {
  const c = M.scenarioCounts(scenarios, p, m);
  console.log(('  ' + NAME[m]).padEnd(30), M.STATES.map(s => String(c[s]).padStart(s.length)).join('  '));
}

console.log(`\nRule comparison: ${N.toLocaleString('en')} random contexts, seed ${seed}, random current state, P(HO=1) = P(FC=1) = 0.1`);
const R = M.compareRules({ N, seed, q: 'random', pHO: 0.1, pFC: 0.1, p });
for (const m of M.MODES) {
  const ci = M.wilson(R.viol[m], N);
  console.log(('  ' + NAME[m]).padEnd(30), m === 'enforced' ? 'forbidden before fallback' : 'forbidden', pct(R.viol[m], N).padStart(8), `(95 % interval ${(100 * ci[0]).toFixed(2)}–${(100 * ci[1]).toFixed(2)} %)`);
}
console.log('  Published vs Compact disagree in', pct(R.dis['0-2'] || 0, N));
console.log('  Published vs Admissibility-preserving disagree in', pct(R.dis['0-3'] || 0, N));
