const db = require('../config/db');

db.query(`
  CREATE TABLE IF NOT EXISTS machine_meter_resets (
    id               SERIAL PRIMARY KEY,
    machine_id       INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    entry_date       DATE NOT NULL,
    shift            VARCHAR(50),
    reading_code     VARCHAR(50),
    previous_reading NUMERIC(10,2),
    new_reading      NUMERIC(10,2),
    notes            TEXT,
    reset_by         INTEGER REFERENCES users(id),
    reset_at         TIMESTAMPTZ DEFAULT NOW(),
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('[MeterResets] Table init error:', err));

const getResets = async (req, res) => {
  try {
    const { machine_id, from, to } = req.query;
    if (!machine_id) return res.status(400).json({ error: 'machine_id required' });
    const conditions = ['r.machine_id = $1'];
    const params = [machine_id];
    if (from) { params.push(from); conditions.push(`r.entry_date >= $${params.length}`) }
    if (to)   { params.push(to);   conditions.push(`r.entry_date <= $${params.length}`) }
    const result = await db.query(
      `SELECT r.*, u.name AS reset_by_name
       FROM machine_meter_resets r
       LEFT JOIN users u ON r.reset_by = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.entry_date ASC, r.reset_at ASC`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get meter resets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createReset = async (req, res) => {
  try {
    const { machine_id, entry_date, shift, reading_code, previous_reading, new_reading, notes } = req.body;
    if (!machine_id || !entry_date) return res.status(400).json({ error: 'machine_id, entry_date required' });

    // Block if DPR entries exist on or after the reset date — reading chain would be broken
    const laterCheck = await db.query(
      `SELECT TO_CHAR(MIN(entry_date), 'DD-Mon-YYYY') AS first_date
       FROM dpr_entries WHERE machine_id = $1 AND entry_date >= $2::date`,
      [machine_id, entry_date]
    );
    if (laterCheck.rows[0]?.first_date) {
      return res.status(409).json({
        error: `Cannot apply meter reset on this date: a DPR entry already exists from ${laterCheck.rows[0].first_date}. Delete all DPR entries on and after the reset date first, then apply the reset.`
      });
    }

    const result = await db.query(
      `INSERT INTO machine_meter_resets
         (machine_id, entry_date, shift, reading_code, previous_reading, new_reading, notes, reset_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [machine_id, entry_date, shift || null, reading_code || null,
       previous_reading != null ? parseFloat(previous_reading) : null,
       new_reading != null ? parseFloat(new_reading) : null,
       notes || null, req.user.id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Create meter reset error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteReset = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM machine_meter_resets WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete meter reset error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getResets, createReset, deleteReset };
