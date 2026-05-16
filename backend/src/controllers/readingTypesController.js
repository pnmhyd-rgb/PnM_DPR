const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT rt.*,
        COUNT(erm.id)::int AS mapping_count,
        COUNT(mrc.id)::int AS machine_count
      FROM reading_types rt
      LEFT JOIN equipment_reading_mappings erm ON erm.reading_type_id = rt.id
      LEFT JOIN machine_reading_configs mrc ON mrc.reading_type_id = rt.id AND mrc.is_active = true
      GROUP BY rt.id
      ORDER BY rt.code
    `);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get reading types error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { code, name, unit, input_type, decimal_allowed } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code and name are required' });
    const result = await db.query(
      `INSERT INTO reading_types (code, name, unit, input_type, decimal_allowed)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [code.trim().toUpperCase(), name.trim(), unit || 'Hrs', input_type || 'Number', decimal_allowed !== false]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Reading type code already exists' });
    console.error('Create reading type error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, unit, input_type, decimal_allowed, active } = req.body;
    const result = await db.query(
      `UPDATE reading_types SET
        name            = COALESCE($1, name),
        unit            = COALESCE($2, unit),
        input_type      = COALESCE($3, input_type),
        decimal_allowed = COALESCE($4, decimal_allowed),
        active          = COALESCE($5, active)
       WHERE id = $6 RETURNING *`,
      [name || null, unit || null, input_type || null,
       decimal_allowed !== undefined ? decimal_allowed : null,
       active !== undefined ? active : null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reading type not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Update reading type error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';

    if (force) {
      // Cascade: remove all dependent records before deleting the type
      await db.query('DELETE FROM dpr_reading_logs       WHERE reading_type_id = $1', [id]);
      await db.query('DELETE FROM machine_reading_configs WHERE reading_type_id = $1', [id]);
      await db.query('DELETE FROM equipment_reading_mappings WHERE reading_type_id = $1', [id]);
    } else {
      const usage = await db.query('SELECT COUNT(*)::int AS cnt FROM equipment_reading_mappings WHERE reading_type_id = $1', [id]);
      if (usage.rows[0].cnt > 0) {
        return res.status(409).json({ error: `Reading type is used in ${usage.rows[0].cnt} equipment mapping(s). Use force delete to remove it along with all mappings.` });
      }
    }

    const result = await db.query('DELETE FROM reading_types WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reading type not found' });
    res.json({ message: 'Reading type deleted' });
  } catch (err) {
    console.error('Delete reading type error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, update, remove };
