// Krabbz9999 - FlightTracker - tiny local server for the dashboard.
// Serves index.html and proxies the public adsb.fi feed plus aircraft photo/info lookups
// so the browser never hits CORS problems.
//
// Usage:  node server.js   (home, office and FlightAware username are set on the page under Settings)
//         PORT=8090 node server.js

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// When built into a single .exe (see build-exe.cmd), the page is bundled inside it and
// files like the airport cache live next to the .exe instead of next to this script.
let sea = null;
try { sea = require('node:sea'); if (!sea.isSea()) sea = null; } catch (e) {}
const APP_DIR = sea ? path.dirname(process.execPath) : __dirname;
const indexHtml = () => sea ? Buffer.from(sea.getAsset('index.html')) : fs.readFileSync(path.join(__dirname, 'index.html'));
// version + build number, bumped by build-exe.cmd on every build and baked into the .exe
let VERSION = { version: '1.0', build: 'dev', date: null };
try { VERSION = JSON.parse(sea ? Buffer.from(sea.getAsset('version.json')).toString() : fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')); } catch (e) {}

const PORT = Number(process.env.PORT || 8090);
// Defaults shown in Settings -> Your accounts until someone changes or clears them there.
const DEFAULT_FA_USER = 'LoveFamily9999';      // FlightAware feeder whose stats are shown
const DEFAULT_CONTACT = 'noreply@loves3d.com'; // contact Planespotters asks every app for
const contactSetting = () => 'contact' in settings ? settings.contact : DEFAULT_CONTACT;

const lookupCache = new Map(); // hex|callsign -> {photo, info, flight}
const firstSeen = new Map();   // hex -> {first, last} (ms)
const trackHist = new Map();   // hex -> [[lat, lon, alt, time], ...] while the aircraft is in range

function get(url, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    // Planespotters requires a contact URL or email in the User-Agent: the user's own contact (Settings),
    // else their FlightAware page. Without one, photos fall back to stock model photos.
    const contact = process.env.CONTACT || contactSetting() || (faUser() ? 'https://www.flightaware.com/adsb/stats/user/' + faUser() : '');
    const ua = `Krabbz9999FlightTracker/1.0 (${contact ? '+' + contact : 'home dashboard'})`;
    const req = lib.get(url, { headers: { 'User-Agent': ua }, timeout: timeoutMs }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), timeoutMs));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// Tail numbers get reused too (N865PA was a DHL A300 before it was a Cessna 172), so check the photo's
// Planespotters link (".../n865pa-dhl-aviation-airbus-a300b4-203") names the same maker as the live aircraft.
const MAKERS = ['airbus', 'boeing', 'cessna', 'piper', 'embraer', 'bombardier', 'canadair', 'cirrus', 'beech', 'hawker', 'gulfstream',
  'dassault', 'pilatus', 'diamond', 'mooney', 'robinson', 'bell', 'eurocopter', 'de-havilland', 'atr', 'mcdonnell', 'learjet',
  'daher', 'socata', 'honda', 'vans', 'lockheed', 'sikorsky', 'agusta', 'leonardo', 'grumman', 'textron', 'raytheon'];
const MAKER_GROUPS = [['cessna', 'textron'], ['beech', 'hawker', 'raytheon', 'textron'], ['bombardier', 'canadair', 'learjet', 'de-havilland'],
  ['airbus', 'eurocopter'], ['daher', 'socata'], ['agusta', 'leonardo']];
function photoMatches(link, mfr) {
  const want = (mfr || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!want) return true;
  const found = MAKERS.filter(m => (link || '').toLowerCase().includes('-' + m));
  if (!found.length) return true; // the link doesn't say, so we can't tell
  return found.some(m => { const k = m.replace(/-/g, ''); return want.includes(k) || k.includes(want) || MAKER_GROUPS.some(g => g.includes(m) && g.some(x => want.includes(x.replace(/-/g, '')))); });
}

// Stock photo of the aircraft model from Wikipedia (freely licensed), used when there's no photo of the actual plane.
// 1. By ICAO type code (GL7T, C25B, B738...): Wikipedia's "List of aircraft type designators" names the exact
//    article for each code, so that's tried first. The list is fetched once and cached for a week.
// 2. Otherwise a search: "maker model" (hyphens dropped: "Cirrus SF50 Vision"), the base model ("Piper PA28"
//    for "PA-28-140/150/160/180"), then "model aircraft". A page counts only if its title names the model number,
//    since the top hit is often the maker's page with no picture, or something unrelated.
const TYPES_CACHE = path.join(APP_DIR, 'aircraft-types-cache.json');
let typeIndex = null, typeIndexLoading = null;
function loadTypeIndex() {
  if (typeIndex) return Promise.resolve(typeIndex);
  if (typeIndexLoading) return typeIndexLoading;
  return typeIndexLoading = (async () => {
    try {
      const c = JSON.parse(fs.readFileSync(TYPES_CACHE, 'utf8'));
      if (Date.now() - c.at < 7 * 86400000) return (typeIndex = c.types);
    } catch (e) {}
    try {
      const r = await get('https://en.wikipedia.org/w/index.php?title=List_of_aircraft_type_designators&action=raw', 15000);
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      const types = {};
      // rows look like: | GL7T || CCX || [[Bombardier Global 7500|Bombardier Global 7500 / Global 8000]]
      for (const m of r.body.toString().matchAll(/^\|\s*([A-Z0-9]{2,4})\s*\|\|[^\n]*?\[\[([^\]|#]+)/gm)) types[m[1]] = types[m[1]] || m[2].trim();
      fs.writeFileSync(TYPES_CACHE, JSON.stringify({ at: Date.now(), types }));
      return (typeIndex = types);
    } catch (e) { return {}; } // try again next time
    finally { typeIndexLoading = null; }
  })();
}

const wikiPhoto = p => p?.thumbnail?.source ? { src: p.thumbnail.source, link: p.fullurl, credit: 'Wikipedia', stock: true, title: p.title } : null;
const stockCache = new Map();
async function stockPhoto(model, mfr = '', type = '') {
  const key = [mfr, model, type].join('|');
  if (stockCache.has(key)) return stockCache.get(key);
  let out = null, failed = false;
  const WIKI = 'https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages|info&inprop=url&piprop=thumbnail&pithumbsize=480';

  const article = type && (await loadTypeIndex())[type.toUpperCase()];
  if (article) {
    try {
      const r = await get(WIKI + '&titles=' + encodeURIComponent(article));
      out = wikiPhoto(Object.values(JSON.parse(r.body).query?.pages || {})[0]);
    } catch (e) { failed = true; }
  }

  if (!out && model) {
    const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    // model numbers to look for in a title: "PA-28-140/150/160/180" gives pa28140 and its base model pa28
    const tokens = [...new Set(model.split(/\s+/).flatMap(w => {
      const first = w.split('/')[0], parts = first.split('-');
      return [norm(first), parts.length > 2 ? norm(parts.slice(0, 2).join('-')) : ''];
    }).filter(t => /\d/.test(t) && t.length >= 2))];
    const plain = model.replace(/(\w)-(\w)/g, '$1$2');
    const maker = mfr && !norm(model).startsWith(norm(mfr)) ? mfr + ' ' : '';
    const base = (model.split(/\s+/)[0].split('/')[0].match(/^[A-Za-z]+-?\d+/) || [''])[0];
    const queries = [...new Set([maker + plain, base && base !== model ? maker + base : '', model + ' aircraft'].filter(Boolean))];
    let fallback = null;
    for (const q of queries) {
      try {
        const r = await get(WIKI + '&generator=search&gsrlimit=5&gsrsearch=' + encodeURIComponent(q));
        const pages = Object.values(JSON.parse(r.body).query?.pages || {})
          .filter(p => !/^List of/i.test(p.title)).sort((a, b) => a.index - b.index);
        const hit = pages.find(p => p.thumbnail?.source && tokens.some(t => norm(p.title).includes(t)));
        if (hit) { out = wikiPhoto(hit); break; }
        if (!fallback && pages[0]?.thumbnail?.source) fallback = wikiPhoto(pages[0]);
      } catch (e) { failed = true; }
    }
    out = out || (tokens.length ? null : fallback); // with a model number, a picture of something else is worse than none
  }
  if (out || !failed) stockCache.set(key, out); // a network hiccup shouldn't stick as "no photo"
  return out;
}

async function lookup(hex, cs, reg, mfr = '', model = '', type = '') {
  const key = [hex, cs, reg, mfr, model, type].join('|');
  if (lookupCache.has(key)) return lookupCache.get(key);
  const out = { photo: null, info: null, flight: null };
  // Airline + route by callsign; skip private tail-number callsigns, which never have one.
  const hasRoute = cs && /^[A-Z]{3}[0-9]/.test(cs);
  const [ps, db, route, vrs] = await Promise.allSettled([
    // by tail number when known: transponder codes get reassigned, so a hex lookup can return another plane's photo
    get(reg ? 'https://api.planespotters.net/pub/photos/reg/' + encodeURIComponent(reg) : 'https://api.planespotters.net/pub/photos/hex/' + hex),
    get('https://api.adsbdb.com/v0/aircraft/' + hex),
    hasRoute ? get('https://api.adsbdb.com/v0/callsign/' + encodeURIComponent(cs)) : Promise.reject(),
    // adsb.lol standing data (same source tar1090 uses) - fresher routes than adsbdb
    hasRoute ? get(`https://vrs-standing-data.adsb.lol/routes/${cs.slice(0, 2)}/${cs}.json`) : Promise.reject(),
  ]);
  const port = (city, code, lat, lon, icao) => ({ label: `${city} (${code})`, pos: [lat, lon], icao: icao || null });
  try {
    const f = JSON.parse(route.value.body).response?.flightroute;
    if (f) out.flight = {
      airline: f.airline?.name || null,
      airports: [f.origin, f.destination].filter(Boolean).map(p => port(p.municipality, p.iata_code || p.icao_code, p.latitude, p.longitude, p.icao_code)),
    };
  } catch (e) {}
  try {
    const v = JSON.parse(vrs.value.body);
    if (v._airports?.length >= 2) {
      out.flight = out.flight || { airline: null };
      out.flight.airports = v._airports.map(p => port(p.location || p.name, p.iata || p.icao, p.lat, p.lon, p.icao));
    }
  } catch (e) {}
  try {
    const p = (JSON.parse(ps.value.body).photos || []).find(x => photoMatches(x.link, mfr));
    if (p) out.photo = { src: p.thumbnail_large?.src || p.thumbnail?.src, link: p.link, credit: p.photographer };
  } catch (e) {}
  if (!out.photo && (model || type)) out.photo = await stockPhoto(model, mfr, type);
  try {
    const a = JSON.parse(db.value.body).response?.aircraft;
    if (a) {
      out.info = { type: a.type, manufacturer: a.manufacturer, icao_type: a.icao_type, reg: a.registration, owner: a.registered_owner, country: a.registered_owner_country_name };
      // adsbdb's photo links point at a host that refuses third-party use, so photos come from Planespotters only
    }
  } catch (e) {}
  if (out.photo || !(model || type)) lookupCache.set(key, out); // no photo yet: try again next time (stockPhoto caches real misses)
  return out;
}

// Airports from OurAirports (public domain). Downloaded once, then cached next to this file.
const AIRPORTS_CACHE = path.join(APP_DIR, 'airports-cache.json');
let airports = null;
function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
async function loadAirports() {
  if (airports) return airports;
  if (fs.existsSync(AIRPORTS_CACHE)) return (airports = JSON.parse(fs.readFileSync(AIRPORTS_CACHE, 'utf8')));
  const r = await get('https://davidmegginson.github.io/ourairports-data/airports.csv', 60000);
  if (r.status !== 200) throw new Error('Airport list download failed');
  const lines = r.body.toString('utf8').split('\n');
  const h = parseCsvLine(lines[0]), col = n => h.indexOf(n);
  const want = new Set(['large_airport', 'medium_airport', 'small_airport', 'heliport', 'seaplane_base']);
  airports = [];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = parseCsvLine(line);
    if (!want.has(f[col('type')])) continue;
    airports.push([f[col('type')], f[col('ident')], f[col('iata_code')], f[col('name')], +f[col('latitude_deg')], +f[col('longitude_deg')], +f[col('elevation_ft')] || 0, f[col('municipality')]]);
  }
  fs.writeFileSync(AIRPORTS_CACHE, JSON.stringify(airports));
  return airports;
}
function airportsNear(lat, lon, mi) {
  const dLat = mi / 69, dLon = mi / (69 * Math.cos(lat * Math.PI / 180));
  return airports
    .filter(a => Math.abs(a[4] - lat) < dLat && Math.abs(a[5] - lon) < dLon)
    .map(([type, ident, iata, name, la, lo, elev, city]) => ({ type, ident, iata, name, lat: la, lon: lo, elev, city }));
}

// ---------- aircraft data: adsb.fi public feed ----------
// adsb.fi open data: free for personal, non-commercial use, 1 request/sec max, attribution required.
const PUBLIC_NAME = 'adsb.fi', PUBLIC_LINK = 'https://adsb.fi';
const PUBLIC_RADIUS_NM = 40;
let lastPublic = null;
async function fetchAircraft() {
  // stay well under the 1/sec limit: at most one request every 5 s, shared by everyone viewing
  if (!lastPublic || Date.now() - lastPublic.at >= 5000) {
    const c = settings.home;
    if (!c) throw new Error('Set your home location (Settings) so we know where to look');
    const r = await get(`https://opendata.adsb.fi/api/v2/lat/${c[0].toFixed(4)}/lon/${c[1].toFixed(4)}/dist/${PUBLIC_RADIUS_NM}`, 8000);
    if (r.status === 429) throw new Error('Public data rate limit hit - retrying shortly');
    if (r.status !== 200) throw new Error(`Public data unavailable (HTTP ${r.status})`);
    const j = JSON.parse(r.body);
    lastPublic = { at: Date.now(), json: { now: j.now, aircraft: j.aircraft || j.ac || [] } };
  }
  return JSON.parse(JSON.stringify(lastPublic.json)); // copy: we stamp fields onto it below
}

// Polled in the background so "first seen" keeps counting even when no browser is open.
let latest = null;
async function refreshAircraft() {
  const j = await fetchAircraft();
  j.attribution = { name: PUBLIC_NAME, link: PUBLIC_LINK }; // adsb.fi asks to be credited
  const now = Date.now();
  for (const a of j.aircraft || []) {
    let f = firstSeen.get(a.hex);
    if (!f || now - f.last > 10 * 60000) firstSeen.set(a.hex, f = { first: now, last: now, pos: null });
    else f.last = now;
    // first position we heard, used by the page to work out where a local flight departed from
    if (!f.pos && a.lat != null) f.pos = [a.lat, a.lon, a.alt_baro ?? null];
    a.first_seen = f.first;
    a.first_pos = f.pos;
    // flight path for the tail-number panel: a point every ~20 s or ~0.2 mi, whichever comes first
    if (a.lat != null && (a.seen_pos ?? 0) < 60) {
      let h = trackHist.get(a.hex);
      if (!h) trackHist.set(a.hex, h = []);
      const last = h[h.length - 1];
      if (!last || now - last[3] > 20000 || Math.abs(a.lat - last[0]) + Math.abs(a.lon - last[1]) > 0.003) {
        h.push([+a.lat.toFixed(5), +a.lon.toFixed(5), a.alt_baro ?? null, now]);
        if (h.length > 4000) h.shift();
      }
    }
  }
  for (const [hex, f] of firstSeen) if (now - f.last > 10 * 60000) { firstSeen.delete(hex); trackHist.delete(hex); }
  latest = { at: now, body: JSON.stringify(j) };
  logAircraft(j.aircraft || [], now);
}
let refreshing = false; // a slow/unreachable source must not stack up overlapping refreshes
setInterval(() => {
  if (refreshing) return;
  refreshing = true;
  refreshAircraft().catch(() => {}).finally(() => { refreshing = false; });
}, 2000);

// ---------- exploring: live aircraft and ships wherever the map is scrolled to ----------
// The home feed above only covers ~46 miles around home. When the page is looking somewhere else, it asks
// /api/area for the planes there (and adds that area to the ship subscription). These never feed the
// daily log or the overhead alerts.
let areaCache = null, areaLast = 0;
async function areaAircraft(lat, lon, nm) {
  const key = `${lat.toFixed(1)},${lon.toFixed(1)},${nm}`;
  if (areaCache && areaCache.key === key && Date.now() - areaCache.at < 5000) return areaCache.data;
  // adsb.fi allows one request a second: the home feed uses one every 5 s, exploring at most one every 3 s
  const wait = 3000 - (Date.now() - areaLast);
  if (wait > 0) {
    if (areaCache && areaCache.key === key) return areaCache.data;
    await new Promise(r => setTimeout(r, wait));
  }
  areaLast = Date.now();
  const r = await get(`https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${nm}`, 10000);
  if (r.status === 429) throw new Error('Public data rate limit hit - retrying shortly');
  if (r.status !== 200) throw new Error(`Public data unavailable (HTTP ${r.status})`);
  const j = JSON.parse(r.body);
  const data = { now: j.now, aircraft: j.aircraft || j.ac || [], attribution: { name: PUBLIC_NAME, link: PUBLIC_LINK } };
  areaCache = { key, at: Date.now(), data };
  return data;
}

// ---------- daily log: every aircraft heard today, kept in daily-log.json next to the app ----------
const LOG_FILE = path.join(APP_DIR, 'daily-log.json');
const SETTINGS_FILE = path.join(APP_DIR, 'settings.json');
let settings = {};
if (fs.existsSync(SETTINGS_FILE)) {
  // files saved by some Windows editors start with a byte-order mark, which JSON.parse rejects
  try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8').replace(/^﻿/, '')); }
  catch (e) {
    // never silently overwrite someone's settings: keep the unreadable file aside and start fresh
    try { fs.copyFileSync(SETTINGS_FILE, SETTINGS_FILE + '.bad'); } catch (e2) {}
    console.log('settings.json could not be read; a copy was saved as settings.json.bad');
  }
}

function distMi(a, b) {
  const R = Math.PI / 180, dLat = (b[0] - a[0]) * R, dLon = (b[1] - a[1]) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(dLon / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}
const localDay = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayTotals = l => { const P = Object.values(l.planes); return { day: l.day, unique: P.length, military: P.filter(p => p.m & 1).length }; };

let log = { day: localDay(), planes: {} }, history = [];
try {
  const saved = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  history = saved.history || [];
  if (saved.today?.day === localDay()) log = saved.today;
  else if (saved.today) history.push(dayTotals(saved.today));
} catch (e) {}
const saveLog = () => { try { fs.writeFileSync(LOG_FILE, JSON.stringify({ today: log, history })); } catch (e) {} };
setInterval(saveLog, 60000);

// Per aircraft we keep only its personal bests, so leaderboards don't repeat the same plane.
function logAircraft(list, now) {
  if (localDay(now) !== log.day) { history.push(dayTotals(log)); history = history.slice(-30); log = { day: localDay(now), planes: {} }; saveLog(); }
  const home = settings.home;
  const hour = new Date(now).getHours();
  for (const a of list) {
    if (a.lat == null || (a.seen_pos ?? 0) > 60) continue;
    const p = log.planes[a.hex] || (log.planes[a.hex] = { first: now, hours: 0 });
    p.last = now; p.hours |= 1 << hour;
    if (a.flight && a.flight.trim()) p.f = a.flight.trim();
    if (a.r) p.r = a.r; if (a.t) p.t = a.t; if (a.desc) p.d = a.desc; if (a.ownOp) p.o = a.ownOp;
    if (a.dbFlags & 3) p.m = a.dbFlags & 3; // 1 = military, 2 = interesting (privacy flags ignored)
    const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null;
    if (a.gs != null && a.gs < 800 && (p.gs ?? 0) < a.gs) p.gs = Math.round(a.gs); // cap filters glitches
    if (alt != null && alt < 60000 && (p.alt ?? -1) < alt) p.alt = alt;
    if (home) {
      const d = distMi(home, [a.lat, a.lon]);
      if (p.cd == null || d < p.cd) { p.cd = +d.toFixed(2); p.cda = a.alt_baro ?? null; p.cdt = now; }
      // "lowest pass" only counts flights within 2 mi of home, so nearby airport landings don't dominate
      if (alt != null && alt > 0 && d <= 2 && (p.la == null || alt < p.la)) { p.la = alt; p.lat_ = now; }
    }
  }
}

function logSummary() {
  const P = Object.entries(log.planes).map(([hex, p]) => ({ hex, ...p }));
  const base = p => ({ hex: p.hex, flight: p.f || '', reg: p.r || '', type: p.t || '', desc: p.d || '', owner: p.o || '', mil: p.m || 0 });
  const top = (key, dir, extra = () => ({})) => P.filter(p => p[key] != null).sort((a, b) => dir * (a[key] - b[key])).slice(0, 5).map(p => ({ ...base(p), value: p[key], ...extra(p) }));
  const countBy = fn => {
    const m = new Map();
    for (const p of P) { const k = fn(p); if (k) m.set(k, (m.get(k) || 0) + 1); }
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, count]) => ({ key, count }));
  };
  return {
    day: log.day,
    unique: P.length,
    military: P.filter(p => p.m & 1).length,
    hourly: Array.from({ length: 24 }, (_, h) => P.filter(p => p.hours & (1 << h)).length),
    closest: top('cd', 1, p => ({ alt: p.cda, at: p.cdt })),
    lowest: top('la', 1, p => ({ at: p.lat_ })),
    fastest: top('gs', -1),
    highest: top('alt', -1),
    airlines: countBy(p => /^[A-Z]{3}[0-9]/.test(p.f || '') ? p.f.slice(0, 3) : null),
    types: countBy(p => p.d || p.t),
    special: P.filter(p => p.m).sort((a, b) => b.first - a.first).slice(0, 12).map(p => ({ ...base(p), first: p.first, cd: p.cd })),
    history: history.slice(-7),
  };
}

// ---------- FAA aircraft registry (optional) ----------
// The FAA blocks automated downloads, so the user downloads ReleasableAircraft.zip once in a browser
// (https://registry.faa.gov/database/ReleasableAircraft.zip) and drops it next to the app. We index it locally.
const FAA_ZIP = path.join(APP_DIR, 'ReleasableAircraft.zip');
const FAA_INDEX = path.join(APP_DIR, 'faa-index.json');
let faa = null; // { built, fileDate, master: { '367FX': [...] }, acft: { code: [...] } }

// Minimal zip reader (central directory + deflate), enough for the FAA file; no dependencies.
function unzipEntries(buf, wanted) {
  const zlib = require('zlib');
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen).split('/').pop().toUpperCase();
    if (wanted.includes(name)) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      out[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    }
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

function buildFaaIndex() {
  const files = unzipEntries(fs.readFileSync(FAA_ZIP), ['MASTER.TXT', 'ACFTREF.TXT']);
  if (!files['MASTER.TXT']) throw new Error('MASTER.txt not found in ReleasableAircraft.zip');
  const rows = buf => {
    // FAA files may start with a UTF-8 byte-order mark (which reads as "ï»¿" in latin1)
    const lines = buf.toString('latin1').replace(/^(﻿|ï»¿)/, '').split(/\r?\n/);
    const head = lines[0].split(',').map(h => h.trim().toUpperCase());
    return { col: n => head.indexOf(n), lines: lines.slice(1).filter(Boolean).map(l => l.split(',').map(f => f.trim())) };
  };
  const m = rows(files['MASTER.TXT']), c = m.col;
  const master = {};
  for (const f of m.lines) {
    const others = [1, 2, 3, 4, 5].map(i => f[c(`OTHER NAMES(${i})`)]).filter(Boolean);
    // Street addresses deliberately not kept: city/state is enough and many owners are private individuals.
    master[f[c('N-NUMBER')]] = [f[c('SERIAL NUMBER')], f[c('MFR MDL CODE')], f[c('YEAR MFR')], f[c('TYPE REGISTRANT')], f[c('NAME')],
      f[c('CITY')], f[c('STATE')], f[c('COUNTRY')], f[c('CERT ISSUE DATE')], f[c('AIR WORTH DATE')], f[c('EXPIRATION DATE')],
      f[c('FRACT OWNER')], others, f[c('MODE S CODE HEX')], f[c('STATUS CODE')]];
  }
  const acft = {};
  if (files['ACFTREF.TXT']) {
    const a = rows(files['ACFTREF.TXT']), ac = a.col;
    for (const f of a.lines) acft[f[ac('CODE')]] = [f[ac('MFR')], f[ac('MODEL')], f[ac('NO-SEATS')], f[ac('NO-ENG')], f[ac('TYPE-ACFT')]];
  }
  faa = { built: Date.now(), fileDate: fs.statSync(FAA_ZIP).mtimeMs, master, acft };
  fs.writeFileSync(FAA_INDEX, JSON.stringify(faa));
  console.log(`FAA registry indexed: ${Object.keys(master).length.toLocaleString()} aircraft`);
}

function loadFaa() {
  if (faa) return faa;
  const hasZip = fs.existsSync(FAA_ZIP);
  try {
    if (fs.existsSync(FAA_INDEX)) {
      const idx = JSON.parse(fs.readFileSync(FAA_INDEX, 'utf8'));
      // rebuild if a newer zip was dropped in
      if (!hasZip || fs.statSync(FAA_ZIP).mtimeMs <= idx.fileDate) return (faa = idx);
    }
    if (hasZip) buildFaaIndex();
  } catch (e) { console.log('FAA registry not loaded: ' + e.message); }
  return faa;
}

const REGISTRANT = { 1: 'Individual', 2: 'Partnership', 3: 'Corporation', 4: 'Co-owned', 5: 'Government', 7: 'LLC', 8: 'Non-citizen corporation', 9: 'Non-citizen co-owned' };
const faaDate = s => s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : null;
function registry(reg) {
  const out = { reg, faaLoaded: false, faa: null };
  if (!/^N[0-9A-Z]{1,5}$/.test(reg)) return out; // FAA covers US (N-) registrations only
  const db = loadFaa();
  if (!db) return out;
  out.faaLoaded = true;
  const r = db.master[reg.slice(1)];
  if (!r) return out;
  const [serial, mfrCode, year, type, name, city, state, country, cert, airworth, expires, fract, others, modeS, status] = r;
  const a = db.acft[mfrCode] || [];
  out.faa = {
    owner: name, otherOwners: others, fractional: fract === 'Y', registrantType: REGISTRANT[type] || null,
    city, state, country, manufacturer: a[0] || null, model: a[1] || null, seats: +a[2] || null, engines: +a[3] || null,
    year: year || null, serial, certIssued: faaDate(cert), airworthiness: faaDate(airworth), expires: faaDate(expires),
    status: status === 'V' ? 'Valid' : status || null, modeSHex: modeS ? modeS.toLowerCase() : null,
    fileDate: new Date(db.fileDate).toISOString().slice(0, 10),
  };
  return out;
}

// ---------- FlightAware feeder stats (your own public stats page), fetched at most every 30 minutes ----------
const faUser = () => ('faUser' in settings ? settings.faUser : DEFAULT_FA_USER) || '';
let faCache = null;
async function faStats() {
  if (!faUser()) return { notSet: true };
  if (faCache && faCache.user === faUser() && Date.now() - faCache.at < 30 * 60000) return faCache.data;
  const url = `https://www.flightaware.com/adsb/stats/user/${encodeURIComponent(faUser())}`;
  const r = await get(url, 15000);
  if (r.status !== 200) throw new Error(`FlightAware stats unavailable (HTTP ${r.status})`);
  // the page embeds its numbers as `var data = {...};</script>`
  const m = r.body.toString('utf8').match(/var data = (\{[\s\S]*?\});\s*<\/script>/);
  if (!m) throw new Error('FlightAware page format changed');
  const d = JSON.parse(m[1]);
  const site = Object.values(d.sites || {})[0] || {};
  const days = Object.values(site.daily_stats || {}).sort((a, b) => a.date - b.date)
    .map(x => ({ date: +x.date, aircraft: x.idents || 0, positions: x.positions || 0 }));
  const data = {
    user: d.username, link: url,
    lastCheckin: +site.last_checkin * 1000 || null,
    rank: +site.current_ranking || null, bestRank: d.top_user_ranking || null,
    airport: site.last_nearby_airport ? `${site.airport_fullname} (${site.last_nearby_airport})` : null,
    feeder: site.feeder_type || null, upToDate: site.up_to_date_piaware ?? null, latestVersion: site.current_piaware_version || null,
    mlat: site.mlat_enabled ?? null, mode: site.adsb_mode || null,
    totalAircraft: site.total_idents || null, totalPositions: site.total_positions || null,
    longestStreak: +site.longest_streak_days || null, memberSince: d.user?.joindate ? +d.user.joindate * 1000 : null,
    days: days.slice(-14),
  };
  faCache = { at: Date.now(), user: faUser(), data };
  return data;
}

// ---------- Jump to: find any place in the world for the map's search box ----------
// A 3-4 letter airport code ("MIA", "KJFK", "NAS") goes straight to the airport (OurAirports list); anything else
// is a worldwide OpenStreetMap search ("Miami", "NYC", "Nassau, Bahamas"). Only runs when someone searches.
async function placeSearch(q) {
  const out = [], code = q.trim().toUpperCase();
  // ships: one already on the map whose name matches, else a ship Wikipedia knows by that exact name (Cruise Finder)
  if (code.length >= 4) {
    for (const sh of ships.values()) {
      if (sh.lat != null && sh.name && sh.name.toUpperCase().includes(code) && out.length < 3)
        out.push({ ship: sh.mmsi, lat: sh.lat, lon: sh.lon, label: `🚢 ${sh.name} (live now)`, zoom: 12 });
    }
    if (!out.length && /[A-Z]{3}/.test(code) && /\s/.test(code)) {
      const id = await shipIds(q.trim());
      if (id) {
        const sh = ships.get(id.mmsi);
        out.push(sh && sh.lat != null
          ? { ship: id.mmsi, lat: sh.lat, lon: sh.lon, label: `🚢 ${sh.name || id.title} (live now)`, zoom: 12 }
          : { ship: id.mmsi, find: true, name: id.title, imo: id.imo, label: `🚢 Find ${id.title} (ship)` });
      }
    }
    if (out.length) return out; // a ship name: go straight to it rather than listing look-alike places
  }
  if (/^[A-Z0-9]{3,4}$/.test(code)) {
    try {
      await loadAirports();
      const rank = { large_airport: 0, medium_airport: 1, small_airport: 2, seaplane_base: 3, heliport: 4 };
      const a = airports.filter(r => r[2] === code || r[1] === code).sort((x, y) => rank[x[0]] - rank[y[0]])[0];
      if (a) out.push({ lat: a[4], lon: a[5], label: `✈ ${a[3]} (${a[2] || a[1]})${a[7] ? ', ' + a[7] : ''}`, zoom: 12 });
    } catch (e) {}
  }
  const r = await get('https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(q), 8000);
  if (r.status !== 200) {
    if (out.length) return out;
    throw new Error('Place search is unavailable right now (HTTP ' + r.status + ')');
  }
  for (const h of JSON.parse(r.body)) {
    const parts = String(h.display_name || '').split(', ');
    const label = parts.length > 3 ? [parts[0], ...parts.slice(-2)].join(', ') : parts.join(', '); // "Miami, Florida, United States"
    const b = (h.boundingbox || []).map(Number); // south, north, west, east
    out.push({ lat: +h.lat, lon: +h.lon, label, bbox: b.length === 4 && b.every(isFinite) ? b : null });
  }
  return out.slice(0, 6);
}

// ---------- place search for Settings ----------
// A US ZIP code ("33606" or "33606-1234") goes to Zippopotam.us, which knows every ZIP's town and centre;
// anything else is an address search on OpenStreetMap Nominatim (US only), returning up to 5 matches.
// With a current home, address matches near it are preferred and listed closest first
// (so "100 Main St Clearwater" finds the one in Florida, not Nebraska).
async function geocode(q, near) {
  const zip = q.match(/^(\d{5})(?:-\d{4})?$/);
  if (zip) {
    try {
      const r = await get('https://api.zippopotam.us/us/' + zip[1], 8000);
      const p = r.status === 200 && JSON.parse(r.body).places?.[0];
      if (p) return { zip: true, results: [{ lat: +p.latitude, lon: +p.longitude, label: `${p['place name']}, ${p['state abbreviation']} ${zip[1]}` }] };
    } catch (e) {}
  }
  const bias = near ? `&viewbox=${near[1] - 1.5},${near[0] + 1.5},${near[1] + 1.5},${near[0] - 1.5}` : '';
  const r = await get('https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&addressdetails=1' + bias + '&'
    + (zip ? 'postalcode=' + zip[1] : 'q=' + encodeURIComponent(q)), 8000);
  if (r.status !== 200) throw new Error('Address search is unavailable right now (HTTP ' + r.status + ')');
  const results = JSON.parse(r.body).map(h => {
    const a = h.address || {};
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const town = a.city || a.town || a.village || a.hamlet || a.suburb || a.county;
    const label = [street, town, [a.state, a.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return { lat: +h.lat, lon: +h.lon, label: label || h.display_name };
  });
  if (near) results.sort((a, b) => distMi(near, [a.lat, a.lon]) - distMi(near, [b.lat, b.lon]));
  return { zip: !!zip, results };
}

const readBody = req => new Promise(resolve => { let s = ''; req.on('data', d => s += d); req.on('end', () => resolve(s)); });

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return send(res, 200, indexHtml(), 'text/html; charset=utf-8');
    }
    if (url.pathname === '/api/aircraft') {
      if (!latest || Date.now() - latest.at > 5000) await refreshAircraft();
      return send(res, 200, latest.body);
    }
    if (url.pathname === '/api/shipinfo') {
      const name = (url.searchParams.get('name') || '').trim();
      return send(res, 200, JSON.stringify(/^[A-Za-z0-9 .'&-]{2,60}$/.test(name) ? await shipWiki(name) : null));
    }
    if (url.pathname === '/api/area') {
      const n = k => Number(url.searchParams.get(k));
      const lat = n('lat'), lon = n('lon'), nm = Math.round(Math.min(250, Math.max(10, n('nm') || 40)));
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return send(res, 400, '{"error":"bad position"}');
      return send(res, 200, JSON.stringify(await areaAircraft(lat, lon, nm)));
    }
    if (url.pathname === '/api/ships') {
      // ?explore=south,west,north,east adds the area being looked at; ?explore=off stops it
      const ex = url.searchParams.get('explore');
      if (ex === 'off') setAisExplore(null);
      else if (ex) {
        const [s0, w0, n0, e0] = ex.split(',').map(Number);
        if ([s0, w0, n0, e0].every(isFinite) && n0 > s0 && e0 > w0) {
          // at most about 4 x 6 degrees, around the middle of what was asked for
          const cy = (s0 + n0) / 2, cx = (w0 + e0) / 2, hy = Math.min(2, (n0 - s0) / 2), hx = Math.min(3, (e0 - w0) / 2);
          const r4 = v => +v.toFixed(2);
          setAisExplore([[r4(Math.min(90, cy + hy)), r4(cx - hx)], [r4(Math.max(-90, cy - hy)), r4(cx + hx)]]);
        }
      }
      return send(res, 200, JSON.stringify({ keySet: !!aisKey(), status: ais.status, error: ais.error,
        ships: [...ships.values()].filter(x => x.lat != null) }));
    }
    if (url.pathname === '/api/fastats') return send(res, 200, JSON.stringify(await faStats()));
    // Quit from the tray icon: only from this PC, and the custom header keeps other web pages from triggering it
    if (url.pathname === '/api/quit' && req.method === 'POST') {
      const local = /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
      if (!local || req.headers['x-ft-tray'] !== '1') return send(res, 403, '{"error":"forbidden"}');
      send(res, 200, '{"ok":true}');
      saveLog();
      return setTimeout(() => process.exit(0), 300);
    }
    const tk = url.pathname.match(/^\/api\/track\/([0-9a-f~]{6,7})$/i);
    if (tk) return send(res, 200, JSON.stringify({ points: trackHist.get(tk[1].toLowerCase()) || [] }));
    if (url.pathname === '/api/settings') {
      // Everything personal lives here (settings.json next to the app), so each person sets up their own copy.
      if (req.method === 'POST') {
        const b = JSON.parse(await readBody(req));
        const pt = p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]) ? [+p[0], +p[1]] : null;
        if ('home' in b && pt(b.home)) settings.home = pt(b.home);
        if ('homeLabel' in b) settings.homeLabel = String(b.homeLabel || '').slice(0, 120);
        if ('homeName' in b) settings.homeName = String(b.homeName || '').slice(0, 40);
        if ('office' in b) settings.office = b.office && pt(b.office.pos)
          ? { name: String(b.office.name || 'Office').slice(0, 40), pos: pt(b.office.pos), label: String(b.office.label || '').slice(0, 120) } : null;
        if ('faUser' in b && /^[A-Za-z0-9_.-]{0,40}$/.test(b.faUser || '')) { settings.faUser = b.faUser || ''; faCache = null; }
        if ('contact' in b) settings.contact = String(b.contact || '').slice(0, 100);
        if ('aisKey' in b) settings.aisKey = String(b.aisKey || '').trim().slice(0, 100);
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 1));
        aisRefresh();
        latest = null; // next page poll fetches for the new location
        lastPublic = null;
        await refreshAircraft().catch(() => {});
      }
      return send(res, 200, JSON.stringify({
        home: settings.home || null, homeLabel: settings.homeLabel || '', homeName: settings.homeName || '', office: settings.office || null,
        faUser: faUser(), contact: contactSetting() || '',
        aisKeySet: !!aisKey(), aisKeyHint: aisKey() ? '••••' + aisKey().slice(-4) : '',
      }));
    }
    if (url.pathname === '/api/version') return send(res, 200, JSON.stringify({ ...VERSION, exe: !!sea }));
    if (url.pathname === '/api/update') {
      if (req.method === 'POST') {
        const b = JSON.parse((await readBody(req)) || '{}');
        if ('autoUpdate' in b) { settings.autoUpdate = !!b.autoUpdate; fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 1)); }
        if (b.check) await checkForUpdate();
        if (b.install) applyUpdate().catch(() => {});
      }
      return send(res, 200, JSON.stringify({ current: VERSION, exe: !!sea, autoUpdate: autoUpdate(), repo: REPO, ...updateState }));
    }
    if (url.pathname === '/api/log') return send(res, 200, JSON.stringify(logSummary()));
    const rg = url.pathname.match(/^\/api\/registry\/([A-Z0-9-]{2,10})$/i);
    if (rg) return send(res, 200, JSON.stringify(registry(rg[1].toUpperCase().replace(/-/g, ''))));
    if (url.pathname === '/api/home' && req.method === 'POST') {
      // the page tells us where home is, so the daily log's "closest pass" uses the right spot
      const h = JSON.parse(await readBody(req));
      if (isFinite(h.lat) && isFinite(h.lon)) { settings.home = [+h.lat, +h.lon]; fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings)); aisRefresh(); }
      return send(res, 200, '{"ok":true}');
    }
    if (url.pathname === '/api/findship') {
      const mmsi = String(url.searchParams.get('mmsi') || '');
      if (!/^\d{9}$/.test(mmsi)) return send(res, 400, '{"error":"bad MMSI"}');
      if (!aisKey()) return send(res, 200, '{"status":"nokey"}');
      findShip(mmsi, (url.searchParams.get('name') || '').slice(0, 60));
      const sh = ships.get(mmsi);
      return send(res, 200, JSON.stringify(sh && sh.lat != null ? { status: 'found', ship: sh }
        : { status: 'searching', seconds: Math.round((Date.now() - finder.started) / 1000), connected: !!finder.ws && finder.ws.readyState === 1 }));
    }
    if (url.pathname === '/api/places') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
      return send(res, 200, JSON.stringify(q ? await placeSearch(q) : []));
    }
    if (url.pathname === '/api/geocode') {
      // ZIP code or address -> up to 5 places to choose from. Only runs when someone clicks Search in Settings.
      const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
      const near = (url.searchParams.get('near') || '').split(',').map(Number);
      return send(res, 200, JSON.stringify(q ? await geocode(q, near.length === 2 && near.every(isFinite) ? near : settings.home) : { results: [] }));
    }
    if (url.pathname === '/api/airports') {
      await loadAirports();
      const q = k => Number(url.searchParams.get(k));
      return send(res, 200, JSON.stringify(airportsNear(q('lat'), q('lon'), Math.min(q('r') || 40, 150))));
    }
    const m = url.pathname.match(/^\/api\/lookup\/([0-9a-f]{6})$/i);
    if (m) {
      const q = k => (url.searchParams.get(k) || '').trim().toUpperCase();
      const reg = /^[A-Z0-9-]{2,10}$/.test(q('reg')) ? q('reg') : '';
      const txt = k => (url.searchParams.get(k) || '').trim().slice(0, 80);
      return send(res, 200, JSON.stringify(await lookup(m[1].toLowerCase(), q('cs'), reg, txt('mfr'), txt('model'), /^[A-Z0-9]{2,4}$/.test(q('type')) ? q('type') : '')));
    }
    send(res, 404, '{"error":"not found"}');
  } catch (e) {
    send(res, 502, JSON.stringify({ error: e.message }));
  }
});

