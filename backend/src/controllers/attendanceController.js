const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { project_id, project_code, operator_id, date, from, to } = req.query;
    let query = `
      SELECT a.*,
             o.name AS operator_name, o.emp_id, o.designation,
             p.code AS project_code, p.name AS project_name,
             u.name AS submitted_by_name
      FROM attendance a
      JOIN operators o ON a.operator_id = o.id
      JOIN projects p ON a.project_id = p.id
      LEFT JOIN users u ON a.submitted_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (project_id)   { params.push(project_id);   query += ` AND a.project_id = $${params.length}`; }
    if (project_code) { params.push(project_code);  query += ` AND p.code = $${params.length}`; }
    if (operator_id)  { params.push(operator_id);   query += ` AND a.operator_id = $${params.length}`; }
    if (date)         { params.push(date);           query += ` AND a.entry_date = $${params.length}`; }
    if (from)         { params.push(from);           query += ` AND a.entry_date >= $${params.length}`; }
    if (to)           { params.push(to);             query += ` AND a.entry_date <= $${params.length}`; }

    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ' ORDER BY a.entry_date DESC, o.name';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { operator_id, project_id, entry_date, status, shift, ot_hours, remarks } = req.body;
    if (!operator_id || !project_id || !entry_date) {
      return res.status(400).json({ error: 'operator_id, project_id, and entry_date are required' });
    }

    const result = await db.query(
      `INSERT INTO attendance (operator_id, project_id, entry_date, status, shift, ot_hours, remarks, submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        operator_id, project_id, entry_date,
        status || 'Present', shift || 'Day',
        ot_hours ? parseFloat(ot_hours) : 0,
        remarks || null, req.user.id
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Attendance already marked for this operator, date, and shift' });
    }
    console.error('Create attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const result = await db.query('DELETE FROM attendance WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
    res.json({ message: 'Attendance record deleted' });
  } catch (err) {
    console.error('Delete attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, remove };
