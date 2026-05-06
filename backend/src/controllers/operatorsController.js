const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { project_id, project_code, status } = req.query;
    let query = `
      SELECT o.*,
             p.code AS project_code, p.name AS project_name,
             m.slno AS machine_slno, m.eq_type AS machine_eq_type
      FROM operators o
      LEFT JOIN projects p ON o.project_id = p.id
      LEFT JOIN machines m ON o.machine_id = m.id
      WHERE o.active = true
    `;
    const params = [];

    if (project_id) {
      params.push(project_id);
      query += ` AND o.project_id = $${params.length}`;
    }
    if (project_code) {
      params.push(project_code);
      query += ` AND p.code = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND o.status = $${params.length}`;
    }
    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ' ORDER BY p.code NULLS LAST, o.name';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get operators error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { project_id, name, emp_id, designation, mobile, licence_no, joining_date, daily_wage, status, machine_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = await db.query(
      `INSERT INTO operators
        (project_id, name, emp_id, designation, mobile, licence_no, joining_date, daily_wage, status, machine_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        project_id || null, name.trim(),
        emp_id || null, designation || 'Operator',
        mobile || null, licence_no || null,
        joining_date || null,
        daily_wage ? parseFloat(daily_wage) : null,
        status || 'Active',
        machine_id || null
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('Create operator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { project_id, name, emp_id, designation, mobile, licence_no, joining_date, daily_wage, status, machine_id, active } = req.body;

    const result = await db.query(
      `UPDATE operators SET
        project_id   = COALESCE($1,  project_id),
        name         = COALESCE($2,  name),
        emp_id       = COALESCE($3,  emp_id),
        designation  = COALESCE($4,  designation),
        mobile       = COALESCE($5,  mobile),
        licence_no   = COALESCE($6,  licence_no),
        joining_date = COALESCE($7,  joining_date),
        daily_wage   = COALESCE($8,  daily_wage),
        status       = COALESCE($9,  status),
        machine_id   = COALESCE($10, machine_id),
        active       = COALESCE($11, active),
        updated_at   = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        project_id   !== undefined ? (project_id  || null) : null,
        name         || null,
        emp_id       !== undefined ? (emp_id      || null) : null,
        designation  || null,
        mobile       !== undefined ? (mobile      || null) : null,
        licence_no   !== undefined ? (licence_no  || null) : null,
        joining_date !== undefined ? (joining_date || null) : null,
        daily_wage   !== undefined ? (daily_wage  ? parseFloat(daily_wage) : null) : null,
        status       || null,
        machine_id   !== undefined ? (machine_id  || null) : null,
        active       !== undefined ? active        : null,
        id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Operator not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Update operator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    await db.query('UPDATE operators SET active = false, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ message: 'Operator deactivated' });
  } catch (err) {
    console.error('Delete operator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, update, remove };
