const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM fuel_type_options ORDER BY name');
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get fuel type options error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const result = await db.query(
      'INSERT INTO fuel_type_options (name) VALUES ($1) RETURNING *',
      [name.trim()]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Fuel type already exists' });
    console.error('Create fuel type option error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const result = await db.query('DELETE FROM fuel_type_options WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Fuel type option not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete fuel type option error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, remove };
