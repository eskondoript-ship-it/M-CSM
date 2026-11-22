# M-CSM

Interactive simulator for M-CSM, the Governance-Oriented Complementary Strength Model for hybrid human–machine decision-making.

## Open the simulator

The whole simulator is one file, `index.html`. Download it and open it in any web browser; no installation or internet connection is needed (fonts load from Google Fonts when online).

To publish it as a web page, enable **GitHub Pages** for this repository (Settings → Pages → deploy from the `main` branch, root folder). The simulator then opens at `https://eskondoript-ship-it.github.io/M-CSM/`.

## What it does

| Tab | Purpose |
|---|---|
| Decision epoch | Set the 13 context inputs and see the human and machine strength scores, Δ, the admissible state set, the next state and the reason for it; **tipping points** show, for each input, the nearest value at which the result changes |
| Strength landscape | Rotatable 3D surface of Δ over any two context inputs, coloured by the next state the selected rule chooses; forbidden regions are hatched and the current input is marked |
| Rollout & log | Repeat the decision under a fixed context until the state is stable; step through epochs and copy the log as CSV; transition map of every state and Δ region |
| Responsibility | Success and blame shares for human, machine and supervisor, with conservation check, and a chart comparing the shares across all six regimes |
| Scenario replay | The 100-scenario validation set, replayed live under any rule and threshold setting; download the set as CSV, edit or add rows, and import it back; a chart of stable states by family; a **threshold explorer** heatmap showing how the counts change with any two thresholds |
| Scenario builder | Script how inputs change over time (steps or ramps), play the story epoch by epoch, and see the state chosen by all five rules side by side; stories import and export as CSV |
| Rule comparison | Monte Carlo test of the five rules on up to 200,000 random contexts with a fixed seed: forbidden results by constraint with 95 % confidence intervals, disagreement between rules, where repeated epochs settle, and the most common disagreements |
| Responsibility drift | Perturbation test: silent machine accuracy drop or latency spike, with and without logged handovers |
| Parameters | All weights, thresholds and exponents, plus the model notes |

The page has a 3D look and is animated: raised panels and keys and bevelled chart shapes; the charts themselves are flat and still. Sliders are coloured from the start to the knob. Sections fly in when opened, the next-state card flips when the state changes, and the strength landscape grows and slowly spins (pause button provided). Animations are turned off when the system asks for reduced motion. The section tabs stay at the top while you scroll (on phones they form one row you can swipe, and the current result stays visible under them while you move the sliders).

Five transition rules can be compared:

- **Published**: the transition rule exactly as published; a result the constraints forbid is shown with a warning.
- **Human fallback**: the published rule, with any forbidden result replaced by human-led control.
- **Compact**: the stateless summary rule.
- **Admissibility-preserving**: the proposed revised rule. It never selects a forbidden state, lets negotiation and shared control be left when one agent is clearly stronger, and reverses interrupted handovers.
- **Time-aware**: the published rule with the time-pressure extension. Time criticality TC is read as graded time pressure: it lowers human capability (γ_H) and, optionally, machine capability (γ_M) before the strength scores are computed; it narrows the band between ε and θ in which no allocation rule applies (η); and it lowers the human's freedom in the blame shares (λ). When TC ≥ κ the logged transfer states and negotiation are excluded, so the rule transfers directly and sends unresolved cases to human-led control. The safety override (HO, ER, FC) always comes first. With all four parameters at 0 it gives the published results.

## Export and sharing

- Every chart has **PNG** (3× resolution) and **SVG** buttons, the 3D landscape a PNG button, and every table a **CSV** button.
- **Share, save & report** (under the title) gives a link that opens this page with every input, rule, threshold, responsibility value, story and comparison setting restored; saves or loads the settings as a JSON file; and downloads a **report** (Markdown) of the current settings and results.
- Settings are remembered in the browser between visits; **Reset everything** restores the defaults.
- **Symbols** (under the title) lists every symbol used and its meaning.

## Files

| File | Contents |
|---|---|
| `index.html` | The complete simulator (model, data and interface in one file) |
| `engine.js` | The model on its own: strength scores, admissible set, transition rules, responsibility allocation, scenario replay, perturbation runs, scripted stories, tipping points and the seeded Monte Carlo rule comparison. Works in the browser and in Node.js |
| `data/scenarios.json` | Inputs and notebook results for the 100 validation scenarios (20 families × 5) |
| `tests/test_engine.js` | Checks the model against the equations, the 100-scenario results and the quoted Monte Carlo figures |
| `tools/reproduce.js` | Prints the scenario counts and the rule-comparison figures from the command line |
| `tools/time_pressure.js` | Prints every figure reported for the time-pressure extension |

## Run the tests

With Node.js installed:

```
node tests/test_engine.js
```

The tests confirm that the strength score matches the published equation, that responsibility shares always sum to 1, that the admissibility-preserving rule never returns a forbidden state, that the published rule reproduces all 100 notebook results (stable states 26 human-led / 45 shared / 28 negotiation / 1 machine-led), and that the Monte Carlo comparison gives 8.0 % (published) and 3.0 % (compact) forbidden results and 25.1 % disagreement for 200,000 contexts with seed 2026. They also run automatically on GitHub for every change.

To print the key numbers yourself:

```
node tools/reproduce.js
```

To print every number reported for the time-pressure extension (corpus counts, sensitivity grid, stress test at fixed time pressure, rule comparison):

```
node tools/time_pressure.js
```

## Notes

- The default weights, thresholds and responsibility exponents are the reference values of the model; all can be changed in the Parameters tab.
- The responsibility factors per state (χ, authority, knowledge, freedom, duty) and the outcome model used in the Responsibility drift tab are illustrative placeholders, documented in the Parameters tab.
