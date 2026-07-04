const db = require('../config/db');

/* ── helpers ── */
function nextAmId(max) {
  const n = max ? parseInt(max.replace('RVR-AM-', ''), 10) + 1 : 1;
  return 'RVR-AM-' + String(n).padStart(5, '0');
}

/* GET /api/asset-matrix
   Query params: q (search), asset_type, page, limit */
const getAll = async (req, res) => {
  try {
    const { q = '', asset_type = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const filters = ['active = true'];

    if (q.trim()) {
      params.push(`%${q.trim()}%`);
      filters.push(`(am_id ILIKE $${params.length} OR manufacturer ILIKE $${params.length} OR model ILIKE $${params.length})`);
    }
    if (asset_type.trim()) {
      params.push(asset_type.trim());
      filters.push(`asset_type = $${params.length}`);
    }

    const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
    params.push(parseInt(limit), offset);

    const countRes = await db.query(
      `SELECT COUNT(*) FROM asset_matrix ${where}`,
      params.slice(0, params.length - 2)
    );
    const rows = await db.query(
      `SELECT * FROM asset_matrix ${where} ORDER BY am_id LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ data: rows.rows, total: parseInt(countRes.rows[0].count) });
  } catch (err) {
    console.error('asset_matrix getAll:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/* GET /api/asset-matrix/search?q=
   Lightweight search for the AM ID picker in AddAssetModal (returns max 20) */
const search = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ data: [] });

    const rows = await db.query(
      `SELECT am_id, asset_type, manufacturer, model, fuel_type, technical_specs
       FROM asset_matrix
       WHERE active = true
         AND (am_id ILIKE $1 OR manufacturer ILIKE $1 OR model ILIKE $1)
       ORDER BY am_id
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    console.error('asset_matrix search:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/* GET /api/asset-matrix/:amId */
const getOne = async (req, res) => {
  try {
    const row = await db.query(
      'SELECT * FROM asset_matrix WHERE am_id = $1',
      [req.params.amId]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row.rows[0] });
  } catch (err) {
    console.error('asset_matrix getOne:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/* POST /api/asset-matrix  (admin only) */
const create = async (req, res) => {
  try {
    const { asset_type, manufacturer, model, fuel_type, technical_specs } = req.body;
    if (!manufacturer?.trim()) return res.status(400).json({ error: 'Manufacturer is required' });
    if (!model?.trim())        return res.status(400).json({ error: 'Model is required' });

    // Duplicate check
    const dup = await db.query(
      'SELECT am_id FROM asset_matrix WHERE lower(manufacturer)=$1 AND lower(model)=$2',
      [manufacturer.trim().toLowerCase(), model.trim().toLowerCase()]
    );
    if (dup.rows.length) {
      return res.status(409).json({
        error: 'This Make + Model already exists',
        existing_am_id: dup.rows[0].am_id
      });
    }

    // Generate next AM ID
    const maxRow = await db.query("SELECT am_id FROM asset_matrix ORDER BY am_id DESC LIMIT 1");
    const am_id  = nextAmId(maxRow.rows[0]?.am_id);

    const result = await db.query(
      `INSERT INTO asset_matrix (am_id, asset_type, manufacturer, model, fuel_type, technical_specs)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [am_id, asset_type||null, manufacturer.trim(), model.trim(), fuel_type||null, JSON.stringify(technical_specs||{})]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('asset_matrix create:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/* PUT /api/asset-matrix/:amId  (admin only) */
const update = async (req, res) => {
  try {
    const { asset_type, manufacturer, model, fuel_type, technical_specs, active } = req.body;
    const { amId } = req.params;

    const result = await db.query(
      `UPDATE asset_matrix
       SET asset_type       = COALESCE($1, asset_type),
           manufacturer     = COALESCE($2, manufacturer),
           model            = COALESCE($3, model),
           fuel_type        = $4,
           technical_specs  = COALESCE($5::jsonb, technical_specs),
           active           = COALESCE($6, active),
           updated_at       = NOW()
       WHERE am_id = $7
       RETURNING *`,
      [asset_type||null, manufacturer||null, model||null, fuel_type||null,
       technical_specs ? JSON.stringify(technical_specs) : null,
       active !== undefined ? active : null,
       amId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('asset_matrix update:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/* GET /api/asset-matrix/asset-types  — distinct types for filter dropdown */
const getAssetTypes = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT DISTINCT asset_type FROM asset_matrix WHERE asset_type IS NOT NULL ORDER BY asset_type`
    );
    res.json({ data: rows.rows.map(r => r.asset_type) });
  } catch (err) {
    console.error('asset_matrix getAssetTypes:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, search, getOne, create, update, getAssetTypes };
