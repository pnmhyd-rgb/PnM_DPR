const db = require('../config/db');

exports.getGroups = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        et.asset_group,
        COUNT(DISTINCT et.id)::int                           AS type_count,
        COUNT(DISTINCT m.id)::int                            AS machine_count,
        agc.id IS NOT NULL                                   AS has_config,
        agc.updated_at                                        AS config_updated_at
      FROM equipment_types et
      LEFT JOIN machines m ON m.eq_type = et.name AND m.active = true
      LEFT JOIN asset_group_configs agc ON agc.asset_group = et.asset_group
      WHERE et.asset_group IS NOT NULL
      GROUP BY et.asset_group, agc.id, agc.updated_at
      ORDER BY et.asset_group
    `);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getOne = async (req, res) => {
  const group = decodeURIComponent(req.params.group);
  try {
    const [cfgRes, typesRes, machinesRes, readingTypesRes] = await Promise.all([
      db.query('SELECT * FROM asset_group_configs WHERE asset_group = $1', [group]),
      db.query(
        `SELECT id, name, asset_cat, asset_category
         FROM equipment_types WHERE asset_group = $1 ORDER BY asset_cat, name`,
        [group]
      ),
      db.query(
        `SELECT m.id, m.eq_type, m.asset_code, m.slno, m.nickname, m.fuel_type, m.shift_type,
                m.reading1_basis, m.ownership
         FROM machines m
         JOIN equipment_types et ON et.name = m.eq_type
         WHERE et.asset_group = $1 AND m.active = true
         ORDER BY m.eq_type, m.asset_code`,
        [group]
      ),
      db.query(
        'SELECT id, code, name, unit FROM reading_types WHERE active = true ORDER BY name'
      ),
    ]);
    res.json({
      data: {
        config:       cfgRes.rows[0] || null,
        assetTypes:   typesRes.rows,
        machines:     machinesRes.rows,
        readingTypes: readingTypesRes.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.upsert = async (req, res) => {
  const group = decodeURIComponent(req.params.group);
  const b = req.body;

  const readingConfigs  = JSON.stringify(b.reading_configs  ?? []);
  const resetCodes      = JSON.stringify(b.reset_reading_codes ?? []);

  try {
    const saved = await db.query(`
      INSERT INTO asset_group_configs (
        asset_group,
        reading_configs, fuel_type, fuel_tank_count,
        fuel_consumption_min, fuel_consumption_max,
        fuel_economy_min,     fuel_economy_max,
        fuel_formula_type,
        qty_mandatory_if_km, qty_mandatory_if_hrs,
        closing_reading_mandatory, allow_negative_reading,
        counter_reset_allowed, reset_reading_codes,
        shift_type, fuel_entry_enabled, breakdown_entry_enabled, work_done_mandatory,
        report_show_fuel_cost, report_show_fuel_rate, report_show_quantity,
        report_show_reading_details, report_show_work_done,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23, $24,
        NOW()
      )
      ON CONFLICT (asset_group) DO UPDATE SET
        reading_configs            = EXCLUDED.reading_configs,
        fuel_type                  = EXCLUDED.fuel_type,
        fuel_tank_count            = EXCLUDED.fuel_tank_count,
        fuel_consumption_min       = EXCLUDED.fuel_consumption_min,
        fuel_consumption_max       = EXCLUDED.fuel_consumption_max,
        fuel_economy_min           = EXCLUDED.fuel_economy_min,
        fuel_economy_max           = EXCLUDED.fuel_economy_max,
        fuel_formula_type          = EXCLUDED.fuel_formula_type,
        qty_mandatory_if_km        = EXCLUDED.qty_mandatory_if_km,
        qty_mandatory_if_hrs       = EXCLUDED.qty_mandatory_if_hrs,
        closing_reading_mandatory  = EXCLUDED.closing_reading_mandatory,
        allow_negative_reading     = EXCLUDED.allow_negative_reading,
        counter_reset_allowed      = EXCLUDED.counter_reset_allowed,
        reset_reading_codes        = EXCLUDED.reset_reading_codes,
        shift_type                 = EXCLUDED.shift_type,
        fuel_entry_enabled         = EXCLUDED.fuel_entry_enabled,
        breakdown_entry_enabled    = EXCLUDED.breakdown_entry_enabled,
        work_done_mandatory        = EXCLUDED.work_done_mandatory,
        report_show_fuel_cost      = EXCLUDED.report_show_fuel_cost,
        report_show_fuel_rate      = EXCLUDED.report_show_fuel_rate,
        report_show_quantity       = EXCLUDED.report_show_quantity,
        report_show_reading_details= EXCLUDED.report_show_reading_details,
        report_show_work_done      = EXCLUDED.report_show_work_done,
        updated_at                 = NOW()
      RETURNING *
    `, [
      group,
      readingConfigs,
      b.fuel_type || null,
      b.fuel_tank_count || 1,
      b.fuel_consumption_min != null && b.fuel_consumption_min !== '' ? b.fuel_consumption_min : null,
      b.fuel_consumption_max != null && b.fuel_consumption_max !== '' ? b.fuel_consumption_max : null,
      b.fuel_economy_min     != null && b.fuel_economy_min     !== '' ? b.fuel_economy_min     : null,
      b.fuel_economy_max     != null && b.fuel_economy_max     !== '' ? b.fuel_economy_max     : null,
      b.fuel_formula_type || 'L_per_Hr',
      b.qty_mandatory_if_km        ?? false,
      b.qty_mandatory_if_hrs       ?? false,
      b.closing_reading_mandatory  ?? true,
      b.allow_negative_reading     ?? false,
      b.counter_reset_allowed      ?? true,
      resetCodes,
      b.shift_type || 'Single Shift',
      b.fuel_entry_enabled      ?? true,
      b.breakdown_entry_enabled ?? true,
      b.work_done_mandatory     ?? false,
      b.report_show_fuel_cost       ?? true,
      b.report_show_fuel_rate       ?? true,
      b.report_show_quantity        ?? true,
      b.report_show_reading_details ?? true,
      b.report_show_work_done       ?? true,
    ]);

    // Propagate applicable fields to all active machines in this group
    await db.query(`
      UPDATE machines
      SET
        fuel_type    = COALESCE($2, fuel_type),
        shift_type   = $3,
        fuel_min     = $4,
        fuel_max     = $5,
        fuel_min_km  = $6,
        fuel_max_km  = $7
      WHERE eq_type IN (
        SELECT name FROM equipment_types WHERE asset_group = $1
      ) AND active = true
    `, [
      group,
      b.fuel_type || null,
      b.shift_type || null,
      b.fuel_consumption_min != null && b.fuel_consumption_min !== '' ? b.fuel_consumption_min : null,
      b.fuel_consumption_max != null && b.fuel_consumption_max !== '' ? b.fuel_consumption_max : null,
      b.fuel_economy_min != null && b.fuel_economy_min !== '' ? b.fuel_economy_min : null,
      b.fuel_economy_max != null && b.fuel_economy_max !== '' ? b.fuel_economy_max : null,
    ]);

    res.json({ data: saved.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
