'use strict';
/* Ghost Race – závod proti ghostovi na 3D mapě */

const $ = s => document.querySelector(s);
const CFG = window.GR_CONFIG || {};
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const HOME_CENTER = [15.4603, 50.1544]; // Chlumec nad Cidlinou
const SIMK = 3;                         // testovací jízda: 3× rychleji

/* ---------- pomocné funkce ---------- */
const RAD = Math.PI / 180, ER = 6371000;
function hav(a, b) {
  const dLa = (b[1] - a[1]) * RAD, dLo = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLo / 2) ** 2;
  return 2 * ER * Math.asin(Math.sqrt(h));
}
function brg(a, b) {
  const la1 = a[1] * RAD, la2 = b[1] * RAD, dLo = (b[0] - a[0]) * RAD;
  const y = Math.sin(dLo) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLo);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
function moveBy(p, bearing, m) {
  const d = m / ER, b = bearing * RAD, la = p[1] * RAD, lo = p[0] * RAD;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [lo2 / RAD, la2 / RAD];
}
const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = t => { if (t == null || !isFinite(t)) return '–'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
const fmtS = t => (t == null || !isFinite(t)) ? '–' : t.toFixed(1);
const cz = n => n.toFixed(1).replace('.', ',');
const km = m => (m / 1000).toFixed(1).replace('.', ',');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toPairs = f => { const r = []; for (let i = 0; i < f.length; i += 2) r.push([f[i], f[i + 1]]); return r; };
function interp(xs, ys, x) {
  const n = xs.length; if (!n) return 0;
  if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const f = (x - xs[lo]) / ((xs[hi] - xs[lo]) || 1);
  return ys[lo] + (ys[hi] - ys[lo]) * f;
}
function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}

/* ---------- trasa ---------- */
function prep(r) {
  if (r._prep) return r;
  r.coords = r.coords || toPairs(r.c);
  const cum = [0];
  for (let i = 1; i < r.coords.length; i++) cum.push(cum[i - 1] + hav(r.coords[i - 1], r.coords[i]));
  r.cum = cum; r.length = cum[cum.length - 1];
  r.sect = [r.length / 3, 2 * r.length / 3, r.length];
  r._prep = true; return r;
}
function segAt(r, d) {
  let lo = 0, hi = r.cum.length - 1;
  if (d <= 0) return 0; if (d >= r.length) return hi - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= d) lo = m; else hi = m; }
  return lo;
}
function pointAt(r, d) {
  d = Math.max(0, Math.min(d, r.length));
  const i = segAt(r, d), a = r.coords[i], b = r.coords[i + 1] || a;
  const L = (r.cum[i + 1] - r.cum[i]) || 1, f = (d - r.cum[i]) / L;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
function headingAt(r, d) { return brg(pointAt(r, d - 12), pointAt(r, d + 12)); }
// promítne GPS bod na trasu: vzdálenost od startu + jak daleko od trasy
function project(r, p, hint) {
  const n = r.coords.length - 1;
  let from = 0, to = n;
  if (hint != null) { from = Math.max(0, hint - 20); to = Math.min(n, hint + 150); }
  const kx = Math.cos(p[1] * RAD) * ER * RAD, ky = ER * RAD;
  let best = { off: Infinity, d: 0, i: 0 };
  for (let i = from; i < to; i++) {
    const a = r.coords[i], b = r.coords[i + 1];
    const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2));
    const off = Math.hypot(ax + dx * t, ay + dy * t);
    if (off < best.off) best = { off, d: r.cum[i] + t * (r.cum[i + 1] - r.cum[i]), i };
  }
  if (hint != null && best.off > 50) return project(r, p, null);
  return best;
}

/* ---------- ghost ---------- */
function ghostFrom(run, label) {
  const ts = [], ds = [];
  for (let i = 0; i < run.s.length; i += 2) { ts.push(run.s[i]); ds.push(run.s[i + 1]); }
  return { ts, ds, total: run.total, name: label || run.driver };
}
function idealGhost(runs, r) {
  const ts = [0], ds = [0]; let off = 0;
  for (let k = 0; k < 3; k++) {
    const run = runs.reduce((b, x) => x.sectors[k] < b.sectors[k] ? x : b);
    const g = ghostFrom(run);
    const b0 = k ? r.sect[k - 1] : 0, b1 = r.sect[k];
    const t0 = interp(g.ds, g.ts, b0);
    for (let i = 0; i < g.ds.length; i++) if (g.ds[i] > b0 + 0.5 && g.ds[i] < b1 - 0.5) { ts.push(off + g.ts[i] - t0); ds.push(g.ds[i]); }
    off += run.sectors[k]; ts.push(off); ds.push(b1);
  }
  for (let i = 1; i < ts.length; i++) ts[i] = Math.max(ts[i], ts[i - 1] + 0.001);
  return { ts, ds, total: off, name: 'Ideální kolo' };
}
const gDist = (g, t) => interp(g.ts, g.ds, t);
const gTime = (g, d) => interp(g.ds, g.ts, d);

