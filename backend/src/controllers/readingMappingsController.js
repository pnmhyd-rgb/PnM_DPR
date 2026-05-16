const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { equipment_type_name } = req.query;
    let query = `
      SELECT erm.*, rt.code, rt.name AS reading_name, rt.unit
      FROM equipment_reading_mappings erm
      JOIN reading_types rt ON rt.id = erm.reading_type_id
      WHERE 1=1
    `;
    const params = [];
    if (equipment_type_name) {
      params.push(equipment_type_name);
      query += ` AND LOWER(erm.equipment_type_name) = LOWER($${params.length})`;
    }
    query += ' ORDER BY erm.equipment_type_name, erm.display_order';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get reading mappings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Returns mappings grouped by equipment type (for admin UI)
const getGrouped = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        erm.equipment_type_name,
        et.asset_category,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', erm.id,
            'reading_type_id', erm.reading_type_id,
            'code', rt.code,
            'reading_name', rt.name,
            'unit', rt.unit,
            'mandatory', erm.mandatory,
            'display_order', erm.display_order
          ) ORDER BY erm.display_order
        ) AS readings
      FROM equipment_reading_mappings erm
      JOIN reading_types rt ON rt.id = erm.reading_type_id
      LEFT JOIN equipment_types et ON LOWER(et.name) = LOWER(erm.equipment_type_name)
      GROUP BY erm.equipment_type_name, et.asset_category
      ORDER BY erm.equipment_type_name
    `);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get grouped mappings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { equipment_type_name, reading_type_id, mandatory, display_order } = req.body;
    if (!equipment_type_name || !reading_type_id) {
      return res.status(400).json({ error: 'equipment_type_name and reading_type_id are required' });
    }
    const result = await db.query(
      `INSERT INTO equipment_reading_mappings (equipment_type_name, reading_type_id, mandatory, display_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [equipment_type_name.trim(), reading_type_id, mandatory !== false, display_order || 1]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Mapping already exists' });
    console.error('Create reading mapping error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { mandatory, display_order } = req.body;
    const result = await db.query(
      `UPDATE equipment_reading_mappings SET
        mandatory     = COALESCE($1, mandatory),
        display_order = COALESCE($2, display_order)
       WHERE id = $3 RETURNING *`,
      [mandatory !== undefined ? mandatory : null, display_order || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Mapping not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Update reading mapping error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const result = await db.query('DELETE FROM equipment_reading_mappings WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Mapping not found' });
    res.json({ message: 'Mapping deleted' });
  } catch (err) {
    console.error('Delete reading mapping error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Bulk replace all mappings for an equipment type
const bulkReplace = async (req, res) => {
  try {
    const { equipment_type_name, readings } = req.body;
    if (!equipment_type_name) return res.status(400).json({ error: 'equipment_type_name is required' });
    await db.query('DELETE FROM equipment_reading_mappings WHERE LOWER(equipment_type_name) = LOWER($1)', [equipment_type_name]);
    if (Array.isArray(readings) && readings.length > 0) {
      for (const r of readings) {
        await db.query(
          `INSERT INTO equipment_reading_mappings (equipment_type_name, reading_type_id, mandatory, display_order)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [equipment_type_name.trim(), r.reading_type_id, r.mandatory !== false, r.display_order || 1]
        );
      }
    }
    res.json({ message: 'Mappings updated' });
  } catch (err) {
    console.error('Bulk replace mappings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getGrouped, create, update, remove, bulkReplace };
