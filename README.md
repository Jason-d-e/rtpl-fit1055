# RTPL: Rider Time Protection Layer

RTPL is a deterministic teaching prototype for FIT1055 Assignment 2b by T1 Mixue Bingcheng. It demonstrates a protection layer around an AI delivery deadline system: deadlines are checked before riders and customers see them, delay evidence is checked before lateness can affect a rider, and disputed effects can be suspended for authorised human review.

Live prototype: <https://jason-d-e.github.io/rtpl-fit1055/>

## Scope and evidence boundary

- All orders, routes, AI proposals, delay records and reviewer roles are synthetic.
- The prototype has no platform connection, model inference, live GPS, production authentication or measured rider outcomes.
- Numerical settings, including the 48-hour filing window and 24-hour review target, are illustrative rather than platform policy.
- `ASSESSMENT ELIGIBLE` means that an assessment may proceed. It does not mean that money, ratings, bonuses or future work have already been affected.
- The original AI proposal is a modelled baseline. The protection decisions are calculated by the executable rules in `rtpl-core.js`.

## Repository structure

- `index.html` — the static teaching interface and fixed presentation cases.
- `rtpl-core.js` — the single executable source for protection rules P01–P07, used by both the browser and Node tests.
- `test/rtpl-core.test.js` — the 42 numbered core checks recorded in the presentation evidence, now runnable.
- `test/presentation-contract.test.js` — regression checks for case numbering, fixed inputs, scripted outcomes and visible scope statements.
- `package.json` — dependency-free test commands using Node's built-in test runner.

## Run locally

No build step or API key is required. Open `index.html` in a current browser, or serve the directory with any local static-file server.

The public version is hosted by GitHub Pages from `main`. The prototype does not depend on network data once its local files are loaded.

## Run the tests

Install Node.js 18 or later, then run:

```text
npm test
```

Focused commands:

```text
npm run test:core
npm run test:presentation
```

The tests use only built-in Node modules; `npm install` is not required.

## Presentation routes and recovery

- `#01` — tight AI deadline and accepted-order recheck.
- `#02` — delay already compensated.
- `#03` — lateness with no established cause.
- `#04` — supported rider cause, appeal, human review and oversight.
- `#05` — verified safe legal detour.
- `#06` — overlapping outside delays.
- `#07` — stale route data holds dispatch.

Each numbered case is fixed so its inputs and outcomes remain aligned with the presentation. Use **Restart this case** to reset one case or **Reset demo** to reset the whole prototype. Use the Sandbox for different inputs.

## Protection rules

| Rule | Demonstrated safeguard |
|---|---|
| P01 | Missing or stale safety inputs hold dispatch; incomplete bundle updates are atomic. |
| P02 | The published deadline cannot be earlier than the checked floor or an already accepted deadline. |
| P03 | Verified outside-delay intervals are merged and previously compensated time is removed. |
| P04 | Residual lateness is protected unless reliable evidence establishes rider responsibility. |
| P05 | A verified safe, legal alternative remains protected. |
| P06 | An appeal suspends disputed effects until an authorised reviewer records a reasoned decision. |
| P07 | The audit summary records rules and outcomes while omitting identity, GPS, raw evidence and review free text. |

## Change discipline

The numbered cases are presentation contracts. Changes to their inputs, titles or expected outcomes require a corresponding review of the slide screenshots, speaker notes and test evidence. New experiments should be added to the Sandbox or a separate guided-demo flow instead of silently changing cases 01–07.
