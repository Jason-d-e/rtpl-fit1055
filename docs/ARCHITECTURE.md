# Architecture

The site is dependency-free static HTML, CSS and classic scripts, so it runs on GitHub Pages, any static server or straight from `file://`.

## Data flow

```text
rtpl-core.js (P01–P07)
      │  called once per scene when the page loads
app/scenes.js ── fixed synthetic inputs → frozen scene/step models
      │
app/render.js ── model → HTML (rider phone, map, console, boards, customer phone)
      │
app/main.js ──── which scene/step is showing, keyboard, animation, live reviewer desk, Sandbox
```

## Rules

- Only `rtpl-core.js` decides. Scenes call it; renderers only display what it returned.
- `rtpl-core.js` is byte-identical to the version cited in the slide 12 notes.
- Every step of every scene is a deterministic function of its index, so ← and → and direct links always show the same thing.
- Customer states never contain decision, evidence, effect or appeal fields (checked in `test/scenes.test.js`).
- The audit export has exactly the ten minimised fields (checked in both the Node and browser tests).
- Movement on the map is presentation only. Faster animation never changes a result.
- No runtime script calls a network or browser-storage API.
