const { Pool, types } = require('pg');

// Return PostgreSQL DATE columns as plain "YYYY-MM-DD" strings.
// Without this, pg parses them into JS Date objects and JSON.stringify
// converts them to UTC ISO strings (e.g. "2026-04-30T18:30:00.000Z" for IST),
// causing an off-by-one-day mismatch on the frontend date grid.
types.setTypeParser(1082, val => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,

  max: 2,
  min: 0,
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis:        7000,   // below Supabase PgBouncer's ~10 s server idle timeout
  statement_timeout:       30000,

  // Keep TCP connections alive so Supabase pooler doesn't drop them silently
  keepAlive:                    true,
  keepAliveInitialDelayMillis:  5000,
});

pool.on('error', (err) => {
  // Log but don't crash — pool will remove the dead client automatically
  if (err.code === 'ENOTFOUND') {
    console.error('[DB] Cannot reach database host — check DATABASE_URL and Supabase project status.');
  } else if (err.code === 'EAUTHTIMEOUT' || err.code === '08006') {
    console.error('[DB] Connection lost — Supabase may have closed an idle connection. Pool will reconnect.');
  } else {
    console.error('[DB] Unexpected client error:', err.message);
  }
});

const CONN_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'EAUTHTIMEOUT', '08006', '08001', '08004']);
const CONN_MSGS  = ['Connection terminated', 'connection timeout', 'timeout exceeded', 'Connection refused'];

function isConnErr(err) {
  if (!err) return false;
  // Check the error itself and its cause (pg-pool wraps the root error)
  const check = e => CONN_CODES.has(e?.code) || CONN_MSGS.some(m => e?.message?.includes(m));
  return check(err) || check(err.cause);
}

// Wrap query with exponential-backoff retries on connection-lost errors
const query = async (text, params) => {
  const delays = [500, 1500, 3000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      if (!isConnErr(err)) throw err;
      lastErr = err;
      if (attempt < delays.length) {
        console.warn(`[DB] Connection error (attempt ${attempt + 1}), retrying in ${delays[attempt]}ms…`);
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  }
  throw lastErr;
};

module.exports = {
  query,
  getClient: () => pool.connect(),
};
