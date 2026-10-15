# Guided Demo architecture

The Guided Demo is a dependency-free static application. Its main constraint is that every policy result must come from the same `rtpl-core.js` used by the original Case Lab and its 42 core tests.

## Module boundaries

| Module | Owns | Must not own |
|---|---|---|
| `rtpl-core.js` | P01–P07 calculations and minimal audit shape | DOM, animation, presentation copy |
| `guided/scenario.js` | Fixed synthetic inputs, step order and clock | RTPL decisions |
| `guided/store.js` | Navigation, timer, speed and reset state | Policy or view data |
| `guided/adapter.js` | Core invocation and immutable combined model | DOM operations or timers |
| `guided/view.js` | Accessible DOM projections and local map position | Policy decisions or mutable business state |
| `guided/app.js` | Event wiring, deep links, Sandbox and audit download | Duplicated RTPL logic |

Scripts use classic UMD wrappers in a fixed order so the same files work with GitHub Pages, a static server, direct `file://` opening and CommonJS tests.

## Runtime flow

1. The store changes only `stepIndex`, `playing`, `speed` and `revision`.
2. On each store notification, the adapter replays the fixed inputs through the core.
3. The adapter freezes a new model containing order, AI, RTPL, delay, Rider, Customer, assessment, appeal, review, effects, audit and timeline projections.
4. The view renders all visible surfaces from that same model.
5. The Customer renderer receives only `model.customer`, so workplace decision data is not available to that render path.

The fixed lifecycle intentionally recalculates rather than caching policy outputs. This makes the single source of truth observable in tests and prevents presentation copy from becoming an alternative rules engine.

## Invariants

- The synthetic AI proposal is always 12:24 and remains Control-Centre-only until RTPL validates a deadline.
- Rider, Customer and Control Centre share 12:34 after the initial check and 12:44 after the verified closure.
- Accepted deadlines never move earlier.
- The verified 12:34–12:44 interval is merged and covered once.
- `ASSESSMENT ELIGIBLE` is not an applied penalty.
- Appeal suspends all four separate effects; authorised reversal protects all four.
- Customer data has no evidence, assessment, appeal, review, effect or audit fields.
- Audit data has no identity, GPS, messages, evidence source or reviewer free text.
- Reset cancels the timer before restoring Step 1 and 1× speed.
- No runtime module calls a network or browser-storage API.

## Verification layers

- Core unit tests cover P01–P07 and interval arithmetic.
- Presentation-contract tests preserve Case 01–07 and the original scripted values.
- Guided domain/integration tests cover deterministic snapshots, synchronisation, privacy, timers, Sandbox branches and HTML/script contracts.
- The browser smoke test executes real clicks and keyboard navigation, play/pause/reset, the final audit state, Customer-view privacy, Sandbox P04, 1366×768, 390×844 and reduced motion.
