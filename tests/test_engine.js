/* Run with:  node tests/test_engine.js
   Checks the M-CSM engine against the paper's equations and the 100-scenario notebook results. */
const assert = require('assert');
const M = require('../engine.js');
const { scenarios } = require('../data/scenarios.json');
const p = M.clone(M.DEFAULT_PARAMS);
let pass = 0; const ok = (name) => { pass++; console.log('  ✓', name); };

// 1. Strength score, eq. (2): weighted geometric mean, checked by hand
const x = {CP_H:.7,TR_H:.8,VA_H:.85,UC_H:.3,CP_M:.95,TR_M:.9,VA_M:.8,UC_M:.1,VA_HM:.7,ER:.3,TC:.4,FC:0,HO:0};
const SH = Math.pow(.7,.35)*Math.pow(.8,.2)*Math.pow(.85,.25)*Math.pow(.7,.2);
assert(Math.abs(M.scores(x,p).SH - SH) < 1e-12); ok('strength score matches eq. (2)');

// 2. Responsibility, eqs. (9)-(12): shares always sum to 1
for (const s of M.STATES) for (const y of [0,.3,1]) {
  assert(Math.abs(M.responsibility(M.RESP_PRESETS[s], y, p).total - 1) < 1e-12);
}
ok('responsibility shares are conserved (sum to 1)');

// 3. Admissibility-preserving rule never returns an excluded state
let rnd = (s => () => (s = (s*16807) % 2147483647) / 2147483647)(7);
const keys = ['CP_H','TR_H','VA_H','UC_H','CP_M','TR_M','VA_M','UC_M','VA_HM','ER','TC'];
for (const db of ['negotiate','hold']) {
  const q2 = M.clone(p); q2.deadBand = db;
  for (let i = 0; i < 50000; i++) {
    const c = {}; keys.forEach(k => c[k] = rnd()); c.FC = rnd() < .1 ? 1 : 0; c.HO = rnd() < .1 ? 1 : 0;
    assert(!M.step(M.STATES[Math.floor(rnd()*6)], c, q2, 'revised').violation);
  }
}
ok('admissibility-preserving rule: 100,000 random contexts, no excluded result');

// 4. Replay of the 100 scenarios reproduces the notebook (published rule)
const replay = (mode, deadBand) => {
  const q2 = M.clone(p); q2.deadBand = deadBand || 'negotiate';
  return scenarios.map(sc => {
    let q = 'S_H'; const first = M.step(q, sc.x, q2, mode).next;
    for (let k = 0; k < 4; k++) { const n = M.step(q, sc.x, q2, mode).next; if (n === q) break; q = n; }
    return { first, stable: q };
  });
};
const pub = replay('literal');
assert(pub.every((r,i) => r.first === scenarios[i].o1 && r.stable === scenarios[i].os));
ok('published rule matches the notebook in 100/100 scenarios');
const count = rs => rs.reduce((a,r) => (a[r.stable] = (a[r.stable]||0)+1, a), {});
assert.deepStrictEqual(count(pub), {S_N:28, S_HM:45, S_H:26, S_M:1});
ok('stable-state counts are 26 / 45 / 28 / 1');
assert.deepStrictEqual(count(replay('revised')), count(pub));
ok('admissibility-preserving rule gives the same 26 / 45 / 28 / 1');

// 5. Monte Carlo comparison is reproducible and matches the figures quoted in the simulator notes
const mc = M.compareRules({ N: 200000, seed: 2026, q: 'random', pHO: 0.1, pFC: 0.1, p });
const pc = v => (100 * v / mc.N).toFixed(1);
assert.strictEqual(pc(mc.viol.literal), '8.0'); assert.strictEqual(pc(mc.viol.eq8), '3.0');
assert.strictEqual(mc.viol.revised, 0); assert.strictEqual(pc(mc.dis['0-2']), '25.1');
assert.strictEqual(mc.viol.enforced, mc.viol.literal);
const mc2 = M.compareRules({ N: 5000, seed: 11, q: 'S_H', pHO: 0.1, pFC: 0.1, p });
const mc3 = M.compareRules({ N: 5000, seed: 11, q: 'S_H', pHO: 0.1, pFC: 0.1, p });
assert.deepStrictEqual(mc2.next, mc3.next); assert.deepStrictEqual(mc2.dis, mc3.dis);
ok('Monte Carlo: 8.0 % / 3.0 % forbidden, 25.1 % disagreement (200,000 contexts, seed 2026), same seed gives same result');

// 6. Scripted story: steps and linear ramps
const st = M.storyInputs(x, [{ t: 6, key: 'CP_M', v: 0.4, r: 0 }, { t: 8, key: 'TR_M', v: 0.5, r: 4 }, { t: 3, key: 'HO', v: 1, r: 9 }], 12);
assert.strictEqual(st.ser.CP_M[5], 0.95); assert.strictEqual(st.ser.CP_M[6], 0.4);
assert(Math.abs(st.ser.TR_M[8] - 0.8) < 1e-12 && Math.abs(st.ser.TR_M[11] - 0.5) < 1e-12);
assert.strictEqual(st.ser.HO[2], 0); assert.strictEqual(st.ser.HO[3], 1);
const run = M.runStory(x, [{ t: 6, key: 'CP_M', v: 0.4, r: 0 }], 12, 'S_H', p, 'literal').rows.map(r => r.next);
assert.deepStrictEqual(run.slice(0, 8), ['S_HtoM', 'S_M', 'S_M', 'S_M', 'S_M', 'S_M', 'S_MtoH', 'S_H']);
ok('scripted stories: step and ramp changes, handover then return');

// 7. Tipping points: crossing the reported value really changes the result
const tp = M.tippingPoints('S_H', x, p, 'literal');
for (const r of tp.rows) for (const d of [r.down, r.up]) {
  if (!d) continue;
  const at = v => { const c = M.clone(x); c[r.key] = v; const s = M.step('S_H', c, p, 'literal'); return s.next + (s.violation ? '!' : ''); };
  const before = at(d.at - Math.sign(d.change) * 1e-3), after = at(d.at);
  assert.notStrictEqual(before, after); assert.strictEqual(before, 'S_HtoM');
}
assert(Math.abs(tp.rows.find(r => r.key === 'ER').up.at - 0.7) < 1e-4);
assert(tp.rows.find(r => r.key === 'TC').up.forbidden);
ok('tipping points mark where the result changes (ER at ρ, TC at κ becomes forbidden)');

// 8. Scenario counts helper agrees with the replay
assert.deepStrictEqual(M.scenarioCounts(scenarios, p, 'literal'), { S_H: 26, S_HtoM: 0, S_M: 1, S_MtoH: 0, S_HM: 45, S_N: 28 });
ok('scenario counts helper gives 26 / 45 / 28 / 1');

console.log(`\n${pass} checks passed.`);
