const db = require('../config/db');

// ── Warehouses ──────────────────────────────────────────────────────────────

const getAll = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT w.*, p.name AS project_name, p.code AS project_code,
             COUNT(DISTINCT wl.id) AS location_count,
             COALESCE(SUM(s.current_qty), 0) AS total_stock_qty
      FROM warehouses w
      LEFT JOIN projects p ON p.id = w.project_id
      LEFT JOIN warehouse_locations wl ON wl.warehouse_id = w.id AND wl.active = true
      LEFT JOIN inventory_stock s ON s.warehouse_id = w.id
      WHERE w.active = true
      GROUP BY w.id, p.name, p.code
      ORDER BY w.name
    `);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getAll warehouses:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { code, name, project_id, manager, contact, address } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code and name are required' });
    const r = await db.query(
      `INSERT INTO warehouses (code, name, project_id, manager, contact, address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [code.trim().toUpperCase(), name.trim(), project_id || null, manager || null, contact || null, address || null]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Warehouse code already exists' });
    console.error('create warehouse:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { code, name, project_id, manager, contact, address } = req.body;
    const r = await db.query(
      `UPDATE warehouses SET code=$1, name=$2, project_id=$3, manager=$4, contact=$5, address=$6
       WHERE id=$7 RETURNING *`,
      [code.trim().toUpperCase(), name.trim(), project_id || null, manager || null, contact || null, address || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Warehouse code already exists' });
    console.error('update warehouse:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(`UPDATE warehouses SET active=false WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('remove warehouse:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Locations ───────────────────────────────────────────────────────────────

const getLocations = async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM warehouse_locations WHERE warehouse_id=$1 AND active=true ORDER BY rack, shelf, bin`,
      [req.params.warehouseId]
    );
    res.json({ data: r.rows });
  } catch (err) {
    console.error('getLocations:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createLocation = async (req, res) => {
  try {
    const { rack, shelf, bin } = req.body;
    const r = await db.query(
      `INSERT INTO warehouse_locations (warehouse_id, rack, shelf, bin)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.warehouseId, rack || null, shelf || null, bin || null]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error('createLocation:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const removeLocation = async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE warehouse_locations SET active=false WHERE id=$1 RETURNING id`,
      [req.params.locationId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('removeLocation:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, update, remove, getLocations, createLocation, removeLocation };
