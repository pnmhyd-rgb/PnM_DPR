const db = require('../config/db');

// GET /meter-reset-requests?machine_id=X
const getRequests = async (req, res) => {
  try {
    const { machine_id, status } = req.query;
    if (!machine_id) return res.status(400).json({ error: 'machine_id required' });

    const conditions = ['r.machine_id = $1'];
    const params = [machine_id];

    // Non-admin users only see their own requests
    if (req.user.role !== 'admin') {
      params.push(req.user.id);
      conditions.push(`r.requested_by = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }

    const result = await db.query(
      `SELECT r.*,
              u1.name AS requested_by_name,
              u2.name AS reviewed_by_name
         FROM meter_reset_requests r
         LEFT JOIN users u1 ON u1.id = r.requested_by
         LEFT JOIN users u2 ON u2.id = r.reviewed_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY r.requested_at DESC`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getRequests error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /meter-reset-requests
const createRequest = async (req, res) => {
  try {
    const { machine_id, reading_code, actual_reading_before_reset, old_reading, new_reading, reset_date, remark, reset_shift } = req.body;
    if (!machine_id || !reset_date) return res.status(400).json({ error: 'machine_id and reset_date required' });

    // §15: Block if a pending request already exists for this machine
    const existingPending = await db.query(
      `SELECT id FROM meter_reset_requests WHERE machine_id = $1 AND status = 'pending' LIMIT 1`,
      [machine_id]
    );
    if (existingPending.rows.length > 0) {
      return res.status(409).json({ error: 'A Counter Reset Request is already pending for this machine. Please wait for Admin Approval.' });
    }

    // §3 Validation 1: old_reading cannot be less than actual_reading_before_reset
    if (old_reading != null && actual_reading_before_reset != null &&
        parseFloat(old_reading) < parseFloat(actual_reading_before_reset)) {
      return res.status(400).json({ error: 'Old Meter Final Reading cannot be less than the Actual Previous Reading.' });
    }

    // Block request if DPR entries already exist on or after the reset date.
    // For Night Shift resets: a Day Shift entry on the same date is OK — only block Night Shift entries on that date.
    const laterCheck = await db.query(
      `SELECT TO_CHAR(MIN(entry_date), 'DD-Mon-YYYY') AS first_date
       FROM dpr_entries WHERE machine_id = $1
       AND (
         entry_date > $2::date
         OR (entry_date = $2::date AND ($3 IS NULL OR $3 != 'Night Shift' OR shift IS NULL OR shift = 'Night Shift'))
       )`,
      [machine_id, reset_date, reset_shift || null]
    );
    if (laterCheck.rows[0]?.first_date) {
      return res.status(409).json({
        error: `Cannot request meter reset on this date: a DPR entry already exists from ${laterCheck.rows[0].first_date}. Delete all DPR entries on and after the reset date first, then submit the request.`
      });
    }

    const result = await db.query(
      `INSERT INTO meter_reset_requests
         (machine_id, reading_code, actual_reading_before_reset, old_reading, new_reading, reset_date, reset_shift, remark, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        machine_id,
        reading_code || null,
        actual_reading_before_reset != null ? parseFloat(actual_reading_before_reset) : null,
        old_reading != null ? parseFloat(old_reading) : null,
        new_reading != null ? parseFloat(new_reading) : null,
        reset_date,
        reset_shift || null,
        remark || null,
        req.user.id,
      ]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('createRequest error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PATCH /meter-reset-requests/:id  — admin only
const reviewRequest = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;
    const { action, review_note } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });

    const reqRow = await db.query('SELECT * FROM meter_reset_requests WHERE id = $1', [id]);
    if (reqRow.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    const rr = reqRow.rows[0];

    if (rr.status !== 'pending') return res.status(409).json({ error: 'Request already reviewed' });

    // Re-validate at approval time: block if DPR entries now exist on or after the reset date.
    // For Night Shift resets: Day Shift entries on the same date are OK.
    if (action === 'approve') {
      const laterCheck = await db.query(
        `SELECT TO_CHAR(MIN(entry_date), 'DD-Mon-YYYY') AS first_date
         FROM dpr_entries WHERE machine_id = $1
         AND (
           entry_date > $2::date
           OR (entry_date = $2::date AND ($3 IS NULL OR $3 != 'Night Shift' OR shift IS NULL OR shift = 'Night Shift'))
         )`,
        [rr.machine_id, rr.reset_date, rr.reset_shift || null]
      );
      if (laterCheck.rows[0]?.first_date) {
        return res.status(409).json({
          error: `Cannot approve: a DPR entry exists from ${laterCheck.rows[0].first_date} for this machine. The operator must delete all DPR entries on and after the reset date before this request can be approved.`
        });
      }
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE meter_reset_requests
            SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_note = $3
          WHERE id = $4`,
        [newStatus, req.user.id, review_note || null, id]
      );

      if (action === 'approve') {
        // Create actual meter reset record
        await client.query(
          `INSERT INTO machine_meter_resets
             (machine_id, entry_date, shift, reading_code, actual_reading_before_reset, previous_reading, new_reading, notes, reset_by)
           VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)`,
          [
            rr.machine_id,
            rr.reset_date,
            rr.reset_shift || null,
            rr.reading_code || null,
            rr.actual_reading_before_reset != null ? rr.actual_reading_before_reset : null,
            rr.old_reading  != null ? rr.old_reading  : null,
            rr.new_reading  != null ? rr.new_reading  : null,
            rr.remark || null,
            req.user.id,
          ]
        );
      }

      await client.query('COMMIT');

      const updated = await db.query(
        `SELECT r.*, u1.name AS requested_by_name, u2.name AS reviewed_by_name
           FROM meter_reset_requests r
           LEFT JOIN users u1 ON u1.id = r.requested_by
           LEFT JOIN users u2 ON u2.id = r.reviewed_by
          WHERE r.id = $1`,
        [id]
      );
      res.json({ data: updated.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('reviewRequest error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /meter-reset-requests/pending-all — admin only, all pending across all machines
const getAllPending = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const result = await db.query(
      `SELECT r.id,
              r.machine_id,
              r.reading_code,
              r.reset_date,
              r.requested_at,
              r.status,
              u.name  AS requested_by_name,
              m.slno,
              m.nickname,
              m.eq_type,
              m.asset_code
         FROM meter_reset_requests r
         LEFT JOIN users    u ON u.id = r.requested_by
         LEFT JOIN machines m ON m.id = r.machine_id
        WHERE r.status = 'pending'
        ORDER BY r.requested_at ASC`
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getAllPending error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getRequests, createRequest, reviewRequest, getAllPending };
