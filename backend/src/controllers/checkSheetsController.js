const db = require('../config/db');

// ── Check Sheets ──────────────────────────────────────────────────────────────

const getAll = async (req, res) => {
  try {
    const { active, asset_type, search } = req.query;
    let q = `
      SELECT cs.*, u.name AS created_by_name,
             (SELECT COUNT(*) FROM service_schedules ss WHERE ss.check_sheet_id = cs.id AND ss.status = 'active') AS schedule_count
        FROM check_sheets cs
        LEFT JOIN users u ON cs.created_by = u.id
       WHERE 1=1
    `;
    const params = [];
    if (active !== undefined) { params.push(active === 'true'); q += ` AND cs.active = $${params.length}`; }
    if (asset_type) { params.push(asset_type); q += ` AND cs.asset_type ILIKE $${params.length}`; }
    if (search) { params.push(`%${search}%`); q += ` AND (cs.name ILIKE $${params.length} OR cs.sheet_code ILIKE $${params.length})`; }
    q += ' ORDER BY cs.created_at DESC';
    const result = await db.query(q, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getAll check sheets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getOne = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT cs.*, u.name AS created_by_name
        FROM check_sheets cs LEFT JOIN users u ON cs.created_by = u.id
       WHERE cs.id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('getOne check sheet error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { name, asset_type, frequency, frequency_value, estimated_duration_hours, check_items, parts_required } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const lastCode = await db.query(`SELECT sheet_code FROM check_sheets ORDER BY id DESC LIMIT 1`);
    let nextNum = 1001;
    if (lastCode.rows.length) {
      const m = lastCode.rows[0].sheet_code.match(/CS-(\d+)/);
      if (m) nextNum = parseInt(m[1]) + 1;
    }
    const sheet_code = `CS-${nextNum}`;

    const r = await db.query(
      `INSERT INTO check_sheets (sheet_code, name, asset_type, frequency, frequency_value, estimated_duration_hours, check_items, parts_required, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [sheet_code, name, asset_type || null, frequency || 'daily', frequency_value || 1,
       estimated_duration_hours || null,
       JSON.stringify(check_items || []),
       JSON.stringify(parts_required || []),
       req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error('create check sheet error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { name, asset_type, frequency, frequency_value, estimated_duration_hours, check_items, parts_required, active } = req.body;
    const r = await db.query(
      `UPDATE check_sheets SET
         name=$1, asset_type=$2, frequency=$3, frequency_value=$4,
         estimated_duration_hours=$5, check_items=$6, parts_required=$7,
         active=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name, asset_type || null, frequency || 'daily', frequency_value || 1,
       estimated_duration_hours || null,
       JSON.stringify(check_items || []),
       JSON.stringify(parts_required || []),
       active !== false, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('update check sheet error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(`UPDATE check_sheets SET active=false WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('delete check sheet error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Service Schedules ─────────────────────────────────────────────────────────

const getSchedules = async (req, res) => {
  try {
    const { machine_id, status, overdue } = req.query;
    let q = `
      SELECT ss.*, cs.name AS check_sheet_name, cs.sheet_code, cs.frequency, cs.estimated_duration_hours,
             cs.check_items,
             m.slno AS machine_slno, m.nickname AS machine_name, m.eq_type,
             p.code AS project_code, p.name AS project_name,
             u.name AS created_by_name,
             CURRENT_DATE - ss.next_due_date AS days_overdue
        FROM service_schedules ss
        JOIN check_sheets cs ON ss.check_sheet_id = cs.id
        JOIN machines m ON ss.machine_id = m.id
        LEFT JOIN projects p ON ss.project_id = p.id
        LEFT JOIN users u ON ss.created_by = u.id
       WHERE 1=1
    `;
    const params = [];
    if (machine_id) { params.push(machine_id); q += ` AND ss.machine_id = $${params.length}`; }
    if (status) { params.push(status); q += ` AND ss.status = $${params.length}`; }
    if (overdue === 'true') { q += ` AND ss.next_due_date < CURRENT_DATE AND ss.status = 'active'`; }
    q += ' ORDER BY ss.next_due_date ASC NULLS LAST';
    const result = await db.query(q, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getSchedules error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createSchedule = async (req, res) => {
  try {
    const { check_sheet_id, machine_id, project_id, start_date, next_due_date, next_meter } = req.body;
    if (!check_sheet_id || !machine_id || !start_date) {
      return res.status(400).json({ error: 'check_sheet_id, machine_id, start_date required' });
    }
    const r = await db.query(
      `INSERT INTO service_schedules (check_sheet_id, machine_id, project_id, start_date, next_due_date, next_meter, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [check_sheet_id, machine_id, project_id || null, start_date, next_due_date || start_date, next_meter || null, req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error('createSchedule error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateSchedule = async (req, res) => {
  try {
    const { next_due_date, next_meter, status } = req.body;
    const r = await db.query(
      `UPDATE service_schedules SET next_due_date=$1, next_meter=$2, status=$3 WHERE id=$4 RETURNING *`,
      [next_due_date, next_meter || null, status || 'active', req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('updateSchedule error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Service Executions ────────────────────────────────────────────────────────

const getExecutions = async (req, res) => {
  try {
    const { schedule_id, machine_id, from, to } = req.query;
    let q = `
      SELECT se.*, cs.name AS check_sheet_name, cs.sheet_code,
             m.slno AS machine_slno, m.nickname AS machine_name,
             u.name AS created_by_name,
             (SELECT COALESCE(json_agg(p ORDER BY p.id), '[]') FROM service_execution_parts p WHERE p.execution_id = se.id) AS parts_used
        FROM service_executions se
        JOIN check_sheets cs ON se.check_sheet_id = cs.id
        JOIN machines m ON se.machine_id = m.id
        LEFT JOIN users u ON se.created_by = u.id
       WHERE 1=1
    `;
    const params = [];
    if (schedule_id) { params.push(schedule_id); q += ` AND se.schedule_id = $${params.length}`; }
    if (machine_id) { params.push(machine_id); q += ` AND se.machine_id = $${params.length}`; }
    if (from) { params.push(from); q += ` AND se.execution_date >= $${params.length}`; }
    if (to) { params.push(to); q += ` AND se.execution_date <= $${params.length}`; }
    q += ' ORDER BY se.execution_date DESC, se.created_at DESC';
    const result = await db.query(q, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getExecutions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createExecution = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const {
      schedule_id, execution_date, start_time, end_time,
      meter_reading, technician_name, vendor_id,
      overall_status, remarks, items_result, parts_used
    } = req.body;

    if (!schedule_id || !execution_date) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'schedule_id and execution_date are required' });
    }

    const sch = await client.query(
      `SELECT ss.*, cs.check_items FROM service_schedules ss
         JOIN check_sheets cs ON ss.check_sheet_id = cs.id
        WHERE ss.id = $1`, [schedule_id]
    );
    if (!sch.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Schedule not found' }); }
    const schedule = sch.rows[0];

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const lastEx = await client.query(`SELECT execution_number FROM service_executions WHERE execution_number LIKE $1 ORDER BY id DESC LIMIT 1`, [`EX-${today}-%`]);
    let seq = 1;
    if (lastEx.rows.length) {
      const m = lastEx.rows[0].execution_number.match(/-(\d+)$/);
      if (m) seq = parseInt(m[1]) + 1;
    }
    const execution_number = `EX-${today}-${String(seq).padStart(5, '0')}`;

    const exRes = await client.query(
      `INSERT INTO service_executions
         (execution_number, schedule_id, check_sheet_id, machine_id, execution_date,
          start_time, end_time, meter_reading, technician_name, vendor_id,
          overall_status, remarks, items_result, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [execution_number, schedule_id, schedule.check_sheet_id, schedule.machine_id,
       execution_date, start_time || null, end_time || null, meter_reading || null,
       technician_name || null, vendor_id || null,
       overall_status || 'completed', remarks || null,
       JSON.stringify(items_result || []), req.user.id]
    );
    const execution = exRes.rows[0];

    if (parts_used && parts_used.length > 0) {
      for (const part of parts_used) {
        if (!part.part_name || !part.qty_used) continue;
        await client.query(
          `INSERT INTO service_execution_parts (execution_id, item_id, part_name, part_code, qty_used, unit, unit_cost, amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [execution.id, part.item_id || null, part.part_name, part.part_code || null,
           part.qty_used, part.unit || null, part.unit_cost || null,
           part.unit_cost ? parseFloat(part.qty_used) * parseFloat(part.unit_cost) : null]
        );
      }
    }

    await client.query(
      `UPDATE service_schedules SET last_done_date=$1, last_meter=$2 WHERE id=$3`,
      [execution_date, meter_reading || null, schedule_id]
    );

    await client.query('COMMIT');
    res.status(201).json({ data: execution });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createExecution error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

module.exports = {
  getAll, getOne, create, update, remove,
  getSchedules, createSchedule, updateSchedule,
  getExecutions, createExecution,
};
