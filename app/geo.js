/* Synthetic city used by every scene. Not a real place; no map service is called. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RTPLGeo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VIEW = {w: 1000, h: 560};

  const PLACES = {
    hub:   {x: 330, y: 90,  label: 'Rider waiting zone'},
    rest:  {x: 120, y: 400, label: 'Noodle Kitchen'},
    custA: {x: 900, y: 90,  label: 'A101 drop-off'},
    custB: {x: 750, y: 500, label: 'B102 drop-off'}
  };

  // Streets of the synthetic grid. Names are invented.
  const STREETS = [
    {d: 'M0 90 H1000',   name: 'Lantern Street', at: [600, 82]},
    {d: 'M0 250 H1000',  name: 'Mill Avenue',    at: [860, 242]},
    {d: 'M0 400 H1000',  name: 'Harbour Road',   at: [860, 392]},
    {d: 'M0 500 H1000',  name: 'Quay Lane',      at: [470, 492]},
    {d: 'M120 0 V560'},
    {d: 'M330 0 V560'},
    {d: 'M540 0 V560'},
    {d: 'M750 0 V560'},
    {d: 'M900 0 V560'}
  ];

  const PATHS = {
    toRest:     [[330, 90], [120, 90], [120, 400]],
    mainA:      [[120, 400], [540, 400], [540, 250], [750, 250], [750, 90], [900, 90]],
    // After the closure on Harbour Road the protected route uses Mill Avenue.
    closureA:   [[120, 400], [330, 400], [330, 250], [540, 250], [540, 90], [900, 90]],
    onToB:      [[900, 90], [900, 500], [750, 500]],
    // A new shortcut through the park appears later. RTPL still keeps the accepted deadline.
    fasterA:    [[120, 400], [330, 400], [750, 90], [900, 90]],
    // Case 05: the longer legal route around a flooded underpass.
    safeDetour: [[120, 400], [330, 400], [330, 500], [900, 500], [900, 90]]
  };

  const MARKERS = {
    closure:  {x: 435, y: 400},
    flood:    {x: 540, y: 325},
    traffic:  {x: 645, y: 250}
  };

  function segLengths(pts) {
    const out = [];
    for (let i = 1; i < pts.length; i++) out.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return out;
  }

  function pathLength(name) { return segLengths(PATHS[name]).reduce((a, b) => a + b, 0); }

  // Point at fraction t (0..1) along a named path.
  function pointAt(name, t) {
    const pts = PATHS[name];
    const lens = segLengths(pts), total = lens.reduce((a, b) => a + b, 0);
    let d = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i] || i === lens.length - 1) {
        const f = lens[i] === 0 ? 0 : Math.min(1, d / lens[i]);
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
      }
      d -= lens[i];
    }
    return pts[pts.length - 1].slice();
  }

  function toD(name) { return PATHS[name].map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' '); }

  return {VIEW, PLACES, STREETS, PATHS, MARKERS, pathLength, pointAt, toD};
});
