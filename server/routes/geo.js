const express = require('express');
const { Country, State, City } = require('country-state-city');
const names = require('../data/geo-names');

const router = express.Router();

// The whole dataset ships with the server; clients fetch one level at a time
// so no giant payload ever hits the browser. Names resolve to the requested
// language client-side: pick en/zh/km from each entry, others use en.

// Cambodia and China are pinned to the top (Cambodia first) because that is
// where the business operates; the rest keep the dataset order.
const PINNED = ['KH', 'CN'];

router.get('/countries', (req, res) => {
  const all = Country.getAllCountries();
  const pinned = PINNED.map((code) => all.find((c) => c.isoCode === code)).filter(Boolean);
  const rest = all.filter((c) => !PINNED.includes(c.isoCode));
  res.json(pinned.concat(rest).map((c) => ({
    code: c.isoCode,
    en: c.name,
    zh: names.COUNTRIES_ZH[c.isoCode] || c.name,
    km: names.COUNTRIES_KM[c.isoCode] || c.name,
    lat: Number(c.latitude),
    lon: Number(c.longitude),
  })));
});

router.get('/states', (req, res) => {
  const cc = String(req.query.country || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return res.status(400).json({ error: 'invalid_country' });
  res.json(State.getStatesOfCountry(cc).map((s) => {
    const key = s.name.toLowerCase();
    return {
      code: s.isoCode,
      en: s.name,
      zh: (cc === 'CN' && names.CN_PROVINCES_ZH[key]) || s.name,
      km: (cc === 'KH' && names.KH_PROVINCES_KM[key]) || s.name,
      lat: Number(s.latitude),
      lon: Number(s.longitude),
    };
  }));
});

router.get('/cities', (req, res) => {
  const cc = String(req.query.country || '').toUpperCase();
  const sc = String(req.query.state || '');
  if (!/^[A-Z]{2}$/.test(cc) || !sc) return res.status(400).json({ error: 'invalid_location' });
  res.json(City.getCitiesOfState(cc, sc).map((c) => {
    const key = c.name.toLowerCase();
    return {
      en: c.name,
      zh: (cc === 'CN' && names.CN_CITIES_ZH[key]) || c.name,
      km: (cc === 'KH' && names.KH_CITIES_KM[key]) || c.name,
      lat: Number(c.latitude),
      lon: Number(c.longitude),
    };
  }));
});

module.exports = router;
