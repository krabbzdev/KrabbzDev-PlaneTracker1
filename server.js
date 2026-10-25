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
const stockCache = new Map();
// Tries "maker model" (hyphens dropped: "Cirrus SF50 Vision") first, then "model aircraft", and prefers a page
// whose title names the model number (e.g. "sf50"), since the top hit is often the maker's page with no picture.
async function stockPhoto(model, mfr = '') {
  const key = mfr + '|' + model;
  if (stockCache.has(key)) return stockCache.get(key);
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokens = model.split(/\s+/).map(norm).filter(t => /\d/.test(t) && t.length >= 2);
  const plain = model.replace(/(\w)-(\w)/g, '$1$2');
  const queries = [...new Set([
    mfr && !norm(model).startsWith(norm(mfr)) ? `${mfr} ${plain}` : plain,
    model + ' aircraft',
  ])];
  let out = null, fallback = null, failed = false;
  for (const q of queries) {
    try {
      const r = await get('https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=5&prop=pageimages|info&inprop=url&piprop=thumbnail&pithumbsize=480&gsrsearch='
        + encodeURIComponent(q));
      const pages = Object.values(JSON.parse(r.body).query?.pages || {}).sort((a, b) => a.index - b.index);
      const hit = pages.find(p => p.thumbnail?.source && tokens.some(t => norm(p.title).includes(t)));
      const pick = p => ({ src: p.thumbnail.source, link: p.fullurl, credit: 'Wikipedia', stock: true, title: p.title });
      if (hit) { out = pick(hit); break; }
      if (!fallback && pages[0]?.thumbnail?.source) fallback = pick(pages[0]);
    } catch (e) { failed = true; }
  }
  out = out || (tokens.length ? null : fallback); // with a model number, a picture of something else is worse than none
  if (out || !failed) stockCache.set(key, out); // a network hiccup shouldn't stick as "no photo"
  return out;
}

async function lookup(hex, cs, reg, mfr = '', model = '') {
  const key = [hex, cs, reg, mfr, model].join('|');
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
  if (!out.photo && model) out.photo = await stockPhoto(model, mfr);
  try {
    const a = JSON.parse(db.value.body).response?.aircraft;
    if (a) {
      out.info = { type: a.type, manufacturer: a.manufacturer, icao_type: a.icao_type, reg: a.registration, owner: a.registered_owner, country: a.registered_owner_country_name };
      // adsbdb's photo links point at a host that refuses third-party use, so photos come from Planespotters only
    }
  } catch (e) {}
  if (out.photo || !model) lookupCache.set(key, out); // no photo yet: try again next time (stockPhoto caches real misses)
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
    if (url.pathname === '/api/fastats') return send(res, 200, JSON.stringify(await faStats()));
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
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 1));
        latest = null; // next page poll fetches for the new location
        lastPublic = null;
        await refreshAircraft().catch(() => {});
      }
      return send(res, 200, JSON.stringify({
        home: settings.home || null, homeLabel: settings.homeLabel || '', homeName: settings.homeName || '', office: settings.office || null,
        faUser: faUser(), contact: contactSetting() || '',
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
      if (isFinite(h.lat) && isFinite(h.lon)) { settings.home = [+h.lat, +h.lon]; fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings)); }
      return send(res, 200, '{"ok":true}');
    }
    if (url.pathname === '/api/geocode') {
      // address -> lat/lon via OpenStreetMap Nominatim (light, user-triggered use only)
      const r = await get('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(url.searchParams.get('q') || ''));
      const hit = JSON.parse(r.body)[0];
      return send(res, 200, JSON.stringify(hit ? { lat: +hit.lat, lon: +hit.lon, name: hit.display_name } : null));
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
      return send(res, 200, JSON.stringify(await lookup(m[1].toLowerCase(), q('cs'), reg, txt('mfr'), txt('model'))));
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

let listenTries = 0;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  // just updated: the old copy may still be letting go of the port, so wait for it
  if (process.env.FT_RESTART && ++listenTries < 20) return setTimeout(() => server.listen(PORT), 1000);
  // already running (e.g. double-clicked twice): just open the existing dashboard
  console.log('Already running - opening it in your browser.'); if (sea) openBrowser(); setTimeout(() => process.exit(0), 1500);
});
server.listen(PORT, () => {
  console.log(`Krabbz9999 - FlightTracker v${VERSION.version} build ${VERSION.build} running at http://localhost:${PORT}`);
  if (sea) { console.log('Close this window to stop it.'); openBrowser(); }
});
