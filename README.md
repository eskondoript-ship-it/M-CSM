# M-CSM

Interactive simulator for M-CSM, the Governance-Oriented Complementary Strength Model for hybrid human–machine decision-making.

## Open the simulator

The whole simulator is one file, `index.html`. Download it and open it in any web browser; no installation or internet connection is needed (fonts load from Google Fonts when online).

To publish it as a web page, enable **GitHub Pages** for this repository (Settings → Pages → deploy from the `main` branch, root folder). The simulator then opens at `https://eskondoript-ship-it.github.io/M-CSM/`.

## What it does

| Tab | Purpose |
|---|---|
| Decision epoch | Set the 13 context inputs and see the human and machine strength scores, Δ, the admissible state set, the next state and the reason for it |
| Rollout & log | Repeat the decision under a fixed context until the state is stable; step through epochs and copy the log as CSV; transition map of every state and Δ region |
| Responsibility | Success and blame shares for human, machine and supervisor, with conservation check |
| Scenario replay | The 100-scenario validation set, replayed live under any rule and threshold setting |
| Responsibility drift | Perturbation test: silent machine accuracy drop or latency spike, with and without logged handovers |
| Parameters & notes | All weights, thresholds and exponents, plus the model notes |

Four transition rules can be compared:

- **Published**: the transition rule exactly as published; a result the constraints forbid is shown with a warning.
- **Human fallback**: the published rule, with any forbidden result replaced by human-led control.
- **Compact**: the stateless summary rule.
- **Admissibility-preserving**: the proposed revised rule. It never selects a forbidden state, lets negotiation and shared control be left when one agent is clearly stronger, and reverses interrupted handovers.

## Files

| File | Contents |
|---|---|
| `index.html` | The complete simulator (model, data and interface in one file) |
| `engine.js` | The model on its own: strength scores, admissible set, transition rules, responsibility allocation, scenario and perturbation runs. Works in the browser and in Node.js |
| `data/scenarios.json` | Inputs and notebook results for the 100 validation scenarios (20 families × 5) |
| `tests/test_engine.js` | Checks the model against the equations and the 100-scenario results |

## Run the tests

With Node.js installed:

```
node tests/test_engine.js
```

The tests confirm that the strength score matches the published equation, that responsibility shares always sum to 1, that the admissibility-preserving rule never returns a forbidden state, and that the published rule reproduces all 100 notebook results (stable states 26 human-led / 45 shared / 28 negotiation / 1 machine-led).

## Notes

- The default weights, thresholds and responsibility exponents are the reference values of the model; all can be changed in the Parameters tab.
- The responsibility factors per state (χ, authority, knowledge, freedom, duty) and the outcome model used in the Responsibility drift tab are illustrative placeholders, documented in the Parameters & notes tab.
