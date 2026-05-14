/**
 * GST Verification Service
 *
 * Providers (set via GST_API_PROVIDER env var):
 *   masters_india  — Masters India API (most common in Indian ERPs)
 *   karza          — Karza Technologies API
 *   http_bearer    — Generic HTTP API with Bearer token (configure GST_API_URL)
 *   mock           — Returns realistic fake data; useful when no API key is set
 *
 * Required env vars:
 *   GST_API_PROVIDER = masters_india | karza | http_bearer | mock
 *   GST_API_KEY      = your API key / access token
 *   GST_API_URL      = override default endpoint URL (optional for masters_india/karza)
 *
 * Reusable: this service can be called from any module (vendors, customers, etc.)
 */

'use strict';

const { request: httpsRequest } = require('https');
const { request: httpRequest }  = require('http');
const { URL }                   = require('url');

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const STATE_CODES = {
  '01': 'Jammu & Kashmir',    '02': 'Himachal Pradesh',
  '03': 'Punjab',             '04': 'Chandigarh',
  '05': 'Uttarakhand',        '06': 'Haryana',
  '07': 'Delhi',              '08': 'Rajasthan',
  '09': 'Uttar Pradesh',      '10': 'Bihar',
  '11': 'Sikkim',             '12': 'Arunachal Pradesh',
  '13': 'Nagaland',           '14': 'Manipur',
  '15': 'Mizoram',            '16': 'Tripura',
  '17': 'Meghalaya',          '18': 'Assam',
  '19': 'West Bengal',        '20': 'Jharkhand',
  '21': 'Odisha',             '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',     '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',        '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',          '30': 'Goa',
  '31': 'Lakshadweep',        '32': 'Kerala',
  '33': 'Tamil Nadu',         '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',          '37': 'Andhra Pradesh',
  '38': 'Ladakh',             '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

// ── VALIDATION (always runs locally — no API key required) ───────────────────

function validateFormat(gstin) {
  if (!gstin || typeof gstin !== 'string') {
    return { valid: false, error: 'GSTIN is required' };
  }
  const g = gstin.toUpperCase().trim();
  if (g.length !== 15) {
    return { valid: false, error: `GSTIN must be exactly 15 characters (got ${g.length})` };
  }
  if (!GSTIN_REGEX.test(g)) {
    return { valid: false, error: 'Invalid GSTIN format (expected: 2-digit state + PAN + entity + Z + checksum)' };
  }
  return { valid: true, gstin: g };
}

function validateChecksum(gstin) {
  const g = gstin.toUpperCase();
  const factor = [1, 2];
  let sum = 0;
  const mod = GSTIN_CHARS.length;
  for (let i = 0; i < 14; i++) {
    const cp = GSTIN_CHARS.indexOf(g[i]);
    const digit = factor[i % 2] * cp;
    sum += Math.floor(digit / mod) + (digit % mod);
  }
  const expected = GSTIN_CHARS[(mod - (sum % mod)) % mod];
  return g[14] === expected;
}

function extractInfo(gstin) {
  const g = gstin.toUpperCase();
  const stateCode = g.substring(0, 2);
  return {
    state_code: stateCode,
    state_name: STATE_CODES[stateCode] || 'Unknown',
    pan:        g.substring(2, 12),
    entity_num: g[12],
    checksum:   g[14],
  };
}

// ── HTTP UTILITY ─────────────────────────────────────────────────────────────

function fetchJSON(urlStr, { method = 'GET', headers = {}, body, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlStr); } catch { return reject(new Error(`Invalid URL: ${urlStr}`)); }

    const isHttps = url.protocol === 'https:';
    const bodyStr = body ? JSON.stringify(body) : undefined;

    const opts = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers:  {
        'Accept':       'application/json',
        'Content-Type': 'application/json',
        ...headers,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = (isHttps ? httpsRequest : httpRequest)(opts, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        // Detect HTML (WAF block / redirect page)
        if (raw.trimStart().startsWith('<')) {
          return reject(Object.assign(new Error('PORTAL_UNAVAILABLE'), { type: 'portal_unavailable', _isHtml: true }));
        }
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return reject(new Error('Invalid JSON from GST API')); }
        if (res.statusCode >= 400) {
          const err = Object.assign(
            new Error(parsed?.message || `HTTP ${res.statusCode}`),
            { statusCode: res.statusCode, responseData: parsed }
          );
          return reject(err);
        }
        resolve(parsed);
      });
    });

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(Object.assign(new Error('GST API request timed out'), { code: 'ECONNABORTED' }));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function extractPincode(addressStr = '') {
  const m = addressStr.match(/\b(\d{6})\b/);
  return m ? m[1] : '';
}

