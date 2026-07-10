const db = require('../config/db');

db.query('ALTER TABLE dpr_entries ADD COLUMN IF NOT EXISTS is_idle BOOLEAN NOT NULL DEFAULT FALSE').catch(() => {})

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
    const { machine_id, entry_date, shift, machine_shift_type } = req.query;
    if (!machine_id || !entry_date || !shift) {
      return res.status(400).json({ error: 'machine_id, entry_date, and shift are required' });
    }

    let entryQuery, params;

    if (machine_shift_type === 'Single Shift') {
      // Single shift: most recent entry (any shift), excluding the current shift being entered on the same date
      entryQuery = `SELECT id, entry_date, r1_close, r2_close, reset_old_reading FROM dpr_entries
                    WHERE machine_id = $1
                      AND NOT (entry_date = $2::date AND shift = $3)
                    ORDER BY entry_date DESC,
                             CASE shift WHEN 'Night Shift' THEN 2 WHEN 'Day Shift' THEN 1 ELSE 0 END DESC
                    LIMIT 1`;
      params = [machine_id, entry_date, shift];
    } else if (shift === 'Night Shift') {
      // Dual shift night: same-day Day Shift closing
      entryQuery = `SELECT id, entry_date, r1_close, r2_close, reset_old_reading FROM dpr_entries
                    WHERE machine_id = $1 AND entry_date = $2 AND shift = 'Day Shift'`;
      params = [machine_id, entry_date];
    } else {
      // Dual shift day: previous day's most recent entry
      entryQuery = `SELECT id, entry_date, r1_close, r2_close, reset_old_reading FROM dpr_entries
                    WHERE machine_id = $1 AND entry_date = $2::date - INTERVAL '1 day'
                    ORDER BY CASE shift WHEN 'Night Shift' THEN 1 WHEN 'Dual Shift' THEN 2 ELSE 3 END
                    LIMIT 1`;
      params = [machine_id, entry_date];
    }

    const entryResult = await db.query(entryQuery, params);
    let prev = entryResult.rows[0] || null;

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

    // Helper: apply a reset record to prev (used for both Day/Single and Night Shift paths)
    const applyReset = async (reset) => {
      if (!reset || reset.new_reading == null) return;

      const resetDateStr = String(reset.entry_date).slice(0, 10);
      const sameDay      = resetDateStr === entry_date;
      const prevClose    = prev ? parseFloat(prev.r1_close) : null;
      const oldReading   = reset.previous_reading != null ? parseFloat(reset.previous_reading) : null;

      // Mid-shift: reset happened ON the same date as the entry being created,
      // AND the old meter reading at time of replacement exceeds the shift opening.
      const isMidShift = sameDay && oldReading != null && prevClose != null && oldReading > prevClose + 0.001;

      if (isMidShift) {
        const midShiftReset = {
          old_reading:  reset.previous_reading,
          new_reading:  reset.new_reading,
          reading_code: reset.reading_code,
        };
        const base = prev || { id: null, entry_date: null, r1_close: null, r2_close: null };
        res.json({ data: { ...base, readings, mid_shift_reset: midShiftReset } });
        return true; // signals: response already sent
      }

      // Between-shift reset: override opening with new meter start reading.
      // BUT skip the override when the prev DPR entry is itself on the reset date AND
      // already has reset_old_reading set — that means the prev entry correctly
      // accounted for the mid-shift. Its closing IS the new-meter closing; use it as-is.
      const prevAlreadyAccountedForReset =
        prev &&
        String(prev.entry_date).slice(0, 10) === resetDateStr &&
        prev.reset_old_reading != null;

      if (prevAlreadyAccountedForReset) return false;

      if (!prev) {
        prev = { id: null, entry_date: reset.entry_date, shift: null, r1_close: reset.new_reading, r2_close: null };
      }
      if (reset.reading_code) {
        const idx = readings.findIndex(r => r.code === reset.reading_code);
        if (idx >= 0) {
          readings[idx] = { ...readings[idx], close_value: reset.new_reading };
        } else {
          const rtRes = await db.query(
            'SELECT id, unit FROM reading_types WHERE code = $1 LIMIT 1',
            [reset.reading_code]
          );
          readings.push({
            reading_type_id: rtRes.rows[0]?.id || null,
            code: reset.reading_code,
            unit: rtRes.rows[0]?.unit || null,
            close_value: reset.new_reading,
          });
        }
      } else {
        prev = { ...prev, r1_close: reset.new_reading };
      }
      return false;
    };

    // Check for approved meter resets.
    // Day Shift / Single Shift: look for resets between prev entry date and today.
    // Night Shift: opening comes from same-day Day Shift; also check for same-day mid-shift reset.
    if (shift !== 'Night Shift') {
      let resetQuery, resetParams;
      if (prev) {
        resetQuery = `SELECT * FROM machine_meter_resets
                      WHERE machine_id = $1 AND entry_date >= $2 AND entry_date <= $3
                      ORDER BY entry_date DESC, reset_at DESC LIMIT 1`;
        resetParams = [machine_id, prev.entry_date, entry_date];
      } else {
        resetQuery = `SELECT * FROM machine_meter_resets
                      WHERE machine_id = $1 AND entry_date <= $2
                      ORDER BY entry_date DESC, reset_at DESC LIMIT 1`;
        resetParams = [machine_id, entry_date];
      }
      const resetResult = await db.query(resetQuery, resetParams);
      const sent = await applyReset(resetResult.rows[0] || null);
      if (sent) return;
    } else {
      // Night Shift: check for a mid-shift reset on this exact date
      // (meter replaced during the night shift itself)
      if (prev) {
        const nsResetResult = await db.query(
          `SELECT * FROM machine_meter_resets
           WHERE machine_id = $1 AND entry_date = $2::date
           ORDER BY reset_at DESC LIMIT 1`,
          [machine_id, entry_date]
        );
        const sent = await applyReset(nsResetResult.rows[0] || null);
        if (sent) return;
      }
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
      reset_old_reading, reset_new_reading,
      hsd, diesel_rate, breakdown, qty, work_done, remarks, is_idle
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

    // Block if a pending counter reset request exists for a date before this entry date.
    // The new opening reading from the reset has not been approved yet, so DPR must wait.
    const pendingReset = await db.query(
      `SELECT TO_CHAR(reset_date::date, 'DD-Mon-YYYY') AS reset_dt
       FROM meter_reset_requests
       WHERE machine_id = $1 AND status = 'pending' AND reset_date::date < $2::date
       ORDER BY reset_date ASC LIMIT 1`,
      [machine_id, entry_date]
    );
    if (pendingReset.rows.length > 0) {
      return res.status(409).json({
        error: `Counter Reset Request is pending Admin approval (reset date: ${pendingReset.rows[0].reset_dt}). DPR entry is disabled until the reset is approved.`,
      });
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

    // When a meter was replaced mid-shift, total = (old_at_breakdown - opening) + (closing - new_meter_start)
    const hasReset = !isMultiReading && reset_old_reading != null && reset_new_reading != null
      && effectiveR1Open != null && effectiveR1Close != null;
    let r1Total;
    if (hasReset) {
      const preReset  = parseFloat(reset_old_reading) - parseFloat(effectiveR1Open);
      const postReset = parseFloat(effectiveR1Close)  - parseFloat(reset_new_reading);
      if (preReset  < 0) return res.status(400).json({ error: 'Old reading at meter replacement must be ≥ opening reading' });
      if (postReset < 0) return res.status(400).json({ error: 'Closing reading must be ≥ new meter starting reading' });
      r1Total = preReset + postReset;
    } else {
      r1Total = effectiveR1Close != null && effectiveR1Open != null
        ? parseFloat(effectiveR1Close) - parseFloat(effectiveR1Open) : null;
    }
    const r2Total = effectiveR2Close != null && effectiveR2Open != null
      ? parseFloat(effectiveR2Close) - parseFloat(effectiveR2Open) : null;

    if (!isMultiReading && !hasReset) {
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

    // When readings are same (zero work), breakdown must equal full shift or not be set at all
    const brkVal = parseFloat(breakdown) || 0;
    if (workingHours === 0 && brkVal > 0 && Math.abs(brkVal - maxHours) > 0.01) {
      return res.status(400).json({
        error: `When working hours are zero, breakdown must be the full shift (${maxHours} hrs).`
      });
    }

    if (hsd != null && parseFloat(hsd) > 0 && machine.fuel_tank_l) {
      const tankCap = parseFloat(machine.fuel_tank_l);
      if (parseFloat(hsd) > tankCap) {
        return res.status(400).json({
          error: `HSD entered (${parseFloat(hsd).toFixed(2)} L) exceeds the machine's fuel tank capacity (${tankCap} L). Please correct the value.`
        });
      }
    }

    const plannedHours = parseFloat(machine.planned_hours) || 10;
    const utilPct = plannedHours > 0 ? Math.round((workingHours / plannedHours) * 100) : 0;
    const fuelAvg = workingHours > 0 && hsd
      ? parseFloat((parseFloat(hsd) / workingHours).toFixed(2)) : null;
    const parsedDieselRate = diesel_rate ? parseFloat(diesel_rate) : null;
    const diesel_cost = hsd && parsedDieselRate
      ? parseFloat((parseFloat(hsd) * parsedDieselRate).toFixed(2)) : null;

    const result = await db.query(
      `INSERT INTO dpr_entries (
        machine_id, project_id, entry_date, shift, status,
        slno, eq_type, capacity, reg_no, ownership, dual_reading, planned_hours,
        r1_open, r1_close, r1_total, r2_open, r2_close, r2_total,
        working_hours, util_pct, hsd, fuel_avg, diesel_rate, diesel_cost,
        breakdown, qty, work_done, remarks, submitted_by, is_idle,
        reset_old_reading, reset_new_reading
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
        $25,$26,$27,$28,$29,$30,$31,$32
      ) RETURNING *`,
      [
        machine_id, project_id, entry_date, shift, 'submitted',
        machine.slno, machine.eq_type, machine.capacity, machine.reg_no,
        machine.ownership, machine.dual_reading, machine.planned_hours,
        effectiveR1Open ?? null, effectiveR1Close ?? null, r1Total,
        effectiveR2Open ?? null, effectiveR2Close ?? null, r2Total,
        workingHours, utilPct,
        hsd ?? null, fuelAvg, parsedDieselRate, diesel_cost,
        breakdown ?? 0, qty ?? null, work_done ?? null, remarks ?? null,
        req.user.id, is_idle ?? false,
        hasReset ? parseFloat(reset_old_reading) : null,
        hasReset ? parseFloat(reset_new_reading) : null,
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

// When a closing reading is edited, propagate the new closing as the opening of the very
// next entry for this machine — keeping the chain continuous without manual re-entry.
async function cascadeToNextEntry(updatedEntry, computedReadings, isMultiReading) {
  const { machine_id, entry_date, shift, r1_close, r2_close } = updatedEntry;

  // Determine what the "next" entry is (inverse of getPreviousClosing)
  const machineRes = await db.query('SELECT shift_type FROM machines WHERE id = $1', [machine_id]);
  const shiftType  = machineRes.rows[0]?.shift_type || 'Single Shift';

  let nextQuery, nextParams;
  if (shiftType !== 'Single Shift' && shift === 'Day Shift') {
    // Dual Day → next is Night Shift of same date
    nextQuery  = `SELECT id, r1_close, r2_close, planned_hours FROM dpr_entries
                  WHERE machine_id=$1 AND entry_date=$2 AND shift='Night Shift'`;
    nextParams = [machine_id, entry_date];
  } else if (shiftType !== 'Single Shift' && shift === 'Night Shift') {
    // Dual Night → next is Day Shift of next date
    nextQuery  = `SELECT id, r1_close, r2_close, planned_hours FROM dpr_entries
                  WHERE machine_id=$1 AND entry_date=$2::date + INTERVAL '1 day' AND shift='Day Shift'`;
    nextParams = [machine_id, entry_date];
  } else {
    // Single-shift (any shift name) → first entry strictly after this date
    nextQuery  = `SELECT id, r1_close, r2_close, planned_hours FROM dpr_entries
                  WHERE machine_id=$1 AND entry_date > $2::date
                  ORDER BY entry_date ASC LIMIT 1`;
    nextParams = [machine_id, entry_date];
  }

  const nextRes = await db.query(nextQuery, nextParams);
  if (nextRes.rows.length === 0) return; // Nothing to cascade
  const next = nextRes.rows[0];

  if (isMultiReading && computedReadings?.length > 0) {
    // --- Multi-reading machine: update dpr_reading_logs.open_value ---
    for (const r of computedReadings) {
      await db.query(
        `UPDATE dpr_reading_logs
         SET open_value = $1,
             total      = CASE WHEN close_value IS NOT NULL THEN close_value - $1 ELSE total END
         WHERE entry_id=$2 AND reading_type_id=$3`,
        [r.close_value, next.id, r.reading_type_id]
      );
    }
    // Re-fetch logs to compute new working_hours for the next entry
    const logsRes = await db.query(
      `SELECT rl.open_value, rl.close_value, rt.unit
       FROM dpr_reading_logs rl
       JOIN reading_types rt ON rt.id = rl.reading_type_id
       WHERE rl.entry_id=$1`,
      [next.id]
    );
    const hrsLog   = logsRes.rows.find(l => l.unit === 'Hrs');
    const newWH    = hrsLog && hrsLog.close_value != null && hrsLog.open_value != null
      ? Math.max(0, parseFloat(hrsLog.close_value) - parseFloat(hrsLog.open_value)) : null;
    const firstLog = logsRes.rows[0];
    if (newWH != null && firstLog) {
      const planned = parseFloat(next.planned_hours) || 10;
      const util    = planned > 0 ? Math.round((newWH / planned) * 100) : 0;
      await db.query(
        `UPDATE dpr_entries SET r1_open=$1, r1_total=$2, working_hours=$3, util_pct=$4, updated_at=NOW() WHERE id=$5`,
        [firstLog.open_value, newWH, newWH, util, next.id]
      );
    }
  } else {
    // --- Simple r1/r2 columns ---
    if (r1_close == null) return;
    const newR1Open  = parseFloat(r1_close);
    const newR1Total = next.r1_close != null ? Math.max(0, parseFloat(next.r1_close) - newR1Open) : null;
    // r2: only cascade if this entry actually has a r2_close (dual reading machines)
    const newR2Open  = r2_close != null ? parseFloat(r2_close) : null;
    const newR2Total = newR2Open != null && next.r2_close != null
      ? Math.max(0, parseFloat(next.r2_close) - newR2Open) : null;
    const newWH      = (newR1Total || 0) + (newR2Total || 0);
    const planned    = parseFloat(next.planned_hours) || 10;
    const util       = planned > 0 ? Math.round((newWH / planned) * 100) : 0;
    await db.query(
      `UPDATE dpr_entries
       SET r1_open=$1, r1_total=$2, r2_open=$3, r2_total=$4, working_hours=$5, util_pct=$6, updated_at=NOW()
       WHERE id=$7`,
      [newR1Open, newR1Total, newR2Open, newR2Total, newWH, util, next.id]
    );
  }
}

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { shift, r1_open, r1_close, r2_open, r2_close, readings, reset_old_reading, reset_new_reading, hsd, diesel_rate, breakdown, qty, work_done, remarks, is_idle } = req.body;

    const entryResult = await db.query('SELECT * FROM dpr_entries WHERE id = $1', [id]);
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    const entry = entryResult.rows[0];

    // Block edit if a later-dated entry exists AND reading fields are being changed
    const hasReadingFields = r1_open !== undefined || r1_close !== undefined ||
      r2_open !== undefined || r2_close !== undefined ||
      (Array.isArray(readings) && readings.length > 0);
    if (hasReadingFields) {
      const laterCheck = await db.query(
        'SELECT id FROM dpr_entries WHERE machine_id = $1 AND entry_date > $2::date LIMIT 1',
        [entry.machine_id, entry.entry_date]
      );
      if (laterCheck.rows.length > 0) {
        return res.status(400).json({
          error: 'Cannot edit readings: entries exist on later dates. Delete the most recent entries first to maintain reading continuity.'
        });
      }
    }

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

    const hasReset = !isMultiReading && reset_old_reading != null && reset_new_reading != null
      && newR1Open != null && newR1Close != null;
    let r1Total;
    if (hasReset) {
      const preReset  = parseFloat(reset_old_reading) - newR1Open;
      const postReset = newR1Close - parseFloat(reset_new_reading);
      if (preReset  < 0) return res.status(400).json({ error: 'Old reading at meter replacement must be ≥ opening reading' });
      if (postReset < 0) return res.status(400).json({ error: 'Closing reading must be ≥ new meter starting reading' });
      r1Total = preReset + postReset;
    } else {
      r1Total = newR1Close != null && newR1Open != null ? newR1Close - newR1Open : entry.r1_total;
    }
    const r2Total = newR2Close != null && newR2Open != null ? newR2Close - newR2Open : entry.r2_total;

    if (!isMultiReading && !hasReset) {
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

    const brkValU = breakdown !== undefined ? (parseFloat(breakdown) || 0) : (parseFloat(entry.breakdown) || 0);
    if (workingHours === 0 && brkValU > 0 && Math.abs(brkValU - maxHours) > 0.01) {
      return res.status(400).json({
        error: `When working hours are zero, breakdown must be the full shift (${maxHours} hrs).`
      });
    }

    if (hsd !== undefined && hsd != null && parseFloat(hsd) > 0) {
      const mRes = await db.query('SELECT fuel_tank_l FROM machines WHERE id = $1', [entry.machine_id]);
      const tankCap = mRes.rows[0]?.fuel_tank_l ? parseFloat(mRes.rows[0].fuel_tank_l) : null;
      if (tankCap != null && parseFloat(hsd) > tankCap) {
        return res.status(400).json({
          error: `HSD entered (${parseFloat(hsd).toFixed(2)} L) exceeds the machine's fuel tank capacity (${tankCap} L). Please correct the value.`
        });
      }
    }

    const plannedHours = parseFloat(entry.planned_hours) || 10;
    const utilPct = plannedHours > 0 ? Math.round((workingHours / plannedHours) * 100) : 0;
    const fuelAvg = workingHours > 0 && newHsd
      ? parseFloat((newHsd / workingHours).toFixed(2)) : null;
    const newDieselRate = diesel_rate !== undefined && diesel_rate !== '' ? parseFloat(diesel_rate) : null;
    const newDieselCost = newHsd && newDieselRate
      ? parseFloat((newHsd * newDieselRate).toFixed(2)) : null;

    const result = await db.query(
      `UPDATE dpr_entries SET
        shift=$1,
        r1_open=$2, r1_close=$3, r1_total=$4,
        r2_open=$5, r2_close=$6, r2_total=$7,
        working_hours=$8, util_pct=$9, hsd=$10, fuel_avg=$11,
        breakdown         = COALESCE($12, breakdown),
        qty               = COALESCE($13, qty),
        work_done         = COALESCE($14, work_done),
        remarks           = COALESCE($15, remarks),
        is_idle           = COALESCE($16, is_idle),
        reset_old_reading = COALESCE($18, reset_old_reading),
        reset_new_reading = COALESCE($19, reset_new_reading),
        diesel_rate       = $20,
        diesel_cost       = $21,
        updated_at        = NOW()
       WHERE id = $17
       RETURNING *`,
      [
        activeShift,
        newR1Open, newR1Close, r1Total,
        newR2Open, newR2Close, r2Total,
        workingHours, utilPct, newHsd, fuelAvg,
        breakdown   !== undefined ? breakdown   : null,
        qty         !== undefined ? qty         : null,
        work_done   !== undefined ? work_done   : null,
        remarks     !== undefined ? remarks     : null,
        is_idle     !== undefined ? is_idle     : null,
        id,
        hasReset ? parseFloat(reset_old_reading) : null,
        hasReset ? parseFloat(reset_new_reading) : null,
        newDieselRate,
        newDieselCost,
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

    // Cascade new closing to next entry's opening (best-effort — don't fail the main response)
    try {
      await cascadeToNextEntry(result.rows[0], isMultiReading ? computedReadings : null, isMultiReading);
    } catch (cascadeErr) {
      console.error('Cascade to next entry (non-fatal):', cascadeErr.message);
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

    // Fetch the entry to know its machine and date
    const entryRes = await db.query(
      'SELECT machine_id, entry_date FROM dpr_entries WHERE id = $1', [id]
    );
    if (entryRes.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    const { machine_id, entry_date } = entryRes.rows[0];

    // Block delete if a later-dated entry exists — must delete forward first
    const laterCheck = await db.query(
      'SELECT id FROM dpr_entries WHERE machine_id = $1 AND entry_date > $2::date LIMIT 1',
      [machine_id, entry_date]
    );
    if (laterCheck.rows.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete: entries exist on later dates. Delete the most recent entry first.'
      });
    }

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
      `SELECT m.id, m.slno, m.nickname, m.asset_code, m.vendor,
              m.eq_type, m.capacity, m.reg_no,
              m.shift_type, m.ownership, m.dual_reading, m.planned_hours,
              m.reading1_basis, m.reading2_basis, m.fuel_min, m.fuel_max, m.fuel_min_km, m.fuel_max_km, m.fuel_tank_l,
              m.tm_split_mode, m.tm_split_value,
              m.project_id,
              COALESCE(etc.qty_mandatory_if_km,       false) AS qty_mandatory_if_km,
              COALESCE(etc.qty_mandatory_if_hrs,      false) AS qty_mandatory_if_hrs,
              COALESCE(etc.closing_reading_mandatory, true)  AS closing_reading_mandatory,
              COALESCE(etc.allow_negative_reading,    false) AS allow_negative_reading,
              COALESCE(etc.work_done_mandatory,       false) AS work_done_mandatory,
              COALESCE(etc.fuel_entry_enabled,        true)  AS fuel_entry_enabled,
              COALESCE(etc.breakdown_entry_enabled,   true)  AS breakdown_entry_enabled,
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
       LEFT JOIN equipment_types et ON LOWER(et.name) = LOWER(m.eq_type)
       LEFT JOIN equipment_type_configs etc ON etc.eq_type_id = et.id
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

const getLatestReadingBefore = async (req, res) => {
  try {
    const { machine_id, before_date } = req.query;
    if (!machine_id || !before_date) {
      return res.status(400).json({ error: 'machine_id and before_date are required' });
    }

    const entryResult = await db.query(
      `SELECT id, entry_date, shift, r1_close, r2_close FROM dpr_entries
       WHERE machine_id = $1 AND entry_date <= $2::date
       ORDER BY entry_date DESC,
                CASE shift WHEN 'Night Shift' THEN 3 WHEN 'Dual Shift' THEN 2 WHEN 'Day Shift' THEN 1 ELSE 0 END DESC
       LIMIT 1`,
      [machine_id, before_date]
    );
    const prev = entryResult.rows[0] || null;

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
    console.error('Get latest reading before error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const removeAllForMachine = async (req, res) => {
  try {
    const { machine_id } = req.params;
    if (!machine_id) return res.status(400).json({ error: 'machine_id required' });
    const result = await db.query('DELETE FROM dpr_entries WHERE machine_id = $1', [machine_id]);
    await db.query('DELETE FROM machine_meter_resets WHERE machine_id = $1', [machine_id]);
    await db.query('DELETE FROM meter_reset_requests  WHERE machine_id = $1', [machine_id]);
    res.json({ deleted: result.rowCount });
  } catch (err) {
    console.error('Delete all entries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const removeAllForProject = async (req, res) => {
  try {
    const { project_code } = req.params;
    if (!project_code) return res.status(400).json({ error: 'project_code required' });

    const machineSubq = `(SELECT m.id FROM machines m JOIN projects p ON m.project_id = p.id WHERE p.code = $1)`;

    // dpr_reading_logs cascade-deletes with dpr_entries automatically
    const entries = await db.query(
      `DELETE FROM dpr_entries WHERE machine_id IN ${machineSubq}`,
      [project_code]
    );
    // Also clear meter reset records so machines start with a clean reading history
    await db.query(`DELETE FROM machine_meter_resets  WHERE machine_id IN ${machineSubq}`, [project_code]);
    await db.query(`DELETE FROM meter_reset_requests  WHERE machine_id IN ${machineSubq}`, [project_code]);

    res.json({ deleted: entries.rowCount });
  } catch (err) {
    console.error('Delete all project entries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Lightweight check: any DPR entries exist after a given date for this machine?
const checkExistsAfter = async (req, res) => {
  try {
    const { machine_id, date } = req.query;
    if (!machine_id || !date) return res.status(400).json({ error: 'machine_id and date are required' });
    const result = await db.query(
      `SELECT TO_CHAR(MIN(entry_date), 'DD-Mon-YYYY') AS first_date
       FROM dpr_entries WHERE machine_id = $1 AND entry_date >= $2::date`,
      [machine_id, date]
    );
    const first_date = result.rows[0]?.first_date || null;
    res.json({ data: { exists: first_date != null, first_date } });
  } catch (err) {
    console.error('checkExistsAfter error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /entries/bulk — admin only, bulk insert historical DPR entries (bypasses timing + sequential checks)
const bulkCreate = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { machine_id, entries } = req.body;
    if (!machine_id || !Array.isArray(entries) || entries.length === 0)
      return res.status(400).json({ error: 'machine_id and entries array required' });

    const machineResult = await db.query('SELECT * FROM machines WHERE id = $1 AND active = true', [machine_id]);
    if (machineResult.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
    const machine = machineResult.rows[0];

    // Block if a counter reset request is pending
    const pendingReset = await db.query(
      `SELECT id, TO_CHAR(reset_date::date, 'YYYY-MM-DD') AS reset_date
         FROM meter_reset_requests WHERE machine_id = $1 AND status = 'pending' LIMIT 1`,
      [machine_id]
    );
    if (pendingReset.rows.length > 0) {
      return res.status(409).json({
        error: `Bulk upload blocked: A Counter Reset Request is pending for this machine (reset date: ${pendingReset.rows[0].reset_date}). Wait for Admin approval before uploading.`,
      });
    }

    // Fetch reading configs so reading_logs can be populated for multi-reading machines
    const rcResult = await db.query(
      `SELECT mrc.reading_type_id, rt.code, rt.unit
         FROM machine_reading_configs mrc
         JOIN reading_types rt ON rt.id = mrc.reading_type_id
        WHERE mrc.machine_id = $1 AND mrc.is_active = true
        ORDER BY mrc.display_order, mrc.reading_type_id`,
      [machine_id]
    );
    const readingConfigs = rcResult.rows;
    const isMultiReading = readingConfigs.length > 0;

    // Check sequential reading continuity: first entry's opening must match previous closing
    const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const firstEntry = sortedEntries[0];
    if (firstEntry && firstEntry.r1_open != null) {
      const prevRes = await db.query(
        `SELECT r1_close, TO_CHAR(entry_date::date, 'YYYY-MM-DD') AS entry_date
           FROM dpr_entries
          WHERE machine_id = $1 AND entry_date < $2::date
          ORDER BY entry_date DESC LIMIT 1`,
        [machine_id, firstEntry.date]
      );
      if (prevRes.rows.length > 0 && prevRes.rows[0].r1_close != null) {
        const resetBetween = await db.query(
          `SELECT id FROM meter_reset_requests
            WHERE machine_id = $1 AND status = 'approved'
              AND reset_date::date > $2::date AND reset_date::date <= $3::date
            LIMIT 1`,
          [machine_id, prevRes.rows[0].entry_date, firstEntry.date]
        );
        if (resetBetween.rows.length === 0) {
          const prevClose = parseFloat(prevRes.rows[0].r1_close);
          const firstOpen = parseFloat(firstEntry.r1_open);
          if (Math.abs(prevClose - firstOpen) > 0.01) {
            return res.status(400).json({
              error: `Reading mismatch: First entry Opening Reading (${firstOpen}) does not match the previous DPR Closing Reading (${prevClose}) on ${prevRes.rows[0].entry_date}. Please correct the Opening Reading in your Excel file.`,
            });
          }
        }
      }
    }

    // Pre-check which dates already have entries
    const dates = entries.map(e => e.date);
    const existCheck = await db.query(
      `SELECT DISTINCT TO_CHAR(entry_date, 'YYYY-MM-DD') AS d
         FROM dpr_entries WHERE machine_id = $1 AND entry_date = ANY($2::date[])`,
      [machine_id, dates]
    );
    const existingDates = new Set(existCheck.rows.map(r => r.d));

    const inserted = [];
    const failed   = [];
    const plannedHours = parseFloat(machine.planned_hours) || 10;
    const isDual = machine.shift_type === 'Dual Shift';

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      for (const entry of entries) {
        const { date, r1_open, r1_close, hsd, breakdown, work_done, qty, remarks,
                n_r1_close, n_hsd, n_breakdown } = entry;

        if (existingDates.has(date)) {
          failed.push({ date, error: 'DPR entry already exists for this date' });
          continue;
        }

        try {
          await client.query('SAVEPOINT row_sp');

          const shift   = isDual ? 'Day Shift' : 'Day Shift';
          const r1Total = r1_close != null && r1_open != null ? parseFloat(r1_close) - parseFloat(r1_open) : null;
          const workHrs = r1Total;
          const utilPct = plannedHours > 0 && workHrs != null ? Math.round((workHrs / plannedHours) * 100) : 0;
          const fuelAvg = workHrs > 0 && hsd ? parseFloat((parseFloat(hsd) / workHrs).toFixed(2)) : null;
          const brkVal  = breakdown != null ? parseFloat(breakdown) : 0;

          const dayInsert = await client.query(
            `INSERT INTO dpr_entries
               (machine_id, project_id, entry_date, shift, status,
                slno, eq_type, capacity, reg_no, ownership, dual_reading, planned_hours,
                r1_open, r1_close, r1_total, working_hours, util_pct,
                hsd, fuel_avg, breakdown, work_done, qty, remarks, submitted_by, is_idle)
             VALUES ($1,$2,$3,$4,'submitted',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,false)
             RETURNING id`,
            [
              machine_id, machine.project_id, date, shift,
              machine.slno, machine.eq_type, machine.capacity, machine.reg_no,
              machine.ownership, machine.dual_reading, machine.planned_hours,
              r1_open, r1_close, r1Total, workHrs, utilPct,
              hsd || null, fuelAvg, brkVal,
              work_done || null, qty || null, remarks || null, req.user.id,
            ]
          );

          const dayEntryId = dayInsert.rows[0]?.id;
          if (isMultiReading && dayEntryId && r1_open != null && r1_close != null) {
            await client.query(
              `INSERT INTO dpr_reading_logs (entry_id, reading_type_id, open_value, close_value, total)
               VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
              [dayEntryId, readingConfigs[0].reading_type_id, r1_open, r1_close, r1Total]
            );
          }

          // Night Shift for dual-shift machines
          if (isDual && n_r1_close != null) {
            const nightOpen  = r1_close;
            const nightTotal = parseFloat(n_r1_close) - parseFloat(nightOpen);
            const nightUtil  = plannedHours > 0 ? Math.round((nightTotal / plannedHours) * 100) : 0;
            const nightAvg   = nightTotal > 0 && n_hsd ? parseFloat((parseFloat(n_hsd) / nightTotal).toFixed(2)) : null;
            const nBrkVal    = n_breakdown != null ? parseFloat(n_breakdown) : 0;

            const nightInsert = await client.query(
              `INSERT INTO dpr_entries
                 (machine_id, project_id, entry_date, shift, status,
                  slno, eq_type, capacity, reg_no, ownership, dual_reading, planned_hours,
                  r1_open, r1_close, r1_total, working_hours, util_pct,
                  hsd, fuel_avg, breakdown, work_done, qty, remarks, submitted_by, is_idle)
               VALUES ($1,$2,$3,'Night Shift','submitted',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,false)
               RETURNING id`,
              [
                machine_id, machine.project_id, date,
                machine.slno, machine.eq_type, machine.capacity, machine.reg_no,
                machine.ownership, machine.dual_reading, machine.planned_hours,
                nightOpen, n_r1_close, nightTotal, nightTotal, nightUtil,
                n_hsd || null, nightAvg, nBrkVal,
                work_done || null, qty || null, remarks || null, req.user.id,
              ]
            );

            const nightEntryId = nightInsert.rows[0]?.id;
            if (isMultiReading && nightEntryId && nightOpen != null && n_r1_close != null) {
              await client.query(
                `INSERT INTO dpr_reading_logs (entry_id, reading_type_id, open_value, close_value, total)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                [nightEntryId, readingConfigs[0].reading_type_id, nightOpen, n_r1_close, nightTotal]
              );
            }
          }

          await client.query('RELEASE SAVEPOINT row_sp');
          inserted.push(date);
        } catch (rowErr) {
          await client.query('ROLLBACK TO SAVEPOINT row_sp');
          failed.push({ date, error: rowErr.detail || rowErr.message });
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ inserted: inserted.length, failed, total: entries.length });
  } catch (err) {
    console.error('bulkCreate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getPreviousClosing, getLatestReadingBefore, checkExistsAfter, create, update, updateStatus, remove, removeAllForMachine, removeAllForProject, getDprStatus, getMonthlyStatus, getMonthlyProjectStatus, bulkCreate };
