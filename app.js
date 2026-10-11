'use strict';
/* Ghost Race – závod proti ghostovi na 3D mapě */

const $ = s => document.querySelector(s);
const CFG = window.GR_CONFIG || {};
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const HOME_CENTER = [15.4603, 50.1544]; // Chlumec nad Cidlinou
const SIMK = 3;                         // testovací jízda: 3× rychleji
const MODES = { stand: 'Z místa', fly: 'Letmý' };
const COL = { purple: '#8E4CFF', green: '#34C77B', yellow: '#F5C518' };

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
// všechny časy v minutách: 1:14.9, 0:38.9
const fmt = t => { if (t == null || !isFinite(t)) return '–'; t = Math.round(t * 10) / 10; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
// rozdíly: krátké v sekundách (−1.6), dlouhé v minutách (+1:05.2)
const fmtD = d => { if (d == null || !isFinite(d)) return '–'; const a = Math.abs(d); return (d < 0 ? '−' : '+') + (a < 60 ? a.toFixed(1) : fmt(a)); };
const cz = n => n.toFixed(1).replace('.', ',');
const km = m => (m / 1000).toFixed(1).replace('.', ',');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const toPairs = f => { const r = []; for (let i = 0; i < f.length; i += 2) r.push([f[i], f[i + 1]]); return r; };
const dateStr = ts => { const d = new Date(ts); return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }) + ' ' + d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }); };
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
// kde je bod vůči startovní čáře: s < 0 před startem, s > 0 za ním
function startSide(r, p) {
  const s0 = r.coords[0], h = headingAt(r, 0) * RAD;
  const dx = (p[0] - s0[0]) * Math.cos(s0[1] * RAD) * ER * RAD, dy = (p[1] - s0[1]) * ER * RAD;
  return { s: dx * Math.sin(h) + dy * Math.cos(h), lat: Math.abs(dx * Math.cos(h) - dy * Math.sin(h)) };
}

/* ---------- ghost a jízdy ---------- */
function runTD(run) { const ts = [], ds = []; for (let i = 0; i < run.s.length; i += 2) { ts.push(run.s[i]); ds.push(run.s[i + 1]); } return { ts, ds }; }
function ghostFrom(run, label) { const { ts, ds } = runTD(run); return { ts, ds, total: run.total, name: label || run.driver }; }
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
function ghostSectors(g, r) { const a = gTime(g, r.sect[0]), b = gTime(g, r.sect[1]); return [a, b - a, g.total - b]; }
// rychlost v km/h u každého bodu jízdy (nové jízdy ji mají uloženou, starým se dopočítá)
function runSpeeds(run) {
  const { ts, ds } = runTD(run);
  if (run.v && run.v.length === ts.length) return { ts, ds, v: run.v.slice() };
  const v = ts.map((_, i) => {
    const a = Math.max(0, i - 2), b = Math.min(ts.length - 1, i + 2);
    return ts[b] > ts[a] ? (ds[b] - ds[a]) / (ts[b] - ts[a]) * 3.6 : 0;
  });
  return { ts, ds, v };
}

/* ---------- úložiště: Firebase (s kámošema) nebo jen tohle zařízení ---------- */
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
  async update(col, key, id, patch) {
    if (this.cloud) { await this.db.collection(col).doc(id).update(patch); return; }
    this.lsSet(key, this.lsGet(key).map(x => x.id === id ? { ...x, ...patch } : x));
  },
  async removeRoute(id) {
    if (this.cloud) {
      const q = await this.db.collection('runs').where('routeId', '==', id).get();
      await Promise.all(q.docs.map(d => d.ref.delete()));
      await this.db.collection('routes').doc(id).delete(); return;
    }
    this.lsSet('gr_routes', this.lsGet('gr_routes').filter(x => x.id !== id));
    this.lsSet('gr_runs', this.lsGet('gr_runs').filter(x => x.routeId !== id));
  },
  async removeRun(id) {
    if (this.cloud) { await this.db.collection('runs').doc(id).delete(); return; }
    this.lsSet('gr_runs', this.lsGet('gr_runs').filter(x => x.id !== id));
  },
  routes() { return this.all('routes', 'gr_routes'); },
  runs() { return this.all('runs', 'gr_runs'); },
  saveRoute(r) { return this.put('routes', 'gr_routes', { id: r.id, name: r.name, c: r.coords.flat().map(v => +v.toFixed(6)), createdBy: r.createdBy, createdAt: r.createdAt }); },
  saveRun(run) { return this.put('runs', 'gr_runs', run); }
};

/* ---------- stav appky ---------- */
const App = { me: '', routes: [], runs: [], cur: null, mode: 'stand', tab: 'board', query: '', curRun: null, runFrom: 'detail', selRoute: null };
function getName() { try { return localStorage.getItem('gr_name') || ''; } catch (e) { return ''; } }
function setName(n) { try { localStorage.setItem('gr_name', n); } catch (e) { } }

const SCREENS = ['name', 'home', 'rmap', 'new', 'detail', 'run', 'race', 'result'];
const MAP_SCREENS = ['new', 'race', 'rmap'];
function show(name) {
  SCREENS.forEach(s => { $('#scr-' + s).hidden = s !== name; });
  $('#map').style.visibility = MAP_SCREENS.includes(name) ? 'visible' : 'hidden';
  if (map && map.getLayer && map.getLayer('all-line')) {
    const vis = name === 'rmap' ? 'visible' : 'none';
    ['all-dim', 'all-line', 'all-sel', 'all-hit'].forEach(id => map.setLayoutProperty(id, 'visibility', vis));
    ['route-casing', 'route-line'].forEach(id => map.setLayoutProperty(id, 'visibility', name === 'rmap' ? 'none' : 'visible'));
  }
  if (map) setTimeout(() => map.resize(), 30);
  const sc = $('#scr-' + name); if (sc && sc.classList.contains('panel')) sc.scrollTop = 0;
}

