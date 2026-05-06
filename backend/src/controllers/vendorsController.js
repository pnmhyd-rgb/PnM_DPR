const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM vendors ORDER BY name');
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get vendors error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const upsert = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const result = await db.query(
      'INSERT INTO vendors (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
      [name.trim()]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('Upsert vendor error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, upsert };
