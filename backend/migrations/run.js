require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

const migrations = [
  '001_initial_schema.sql',
  '002_add_shift.sql',
  '003_add_machine_shift_type.sql',
  '004_update_machine_shift_type.sql',
  '005_add_fuel_entries.sql',
  '006_add_service_entries.sql',
  '007_add_operators_attendance.sql',
  '008_add_spare_transactions.sql',
  '009_add_breakdown_incidents.sql',
  '010_add_payroll.sql',
  '011_asset_register_enhancements.sql',
  '012_projects_address.sql',
  '013_user_profile_fields.sql',
  '014_user_last_login.sql',
];

async function runMigrations() {
  for (const file of migrations) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping missing file: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      await db.query(sql);
      console.log(`Migration applied: ${file}`);
    } catch (err) {
      console.error(`Migration failed (${file}):`, err.message);
      process.exit(1);
    }
  }
  process.exit(0);
}

runMigrations();
