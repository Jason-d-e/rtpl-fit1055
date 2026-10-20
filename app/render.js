/* Pure HTML renderers. They read a scene beat and return markup; no policy logic lives here. */
(function (root) {
  'use strict';
  const S = root.RTPLScenes, G = root.RTPLGeo;
  const clock = S.clock;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

  /* ---------- icons ---------- */
  const ICON = {
    shield: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1 2.5 3v4.3c0 3.4 2.3 6.3 5.5 7.4 3.2-1.1 5.5-4 5.5-7.4V3L8 1Zm-1 10.2L4.3 8.5l1.1-1.1L7 9l3.6-3.6 1.1 1.1L7 11.2Z"/></svg>',
    lock: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2H13v8H3V7h1.5Zm1.5 0h4V5a2 2 0 0 0-4 0v2Z"/></svg>',
    bowl: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#FFC20E" d="M3 11h18a9 9 0 0 1-18 0Zm4-6c0 1.5 1.5 1.5 1.5 3S7 9.5 7 9.5M11 4c0 1.5 1.5 1.5 1.5 3S11 8.5 11 8.5M15 5c0 1.5 1.5 1.5 1.5 3S15 9.5 15 9.5" stroke="#FFC20E" stroke-width="1.4" stroke-linecap="round"/></svg>'
  };

  /* ---------- phones ---------- */
  function statusBar(t) { return `<div class="status"><span>${t === null || t === undefined ? '12:00' : clock(t)}</span><i></i><span>5G ▮▮▮</span></div>`; }

  function riderPhone(r, time, label) {
    if (!r) return '';
    let body = '';
    if (r.kind === 'idle') {
      body = `<div class="empty"><div><div class="radar"></div><strong>${esc(r.msg)}</strong><br><span>No delivery time has been sent to you.</span></div></div>`;
    } else if (r.kind === 'offer') {
      body = `<div class="card offer"><div class="tagline"><span class="new">New order</span><span class="shield">${ICON.shield}Checked by RTPL</span></div>
        <h3>${esc(r.id)} · ${r.km} km</h3>
        <div style="font-size:.72rem;color:var(--muted)">Deliver by</div><div class="bigtime">${clock(r.deadline)}</div>
        <ol class="stops"><li><b>P</b><span>${esc(r.pickup)}</span></li><li class="drop"><b>D</b><span>${esc(r.drop)}</span></li></ol></div>
        <div class="card"><p>Checked: you can make this at the legal speed, including lights, waiting for food, the building and hand-over.</p></div>
        <button class="btn-y pulse" data-act="next">Accept order</button>`;
    } else if (r.kind === 'trip') {
      const stageText = {pickup: 'Collecting at Noodle Kitchen', delivering: 'Delivering', delivered: 'Delivered'}[r.stage] || '';
      const rows = r.orders.map(o => `<div class="order-row"><div><span class="id">${esc(o.id)}</span><br><span style="font-size:.7rem;color:var(--muted)">${o.completed !== undefined ? 'Completed ' + clock(o.completed) : 'Protected deadline'}</span></div>
        <div class="due">${o.prev !== undefined ? `<span class="was">${clock(o.prev)}</span>` : ''}<strong class="${o.prev !== undefined ? 'flash' : ''}">${clock(o.deadline)}</strong>${o.completed !== undefined ? (o.completed > o.deadline ? (o.completed - o.deadline) + ' min after deadline' : 'on time') : 'due'}</div></div>`).join('');
      body = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">${stageText}</h3><span class="shield">${ICON.shield}Protected</span></div>${rows}</div>${miniMap(r.track || defaultTrack(r.stage))}`;
      if (r.stage === 'delivered') body += `<div class="card"><p><span class="dots3"><span></span><span></span><span></span></span> Checking what caused any delay…</p></div>`;
      else body += `<div class="card"><p>If the road changes, you get more time. Once accepted, your time never moves earlier.</p></div>`;
    } else if (r.kind === 'result') {
      const eff = Object.entries(r.effects).map(([k, v]) => `<div class="chip ${chipClass(v)}">${esc(k)}<small>${esc(label4(v))}</small></div>`).join('');
      let appeal = '';
      if (r.appeal === 'available') appeal = `<button class="btn-y pulse" data-act="appeal">Request human review</button>`;
      else if (r.appeal === 'pending') appeal = `<div class="card" style="background:var(--suspend-soft)"><h3 style="color:var(--suspend)">Under human review</h3><p>All four effects are paused until an authorised reviewer decides.</p></div>`;
      else if (r.appeal === 'done') appeal = `<div class="card" style="background:var(--protect-soft)"><h3 style="color:var(--protect)">Review complete: reversed</h3><p>“${esc(r.reviewReason || S.REVIEW_REASON)}”</p></div>`;
      else if (r.appeal === 'upheld') appeal = `<div class="card" style="background:var(--eligible-soft)"><h3 style="color:var(--eligible)">Review complete: upheld</h3><p>“${esc(r.reviewReason)}”</p></div>`;
      const ok = r.protected || r.appeal === 'done';
      body = `<div class="verdict ${ok ? 'ok' : 'warn'}"><h3>${r.appeal === 'done' ? 'You’re protected' : esc(r.headline)}</h3><p>${esc(r.appeal === 'done' ? 'An authorised reviewer reversed the assessment. Nothing applies to your score, rating, bonus or future orders.' : r.message)}</p></div>
        <div class="trio"><div><b>${r.stats.late}</b>min late</div><div><b>${r.stats.credit}</b>new credit</div><div><b>${r.stats.residual}</b>unexplained</div></div>
        ${appeal}<div class="effects">${eff}</div>`;
    }
    return `<div class="phone rider" data-role="rider"><div class="screen">${statusBar(time)}
      <div class="app-head"><div><h2>Rider app</h2><small>${esc(label || 'Synthetic rider · order A101')}</small></div><span class="online">Online</span></div>
      ${r.banner ? `<div class="banner ${r.banner.tone === 'ok' ? 'ok' : ''}"><div><b>${r.banner.tone === 'ok' ? 'Deadline kept' : 'Deadline updated'}</b>${esc(r.banner.text)}</div></div>` : ''}
      <div class="body">${body}</div></div></div>`;
  }

  function defaultTrack(stage) {
    return {pickup: {path: 'mainA', t: 0}, 'Rider at restaurant': {path: 'mainA', t: 0}, delivering: {path: 'mainA', t: .55}, 'On the way': {path: 'mainA', t: .55},
      delivered: {path: 'mainA', t: 1}, 'Rider assigned': {path: 'toRest', t: .3}}[stage] || {path: 'mainA', t: 0, hide: true};
  }
  function miniMap(tr) {
    const p = G.pointAt(tr.path, tr.t), A = G.PLACES.custA, Rs = G.PLACES.rest;
    const streets = ['M-500 90H1500', 'M-500 250H1500', 'M-500 400H1500', 'M-500 500H1500', 'M120 -200V760', 'M330 -200V760', 'M540 -200V760', 'M750 -200V760', 'M900 -200V760'].map(d => `<path d="${d}" stroke="#fff" stroke-width="22"/>`).join('');
    const route = tr.path === 'toRest' ? 'mainA' : tr.path;
    return `<div class="minimap"><svg viewBox="60 50 880 480" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect x="-500" y="-200" width="2000" height="960" fill="#DEE4E8"/>
      <rect x="343" y="263" width="184" height="124" fill="#CFE5CB"/><rect x="553" y="103" width="184" height="134" fill="#CFE5CB"/>${streets}
      <path d="${G.toD(route)}" fill="none" stroke="#1F262D" stroke-width="20" stroke-linejoin="round"/><path d="${G.toD(route)}" fill="none" stroke="#FFC20E" stroke-width="12" stroke-linejoin="round"/>
      <rect x="${Rs.x - 22}" y="${Rs.y - 22}" width="44" height="44" rx="10" fill="#1F262D"/><circle cx="${A.x}" cy="${A.y}" r="22" fill="#fff" stroke="#1F262D" stroke-width="6"/>
      ${tr.hide ? '' : `<circle cx="${p[0]}" cy="${p[1]}" r="26" fill="#FFC20E" stroke="#1F262D" stroke-width="7"/>`}</svg><span>${tr.hide ? 'Rider not assigned yet' : 'Live position · synthetic'}</span></div>`;
  }

  const chipClass = v => v === 'ASSESSMENT ELIGIBLE' ? 'ELIGIBLE' : v;
  const label4 = v => v === 'ASSESSMENT ELIGIBLE' ? 'Eligible, not applied' : v === 'SUSPENDED' ? 'Paused' : 'Protected';

  function customerPhone(c, time) {
    if (!c) return '';
    let body = `<div class="rest-hero"><div class="logo">${ICON.bowl}</div><div><strong>${esc(c.restaurant)}</strong><small>${esc(S.ITEMS)}</small></div></div>`;
    if (c.kind === 'confirming') {
      body += `<div class="card"><h3>Confirming your delivery time <span class="dots3"><span></span><span></span><span></span></span></h3><p>A time appears here once it has been checked. No guessed time is shown.</p></div>`;
    } else if (c.kind === 'eta') {
      const idx = {'Preparing': 0, 'Rider assigned': 1, 'Rider at restaurant': 1, 'On the way': 2}[c.status] || 0;
      const steps = ['Preparing', 'Rider', 'On the way', 'Delivered'].map((s, i) => `<span class="${i < idx ? 'on' : i === idx ? 'on now' : ''}">${s}</span>`).join('');
      body += `<div class="card eta-card"><div style="font-size:.72rem;color:#B9C2CB">Arrives by</div><div class="bigtime">${clock(c.eta)}</div><p style="font-size:.78rem;margin-top:.3rem">${esc(c.status)}</p></div>
        <div class="card"><div class="steps">${steps}</div></div>${miniMap(c.track || defaultTrack(c.status))}`;
    } else if (c.kind === 'delivered') {
      body += `<div class="card eta-card"><div style="font-size:.72rem;color:#B9C2CB">Delivered</div><div class="bigtime">${clock(c.at)}</div><p style="font-size:.78rem;margin-top:.3rem">Enjoy your meal.</p></div>
        <div class="card"><div class="steps">${['Preparing', 'Rider', 'On the way', 'Delivered'].map(s => `<span class="on">${s}</span>`).join('')}</div></div>${miniMap({path: 'mainA', t: 1})}
        <div class="card"><h3>How was your order?</h3><p style="font-size:1.3rem;letter-spacing:.2rem;color:#D5DADF">★★★★★</p></div>`;
    }
    body += `<p class="privacy">${ICON.shield.replace('<svg', '<svg width="12" height="12"')}<span>Only the delivery time and status are shared here. Rider evidence, assessments and appeals stay private.</span></p>`;
    return `<div class="phone cust" data-role="customer"><div class="screen">${statusBar(time)}
      <div class="app-head"><div><h2>Your order</h2><small>Customer app</small></div><span style="font-size:.7rem;font-weight:700">A101</span></div>
      ${c.banner ? `<div class="banner"><div><b>Arrival time updated</b>${esc(c.banner)}</div></div>` : ''}
      <div class="body">${body}</div></div></div>`;
  }

  /* ---------- map ---------- */
  const XS = [-300, -90, 120, 330, 540, 750, 900, 1110, 1320];
  const YS = [-240, -60, 90, 250, 400, 500, 660, 820];
  function cityBase() {
    let s = '';
    for (let i = 0; i < XS.length - 1; i++) for (let j = 0; j < YS.length - 1; j++) {
      const x0 = XS[i] + 13, x1 = XS[i + 1] - 13, y0 = YS[j] + 13, y1 = YS[j + 1] - 13;
      if (YS[j] === 500) continue; // canal row
      const park = (XS[i] === 330 && YS[j] === 250) || (XS[i] === 540 && YS[j] === 90);
      s += `<rect class="${park ? 'm-park' : 'm-block'}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="10"/>`;
      if (!park && x1 - x0 > 120 && y1 - y0 > 90) s += `<rect fill="#D5DCE1" x="${x0 + 14}" y="${y0 + 14}" width="${(x1 - x0) / 2 - 20}" height="${(y1 - y0) / 2 - 16}" rx="5"/>`;
    }
    s += '<rect class="m-water" x="-400" y="528" width="1900" height="120"/>';
    s += '<text class="m-label" x="380" y="320">Riverside Park</text><text class="m-label" x="590" y="160">Riverside Park</text><text class="m-label" x="40" y="595" fill="#6F93B5">Canal</text>';
    const lines = ['M-400 90 H1500', 'M-400 250 H1500', 'M-400 400 H1500', 'M-400 500 H1500', ...XS.slice(1, -1).map(x => `M${x} -300 V${x === 120 || x === 330 || x === 540 || x === 750 || x === 900 ? 860 : 500}`)];
    s += lines.map(d => `<path class="m-casing" d="${d}"/>`).join('') + lines.map(d => `<path class="m-street" d="${d}"/>`).join('');
    s += G.STREETS.filter(x => x.name).map(x => `<text class="m-label" x="${x.at[0]}" y="${x.at[1] + 4}">${x.name}</text>`).join('');
    return s;
  }

  function routeSvg(r, isNew) {
    const d = G.toD(r.path), len = Math.ceil(G.pathLength(r.path));
    const draw = isNew ? ` r-draw" style="--len:${len}` : '';
    if (r.style === 'active') return `<path class="r-active-o${draw}" d="${d}"/><path class="r-active${draw}" d="${d}"/>`;
    return `<path class="r-${r.style}${r.style === 'faster' ? '' : draw}" d="${d}"/>`;
  }

  function pin(kind) {
    const p = G.PLACES[kind];
    if (kind === 'rest') return `<g transform="translate(${p.x} ${p.y})"><rect x="-19" y="-19" width="38" height="38" rx="10" fill="#1F262D"/><g transform="translate(-11 -11)">${ICON.bowl}</g>
      <g transform="translate(-58 -52)"><rect width="116" height="24" rx="12" fill="#fff" stroke="#1F262D" stroke-width="1.5"/><text class="m-pin-label" x="58" y="16.5" text-anchor="middle">Noodle Kitchen</text></g></g>`;
    if (kind === 'hub') return '';
    const lab = kind === 'custA' ? 'A101 · Maple Court' : 'B102 · Canal Side', w = 16 + lab.length * 7;
    return `<g transform="translate(${p.x} ${p.y})"><circle r="19" fill="#fff" stroke="#1F262D" stroke-width="3"/><path d="M-9 1 0 -8 9 1M-6 -1v9h12v-9" fill="none" stroke="#1F262D" stroke-width="2.6" stroke-linejoin="round"/>
      <g transform="translate(${kind === 'custA' ? -w + 22 : -w / 2} 24)"><rect width="${w}" height="22" rx="11" fill="#1F262D"/><text x="${w / 2}" y="15.5" text-anchor="middle" fill="#fff" font-size="12.5" font-weight="700" font-family="Bricolage, sans-serif">${lab}</text></g></g>`;
  }

  function bubble(x, y, text, color, dx, dy, icon) {
    const w = 12 + text.length * 7.4;
    return `<g transform="translate(${x} ${y})"><g class="m-marker m-pop"><circle r="11" fill="${color}" stroke="#fff" stroke-width="3"/>${icon || ''}
      <g transform="translate(${dx} ${dy})"><rect width="${w}" height="26" rx="8" fill="${color}"/><text x="${w / 2}" y="17.5" text-anchor="middle" fill="#fff">${esc(text)}</text></g></g></g>`;
  }

  function marker(m) {
    if (m === 'closure') { const p = G.MARKERS.closure; return `<g transform="translate(${p.x} ${p.y})"><g class="m-marker m-pop"><rect x="-26" y="-11" width="52" height="22" rx="4" fill="#fff" stroke="#E2552F" stroke-width="2"/>${[0, 1, 2, 3].map(i => `<path d="M${-22 + i * 12} 9 l8 -18" stroke="#E2552F" stroke-width="4"/>`).join('')}
      <g transform="translate(-90 -48)"><rect width="180" height="26" rx="8" fill="#E2552F"/><text x="90" y="17.5" text-anchor="middle" fill="#fff">Road closed · verified 12:20</text></g></g></g>`; }
    if (m === 'kitchen') return bubble(G.PLACES.rest.x, G.PLACES.rest.y + 2, 'Kitchen 12:34–12:44 · verified', '#2C6BD6', 22, 10);
    if (m === 'handoff') return bubble(G.PLACES.rest.x, G.PLACES.rest.y + 2, 'Hand-off 12:38–12:44 · verified', '#2C6BD6', 22, 10);
    if (m === 'traffic') { const p = G.MARKERS.traffic; return bubble(p.x, p.y, 'Traffic 12:34–12:41 · verified', '#2C6BD6', -110, -46); }
    if (m === 'flood') { const p = G.MARKERS.flood; return bubble(p.x, p.y, 'Flooded underpass', '#E2552F', 16, -14); }
    return '';
  }

  function mapHtml(m, time, prevRoutes) {
    const prevKeys = new Set((prevRoutes || []).map(r => r.path + ':' + r.style));
    const routes = (m.routes || []).map(r => routeSvg(r, !prevKeys.has(r.path + ':' + r.style))).join('');
    const tags = (m.tags || []).map(t => { const w = 16 + t.text.length * 7.2; return `<g transform="translate(${t.at[0] - w / 2} ${t.at[1] - 44})"><g class="m-tag m-pop"><rect width="${w}" height="26" rx="8"/><text x="${w / 2}" y="17.5" text-anchor="middle">${esc(t.text)}</text></g></g>`; }).join('');
    return `<div class="mapbox"><svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Synthetic delivery map">
      <g>${cityBase()}</g><g>${routes}</g><g>${(m.pins || []).map(pin).join('')}</g><g>${(m.markers || []).map(marker).join('')}</g>${tags}
      <g id="rider"><circle class="m-ring" r="20"/><circle r="19" fill="#FFC20E" stroke="#1F262D" stroke-width="3.5"/>
        <path d="M-9 4a3.6 3.6 0 1 0 0.01 0M9 4a3.6 3.6 0 1 0 0.01 0M-9 4h7l4-8h5l2 8M-2 -4h-6" fill="none" stroke="#1F262D" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="-11" y="-14" width="10" height="8" rx="1.5" fill="#1F262D"/></g>
      ${m.stale ? '<rect x="-400" y="-300" width="1900" height="1200" fill="#9AA6B1" opacity=".28"/>' : ''}
      </svg>
      <div class="clockchip"><b id="mapclock">${time === null ? '—' : clock(time)}</b><small>simulation time</small></div>
      ${m.stale ? '<div class="staleflag">Route and service data out of date</div>' : ''}
      <div class="maplegend"><span><i style="background:#FFC20E;outline:2px solid #1F262D"></i>Protected route</span><span><i style="background:#0D7A64"></i>Safe or faster option</span><span><i style="background:#2C6BD6"></i>Verified outside delay</span><span><i style="background:#E2552F"></i>Blocked</span></div>
      <div class="mapnote">Synthetic map · no GPS or routing service</div>${m.speedo ? `<div class="map-speedo">${speedo(m.speedo)}</div>` : ''}</div>`;
  }

  // A speedometer: green up to the legal limit, red beyond it. The needle sweeps in.
  function speedo(sp) {
    const max = 140, ang = v => -120 + 240 * Math.min(v, max) / max;
    const pt = (a, r) => [100 + r * Math.sin(a * Math.PI / 180), 100 - r * Math.cos(a * Math.PI / 180)];
    const arc = (a0, a1, r) => { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    let ticks = '';
    for (let v = 0; v <= max; v += 20) {
      const [x0, y0] = pt(ang(v), 70), [x1, y1] = pt(ang(v), 62), [tx, ty] = pt(ang(v), 50);
      ticks += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="#8995A1" stroke-width="2"/><text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}" text-anchor="middle">${v}</text>`;
    }
    const over = sp.kmh > sp.limit;
    return `<div class="speedo ${over ? 'over' : 'ok'}"><svg viewBox="0 0 200 150" aria-hidden="true">
      <path d="${arc(-120, ang(sp.limit), 80)}" fill="none" stroke="#0D7A64" stroke-width="12" stroke-linecap="round"/>
      <path d="${arc(ang(sp.limit) + 3, 120, 80)}" fill="none" stroke="#E2552F" stroke-width="12" stroke-linecap="round" opacity=".85"/>${ticks}
      <g class="needle" style="--a:${ang(sp.kmh).toFixed(1)}deg"><path d="M100 104L96 100L100 26L104 100Z" fill="#1F262D"/></g><circle cx="100" cy="100" r="8" fill="#1F262D"/>
      </svg><b>${sp.kmh} km/h</b><small>${esc(sp.label)}${over ? ` · legal ${sp.limit}` : ''}</small></div>`;
  }

  /* ---------- engine ---------- */
  function trace(lines, title) {
    return `<div class="trace"><h3>${esc(title || 'How RTPL decided · live pseudocode')}</h3><ol>${lines.map(l => `<li class="${l.state}"><span class="rule">${l.rule}</span><code>${esc(l.code)}</code><span class="val">${esc(l.value)}</span></li>`).join('')}</ol>
      <p class="src">Values come from this run of <code>rtpl-core.js</code>. Highlighted lines decided the result.</p></div>`;
  }

  const SEG_NAMES = ['Ride', 'Lights', 'Food wait', 'Building', 'Handover'];
  function engineDeadline(e) {
    const p = e.parts, res = e.res, scale = Math.max(40, Math.ceil(((p ? p.total : 0) + 4) / 10) * 10, e.proposed + 6);
    const pc = v => (v / scale * 100).toFixed(2);
    let x = 0;
    const segs = p ? SEG_NAMES.map((n, i) => [n, [p.travel, p.signals, p.wait, p.access, p.handover][i]]).map(([n, v], i) => {
      const left = x; x += v;
      return `<div class="seg p${i}" data-w="${pc(v)}" style="left:${pc(left)}%;width:0"><span><em>${n} </em>${Math.round(v * 10) / 10}</span></div>`;
    }).join('') : `<div style="position:absolute;left:.6rem;top:50%;transform:translateY(-50%);font-size:.74rem;color:#8995A1;font-style:italic">${res && res.status === 'HOLD' ? 'Not calculated: inputs are stale' : 'Not checked yet'}</div>`;
    const gap = p && res.floor > e.proposed ? `<div class="gap-mark" style="left:${pc(e.proposed)}%;width:${pc(res.floor - e.proposed)}%">${res.floor - e.proposed} min short</div>` : '';
    let ticks = '';
    for (let m = 0; m <= scale; m += 10) ticks += `<span style="left:${pc(m)}%">${clock(m)}</span>`;
    let pub;
    if (!res) pub = `<span class="t none">—</span><p><b>Nothing sent yet.</b> No one sees a time until it is checked.</p>`;
    else if (res.status === 'HOLD') pub = `<span class="t hold">HOLD</span><p><b>Dispatch held for review.</b> No unchecked deadline published.</p>`;
    else pub = `<span class="t">${clock(res.deadline)}</span><p><b>Sent to the rider and the customer.</b><br>The longer of AI ${e.proposed} and real trip ${res.floor} = ${res.deadline} min</p>${e.locked ? `<span class="lock">${ICON.lock}Accepted · only later</span>` : ''}`;
    return `<div class="engine"><div class="calc"><div class="e-head"><span class="title">Check 1 · order A101</span><h3>${e.stale ? 'Map data: out of date' : 'Map data: up to date'}</h3></div>
      <div class="bars"><div class="lbl"><b>AI says</b>simulated</div><div class="track"><div class="seg ai" data-w="${pc(e.proposed)}" style="left:0;width:0"><span>${e.proposed} min → ${clock(e.proposed)}</span></div>${gap}</div>
      <div class="lbl"><b>Real trip</b>legal speed + stops</div><div class="track">${segs}</div>
      <div></div><div class="axis">${ticks}</div></div>
      ${p ? `<div class="formula">Ride ${Math.round(p.travel * 10) / 10} + Lights ${p.signals} + Food wait ${p.wait} + Building ${p.access} + Handover ${p.handover} = <b>${p.total} min</b></div>` : ''}
      <div class="publish">${pub}</div></div>${trace(e.trace)}</div>`;
  }

  function engineBundle(e) {
    const rows = e.rows.map(r => `<tr><td class="id">${r.id}</td><td><span class="tm">${clock(r.accepted)}</span></td>
      <td>${r.closure === null ? '<span class="pending">—</span>' : `<span class="tm">${clock(r.closure)}</span><span class="badge later">later</span>`}</td>
      <td>${r.faster === null ? '<span class="pending">—</span>' : `<span class="tm">${clock(r.faster)}</span><span class="badge kept">kept</span><span class="strike">new estimate <s>${clock(r.overwrite)}</s></span>`}</td></tr>`).join('');
    return `<div class="engine"><div class="calc"><div class="e-head"><span class="title">Both orders on the trip are checked again</span><h3>${clock(S.ROUTE_NOW)}</h3></div>
      <table class="otable"><thead><tr><th>Order</th><th>Promised</th><th>Road closed</th><th>Shortcut opens</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="publish" style="margin-top:auto"><p>${e.stage === 0 ? '<b>Both times are promised.</b> The rider and both customers can see them.' : e.stage === 1 ? '<b>Longer route, more time.</b> Both orders are updated together.' : '<b>Shorter route, same time.</b> A promised time never moves earlier.'}</p></div></div>
      ${trace(e.trace)}</div>`;
  }

  function rulerHtml(R) {
    const pc = m => ((m - R.start) / (R.end - R.start) * 100).toFixed(2);
    const rows = R.rows.map(r => `<div class="row"><span class="lbl">${esc(r.label)}</span><div class="lane">${r.segs.map((g, i) => `<span class="rs ${g.cls}" style="left:${pc(g.from)}%;width:${pc(g.to) - pc(g.from)}%;animation-delay:${i * .12}s">${esc(g.text || '')}</span>`).join('')}${!r.segs.length && r.empty ? `<span class="empty-l">${esc(r.empty)}</span>` : ''}</div></div>`).join('');
    const pins = R.pins.map(p => `<span class="${p.cls}" style="left:${pc(p.at)}%">${esc(p.label)}</span>`).join('');
    const vl = R.pins.map(p => `<i style="left:calc(6.5rem + (100% - 6.5rem) * ${pc(p.at) / 100})"></i>`).join('');
    let ticks = '';
    const range = R.end - R.start, step = range > 30 ? 10 : range > 14 ? 4 : 2;
    for (let m = Math.ceil(R.start / step) * step; m <= R.end; m += step) ticks += `<span style="left:${pc(m)}%">${clock(m)}</span>`;
    return `<div class="rulerwrap"><div class="pins">${pins}</div><div class="ruler">${rows}</div><div class="vlines">${vl}</div><div class="ticks">${ticks}</div></div>`;
  }

  function engineCredit(e, title) {
    const d = e.decision;
    const verdict = !d ? '<span class="verdict-line wait">Not checked yet</span>' : d.protected ? `<span class="verdict-line ok">${ICON.shield.replace('<svg', '<svg width="14" height="14"')}Rider protected · ${d.policy}</span>` : `<span class="verdict-line warn">Assessment can proceed · ${d.policy}</span>`;
    const stats = d ? `<div class="stats"><div class="stat"><b>${d.late}</b><span>min late</span></div><div class="stat ${d.credit === 0 ? 'zero' : ''}"><b>${d.credit}</b><span>new credit</span></div><div class="stat"><b>${d.residual}</b><span>unexplained</span></div></div>` : '<div class="stats"><div class="stat"><b>–</b><span>press → to check</span></div></div>';
    const cmp = e.compare ? `<div class="cmp"><div class="simple"><h4>A simpler rule</h4>${esc(e.compare.simple)}</div><div class="rt"><h4>RTPL</h4>${esc(e.compare.rtpl)}</div></div>` : '';
    return `<div class="engine"><div class="calc"><div class="e-head"><span class="title">${esc(title || 'Delay check · case ' + e.caseNum)}</span>${verdict}</div>
      ${rulerHtml(e.ruler)}<div class="credit-foot">${stats}${cmp}</div></div>${trace(e.trace)}</div>`;
  }

  function engine(e) {
    if (!e) return '';
    if (e.kind === 'deadline') return engineDeadline(e);
    if (e.kind === 'bundle') return engineBundle(e);
    if (e.kind === 'credit') return engineCredit(e);
    return '';
  }

  /* ---------- the hand-held customer phone (slides 2 and 5) ---------- */
  const money = n => '$' + n.toFixed(2);
  const AI = {
    search: '<svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m10.4 10.4 3.4 3.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true"><path d="m3.5 8.4 3 3 6-6.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bowl: '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path fill="#FFC20E" d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M7 5c0 1.5 1.5 1.5 1.5 3S7 9.5 7 9.5M11 4c0 1.5 1.5 1.5 1.5 3S11 8.5 11 8.5M15 5c0 1.5 1.5 1.5 1.5 3S15 9.5 15 9.5" fill="none" stroke="#FFC20E" stroke-width="1.4" stroke-linecap="round"/></svg>'
  };
  const MENU = [
    {key: 'soup', name: 'Beef noodle soup', desc: 'Braised beef, hand-pulled noodles', price: 14.5},
    {key: null, name: 'Spicy wonton noodles', desc: 'Pork wontons, chilli oil', price: 13},
    {key: 'tea', name: 'Iced lemon tea', desc: 'Fresh lemon, less sugar', price: 4.5}
  ];
  const STATUS = [['Payment successful', 0], ['Finding a rider…', 0], ['Noodle Kitchen accepted your order', 1], ['Rider heading to Noodle Kitchen', 2]];

  // One screen of the invented customer app. name: home | menu | checkout | paying | paid | status
  function apScreen(name, h, arg) {
    const o = h.order, sub = o.items.reduce((a, [, q, p]) => a + q * p, 0);
    let time = 0, body = '';
    if (name === 'home') {
      body = `<div class="ap-top"><small>Deliver to</small><b>${esc(o.drop)} ▾</b></div>
        <div class="ap-search">${AI.search}<span>Noodles, dumplings, tea…</span></div>
        <div class="ap-chips"><span class="on">Noodles</span><span>Dumplings</span><span>Drinks</span></div>
        <h4 class="ap-h">Near you</h4>
        <div class="ap-rest" data-tap="rest"><div class="ap-img a">${AI.bowl}</div><div><b>${esc(o.restaurant)}</b><small>★ 4.7 · ${o.km}.0 km · Noodles</small></div></div>
        <div class="ap-rest"><div class="ap-img b"></div><div><b>Dumpling House</b><small>★ 4.5 · 2.1 km · Dumplings</small></div></div>
        <div class="ap-rest"><div class="ap-img c"></div><div><b>Green Bowl</b><small>★ 4.6 · 3.3 km · Salads</small></div></div>`;
    } else if (name === 'menu') {
      const q = arg || {soup: 0, tea: 0}, n = q.soup + q.tea;
      const total = MENU.reduce((a, m) => a + (m.key ? q[m.key] * m.price : 0), 0);
      body = `<div class="ap-mhead"><span class="ap-back">‹</span><div><b>${esc(o.restaurant)}</b><small>★ 4.7 · ${o.km}.0 km away</small></div></div>
        ${MENU.map(m => `<div class="ap-item"><div class="ap-thumb ${m.key || 'x'}"></div><div class="ap-it"><b>${m.name}</b><small>${m.desc}</small><span>${money(m.price)}</span></div>
          <span class="ap-add ${m.key && q[m.key] ? 'on' : ''}" ${m.key ? `data-tap="add-${m.key}"` : ''}>${m.key && q[m.key] ? q[m.key] : '+'}</span></div>`).join('')}
        ${n ? `<div class="ap-cart" data-tap="cart"><span class="n">${n}</span><b>View cart</b><span>${money(total)}</span></div>` : ''}`;
    } else if (name === 'checkout') {
      body = `<div class="ap-mhead"><span class="ap-back">‹</span><div><b>Checkout</b><small>${esc(o.restaurant)}</small></div></div>
        <div class="ap-box"><small>Deliver to</small><b>${esc(o.drop)}</b><span>${esc(o.unit)}</span></div>
        <div class="ap-box ap-lines">${o.items.map(([n, q, p]) => `<p><span>${q} × ${esc(n)}</span><span>${money(q * p)}</span></p>`).join('')}
          <p class="mut"><span>Delivery fee</span><span>${money(o.fee)}</span></p><p class="tot"><span>Total</span><span>${money(sub + o.fee)}</span></p></div>
        <div class="ap-box"><small>Pay with</small><b>Saved card</b></div>
        <div class="ap-pay" data-tap="pay">Pay ${money(sub + o.fee)}</div>`;
    } else if (name === 'paying') {
      body = `<div class="ap-center"><div class="ap-spin"></div><b>Paying…</b></div>`;
    } else if (name === 'paid') {
      body = `<div class="ap-center"><div class="ap-ok">${AI.check}</div><b>Order placed</b><span>Order ${esc(o.id)} · ${clock(0)}</span></div>
        <div class="ap-box ap-ticket" id="ap-ticket"><small>${esc(o.restaurant)} → ${esc(o.drop)}</small>${o.items.map(([n, q]) => `<b>${q} × ${esc(n)}</b>`).join('')}</div>
        <p class="ap-note">Sending to the restaurant and the delivery platform…</p>`;
    } else if (name === 'status') {
      const n = arg === undefined ? STATUS.length : arg, done = n >= STATUS.length, ai = h.variant === 'ai';
      time = n ? STATUS[n - 1][1] : 0;
      body = `<div class="ap-mhead"><div><b>Order ${esc(o.id)}</b><small>${esc(o.restaurant)} → ${esc(o.drop)}</small></div></div>
        <div class="ap-eta ${done ? 'on' : ''} ${ai ? 'ai' : ''}"><small>${done ? 'Arrives by' : 'Arrival time'}</small><b>${done ? clock(h.deadline) : 'Confirming…'}</b>${done ? (ai ? '<span>AI estimate · not checked</span>' : `<span>${AI.check} Time checked</span>`) : ''}</div>
        <ol class="ap-steps">${STATUS.slice(0, n).map(([t, m], i) => `<li class="${i === n - 1 ? 'now' : ''}"><i>${AI.check}</i><span>${t}</span><small>${clock(m)}</small></li>`).join('')}</ol>
        <div class="ap-box"><small>Your order</small>${o.items.map(([nm, q]) => `<b>${q} × ${esc(nm)}</b>`).join('')}</div>`;
    }
    return `<div class="ap-status"><span>${clock(time)}</span><i></i><span>5G ▮▮▮</span></div><div class="ap-bar"><b>Lantern Eats</b><small>invented demo app</small></div><div class="ap-body">${body}</div>`;
  }

  // Hands from "Dotted background with hands using a mobile phone", designed by Freepik
  // (https://www.freepik.com/free-vector/dotted-background-with-hands-using-mobile-phone_1072215.htm),
  // free licence with attribution: credited in the label beside the hands. The shapes are unchanged; the left hand is
  // split into what sits behind the phone and what wraps over it, and placed on this phone: 10% larger and
  // centred on its bottom edge, so the thumb rests on the frame and the fingertips only just reach the screen.
  // Artwork phone: centre x 400, bottom 520. This phone: centre x 160, bottom 480 (1 artwork unit = 1 unit here).
  const HANDS_CREDIT = 'https://www.freepik.com/free-vector/dotted-background-with-hands-using-mobile-phone_1072215.htm';
  const ART_LEFT = 'translate(164 480) scale(1.1) translate(-400 -520)';
  const PALM = `<svg class="hp-palm" viewBox="0 0 320 640" aria-hidden="true"><g transform="${ART_LEFT}"><path style="fill:#FDD2A2;" d="M523.802,291.216v162.98c-16.85,63.248-73.953,90.275-151.06,98.7s-94.202,47.742-94.202,47.742 l-83.314-97.356c33.7-21.765,36.516-50.36,35.817-63.297L523.802,291.216z" /><polygon style="fill:#F1F1F2;" points="179.738,482.859 295.567,618.982 269.605,643.321 153.995,505.244 " /><polygon style="fill:#333333;" points="142.294,487.926 -105.701,685.576 -52.09,757.173 199.945,556.881 " /><polygon style="fill:#292929;" points="285.519,659.234 199.945,556.881 -52.09,757.173 25.28,860.499 " /><circle style="fill:#FFE96E;" cx="135.741" cy="556.881" r="16.232" /></g></svg>`;
  const GRIP = `<svg class="hp-grip" viewBox="0 0 320 640" aria-hidden="true"><g transform="${ART_LEFT}"><path style="opacity:0.29;fill:#231F20;" d="M310.794,384.883c0-49.216-6.085-54.224-11.633-72.01 c-5.548-17.786-1.005-35.104-0.069-55.34c0.936-20.236-7.973-33.902-7.973-33.902v250.826 C301.454,455.573,310.794,428.852,310.794,384.883z" /><path style="opacity:0.29;fill:#231F20;" d="M509.065,466.959V257.676c-4.645,0.271-9.216,2.229-13.267,5.92 c-10.982,10.007-25.316,23.044-13.935,40.204c3.971,5.987,8.697,8.889,13.741,9.873c-0.418,0.329-0.834,0.666-1.247,1.016 c-14.773,12.522-34.054,28.838-22.673,45.999c6.117,9.224,15.457,10.187,25.471,7.753 c-13.341,11.702-26.61,25.978-16.719,40.892c4.607,6.947,11.042,9.209,18.216,8.864c-13,11.398-26.755,25.578-16.491,41.053 C488.744,469.175,498.681,469.784,509.065,466.959z" /><g><path style="fill:#FDD2A2;" d="M291.12,463.833c24.896-90.162,4.596-141.287,1.029-155.433 c-3.567-14.146,3.567-27.043,0-68.232c-3.567-41.189-37.622-45.87-42.302-31.828c-4.681,14.042-3.745,77.229-4.681,94.27 s-6.553,47.083-14.978,64.869c-8.425,17.786,0,65.62,0,65.62l0.856,6.885L291.12,463.833z" /><path style="fill:#FFE8C1;" d="M264.886,233.385c-0.898-18.02-11.063-21.528-15.785-22.183 c-2.408,10.04-2.996,33.528-3.318,53.113c9.927-0.001,19.103-2.317,19.103-7.109 C264.886,251.462,264.886,233.385,264.886,233.385z" /></g><g><path style="fill:#FDD2A2;" d="M528.53,303.454c13.246-6.111,16.47-20.529,6.892-34.971 c-9.578-14.442-24.115-17.082-34.897-7.256c-10.782,9.826-24.857,22.626-13.683,39.475 C498.016,317.551,515.283,309.565,528.53,303.454z" /><path style="fill:#FDD2A2;" d="M527.114,353.621c16.969-8.579,22.945-24.823,13.367-39.265 c-9.578-14.442-26.866-15.257-41.372-2.962c-14.505,12.295-33.436,28.315-22.262,45.164 C488.022,373.407,510.145,362.2,527.114,353.621z" /><path style="fill:#FDD2A2;" d="M535.707,401.383c16.969-8.579,22.945-24.823,13.367-39.265 c-9.578-14.442-26.866-15.257-41.372-2.962c-14.505,12.295-33.436,28.315-22.262,45.164 C496.615,421.169,518.738,409.962,535.707,401.383z" /><path style="fill:#FDD2A2;" d="M535.443,451.693c16.119-8.016,21.466-23.843,11.888-38.285 c-9.578-14.442-26.238-15.673-39.894-3.942c-13.655,11.731-31.477,27.016-20.303,43.865 C498.309,470.18,519.323,459.708,535.443,451.693z" /><path style="fill:#FFE8C1;" d="M493.391,449.428c5.619,8.234,17.943,4.349,25.453-0.776c0,0,4.687-3.857-2.618-14.561 c-7.305-10.704-12.835-8.081-12.835-8.081C495.881,431.134,487.772,441.194,493.391,449.428z" /><path style="fill:#FFE8C1;" d="M491.236,401.012c6.001,8.793,19.162,4.645,27.182-0.829c0,0,5.005-4.12-2.796-15.551 s-13.707-8.63-13.707-8.63C493.895,381.475,485.235,392.219,491.236,401.012z" /><path style="fill:#FFE8C1;" d="M484.064,351.72c6.001,8.793,19.162,4.645,27.182-0.829c0,0,5.006-4.119-2.796-15.55 c-7.801-11.431-13.707-8.631-13.707-8.631C486.724,332.183,478.063,342.927,484.064,351.72z" /><path style="fill:#FFE8C1;" d="M491.236,296.77c6.001,8.793,19.162,4.645,27.182-0.829c0,0,5.005-4.12-2.796-15.551 c-7.801-11.431-13.707-8.631-13.707-8.631C493.895,277.233,485.235,287.977,491.236,296.77z" /></g></g></svg>`;
  // Tapping hand in artwork units. Its index fingertip, (354, 418), is the point main.js aims with:
  // 13.6% across and 2.5% down this box (see FINGER_TIP in main.js and .hp-finger in app.css).
  const FINGER = `<svg viewBox="305 405 360 520" width="100%" height="100%" aria-hidden="true"><g><g><path style="fill:#FDD2A2;" d="M476.8,725.382c0,0-33.879-32.328-48.199-54.863c-14.321-22.534-29.179-75.583-30.08-84.819 c-0.901-9.236-57.587-127.753-62.226-138.937c-4.64-11.183-2.568-28.169,12.525-32.75c15.093-4.581,27.221,8.222,34.182,19.042 s59.9,108.247,59.9,108.247s-3.463-18.804,15.006-25.424c18.468-6.62,26.226,5.988,26.226,5.988s-1.799-13.655,9.57-18.184 c11.369-4.528,19.118-1.555,23.939,3.258c0,0,1.133-10.678,11.064-12.424c9.931-1.746,14.699-0.658,22.103,5.147 c7.404,5.804,23.526,23.023,30.023,33.745c10.416,17.19,30.128,57.781,28.856,81.371c-1.272,23.59-0.051,43.403,1.846,54.873 c1.896,11.47,21.598,55.702,21.598,55.702l-119.739,53.333C513.393,778.688,496.669,731.524,476.8,725.382z" /><path style="fill:#FFE8C1;" d="M350.214,423.772c-9.966,5.257-7.18,19.594-2.385,28.684c0,0,3.732,5.757,16.688-1.077 c12.955-6.834,10.718-13.38,10.718-13.38C370.44,428.909,360.18,418.515,350.214,423.772z" /></g><g><polygon style="fill:#F1F1F2;" points="476.284,755.29 636.03,675.122 653.503,706.124 491.911,785.615 " /><polygon style="fill:#333333;" points="472.309,792.866 605.372,1080.723 687.657,1045.659 552.987,753.251 " /><polygon style="fill:#292929;" points="672.743,694.447 552.987,753.251 687.657,1045.659 806.408,995.056 " /></g><path style="fill:#FDD2A2;" d="M476.8,725.382c0,0-72.149-47.566-104.712-70.393c-22.484-15.762-75.164-46.907-53.821-62.581 c20.729-15.222,47.274-3.088,66.149,13.804c11.018,9.86,28.243,17.778,28.243,17.778L476.8,725.382z" /><path style="fill:#FFE8C1;" d="M313.77,606.034c2.786,8.264,14.308,18.169,26.634,27.206 c14.532-11.213,10.569-17.571,10.569-17.571C327.551,595.703,316.43,603.462,313.77,606.034z" /></g></svg>`;

  function backend(h) {
    const p = h.parts, scale = 40, pc = v => (v / scale * 100).toFixed(2);
    let x = 0;
    const segs = SEG_NAMES.map((n, i) => { const v = [p.travel, p.signals, p.wait, p.access, p.handover][i], left = x; x += v;
      return `<div class="seg p${i}" data-w="${pc(v)}" style="left:${pc(left)}%;width:0"><span><em>${n} </em>${v}</span></div>`; }).join('');
    let ticks = '';
    for (let m = 0; m <= scale; m += 10) ticks += `<span style="left:${pc(m)}%">${m} min</span>`;
    const real = h.stage >= 2 ? `<div class="be-real"><div class="be-grid"><div><h4>What the trip really takes</h4>
        <div class="bars"><div class="lbl"><b>AI time</b></div><div class="track"><div class="seg ai" data-w="${pc(h.ai)}" style="left:0;width:0"><span>${h.ai} min</span></div>
          <div class="gap-mark" style="left:${pc(h.ai)}%;width:${pc(p.total - h.ai)}%">${p.total - h.ai} min short</div></div>
        <div class="lbl"><b>Real trip</b></div><div class="track">${segs}</div><div></div><div class="axis">${ticks}</div></div>
        <p class="be-sum">Ride ${p.travel} + Lights ${p.signals} + Food wait ${p.wait} + Building ${p.access} + Handover ${p.handover} = <b>${p.total} min</b></p></div>
        <div class="be-speed">${speedo({kmh: h.speed.need, limit: h.speed.legal, label: 'Needed to reach ' + clock(h.ai)})}
          <p>Only <b>${h.speed.rideLeft} min</b> left to ride ${h.speed.km} km</p></div></div>
        <div class="be-q">Who makes up the missing ${p.total - h.ai} minutes?</div>
        <small class="be-note">Example numbers for this demo, not measurements.</small></div>` : '';
    return `<div class="be"><div class="be-head"><span class="be-chip">Platform backend</span><h3>AI dispatch</h3><small>simulated</small></div>
      <div class="be-ticket" id="be-ticket"><b>${esc(h.order.id)}</b><span>${esc(h.order.restaurant)} → ${esc(h.order.drop)} · ${h.order.km} km</span><small>ordered ${clock(0)}</small></div>
      <div class="be-ai"><small>AI suggests delivery by</small><b>${clock(h.ai)}</b><span>only ${h.ai} min</span></div>${real}</div>`;
  }

  // Slide 5: the same order on two phones. Left: what the app would show if the AI's time went straight out
  // (no customer sees this with RTPL). Right: the checked time the customer really gets.
  const aiView = h => ({...h, deadline: h.ai, variant: 'ai'});
  function comparePhones(h) {
    const col = (v, label, sub, hh, verdict) => `<figure class="hp2-col ${v}"><figcaption><b>${label}</b><small>${sub}</small></figcaption>
      <div class="hp2-phone"><div class="hp-screen hp2-screen" data-v="${v}">${apScreen('status', hh)}</div></div>
      <p class="hp2-verdict">${verdict}</p></figure>`;
    return `<div class="hp hp2" id="hp">
      ${col('without', 'Without RTPL', 'If the AI’s time went straight to the app', aiView(h), `<b>${clock(h.ai)}</b> needs ${h.speed.need} km/h for ${h.speed.km} km`)}
      <div class="hp2-vs">vs</div>
      ${col('with', 'With RTPL', 'What the customer really sees', h, `<b>${clock(h.deadline)}</b> works at the legal ${h.speed.legal} km/h`)}
      <div class="hp-tag">Invented app, shop and address · the same order A101 on both phones</div></div>`;
  }

  function handPhone(h) {
    if (h.script === 'compare') return comparePhones(h);
    const side = h.script === 'order' && h.stage >= 1;
    const screen = h.script === 'order' ? apScreen('paid', h) : apScreen('status', h);
    return `<div class="hp ${side ? 'with-side' : ''}" id="hp"><div class="hp-cam ${side ? '' : 'mid'}" id="hp-cam"><div class="hp-dev" id="hp-dev">${PALM}
      <div class="hp-phone"><div class="hp-screen" id="hp-screen">${screen}</div></div>${GRIP}<div class="hp-finger" id="hp-finger">${FINGER}</div></div></div>
      ${side ? `<div class="hp-side" id="hp-side">${backend(h)}</div>` : ''}${h.script === 'order' && h.stage === 0 ? guide() : ''}<div class="hp-tag">Invented app, shop and address · Hands <a href="${HANDS_CREDIT}" target="_blank" rel="noopener">designed by Freepik</a></div></div>`;
  }
  const GUIDE = ['Open the app', 'Choose a shop', 'Add the food', 'Pay', 'Order placed'];
  function guide() {
    return `<ol class="hp-guide" id="hp-guide">${GUIDE.map((t, i) => `<li class="on"><b>${i + 1}</b>${t}</li>`).join('')}</ol>`;
  }

  /* ---------- boards ---------- */
  function overview(o) {
    return `<div class="board"><div class="ov" id="ov">
      <div class="ov-node ov-ai" id="ov-ai"><h4>AI dispatch</h4><p>Picks a rider and suggests a time. We leave it as it is.</p><span class="sim">Simulated here</span></div>
      <div class="ov-rtpl" id="ov-rtpl"><header>${ICON.shield.replace('<svg', '<svg width="26" height="26" style="color:#FFC20E"')}<b>RTPL</b><span>Rider Time Protection Layer</span></header>
        <div class="ov-stages">
          <div class="ov-stage"><span class="sl">slides 6–7</span><span class="num">1</span><h5>Before the rider gets a time</h5><p>Is the time actually possible? A promised time never moves earlier.</p><div class="rules"><span>P01</span><span>P02</span></div></div>
          <div class="ov-stage"><span class="sl">slides 8–9</span><span class="num">2</span><h5>After delivery</h5><p>Was it really the rider’s fault? Each delay counts once. No proof, no penalty.</p><div class="rules"><span>P03</span><span>P04</span><span>P05</span></div></div>
          <div class="ov-stage"><span class="sl">slides 10–11</span><span class="num">3</span><h5>If the rider disagrees</h5><p>Penalties pause until a person decides. A short record is kept.</p><div class="rules"><span>P06</span><span>P07</span></div></div>
        </div></div>
      <div class="ov-out"><div class="ov-node" id="ov-rider"><h4>Rider app</h4><p>Gets a checked time. Can appeal.</p></div><div class="ov-node cust" id="ov-cust"><h4>Customer app</h4><p>Gets the same time. Nothing else.</p></div></div>
      <div class="ov-below"><div class="ov-node" id="ov-rev"><h4>Human reviewer</h4><p>Can fix mistakes. Must say why.</p></div><div class="ov-node aud" id="ov-aud"><h4>Auditor</h4><p>Sees the record, not the person.</p></div></div>
      <div class="ov-real"><span><b>Runs for real:</b> the rules and their results.</span><span><b>Simulated:</b> the AI, the evidence labels, reviewer authority.</span></div>
      </div></div>`;
  }

  function miniTimeline(k) {
    const pc = m => ((m - 28) / (50 - 28) * 100).toFixed(1);
    const stay = k === '04' ? `<div class="stay found" style="left:${pc(34)}%;width:${pc(44) - pc(34)}%">Rider stop 12:34–12:44</div>` : `<div class="stay missing" style="left:${pc(34)}%;width:${pc(44) - pc(34)}%">cause ?</div>`;
    return `<div class="minitl"><div class="base"></div><div class="late" style="left:${pc(34)}%;width:${pc(44) - pc(34)}%"></div>${stay}
      <span class="p" style="left:${pc(34)}%">12:34 due</span><span class="p" style="left:${pc(44)}%">12:44 arrived</span></div>`;
  }

  function compare(c) {
    const cards = c.cases.map((k, i) => {
      const d = k.decision, shown = c.reveal > i;
      const eff = Object.entries(d.effects).map(([n, v]) => `<div class="chip ${chipClass(v)}">${esc(n)}<small>${esc(label4(v))}</small></div>`).join('');
      const out = shown ? `<div class="outcome"><div class="vbox ${d.protected ? 'ok' : 'warn'}"><h5>${d.protected ? 'Rider protected' : 'Assessment can proceed'}</h5><p>${d.policy} · ${d.protected ? 'protected automatically, before any appeal' : 'nothing deducted · evidence shown · appeal open'}</p></div>
          <div class="nums"><span><b>${d.late}</b>late</span><span><b>${d.credit}</b>credit</span><span><b>${d.residual}</b>residual</span></div>
          <div class="effects" style="grid-template-columns:repeat(4,1fr)">${eff}</div>
          <div class="lightcmp"><div class="simple"><h6>A simpler rule</h6>${esc(k.compare.simple)}</div><div class="rt"><h6>RTPL</h6>${esc(k.compare.rtpl)}</div></div></div>`
        : `<div class="waiting">Press → to check case ${k.num}</div>`;
      return `<div class="casecard ${shown ? 'shown' : ''}"><header><b>${k.num}</b><h4>${esc(k.title)}</h4></header>${miniTimeline(k.num)}
        <div class="evid ${k.recordTone}"><span class="ico">${k.recordTone === 'found' ? '✓' : '?'}</span><span>${esc(k.record)}</span></div>${out}</div>`;
    }).join('');
    return `<div class="board cmpboard"><div class="cmp-hero"><span><b>Same lateness</b>due 12:34 · arrived 12:44 · 10 min late</span><i>→</i><span><b>Different evidence</b>incomplete record vs reliable record</span><i>→</i><span><b>Different decision</b>${c.reveal >= 2 ? 'protected vs eligible' : c.reveal === 1 ? 'protected vs …' : 'press → to see'}</span></div><div class="cmp2">${cards}</div></div>`;
  }

  const EFFECT_INFO = {
    'Service score': 'Performance score',
    'Customer rating': 'Rating from this order',
    'Bonus': 'On-time bonus pay',
    'Future allocation': 'Priority for future orders'
  };

  function review(r, live) {
    const d = (live && live.decision) || r.decision;
    const fx = Object.entries(d.effects).map(([n, v]) => `<div class="fx-card"><h5>${esc(n)}</h5><p>${esc(EFFECT_INFO[n])}</p><div class="fx-state ${chipClass(v)}">${v === 'ASSESSMENT ELIGIBLE' ? 'ELIGIBLE · not applied' : v}</div></div>`).join('');
    let desk;
    if (r.stage === 0) desk = `<div class="msg info">No appeal yet. The effects are only eligible for assessment; nothing has been applied.</div>
      <p class="sub">Evidence on file: verified stop chosen by the rider, 12:34–12:44 (synthetic). The rider can see it and can ask for a person to review it.</p>`;
    else if (r.stage === 1 && !(live && live.decision && live.decision.appeal.status !== 'PENDING')) {
      const L = live || {};
      desk = `<div class="msg info">Appeal filed ${clock(49)}. Review target ${L.overdue ? '<b>missed</b>: escalated, effects stay suspended.' : 'is 24 h. Effects stay suspended until a decision.'}</div>
        <label><input type="checkbox" id="rv-auth" ${L.authorised === false ? '' : 'checked'}> Reviewer has correction authority (simulated)</label>
        <select id="rv-outcome" aria-label="Decision"><option value="REVERSE" ${L.outcome === 'UPHOLD' ? '' : 'selected'}>Reverse disputed effects</option><option value="UPHOLD" ${L.outcome === 'UPHOLD' ? 'selected' : ''}>Uphold assessment</option></select>
        <textarea id="rv-reason" aria-label="Reason sent to the rider">${esc(L.reason !== undefined ? L.reason : S.REVIEW_REASON)}</textarea>
        <div class="row2"><button class="btn-dark" data-act="decide">Record reasoned decision</button><button class="btn-line" data-act="overdue">Let 24 h pass without a decision</button></div>
        ${L.msg ? `<div class="msg ${L.msgTone || 'err'}">${esc(L.msg)}</div>` : ''}`;
    } else {
      desk = `<div class="msg ok"><b>Decision recorded: ${d.appeal.status}</b> at ${clock(d.appeal.reviewed)}${d.appeal.overdue ? ' (after the review target)' : ''}. Sent to the rider with the reason.</div>
        <p class="sub">“${esc(d.appeal.reason)}”</p>`;
    }
    const tl = [['12:44', 'Delivered, 10 min late', 0], ['12:44', 'Assessment eligible · nothing applied', 0], ['12:49', 'Appeal filed · effects suspended', 1], [d.appeal.reviewed !== undefined ? clock(d.appeal.reviewed) : '—', d.appeal.status === 'UPHOLD' ? 'Upheld with a reason' : 'Reversed with a reason', 2]]
      .map(([t, txt, need]) => `<li class="${r.stage > need || (r.stage === need) ? 'on' : ''} ${r.stage === need ? 'now' : ''}"><b>${t}</b>${txt}</li>`).join('');
    return `<div class="board"><div class="rv"><ol class="atl">${tl}</ol><div class="fx">${fx}</div><div class="rv-low"><div class="desk"><h4>Human review desk <span class="who">Authorised reviewer · simulated</span></h4>${desk}</div>
      <div class="light-trace">${trace(r.trace, 'P06 · appeal and review')}</div></div></div></div>`;
  }

  function jsonHtml(o) {
    const s = JSON.stringify(o, null, 2);
    return esc(s).replace(/&quot;([^&]+)&quot;:/g, '<span class="k">"$1"</span>:').replace(/: &quot;([^&]*)&quot;/g, ': <span class="s">"$1"</span>').replace(/: (true|false)/g, ': <span class="b">$1</span>');
  }

  function audit(a) {
    const rows = [
      ['Protected deadline', 'y', 'y', 'y', 'y'],
      ['Delivery status', 'y', 'y', 'y', 'n'],
      ['Late, credit and residual minutes', 'y', 'n', 'y', 'y'],
      ['Rule and outcome', 'y', 'n', 'y', 'y'],
      ['Evidence behind the decision', 'y', 'n', 'y', 'n'],
      ['Appeal status and four effects', 'y', 'n', 'y', 'y'],
      ['Reviewer’s free-text reason', 'y', 'n', 'y', 'n'],
      ['Identity, GPS trace, raw messages', 'n', 'n', 'n', 'n', true]
    ];
    const mark = v => v === 'y' ? '<span class="y">✓</span>' : '<span class="n">—</span>';
    const right = a.stage >= 1
      ? `<h3>Who sees what</h3><table class="matrix"><thead><tr><th>Field</th><th>Rider app</th><th>Customer app</th><th>Reviewer</th><th>Audit export</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r[5] ? 'never' : ''}" style="animation-delay:${i * .05}s"><td>${r[0]}</td>${r.slice(1, 5).map(v => `<td>${mark(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
         <p class="sub" style="margin-top:.4rem">In this prototype the views are separated in the browser. A real system needs server-side roles, secure logs and retention rules.</p>`
      : `<h3>Never exported</h3><div class="evid missing" style="margin-bottom:.4rem"><span class="ico">✕</span><span>Rider identity and name</span></div><div class="evid missing" style="margin-bottom:.4rem"><span class="ico">✕</span><span>GPS trace and raw location</span></div><div class="evid missing" style="margin-bottom:.4rem"><span class="ico">✕</span><span>Raw evidence and messages</span></div><div class="evid missing"><span class="ico">✕</span><span>The reviewer’s free-text reason</span></div>`;
    return `<div class="board"><div class="au"><div class="au-left"><h3 style="margin:0">Oversight record · case 04</h3><pre class="json" id="audit-json">${jsonHtml(a.record).split('\n').map((l, i) => `<span class="jl" style="animation-delay:${i * 55}ms">${l}</span>`).join('\n')}</pre>
      <div class="row2"><button class="btn-dark" data-act="download">Download audit summary</button><span class="sub">RTPL-synthetic-audit.json</span></div></div><div>${right}</div></div></div>`;
  }

  /* ---------- sandbox ---------- */
  function sandboxForm(v) {
    const n = (k, label) => `<div class="f"><label for="sb-${k}">${label}</label><input type="number" min="0" step="1" id="sb-${k}" data-sb="${k}" value="${v[k]}"></div>`;
    const c = (k, label) => `<label class="ck"><input type="checkbox" data-sb="${k}" ${v[k] ? 'checked' : ''}> ${label}</label>`;
    return `<div class="sb-form"><h4>Dispatch</h4>${n('proposed', 'AI proposed (min)')}${n('distance', 'Distance (km)')}${n('legalSpeed', 'Legal speed (km/h)')}${n('conditionSpeed', 'Speed in conditions')}${n('signals', 'Signals (min)')}${n('wait', 'Restaurant wait')}${n('access', 'Building access')}${n('handover', 'Handover')}${c('fresh', 'Route data is current')}
      <h4>Delivery</h4>${n('arrivalAfter', 'Arrives after deadline (min)')}${n('outside', 'Verified outside delay (min)')}${c('riderCause', 'Reliable rider-cause record')}${c('safeRoute', 'Verified safe legal detour')}${c('complete', 'Cause record complete')}
      <button class="btn-line" data-act="sb-reset">Back to slide values</button></div>`;
  }
  function sandboxOut(out, err) {
    if (err) return `<div class="msg err">${esc(err)}</div>`;
    return engineDeadline(out.engine) + (out.credit ? engineCredit(out.credit, 'Delay check · your inputs') : '<div class="msg info">Dispatch is held, so there is no delivery to check.</div>');
  }

  /* ---------- PPT link: big slide badge, slide-change flash and the handover card ---------- */
  function pptBadge(s) {
    if (!s.slide) return `<small>Q&amp;A extra</small><b>${esc(s.caseNum || '?')}</b><span>not a PPT slide</span>`;
    return `<small>PPT slide</small><b>${s.slide}<i>/${S.PPT_TOTAL}</i></b><span>${esc(s.presenter)}</span>`;
  }
  function pptFlash(s) {
    return `<div class="pf"><small>PPT slide</small><b>${s.slide}</b><span>${esc(s.presenter)} · ${esc(s.short)}</span></div>`;
  }
  // Consecutive PowerPoint-only slides grouped by presenter: [[3, 4, 'Liyuan Liang'], ...]
  function pptRuns(slides) {
    const runs = [];
    slides.forEach(n => {
      const who = S.PPT_OWNER[n], last = runs[runs.length - 1];
      if (last && last[2] === who && last[1] === n - 1) last[1] = n; else runs.push([n, n, who]);
    });
    return runs;
  }
  const first = name => esc(String(name).split(' ')[0]);
  // deckOn: this computer has the PowerPoint slides inside the page, so the PowerPoint box is a real button.
  function gate(from, to, pptOnly, deckOn) {
    const runs = pptRuns(pptOnly);
    const runLines = runs.map(([a, b, who]) => `<span class="g-run"><b>${a === b ? 'Slide ' + a : 'Slides ' + a + '–' + b}</b><span>${esc(who)}</span></span>`).join('');
    const switchTo = !runs.length ? ''
      : deckOn ? `<button type="button" class="g-ppt" data-act="gate-ppt"><small>Now switch to PowerPoint</small>${runLines}
          <span class="g-open">Press <kbd>→</kbd> or click here to show the slides</span></button>`
      : `<div class="g-ppt"><small>Now switch to PowerPoint</small>${runLines}</div>`;
    const handover = to && to.presenter !== from.presenter;
    const nextLine = to
      ? `<div class="g-next"><small>${runs.length ? 'Then the website continues at' : handover ? 'Hand over to' : 'Next on the website'}</small>
          <div class="g-run"><b>PPT slide ${to.slide}</b><span>${esc(to.presenter)} · ${esc(to.short)}</span></div>
          ${deckOn && runs.length
            ? `<p>After slide ${runs[runs.length - 1][1]}, click <b>Back to the website</b> under the slides.</p>`
            : `<p>Press <kbd>→</kbd> only when ${first(to.presenter)} starts slide ${to.slide}.</p>`}</div>`
      : `<div class="g-next end"><small>Website part finished</small><p>Stay in PowerPoint from slide ${from.slide + 1}. The website is only needed again for questions.</p></div>`;
    return `<div class="g">
      <div class="g-top"><span class="g-done">✓</span><div><small>End of PPT slide ${from.slide} on the website</small>
        <h2>${handover || !to ? first(from.presenter) + '’s website part is done' : 'Slide ' + from.slide + ' is done'}</h2></div></div>
      ${switchTo}${nextLine}
      <div class="g-act"><button type="button" data-act="gate-stay">← Stay on slide ${from.slide}</button>${to ? `<button type="button" class="go" data-act="gate-go">Start PPT slide ${to.slide} →</button>` : ''}</div>
    </div>`;
  }

  root.RTPLRender = {esc, pptBadge, pptFlash, gate, handPhone, apScreen, aiView, speedo, riderPhone, customerPhone, mapHtml, engine, overview, compare, review, audit, sandboxForm, sandboxOut, jsonHtml};
})(typeof globalThis !== 'undefined' ? globalThis : this);
