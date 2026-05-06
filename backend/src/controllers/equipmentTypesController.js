const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT et.id, et.name, et.ownership_type, et.asset_category,
             COUNT(m.id) FILTER (WHERE m.active = true) AS usage_count
      FROM equipment_types et
      LEFT JOIN machines m ON LOWER(m.eq_type) = LOWER(et.name)
      GROUP BY et.id, et.name, et.ownership_type, et.asset_category
      ORDER BY et.ownership_type, et.name
    `);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get equipment types error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { name, ownership_type = 'Own', asset_category } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!['Own', 'Hire'].includes(ownership_type))
      return res.status(400).json({ error: 'ownership_type must be Own or Hire' });
    const category = ownership_type === 'Hire' ? null : (asset_category || null);

    const result = await db.query(
      'INSERT INTO equipment_types (name, ownership_type, asset_category) VALUES ($1,$2,$3) RETURNING *',
      [name.trim(), ownership_type, category]
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
    const { names, ownership_type = 'Own', asset_category } = req.body;
    if (!Array.isArray(names) || names.length === 0)
      return res.status(400).json({ error: 'names array is required' });
    const category = ownership_type === 'Hire' ? null : (asset_category || null);
    const results = []; const errors = [];
    for (const raw of names) {
      const name = raw?.trim();
      if (!name) continue;
      try {
        const r = await db.query(
          'INSERT INTO equipment_types (name, ownership_type, asset_category) VALUES ($1,$2,$3) RETURNING *',
          [name, ownership_type, category]
        );
        results.push(r.rows[0]);
      } catch (err) {
        errors.push({ name, error: err.code === '23505' ? 'Already exists' : 'Failed' });
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
    const { name, ownership_type, asset_category } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const old = await db.query('SELECT name FROM equipment_types WHERE id = $1', [id]);
    if (old.rows.length === 0) return res.status(404).json({ error: 'Equipment type not found' });

    const owType  = ownership_type || 'Own';
    const category = owType === 'Hire' ? null : (asset_category || null);

    const result = await db.query(
      'UPDATE equipment_types SET name=$1, ownership_type=$2, asset_category=$3 WHERE id=$4 RETURNING *',
      [name.trim(), owType, category, id]
    );
    // Keep machines in sync with renamed type
    await db.query(
      'UPDATE machines SET eq_type=$1 WHERE LOWER(eq_type)=LOWER($2)',
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

    const typeRes = await db.query('SELECT name FROM equipment_types WHERE id=$1', [id]);
    if (typeRes.rows.length === 0) return res.status(404).json({ error: 'Equipment type not found' });
    const name = typeRes.rows[0].name;

    const usageRes = await db.query(
      'SELECT COUNT(*) FROM machines WHERE LOWER(eq_type)=LOWER($1) AND active=true', [name]
    );
    const count = parseInt(usageRes.rows[0].count);
    if (count > 0 && force !== 'true') {
      return res.status(409).json({
        error: `"${name}" is used by ${count} active machine${count > 1 ? 's' : ''}. Pass force=true to delete anyway.`,
        usage_count: count
      });
    }
    await db.query('DELETE FROM equipment_types WHERE id=$1', [id]);
    res.json({ message: 'Equipment type deleted', usage_count: count });
  } catch (err) {
    console.error('Delete equipment type error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, bulkCreate, update, remove };
