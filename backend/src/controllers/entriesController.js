const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { project_id, project_code, date, from, to, ownership, machine_id } = req.query;
    let query = `
      SELECT e.*, p.code AS project_code, p.name AS project_name,
             u.name AS submitted_by_name
      FROM dpr_entries e
      JOIN projects p ON e.project_id = p.id
      LEFT JOIN users u ON e.submitted_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (machine_id) {
      params.push(machine_id);
      query += ` AND e.machine_id = $${params.length}`;
    }
    if (project_id) {
      params.push(project_id);
      query += ` AND e.project_id = $${params.length}`;
    }
    if (project_code) {
      params.push(project_code);
      query += ` AND p.code = $${params.length}`;
    }
    if (date) {
      params.push(date);
      query += ` AND e.entry_date = $${params.length}`;
    }
    if (from) {
      params.push(from);
      query += ` AND e.entry_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      query += ` AND e.entry_date <= $${params.length}`;
    }
    if (ownership) {
      params.push(ownership);
      query += ` AND e.ownership = $${params.length}`;
    }
    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ' ORDER BY e.entry_date DESC, e.submitted_at DESC';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get entries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const SHIFT_MAX_HOURS = { 'Day Shift': 12, 'Night Shift': 12, 'Dual Shift': 24 };

const getPreviousClosing = async (req, res) => {
  try {
    const { machine_id, entry_date, shift } = req.query;
    if (!machine_id || !entry_date || !shift) {
      return res.status(400).json({ error: 'machine_id, entry_date, and shift are required' });
    }

    let query, params;

    if (shift === 'Night Shift') {
      // Night Shift opens where Day Shift of the same date closed
      query = `SELECT r1_close, r2_close FROM dpr_entries
               WHERE machine_id = $1 AND entry_date = $2 AND shift = 'Day Shift'`;
      params = [machine_id, entry_date];
    } else {
      // Day Shift / Dual Shift opens where the previous day's last shift closed
      // Prefer Night Shift, then Dual Shift, then any
      query = `SELECT r1_close, r2_close FROM dpr_entries
               WHERE machine_id = $1 AND entry_date = $2::date - INTERVAL '1 day'
               ORDER BY CASE shift WHEN 'Night Shift' THEN 1 WHEN 'Dual Shift' THEN 2 ELSE 3 END
               LIMIT 1`;
      params = [machine_id, entry_date];
    }

    const result = await db.query(query, params);
    res.json({ data: result.rows[0] || null });
  } catch (err) {
    console.error('Get previous closing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const {
      machine_id, project_id, entry_date, shift,
      r1_open, r1_close, r2_open, r2_close,
      hsd, breakdown, qty, work_done, remarks
    } = req.body;

    if (!machine_id || !project_id || !entry_date) {
      return res.status(400).json({ error: 'machine_id, project_id, and entry_date are required' });
    }
    if (!shift || !SHIFT_MAX_HOURS[shift]) {
      return res.status(400).json({ error: 'shift is required (Day Shift, Night Shift, or Dual Shift)' });
    }

    const machineResult = await db.query(
      'SELECT * FROM machines WHERE id = $1 AND active = true',
      [machine_id]
    );
    if (machineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }
    const machine = machineResult.rows[0];

    const r1Total = r1_close != null && r1_open != null
      ? parseFloat(r1_close) - parseFloat(r1_open) : null;
    const r2Total = r2_close != null && r2_open != null
      ? parseFloat(r2_close) - parseFloat(r2_open) : null;

    if (r1Total !== null && r1Total < 0) {
      return res.status(400).json({ error: 'Reading 1: closing must be greater than or equal to opening — total hours cannot be negative' });
    }
    if (r2Total !== null && r2Total < 0) {
      return res.status(400).json({ error: 'Reading 2: closing must be greater than or equal to opening — total hours cannot be negative' });
    }

    const workingHours = (r1Total || 0) + (machine.dual_reading && r2Total ? r2Total : 0);

    const maxHours = SHIFT_MAX_HOURS[shift];
    if (workingHours > maxHours) {
      return res.status(400).json({
        error: `${shift}: total hours (${workingHours.toFixed(2)}) exceed the ${maxHours}-hour limit`
      });
    }

    const plannedHours = parseFloat(machine.planned_hours) || 10;
    const utilPct = plannedHours > 0 ? Math.round((workingHours / plannedHours) * 100) : 0;
    const fuelAvg = workingHours > 0 && hsd
      ? parseFloat((parseFloat(hsd) / workingHours).toFixed(2)) : null;

    const result = await db.query(
      `INSERT INTO dpr_entries (
        machine_id, project_id, entry_date, shift,
        slno, eq_type, capacity, reg_no, ownership, dual_reading, planned_hours,
        r1_open, r1_close, r1_total, r2_open, r2_close, r2_total,
        working_hours, util_pct, hsd, fuel_avg,
        breakdown, qty, work_done, remarks, submitted_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
        $22,$23,$24,$25,$26
      ) RETURNING *`,
      [
        machine_id, project_id, entry_date, shift,
        machine.slno, machine.eq_type, machine.capacity, machine.reg_no,
        machine.ownership, machine.dual_reading, machine.planned_hours,
        r1_open ?? null, r1_close ?? null, r1Total,
        r2_open ?? null, r2_close ?? null, r2Total,
        workingHours, utilPct,
        hsd ?? null, fuelAvg,
        breakdown ?? 0, qty ?? null, work_done ?? null, remarks ?? null,
        req.user.id
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Entry already exists for this machine, date, and shift' });
    }
    console.error('Create entry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { shift, r1_open, r1_close, r2_open, r2_close, hsd, breakdown, qty, work_done, remarks } = req.body;

    const entryResult = await db.query('SELECT * FROM dpr_entries WHERE id = $1', [id]);
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    const entry = entryResult.rows[0];

    const activeShift = shift || entry.shift || 'Day Shift';
    if (!SHIFT_MAX_HOURS[activeShift]) {
      return res.status(400).json({ error: 'Invalid shift value' });
    }

    const newR1Open  = r1_open  !== undefined ? parseFloat(r1_open)  : entry.r1_open;
    const newR1Close = r1_close !== undefined ? parseFloat(r1_close) : entry.r1_close;
    const newR2Open  = r2_open  !== undefined ? parseFloat(r2_open)  : entry.r2_open;
    const newR2Close = r2_close !== undefined ? parseFloat(r2_close) : entry.r2_close;
    const newHsd     = hsd      !== undefined ? parseFloat(hsd)      : entry.hsd;

    const r1Total = newR1Close != null && newR1Open != null
      ? newR1Close - newR1Open : entry.r1_total;
    const r2Total = newR2Close != null && newR2Open != null
      ? newR2Close - newR2Open : entry.r2_total;

    if (r1Total !== null && r1Total < 0) {
      return res.status(400).json({ error: 'Reading 1: closing must be greater than or equal to opening — total hours cannot be negative' });
    }
    if (r2Total !== null && r2Total < 0) {
      return res.status(400).json({ error: 'Reading 2: closing must be greater than or equal to opening — total hours cannot be negative' });
    }

    const workingHours = (r1Total || 0) + (entry.dual_reading && r2Total ? r2Total : 0);

    const maxHours = SHIFT_MAX_HOURS[activeShift];
    if (workingHours > maxHours) {
      return res.status(400).json({
        error: `${activeShift}: total hours (${workingHours.toFixed(2)}) exceed the ${maxHours}-hour limit`
      });
    }

    const plannedHours = parseFloat(entry.planned_hours) || 10;
    const utilPct = plannedHours > 0 ? Math.round((workingHours / plannedHours) * 100) : 0;
    const fuelAvg = workingHours > 0 && newHsd
      ? parseFloat((newHsd / workingHours).toFixed(2)) : null;

    const result = await db.query(
      `UPDATE dpr_entries SET
        shift=$1,
        r1_open=$2, r1_close=$3, r1_total=$4,
        r2_open=$5, r2_close=$6, r2_total=$7,
        working_hours=$8, util_pct=$9, hsd=$10, fuel_avg=$11,
        breakdown  = COALESCE($12, breakdown),
        qty        = COALESCE($13, qty),
        work_done  = COALESCE($14, work_done),
        remarks    = COALESCE($15, remarks),
        updated_at = NOW()
       WHERE id = $16
       RETURNING *`,
      [
        activeShift,
        newR1Open, newR1Close, r1Total,
        newR2Open, newR2Close, r2Total,
        workingHours, utilPct, newHsd, fuelAvg,
        breakdown !== undefined ? breakdown : null,
        qty       !== undefined ? qty       : null,
        work_done !== undefined ? work_done : null,
        remarks   !== undefined ? remarks   : null,
        id
      ]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Update entry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM dpr_entries WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    console.error('Delete entry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getDprStatus = async (req, res) => {
  try {
    const { project_code, date } = req.query;
    if (!project_code || !date) {
      return res.status(400).json({ error: 'project_code and date are required' });
    }
    if (req.user.role !== 'admin' &&
        req.user.project_codes.length > 0 &&
        !req.user.project_codes.includes(project_code)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const machinesResult = await db.query(
      `SELECT m.id, m.slno, m.eq_type, m.capacity, m.reg_no,
              m.shift_type, m.ownership, m.dual_reading, m.planned_hours,
              m.reading1_basis, m.reading2_basis, m.fuel_min, m.fuel_max,
              m.project_id
       FROM machines m
       JOIN projects p ON m.project_id = p.id
       WHERE p.code = $1 AND m.active = true
       ORDER BY m.slno`,
      [project_code]
    );

    const machines = machinesResult.rows;
    if (machines.length === 0) {
      return res.json({ date, project_code, total: 0, completed: 0, pending: 0, pct_completed: 0, machines: [] });
    }

    const machineIds = machines.map(m => m.id);
    const entriesResult = await db.query(
      `SELECT machine_id, shift, working_hours
       FROM dpr_entries
       WHERE machine_id = ANY($1) AND entry_date = $2`,
      [machineIds, date]
    );

    const entryMap = {};
    for (const e of entriesResult.rows) {
      if (!entryMap[e.machine_id]) entryMap[e.machine_id] = [];
      entryMap[e.machine_id].push(e);
    }

    const result = machines.map(m => {
      const entries = entryMap[m.id] || [];
      const work_hrs = entries.reduce((s, e) => s + (parseFloat(e.working_hours) || 0), 0);
      return { ...m, has_entry: entries.length > 0, work_hrs: parseFloat(work_hrs.toFixed(2)), entry_count: entries.length };
    });

    const completed = result.filter(m => m.has_entry).length;
    const total     = result.length;
    res.json({
      date, project_code, total, completed,
      pending:       total - completed,
      pct_completed: total > 0 ? Math.round((completed / total) * 100) : 0,
      machines:      result,
    });
  } catch (err) {
    console.error('Get DPR status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getMonthlyStatus = async (req, res) => {
  try {
    const { machine_id, year, month } = req.query;
    if (!machine_id || !year || !month) {
      return res.status(400).json({ error: 'machine_id, year, and month are required' });
    }
    const y = parseInt(year), m = parseInt(month);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const pad  = n => String(n).padStart(2, '0');
    const last = new Date(y, m, 0).getDate();
    const startDate = `${y}-${pad(m)}-01`;
    const endDate   = `${y}-${pad(m)}-${pad(last)}`;

    const result = await db.query(
      `SELECT EXTRACT(DAY FROM entry_date)::int AS day, shift, working_hours
       FROM dpr_entries
       WHERE machine_id = $1 AND entry_date >= $2 AND entry_date <= $3
       ORDER BY entry_date, shift`,
      [machine_id, startDate, endDate]
    );

    const days = {};
    for (const e of result.rows) {
      const d = e.day;
      if (!days[d]) days[d] = { has_entry: true, shifts: [], work_hrs: 0 };
      days[d].shifts.push(e.shift);
      days[d].work_hrs += parseFloat(e.working_hours) || 0;
    }
    for (const d of Object.values(days)) d.work_hrs = parseFloat(d.work_hrs.toFixed(2));

    res.json({ machine_id: parseInt(machine_id), year: y, month: m, days });
  } catch (err) {
    console.error('Get monthly status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getMonthlyProjectStatus = async (req, res) => {
  try {
    const { project_code, year, month } = req.query;
    if (!project_code || !year || !month) {
      return res.status(400).json({ error: 'project_code, year, and month are required' });
    }
    const y = parseInt(year), m = parseInt(month);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }
    if (req.user.role !== 'admin' &&
        req.user.project_codes.length > 0 &&
        !req.user.project_codes.includes(project_code)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const machinesResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM machines m
       JOIN projects p ON m.project_id = p.id
       WHERE p.code = $1 AND m.active = true`,
      [project_code]
    );
    const totalAssets = machinesResult.rows[0].total;
    if (totalAssets === 0) {
      return res.json({ project_code, year: y, month: m, total_assets: 0, days_elapsed: 0, total_expected: 0, completed: 0, pending: 0, pct_completed: 0 });
    }

    const now          = new Date();
    const todayYear    = now.getFullYear();
    const todayMonth   = now.getMonth() + 1;
    const todayDay     = now.getDate();
    const daysInMonth  = new Date(y, m, 0).getDate();

    let daysElapsed;
    if (y < todayYear || (y === todayYear && m < todayMonth)) {
      daysElapsed = daysInMonth;
    } else if (y === todayYear && m === todayMonth) {
      daysElapsed = todayDay;
    } else {
      daysElapsed = 0;
    }

    if (daysElapsed === 0) {
      return res.json({ project_code, year: y, month: m, total_assets: totalAssets, days_elapsed: 0, total_expected: 0, completed: 0, pending: 0, pct_completed: 0 });
    }

    const pad       = n => String(n).padStart(2, '0');
    const startDate = `${y}-${pad(m)}-01`;
    const endDate   = `${y}-${pad(m)}-${pad(daysElapsed)}`;

    const completedResult = await db.query(
      `SELECT COUNT(*)::int AS completed FROM (
         SELECT DISTINCT e.machine_id, e.entry_date
         FROM dpr_entries e
         JOIN machines ma ON e.machine_id = ma.id
         JOIN projects p  ON ma.project_id = p.id
         WHERE p.code = $1 AND e.entry_date >= $2 AND e.entry_date <= $3
       ) sub`,
      [project_code, startDate, endDate]
    );

    const completed    = completedResult.rows[0].completed;
    const totalExpected = totalAssets * daysElapsed;
    const pending      = Math.max(0, totalExpected - completed);

    res.json({
      project_code, year: y, month: m,
      total_assets:   totalAssets,
      days_elapsed:   daysElapsed,
      total_expected: totalExpected,
      completed,
      pending,
      pct_completed: totalExpected > 0 ? Math.round((completed / totalExpected) * 100) : 0,
    });
  } catch (err) {
    console.error('Get monthly project status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getPreviousClosing, create, update, remove, getDprStatus, getMonthlyStatus, getMonthlyProjectStatus };
