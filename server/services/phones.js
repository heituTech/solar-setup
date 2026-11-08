const COUNTRIES = require('../data/countries');

// Cambodia and China drop the leading trunk zero; other regions keep it.
const ZERO_STRIP_CODES = new Set(['KH', 'CN']);

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function findCountry(code) {
  return COUNTRIES.find((c) => c.code === String(code || '').toUpperCase()) || null;
}

function keepsTrunkZero(countryCode) {
  return !ZERO_STRIP_CODES.has(String(countryCode || '').toUpperCase());
}

// Build a canonical E.164-style phone number: +<dial><national>.
// Cambodia / China drop the trunk zero; other regions keep it. Accepted inputs
// include 0965359759, +855965359759, 00855965359759 and +8550965359759.
function composePhone(national, countryCode) {
  const raw = String(national || '').trim();
  let digits = digitsOnly(raw);
  if (!digits) return null;
  const country = findCountry(countryCode) || findCountry('KH');
  const dial = country.dial;
  let international = raw.startsWith('+');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }
  let local = international && digits.startsWith(dial) ? digits.slice(dial.length) : digits;
  if (!keepsTrunkZero(country.code)) local = local.replace(/^0+/, '');
  if (!local) return null;
  return '+' + dial + local;
}

// Candidates used to match a typed or composed phone against stored values.
// Generates both with and without the trunk zero so every accepted input style
// (local 0-prefixed, +dial with or without 0, 00 dial) hits the same account.
function phoneMatchCandidates(value, countryCode) {
  const raw = String(value || '').trim();
  let digits = digitsOnly(raw);
  if (!digits) return [];
  const country = findCountry(countryCode) || findCountry('KH');
  const dial = country.dial;
  let international = raw.startsWith('+');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }
  const set = new Set([digits]);
  const base = international && digits.startsWith(dial) ? digits.slice(dial.length) : digits;
  const local = base.replace(/^0+/, '');
  if (local) {
    set.add(dial + local);
    set.add(dial + '0' + local);
    set.add(local);
    set.add('0' + local);
  }
  return [...set].filter(Boolean);
}

// A bare local number (no + and no 00 prefix) can belong to different countries.
// Produce one candidate per country so the caller can detect that the same digits
// are registered under more than one calling code.
function crossCountryPhoneCandidates(value) {
  const raw = String(value || '').trim();
  let digits = digitsOnly(raw);
  if (!digits || raw.startsWith('+') || digits.startsWith('00')) return [];
  const set = new Set([digits]);
  COUNTRIES.forEach((c) => {
    const local = keepsTrunkZero(c.code) ? digits : digits.replace(/^0+/, '');
    if (!local) return;
    set.add(c.dial + local);
    set.add(c.dial + local.replace(/^0+/, ''));
  });
  return [...set].filter(Boolean);
}

// Resolve the country from an explicitly international number (+855..., 00855...).
function detectCountryFromPhone(value) {
  const raw = String(value || '').trim();
  let digits = digitsOnly(raw);
  if (!digits) return null;
  let international = raw.startsWith('+');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }
  if (!international) return null;
  let best = null;
  COUNTRIES.forEach((c) => {
    if (digits.startsWith(c.dial) && (!best || c.dial.length > best.dial.length)) best = c;
  });
  return best;
}

module.exports = {
  COUNTRIES,
  digitsOnly,
  findCountry,
  keepsTrunkZero,
  composePhone,
  phoneMatchCandidates,
  crossCountryPhoneCandidates,
  detectCountryFromPhone,
};
