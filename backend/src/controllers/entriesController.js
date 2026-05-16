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

    // Attach reading logs for multi-reading entries
    const entryIds = result.rows.map(r => r.id);
    let readingLogsMap = {};
    if (entryIds.length > 0) {
      const logsResult = await db.query(
        `SELECT rl.entry_id, rl.reading_type_id, rt.code, rt.name, rt.unit,
                rl.open_value, rl.close_value, rl.total
         FROM dpr_reading_logs rl
         JOIN reading_types rt ON rt.id = rl.reading_type_id
         WHERE rl.entry_id = ANY($1)
         ORDER BY rl.entry_id, rl.reading_type_id`,
        [entryIds]
      );
      for (const log of logsResult.rows) {
        if (!readingLogsMap[log.entry_id]) readingLogsMap[log.entry_id] = [];
        readingLogsMap[log.entry_id].push(log);
      }
    }

    const rows = result.rows.map(r => ({
      ...r,
      reading_logs: readingLogsMap[r.id] || [],
    }));
    res.json({ data: rows });
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

    let entryQuery, params;

    if (shift === 'Night Shift') {
      entryQuery = `SELECT id, r1_close, r2_close FROM dpr_entries
                    WHERE machine_id = $1 AND entry_date = $2 AND shift = 'Day Shift'`;
      params = [machine_id, entry_date];
    } else {
      entryQuery = `SELECT id, r1_close, r2_close FROM dpr_entries
                    WHERE machine_id = $1 AND entry_date = $2::date - INTERVAL '1 day'
                    ORDER BY CASE shift WHEN 'Night Shift' THEN 1 WHEN 'Dual Shift' THEN 2 ELSE 3 END
                    LIMIT 1`;
      params = [machine_id, entry_date];
    }

    const entryResult = await db.query(entryQuery, params);
    const prev = entryResult.rows[0] || null;

    // For multi-reading machines, also fetch per-reading closing values
    let readings = [];
    if (prev?.id) {
      const logsResult = await db.query(
        `SELECT rl.reading_type_id, rt.code, rt.unit, rl.close_value
         FROM dpr_reading_logs rl
         JOIN reading_types rt ON rt.id = rl.reading_type_id
         WHERE rl.entry_id = $1
         ORDER BY rl.reading_type_id`,
        [prev.id]
      );
      readings = logsResult.rows;
    }

    res.json({ data: prev ? { ...prev, readings } : null });
  } catch (err) {
    console.error('Get previous closing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Shift timing rules (IST — server local time):
//   Day Shift:   entry allowed from 20:00 (8 PM) same day
//   Night Shift: entry allowed from 08:00 (8 AM) next day
//   Dual Shift:  same as Night Shift (both shifts end at next-day 8 AM)
function checkEntryTiming(entryDate, shift, now = new Date()) {
  const [y, m, d] = entryDate.split('-').map(Number);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const entryDay   = new Date(y, m - 1, d, 0, 0, 0);

  if (entryDay > todayStart) {
    return { allowed: false, message: 'Cannot enter DPR for a future date.' };
  }

  const earliest = shift === 'Day Shift'
    ? new Date(y, m - 1, d, 20, 0, 0)          // 8 PM same day
    : new Date(y, m - 1, d + 1, 8, 0, 0);      // 8 AM next day

  if (now < earliest) {
    const isPrevDay = entryDay < todayStart;
    let message;
    if (shift === 'Day Shift') {
      message = 'Day Shift DPR can be entered only after 8:00 PM.';
    } else if (isPrevDay) {
      message = "Previous day's DPR entry is allowed only after 8:00 AM.";
    } else if (shift === 'Night Shift') {
      message = 'Night Shift DPR can be entered only after 8:00 AM (next day).';
    } else {
      message = 'Dual Shift DPR can be entered only after 8:00 AM (next day).';
    }
    return { allowed: false, message };
  }

  return { allowed: true };
}

const create = async (req, res) => {
  try {
    const {
      machine_id, project_id, entry_date, shift,
      r1_open, r1_close, r2_open, r2_close,
      readings, // multi-reading: [{reading_type_id, open_value, close_value}]
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

    // Shift timing enforcement: nobody can submit before the shift physically ends
    const timing = checkEntryTiming(entry_date, shift);
    if (!timing.allowed) {
      return res.status(403).json({ error: timing.message });
    }

    // Machine-level sequential enforcement for non-admins:
    // This machine's previous-day entry must exist AND have a valid status.
    if (req.user.role !== 'admin') {
      const [prevEntryRes, historyRes] = await Promise.all([
        db.query(
          `SELECT id, status FROM dpr_entries
           WHERE machine_id = $1 AND entry_date = $2::date - INTERVAL '1 day'
           ORDER BY submitted_at DESC LIMIT 1`,
          [machine_id, entry_date]
        ),
        db.query(
          'SELECT 1 FROM dpr_entries WHERE machine_id = $1 AND entry_date < $2::date LIMIT 1',
          [machine_id, entry_date]
        ),
      ]);
      const prevEntry  = prevEntryRes.rows[0];
      const hasHistory = historyRes.rows.length > 0;

      if (hasHistory && !prevEntry) {
        const pd = await db.query("SELECT ($1::date - INTERVAL '1 day')::text AS d", [entry_date]);
        return res.status(403).json({
          error: `Previous day's DPR (${pd.rows[0].d}) for this machine has not been submitted. Complete it before creating today's entry.`
        });
      }
      if (prevEntry && prevEntry.status === 'open') {
        const pd = await db.query("SELECT ($1::date - INTERVAL '1 day')::text AS d", [entry_date]);
        return res.status(403).json({
          error: `Previous day's DPR (${pd.rows[0].d}) for this machine is still open. Please close it before creating today's entry.`
        });
      }
    }

    // Determine if this is a multi-reading entry
    const isMultiReading = Array.isArray(readings) && readings.length > 0;

    // For multi-reading: compute r1/r2 from first two readings for backward compat
    let effectiveR1Open = r1_open, effectiveR1Close = r1_close;
    let effectiveR2Open = r2_open, effectiveR2Close = r2_close;
    let computedReadings = [];

    if (isMultiReading) {
      computedReadings = readings.map(r => ({
        reading_type_id: r.reading_type_id,
        open_value:  r.open_value  != null ? parseFloat(r.open_value)  : null,
        close_value: r.close_value != null ? parseFloat(r.close_value) : null,
        total:       r.open_value != null && r.close_value != null
                     ? parseFloat(r.close_value) - parseFloat(r.open_value) : null,
      }));
      // Validate no negatives
      for (const r of computedReadings) {
        if (r.total !== null && r.total < 0) {
          return res.status(400).json({ error: `Reading total cannot be negative` });
        }
      }
      // Map first two readings to r1/r2 for backward compatibility
      if (computedReadings[0]) {
        effectiveR1Open  = computedReadings[0].open_value;
        effectiveR1Close = computedReadings[0].close_value;
      }
      if (computedReadings[1]) {
        effectiveR2Open  = computedReadings[1].open_value;
        effectiveR2Close = computedReadings[1].close_value;
      }
    }

    const r1Total = effectiveR1Close != null && effectiveR1Open != null
      ? parseFloat(effectiveR1Close) - parseFloat(effectiveR1Open) : null;
    const r2Total = effectiveR2Close != null && effectiveR2Open != null
      ? parseFloat(effectiveR2Close) - parseFloat(effectiveR2Open) : null;

    if (!isMultiReading) {
      if (r1Total !== null && r1Total < 0) {
        return res.status(400).json({ error: 'Reading 1: closing must be greater than or equal to opening — total hours cannot be negative' });
      }
      if (r2Total !== null && r2Total < 0) {
        return res.status(400).json({ error: 'Reading 2: closing must be greater than or equal to opening — total hours cannot be negative' });
      }
    }

    // For multi-reading: working hours = total of first Hrs-unit reading
    let workingHours;
    if (isMultiReading) {
      // Get reading type units to find the primary hours reading
      const rtIds = computedReadings.map(r => r.reading_type_id);
      const rtRes = await db.query('SELECT id, unit FROM reading_types WHERE id = ANY($1)', [rtIds]);
      const unitMap = {};
      for (const rt of rtRes.rows) unitMap[rt.id] = rt.unit;
      // Use the first reading with unit 'Hrs' for working hours
      const hrsReading = computedReadings.find(r => unitMap[r.reading_type_id] === 'Hrs');
      workingHours = hrsReading?.total || 0;
    } else {
      workingHours = (r1Total || 0) + (machine.dual_reading && r2Total ? r2Total : 0);
    }

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
        machine_id, project_id, entry_date, shift, status,
        slno, eq_type, capacity, reg_no, ownership, dual_reading, planned_hours,
        r1_open, r1_close, r1_total, r2_open, r2_close, r2_total,
        working_hours, util_pct, hsd, fuel_avg,
        breakdown, qty, work_done, remarks, submitted_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
        $23,$24,$25,$26,$27
      ) RETURNING *`,
      [
        machine_id, project_id, entry_date, shift, 'submitted',
        machine.slno, machine.eq_type, machine.capacity, machine.reg_no,
        machine.ownership, machine.dual_reading, machine.planned_hours,
        effectiveR1Open ?? null, effectiveR1Close ?? null, r1Total,
        effectiveR2Open ?? null, effectiveR2Close ?? null, r2Total,
        workingHours, utilPct,
        hsd ?? null, fuelAvg,
        breakdown ?? 0, qty ?? null, work_done ?? null, remarks ?? null,
        req.user.id
      ]
    );

    // Save multi-reading logs
    if (isMultiReading && computedReadings.length > 0) {
      for (const r of computedReadings) {
        await db.query(
          `INSERT INTO dpr_reading_logs (entry_id, reading_type_id, open_value, close_value, total)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [result.rows[0].id, r.reading_type_id, r.open_value, r.close_value, r.total]
        );
      }
    }

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
    const { shift, r1_open, r1_close, r2_open, r2_close, readings, hsd, breakdown, qty, work_done, remarks } = req.body;

    const entryResult = await db.query('SELECT * FROM dpr_entries WHERE id = $1', [id]);
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    const entry = entryResult.rows[0];

    const activeShift = shift || entry.shift || 'Day Shift';
    if (!SHIFT_MAX_HOURS[activeShift]) {
      return res.status(400).json({ error: 'Invalid shift value' });
    }

    const isMultiReading = Array.isArray(readings) && readings.length > 0;
    let computedReadings = [];

    let newR1Open  = r1_open  !== undefined ? parseFloat(r1_open)  : entry.r1_open;
    let newR1Close = r1_close !== undefined ? parseFloat(r1_close) : entry.r1_close;
    let newR2Open  = r2_open  !== undefined ? parseFloat(r2_open)  : entry.r2_open;
    let newR2Close = r2_close !== undefined ? parseFloat(r2_close) : entry.r2_close;

    if (isMultiReading) {
      computedReadings = readings.map(r => ({
        reading_type_id: r.reading_type_id,
        open_value:  r.open_value  != null ? parseFloat(r.open_value)  : null,
        close_value: r.close_value != null ? parseFloat(r.close_value) : null,
        total:       r.open_value != null && r.close_value != null
                     ? parseFloat(r.close_value) - parseFloat(r.open_value) : null,
      }));
      for (const r of computedReadings) {
        if (r.total !== null && r.total < 0) return res.status(400).json({ error: `Reading total cannot be negative` });
      }
      if (computedReadings[0]) { newR1Open = computedReadings[0].open_value; newR1Close = computedReadings[0].close_value; }
      if (computedReadings[1]) { newR2Open = computedReadings[1].open_value; newR2Close = computedReadings[1].close_value; }
    }

    const newHsd = hsd !== undefined ? parseFloat(hsd) : entry.hsd;

    const r1Total = newR1Close != null && newR1Open != null ? newR1Close - newR1Open : entry.r1_total;
    const r2Total = newR2Close != null && newR2Open != null ? newR2Close - newR2Open : entry.r2_total;

    if (!isMultiReading) {
      if (r1Total !== null && r1Total < 0) return res.status(400).json({ error: 'Reading 1: closing must be ≥ opening' });
      if (r2Total !== null && r2Total < 0) return res.status(400).json({ error: 'Reading 2: closing must be ≥ opening' });
    }

    let workingHours;
    if (isMultiReading) {
      const rtIds = computedReadings.map(r => r.reading_type_id);
      const rtRes = await db.query('SELECT id, unit FROM reading_types WHERE id = ANY($1)', [rtIds]);
      const unitMap = {};
      for (const rt of rtRes.rows) unitMap[rt.id] = rt.unit;
      const hrsReading = computedReadings.find(r => unitMap[r.reading_type_id] === 'Hrs');
      workingHours = hrsReading?.total || 0;
    } else {
      workingHours = (r1Total || 0) + (entry.dual_reading && r2Total ? r2Total : 0);
    }

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

    // Update multi-reading logs
    if (isMultiReading && computedReadings.length > 0) {
      await db.query('DELETE FROM dpr_reading_logs WHERE entry_id = $1', [id]);
      for (const r of computedReadings) {
        await db.query(
          `INSERT INTO dpr_reading_logs (entry_id, reading_type_id, open_value, close_value, total)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, r.reading_type_id, r.open_value, r.close_value, r.total]
        );
      }
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Update entry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin: change status of a single entry (submitted → closed, or reopen → open)
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['open', 'submitted', 'closed'].includes(status)) {
      return res.status(400).json({ error: "status must be 'open', 'submitted', or 'closed'" });
    }
    const result = await db.query(
      `UPDATE dpr_entries SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Update status error:', err);
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
              m.project_id,
              COALESCE(
                (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                  'id', mrc.id, 'reading_type_id', rt.id, 'code', rt.code,
                  'reading_name', rt.name, 'unit', rt.unit,
                  'display_order', mrc.display_order, 'is_active', mrc.is_active
                ) ORDER BY mrc.display_order)
                 FROM machine_reading_configs mrc
                 JOIN reading_types rt ON rt.id = mrc.reading_type_id
                 WHERE mrc.machine_id = m.id AND mrc.is_active = true),
                '[]'::json
              ) AS reading_configs
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

    const [entriesResult, prevEntriesResult, historyResult, prevDateResult] = await Promise.all([
      db.query(
        `SELECT id, machine_id, shift, working_hours, status
         FROM dpr_entries
         WHERE machine_id = ANY($1) AND entry_date = $2`,
        [machineIds, date]
      ),
      // Previous-day entries that are NOT open (submitted or closed = valid)
      db.query(
        `SELECT machine_id, status FROM dpr_entries
         WHERE machine_id = ANY($1) AND entry_date = $2::date - INTERVAL '1 day'`,
        [machineIds, date]
      ),
      db.query(
        'SELECT 1 FROM dpr_entries WHERE machine_id = ANY($1) AND entry_date < $2::date LIMIT 1',
        [machineIds, date]
      ),
      db.query("SELECT ($1::date - INTERVAL '1 day')::text AS d", [date]),
    ]);

    const entryMap = {};
    for (const e of entriesResult.rows) {
      if (!entryMap[e.machine_id]) entryMap[e.machine_id] = [];
      entryMap[e.machine_id].push(e);
    }

    // Per-machine previous-day status map
    const prevMap = {};
    for (const e of prevEntriesResult.rows) {
      if (!prevMap[e.machine_id]) prevMap[e.machine_id] = [];
      prevMap[e.machine_id].push(e.status);
    }

    const hasHistory  = historyResult.rows.length > 0;
    const prevDayDate = prevDateResult.rows[0].d;

    const result = machines.map(m => {
      const entries   = entryMap[m.id] || [];
      const work_hrs  = entries.reduce((s, e) => s + (parseFloat(e.working_hours) || 0), 0);
      const statuses  = entries.map(e => e.status || 'submitted');
      const hasOpen   = statuses.includes('open');
      const allClosed = statuses.length > 0 && statuses.every(s => s === 'closed');
      const entryStatus = entries.length === 0 ? null
        : hasOpen    ? 'open'
        : allClosed  ? 'closed'
        : 'submitted';

      // Machine's prev-day validity
      const prevStatuses  = prevMap[m.id] || [];
      const prevHasEntry  = prevStatuses.length > 0;
      const prevHasOpen   = prevStatuses.includes('open');
      // prev day is valid when it has at least one non-open entry
      const prevDayOk = !hasHistory || (prevHasEntry && !prevHasOpen);

      return {
        ...m,
        has_entry:    entries.length > 0,
        work_hrs:     parseFloat(work_hrs.toFixed(2)),
        entry_count:  entries.length,
        entry_status: entryStatus,
        entry_ids:    entries.map(e => e.id),
        prev_day_ok:  prevDayOk,
      };
    });

    const completed = result.filter(m => m.has_entry).length;
    const total     = result.length;

    // Project-level prev-day summary: all machines with valid prev-day entries
    const prevDayCompleted = result.filter(m => (prevMap[m.id] || []).some(s => s !== 'open')).length;
    const prevDayComplete  = total === 0 || !hasHistory || prevDayCompleted >= total;

    res.json({
      date, project_code, total, completed,
      pending:            total - completed,
      pct_completed:      total > 0 ? Math.round((completed / total) * 100) : 0,
      machines:           result,
      prev_day_complete:  prevDayComplete,
      prev_day_date:      prevDayDate,
      prev_day_completed: prevDayCompleted,
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

module.exports = { getAll, getPreviousClosing, create, update, updateStatus, remove, getDprStatus, getMonthlyStatus, getMonthlyProjectStatus };
