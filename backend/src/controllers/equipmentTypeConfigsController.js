const db = require('../config/db');

function toNum(v) {
  return v != null && v !== '' ? parseFloat(v) : null;
}
function toInt(v) {
  return v != null && v !== '' ? parseInt(v) : null;
}

exports.getOne = async (req, res) => {
  const eqTypeId = parseInt(req.params.eqTypeId);
  try {
    const [cfgRes, typeRes, machinesRes, readingTypesRes] = await Promise.all([
      db.query('SELECT * FROM equipment_type_configs WHERE eq_type_id = $1', [eqTypeId]),
      db.query(
        'SELECT id, name, asset_cat, asset_group, asset_category, fuel_type FROM equipment_types WHERE id = $1',
        [eqTypeId]
      ),
      db.query(
        `SELECT m.id, m.eq_type, m.asset_code, m.slno, m.nickname,
                m.fuel_type, m.shift_type, m.ownership, m.reading1_basis
         FROM machines m
         WHERE LOWER(m.eq_type) = LOWER((SELECT name FROM equipment_types WHERE id = $1))
           AND m.active = true
         ORDER BY m.asset_code`,
        [eqTypeId]
      ),
      db.query('SELECT id, code, name, unit FROM reading_types WHERE active = true ORDER BY name'),
    ]);
    if (!typeRes.rows[0]) return res.status(404).json({ error: 'Equipment type not found' });
    res.json({
      data: {
        config:       cfgRes.rows[0] || null,
        eqType:       typeRes.rows[0],
        machines:     machinesRes.rows,
        readingTypes: readingTypesRes.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.upsert = async (req, res) => {
  const eqTypeId = parseInt(req.params.eqTypeId);
  const b = req.body;

  const readingConfigs = JSON.stringify(b.reading_configs  ?? []);
  const resetCodes     = JSON.stringify(b.reset_reading_codes ?? []);

  try {
    const typeRes = await db.query('SELECT name FROM equipment_types WHERE id = $1', [eqTypeId]);
    if (!typeRes.rows[0]) return res.status(404).json({ error: 'Equipment type not found' });
    const eqTypeName = typeRes.rows[0].name;

    const saved = await db.query(`
      INSERT INTO equipment_type_configs (
        eq_type_id,
        reading_configs, reset_reading_codes,
        fuel_applicable, fuel_type, fuel_tank_count, fuel_formula_type,
        fuel_consumption_min, fuel_consumption_max,
        fuel_economy_min, fuel_economy_max,
        tm_split_mode, tm_split_value,
        qty_mandatory_if_km, qty_mandatory_if_hrs,
        closing_reading_mandatory, allow_negative_reading, max_daily_reading,
        counter_reset_allowed,
        shift_type, fuel_entry_enabled, breakdown_entry_enabled, work_done_mandatory,
        mandatory_operator,
        service_interval_hrs, preventive_maintenance, breakdown_maintenance, lubrication_interval_hrs,
        low_fuel_alert, service_due_alert, calibration_due_alert, counter_exception_alert,
        entry_approval, supervisor_approval, lock_after_approval,
        report_show_fuel_cost, report_show_fuel_rate, report_show_quantity,
        report_show_reading_details, report_show_work_done,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
        $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
        $33,$34,$35,$36,$37,$38,$39,$40,NOW()
      )
      ON CONFLICT (eq_type_id) DO UPDATE SET
        reading_configs          = EXCLUDED.reading_configs,
        reset_reading_codes      = EXCLUDED.reset_reading_codes,
        fuel_applicable          = EXCLUDED.fuel_applicable,
        fuel_type                = EXCLUDED.fuel_type,
        fuel_tank_count          = EXCLUDED.fuel_tank_count,
        fuel_formula_type        = EXCLUDED.fuel_formula_type,
        fuel_consumption_min     = EXCLUDED.fuel_consumption_min,
        fuel_consumption_max     = EXCLUDED.fuel_consumption_max,
        fuel_economy_min         = EXCLUDED.fuel_economy_min,
        fuel_economy_max         = EXCLUDED.fuel_economy_max,
        tm_split_mode            = EXCLUDED.tm_split_mode,
        tm_split_value           = EXCLUDED.tm_split_value,
        qty_mandatory_if_km      = EXCLUDED.qty_mandatory_if_km,
        qty_mandatory_if_hrs     = EXCLUDED.qty_mandatory_if_hrs,
        closing_reading_mandatory= EXCLUDED.closing_reading_mandatory,
        allow_negative_reading   = EXCLUDED.allow_negative_reading,
        max_daily_reading        = EXCLUDED.max_daily_reading,
        counter_reset_allowed    = EXCLUDED.counter_reset_allowed,
        shift_type               = EXCLUDED.shift_type,
        fuel_entry_enabled       = EXCLUDED.fuel_entry_enabled,
        breakdown_entry_enabled  = EXCLUDED.breakdown_entry_enabled,
        work_done_mandatory      = EXCLUDED.work_done_mandatory,
        mandatory_operator       = EXCLUDED.mandatory_operator,
        service_interval_hrs     = EXCLUDED.service_interval_hrs,
        preventive_maintenance   = EXCLUDED.preventive_maintenance,
        breakdown_maintenance    = EXCLUDED.breakdown_maintenance,
        lubrication_interval_hrs = EXCLUDED.lubrication_interval_hrs,
        low_fuel_alert           = EXCLUDED.low_fuel_alert,
        service_due_alert        = EXCLUDED.service_due_alert,
        calibration_due_alert    = EXCLUDED.calibration_due_alert,
        counter_exception_alert  = EXCLUDED.counter_exception_alert,
        entry_approval           = EXCLUDED.entry_approval,
        supervisor_approval      = EXCLUDED.supervisor_approval,
        lock_after_approval      = EXCLUDED.lock_after_approval,
        report_show_fuel_cost    = EXCLUDED.report_show_fuel_cost,
        report_show_fuel_rate    = EXCLUDED.report_show_fuel_rate,
        report_show_quantity     = EXCLUDED.report_show_quantity,
        report_show_reading_details = EXCLUDED.report_show_reading_details,
        report_show_work_done    = EXCLUDED.report_show_work_done,
        updated_at               = NOW()
      RETURNING *
    `, [
      eqTypeId,
      readingConfigs, resetCodes,
      b.fuel_applicable ?? true,
      b.fuel_type || null,
      b.fuel_tank_count || 1,
      b.fuel_formula_type || 'L_per_Hr',
      toNum(b.fuel_consumption_min),
      toNum(b.fuel_consumption_max),
      toNum(b.fuel_economy_min),
      toNum(b.fuel_economy_max),
      b.tm_split_mode  || null,
      toNum(b.tm_split_value),
      b.qty_mandatory_if_km       ?? false,
      b.qty_mandatory_if_hrs      ?? false,
      b.closing_reading_mandatory ?? true,
      b.allow_negative_reading    ?? false,
      toNum(b.max_daily_reading),
      b.counter_reset_allowed     ?? true,
      b.shift_type || 'Single Shift',
      b.fuel_entry_enabled      ?? true,
      b.breakdown_entry_enabled ?? true,
      b.work_done_mandatory     ?? false,
      b.mandatory_operator      ?? false,
      toInt(b.service_interval_hrs),
      b.preventive_maintenance  ?? true,
      b.breakdown_maintenance   ?? true,
      toInt(b.lubrication_interval_hrs),
      b.low_fuel_alert           ?? false,
      b.service_due_alert        ?? false,
      b.calibration_due_alert    ?? false,
      b.counter_exception_alert  ?? false,
      b.entry_approval      ?? false,
      b.supervisor_approval ?? false,
      b.lock_after_approval ?? true,
      b.report_show_fuel_cost       ?? true,
      b.report_show_fuel_rate       ?? true,
      b.report_show_quantity        ?? true,
      b.report_show_reading_details ?? true,
      b.report_show_work_done       ?? true,
    ]);

    // Propagate scalar fields to all active machines of this eq_type
    await db.query(`
      UPDATE machines SET
        fuel_type         = COALESCE($2, fuel_type),
        shift_type        = $3,
        fuel_min          = $4,
        fuel_max          = $5,
        fuel_min_km       = $6,
        fuel_max_km       = $7,
        tm_split_mode     = $8,
        tm_split_value    = $9,
        fuel_formula_type = $10
      WHERE LOWER(eq_type) = LOWER($1) AND active = true
    `, [
      eqTypeName,
      b.fuel_type || null,
      b.shift_type || null,
      toNum(b.fuel_consumption_min),
      toNum(b.fuel_consumption_max),
      toNum(b.fuel_economy_min),
      toNum(b.fuel_economy_max),
      b.tm_split_mode  || null,
      toNum(b.tm_split_value),
      b.fuel_formula_type || 'L_per_Hr',
    ]);

    res.json({ data: saved.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSCS = async (req, res) => {
  const eqTypeId = parseInt(req.params.eqTypeId);
  try {
    const result = await db.query(`
      SELECT s.*, cs.name AS check_sheet_name, cs.category AS check_sheet_category
      FROM equipment_type_scs s
      LEFT JOIN check_sheets cs ON cs.id = s.check_sheet_id
      WHERE s.equipment_type_id = $1
      ORDER BY s.sort_order, s.id
    `, [eqTypeId]);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addSCS = async (req, res) => {
  const eqTypeId = parseInt(req.params.eqTypeId);
  const { check_sheet_id, custom_name, enabled, interval_hours, hours_enabled, interval_days, days_enabled, sort_order } = req.body;
  try {
    const result = await db.query(`
      INSERT INTO equipment_type_scs
        (equipment_type_id, check_sheet_id, custom_name, enabled,
         interval_hours, hours_enabled, interval_days, days_enabled, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      eqTypeId,
      check_sheet_id || null,
      custom_name || null,
      enabled ?? true,
      interval_hours || null,
      hours_enabled ?? true,
      interval_days || null,
      days_enabled ?? false,
      sort_order || 0,
    ]);
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSCS = async (req, res) => {
  const scsId = parseInt(req.params.scsId);
  const { custom_name, enabled, interval_hours, hours_enabled, interval_days, days_enabled, sort_order } = req.body;
  try {
    const result = await db.query(`
      UPDATE equipment_type_scs SET
        custom_name     = $1,
        enabled         = $2,
        interval_hours  = $3,
        hours_enabled   = $4,
        interval_days   = $5,
        days_enabled    = $6,
        sort_order      = $7
      WHERE id = $8
      RETURNING *
    `, [
      custom_name || null,
      enabled ?? true,
      interval_hours || null,
      hours_enabled ?? true,
      interval_days || null,
      days_enabled ?? false,
      sort_order || 0,
      scsId,
    ]);
    if (!result.rows[0]) return res.status(404).json({ error: 'SCS entry not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.removeSCS = async (req, res) => {
  const scsId = parseInt(req.params.scsId);
  try {
    await db.query('DELETE FROM equipment_type_scs WHERE id = $1', [scsId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
