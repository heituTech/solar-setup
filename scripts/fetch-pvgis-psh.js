// Downloads PVGIS annual average peak sun hours (kWh/m2/day, i.e. equivalent
// full-sun hours) for a global 2-degree lattice built from the country/state/city
// centroids we ship in the geo cascade. The result is a static JSON file so the
// running app never has to call PVGIS again.
//
//   node scripts/fetch-pvgis-psh.js
//
// Re-runs are resumable: every successful point is cached in the cache file.
const fs = require('fs');
const path = require('path');
const { Country, State, City } = require('country-state-city');

const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'pvgis-psh.json');
const CACHE_FILE = path.join(__dirname, '..', 'data-cache', 'pvgis-psh-cache.json');
const STEP = 2;
const CONCURRENCY = 6;
const MAX_ATTEMPTS = 4;

function buildCells() {
  const cells = new Map();
  const add = (lat, lon) => {
    const a = Number(lat);
    const b = Number(lon);
    if (!isFinite(a) || !isFinite(b)) return;
    if (a < -60 || a > 75) return; // PVGIS coverage / polar night
    const key = `${Math.round(a / STEP) * STEP},${Math.round(b / STEP) * STEP}`;
    if (!cells.has(key)) cells.set(key, { lat: Math.round(a / STEP) * STEP, lon: Math.round(b / STEP) * STEP });
  };
  Country.getAllCountries().forEach((c) => add(c.latitude, c.longitude));
  State.getAllStates().forEach((s) => add(s.latitude, s.longitude));
  City.getAllCities().forEach((c) => add(c.latitude, c.longitude));
  return Array.from(cells.values());
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

async function fetchPsh(lat, lon) {
  const url = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${lat}&lon=${lon}&peakpower=1&loss=0&outputformat=json`;
  const r = await fetch(url, { headers: { 'User-Agent': 'solar-setup-psh-builder/1.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  const yearly = data && data.outputs && data.outputs.totals && data.outputs.totals.fixed;
  const ey = yearly && Number(yearly.E_y);
  if (!isFinite(ey) || ey <= 0) throw new Error('no E_y');
  return Math.round((ey / 365) * 100) / 100;
}

async function withRetry(lat, lon) {
  let delay = 800;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fetchPsh(lat, lon);
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) return null;
      await new Promise((res) => setTimeout(res, delay));
      delay *= 2;
    }
  }
  return null;
}

async function main() {
  const cells = buildCells();
  const cache = loadCache();
  const todo = cells.filter((c) => cache[`${c.lat},${c.lon}`] === undefined);
  console.log(`cells=${cells.length} cached=${cells.length - todo.length} todo=${todo.length}`);
  let done = 0;
  let failed = 0;

  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const cell = todo[cursor];
      cursor += 1;
      const psh = await withRetry(cell.lat, cell.lon);
      if (psh === null) {
        failed += 1;
        cache[`${cell.lat},${cell.lon}`] = null; // remember misses so re-runs skip them
      } else {
        cache[`${cell.lat},${cell.lon}`] = psh;
      }
      done += 1;
      if (done % 100 === 0) {
        saveCache(cache);
        console.log(`progress ${done}/${todo.length} (failed ${failed})`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveCache(cache);

  const points = [];
  Object.keys(cache).forEach((key) => {
    const psh = cache[key];
    if (psh === null || psh === undefined) return;
    const [lat, lon] = key.split(',').map(Number);
    points.push({ lat, lon, psh });
  });
  points.sort((a, b) => a.lat - b.lat || a.lon - b.lon);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ source: 'PVGIS v5_2 PVcalc, loss=0', step: STEP, generated_at: new Date().toISOString(), points }));
  console.log(`wrote ${points.length} points to ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