/* ---------- úložiště: Firebase (s kámošema) nebo jen tenhle telefon ---------- */
const Store = {
  cloud: false, db: null,
  async init() {
    const fb = CFG.firebase;
    if (fb && fb.apiKey) {
      try {
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');
        firebase.initializeApp(fb);
        this.db = firebase.firestore();
        this.cloud = true;
      } catch (e) { console.warn('Firebase se nenačetl, jedu lokálně', e); }
    }
  },
  lsGet(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } },
  lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  async all(col, key) {
    if (this.cloud) { const q = await this.db.collection(col).get(); return q.docs.map(d => d.data()); }
    return this.lsGet(key);
  },
  async put(col, key, doc) {
    if (this.cloud) { await this.db.collection(col).doc(doc.id).set(doc); return; }
    const a = this.lsGet(key); a.push(doc); this.lsSet(key, a);
  },
  routes() { return this.all('routes', 'gr_routes'); },
  runs() { return this.all('runs', 'gr_runs'); },
  saveRoute(r) { return this.put('routes', 'gr_routes', { id: r.id, name: r.name, c: r.coords.flat().map(v => +v.toFixed(6)), createdBy: r.createdBy, createdAt: r.createdAt }); },
  saveRun(run) { return this.put('runs', 'gr_runs', run); }
};

/* ---------- stav appky ---------- */
const App = { me: '', routes: [], runs: [], cur: null };
function getName() { try { return localStorage.getItem('gr_name') || ''; } catch (e) { return ''; } }
function setName(n) { try { localStorage.setItem('gr_name', n); } catch (e) { } }

const SCREENS = ['name', 'home', 'new', 'detail', 'race', 'result'];
function show(name) {
  SCREENS.forEach(s => { $('#scr-' + s).hidden = s !== name; });
  $('#map').style.visibility = (name === 'new' || name === 'race') ? 'visible' : 'hidden';
  if (map) setTimeout(() => map.resize(), 30);
}

function runsOf(routeId) { return App.runs.filter(x => x.routeId === routeId && x.sectors && x.sectors.length === 3); }
function bestOf(runs) { return runs.length ? runs.reduce((b, x) => x.total < b.total ? x : b) : null; }
function sectorBests(runs) { return [0, 1, 2].map(k => runs.length ? Math.min(...runs.map(x => x.sectors[k])) : Infinity); }

