const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT et.id, et.name, et.asset_group, et.asset_cat, et.asset_category, et.fuel_type,
             COUNT(m.id) FILTER (WHERE m.active = true)                          AS usage_count,
             COUNT(m.id) FILTER (WHERE m.active = true AND m.ownership = 'Own')  AS own_count,
             COUNT(m.id) FILTER (WHERE m.active = true AND m.ownership = 'Hire') AS hire_count
      FROM equipment_types et
      LEFT JOIN machines m ON LOWER(m.eq_type) = LOWER(et.name)
      GROUP BY et.id, et.name, et.asset_group, et.asset_cat, et.asset_category, et.fuel_type
      ORDER BY et.asset_group NULLS LAST, et.asset_cat NULLS LAST, et.name
    `);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get equipment types error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const VALID_CATS = ['Measurable', 'Non-Measurable'];

const create = async (req, res) => {
  try {
    const { name, asset_group, asset_cat, asset_category, fuel_type } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (asset_category && !VALID_CATS.includes(asset_category))
      return res.status(400).json({ error: 'asset_category must be Measurable or Non-Measurable' });
    const result = await db.query(
      'INSERT INTO equipment_types (name, asset_group, asset_cat, asset_category, fuel_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name.trim(), asset_group?.trim() || null, asset_cat?.trim() || null, asset_category || null, fuel_type?.trim() || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Equipment type already exists' });
    console.error('Create equipment type error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const bulkCreate = async (req, res) => {
  try {
    // Accept { items: [{name, asset_category}] } or legacy { names: [] }
    let items = req.body.items;
    if (!items && Array.isArray(req.body.names))
      items = req.body.names.map(n => ({ name: n }));
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'items array is required' });
    const results = []; const errors = [];
    for (const raw of items) {
      const name = (typeof raw === 'string' ? raw : raw?.name)?.trim();
      const asset_category = typeof raw === 'object' ? raw.asset_category || null : null;
      if (!name) continue;
      if (asset_category && !VALID_CATS.includes(asset_category)) {
        errors.push({ name, error: `Invalid category "${asset_category}"` });
        continue;
      }
      try {
        const asset_group = typeof raw === 'object' ? raw.asset_group?.trim() || null : null;
        const asset_cat   = typeof raw === 'object' ? raw.asset_cat?.trim()   || null : null;
        const fuel_type   = typeof raw === 'object' ? raw.fuel_type?.trim()   || null : null;
        const r = await db.query(
          'INSERT INTO equipment_types (name, asset_group, asset_cat, asset_category, fuel_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [name, asset_group, asset_cat, asset_category, fuel_type]
        );
        results.push(r.rows[0]);
      } catch (err) {
        console.error(`Bulk insert error for "${name}":`, err.code, err.message);
        errors.push({ name, error: err.code === '23505' ? 'Already exists' : (err.message || 'Failed') });
      }
    }
    res.status(201).json({ created: results.length, failed: errors.length, results, errors });
  } catch (err) {
    console.error('Bulk create equipment types error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, asset_group, asset_cat, asset_category, fuel_type } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (asset_category && !VALID_CATS.includes(asset_category))
      return res.status(400).json({ error: 'asset_category must be Measurable or Non-Measurable' });

    const old = await db.query('SELECT name FROM equipment_types WHERE id = $1', [id]);
    if (old.rows.length === 0) return res.status(404).json({ error: 'Equipment type not found' });

    const result = await db.query(
      'UPDATE equipment_types SET name = $1, asset_group = $2, asset_cat = $3, asset_category = $4, fuel_type = $5 WHERE id = $6 RETURNING *',
      [name.trim(), asset_group?.trim() || null, asset_cat?.trim() || null, asset_category || null, fuel_type?.trim() || null, id]
    );
    await db.query(
      'UPDATE machines SET eq_type = $1 WHERE LOWER(eq_type) = LOWER($2)',
      [name.trim(), old.rows[0].name]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Equipment type already exists' });
    console.error('Update equipment type error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.query;

    const typeRes = await db.query('SELECT name FROM equipment_types WHERE id = $1', [id]);
    if (typeRes.rows.length === 0) return res.status(404).json({ error: 'Equipment type not found' });
    const name = typeRes.rows[0].name;

    const usageRes = await db.query(
      'SELECT COUNT(*) FROM machines WHERE LOWER(eq_type) = LOWER($1) AND active = true', [name]
    );
    const count = parseInt(usageRes.rows[0].count);
    if (count > 0 && force !== 'true') {
      return res.status(409).json({
        error: `"${name}" is used by ${count} active machine${count > 1 ? 's' : ''}. Pass force=true to delete anyway.`,
        usage_count: count
      });
    }
    await db.query('DELETE FROM equipment_types WHERE id = $1', [id]);
    res.json({ message: 'Equipment type deleted', usage_count: count });
  } catch (err) {
    console.error('Delete equipment type error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, bulkCreate, update, remove };
