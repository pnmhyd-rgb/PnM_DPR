const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { project_id, project_code, from, to, machine_id } = req.query;
    let query = `
      SELECT f.*, p.code AS project_code, p.name AS project_name,
             u.name AS submitted_by_name
      FROM fuel_entries f
      JOIN projects p ON f.project_id = p.id
      LEFT JOIN users u ON f.submitted_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (project_id) { params.push(project_id); query += ` AND f.project_id = $${params.length}`; }
    if (project_code) { params.push(project_code); query += ` AND p.code = $${params.length}`; }
    if (machine_id) { params.push(machine_id); query += ` AND f.machine_id = $${params.length}`; }
    if (from) { params.push(from); query += ` AND f.entry_date >= $${params.length}`; }
    if (to)   { params.push(to);   query += ` AND f.entry_date <= $${params.length}`; }

    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ' ORDER BY f.entry_date DESC, f.created_at DESC';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get fuel entries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { project_id, machine_id, entry_date, fuel_type, qty, rate, operator_name, remarks } = req.body;

    if (!project_id || !entry_date || !qty) {
      return res.status(400).json({ error: 'project_id, entry_date, and qty are required' });
    }

    let slno = null, eq_type = null;
    if (machine_id) {
      const m = await db.query('SELECT slno, eq_type FROM machines WHERE id = $1 AND active = true', [machine_id]);
      if (m.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
      slno = m.rows[0].slno;
      eq_type = m.rows[0].eq_type;
    }

    const parsedQty  = parseFloat(qty);
    const parsedRate = rate ? parseFloat(rate) : null;
    const total      = parsedRate ? parseFloat((parsedQty * parsedRate).toFixed(2)) : null;

    const result = await db.query(
      `INSERT INTO fuel_entries
        (project_id, machine_id, entry_date, slno, eq_type, fuel_type, qty, rate, total, operator_name, remarks, submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [project_id, machine_id ?? null, entry_date, slno, eq_type,
       fuel_type ?? 'Diesel', parsedQty, parsedRate, total,
       operator_name ?? null, remarks ?? null, req.user.id]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('Create fuel entry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const result = await db.query('DELETE FROM fuel_entries WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ message: 'Fuel entry deleted' });
  } catch (err) {
    console.error('Delete fuel entry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, remove };
