const db = require('../config/db');

const getForMachine = async (req, res) => {
  try {
    const { machine_id } = req.params;
    const result = await db.query(`
      SELECT mrc.*, rt.code, rt.name AS reading_name, rt.unit
      FROM machine_reading_configs mrc
      JOIN reading_types rt ON rt.id = mrc.reading_type_id
      WHERE mrc.machine_id = $1
      ORDER BY mrc.display_order
    `, [machine_id]);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get machine reading configs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const toggleActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const result = await db.query(
      'UPDATE machine_reading_configs SET is_active = $1 WHERE id = $2 RETURNING *',
      [is_active, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Config not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Toggle reading config error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Replace all reading configs for a machine (admin use)
const setConfigs = async (req, res) => {
  try {
    const { machine_id } = req.params;
    const { reading_type_ids } = req.body; // [{reading_type_id, display_order}]
    if (!Array.isArray(reading_type_ids)) {
      return res.status(400).json({ error: 'reading_type_ids array is required' });
    }
    await db.query('DELETE FROM machine_reading_configs WHERE machine_id = $1', [machine_id]);
    for (const r of reading_type_ids) {
      await db.query(
        `INSERT INTO machine_reading_configs (machine_id, reading_type_id, is_active, display_order)
         VALUES ($1, $2, true, $3) ON CONFLICT DO NOTHING`,
        [machine_id, r.reading_type_id, r.display_order || 1]
      );
    }
    const result = await db.query(`
      SELECT mrc.*, rt.code, rt.name AS reading_name, rt.unit
      FROM machine_reading_configs mrc
      JOIN reading_types rt ON rt.id = mrc.reading_type_id
      WHERE mrc.machine_id = $1 ORDER BY mrc.display_order
    `, [machine_id]);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Set machine reading configs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getForMachine, toggleActive, setConfigs };