process.on('unhandledRejection', e => console.log('Background task failed: ' + (e && e.message || e)));

const openBrowser = () => {
  if (process.env.NO_BROWSER) return;
  require('child_process').exec(`start "" http://localhost:${PORT}`);
};
// ---------- ships: live AIS positions from AISStream.io (optional, needs a free API key) ----------
// AISStream only accepts server connections (never straight from a browser), so this keeps one WebSocket open for
// the area around home and the page reads /api/ships. Ships report positions over AIS, the ship version of ADS-B.
// The key is kept in settings.json and is never sent to the page.
const ships = new Map(); // MMSI -> { mmsi, name, lat, lon, sog, cog, heading, nav, type, length, beam, destination, eta, imo, callsign, seen }
const ais = { status: 'off', error: null, ws: null, timer: null, tries: 0, sub: '', lastMsg: 0 };
const aisKey = () => String(settings.aisKey || process.env.AISSTREAM_API_KEY || '').trim();
// JSON keys are capitalised (Name, Sog...) but the published models are camelCase; accept either
const pick = (o, k) => o == null ? undefined : o[k] ?? o[k[0].toLowerCase() + k.slice(1)];
const AIS_BOX_DEG = 0.6; // ~40 miles north/south of home, so ships show up before they reach the Tracker Radius
function aisBox() {
  const h = settings.home;
  if (!h) return null;
  const dLon = AIS_BOX_DEG / Math.max(0.2, Math.cos(h[0] * Math.PI / 180));
  return [[+(h[0] + AIS_BOX_DEG).toFixed(4), +(h[1] - dLon).toFixed(4)], [+(h[0] - AIS_BOX_DEG).toFixed(4), +(h[1] + dLon).toFixed(4)]];
}

