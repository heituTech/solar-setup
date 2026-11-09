// PVGIS peak sun hours, served from a static JSON file and cached in IndexedDB.
// The page never calls PVGIS at runtime; the dataset is refreshed only by
// re-running scripts/fetch-pvgis-psh.js and committing the new JSON.
(function () {
  const DB_NAME = 'solar_cache';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const KEY = 'pvgis-psh';
  const DATA_URL = '/pv/data/pvgis-psh.json';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbGet(key) {
    return openDb().then((db) => new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    })).catch(() => null);
  }

  function dbPut(key, value) {
    return openDb().then((db) => new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    })).catch(() => false);
  }

  let dataset = null;
  let readyPromise = null;

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      // Read the static file first and keep IndexedDB in sync with it; if the
      // file cannot be read (offline), fall back to the stored copy.
      let fresh = null;
      try {
        const res = await fetch(DATA_URL, { cache: 'no-cache' });
        if (res.ok) fresh = await res.json();
      } catch (e) { /* offline: use the cached copy below */ }

      if (fresh && Array.isArray(fresh.points)) {
        dataset = fresh;
        const stored = await dbGet(KEY);
        if (!stored || stored.generated_at !== fresh.generated_at) await dbPut(KEY, fresh);
        return dataset;
      }

      const stored = await dbGet(KEY);
      dataset = stored && Array.isArray(stored.points) ? stored : { points: [] };
      return dataset;
    })();
    return readyPromise;
  }

  // Inverse-distance weighting over the four nearest lattice points keeps the
  // value smooth between samples; the nearest point wins once it is very close.
  function lookup(lat, lon) {
    if (!dataset || !dataset.points || !dataset.points.length) return null;
    const a = Number(lat);
    const b = Number(lon);
    if (!isFinite(a) || !isFinite(b)) return null;

    let best = [];
    for (let i = 0; i < dataset.points.length; i += 1) {
      const p = dataset.points[i];
      const dLat = p.lat - a;
      let dLon = p.lon - b;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      const d2 = dLat * dLat + dLon * dLon;
      if (best.length < 4) {
        best.push({ p, d2 });
        best.sort((x, y) => x.d2 - y.d2);
      } else if (d2 < best[3].d2) {
        best[3] = { p, d2 };
        best.sort((x, y) => x.d2 - y.d2);
      }
    }
    if (!best.length) return null;
    if (best[0].d2 <= 0.25) return round2(best[0].p.psh); // within 0.5 degree

    let weight = 0;
    let sum = 0;
    best.forEach((item) => {
      const w = 1 / Math.max(item.d2, 4); // cap so the nearest point cannot dominate to infinity
      weight += w;
      sum += w * item.p.psh;
    });
    return weight > 0 ? round2(sum / weight) : null;
  }

  function round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  window.PshStore = { ready, lookup };
})();