function parseDDMMYYYY(str = '') {
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return str || null;
}

function normalizeStatus(sts = '') {
  const s = sts.toLowerCase();
  if (s.includes('active'))    return 'Active';
  if (s.includes('cancel'))    return 'Cancelled';
  if (s.includes('suspend'))   return 'Suspended';
  if (s.includes('provision')) return 'Provisional';
  return sts || 'Unknown';
}

/**
 * Parse state name from the stj (state jurisdiction) field.
 * stj is typically: "State - Maharashtra" or "State - Telangana - Hyderabad Range"
 */
function stateFromStj(stj = '') {
  if (!stj) return '';
  // Remove "State - " prefix and take the next segment
  const cleaned = stj.replace(/^State\s*[-–:]\s*/i, '');
  return cleaned.split(/\s*[-–]\s*/)[0].trim();
}

/**
 * Extract district from stj.
 * Format examples: "State - Maharashtra - Pune-III Range"
 *                  "State - Telangana - HYDERABAD ZONE"
 */
function districtFromStj(stj = '') {
  if (!stj) return '';
  const parts = stj.replace(/^State\s*[-–:]\s*/i, '').split(/\s*[-–]\s*/);
  if (parts.length >= 2) {
    // Second segment often starts with city/district name
    return parts[1].replace(/\s+(RANGE|WARD|CIRCLE|ZONE|DIV|DIVISION|COMMISSIONERATE).*$/i, '').trim();
  }
  return '';
}

/**
 * Try to find a known state name inside an address string.
 * Used as fallback when stj is not available.
 */
function stateFromAddress(adr = '') {
  const upper = adr.toUpperCase();
  // Sort longest names first to avoid partial matches (e.g. "Goa" inside "Gujarat")
  const sorted = Object.values(STATE_CODES).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (upper.includes(name.toUpperCase())) return name;
  }
  return '';
}

// ── API PROVIDERS ─────────────────────────────────────────────────────────────

