require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
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
  '015_equipment_type_fields.sql',
  '016_asset_code_fuel_avg_km.sql',
  '017_rename_fuel_avg_to_min_max_km.sql',
  '018_add_rate_monthly.sql',
  '019_machine_status_fields.sql',
  '020_machine_transfer_date.sql',
  '021_hire_work_orders.sql',
  '022_hire_wo_vendor_offer.sql',
  '023_gst_verification_fields.sql',
  '024_machine_compliance.sql',
  '025_compliance_attachments.sql',
  '026_dpr_entry_status.sql',
  '027_compliance_attachment_key.sql',
  '028_drop_attachment_data.sql',
  '029_reading_types.sql',
  '030_equipment_reading_mappings.sql',
  '031_machine_reading_configs.sql',
  '032_dpr_reading_logs.sql',
  '033_hire_billing.sql',
  '034_hire_wo_formal_fields.sql',
  '035_hire_wo_item_eq_type.sql',
  '036_hire_terms_library.sql',
  '037_hire_terms_categories.sql',
  '038_hire_signatories.sql',
  '039_hire_wo_updated_by.sql',
  '040_hire_indents.sql',
  '041_equipment_type_asset_hierarchy.sql',
  '042_fuel_type_options.sql',
  '043_compliance_hidden.sql',
  '044_machine_documents.sql',
  '045_engine_no.sql',
  '046_seed_machines_am.sql',
  '047_cleanup_bad_slno.sql',
  '048_machine_nickname.sql',
  '049_restore_yom_from_asset_code.sql',
  '050_asset_matrix.sql',
  '051_machines_am_id.sql',
  '052_seed_asset_matrix.sql',
  '053_machine_fuel_tank.sql',
  '054_meter_reset_requests.sql',
  '055_dpr_entry_reset_readings.sql',
  '056_meter_reset_actual_reading.sql',
  '057_meter_reset_shift.sql',
  '058_user_permissions.sql',
  '059_site_permissions.sql',
  '060_fuel_stations.sql',
  '061_dpr_diesel_rate.sql',
  '062_dpr_diesel_cost.sql',
  '063_asset_group_configs.sql',
  '064_equipment_type_configs.sql',
  '065_tm_fuel_split.sql',
  '066_machine_config_overrides.sql',
  '067_accounts_module.sql',
  '068_inventory_module.sql',
  '069_service_module.sql',
  '070_invoice_rule_machine.sql',
  '071_transaction_lock_duration.sql',
  '072_machine_fleet_status.sql',
  '073_hire_bill_abstract.sql',
  '074_invoice_rule_planned_km.sql',
  '075_calc_machine_maintenance.sql',
  '076_breakdown_days.sql',
  '077_invoice_rule_generic.sql',
  '078_fuel_performance.sql',
  '079_invoice_rule_productivity_rate.sql',
  '080_invoice_calc_rule_id.sql',
  '081_invoice_calc_wo_fields.sql',
  '082_invoice_calc_project.sql',
  '083_equipment_type_scs.sql',
  '084_invoice_rule_ownership.sql',
  '085_invoice_calc_vendor_details.sql',
  '086_machine_scs.sql',
  '087_scs_custom_fields.sql',
  '088_machine_scs_executions.sql',
  '089_scs_transactions.sql',
  '090_machine_asset_status.sql',
  '091_consumption_ticket_draft.sql',
  '092_consumption_workflow.sql',
  '093_hire_wo_asset_manual_bill.sql',
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
