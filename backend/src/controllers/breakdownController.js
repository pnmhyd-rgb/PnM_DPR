const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { project_id, project_code, status, from, to } = req.query;
    let query = `
      SELECT b.*, p.code AS project_code, p.name AS project_name,
             u.name AS submitted_by_name
      FROM breakdown_incidents b
      JOIN projects p ON b.project_id = p.id
      LEFT JOIN users u ON b.submitted_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (project_id)   { params.push(project_id);   query += ` AND b.project_id = $${params.length}`; }
    if (project_code) { params.push(project_code);  query += ` AND p.code = $${params.length}`; }
    if (status)       { params.push(status);         query += ` AND b.status = $${params.length}`; }
    if (from)         { params.push(from);            query += ` AND b.entry_date >= $${params.length}`; }
    if (to)           { params.push(to);              query += ` AND b.entry_date <= $${params.length}`; }

    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ' ORDER BY CASE b.status WHEN \'Open\' THEN 1 WHEN \'In Progress\' THEN 2 ELSE 3 END, b.entry_date DESC';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get breakdown incidents error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { project_id, machine_id, entry_date, description, cause, action_taken, downtime_hours, repair_cost } = req.body;
    if (!project_id || !entry_date || !description) {
      return res.status(400).json({ error: 'project_id, entry_date, and description are required' });
    }

    let slno = null, eq_type = null;
    if (machine_id) {
      const m = await db.query('SELECT slno, eq_type FROM machines WHERE id = $1 AND active = true', [machine_id]);
      if (m.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
      slno    = m.rows[0].slno;
      eq_type = m.rows[0].eq_type;
    }

    const result = await db.query(
      `INSERT INTO breakdown_incidents
        (project_id, machine_id, entry_date, slno, eq_type, description, cause, action_taken, downtime_hours, repair_cost, submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        project_id, machine_id || null, entry_date, slno, eq_type,
        description.trim(),
        cause        || null,
        action_taken || null,
        downtime_hours ? parseFloat(downtime_hours) : null,
        repair_cost    ? parseFloat(repair_cost)    : null,
        req.user.id
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('Create breakdown incident error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, action_taken, repair_cost, downtime_hours } = req.body;

    if (!status || !['Open', 'In Progress', 'Resolved'].includes(status)) {
      return res.status(400).json({ error: 'status must be Open, In Progress, or Resolved' });
    }

    const resolvedAt = status === 'Resolved' ? new Date().toISOString() : null;

    const result = await db.query(
      `UPDATE breakdown_incidents SET
        status         = $1,
        action_taken   = COALESCE($2, action_taken),
        repair_cost    = COALESCE($3, repair_cost),
        downtime_hours = COALESCE($4, downtime_hours),
        resolved_at    = COALESCE($5, resolved_at),
        updated_at     = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        status,
        action_taken   || null,
        repair_cost    ? parseFloat(repair_cost)    : null,
        downtime_hours ? parseFloat(downtime_hours) : null,
        resolvedAt,
        id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Update breakdown status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const result = await db.query('DELETE FROM breakdown_incidents WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
    res.json({ message: 'Incident deleted' });
  } catch (err) {
    console.error('Delete breakdown incident error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, updateStatus, remove };
