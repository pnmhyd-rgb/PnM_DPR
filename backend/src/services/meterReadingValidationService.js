/**
 * Generic cumulative meter reading sequence validator.
 *
 * Rule: for every meter type configured on a machine, the proposed closing
 * reading on entry (date, shift) must NOT exceed the CLOSING reading of the
 * immediately subsequent chronological entry for that machine.
 *
 * Checking against next.close (not next.open) lets the existing cascade
 * mechanism work (slight adjustments propagate forward) while still blocking
 * any backdated entry whose close is physically impossible given the recorded
 * future data.
 *
 * If the next entry has no closing reading yet (in-progress), that reading
 * type is skipped — there's nothing fixed to violate.
 */
const db = require('../config/db');

const SEQ_ERR = 'Cannot save this reading. The entered meter reading is greater than an already recorded future reading. If you want to insert or modify a historical reading, delete all subsequent readings first and then re-enter them in chronological order.';

/**
 * Find the chronologically-next DPR entry for a machine, respecting
 * the Dual / Single shift ordering used by cascadeToNextEntry.
 *
 * Returns { id, r1_close, r2_close, reading_logs: [{reading_type_id, close_value}] }
 * or null if no next entry exists.
 */
async function findNextEntry(machineId, entryDate, shift, shiftType) {
  let query, params;

  if (shiftType !== 'Single Shift' && shift === 'Day Shift') {
    // Dual-shift Day → next is Night Shift of the same date
    query = `SELECT id, r1_close, r2_close
             FROM dpr_entries
             WHERE machine_id = $1 AND entry_date = $2 AND shift = 'Night Shift'
             LIMIT 1`;
    params = [machineId, entryDate];
  } else if (shiftType !== 'Single Shift' && shift === 'Night Shift') {
    // Dual-shift Night → next is Day Shift of the next date
    query = `SELECT id, r1_close, r2_close
             FROM dpr_entries
             WHERE machine_id = $1 AND entry_date = $2::date + INTERVAL '1 day' AND shift = 'Day Shift'
             LIMIT 1`;
    params = [machineId, entryDate];
  } else {
    // Single-shift (any shift name) → first entry strictly after this date
    query = `SELECT id, r1_close, r2_close
             FROM dpr_entries
             WHERE machine_id = $1 AND entry_date > $2::date
             ORDER BY entry_date ASC,
               CASE shift WHEN 'Day Shift' THEN 1 WHEN 'Night Shift' THEN 2 ELSE 3 END ASC
             LIMIT 1`;
    params = [machineId, entryDate];
  }

  const result = await db.query(query, params);
  if (result.rows.length === 0) return null;

  const next = result.rows[0];

  // Fetch per-reading-type closing values for multi-reading machines
  const logsResult = await db.query(
    `SELECT reading_type_id, close_value FROM dpr_reading_logs WHERE entry_id = $1`,
    [next.id]
  );

  return { ...next, reading_logs: logsResult.rows };
}

/**
 * Validate proposed meter readings for a DPR entry.
 *
 * @param {object} opts
 *   machineId       – machine being recorded
 *   entryDate       – date string YYYY-MM-DD
 *   shift           – 'Day Shift' | 'Night Shift' | 'Dual Shift'
 *   shiftType       – machine.shift_type ('Single Shift' | 'Dual Shift')
 *   isMultiReading  – true when readings[] is populated
 *   readings        – [{reading_type_id, close_value}] for multi-reading machines
 *   r1Close         – proposed r1 closing (single-reading machines)
 *   r2Close         – proposed r2 closing (dual-reading single machines)
 *
 * @returns {{ valid: true } | { valid: false, error: string }}
 */
async function validateMeterSequence({ machineId, entryDate, shift, shiftType, isMultiReading, readings, r1Close, r2Close }) {
  try {
    const next = await findNextEntry(machineId, entryDate, shift, shiftType);
    if (!next) return { valid: true }; // no future entry — nothing to check

    const TOL = 0.001; // floating-point tolerance

    if (isMultiReading && Array.isArray(readings) && readings.length > 0) {
      if (next.reading_logs.length > 0) {
        // Next entry has per-reading-type logs — check each one
        for (const r of readings) {
          if (r.close_value == null || r.close_value === '') continue;
          const proposed = parseFloat(r.close_value);
          if (isNaN(proposed)) continue;

          // Normalize both sides to int to avoid string/number strict-equality mismatch
          const rtId = parseInt(r.reading_type_id, 10);
          const nextLog = next.reading_logs.find(l => parseInt(l.reading_type_id, 10) === rtId);
          if (nextLog?.close_value != null && proposed > parseFloat(nextLog.close_value) + TOL) {
            return { valid: false, error: SEQ_ERR };
          }
        }
      } else if (next.r1_close != null) {
        // Next entry is old-style (no reading_logs rows) — fall back to r1_close
        const firstR = readings.find(r => r.close_value != null && r.close_value !== '');
        if (firstR) {
          const proposed = parseFloat(firstR.close_value);
          if (!isNaN(proposed) && proposed > parseFloat(next.r1_close) + TOL) {
            return { valid: false, error: SEQ_ERR };
          }
        }
      }
    } else {
      // Single-reading machine (r1_close, and optionally r2_close)
      if (r1Close != null && next.r1_close != null) {
        if (parseFloat(r1Close) > parseFloat(next.r1_close) + TOL) {
          return { valid: false, error: SEQ_ERR };
        }
      }
      if (r2Close != null && next.r2_close != null) {
        if (parseFloat(r2Close) > parseFloat(next.r2_close) + TOL) {
          return { valid: false, error: SEQ_ERR };
        }
      }
    }

    return { valid: true };
  } catch {
    // Never block a save on a validation DB error — degrade gracefully
    return { valid: true };
  }
}

module.exports = { validateMeterSequence };
