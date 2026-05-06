const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { project_id, project_code, txn_type, from, to, item_name } = req.query;
    let query = `
      SELECT t.*, p.code AS project_code, p.name AS project_name,
             u.name AS submitted_by_name
      FROM spare_transactions t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.submitted_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (project_id)   { params.push(project_id);   query += ` AND t.project_id = $${params.length}`; }
    if (project_code) { params.push(project_code);  query += ` AND p.code = $${params.length}`; }
    if (txn_type)     { params.push(txn_type);       query += ` AND t.txn_type = $${params.length}`; }
    if (from)         { params.push(from);            query += ` AND t.entry_date >= $${params.length}`; }
    if (to)           { params.push(to);              query += ` AND t.entry_date <= $${params.length}`; }
    if (item_name)    { params.push(`%${item_name}%`); query += ` AND t.item_name ILIKE $${params.length}`; }

    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ' ORDER BY t.entry_date DESC, t.created_at DESC';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get spare transactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Net stock per item: Receipt + Return - Issue
const getStockSummary = async (req, res) => {
  try {
    const { project_id, project_code } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (project_id) {
      params.push(project_id);
      where += ` AND t.project_id = $${params.length}`;
    }
    if (project_code) {
      params.push(project_code);
      where += ` AND p.code = $${params.length}`;
    }
    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      where += ` AND p.code = ANY($${params.length})`;
    }

    const query = `
      SELECT
        t.item_name,
        MAX(t.item_code) AS item_code,
        MAX(t.unit) AS unit,
        SUM(CASE WHEN t.txn_type = 'Receipt' THEN t.qty ELSE 0 END) AS total_received,
        SUM(CASE WHEN t.txn_type = 'Issue'   THEN t.qty ELSE 0 END) AS total_issued,
        SUM(CASE WHEN t.txn_type = 'Return'  THEN t.qty ELSE 0 END) AS total_returned,
        SUM(CASE
          WHEN t.txn_type = 'Receipt' THEN  t.qty
          WHEN t.txn_type = 'Issue'   THEN -t.qty
          WHEN t.txn_type = 'Return'  THEN  t.qty
          ELSE 0
        END) AS current_stock
      FROM spare_transactions t
      JOIN projects p ON t.project_id = p.id
      ${where}
      GROUP BY t.item_name
      ORDER BY t.item_name
    `;
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get stock summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { project_id, machine_id, entry_date, txn_type, item_name, item_code, unit, qty, unit_cost, remarks } = req.body;

    if (!project_id || !entry_date || !txn_type || !item_name || !qty) {
      return res.status(400).json({ error: 'project_id, entry_date, txn_type, item_name, and qty are required' });
    }
    if (!['Receipt', 'Issue', 'Return'].includes(txn_type)) {
      return res.status(400).json({ error: 'txn_type must be Receipt, Issue, or Return' });
    }

    let slno = null, eq_type = null;
    if (machine_id) {
      const m = await db.query('SELECT slno, eq_type FROM machines WHERE id = $1 AND active = true', [machine_id]);
      if (m.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
      slno    = m.rows[0].slno;
      eq_type = m.rows[0].eq_type;
    }

    const parsedQty  = parseFloat(qty);
    const parsedCost = unit_cost ? parseFloat(unit_cost) : null;
    const total      = parsedCost ? parseFloat((parsedQty * parsedCost).toFixed(2)) : null;

    const result = await db.query(
      `INSERT INTO spare_transactions
        (project_id, machine_id, entry_date, txn_type, item_name, item_code, unit, slno, eq_type, qty, unit_cost, total, remarks, submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        project_id, machine_id || null, entry_date, txn_type,
        item_name.trim(), item_code || null, unit || 'Nos',
        slno, eq_type,
        parsedQty, parsedCost, total,
        remarks || null, req.user.id
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('Create spare transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const result = await db.query('DELETE FROM spare_transactions WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    console.error('Delete spare transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getStockSummary, create, remove };