const modeOf = x => x.start || 'stand';
function runsOf(routeId, mode) { return App.runs.filter(x => x.routeId === routeId && x.sectors && x.sectors.length === 3 && (!mode || modeOf(x) === mode)); }
function bestOf(runs) { return runs.length ? runs.reduce((b, x) => x.total < b.total ? x : b) : null; }
function sectorBests(runs) { return [0, 1, 2].map(k => runs.length ? Math.min(...runs.map(x => x.sectors[k])) : Infinity); }
const mine = runs => runs.filter(x => x.driver === App.me);
// barva sektoru: fialová = nejlepší ze všech, zelená = osobní rekord, žlutá = pomalejší
function secCls(st, k, myPB, allBest, inclusive) {
  if (inclusive ? st <= allBest[k] + 1e-6 : st < allBest[k]) return 'purple';
  if (inclusive ? st <= myPB[k] + 1e-6 : st < myPB[k]) return 'green';
  return 'yellow';
}

/* ---------- mapa ---------- */
let map = null, mapReady = null, pins = [], carMk = null, ghostMk = null;
const EMPTY = { type: 'FeatureCollection', features: [] };
function initMap() {
  if (mapReady) return mapReady;
  map = new maplibregl.Map({ container: 'map', style: MAP_STYLE, center: HOME_CENTER, zoom: 13, attributionControl: { compact: true }, maxPitch: 75 });
  mapReady = new Promise(ok => map.on('load', () => {
    map.addSource('route', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#08243F', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 7, 18, 22] } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#6FB6FF', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 12] } });
    map.addSource('all', { type: 'geojson', data: EMPTY });
    const lay = { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' };
    map.addLayer({ id: 'all-dim', type: 'line', source: 'all', filter: ['==', ['get', 'n'], 0], layout: lay, paint: { 'line-color': '#5F5E5A', 'line-width': 4, 'line-opacity': 0.7 } });
    map.addLayer({ id: 'all-line', type: 'line', source: 'all', filter: ['>', ['get', 'n'], 0], layout: lay, paint: { 'line-color': '#6FB6FF', 'line-width': ['interpolate', ['linear'], ['get', 'n'], 1, 5, 10, 9], 'line-opacity': 0.95 } });
    map.addLayer({ id: 'all-sel', type: 'line', source: 'all', filter: ['==', ['get', 'id'], ''], layout: lay, paint: { 'line-color': '#8E4CFF', 'line-width': 9 } });
    map.addLayer({ id: 'all-hit', type: 'line', source: 'all', layout: lay, paint: { 'line-color': '#000', 'line-width': 26, 'line-opacity': 0.01 } });
    map.on('click', 'all-hit', e => { if (!$('#scr-rmap').hidden && e.features && e.features[0]) selectRoute(e.features[0].properties.id); });
    map.on('mouseenter', 'all-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'all-hit', () => { map.getCanvas().style.cursor = ''; });
    ok();
  }));
  map.on('click', onMapClick);
  return mapReady;
}
function setRouteOnMap(coords) {
  map.getSource('route').setData(coords ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } : EMPTY);
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
function boundsOf(list) {
  return list.reduce((b, c) => [[Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])], [Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])]], [[180, 90], [-180, -90]]);
}
function fitCoords(coords, pad) { map.fitBounds(boundsOf(coords), { padding: pad || 80, pitch: 0, bearing: 0, duration: 600 }); }

/* ---------- hlas ---------- */
function say(text, showBubble = true) {
  if (showBubble) { $('#rVoice').hidden = false; $('#rVoiceTxt').textContent = '„' + text + '“'; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'cs-CZ'; u.rate = 0.92;
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('cs')); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) { }
}
function timeSpeech(t) {
  const m = Math.floor(t / 60), s = (t - m * 60).toFixed(1).replace('.', ',');
  const mw = m === 1 ? 'minuta' : m >= 2 && m <= 4 ? 'minuty' : 'minut';
  return (m ? m + ' ' + mw + ' ' : '') + s + ' sekundy';
}
function unlockVoice() { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { } }
let wake = null;
async function keepAwake() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) { } }
function releaseAwake() { try { wake && wake.release(); } catch (e) { } wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && RS && RS.phase !== 'done' && !$('#scr-race').hidden) keepAwake(); });

