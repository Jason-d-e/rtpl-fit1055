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
        <div class="card"><p>This time already includes a legal travel speed, traffic signals, restaurant waiting, building access and hand-over.</p></div>
        <button class="btn-y pulse" data-act="next">Accept order</button>`;
    } else if (r.kind === 'trip') {
      const stageText = {pickup: 'Collecting at Noodle Kitchen', delivering: 'Delivering', delivered: 'Delivered'}[r.stage] || '';
      const rows = r.orders.map(o => `<div class="order-row"><div><span class="id">${esc(o.id)}</span><br><span style="font-size:.7rem;color:var(--muted)">${o.completed !== undefined ? 'Completed ' + clock(o.completed) : 'Protected deadline'}</span></div>
        <div class="due">${o.prev !== undefined ? `<span class="was">${clock(o.prev)}</span>` : ''}<strong class="${o.prev !== undefined ? 'flash' : ''}">${clock(o.deadline)}</strong>${o.completed !== undefined ? (o.completed > o.deadline ? (o.completed - o.deadline) + ' min after deadline' : 'on time') : 'due'}</div></div>`).join('');
      body = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">${stageText}</h3><span class="shield">${ICON.shield}Protected</span></div>${rows}</div>${miniMap(r.track || defaultTrack(r.stage))}`;
      if (r.stage === 'delivered') body += `<div class="card"><p><span class="dots3"><span></span><span></span><span></span></span> Checking what caused any delay…</p></div>`;
      else body += `<div class="card"><p>Your deadline can be extended when conditions change. It never moves earlier once you accept.</p></div>`;
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
    let body = `<div class="rest-hero"><div class="logo">${ICON.bowl}</div><div><strong>${esc(c.restaurant)}</strong><small>Synthetic restaurant · order A101</small></div></div>`;
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
    const lab = kind === 'custA' ? 'A101' : 'B102';
    return `<g transform="translate(${p.x} ${p.y})"><circle r="19" fill="#fff" stroke="#1F262D" stroke-width="3"/><path d="M-9 1 0 -8 9 1M-6 -1v9h12v-9" fill="none" stroke="#1F262D" stroke-width="2.6" stroke-linejoin="round"/>
      <g transform="translate(-26 24)"><rect width="52" height="22" rx="11" fill="#1F262D"/><text x="26" y="15.5" text-anchor="middle" fill="#fff" font-size="12.5" font-weight="700" font-family="Bricolage, sans-serif">${lab}</text></g></g>`;
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
      <div class="mapnote">Synthetic map · no GPS or routing service</div></div>`;
  }

  /* ---------- engine ---------- */
  function trace(lines, title) {
    return `<div class="trace"><h3>${esc(title || 'How RTPL decided · live pseudocode')}</h3><ol>${lines.map(l => `<li class="${l.state}"><span class="rule">${l.rule}</span><code>${esc(l.code)}</code><span class="val">${esc(l.value)}</span></li>`).join('')}</ol>
      <p class="src">Values come from this run of <code>rtpl-core.js</code>. Highlighted lines decided the result.</p></div>`;
  }

  function engineDeadline(e) {
    const p = e.parts, res = e.res, scale = Math.max(40, Math.ceil(((p ? p.total : 0) + 4) / 10) * 10, e.proposed + 6);
    const pc = v => (v / scale * 100).toFixed(2);
    let x = 0;
    const segs = p ? [['Travel', p.travel], ['Signals', p.signals], ['Restaurant', p.wait], ['Building', p.access], ['Hand-over', p.handover]].map(([n, v], i) => {
      const left = x; x += v;
      return `<div class="seg p${i}" data-w="${pc(v)}" style="left:${pc(left)}%;width:0"><span>${n} ${Math.round(v * 10) / 10}</span></div>`;
    }).join('') : `<div style="position:absolute;left:.6rem;top:50%;transform:translateY(-50%);font-size:.74rem;color:#8995A1;font-style:italic">${res && res.status === 'HOLD' ? 'Not calculated: inputs are stale' : 'Not checked yet'}</div>`;
    const gap = p && res.floor > e.proposed ? `<div class="gap-mark" style="left:${pc(e.proposed)}%;width:${pc(res.floor - e.proposed)}%">${res.floor - e.proposed} min short</div>` : '';
    let ticks = '';
    for (let m = 0; m <= scale; m += 10) ticks += `<span style="left:${pc(m)}%">${clock(m)}</span>`;
    let pub;
    if (!res) pub = `<span class="t none">—</span><p><b>Nothing sent.</b> The rider and the customer see no time until the check runs.</p>`;
    else if (res.status === 'HOLD') pub = `<span class="t hold">HOLD</span><p><b>Dispatch held for review.</b> No unchecked deadline published. P01: ${esc(res.reason)}</p>`;
    else pub = `<span class="t">${clock(res.deadline)}</span><p><b>Published to rider and customer.</b><br>max(AI ${e.proposed}, floor ${res.floor}) = ${res.deadline} min</p>${e.locked ? `<span class="lock">${ICON.lock}Accepted · only later</span>` : ''}`;
    return `<div class="engine"><div class="calc"><div class="e-head"><span class="title">Dispatch console · order A101</span><h3>${e.stale ? 'Route data: out of date' : 'Route data: current'}</h3></div>
      <div class="bars"><div class="lbl"><b>AI proposal</b>simulated model</div><div class="track"><div class="seg ai" data-w="${pc(e.proposed)}" style="left:0;width:0"><span>${e.proposed} min → ${clock(e.proposed)}</span></div>${gap}</div>
      <div class="lbl"><b>RTPL minimum</b>legal route + service</div><div class="track">${segs}</div>
      <div></div><div class="axis">${ticks}</div></div>
      ${p ? `<div class="formula">Travel ${Math.round(p.travel * 10) / 10} + Signals ${p.signals} + Restaurant ${p.wait} + Building ${p.access} + Hand-over ${p.handover} = <b>${p.total} min</b></div>` : ''}
      <div class="publish">${pub}</div></div>${trace(e.trace)}</div>`;
  }

  function engineBundle(e) {
    const rows = e.rows.map(r => `<tr><td class="id">${r.id}</td><td><span class="tm">${clock(r.accepted)}</span></td>
      <td>${r.closure === null ? '<span class="pending">—</span>' : `<span class="tm">${clock(r.closure)}</span><span class="badge later">later</span>`}</td>
      <td>${r.faster === null ? '<span class="pending">—</span>' : `<span class="tm">${clock(r.faster)}</span><span class="badge kept">kept</span><span class="strike">overwrite would say <s>${clock(r.overwrite)}</s></span>`}</td></tr>`).join('');
    return `<div class="engine"><div class="calc"><div class="e-head"><span class="title">Every accepted order on the trip is rechecked</span><h3>Recheck at ${clock(S.ROUTE_NOW)}</h3></div>
      <table class="otable"><thead><tr><th>Order</th><th>Accepted</th><th>After road closure</th><th>After faster route</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="publish" style="margin-top:auto"><p>${e.stage === 0 ? '<b>Waiting for a route change.</b> Both deadlines were accepted and are shown to rider and customers.' : e.stage === 1 ? '<b>Both updates published together.</b> If one order’s data were missing, the whole batch would be held.' : '<b>A shorter estimate cannot pull an accepted time earlier.</b> deadline = max(accepted, new floor)'}</p></div></div>
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

  /* ---------- boards ---------- */
  function overview(o) {
    return `<div class="board"><div class="ov" id="ov">
      <div class="ov-node ov-ai" id="ov-ai"><h4>Existing AI dispatch</h4><p>Chooses the rider and proposes a delivery time. RTPL does not change it.</p><span class="sim">Simulated in this prototype</span></div>
      <div class="ov-rtpl" id="ov-rtpl"><header>${ICON.shield.replace('<svg', '<svg width="26" height="26" style="color:#FFC20E"')}<b>RTPL</b><span>Rider Time Protection Layer · rules P01–P07</span></header>
        <div class="ov-stages">
          <div class="ov-stage"><span class="sl">slides 6–7</span><span class="num">1</span><h5>Check before dispatch</h5><p>Hold stale data. Publish no time below a legal minimum. Accepted times never move earlier.</p><div class="rules"><span>P01</span><span>P02</span></div></div>
          <div class="ov-stage"><span class="sl">slides 8–9</span><span class="num">2</span><h5>Explain after hand-over</h5><p>Credit each verified outside delay once. Protect unless reliable evidence shows the rider caused the rest.</p><div class="rules"><span>P03</span><span>P04</span><span>P05</span></div></div>
          <div class="ov-stage"><span class="sl">slides 10–11</span><span class="num">3</span><h5>Correct and oversee</h5><p>An appeal pauses disputed effects until an authorised person decides. A minimal record stays inspectable.</p><div class="rules"><span>P06</span><span>P07</span></div></div>
        </div></div>
      <div class="ov-out"><div class="ov-node" id="ov-rider"><h4>Rider app</h4><p>Checked deadline, delay explanation, appeal button.</p></div><div class="ov-node cust" id="ov-cust"><h4>Customer app</h4><p>The same checked time. Nothing about evidence or appeals.</p></div></div>
      <div class="ov-below"><div class="ov-node" id="ov-rev"><h4>Human reviewer</h4><p>Real correction authority. Must record a reason.</p></div><div class="ov-node aud" id="ov-aud"><h4>Auditor</h4><p>Version, rule, outcome, effects. No identity or GPS.</p></div></div>
      <div class="ov-real"><span><b>Runs for real:</b> deadline arithmetic, delay accounting, protection decision, appeal and review states, minimised export.</span><span><b>Simulated:</b> the AI proposal, evidence reliability labels, reviewer authority.</span></div>
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
    'Service score': 'The platform’s performance score',
    'Customer rating': 'How this order counts toward ratings',
    'Bonus': 'Incentive pay tied to on-time delivery',
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
    return `<div class="board"><div class="au"><div class="au-left"><h3 style="margin:0">Oversight record · case 04</h3><pre class="json" id="audit-json">${jsonHtml(a.record)}</pre>
      <div class="row2"><button class="btn-dark" data-act="download">Download audit summary</button><span class="sub">RTPL-synthetic-audit.json</span></div></div><div>${right}</div></div></div>`;
  }

  /* ---------- sandbox ---------- */
  function sandboxForm(v) {
    const n = (k, label) => `<div class="f"><label for="sb-${k}">${label}</label><input type="number" min="0" step="1" id="sb-${k}" data-sb="${k}" value="${v[k]}"></div>`;
    const c = (k, label) => `<label class="ck"><input type="checkbox" data-sb="${k}" ${v[k] ? 'checked' : ''}> ${label}</label>`;
    return `<div class="sb-form"><h4>Dispatch</h4>${n('proposed', 'AI proposed (min)')}${n('distance', 'Distance (km)')}${n('legalSpeed', 'Legal speed (km/h)')}${n('conditionSpeed', 'Speed in conditions')}${n('signals', 'Signals (min)')}${n('wait', 'Restaurant wait')}${n('access', 'Building access')}${n('handover', 'Hand-over')}${c('fresh', 'Route data is current')}
      <h4>Delivery</h4>${n('arrivalAfter', 'Arrives after deadline (min)')}${n('outside', 'Verified outside delay (min)')}${c('riderCause', 'Reliable rider-cause record')}${c('safeRoute', 'Verified safe legal detour')}${c('complete', 'Cause record complete')}
      <button class="btn-line" data-act="sb-reset">Back to slide values</button></div>`;
  }
  function sandboxOut(out, err) {
    if (err) return `<div class="msg err">${esc(err)}</div>`;
    return engineDeadline(out.engine) + (out.credit ? engineCredit(out.credit, 'Delay check · your inputs') : '<div class="msg info">Dispatch is held, so there is no delivery to check.</div>');
  }

  root.RTPLRender = {esc, riderPhone, customerPhone, mapHtml, engine, overview, compare, review, audit, sandboxForm, sandboxOut, jsonHtml};
})(typeof globalThis !== 'undefined' ? globalThis : this);
