# RTPL: Rider Time Protection Layer

RTPL is a deterministic teaching prototype for FIT1055 Assignment 2b by T1 Mixue Bingcheng. It demonstrates a protection layer around an AI delivery deadline system: deadlines are checked before riders and customers see them, delay evidence is checked before lateness can affect a rider, and disputed effects can be suspended for authorised human review.

Live Case Lab: <https://jason-d-e.github.io/rtpl-fit1055/>

Live Guided Demo: <https://jason-d-e.github.io/rtpl-fit1055/guided-demo.html>

## Scope and evidence boundary

- All orders, routes, AI proposals, delay records and reviewer roles are synthetic.
- The prototype has no platform connection, model inference, live GPS, production authentication or measured rider outcomes.
- Numerical settings, including the 48-hour filing window and 24-hour review target, are illustrative rather than platform policy.
- `ASSESSMENT ELIGIBLE` means that an assessment may proceed. It does not mean that money, ratings, bonuses or future work have already been affected.
- The original AI proposal is a modelled baseline. The protection decisions are calculated by the executable rules in `rtpl-core.js`.
- This is an independent coursework prototype, not an official Meituan, Mixue or delivery-platform product.

## Repository structure

- `index.html` — the static teaching interface and fixed presentation cases.
- `guided-demo.html` and `guided-demo.css` — the responsive ten-step presentation shell, three connected views and local SVG route.
- `guided/scenario.js` — one fixed, synthetic A101 lifecycle and its simulation clock.
- `guided/store.js` — deterministic previous/next/play/pause/speed/restart state controller.
- `guided/adapter.js` — calls `rtpl-core.js` and builds an immutable view model for every step.
- `guided/view.js` — renders Rider, Customer, map, Control Centre, ethics and audit projections.
- `guided/app.js` — wires controls, deep links, the Advanced Sandbox and audit download.
- `rtpl-core.js` — the single executable source for protection rules P01–P07, used by both the browser and Node tests.
- `test/rtpl-core.test.js` — the 42 numbered core checks recorded in the presentation evidence, now runnable.
- `test/presentation-contract.test.js` — regression checks for case numbering, fixed inputs, scripted outcomes and visible scope statements.
- `test/guided-domain.test.js` and `test/guided-integration.test.js` — guided lifecycle, synchronisation, privacy, timer and page-contract checks.
- `scripts/browser-smoke.js` — no-dependency Chrome/Edge interaction, responsive-layout and reduced-motion smoke test.
- `docs/ARCHITECTURE.md` — module boundaries, data flow and invariants.
- `package.json` — dependency-free test commands using Node's built-in test runner.

## Run locally

No build step or API key is required. Open either `index.html` or `guided-demo.html` in a current browser, or serve the directory with any local static-file server. Classic scripts are used deliberately, so the pages also work when opened directly with `file://`.

The public version is hosted by GitHub Pages from `main`. The route illustration, fonts, logic and data are local; the complete demonstration continues to work without a mapping service or other network API.

## Run the tests

Install Node.js 18 or later, then run:

```text
npm test
```

Focused commands:

```text
npm run test:core
npm run test:presentation
npm run test:guided
npm run test:browser
```

The first three commands use only built-in Node modules; `npm install` is not required. `test:browser` launches an installed Chrome or Edge in headless mode, drives the complete lifecycle, verifies Customer-view privacy, playback/reset, the Sandbox, a true 390 px viewport and reduced motion, and writes ignored QA screenshots to `.work/`. Set `RTPL_PAGE_URL` to run the same smoke test against a deployed `guided-demo.html` instead of the local file.

## Guided Demo: eight-minute route

Use **Guided live demo** on the Case Lab or open `guided-demo.html` directly. The ten timeline steps form one repeatable story:

1. Synthetic order A101 is placed at 12:00.
2. A synthetic AI proposes 12:24; neither Rider nor Customer receives it.
3. P02 calculates a 34-minute floor and publishes 12:34 to both apps.
4. The rider accepts the protected deadline, which can never move earlier.
5. A verified 12:34–12:44 road closure is credited once; the deadline becomes 12:44 and a local detour appears.
6. P05 protects the verified safe detour while the SVG rider advances without GPS or a routing API.
7. Delivery completes at 12:49. Five residual minutes have reliable causal evidence, so assessment is eligible, but no effect is automatically applied.
8. The Rider App appeal action files a review at 12:50; all four possible effects become `SUSPENDED`.
9. At 13:00, the Control Centre's authorised-review action records a reasoned `REVERSE` decision; all four effects become `PROTECTED`.
10. P07 exposes a minimal audit record that can be downloaded as synthetic JSON.

**Play/Pause**, **Previous/Next**, the timeline and 1×/2×/4× all operate on the same store. Playback speed changes only the presentation interval, never any RTPL result. **Restart** cancels pending playback and restores Step 1, 1× speed and the initial route.

## Shared-state and privacy boundaries

```text
fixed synthetic scenario ─┐
                         ├─> guided adapter ─> rtpl-core.js (P01–P07)
playback store ───────────┘          │
                                     └─> immutable model
                                          ├─ Rider App projection
                                          ├─ Customer-safe projection
                                          ├─ local route projection
                                          └─ Control / audit projection
```

The Customer projection contains only the fictional restaurant, coarse rider-assignment and delivery status, and the validated deadline. Causal evidence, assessment details, appeal state, reviewer reason, linked effects and audit content are not passed into its renderer. The audit contains configuration, deadline arithmetic, policy and outcome, but excludes identity, names, raw GPS, messages, evidence sources and reviewer free text. No demo state is stored in cookies, `localStorage` or `sessionStorage`.

## Simulation assumptions and fallbacks

- The A101 route is a deterministic four-kilometre illustration, not a real place or navigation recommendation.
- The AI value, evidence reliability, closure record, rider cause and reviewer authority are fixed teaching inputs rather than measured facts.
- The 12:34 floor is calculated as 12 travel + 4 signals + 10 wait + 6 access + 2 handover minutes.
- The Advanced Sandbox calls the same core and can demonstrate P01 HOLD, P04 uncertain-cause protection, P05 safe-route protection and other input combinations without mutating the guided story.
- At narrow widths the timeline becomes a vertical, keyboard-operable sequence. `prefers-reduced-motion` suppresses route transitions while preserving every state change.
- The ethics panel maps the three ethical lenses to the A2a duties: ACM 1.2 Avoid Harm, 1.4 Be Fair, 1.3 Be Honest and Trustworthy, and 3.4 Policies and Processes.

## Presentation routes and recovery

- `#01` — tight AI deadline and accepted-order recheck.
- `#02` — delay already compensated.
- `#03` — lateness with no established cause.
- `#04` — supported rider cause, appeal, human review and oversight.
- `#05` — verified safe legal detour.
- `#06` — overlapping outside delays.
- `#07` — stale route data holds dispatch.

Each numbered case is fixed so its inputs and outcomes remain aligned with the presentation. Use **Restart this case** to reset one case or **Reset demo** to reset the whole prototype. Use the Sandbox for different inputs.

For the Guided Demo, use **Restart** at any time. If a presenter navigates away, reopening `guided-demo.html#step-0` restores the starting point; hashes `#step-0` through `#step-9` are stable direct links. If a live mapping service or internet connection is unavailable, no substitution is needed because the route is already local.

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
