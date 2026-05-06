const db = require('../config/db');

const utilization = async (req, res) => {
  try {
    const { project_code, from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to date parameters are required' });
    }

    let query = `
      SELECT
        e.slno, e.eq_type, e.capacity, e.reg_no, e.ownership,
        p.code AS project_code,
        COUNT(e.id)                                            AS days_reported,
        ROUND(SUM(e.working_hours)::numeric, 2)               AS total_working,
        ROUND(SUM(e.hsd)::numeric, 2)                         AS total_hsd,
        ROUND(AVG(e.util_pct)::numeric, 1)                    AS avg_util_pct,
        ROUND(SUM(e.breakdown)::numeric, 2)                   AS total_breakdown,
        CASE WHEN SUM(e.working_hours) > 0
          THEN ROUND(SUM(e.hsd)::numeric / SUM(e.working_hours)::numeric, 2)
          ELSE 0 END                                           AS overall_fuel_avg,
        MIN(e.entry_date) AS first_date,
        MAX(e.entry_date) AS last_date
      FROM dpr_entries e
      JOIN projects p ON e.project_id = p.id
      WHERE e.entry_date BETWEEN $1 AND $2
    `;
    const params = [from, to];

    if (project_code) {
      params.push(project_code);
      query += ` AND p.code = $${params.length}`;
    }
    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ' GROUP BY e.slno, e.eq_type, e.capacity, e.reg_no, e.ownership, p.code ORDER BY p.code, e.slno';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Utilization report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const summary = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    let query = `
      SELECT
        p.code AS project_code, p.name AS project_name,
        COUNT(DISTINCT m.id)                                             AS total_machines,
        COUNT(DISTINCT CASE WHEN m.ownership = 'Own'  THEN m.id END)    AS own_machines,
        COUNT(DISTINCT CASE WHEN m.ownership = 'Hire' THEN m.id END)    AS hire_machines,
        COUNT(DISTINCT e.machine_id)                                     AS reported_machines,
        ROUND(AVG(e.util_pct)::numeric, 1)                              AS avg_utilization,
        ROUND(SUM(e.hsd)::numeric, 2)                                   AS total_hsd
      FROM projects p
      LEFT JOIN machines m ON m.project_id = p.id AND m.active = true
      LEFT JOIN dpr_entries e ON e.project_id = p.id AND e.entry_date = $1
      WHERE p.active = true
    `;
    const params = [targetDate];

    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ' GROUP BY p.id, p.code, p.name ORDER BY p.code';
    const result = await db.query(query, params);
    res.json({ data: result.rows, date: targetDate });
  } catch (err) {
    console.error('Summary report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const breakdownSummary = async (req, res) => {
  try {
    const { project_code, from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to date parameters are required' });
    }

    let query = `
      SELECT
        e.slno, e.eq_type, e.capacity, e.reg_no, e.ownership,
        p.code AS project_code,
        COUNT(e.id)                                           AS total_entries,
        COUNT(CASE WHEN e.breakdown > 0 THEN 1 END)          AS breakdown_days,
        ROUND(SUM(e.breakdown)::numeric, 2)                   AS total_breakdown_hrs,
        ROUND(SUM(e.working_hours)::numeric, 2)               AS total_working_hrs,
        CASE WHEN SUM(e.working_hours) + SUM(e.breakdown) > 0
          THEN ROUND(
            (SUM(e.breakdown)::numeric / (SUM(e.working_hours) + SUM(e.breakdown))::numeric) * 100, 1
          )
          ELSE 0
        END AS breakdown_pct,
        MIN(CASE WHEN e.breakdown > 0 THEN e.entry_date END) AS first_breakdown,
        MAX(CASE WHEN e.breakdown > 0 THEN e.entry_date END) AS last_breakdown
      FROM dpr_entries e
      JOIN projects p ON e.project_id = p.id
      WHERE e.entry_date BETWEEN $1 AND $2
    `;
    const params = [from, to];

    if (project_code) {
      params.push(project_code);
      query += ` AND p.code = $${params.length}`;
    }
    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ` GROUP BY e.slno, e.eq_type, e.capacity, e.reg_no, e.ownership, p.code
               HAVING SUM(e.breakdown) > 0
               ORDER BY total_breakdown_hrs DESC`;

    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Breakdown summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { utilization, summary, breakdownSummary };
