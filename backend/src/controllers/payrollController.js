const db = require('../config/db');

// List all payroll runs
const getAll = async (req, res) => {
  try {
    const { project_code } = req.query;
    let query = `
      SELECT r.*, p.code AS project_code, p.name AS project_name,
             u.name AS created_by_name,
             COUNT(i.id)::int AS operator_count
      FROM payroll_runs r
      JOIN projects p ON r.project_id = p.id
      LEFT JOIN users u ON r.created_by = u.id
      LEFT JOIN payroll_items i ON i.payroll_run_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (project_code) { params.push(project_code); query += ` AND p.code = $${params.length}`; }
    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ' GROUP BY r.id, p.code, p.name, u.name ORDER BY r.created_at DESC';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get payroll runs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get items for a single run
const getItems = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM payroll_items WHERE payroll_run_id = $1 ORDER BY operator_name',
      [req.params.id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get payroll items error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Generate payroll from attendance records
const generate = async (req, res) => {
  const client = await db.getClient();
  try {
    const { project_id, period_from, period_to, notes } = req.body;
    if (!project_id || !period_from || !period_to) {
      return res.status(400).json({ error: 'project_id, period_from, and period_to are required' });
    }
    if (period_from > period_to) {
      return res.status(400).json({ error: 'period_from must be before period_to' });
    }

    // Fetch all active operators for this project
    const opsResult = await client.query(
      'SELECT * FROM operators WHERE project_id = $1 AND active = true ORDER BY name',
      [project_id]
    );
    if (opsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No active operators found for this project' });
    }

    // For each operator, aggregate attendance in the period
    const attResult = await client.query(
      `SELECT
         operator_id,
         COUNT(CASE WHEN status = 'Present'  THEN 1 END)::int  AS present_count,
         COUNT(CASE WHEN status = 'Half Day' THEN 1 END)::int  AS half_day_count,
         COUNT(CASE WHEN status = 'Absent'   THEN 1 END)::int  AS absent_count,
         COUNT(CASE WHEN status IN ('On Leave','Holiday') THEN 1 END)::int AS on_leave_count,
         COALESCE(SUM(ot_hours), 0)::numeric                  AS total_ot
       FROM attendance
       WHERE project_id = $1 AND entry_date BETWEEN $2 AND $3
       GROUP BY operator_id`,
      [project_id, period_from, period_to]
    );

    const attMap = {};
    attResult.rows.forEach(r => { attMap[r.operator_id] = r; });

    // Build payroll items
    const items = opsResult.rows.map(op => {
      const att = attMap[op.id] || { present_count: 0, half_day_count: 0, absent_count: 0, on_leave_count: 0, total_ot: 0 };
      const dailyWage    = parseFloat(op.daily_wage) || 0;
      const presentDays  = parseFloat(att.present_count) + parseFloat(att.half_day_count) * 0.5;
      const otHours      = parseFloat(att.total_ot) || 0;
      const basicPay     = parseFloat((presentDays * dailyWage).toFixed(2));
      // OT rate = daily_wage / 8 hours
      const otPay        = parseFloat((otHours * (dailyWage / 8)).toFixed(2));
      const netPay       = parseFloat((basicPay + otPay).toFixed(2));
      return {
        operator_id:   op.id,
        operator_name: op.name,
        emp_id:        op.emp_id || null,
        designation:   op.designation,
        daily_wage:    dailyWage,
        present_days:  presentDays,
        half_days:     parseInt(att.half_day_count),
        absent_days:   parseInt(att.absent_count),
        on_leave_days: parseInt(att.on_leave_count),
        ot_hours:      otHours,
        basic_pay:     basicPay,
        ot_pay:        otPay,
        deductions:    0,
        net_pay:       netPay,
      };
    });

    const totalAmount = items.reduce((s, i) => s + i.net_pay, 0);

    await client.query('BEGIN');

    // Insert run header
    const runResult = await client.query(
      `INSERT INTO payroll_runs (project_id, period_from, period_to, status, total_amount, notes, created_by)
       VALUES ($1,$2,$3,'Draft',$4,$5,$6) RETURNING *`,
      [project_id, period_from, period_to, totalAmount.toFixed(2), notes || null, req.user.id]
    );
    const run = runResult.rows[0];

    // Insert items
    for (const item of items) {
      await client.query(
        `INSERT INTO payroll_items
          (payroll_run_id, operator_id, operator_name, emp_id, designation,
           daily_wage, present_days, half_days, absent_days, on_leave_days,
           ot_hours, basic_pay, ot_pay, deductions, net_pay)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          run.id, item.operator_id, item.operator_name, item.emp_id, item.designation,
          item.daily_wage, item.present_days, item.half_days, item.absent_days, item.on_leave_days,
          item.ot_hours, item.basic_pay, item.ot_pay, item.deductions, item.net_pay
        ]
      );
    }

    await client.query('COMMIT');

    // Return run with items
    const itemsResult = await db.query(
      'SELECT * FROM payroll_items WHERE payroll_run_id = $1 ORDER BY operator_name',
      [run.id]
    );
    res.status(201).json({ data: { run, items: itemsResult.rows } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Generate payroll error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

// Update run status: Draft → Approved → Paid
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    if (!status || !['Draft', 'Approved', 'Paid'].includes(status)) {
      return res.status(400).json({ error: 'status must be Draft, Approved, or Paid' });
    }
    const result = await db.query(
      `UPDATE payroll_runs SET status=$1, notes=COALESCE($2,notes), updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [status, notes || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Payroll run not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Update payroll status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete a draft payroll run (cascade deletes items)
const remove = async (req, res) => {
  try {
    const run = await db.query('SELECT status FROM payroll_runs WHERE id=$1', [req.params.id]);
    if (run.rows.length === 0) return res.status(404).json({ error: 'Payroll run not found' });
    if (run.rows[0].status === 'Paid') {
      return res.status(400).json({ error: 'Cannot delete a Paid payroll run' });
    }
    await db.query('DELETE FROM payroll_runs WHERE id=$1', [req.params.id]);
    res.json({ message: 'Payroll run deleted' });
  } catch (err) {
    console.error('Delete payroll run error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getItems, generate, updateStatus, remove };
