const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,

  // Connection pool limits
  max: 10,                        // max concurrent DB connections
  min: 0,                         // don't hold idle connections open

  // Timeouts — critical for Supabase pooler which can drop connections
  connectionTimeoutMillis: 10000, // fail fast if pool can't give a connection in 10 s
  idleTimeoutMillis:       30000, // release idle clients after 30 s
  statement_timeout:       30000, // kill any query running > 30 s (passed via options)
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

// Wrap query with a single retry on connection-lost errors
const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (err) {
    const isConnErr = ['ENOTFOUND', 'ECONNREFUSED', 'EAUTHTIMEOUT', '08006', '08001', '08004'].includes(err.code);
    if (isConnErr) {
      // Wait 500 ms then try once more (pool will open a fresh connection)
      await new Promise(r => setTimeout(r, 500));
      return pool.query(text, params);
    }
    throw err;
  }
};

module.exports = {
  query,
  getClient: () => pool.connect(),
};
