// Run once after deploying to DO to move existing base64 attachments to Spaces.
// Usage: node backend/scripts/migrate-attachments-to-spaces.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const { Pool } = require('pg')
const storage = require('../src/services/storageService')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

async function run() {
  const { rows } = await pool.query(
    `SELECT id, attachment_name, attachment_data, attachment_mime
     FROM machine_compliance
     WHERE attachment_data IS NOT NULL AND attachment_key IS NULL`
  )

  console.log(`Found ${rows.length} records to migrate`)

  for (const row of rows) {
    try {
      const key = await storage.uploadFile(
        row.attachment_data,
        row.attachment_name || 'attachment',
        row.attachment_mime
      )
      await pool.query(
        `UPDATE machine_compliance SET attachment_key = $1 WHERE id = $2`,
        [key, row.id]
      )
      console.log(`  ✓ Migrated id=${row.id} → ${key}`)
    } catch (err) {
      console.error(`  ✗ Failed id=${row.id}:`, err.message)
    }
  }

  console.log('Migration complete.')
  await pool.end()
}

run().catch(err => { console.error(err); process.exit(1) })