/* ---------- mapa ---------- */
let map = null, mapReady = null, pins = [], carMk = null, ghostMk = null;
function initMap() {
  if (mapReady) return mapReady;
  map = new maplibregl.Map({ container: 'map', style: MAP_STYLE, center: HOME_CENTER, zoom: 13, attributionControl: { compact: true }, maxPitch: 75 });
  mapReady = new Promise(ok => map.on('load', () => {
    map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#08243F', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 7, 18, 22] } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#6FB6FF', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 12] } });
    ok();
  }));
  map.on('click', onMapClick);
  return mapReady;
}
function setRouteOnMap(coords) {
  const data = coords ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } : { type: 'FeatureCollection', features: [] };
  map.getSource('route').setData(data);
  pins.forEach(p => p.remove()); pins = [];
  if (coords) {
    [[coords[0], 'pin'], [coords[coords.length - 1], 'pin finish']].forEach(([c, cls]) => {
      const el = document.createElement('div'); el.className = cls;
      pins.push(new maplibregl.Marker({ element: el }).setLngLat(c).addTo(map));
    });
  }
}
function arrowMarker(fill, opacity) {
  const el = document.createElement('div'); el.className = 'mk'; el.style.opacity = opacity;
  el.innerHTML = `<svg viewBox="0 0 38 38" width="38" height="38" aria-hidden="true"><path d="M19 2 L33 34 L19 26 L5 34 Z" fill="${fill}" stroke="#F2F1EC" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  return new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' });
}
function fitCoords(coords, pad) {
  const b = coords.reduce((b, c) => [[Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])], [Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])]], [[180, 90], [-180, -90]]);
  map.fitBounds(b, { padding: pad || 80, pitch: 0, bearing: 0, duration: 600 });
}

/* ---------- hlas ---------- */
function say(text, showBubble = true) {
  if (showBubble) { $('#rVoice').hidden = false; $('#rVoiceTxt').textContent = '„' + text + '“'; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'cs-CZ'; u.rate = 1.1;
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('cs')); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) { }
}
function unlockVoice() { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { } }
let wake = null;
async function keepAwake() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) { } }
function releaseAwake() { try { wake && wake.release(); } catch (e) { } wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && RS && RS.phase !== 'done' && !$('#scr-race').hidden) keepAwake(); });

/* ================= DOMŮ ================= */
function routeSvg(r, w, h) {
  prep(r);
  const xs = r.coords.map(c => c[0] * Math.cos(r.coords[0][1] * RAD)), ys = r.coords.map(c => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min((w - 40) / ((maxX - minX) || 1e-9), (h - 30) / ((maxY - minY) || 1e-9));
  const ox = (w - (maxX - minX) * s) / 2, oy = (h - (maxY - minY) * s) / 2;
  const pts = xs.map((x, i) => [(x - minX) * s + ox, h - ((ys[i] - minY) * s + oy)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const a = pts[0], b = pts[pts.length - 1];
  return `<path d="${d}" fill="none" stroke="#3A4048" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#6FB6FF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${a[0]}" cy="${a[1]}" r="6" fill="#F2F1EC"/><circle cx="${b[0]}" cy="${b[1]}" r="6" fill="#0E1013" stroke="#F2F1EC" stroke-width="3"/>`;
}
async function loadData() {
  try { [App.routes, App.runs] = await Promise.all([Store.routes(), Store.runs()]); }
  catch (e) { console.warn(e); alertBox('Nepodařilo se načíst data. Zkontroluj internet nebo nastavení Firebase.'); }
  App.routes.forEach(prep);
  App.routes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
function alertBox(msg) { const el = $('#routeList'); el.insertAdjacentHTML('afterbegin', `<div class="empty" style="border-color:var(--orange)">${esc(msg)}</div>`); }
function renderHome() {
  const b = $('#modeBadge');
  b.classList.toggle('on', Store.cloud);
  b.querySelector('span').textContent = Store.cloud ? 'Online – s kámošema' : 'Jen v tomhle zařízení';
  $('#meBadge').textContent = App.me;
  const list = $('#routeList');
  if (!App.routes.length) {
    list.innerHTML = `<div class="empty">Zatím nemáš žádnou trasu. Dej <b style="color:var(--fg)">Nová trasa</b>, ťukni na mapu na start a cíl a appka sama najde cestu po silnici.</div>`;
    return;
  }
  list.innerHTML = App.routes.map(r => {
    const runs = runsOf(r.id), best = bestOf(runs), mine = bestOf(runs.filter(x => x.driver === App.me));
    const drivers = new Set(runs.map(x => x.driver)).size;
    return `<button class="rcard" data-id="${esc(r.id)}">
      <svg viewBox="0 0 360 110" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${routeSvg(r, 360, 110)}</svg>
      <div class="body">
        <div class="name">${esc(r.name)}</div>
        <div class="meta"><span>${km(r.length)} km</span><span>${runs.length} jízd</span><span>${drivers} ${drivers === 1 ? 'jezdec' : drivers >= 2 && drivers <= 4 ? 'jezdci' : 'jezdců'}</span></div>
        <div class="times">
          <div><div class="lbl">Tvůj rekord</div><div class="num">${mine ? fmt(mine.total) : '–'}</div></div>
          <div style="text-align:right"><div class="lbl">Nejlepší celkově</div><div class="num" style="color:var(--purple-soft)">${best ? fmt(best.total) : '–'}</div></div>
        </div>
      </div></button>`;
  }).join('');
  list.querySelectorAll('.rcard').forEach(el => el.onclick = () => openDetail(el.dataset.id));
}
async function goHome() { show('home'); await loadData(); renderHome(); }

/* ================= NOVÁ TRASA ================= */
const NR = { step: 0, a: null, b: null, coords: null, busy: false };
async function openNew() {
  show('new'); await initMap();
  Object.assign(NR, { step: 1, a: null, b: null, coords: null, busy: false });
  setRouteOnMap(null); clearRaceMarkers();
  $('#newSheet').hidden = true; $('#newHint').textContent = 'Ťukni na mapu na START.';
  map.jumpTo({ pitch: 0, bearing: 0 });
  navigator.geolocation && navigator.geolocation.getCurrentPosition(p => map.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 14 }), () => map.flyTo({ center: HOME_CENTER, zoom: 13 }), { timeout: 6000 });
}
async function onMapClick(e) {
  if ($('#scr-new').hidden || NR.busy || NR.step === 0) return;
  const p = [e.lngLat.lng, e.lngLat.lat];
  if (NR.step === 1) { NR.a = p; NR.step = 2; setRouteOnMap([p, p]); $('#newHint').textContent = 'Teď ťukni na CÍL.'; return; }
  if (NR.step === 2) {
    NR.b = p; NR.busy = true; $('#newHint').textContent = 'Hledám trasu po silnici…';
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${NR.a[0]},${NR.a[1]};${NR.b[0]},${NR.b[1]}?overview=full&geometries=geojson`;
      const j = await (await fetch(url)).json();
      if (!j.routes || !j.routes.length) throw new Error('no route');
      NR.coords = j.routes[0].geometry.coordinates;
      setRouteOnMap(NR.coords); fitCoords(NR.coords, 90);
      const r = prep({ coords: NR.coords });
      $('#newHint').textContent = `Trasa ${km(r.length)} km. Pojmenuj ji a ulož.`;
      $('#newSheet').hidden = false; NR.step = 0;
    } catch (err) {
      $('#newHint').textContent = 'Trasu se nepodařilo najít. Ťukni znovu na START, přímo na silnici.';
      NR.step = 1; setRouteOnMap(null);
    }
    NR.busy = false;
  }
}
async function saveNew() {
  if (!NR.coords) return;
  const name = $('#routeName').value.trim() || 'Trasa ' + new Date().toLocaleDateString('cs-CZ');
  const r = { id: uid(), name, coords: NR.coords, createdBy: App.me, createdAt: Date.now() };
  $('#newSave').textContent = 'Ukládám…';
  try { await Store.saveRoute(r); } catch (e) { $('#newHint').textContent = 'Uložení selhalo. Zkontroluj internet.'; $('#newSave').textContent = 'Uložit trasu'; return; }
  $('#newSave').textContent = 'Uložit trasu'; $('#routeName').value = '';
  await loadData(); openDetail(r.id);
}

/* ================= DETAIL TRASY ================= */
function openDetail(id) {
  const r = App.routes.find(x => x.id === id); if (!r) return goHome();
  App.cur = r; prep(r);
  const runs = runsOf(r.id);
  $('#detName').textContent = r.name;
  $('#detMeta').textContent = `${km(r.length)} km · 3 sektory${r.createdBy ? ' · vytvořil ' + r.createdBy : ''}`;
  $('#detPreview').innerHTML = routeSvg(r, 360, 150);

  // žebříček: nejlepší jízda každého jezdce
  const byDriver = {};
  runs.forEach(x => { if (!byDriver[x.driver] || x.total < byDriver[x.driver].total) byDriver[x.driver] = x; });
  const rows = Object.values(byDriver).sort((a, b) => a.total - b.total);
  const sb = sectorBests(runs);
  const board = $('#detBoard');
  if (!rows.length) board.innerHTML = `<div class="empty">Na trase ještě nikdo nejel. První jízda nastaví ghosta.</div>`;
  else board.innerHTML = `<div class="brow headrow"><span></span><span>Jezdec</span><span style="text-align:center">S1</span><span style="text-align:center">S2</span><span style="text-align:center">S3</span><span style="text-align:right">Čas</span></div>` +
    rows.map((x, i) => `<div class="brow${x.driver === App.me ? ' me' : ''}"><span style="text-align:center;font-weight:600">${i + 1}</span><span class="n">${esc(x.driver)}</span>${x.sectors.map((s, k) => `<span class="c${s <= sb[k] ? ' purple' : ''}">${fmtS(s)}</span>`).join('')}<span class="t">${fmt(x.total)}</span></div>`).join('');

  // výběr ghosta
  const opts = [];
  const mine = bestOf(runs.filter(x => x.driver === App.me));
  const top = bestOf(runs);
  if (mine) opts.push({ v: 'me', t: 'Můj rekord', s: 'Tvoje nejlepší jízda', time: mine.total });
  if (top && (!mine || top.id !== mine.id)) opts.push({ v: 'top', t: top.driver, s: 'Nejrychlejší na trase', time: top.total });
  if (runs.length >= 2) { const ig = idealGhost(runs, r); opts.push({ v: 'ideal', t: 'Ideální kolo', s: 'Všechny fialový sektory dohromady', time: ig.total, purple: true }); }
  opts.push({ v: 'none', t: 'Bez ghosta', s: 'Jen změřit čas' });
  $('#detGhosts').innerHTML = opts.map((o, i) => `<label class="opt"><input type="radio" name="ghost" value="${o.v}" ${i === 0 ? 'checked' : ''}><span class="tx"><b>${esc(o.t)}</b><span>${o.s}</span></span>${o.time ? `<span class="num"${o.purple ? ' style="color:var(--purple-soft)"' : ''}>${fmt(o.time)}</span>` : ''}</label>`).join('');
  show('detail');
}
function pickGhost() {
  const r = App.cur, runs = runsOf(r.id), v = (document.querySelector('input[name=ghost]:checked') || {}).value;
  if (v === 'me') { const x = bestOf(runs.filter(y => y.driver === App.me)); return x && ghostFrom(x, 'Můj rekord'); }
  if (v === 'top') { const x = bestOf(runs); return x && ghostFrom(x); }
  if (v === 'ideal') return idealGhost(runs, r);
  return null;
}

/* ================= ZÁVOD ================= */
let RS = null;
function clock() { return RS && RS.sim ? RS.base + (performance.now() - RS.base) * SIMK : performance.now(); }
function clearRaceMarkers() { if (carMk) carMk.remove(); if (ghostMk) ghostMk.remove(); carMk = ghostMk = null; }

async function startRace() {
  const r = App.cur, runs = runsOf(r.id);
  const sim = $('#detSim').checked;
  RS = {
    route: r, ghost: pickGhost(), sim, phase: 'wait', base: performance.now(),
    fix: null, idx: null, disp: 0, camH: headingAt(r, 0), lastFrame: performance.now(),
    samples: [], sectors: [], sec: 0, split: 0, t0: 0,
    myPB: sectorBests(runs.filter(x => x.driver === App.me)), allBest: sectorBests(runs),
    myBestTotal: (bestOf(runs.filter(x => x.driver === App.me)) || {}).total,
    allBestTotal: (bestOf(runs) || {}).total,
    gps: null, simTimer: null, simD: 0, simTempo: 0.95 + Math.random() * 0.1, stopArmed: false
  };
  show('race'); await initMap();
  setRouteOnMap(r.coords); clearRaceMarkers();
  carMk = arrowMarker('#E5484D', 1).setLngLat(r.coords[0]).addTo(map);
  if (RS.ghost) ghostMk = arrowMarker('#6FB6FF', 0.6).setLngLat(r.coords[0]).addTo(map);
  for (let i = 0; i < 3; i++) { const e = $('#rs' + i); e.className = 'sec'; e.querySelector('.num').textContent = '–'; }
  $('#rTime').textContent = '0:00.0'; $('#rDeltaVal').textContent = '–'; $('#rDelta').className = '';
  $('#rDeltaLbl').textContent = RS.ghost ? RS.ghost.name : 'bez ghosta';
  $('#rVoice').hidden = true; $('#rGap').hidden = true; $('#rGo').hidden = false; $('#rCount').hidden = true;
  $('#rStopTxt').textContent = 'Konec'; $('#rLeft').textContent = km(r.length); $('#rSpd').textContent = '0';
  $('#rMsg').hidden = false; $('#rMsg').textContent = sim ? 'Testovací jízda. Dej Start.' : 'Čekám na GPS…';
  map.jumpTo({ center: r.coords[0], zoom: 17, pitch: 62, bearing: RS.camH });
  startGPS();
  requestAnimationFrame(frame);
}

function startGPS() {
  if (RS.sim) {
    const tick = () => {
      if (!RS || RS.phase === 'done') return;
      const r = RS.route;
      let v = 0;
      if (RS.phase === 'race') {
        const turn = Math.abs(angDiff(headingAt(r, RS.simD), headingAt(r, RS.simD + 70)));
        v = Math.max(8, 24 - turn * 0.28) * RS.simTempo * (0.97 + Math.random() * 0.06);
        RS.simD = Math.min(r.length + 40, RS.simD + v);
      }
      let p = pointAt(r, Math.min(RS.simD, r.length));
      if (RS.simD > r.length) p = moveBy(pointAt(r, r.length), headingAt(r, r.length), RS.simD - r.length);
      const n = () => (Math.random() - 0.5) * 4;
      p = [p[0] + n() / (111320 * Math.cos(p[1] * RAD)), p[1] + n() / 111320];
      onFix(p, v, 5);
    };
    tick(); RS.simTimer = setInterval(tick, 1000 / SIMK);
    return;
  }
  if (!('geolocation' in navigator)) { $('#rMsg').textContent = 'Tohle zařízení nemá GPS. Zapni testovací jízdu.'; return; }
  RS.gps = navigator.geolocation.watchPosition(
    pos => { const c = pos.coords; onFix([c.longitude, c.latitude], c.speed, c.accuracy); },
    err => { $('#rMsg').textContent = err.code === 1 ? 'Povol polohu: Nastavení › Soukromí › Polohové služby › Safari › Při používání.' : 'GPS zatím nemá signál…'; },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
function stopGPS() {
  if (!RS) return;
  if (RS.gps != null) navigator.geolocation.clearWatch(RS.gps);
  if (RS.simTimer) clearInterval(RS.simTimer);
  RS.gps = null; RS.simTimer = null;
}

function onFix(p, speed, acc) {
  if (!RS || RS.phase === 'done') return;
  const r = RS.route, t = clock();
  const pr = project(r, p, RS.idx); RS.idx = pr.i;
  const prev = RS.fix;
  let d = pr.d;
  if (RS.phase === 'race') d = Math.max(prev ? prev.d : 0, d);
  let spd = (speed != null && speed >= 0) ? speed : 0;
  if ((speed == null || speed < 0) && prev && t > prev.t) spd = Math.max(0, (d - prev.d) / ((t - prev.t) / 1000));
  RS.fix = { p, d, t, spd, off: pr.off, acc };
  $('#rSpd').textContent = Math.round(spd * 3.6);

  if (RS.phase === 'wait' || RS.phase === 'count') {
    const toStart = hav(p, r.coords[0]);
    if (RS.phase === 'wait') {
      if (!RS.sim && toStart > 60) $('#rMsg').textContent = `Jsi ${toStart > 1000 ? km(toStart) + ' km' : Math.round(toStart) + ' m'} od startu. Dojeď na start.`;
      else if (!RS.sim) $('#rMsg').textContent = `Jsi na startu. Přesnost GPS ${Math.round(acc || 0)} m.`;
    }
    return;
  }
  if (RS.phase !== 'race') return;
  $('#rMsg').hidden = !(pr.off > 60);
  if (pr.off > 60) $('#rMsg').textContent = 'Jsi mimo trasu. Vrať se na modrou čáru.';

  const rt = (t - RS.t0) / 1000;
  const last = RS.samples[RS.samples.length - 1];
  if (d > last[1] + 0.5) {
    while (RS.sec < 3 && d >= r.sect[RS.sec]) {
      const b = r.sect[RS.sec];
      const tc = last[0] + (b - last[1]) / (d - last[1]) * (rt - last[0]);
      sectorDone(tc);
      if (RS.phase === 'done') { RS.samples.push([tc, r.length]); saveDraft(tc); return; }
    }
    RS.samples.push([rt, d]);
  }
}

function sectorDone(tc) {
  const k = RS.sec, st = tc - RS.split;
  RS.split = tc; RS.sectors.push(st); RS.sec++;
  const cls = st < RS.allBest[k] ? 'purple' : st < RS.myPB[k] ? 'green' : 'orange';
  const e = $('#rs' + k); e.className = 'sec ' + cls; e.querySelector('.num').textContent = fmtS(st);
  const names = ['jedna', 'dva', 'tři'];
  const msg = { purple: 'fialová, nejrychlejší ze všech', green: 'zelená, osobní rekord', orange: 'oranžová, plus ' + cz(st - RS.myPB[k]) };
  if (RS.sec < 3) say('Sektor ' + names[k] + ', ' + msg[cls]);
  else { RS.phase = 'done'; RS.total = tc; }
}

function frame(now) {
  if (!RS || $('#scr-race').hidden) return;
  const dtReal = Math.min((now - RS.lastFrame) / 1000, 0.1); RS.lastFrame = now;
  const r = RS.route, f = RS.fix;
  let carPos, carH;
  if (RS.phase === 'race' || RS.phase === 'done') {
    if (f) {
      const ahead = RS.phase === 'race' ? f.d + f.spd * Math.min((clock() - f.t) / 1000, 1.5) : f.d;
      const target = Math.min(ahead, r.length);
      RS.disp = Math.max(RS.disp, RS.disp + (target - RS.disp) * Math.min(1, dtReal * 5));
    }
    carPos = pointAt(r, RS.disp); carH = headingAt(r, RS.disp);
  } else if (f && !RS.sim && f.off > 25) {
    carPos = f.p; carH = RS.camH;
  } else {
    RS.disp = f ? Math.min(f.d, 30) : 0; carPos = pointAt(r, RS.disp); carH = headingAt(r, RS.disp);
  }
  carMk.setLngLat(carPos).setRotation(carH);

  const rt = RS.phase === 'race' ? (clock() - RS.t0) / 1000 : RS.phase === 'done' ? RS.total : 0;
  if (RS.ghost && ghostMk) {
    const gd = RS.phase === 'race' || RS.phase === 'done' ? gDist(RS.ghost, rt) : 0;
    ghostMk.setLngLat(pointAt(r, gd)).setRotation(headingAt(r, gd));
    if (RS.phase === 'race') {
      const gap = gd - RS.disp; $('#rGap').hidden = false;
      $('#rGap').textContent = `${RS.ghost.name}: ${Math.round(Math.abs(gap))} m ${gap >= 0 ? 'před tebou' : 'za tebou'}`;
      const delta = rt - gTime(RS.ghost, RS.disp);
      $('#rDeltaVal').textContent = (delta < 0 ? '−' : '+') + Math.abs(delta).toFixed(1);
      $('#rDelta').className = Math.abs(delta) < 0.05 ? '' : delta < 0 ? 'ahead' : 'behind';
    }
  }
  if (RS.phase === 'race') {
    $('#rTime').textContent = fmt(rt);
    $('#rLeft').textContent = km(Math.max(0, r.length - RS.disp));
    for (let i = 0; i < 3; i++) $('#rs' + i).classList.toggle('on', i === RS.sec);
  }

  RS.camH = (RS.camH + angDiff(RS.camH, carH) * Math.min(1, dtReal * 2.5) + 360) % 360;
  map.jumpTo({ center: moveBy(carPos, RS.camH, 45), bearing: RS.camH, pitch: 62, zoom: 17 });
  requestAnimationFrame(frame);
}

function go() {
  if (!RS || RS.phase !== 'wait') return;
  const f = RS.fix;
  if (!RS.sim) {
    if (!f) { $('#rMsg').textContent = 'Ještě nemám polohu. Počkej chvilku.'; return; }
    if (hav(f.p, RS.route.coords[0]) > 60) { $('#rMsg').textContent = 'Nejdřív dojeď na start (bílý bod na mapě).'; return; }
  }
  unlockVoice(); keepAwake();
  RS.phase = 'count'; $('#rGo').hidden = true; $('#rMsg').hidden = true;
  let n = 3; const c = $('#rCount'); c.hidden = false;
  const step = () => {
    if (!RS || RS.phase !== 'count') { c.hidden = true; return; }
    if (n > 0) { c.textContent = n; say(['', 'Jedna', 'Dva', 'Tři'][n], false); n--; setTimeout(step, 1000); return; }
    c.textContent = 'GO'; say('Start', false); setTimeout(() => { c.hidden = true; }, 600);
    RS.t0 = clock(); RS.phase = 'race';
    const d0 = RS.fix ? Math.min(RS.fix.d, 30) : 0;
    RS.samples = [[0, d0]]; RS.disp = d0; RS.split = 0;
    if (RS.fix) RS.fix = { ...RS.fix, d: d0, t: RS.t0 };
  };
  step();
}

function saveDraft(total) {
  stopGPS();
  const r = RS.route;
  RS.run = {
    id: uid(), routeId: r.id, driver: App.me + (RS.sim ? ' (test)' : ''), total, sectors: RS.sectors.slice(0, 3),
    s: RS.samples.flatMap(([t, d]) => [+t.toFixed(2), +d.toFixed(1)]), date: Date.now(), sim: RS.sim
  };
  const dg = RS.ghost ? total - RS.ghost.total : null;
  const pbMsg = !isFinite(RS.allBestTotal) || RS.allBestTotal == null || total < RS.allBestTotal ? 'nejrychlejší na trase' : (RS.myBestTotal == null || total < RS.myBestTotal) ? 'nový osobní rekord' : null;
  say('Cíl. ' + fmt(total).replace(':', ' minut ').replace('.', ',') + (dg != null ? (dg < 0 ? ', o ' + cz(-dg) + ' rychleji než ghost' : ', o ' + cz(dg) + ' pomaleji než ghost') : '') + (pbMsg ? '. ' + pbMsg + '!' : ''), false);
  setTimeout(() => showResult(dg), 1400);
}
function showResult(dg) {
  releaseAwake();
  const run = RS.run, isTop = RS.allBestTotal == null || run.total < RS.allBestTotal, isPB = RS.myBestTotal == null || run.total < RS.myBestTotal;
  const b = $('#resBadge');
  b.className = 'pill' + (isTop ? ' purple' : isPB ? ' green' : '');
  b.textContent = isTop ? 'Nejrychlejší na trase' : isPB ? 'Nový osobní rekord' : 'Dojeto';
  $('#resTime').textContent = fmt(run.total);
  $('#resSub').textContent = (dg != null ? `${dg < 0 ? '−' : '+'}${Math.abs(dg).toFixed(1)} s proti ghostovi · ` : '') + RS.route.name + (RS.sim ? ' · testovací jízda' : '');
  $('#resSecs').innerHTML = run.sectors.map((st, k) => {
    const cls = st < RS.allBest[k] ? 'purple' : st < RS.myPB[k] ? 'green' : 'orange';
    const title = { purple: 'Nejlepší ze všech', green: 'Osobní rekord', orange: 'Pomalejší' }[cls];
    const ref = isFinite(RS.myPB[k]) ? RS.myPB[k] : null;
    const sub = ref != null ? `Tvůj rekord ${fmtS(ref)}` : 'První jízda';
    const dd = ref != null ? `<div class="lbl" style="color:${cls === 'orange' ? 'var(--orange)' : cls === 'green' ? 'var(--green)' : 'var(--purple-soft)'}">${st - ref < 0 ? '−' : '+'}${Math.abs(st - ref).toFixed(1)}</div>` : '';
    return `<div class="srow"><div class="sq ${cls}">S${k + 1}</div><div class="tx"><b>${title}</b><span>${sub}</span></div><div class="r"><div class="num">${fmtS(st)}</div>${dd}</div></div>`;
  }).join('');
  const sv = $('#resSave'); sv.textContent = RS.sim ? 'Uložit testovací jízdu' : 'Uložit jízdu'; sv.disabled = false;
  show('result');
}
async function saveRun() {
  const sv = $('#resSave'); if (!RS || !RS.run || sv.disabled) return;
  sv.textContent = 'Ukládám…';
  try { await Store.saveRun(RS.run); App.runs.push(RS.run); sv.textContent = 'Uloženo – je z toho ghost'; sv.disabled = true; }
  catch (e) { sv.textContent = 'Nepovedlo se, zkus znovu'; }
}
function abortRace() {
  if (!RS) return;
  if (RS.phase === 'race' && !RS.stopArmed) { RS.stopArmed = true; $('#rStopTxt').textContent = 'Opravdu?'; setTimeout(() => { if (RS) { RS.stopArmed = false; $('#rStopTxt').textContent = 'Konec'; } }, 2500); return; }
  stopGPS(); releaseAwake(); try { speechSynthesis.cancel(); } catch (e) { }
  RS.phase = 'done'; openDetail(RS.route.id);
}

/* ---------- tlačítka ---------- */
$('#nameSave').onclick = () => {
  const n = $('#nameInput').value.trim();
  if (!n) { $('#nameErr').hidden = false; return; }
  setName(n); App.me = n; goHome();
};
$('#nameInput').oninput = () => { $('#nameErr').hidden = true; };
$('#btnRename').onclick = () => { $('#nameInput').value = App.me; show('name'); };
$('#btnNew').onclick = openNew;
$('#newBack').onclick = goHome;
$('#newReset').onclick = openNew;
$('#newSave').onclick = saveNew;
$('#detBack').onclick = goHome;
$('#detStart').onclick = startRace;
$('#rGo').onclick = go;
$('#rStop').onclick = abortRace;
$('#resSave').onclick = saveRun;
$('#resBoard').onclick = async () => { await loadData(); openDetail(RS.route.id); };
$('#resAgain').onclick = async () => { await loadData(); openDetail(RS.route.id); startRace(); };

/* ---------- start appky ---------- */
(async function boot() {
  await Store.init();
  App.me = getName();
  if (!App.me) { show('name'); return; }
  goHome();
})();