const providers = {

  // ── Masters India ─────────────────────────────────────────────────────────
  masters_india: async (gstin, apiKey, apiUrl) => {
    const base = apiUrl || 'https://api.mastersindia.co/api/mastersgst/gstin_data';
    const url  = `${base}?gstin=${encodeURIComponent(gstin)}`;
    const raw  = await fetchJSON(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const d = raw?.data;
    if (!d) throw new Error('No data returned by Masters India API');
    const adr = d.pradr?.adr || '';
    return {
      legal_name:         d.lgnm || '',
      trade_name:         d.tradeNam || '',
      address:            adr,
      state:              (d.stj || '').replace(/^State\s*[-–]\s*/i, ''),
      district:           '',
      pincode:            extractPincode(adr),
      gst_status:         normalizeStatus(d.sts),
      business_type:      d.ctb || '',
      registration_date:  parseDDMMYYYY(d.rgdt),
      raw,
    };
  },

  // ── Karza ─────────────────────────────────────────────────────────────────
  karza: async (gstin, apiKey, apiUrl) => {
    const url = apiUrl || 'https://testapi.karza.in/v2/gst/gstin';
    const raw = await fetchJSON(url, {
      method:  'POST',
      headers: { 'x-karza-key': apiKey },
      body:    { gstin },
    });
    const d = raw?.result || raw?.data;
    if (!d) throw new Error('No data returned by Karza API');
    const adr = d.principalAddress?.completeAddress || d.pradr?.adr || '';
    return {
      legal_name:         d.legalName  || d.lgnm || '',
      trade_name:         d.tradeName  || d.tradeNam || '',
      address:            adr,
      state:              d.stateCode  || d.state || '',
      district:           d.district   || '',
      pincode:            d.principalAddress?.pincode || extractPincode(adr),
      gst_status:         normalizeStatus(d.status || d.sts),
      business_type:      d.constitutionOfBusiness || d.ctb || '',
      registration_date:  parseDDMMYYYY(d.dateOfRegistration || d.rgdt),
      raw,
    };
  },

  // ── Generic Bearer Token API (configure GST_API_URL with {gstin} placeholder) ──
  http_bearer: async (gstin, apiKey, apiUrl) => {
    if (!apiUrl) throw new Error('GST_API_URL must be set for http_bearer provider');
    const url = apiUrl.replace('{gstin}', encodeURIComponent(gstin));
    const raw = await fetchJSON(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    // Try to extract from common response shapes
    const d = raw?.data || raw?.result || raw;
    return {
      legal_name:         d.lgnm || d.legal_name || d.legalName || '',
      trade_name:         d.tradeNam || d.trade_name || d.tradeName || '',
      address:            d.pradr?.adr || d.address || '',
      state:              d.state || '',
      district:           d.district || '',
      pincode:            d.pincode || extractPincode(d.pradr?.adr || ''),
      gst_status:         normalizeStatus(d.sts || d.status || ''),
      business_type:      d.ctb || d.business_type || d.constitutionOfBusiness || '',
      registration_date:  parseDDMMYYYY(d.rgdt || d.registrationDate || ''),
      raw,
    };
  },

  // ── GSTINCheck.co.in ─────────────────────────────────────────────────────
  // GET https://sheet.gstincheck.co.in/check/{API_KEY}/{GSTIN}
  // Response: { flag: true, data: { lgnm, tradeNam, sts, stj, rgdt, ctb, pradr: { addr: {...} } } }
  gstincheck: async (gstin, apiKey) => {
    if (!apiKey) throw new Error('GST_API_KEY must be set for gstincheck provider');
    const url = `https://sheet.gstincheck.co.in/check/${encodeURIComponent(apiKey)}/${encodeURIComponent(gstin)}`;
    const raw = await fetchJSON(url, { timeout: 15000 });

    // flag can be boolean true or string "true"
    if (raw.flag === false || raw.flag === 'false' || !raw.data) {
      throw Object.assign(new Error('GSTIN not found in GST records'), { statusCode: 404 });
    }

    const d    = raw.data;
    const addr = d.pradr?.addr || {};

    // Build readable address from structured address fields
    const addrParts = [addr.bnm, addr.flno, addr.st, addr.loc, addr.dst, addr.stcd]
      .map(v => (v || '').trim()).filter(Boolean)
    const adrStr = addrParts.join(', ') + (addr.pncd ? ' - ' + addr.pncd : '')

    const state    = stateFromStj(d.stj) || addr.stcd || stateFromAddress(adrStr)
    const district = districtFromStj(d.stj) || addr.dst || ''

    return {
      legal_name:        (d.lgnm     || '').trim(),
      trade_name:        (d.tradeNam || d.lgnm || '').trim(),
      address:           adrStr,
      state,
      district,
      pincode:           (addr.pncd || '').trim(),
      gst_status:        normalizeStatus(d.sts || ''),
      business_type:     (d.ctb || '').trim(),
      registration_date: parseDDMMYYYY(d.rgdt || ''),
      raw,
    };
  },

  // ── India Government GST Portal (free, no API key needed) ────────────────
  // Uses the public endpoint the official GST website (gst.gov.in) uses.
  // NOTE: The portal runs F5 BIG-IP WAF which may block server-side calls.
  // If it does, the service auto-falls-back to local GSTIN extraction.
  govt_portal: async (gstin) => {
    const url = `https://services.gst.gov.in/services/api/search/taxpayerDetails?gstin=${encodeURIComponent(gstin)}`;

    let raw = null;
    try {
      raw = await fetchJSON(url, {
        headers: {
          'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept':          'application/json, text/plain, */*',
          'Accept-Language': 'en-IN,en;q=0.9',
          'Referer':         'https://services.gst.gov.in/services/searchtp',
          'Origin':          'https://services.gst.gov.in',
          'sec-ch-ua':       '"Chromium";v="124","Google Chrome";v="124","Not-A.Brand";v="99"',
          'sec-ch-ua-mobile':'?0',
          'sec-fetch-dest':  'empty',
          'sec-fetch-mode':  'cors',
          'sec-fetch-site':  'same-origin',
        },
        timeout: 20000,
      });
    } catch (err) {
      // Rethrow only if it's a real network error; HTML/WAF block is handled below
      if (err.code === 'ECONNABORTED') throw err;   // timeout
      if (err.code === 'ENOTFOUND')    throw err;   // DNS failure
      // Treat WAF block / 4xx as "portal unavailable" — fall through to local fallback
      throw Object.assign(new Error('PORTAL_UNAVAILABLE'), { type: 'portal_unavailable' });
    }

    // If the response is HTML (WAF block), raise portal_unavailable
    if (!raw || typeof raw !== 'object' || raw._isHtml) {
      throw Object.assign(new Error('PORTAL_UNAVAILABLE'), { type: 'portal_unavailable' });
    }

    // flag:"false" means GSTIN not registered in GST network
    if (raw.flag === 'false' || raw.flag === false || !raw.lgnm) {
      throw Object.assign(new Error('GSTIN not found in GST records'), { statusCode: 404 });
    }

    const adr      = raw.pradr?.adr || '';
    const state    = stateFromStj(raw.stj) || stateFromAddress(adr);
    const district = districtFromStj(raw.stj);

    return {
      legal_name:        (raw.lgnm     || '').trim(),
      trade_name:        (raw.tradeNam || raw.lgnm || '').trim(),
      address:           adr.trim(),
      state,
      district,
      pincode:           extractPincode(adr),
      gst_status:        normalizeStatus(raw.sts || ''),
      business_type:     (raw.ctb || '').trim(),
      registration_date: parseDDMMYYYY(raw.rgdt || ''),
      raw,
    };
  },

  // ── Local extraction only (no network call) ──────────────────────────────
  // Derives state + PAN from the GSTIN's own structure.
  // Useful as a fallback when no internet / no API key.
  local_only: async (gstin) => {
    const info = extractInfo(gstin);
    return {
      legal_name:        '',
      trade_name:        '',
      address:           '',
      state:             info.state_name,
      district:          '',
      pincode:           '',
      gst_status:        '',
      business_type:     '',
      registration_date: null,
      raw:               { _local: true, gstin },
    };
  },

  // ── Mock (only for local dev when no network access) ──────────────────────
  mock: async (gstin) => {
    await new Promise(r => setTimeout(r, 900));
    const info = extractInfo(gstin);
    const state = info.state_name;
    return {
      legal_name:        'SAMPLE COMPANY PRIVATE LIMITED',
      trade_name:        'SAMPLE COMPANY',
      address:           `Plot No. 42, Industrial Area, Phase-II, ${state} - 500032`,
      state,
      district:          'Central District',
      pincode:           '500032',
      gst_status:        'Active',
      business_type:     'Private Limited Company',
      registration_date: '2017-07-01',
      raw:               { _mock: true, gstin },
    };
  },
};

// ── CACHE ────────────────────────────────────────────────────────────────────

const _cache     = new Map();
const CACHE_TTL  = 60 * 60 * 1000; // 1 hour

function cacheGet(key)       { const e = _cache.get(key); return e && (Date.now() - e.ts < CACHE_TTL) ? e.data : null; }
function cacheSet(key, data) { _cache.set(key, { data, ts: Date.now() }); }

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Full validation + API lookup with retry.
 * Returns normalised GST data on success; throws on any failure.
 */
async function verifyGST(gstin) {
  // 1. Format validation
  const fmt = validateFormat(gstin);
  if (!fmt.valid) throw Object.assign(new Error(fmt.error), { type: 'validation' });

  const g = fmt.gstin;

  // 2. Checksum
  if (!validateChecksum(g)) {
    throw Object.assign(new Error('Invalid GSTIN checksum — please double-check the number'), { type: 'validation' });
  }

  // 3. Cache hit
  const cached = cacheGet(g);
  if (cached) return cached;

  // 4. Determine provider
  const providerName = (process.env.GST_API_PROVIDER || 'govt_portal').toLowerCase();
  const apiKey       = process.env.GST_API_KEY || '';
  const apiUrl       = process.env.GST_API_URL || '';

  const providerFn = providers[providerName];
  if (!providerFn) throw new Error(`Unknown GST_API_PROVIDER: "${providerName}". Use gstincheck, masters_india, karza, http_bearer, or mock.`);

  // 5. Call with up to 3 retries
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const providerData = await providerFn(g, apiKey, apiUrl);
      const info         = extractInfo(g);

      const result = {
        gstin:             g,
        pan:               info.pan,
        state_code:        info.state_code,
        legal_name:        providerData.legal_name,
        trade_name:        providerData.trade_name,
        address:           providerData.address,
        state:             providerData.state  || info.state_name,
        district:          providerData.district,
        pincode:           providerData.pincode,
        gst_status:        providerData.gst_status,
        business_type:     providerData.business_type,
        registration_date: providerData.registration_date,
        verified_at:       new Date().toISOString(),
        raw:               providerData.raw,
      };

      cacheSet(g, result);
      return result;

    } catch (err) {
      lastErr = err;
      if (err.type === 'validation') throw err; // no retry for validation errors
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  throw lastErr;
}

/**
 * Local-only validation (no network call).
 * Safe to call on every keystroke.
 */
function validateLocal(gstin) {
  const fmt = validateFormat(gstin);
  if (!fmt.valid) return { valid: false, error: fmt.error };
  if (!validateChecksum(fmt.gstin)) return { valid: false, error: 'Invalid GSTIN checksum' };
  return { valid: true, gstin: fmt.gstin, ...extractInfo(fmt.gstin) };
}

/**
 * Local-only extraction — derives state + PAN from GSTIN without any API call.
 * Used as a fallback when the configured provider is unreachable.
 */
async function verifyGST_Local(gstin) {
  const fmt = validateFormat(gstin);
  if (!fmt.valid) throw Object.assign(new Error(fmt.error), { type: 'validation' });
  if (!validateChecksum(fmt.gstin)) throw Object.assign(new Error('Invalid GSTIN checksum'), { type: 'validation' });

  const g    = fmt.gstin;
  const info = extractInfo(g);
  return {
    gstin:             g,
    pan:               info.pan,
    state_code:        info.state_code,
    legal_name:        '',
    trade_name:        '',
    address:           '',
    state:             info.state_name,
    district:          '',
    pincode:           '',
    gst_status:        '',
    business_type:     '',
    registration_date: null,
    verified_at:       new Date().toISOString(),
    raw:               { _local: true, gstin: g },
  };
}

module.exports = { verifyGST, verifyGST_Local, validateLocal, validateFormat, validateChecksum, extractInfo, STATE_CODES };
