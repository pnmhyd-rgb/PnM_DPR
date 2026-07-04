const db = require('../config/db');

db.query(`
  CREATE TABLE IF NOT EXISTS machine_fuel_records (
    id SERIAL PRIMARY KEY,
    machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
    diesel_issued NUMERIC(10,2) NOT NULL DEFAULT 0,
    closing_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
    remarks TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(machine_id, period_from, period_to)
  )
`).catch(err => console.error('[FuelRecords] Table init error:', err));

const getRecord = async (req, res) => {
  try {
    const { machine_id, period_from, period_to } = req.query;
    if (!machine_id || !period_from || !period_to) {
      return res.status(400).json({ error: 'machine_id, period_from, period_to required' });
    }
    const result = await db.query(
      `SELECT * FROM machine_fuel_records WHERE machine_id=$1 AND period_from=$2 AND period_to=$3`,
      [machine_id, period_from, period_to]
    );
    res.json({ data: result.rows[0] || null });
  } catch (err) {
    console.error('Get fuel record error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const upsert = async (req, res) => {
  try {
    const { machine_id, period_from, period_to, opening_balance, diesel_issued, closing_balance, remarks } = req.body;
    if (!machine_id || !period_from || !period_to) {
      return res.status(400).json({ error: 'machine_id, period_from, period_to required' });
    }
    const ob = parseFloat(opening_balance) || 0;
    const di = parseFloat(diesel_issued)   || 0;
    const cb = parseFloat(closing_balance) || 0;
    const result = await db.query(
      `INSERT INTO machine_fuel_records
         (machine_id, period_from, period_to, opening_balance, diesel_issued, closing_balance, remarks, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (machine_id, period_from, period_to) DO UPDATE SET
         opening_balance = EXCLUDED.opening_balance,
         diesel_issued   = EXCLUDED.diesel_issued,
         closing_balance = EXCLUDED.closing_balance,
         remarks         = EXCLUDED.remarks,
         updated_at      = NOW()
       RETURNING *`,
      [machine_id, period_from, period_to, ob, di, cb, remarks || null, req.user.id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Upsert fuel record error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getRecord, upsert };