function aisConnect() {
  clearTimeout(ais.timer);
  if (ais.ws) { const old = ais.ws; ais.ws = null; try { old.close(); } catch (e) {} }
  const key = aisKey(), box = aisBox();
  ais.sub = key + '|' + JSON.stringify(box);
  if (!key || !box) { ais.status = key ? 'waiting for home' : 'off'; ais.error = null; return; }
  if (typeof WebSocket !== 'function') { ais.status = 'off'; ais.error = 'This version of Node.js has no WebSocket support'; return; }
  ais.status = 'connecting';
  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream'); // compression is negotiated automatically
  ws.binaryType = 'arraybuffer';
  ais.ws = ws;
  const opened = Date.now();
  let confirmed = false;
  // the subscription must arrive within 3 seconds of connecting
  ws.onopen = () => { aisSubSent = Date.now(); ws.send(aisSubscription()); };
  ws.onmessage = e => {
    let m;
    try { m = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString('utf8')); } catch (err) { return; }
    if (m.error) { ais.error = 'AISStream: ' + m.error; return; }
    if (!confirmed) { confirmed = true; ais.status = 'live'; ais.error = null; ais.tries = 0; }
    ais.lastMsg = Date.now();
    if (m.MessageType !== 'SubscriptionConfirmation') onAisMessage(m);
  };
  ws.onerror = () => {};
  ws.onclose = () => {
    if (ais.ws !== ws) return; // replaced on purpose
    ais.ws = null;
    // closed within seconds, before any data: almost always a wrong or disabled key
    if (!confirmed && Date.now() - opened < 15000) ais.error = ais.error || 'AISStream closed the connection right away. Check that the API key is correct.';
    ais.status = 'reconnecting';
    ais.tries++;
    const wait = Math.min(300000, 2000 * 2 ** Math.min(ais.tries, 8)) * (0.8 + Math.random() * 0.4); // backoff with jitter
    ais.timer = setTimeout(aisConnect, wait);
  };
}
// reconnect when the key or home changes (the subscription covers the area around home)
const aisRefresh = () => { if (ais.sub !== aisKey() + '|' + JSON.stringify(aisBox())) { ais.tries = 0; ships.clear(); aisConnect(); } };
// While someone is exploring, the area they're looking at is added to the subscription (alongside home).
// AISStream replaces the subscription when it's sent again, at most once a second.
let aisExplore = null; // { box, until }
let aisSubTimer = null, aisSubSent = 0;
const aisSubscription = () => JSON.stringify({ APIKey: aisKey(), BoundingBoxes: [aisBox(), ...(aisExplore ? [aisExplore.box] : [])],
  FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ShipStaticData'] });
function aisResubscribe() {
  clearTimeout(aisSubTimer);
  const ws = ais.ws;
  if (!ws || ws.readyState !== 1) return; // not open yet: it sends the current subscription when it opens
  const wait = 1500 - (Date.now() - aisSubSent);
  if (wait > 0) { aisSubTimer = setTimeout(aisResubscribe, wait); return; }
  aisSubSent = Date.now();
  ws.send(aisSubscription());
}
function setAisExplore(box) {
  const same = JSON.stringify(box) === JSON.stringify(aisExplore?.box);
  aisExplore = box ? { box, until: Date.now() + 120000 } : null;
  if (!same) aisResubscribe();
}
// stop watching an explored area 2 minutes after the page stops asking for it
setInterval(() => { if (aisExplore && Date.now() > aisExplore.until) setAisExplore(null); }, 30000);
// a connection that has gone silent for 10 minutes is replaced
setInterval(() => { if (ais.status === 'live' && Date.now() - ais.lastMsg > 600000) aisConnect(); }, 60000);
// forget ships not heard from for 30 minutes
setInterval(() => { const cut = Date.now() - 1800000; for (const [k, s] of ships) if ((s.seen || s.static || 0) < cut) ships.delete(k); }, 60000);

// Wikipedia photo and summary for a named ship (used for cruise ships in the ship card). Only an article whose title
// is the ship's name counts ("Carnival Paradise", "MS Nieuw Statendam"), so a different ship is never shown.
const shipInfoCache = new Map();
async function shipWiki(name) {
  const key = name.toUpperCase();
  if (shipInfoCache.has(key)) return shipInfoCache.get(key);
  const norm = s => s.toLowerCase().replace(/^(ms|mv|ss|rms|mts|mscs)\s+/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/[^a-z0-9]/g, '');
  let out = null, failed = false;
  try {
    const r = await get('https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&generator=search&gsrlimit=5'
      + '&prop=pageimages|extracts|info&exintro=1&explaintext=1&exsentences=3&inprop=url&piprop=thumbnail&pithumbsize=480&gsrsearch='
      + encodeURIComponent(`"${name}" ship`));
    if (r.status !== 200) throw new Error('HTTP ' + r.status);
    const want = norm(name);
    const p = Object.values(JSON.parse(r.body).query?.pages || {}).sort((a, b) => a.index - b.index).find(p => norm(p.title) === want);
    if (p) out = { title: p.title, extract: (p.extract || '').slice(0, 600), thumb: p.thumbnail?.source || null, url: p.fullurl };
  } catch (e) { failed = true; }
  if (!failed) shipInfoCache.set(key, out); // a network hiccup is retried next time
  return out;
}

const aisText = s => String(s || '').replace(/@+/g, ' ').replace(/\s+/g, ' ').trim();
function onAisMessage(m) {
  const meta = m.MetaData || {}, mmsi = String(pick(meta, 'MMSI') ?? '');
  if (!/^\d{9}$/.test(mmsi)) return;
  const s = ships.get(mmsi) || { mmsi };
  ships.set(mmsi, s);
  const body = m.Message?.[m.MessageType] || {};
  if (!s.name) s.name = aisText(pick(meta, 'ShipName'));
  if (m.MessageType === 'ShipStaticData') {
    s.name = aisText(pick(body, 'Name')) || s.name;
    s.type = pick(body, 'Type') ?? s.type;
    s.imo = pick(body, 'ImoNumber') || s.imo;
    s.callsign = aisText(pick(body, 'CallSign')) || s.callsign;
    const d = pick(body, 'Dimension') || {};
    const len = (d.A || 0) + (d.B || 0), beam = (d.C || 0) + (d.D || 0);
    if (len > 0 && len < 500) s.length = len;
    if (beam > 0 && beam < 80) s.beam = beam;
    const draught = pick(body, 'MaximumStaticDraught');
    if (draught > 0 && draught < 30) s.draught = draught;
    s.destination = aisText(pick(body, 'Destination'));
    const eta = pick(body, 'Eta');
    s.eta = eta && pick(eta, 'Month') && pick(eta, 'Day') ? { month: pick(eta, 'Month'), day: pick(eta, 'Day'), hour: pick(eta, 'Hour'), minute: pick(eta, 'Minute') } : null;
    s.static = Date.now();
    return;
  }
  const lat = pick(body, 'Latitude') ?? pick(meta, 'Latitude'), lon = pick(body, 'Longitude') ?? pick(meta, 'Longitude');
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return; // 91 / 181 mean "not available"
  s.lat = lat; s.lon = lon;
  const sog = pick(body, 'Sog'), cog = pick(body, 'Cog'), hdg = pick(body, 'TrueHeading');
  s.sog = sog != null && sog < 102.3 ? sog : null;   // knots; 102.3 = not available
  s.cog = cog != null && cog < 360 ? cog : null;
  s.heading = hdg != null && hdg < 360 ? hdg : null;  // 511 = not available
  const nav = pick(body, 'NavigationalStatus');
  if (nav != null) s.nav = nav;
  s.seen = Date.now();
}

// ---------- Cruise Finder: locate one named ship anywhere in the world ----------
// Type a ship's name in the Jump to box: if it isn't already on the map, the ship's radio ID (MMSI) is read from its
// Wikipedia article and a second AISStream connection asks for just that ship, worldwide. It's found as soon as
// it reports (every few seconds when moving, every few minutes in port), but only near coasts with receivers.
const shipIdCache = new Map();
async function shipIds(name) {
  const key = name.toUpperCase();
  if (shipIdCache.has(key)) return shipIdCache.get(key);
  let out = null;
  try {
    const r = await get('https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&redirects=1&titles='
      + encodeURIComponent(name), 10000);
    if (r.status !== 200) return null; // not cached: try again next time
    const p = Object.values(JSON.parse(r.body).query?.pages || {})[0];
    const text = p?.revisions?.[0]?.slots?.main?.['*'] || '';
    const mmsi = (text.match(/MMSI[^\d\n]{0,40}(\d{9})/) || [])[1];
    if (mmsi) out = { title: p.title, mmsi, imo: (text.match(/IMO[^\d\n]{0,30}(\d{7})/i) || [])[1] || null };
  } catch (e) { return null; }
  shipIdCache.set(key, out);
  return out;
}

const finder = { ws: null, mmsi: null, name: '', started: 0, timer: null };
function stopFinder() {
  clearTimeout(finder.timer);
  if (finder.ws) { const w = finder.ws; finder.ws = null; try { w.close(); } catch (e) {} }
  finder.mmsi = null;
}
function findShip(mmsi, name) {
  if (finder.mmsi === mmsi && finder.ws) { clearTimeout(finder.timer); finder.timer = setTimeout(stopFinder, 900000); return; }
  stopFinder();
  if (!aisKey() || typeof WebSocket !== 'function') return;
  Object.assign(finder, { mmsi, name, started: Date.now() });
  const ws = finder.ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(JSON.stringify({ APIKey: aisKey(), BoundingBoxes: [[[-90, -180], [90, 180]]], FiltersShipMMSI: [mmsi],
    FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ShipStaticData'] }));
  ws.onmessage = e => {
    try {
      const m = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString('utf8'));
      if (m.MessageType && m.MessageType !== 'SubscriptionConfirmation') onAisMessage(m); // joins the normal ship list
    } catch (err) {}
  };
  ws.onerror = () => {};
  ws.onclose = () => { if (finder.ws === ws) finder.ws = null; };
  finder.timer = setTimeout(stopFinder, 900000); // keep following it for 15 minutes
}

// ---------- self-update from GitHub Releases (only when running as the .exe) ----------
// Each release carries Krabbz9999-FlightTracker.exe; the tag ends in the build number (e.g. v1.0.4).
const REPO = VERSION.repo || 'showtechclove1/krabbz9999-flighttracker';
const EXE_NAME = 'Krabbz9999-FlightTracker.exe';
let updateState = { checkedAt: null, latest: null, available: false, status: 'idle', error: null };
const buildOf = tag => { const m = String(tag || '').match(/(\d+)\s*$/); return m ? +m[1] : 0; };

async function checkForUpdate() {
  try {
    const r = await get(`https://api.github.com/repos/${REPO}/releases/latest`, 10000);
    if (r.status === 404) throw new Error('No releases published yet');
    if (r.status !== 200) throw new Error(`GitHub answered HTTP ${r.status}`);
    const rel = JSON.parse(r.body);
    const asset = (rel.assets || []).find(a => a.name === EXE_NAME);
    const latest = buildOf(rel.tag_name);
    updateState = { ...updateState, checkedAt: Date.now(), error: null,
      latest: { build: latest, tag: rel.tag_name, url: rel.html_url, notes: (rel.body || '').slice(0, 2000) },
      available: !!asset && latest > +VERSION.build };
    return { rel, asset };
  } catch (e) {
    updateState = { ...updateState, checkedAt: Date.now(), error: e.message };
    return {};
  }
}

async function applyUpdate() {
  if (!sea) throw new Error('Updates install only when running as the .exe');
  if (updateState.status === 'installing') return;
  const { asset } = await checkForUpdate();
  if (!updateState.available || !asset) return;
  updateState.status = 'installing';
  try {
    console.log(`Updating to build ${updateState.latest.build}...`);
    const dl = await get(asset.browser_download_url, 120000);
    if (dl.status !== 200) throw new Error(`Download failed (HTTP ${dl.status})`);
    if (dl.body.length !== asset.size) throw new Error('Download was incomplete');
    // GitHub publishes a SHA-256 for release assets; check it when present
    if (asset.digest && asset.digest.startsWith('sha256:')) {
      const sum = require('crypto').createHash('sha256').update(dl.body).digest('hex');
      if ('sha256:' + sum !== asset.digest) throw new Error('Checksum did not match');
    }
    // Windows can't overwrite a running .exe, but it can rename it: swap, start the new one, exit.
    const exe = process.execPath, old = exe + '.old', fresh = exe + '.new';
    fs.writeFileSync(fresh, dl.body);
    try { fs.unlinkSync(old); } catch (e) {}
    fs.renameSync(exe, old);
    fs.renameSync(fresh, exe);
    saveLog();
    require('child_process').spawn(exe, [], { detached: true, stdio: 'ignore', cwd: APP_DIR, env: { ...process.env, FT_RESTART: '1', NO_BROWSER: '1' } }).unref();
    console.log('Update installed - restarting.');
    setTimeout(() => process.exit(0), 500);
  } catch (e) {
    updateState.status = 'idle'; updateState.error = e.message;
    console.log('Update failed: ' + e.message);
  }
}
const autoUpdate = () => settings.autoUpdate !== false;
if (sea) {
  try { fs.unlinkSync(process.execPath + '.old'); } catch (e) {} // leftover from the last update
  const tick = () => (autoUpdate() ? applyUpdate() : checkForUpdate()).catch(() => {});
  setTimeout(tick, 60000);
  setInterval(tick, 6 * 3600000);
}

// ---------- system tray icon (Windows .exe only) ----------
// Node has no tray support, so the .exe carries a tiny helper (tray/Tray.cs, compiled at build time)
// that shows a ✈ icon with Open / Quit. It's unpacked next to the app and closes itself when this
// process exits (including when an update restarts it; the new copy starts its own).
const TRAY_EXE = path.join(APP_DIR, 'Krabbz9999-FlightTracker-Tray.exe');
function startTray(tries = 0) {
  if (!sea || process.platform !== 'win32' || process.env.NO_TRAY) return;
  let bin;
  try { bin = Buffer.from(sea.getAsset('tray.exe')); } catch (e) { return; } // built without the helper
  try {
    let current = null;
    try { current = fs.readFileSync(TRAY_EXE); } catch (e) {}
    if (!current || !current.equals(bin)) fs.writeFileSync(TRAY_EXE, bin);
  } catch (e) {
    // just updated: the old copy's helper may still be closing and holding the file
    if (tries < 5) return setTimeout(() => startTray(tries + 1), 2000);
    return console.log('Tray icon unavailable: ' + e.message);
  }
  try {
    require('child_process').spawn(TRAY_EXE, [String(PORT), String(process.pid), `Krabbz9999 - FlightTracker (build ${VERSION.build})`],
      { detached: true, stdio: 'ignore', cwd: APP_DIR }).unref();
  } catch (e) { console.log('Tray icon unavailable: ' + e.message); }
}

let listenTries = 0;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  // just updated: the old copy may still be letting go of the port, so wait for it
  if (process.env.FT_RESTART && ++listenTries < 20) return setTimeout(() => server.listen(PORT), 1000);
  // already running (e.g. double-clicked twice): just open the existing dashboard
  console.log('Already running - opening it in your browser.'); if (sea) openBrowser(); setTimeout(() => process.exit(0), 1500);
});
server.listen(PORT, () => {
  aisConnect();
  console.log(`Krabbz9999 - FlightTracker v${VERSION.version} build ${VERSION.build} running at http://localhost:${PORT}`);
  if (sea) { console.log('To stop it, close this window or right-click the plane icon in the system tray and choose Quit.'); openBrowser(); startTray(); }
});
