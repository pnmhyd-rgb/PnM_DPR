const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM designations ORDER BY name');
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get designations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const result = await db.query(
      'INSERT INTO designations (name) VALUES ($1) RETURNING *',
      [name.trim()]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Designation already exists' });
    console.error('Create designation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    await db.query('DELETE FROM designations WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete designation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, remove };
