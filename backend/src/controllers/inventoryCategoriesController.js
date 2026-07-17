const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.*, p.name AS parent_name,
             COUNT(i.id) AS item_count
      FROM inventory_categories c
      LEFT JOIN inventory_categories p ON c.parent_id = p.id
      LEFT JOIN inventory_items i ON (i.category_id = c.id OR i.sub_category_id = c.id) AND i.active = true
      WHERE c.active = true
      GROUP BY c.id, p.name
      ORDER BY c.parent_id NULLS FIRST, c.name
    `);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getAll inventory_categories:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { name, parent_id, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const r = await db.query(
      `INSERT INTO inventory_categories (name, parent_id, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), parent_id || null, description || null]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error('create inventory_category:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { name, parent_id, description } = req.body;
    const r = await db.query(
      `UPDATE inventory_categories SET name=$1, parent_id=$2, description=$3
       WHERE id=$4 RETURNING *`,
      [name.trim(), parent_id || null, description || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('update inventory_category:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE inventory_categories SET active=false WHERE id=$1 RETURNING id`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('remove inventory_category:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, update, remove };
