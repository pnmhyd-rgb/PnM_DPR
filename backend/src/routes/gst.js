'use strict';

const router     = require('express').Router();
const rateLimit  = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const db         = require('../config/db');
const gstService = require('../services/gstService');

// 20 verify calls per minute per IP
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many GST verification requests — please wait a moment', type: 'rate_limit' },
});

// ── POST /api/gst/verify ────────────────────────────────────────────────────
// Validates format + checksum, calls external API, returns enriched data.
// Falls back to local GSTIN extraction if the portal is blocked.

router.post('/verify', requireAuth, verifyLimiter, async (req, res) => {
  const { gstin, exclude_id } = req.body;
  if (!gstin) return res.status(400).json({ error: 'gstin is required', type: 'validation' });

  let data;
  let warning = null;

  try {
    data = await gstService.verifyGST(gstin);
  } catch (err) {
    const type = err.type || 'api_error';

    // Hard validation failure — send error immediately, no fallback
    if (type === 'validation') {
      return res.status(422).json({ error: err.message, type });
    }
    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'GSTIN not found in GST records', type: 'not_found' });
    }

    // Soft failure (portal blocked / network issue) → fall back to local extraction
    if (type === 'portal_unavailable' || err.code === 'ECONNABORTED' || err.code === 'ENOTFOUND') {
      const localResult = await gstService.verifyGST_Local(gstin);  // local-only extraction
      data    = localResult;
      warning = 'GST Network portal is currently unreachable from this server. ' +
                'State and PAN have been auto-filled from the GSTIN. ' +
                'Please enter the company name and address manually, or configure a GST API key.';
    } else {
      console.error('GST verify error:', err.message);
      return res.status(500).json({ error: 'GST verification failed — please retry', type: 'api_error' });
    }
  }

  // Duplicate check
  try {
    const dupQ = exclude_id
      ? `SELECT id, name FROM hire_vendors WHERE UPPER(gst_no) = UPPER($1) AND active = TRUE AND id != $2 LIMIT 1`
      : `SELECT id, name FROM hire_vendors WHERE UPPER(gst_no) = UPPER($1) AND active = TRUE LIMIT 1`;
    const dup = await db.query(dupQ, exclude_id ? [gstin, exclude_id] : [gstin]);
    if (dup.rows.length > 0) {
      return res.status(409).json({
        error:           `GSTIN already registered under vendor: "${dup.rows[0].name}"`,
        type:            'duplicate',
        existing_vendor: dup.rows[0].name,
        data,
        warning,
      });
    }
  } catch { /* non-fatal */ }

  res.json({ data, ...(warning ? { warning } : {}) });
});

// ── GET /api/gst/validate ───────────────────────────────────────────────────
// Local-only validation (format + checksum). No API call, no rate limit.

router.get('/validate', requireAuth, (req, res) => {
  const { gstin } = req.query;
  if (!gstin) return res.status(400).json({ error: 'gstin query param required' });
  res.json(gstService.validateLocal(gstin));
});

// ── GET /api/gst/check-duplicate ───────────────────────────────────────────
// Quick duplicate check without triggering a full verification.

router.get('/check-duplicate', requireAuth, async (req, res) => {
  const { gstin, exclude_id } = req.query;
  if (!gstin) return res.status(400).json({ error: 'gstin query param required' });

  try {
    const q  = exclude_id
      ? `SELECT id, name FROM hire_vendors WHERE UPPER(gst_no) = UPPER($1) AND active = TRUE AND id != $2 LIMIT 1`
      : `SELECT id, name FROM hire_vendors WHERE UPPER(gst_no) = UPPER($1) AND active = TRUE LIMIT 1`;
    const r  = await db.query(q, exclude_id ? [gstin, exclude_id] : [gstin]);
    if (r.rows.length) return res.json({ duplicate: true, existing_vendor: r.rows[0].name });
    res.json({ duplicate: false });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