/* ---------- náhledy tras (SVG) ---------- */
function routeProj(r, w, h, pad) {
  prep(r);
  const c0 = Math.cos(r.coords[0][1] * RAD);
  const xs = r.coords.map(c => c[0] * c0), ys = r.coords.map(c => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min((w - pad * 2) / ((maxX - minX) || 1e-9), (h - pad * 2) / ((maxY - minY) || 1e-9));
  const ox = (w - (maxX - minX) * s) / 2, oy = (h - (maxY - minY) * s) / 2;
  return xs.map((x, i) => [(x - minX) * s + ox, h - ((ys[i] - minY) * s + oy)]);
}
const pathD = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
function routeSvg(r, w, h) {
  const pts = routeProj(r, w, h, 20), d = pathD(pts), a = pts[0], b = pts[pts.length - 1];
  return `<path d="${d}" fill="none" stroke="#3A4048" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#6FB6FF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${a[0]}" cy="${a[1]}" r="6" fill="#F2F1EC"/><circle cx="${b[0]}" cy="${b[1]}" r="6" fill="#0E1013" stroke="#F2F1EC" stroke-width="3"/>`;
}
// trasa obarvená podle sektorů + štítky s časy
function sectorMapSvg(r, w, h, secs, classes) {
  const pts = routeProj(r, w, h, 34);
  const parts = [[], [], []];
  pts.forEach((p, i) => {
    const d = r.cum[i];
    const k = d < r.sect[0] ? 0 : d < r.sect[1] ? 1 : 2;
    parts[k].push(p);
    if (k > 0 && parts[k].length === 1 && parts[k - 1].length) parts[k - 1].push(p);
  });
  let out = `<path d="${pathD(pts)}" fill="none" stroke="#0E1013" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`;
  parts.forEach((pp, k) => { if (pp.length > 1) out += `<path d="${pathD(pp)}" fill="none" stroke="${COL[classes[k]] || '#6FB6FF'}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`; });
  const a = pts[0], b = pts[pts.length - 1];
  out += `<circle cx="${a[0]}" cy="${a[1]}" r="7" fill="#F2F1EC"/><circle cx="${b[0]}" cy="${b[1]}" r="7" fill="#0E1013" stroke="#F2F1EC" stroke-width="3.5"/>`;
  parts.forEach((pp, k) => {
    if (!pp.length) return;
    const m = pp[Math.floor(pp.length / 2)], cls = classes[k];
    const label = `S${k + 1} ${fmt(secs[k])}`, lw = label.length * 7.4 + 14;
    const x = Math.max(4, Math.min(w - lw - 4, m[0] - lw / 2)), y = Math.max(4, Math.min(h - 28, m[1] - 34));
    out += `<rect x="${x}" y="${y}" width="${lw}" height="24" rx="7" fill="${COL[cls] || '#6FB6FF'}"/><text x="${x + lw / 2}" y="${y + 16.5}" text-anchor="middle" font-size="13" font-weight="600" font-family="Barlow, sans-serif" fill="${cls === 'purple' ? '#FFFFFF' : cls === 'green' ? '#06301A' : '#2B2200'}">${label}</text>`;
  });
  return out;
}

/* ================= DOMŮ ================= */
async function loadData() {
  try { [App.routes, App.runs] = await Promise.all([Store.routes(), Store.runs()]); }
  catch (e) { console.warn(e); App.loadErr = true; }
  App.routes.forEach(prep);
  App.runs.forEach(x => { if (x.driver && x.driver.endsWith(' (test)')) { x.driver = x.driver.slice(0, -7); x.sim = true; } });
  const last = id => Math.max(0, ...App.runs.filter(x => x.routeId === id).map(x => x.date || 0));
  App.routes.sort((a, b) => (last(b.id) || b.createdAt || 0) - (last(a.id) || a.createdAt || 0));
}
function recordCol(label, my, all) {
  const extra = all && (!my || all.id !== my.id) ? `<div class="lbl">nejlepší ${fmt(all.total)} · ${esc(all.driver)}</div>` : '';
  return `<div><div class="lbl">${label}</div><div class="num">${my ? fmt(my.total) : '–'}</div>${extra}</div>`;
}
function renderHome() {
  const b = $('#modeBadge');
  b.classList.toggle('on', Store.cloud);
  b.querySelector('span').textContent = Store.cloud ? 'Online – s kámošema' : 'Jen v tomhle zařízení';
  $('#meBadge').textContent = App.me;
  const list = $('#routeList');
  const q = norm(App.query.trim());
  const routes = App.routes.filter(r => !q || norm(r.name).includes(q));
  let html = App.loadErr ? `<div class="empty warn">Nepodařilo se načíst data. Zkontroluj internet nebo nastavení Firebase.</div>` : '';
  if (!App.routes.length) html += `<div class="empty">Zatím nemáš žádnou trasu. Dej <b>Nová trasa</b>, ťukni na mapu na start a cíl a appka sama najde cestu po silnici.</div>`;
  else if (!routes.length) html += `<div class="empty">Žádná trasa neodpovídá „${esc(App.query)}“.</div>`;
  html += routes.map(r => {
    const all = runsOf(r.id), st = runsOf(r.id, 'stand'), fl = runsOf(r.id, 'fly');
    const drivers = new Set(all.map(x => x.driver)).size;
    return `<button class="rcard" data-id="${esc(r.id)}">
      <svg viewBox="0 0 360 110" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${routeSvg(r, 360, 110)}</svg>
      <div class="body">
        <div class="name">${esc(r.name)}</div>
        <div class="meta"><span>${km(r.length)} km</span><span>${all.length} jízd</span><span>${drivers} ${drivers === 1 ? 'jezdec' : drivers >= 2 && drivers <= 4 ? 'jezdci' : 'jezdců'}</span></div>
        <div class="times">${recordCol('Z místa', bestOf(mine(st)), bestOf(st))}<div style="text-align:right">${recordCol('Letmý', bestOf(mine(fl)), bestOf(fl))}</div></div>
      </div></button>`;
  }).join('');
  list.innerHTML = html;
  list.querySelectorAll('.rcard').forEach(el => el.onclick = () => openDetail(el.dataset.id));
}
async function goHome() { show('home'); await loadData(); renderHome(); }

/* ================= MAPA TRAS ================= */
async function openRouteMap() {
  show('rmap'); await initMap();
  setRouteOnMap(null); clearRaceMarkers();
  const feats = App.routes.map(r => ({ type: 'Feature', properties: { id: r.id, n: runsOf(r.id).length }, geometry: { type: 'LineString', coordinates: r.coords } }));
  map.getSource('all').setData({ type: 'FeatureCollection', features: feats });
  show('rmap');
  $('#rmapSheet').hidden = true;
  $('#rmapEmpty').hidden = App.routes.length > 0;
  map.setFilter('all-sel', ['==', ['get', 'id'], '']);
  if (App.routes.length) map.fitBounds(boundsOf(App.routes.flatMap(r => r.coords)), { padding: { top: 120, bottom: 220, left: 50, right: 50 }, pitch: 0, bearing: 0, duration: 600 });
  else map.jumpTo({ center: HOME_CENTER, zoom: 12, pitch: 0, bearing: 0 });
}
function selectRoute(id) {
  const r = App.routes.find(x => x.id === id); if (!r) return;
  App.selRoute = id;
  map.setFilter('all-sel', ['==', ['get', 'id'], id]);
  const all = runsOf(id), myS = bestOf(mine(runsOf(id, 'stand'))), myF = bestOf(mine(runsOf(id, 'fly')));
  $('#rmapName').textContent = r.name;
  $('#rmapMeta').textContent = `${km(r.length)} km · ${all.length} jízd`;
  $('#rmapRec').innerHTML = `<div><div class="lbl">Z místa</div><div class="num">${myS ? fmt(myS.total) : '–'}</div></div><div style="text-align:right"><div class="lbl">Letmý</div><div class="num">${myF ? fmt(myF.total) : '–'}</div></div>`;
  $('#rmapSheet').hidden = false;
}

/* ================= NOVÁ TRASA ================= */
const NR = { step: 0, a: null, b: null, coords: null, busy: false };
async function openNew() {
  show('new'); await initMap(); show('new');
  Object.assign(NR, { step: 1, a: null, b: null, coords: null, busy: false });
  setRouteOnMap(null); clearRaceMarkers();
  $('#newSheet').hidden = true; $('#newHere').hidden = false; $('#newHereBtn').textContent = 'Start tam, kde stojím';
  $('#newHint').textContent = 'Ťukni na mapu na START, nebo dej start tam, kde stojíš.';
  map.jumpTo({ pitch: 0, bearing: 0 });
  navigator.geolocation && navigator.geolocation.getCurrentPosition(p => map.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 14 }), () => map.flyTo({ center: HOME_CENTER, zoom: 13 }), { timeout: 6000 });
}
function setStart(p) {
  NR.a = p; NR.step = 2; setRouteOnMap([p, p]);
  $('#newHere').hidden = true;
  $('#newHint').textContent = 'Teď ťukni na CÍL.';
}
function startHere() {
  const b = $('#newHereBtn');
  if (!('geolocation' in navigator)) { b.textContent = 'Tohle zařízení nemá GPS'; return; }
  b.textContent = 'Zjišťuju polohu…';
  navigator.geolocation.getCurrentPosition(pos => {
    const p = [pos.coords.longitude, pos.coords.latitude];
    setStart(p); map.flyTo({ center: p, zoom: 15 });
  }, err => {
    b.textContent = err.code === 1 ? 'Povol polohu pro Safari a zkus znovu' : 'Polohu se nepodařilo zjistit, zkus znovu';
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
async function onMapClick(e) {
  if ($('#scr-new').hidden || NR.busy || NR.step === 0) return;
  const p = [e.lngLat.lng, e.lngLat.lat];
  if (NR.step === 1) { setStart(p); return; }
  if (NR.step === 2) {
    NR.b = p; NR.busy = true; $('#newHint').textContent = 'Hledám trasu po silnici…';
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${NR.a[0]},${NR.a[1]};${NR.b[0]},${NR.b[1]}?overview=full&geometries=geojson`;
      const j = await (await fetch(url)).json();
      if (!j.routes || !j.routes.length) throw new Error('no route');
      NR.coords = j.routes[0].geometry.coordinates;
      if (NR.coords.length < 2 || j.routes[0].distance < 100) {
        $('#newHint').textContent = 'Start a cíl jsou moc blízko. Ťukni znovu na CÍL dál po silnici.';
        NR.step = 2; NR.busy = false; setRouteOnMap([NR.a, NR.a]); return;
      }
      setRouteOnMap(NR.coords); fitCoords(NR.coords, 90);
      const r = prep({ coords: NR.coords });
      $('#newHint').textContent = `Trasa ${km(r.length)} km. Pojmenuj ji a ulož.`;
      $('#newSheet').hidden = false; NR.step = 0;
    } catch (err) {
      $('#newHint').textContent = 'Trasu se nepodařilo najít. Ťukni znovu na START, přímo na silnici.';
      NR.step = 1; setRouteOnMap(null); $('#newHere').hidden = false;
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
let delArmed = false;
function openDetail(id) {
  const r = App.routes.find(x => x.id === id); if (!r) return goHome();
  App.cur = r; prep(r);
  $('#detName').textContent = r.name;
  $('#detMeta').textContent = `${km(r.length)} km · 3 sektory${r.createdBy ? ' · vytvořil ' + r.createdBy : ''}`;
  $('#detPreview').innerHTML = routeSvg(r, 360, 150);
  $('#detRenameRow').hidden = true; $('#detTools').hidden = false;
  $('#detDelete').textContent = 'Smazat trasu'; delArmed = false;
  renderDetailBody();
  show('detail');
}
function renderDetailBody() {
  const r = App.cur, mode = App.mode, runs = runsOf(r.id, mode);
  document.querySelectorAll('#detMode button').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
  document.querySelectorAll('#detTab button').forEach(b => b.classList.toggle('on', b.dataset.v === App.tab));
  const sb = sectorBests(runs), myPB = sectorBests(mine(runs));
  const board = $('#detBoard'), hist = $('#detHistory');
  board.hidden = App.tab !== 'board'; hist.hidden = App.tab !== 'history';

  if (App.tab === 'board') {
    const byDriver = {};
    runs.forEach(x => { if (!byDriver[x.driver] || x.total < byDriver[x.driver].total) byDriver[x.driver] = x; });
    const rows = Object.values(byDriver).sort((a, b) => a.total - b.total);
    if (!rows.length) board.innerHTML = `<div class="empty">${MODES[mode]}: na trase ještě nikdo nejel. První jízda nastaví ghosta.</div>`;
    else board.innerHTML = `<div class="brow headrow"><span></span><span>Jezdec</span><span class="c">S1</span><span class="c">S2</span><span class="c">S3</span><span style="text-align:right">Čas</span></div>` +
      rows.map((x, i) => `<button class="brow${x.driver === App.me ? ' me' : ''}" data-run="${esc(x.id)}"><span style="text-align:center;font-weight:600">${i + 1}</span><span class="n">${esc(x.driver)}${x.sim ? ' <span class="lbl">test</span>' : ''}</span>${x.sectors.map((s, k) => `<span class="c${s <= sb[k] + 1e-6 ? ' purple' : ''}">${fmt(s)}</span>`).join('')}<span class="t">${fmt(x.total)}</span></button>`).join('');
  } else {
    const list = mine(runs).sort((a, b) => (b.date || 0) - (a.date || 0));
    const pb = bestOf(list);
    if (!list.length) hist.innerHTML = `<div class="empty">${MODES[mode]}: zatím žádná tvoje jízda.</div>`;
    else hist.innerHTML = list.map(x => `<button class="hrow" data-run="${esc(x.id)}">
        <span class="tx"><b>${fmt(x.total)}</b><span>${dateStr(x.date || 0)}${x.sim ? ' · test' : ''}</span></span>
        <span class="mini">${x.sectors.map((s, k) => `<i class="${secCls(s, k, myPB, sb, true)}">${fmt(s)}</i>`).join('')}</span>
        ${pb && pb.id === x.id ? '<span class="tag">Rekord</span>' : ''}
      </button>`).join('');
  }
  document.querySelectorAll('#scr-detail [data-run]').forEach(el => el.onclick = () => {
    const run = App.runs.find(x => x.id === el.dataset.run); if (run) openRun(run, 'detail');
  });

  // výběr ghosta
  const opts = [], myBest = bestOf(mine(runs)), top = bestOf(runs);
  if (myBest) opts.push({ v: 'me', t: 'Můj rekord', s: 'Tvoje nejlepší jízda', time: myBest.total });
  if (top && (!myBest || top.id !== myBest.id)) opts.push({ v: 'top', t: top.driver, s: 'Nejrychlejší na trase', time: top.total });
  if (runs.length >= 2) { const ig = idealGhost(runs, r); opts.push({ v: 'ideal', t: 'Ideální kolo', s: 'Všechny fialový sektory dohromady', time: ig.total, purple: true }); }
  opts.push({ v: 'none', t: 'Bez ghosta', s: 'Jen změřit čas' });
  $('#detGhosts').innerHTML = opts.map((o, i) => `<label class="opt"><input type="radio" name="ghost" value="${o.v}" ${i === 0 ? 'checked' : ''}><span class="tx"><b>${esc(o.t)}</b><span>${o.s}</span></span>${o.time ? `<span class="num"${o.purple ? ' style="color:var(--purple-soft)"' : ''}>${fmt(o.time)}</span>` : ''}</label>`).join('');
  $('#detStartTxt').textContent = mode === 'fly' ? 'Na start · letmý' : 'Na start · z místa';
}
function pickGhost() {
  const r = App.cur, runs = runsOf(r.id, App.mode), v = (document.querySelector('input[name=ghost]:checked') || {}).value;
  if (v === 'me') { const x = bestOf(mine(runs)); return x && ghostFrom(x, 'Můj rekord'); }
  if (v === 'top') { const x = bestOf(runs); return x && ghostFrom(x); }
  if (v === 'ideal') return idealGhost(runs, r);
  return null;
}
function renameStart() {
  $('#detTools').hidden = true; $('#detRenameRow').hidden = false;
  const i = $('#detRenameInput'); i.value = App.cur.name; i.focus();
}
async function renameSave() {
  const n = $('#detRenameInput').value.trim();
  if (!n) { $('#detRenameInput').focus(); return; }
  try { await Store.update('routes', 'gr_routes', App.cur.id, { name: n }); App.cur.name = n; } catch (e) { }
  openDetail(App.cur.id);
}
async function deleteRoute() {
  const b = $('#detDelete');
  if (!delArmed) {
    delArmed = true; b.textContent = 'Opravdu? Ťukni znovu';
    setTimeout(() => { delArmed = false; b.textContent = 'Smazat trasu'; }, 3000); return;
  }
  b.textContent = 'Mažu…';
  try { await Store.removeRoute(App.cur.id); } catch (e) { b.textContent = 'Smazání selhalo'; return; }
  goHome();
}

/* ================= DETAIL JÍZDY ================= */
let runDelArmed = false;
function openRun(run, from) {
  App.curRun = run; App.runFrom = from || 'detail';
  const r = App.routes.find(x => x.id === run.routeId) || App.cur; prep(r);
  const mode = modeOf(run), runs = runsOf(r.id, mode);
  const others = runs.some(x => x.id === run.id) ? runs : runs.concat([run]);
  const myRuns = mine(others), pb = bestOf(myRuns);
  const sb = sectorBests(others), myPB = sectorBests(myRuns);
  $('#runTitle').textContent = (pb && pb.id === run.id ? 'Můj rekord · ' : '') + fmt(run.total);
  $('#runSub').textContent = `${dateStr(run.date || Date.now())} · ${r.name} · ${MODES[mode]}${run.sim ? ' · test' : ''}`;

  const { ds, v } = runSpeeds(run);
  const avg = r.length / run.total * 3.6;
  let iMax = -1, iMin = -1;
  ds.forEach((d, i) => {
    if (d > 30 && (iMax < 0 || v[i] > v[iMax])) iMax = i;
    if (d > 150 && d < r.length - 80 && (iMin < 0 || v[i] < v[iMin])) iMin = i;
  });
  const tile = (l, val, unit, sub, color) => `<div class="tile"><div class="lbl">${l}</div><div class="num"${color ? ` style="color:${color}"` : ''}>${val}${unit ? ` <small>${unit}</small>` : ''}</div>${sub ? `<div class="lbl">${sub}</div>` : ''}</div>`;
  let vsTile;
  if (run.vs && run.vs.total) { const d = run.total - run.vs.total; vsTile = tile('Proti ghostovi', fmtD(d) + ' s', '', `${esc(run.vs.name)} ${fmt(run.vs.total)}`, d < 0 ? 'var(--green)' : 'var(--yellow)'); }
  else vsTile = tile('Start', MODES[mode], '', run.sim ? 'testovací jízda' : '');
  $('#runTiles').innerHTML =
    tile('Průměrná rychlost', Math.round(avg), 'km/h') +
    tile('Nejvyšší rychlost', iMax >= 0 ? Math.round(v[iMax]) : '–', 'km/h', iMax >= 0 ? `na ${km(ds[iMax])} km` : '') +
    tile('Nejpomalejší místo', iMin >= 0 ? Math.round(v[iMin]) : '–', 'km/h', iMin >= 0 ? `na ${km(ds[iMin])} km` : '') +
    vsTile;

  // čas na kilometr
  const { ts } = runTD(run);
  const tAt = d => interp(ds, ts, d);
  const splits = [];
  const full = Math.floor(r.length / 1000);
  for (let k = 1; k <= full; k++) splits.push({ l: `${k}. km`, t: tAt(k * 1000) - tAt((k - 1) * 1000), len: 1000 });
  const rest = r.length - full * 1000;
  if (rest > 50) splits.push({ l: `${km(rest)} km`, t: run.total - tAt(full * 1000), len: rest });
  const maxT = Math.max(...splits.map(s => s.t));
  $('#runSplits').innerHTML = splits.map(s => `<div class="split"><span class="lbl">${s.l}</span><span class="bar"><i style="width:${Math.max(4, s.t / maxT * 100).toFixed(0)}%"></i></span><b>${fmt(s.t)}</b></div>`).join('');

  const classes = run.sectors.map((s, k) => secCls(s, k, myPB, sb, true));
  $('#runMap').innerHTML = sectorMapSvg(r, 350, 190, run.sectors, classes);
  $('#runSecs').innerHTML = run.sectors.map((s, k) => `<div class="chip ${classes[k]}"><div class="lbl">S${k + 1}</div><div class="num">${fmt(s)}</div></div>`).join('');
  const saved = App.runs.some(x => x.id === run.id);
  $('#runDelete').hidden = !saved || run.driver !== App.me;
  $('#runDelete').textContent = 'Smazat jízdu'; runDelArmed = false;
  show('run');
}
async function deleteRun() {
  const b = $('#runDelete');
  if (!runDelArmed) { runDelArmed = true; b.textContent = 'Opravdu? Ťukni znovu'; setTimeout(() => { runDelArmed = false; b.textContent = 'Smazat jízdu'; }, 3000); return; }
  b.textContent = 'Mažu…';
  try { await Store.removeRun(App.curRun.id); } catch (e) { b.textContent = 'Smazání selhalo'; return; }
  App.runs = App.runs.filter(x => x.id !== App.curRun.id);
  App.tab = 'history'; openDetail(App.curRun.routeId);
}
function runBack() {
  if (App.runFrom === 'result' && RS && RS.run) show('result');
  else openDetail(App.curRun.routeId);
}
function raceThisRun() {
  const run = App.curRun;
  App.mode = modeOf(run);
  App.cur = App.routes.find(x => x.id === run.routeId) || App.cur;
  startRace({ ghost: ghostFrom(run, run.driver === App.me ? 'Jízda ' + dateStr(run.date || Date.now()) : run.driver) });
}

/* ================= ZÁVOD ================= */
let RS = null;
function clock() { return RS && RS.sim ? RS.base + (performance.now() - RS.base) * SIMK : performance.now(); }
function clearRaceMarkers() { if (carMk) carMk.remove(); if (ghostMk) ghostMk.remove(); carMk = ghostMk = null; }

async function startRace(opts) {
  const r = App.cur, mode = App.mode, runs = runsOf(r.id, mode);
  const sim = $('#detSim').checked;
  const ghost = opts && 'ghost' in opts ? opts.ghost : pickGhost();
  const myBest = bestOf(mine(runs));
  RS = {
    route: r, ghost, sim, mode, phase: 'wait', base: performance.now(),
    cmp: ghost || (myBest ? ghostFrom(myBest, 'Můj rekord') : null),
    fix: null, idx: null, disp: 0, camH: headingAt(r, 0), lastFrame: performance.now(),
    samples: [], speeds: [], sectors: [], sec: 0, split: 0, t0: 0, prevS: null, prevT: 0,
    myPB: sectorBests(mine(runs)), allBest: sectorBests(runs),
    myBestTotal: myBest ? myBest.total : null, allBestTotal: (bestOf(runs) || {}).total,
    gps: null, simTimer: null, simD: mode === 'fly' ? -250 : 0, simTempo: 0.95 + Math.random() * 0.1, stopArmed: false
  };
  show('race'); await initMap(); show('race');
  setRouteOnMap(r.coords); clearRaceMarkers();
  carMk = arrowMarker('#E5484D', 1).setLngLat(r.coords[0]).addTo(map);
  if (ghost) ghostMk = arrowMarker('#6FB6FF', 0.6).setLngLat(r.coords[0]).addTo(map);
  for (let i = 0; i < 3; i++) { const e = $('#rs' + i); e.className = 'sec'; e.querySelector('.num').textContent = '–'; }
  $('#rTime').textContent = fmt(0); $('#rDeltaVal').textContent = '–'; $('#rDelta').className = '';
  $('#rDeltaLbl').textContent = ghost ? ghost.name : 'bez ghosta';
  $('#rVoice').hidden = true; $('#rGap').hidden = true; $('#rCount').hidden = true;
  $('#rGo').hidden = false; $('#rGo').textContent = mode === 'fly' ? 'Připravit letmý start' : 'Start';
  $('#rStopTxt').textContent = 'Konec'; $('#rLeft').textContent = km(r.length); $('#rSpd').textContent = '0';
  $('#rMsg').hidden = false;
  $('#rMsg').textContent = sim ? 'Testovací jízda. ' + (mode === 'fly' ? 'Dej Připravit a auto se rozjede ke startu.' : 'Dej Start.') : 'Čekám na GPS…';
  map.jumpTo({ center: r.coords[0], zoom: 18.3, pitch: 64, bearing: RS.camH });
  startGPS();
  requestAnimationFrame(frame);
}

function startGPS() {
  if (RS.sim) {
    const tick = () => {
      if (!RS || RS.phase === 'done') return;
      const r = RS.route;
      let v = 0;
      if (RS.phase === 'race' || RS.phase === 'armed') {
        if (RS.simD < 0) v = 15 * RS.simTempo;
        else {
          const d = Math.min(RS.simD, r.length - 1), ahead = Math.min(d + 70, r.length);
          const turn = ahead - d > 20 ? Math.abs(angDiff(headingAt(r, d), headingAt(r, ahead))) : 0;
          v = Math.max(8, 24 - turn * 0.28) * RS.simTempo * (0.97 + Math.random() * 0.06);
        }
        RS.simD = Math.min(r.length + 40, RS.simD + v);
      }
      let p;
      if (RS.simD < 0) p = moveBy(r.coords[0], (headingAt(r, 0) + 180) % 360, -RS.simD);
      else if (RS.simD > r.length) p = moveBy(pointAt(r, r.length), headingAt(r, r.length), RS.simD - r.length);
      else p = pointAt(r, RS.simD);
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
  const prev = RS.fix;
  let spd = (speed != null && speed >= 0) ? speed : 0;
  if ((speed == null || speed < 0) && prev && t > prev.t) spd = Math.max(0, hav(prev.p, p) / ((t - prev.t) / 1000));
  const h = prev && hav(prev.p, p) > 2 ? brg(prev.p, p) : (prev ? prev.h : headingAt(r, 0));
  $('#rSpd').textContent = Math.round(spd * 3.6);

  // letmý start: čekám na projetí startovní čáry
  if (RS.phase === 'armed') {
    const ss = startSide(r, p);
    if (RS.prevS != null && RS.prevS < 0 && ss.s >= 0 && ss.lat < 40) {
      const tc = RS.prevT + (0 - RS.prevS) / (ss.s - RS.prevS) * (t - RS.prevT);
      RS.t0 = tc; RS.phase = 'race'; RS.samples = [[0, 0]]; RS.speeds = [Math.round(spd * 3.6)]; RS.disp = 0; RS.split = 0;
      RS.fix = { p, d: 0, t: tc, spd, off: 0, acc, h };
      $('#rMsg').hidden = true; say('Start', false);
    } else {
      RS.prevS = ss.s; RS.prevT = t;
      RS.fix = { p, d: 0, t, spd, off: ss.lat, acc, h };
      $('#rMsg').hidden = false;
      $('#rMsg').textContent = ss.s < 0 ? `Start za ${ss.s < -1000 ? km(-ss.s) + ' km' : Math.round(-ss.s) + ' m'}. Projeď jím v plný rychlosti.` : 'Jsi za startem. Otoč se a projeď startem znovu.';
      return;
    }
  }

  const pr = project(r, p, RS.idx); RS.idx = pr.i;
  let d = pr.d;
  if (RS.phase === 'race') d = Math.max(prev ? prev.d : 0, d);
  RS.fix = { p, d, t, spd, off: pr.off, acc, h };

  if (RS.phase === 'wait' || RS.phase === 'count') {
    if (RS.phase === 'wait' && !RS.sim) {
      if (RS.mode === 'fly') $('#rMsg').textContent = `GPS připraveno (přesnost ${Math.round(acc || 0)} m). Dej Připravit.`;
      else {
        const toStart = hav(p, r.coords[0]);
        $('#rMsg').textContent = toStart > 60 ? `Jsi ${toStart > 1000 ? km(toStart) + ' km' : Math.round(toStart) + ' m'} od startu. Dojeď na start.` : `Jsi na startu. Přesnost GPS ${Math.round(acc || 0)} m.`;
      }
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
      if (RS.phase === 'done') { RS.samples.push([tc, r.length]); RS.speeds.push(Math.round(spd * 3.6)); saveDraft(tc); return; }
    }
    RS.samples.push([rt, d]); RS.speeds.push(Math.round(spd * 3.6));
  }
}

function sectorDone(tc) {
  const k = RS.sec, st = tc - RS.split;
  RS.split = tc; RS.sectors.push(st); RS.sec++;
  const cls = secCls(st, k, RS.myPB, RS.allBest, false);
  const e = $('#rs' + k); e.className = 'sec ' + cls; e.querySelector('.num').textContent = fmt(st);
  const names = ['jedna', 'dva', 'tři'];
  const msg = { purple: 'fialová', green: 'zelená', yellow: 'žlutá, plus ' + cz(st - RS.myPB[k]) };
  if (RS.sec < 3) say('Sektor ' + names[k] + '. ' + msg[cls]);
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
  } else if (f && (RS.phase === 'armed' || RS.mode === 'fly' || (!RS.sim && f.off > 25))) {
    carPos = f.p; carH = f.h;
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
      $('#rDeltaVal').textContent = fmtD(delta);
      $('#rDelta').className = Math.abs(delta) < 0.05 ? '' : delta < 0 ? 'ahead' : 'behind';
    }
  }
  if (RS.phase === 'race') {
    $('#rTime').textContent = fmt(rt);
    $('#rLeft').textContent = km(Math.max(0, r.length - RS.disp));
    for (let i = 0; i < 3; i++) $('#rs' + i).classList.toggle('on', i === RS.sec);
  }

  RS.camH = (RS.camH + angDiff(RS.camH, carH) * Math.min(1, dtReal * 2.5) + 360) % 360;
  map.jumpTo({ center: moveBy(carPos, RS.camH, 22), bearing: RS.camH, pitch: 64, zoom: 18.3 });
  requestAnimationFrame(frame);
}

function go() {
  if (!RS || RS.phase !== 'wait') return;
  const f = RS.fix;
  if (RS.mode === 'fly') {
    unlockVoice(); keepAwake();
    RS.phase = 'armed'; RS.prevS = null; $('#rGo').hidden = true; $('#rMsg').hidden = false;
    $('#rMsg').textContent = 'Připraveno. Čas se spustí, až projedeš startem.';
    setTimeout(() => say('Připraveno. Projeď startem.', false), 150);
    return;
  }
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
    RS.samples = [[0, d0]]; RS.speeds = [0]; RS.disp = d0; RS.split = 0;
    if (RS.fix) RS.fix = { ...RS.fix, d: d0, t: RS.t0 };
  };
  step();
}

function saveDraft(total) {
  stopGPS();
  const r = RS.route;
  RS.run = {
    id: uid(), routeId: r.id, driver: App.me, total, sectors: RS.sectors.slice(0, 3),
    s: RS.samples.flatMap(([t, d]) => [+t.toFixed(2), +d.toFixed(1)]), v: RS.speeds.slice(0, RS.samples.length),
    date: Date.now(), sim: RS.sim, start: RS.mode,
    vs: RS.cmp ? { name: RS.cmp.name, total: +RS.cmp.total.toFixed(2) } : null
  };
  say('Cíl. ' + timeSpeech(total), false);
  setTimeout(showResult, 1400);
}

function showResult() {
  releaseAwake();
  const run = RS.run, r = RS.route, cmp = RS.cmp;
  const isTop = RS.allBestTotal == null || run.total < RS.allBestTotal, isPB = RS.myBestTotal == null || run.total < RS.myBestTotal;
  $('#vsMeTime').textContent = fmt(run.total);
  $('#vsMeSub').textContent = isTop ? 'Rekord trasy' : isPB ? 'Nový osobní rekord' : MODES[RS.mode];
  $('#vsGhostTime').textContent = cmp ? fmt(cmp.total) : '–';
  $('#vsGhostSub').textContent = cmp ? cmp.name : 'První jízda';
  const dg = cmp ? run.total - cmp.total : null;
  const del = $('#resDelta');
  del.textContent = cmp ? fmtD(dg) + ' s' : fmt(run.total);
  del.style.color = cmp ? (dg < 0 ? 'var(--green)' : 'var(--yellow)') : 'var(--fg)';
  $('#resSub').textContent = (cmp ? (dg < 0 ? 'rychlejší než ghost' : 'pomalejší než ghost') : 'první jízda v kategorii ' + MODES[RS.mode].toLowerCase()) + ' · ' + r.name + (RS.sim ? ' · test' : '');

  const classes = run.sectors.map((s, k) => secCls(s, k, RS.myPB, RS.allBest, false));
  const gs = cmp ? ghostSectors(cmp, r) : null;
  $('#resTable').innerHTML = `<div class="trow head"><span></span><span>Ty</span><span>Ghost</span><span>Rozdíl</span></div>` +
    run.sectors.map((s, k) => `<div class="trow"><b>S${k + 1}</b><span class="num">${fmt(s)}</span><span class="g">${gs ? fmt(gs[k]) : '–'}</span><span><i class="pill ${classes[k]}">${gs ? fmtD(s - gs[k]) : fmt(s)}</i></span></div>`).join('');

  $('#resMap').innerHTML = sectorMapSvg(r, 350, 190, run.sectors, classes);

  const spark = $('#resSparkCard');
  spark.hidden = !cmp;
  if (cmp) {
    const { ts, ds } = runTD(run), N = 40, vals = [];
    for (let i = 0; i <= N; i++) { const d = r.length * i / N; vals.push(interp(ds, ts, d) - gTime(cmp, d)); }
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = (hi - lo) || 1;
    const y = v => 4 + (v - lo) / span * 46, x = i => i / N * 266 + 2;
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const col = dg < 0 ? COL.green : COL.yellow;
    $('#resSpark').innerHTML = `<line x1="0" y1="${y(0).toFixed(1)}" x2="270" y2="${y(0).toFixed(1)}" stroke="#5F5E5A"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="${x(N).toFixed(1)}" cy="${y(vals[N]).toFixed(1)}" r="3" fill="${col}"/>`;
  }
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
$('#search').oninput = e => { App.query = e.target.value; renderHome(); };
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { if (b.dataset.view === 'map') openRouteMap(); else goHome(); });
$('#rmapDetail').onclick = () => { if (App.selRoute) openDetail(App.selRoute); };
$('#rmapGo').onclick = () => { if (App.selRoute) { openDetail(App.selRoute); startRace(); } };
$('#newBack').onclick = goHome;
$('#newReset').onclick = openNew;
$('#newSave').onclick = saveNew;
$('#newHereBtn').onclick = startHere;
$('#detBack').onclick = goHome;
$('#detRename').onclick = renameStart;
$('#detRenameSave').onclick = renameSave;
$('#detRenameInput').onkeydown = e => { if (e.key === 'Enter') renameSave(); };
$('#detDelete').onclick = deleteRoute;
document.querySelectorAll('#detMode button').forEach(b => b.onclick = () => { App.mode = b.dataset.v; renderDetailBody(); });
document.querySelectorAll('#detTab button').forEach(b => b.onclick = () => { App.tab = b.dataset.v; renderDetailBody(); });
$('#detStart').onclick = () => startRace();
$('#runBack').onclick = runBack;
$('#runRace').onclick = raceThisRun;
$('#runDelete').onclick = deleteRun;
$('#rGo').onclick = go;
$('#rStop').onclick = abortRace;
$('#resSave').onclick = saveRun;
$('#resDetail').onclick = () => openRun(RS.run, 'result');
$('#resAgain').onclick = async () => { await loadData(); openDetail(RS.route.id); startRace(); };

/* ---------- start appky ---------- */
(async function boot() {
  await Store.init();
  App.me = getName();
  if (!App.me) { show('name'); return; }
  goHome();
})();
