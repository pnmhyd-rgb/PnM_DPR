const db = require('../config/db');

// ── Equipment Type SCS ────────────────────────────────────────────────────────

const getByType = async (req, res) => {
  try {
    const { eq_type_id } = req.query;
    if (!eq_type_id) return res.status(400).json({ error: 'eq_type_id required' });

    const machCount = await db.query(
      `SELECT COUNT(*) AS cnt FROM machines m
         JOIN equipment_types et ON LOWER(et.name)=LOWER(m.eq_type)
        WHERE et.id=$1 AND m.active=true`, [eq_type_id]
    );
    const totalMachines = parseInt(machCount.rows[0]?.cnt || 0);

    const r = await db.query(`
      SELECT ets.*,
             cs.name  AS check_sheet_name,
             cs.sheet_code,
             cs.check_items,
             cs.frequency,
             cs.frequency_value,
             (SELECT COUNT(*) FROM machine_scs ms
               WHERE ms.eq_type_scs_id = ets.id AND ms.enabled = true) AS enabled_machine_count
        FROM equipment_type_scs ets
        LEFT JOIN check_sheets cs ON ets.check_sheet_id = cs.id
       WHERE ets.equipment_type_id = $1
       ORDER BY ets.sort_order, ets.id
    `, [eq_type_id]);

    res.json({ data: r.rows, total_machines: totalMachines });
  } catch (err) {
    console.error('getByType SCS error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getSections = async (req, res) => {
  try {
    const { eq_type_id } = req.query;
    const r = await db.query(`
      SELECT DISTINCT section FROM equipment_type_scs
      WHERE section IS NOT NULL ${eq_type_id ? 'AND equipment_type_id=$1' : ''}
      ORDER BY section
    `, eq_type_id ? [eq_type_id] : []);
    res.json({ data: r.rows.map(r => r.section) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const {
      equipment_type_id, check_sheet_id, custom_name, enabled,
      interval_hours, hours_enabled, interval_days, days_enabled, interval_km, km_enabled,
      section, sub_section, description, extra_parameter,
    } = req.body;
    if (!equipment_type_id) return res.status(400).json({ error: 'equipment_type_id required' });
    if (!custom_name && !check_sheet_id) return res.status(400).json({ error: 'Name is required' });

    const maxSort = await db.query(
      `SELECT COALESCE(MAX(sort_order),0) AS m FROM equipment_type_scs WHERE equipment_type_id=$1`, [equipment_type_id]
    );

    const r = await db.query(`
      INSERT INTO equipment_type_scs
        (equipment_type_id, check_sheet_id, custom_name, enabled,
         interval_hours, hours_enabled, interval_days, days_enabled,
         interval_km, km_enabled, sort_order,
         section, sub_section, description, extra_parameter)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *
    `, [equipment_type_id, check_sheet_id || null,
        custom_name || null, enabled !== false,
        interval_hours || null, hours_enabled !== false,
        interval_days || null, days_enabled || false,
        interval_km || null, km_enabled || false,
        parseInt(maxSort.rows[0].m) + 1,
        section || null, sub_section || null,
        description || null, extra_parameter || false]);

    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'This check sheet is already assigned to this equipment type' });
    console.error('create SCS error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const {
      custom_name, enabled,
      interval_hours, hours_enabled, interval_days, days_enabled, interval_km, km_enabled,
      section, sub_section, description, extra_parameter,
    } = req.body;

    const r = await db.query(`
      UPDATE equipment_type_scs SET
        custom_name=$1, enabled=$2,
        interval_hours=$3, hours_enabled=$4,
        interval_days=$5, days_enabled=$6,
        interval_km=$7, km_enabled=$8,
        section=$9, sub_section=$10, description=$11, extra_parameter=$12,
        updated_at=NOW()
      WHERE id=$13 RETURNING *
    `, [custom_name || null, enabled !== false,
        interval_hours || null, hours_enabled !== false,
        interval_days || null, days_enabled || false,
        interval_km || null, km_enabled || false,
        section || null, sub_section || null,
        description || null, extra_parameter || false,
        req.params.id]);

    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('update SCS error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(`DELETE FROM equipment_type_scs WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('delete SCS error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const syncToMachines = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { eq_type_id } = req.body;
    if (!eq_type_id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'eq_type_id required' }); }

    const templates = await client.query(
      `SELECT * FROM equipment_type_scs WHERE equipment_type_id=$1`, [eq_type_id]
    );
    const machines = await client.query(
      `SELECT m.id FROM machines m
         JOIN equipment_types et ON LOWER(et.name)=LOWER(m.eq_type)
        WHERE et.id=$1 AND m.active=true`, [eq_type_id]
    );

    let created = 0;
    for (const mac of machines.rows) {
      for (const tpl of templates.rows) {
        // For custom SCS (no check_sheet_id), always insert (no unique conflict possible)
        // For linked SCS, use ON CONFLICT DO NOTHING
        if (tpl.check_sheet_id) {
          const ins = await client.query(`
            INSERT INTO machine_scs
              (machine_id, eq_type_scs_id, check_sheet_id, custom_name, enabled,
               interval_hours, hours_enabled, interval_days, days_enabled,
               interval_km, km_enabled, is_inherited)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
            ON CONFLICT (machine_id, check_sheet_id) DO NOTHING
            RETURNING id
          `, [mac.id, tpl.id, tpl.check_sheet_id, tpl.custom_name, tpl.enabled,
              tpl.interval_hours, tpl.hours_enabled,
              tpl.interval_days, tpl.days_enabled,
              tpl.interval_km, tpl.km_enabled]);
          if (ins.rows.length) created++;
        } else {
          // Custom SCS: skip if already synced (eq_type_scs_id match)
          const exists = await client.query(
            `SELECT id FROM machine_scs WHERE machine_id=$1 AND eq_type_scs_id=$2`,
            [mac.id, tpl.id]
          );
          if (!exists.rows.length) {
            await client.query(`
              INSERT INTO machine_scs
                (machine_id, eq_type_scs_id, check_sheet_id, custom_name, enabled,
                 interval_hours, hours_enabled, interval_days, days_enabled,
                 interval_km, km_enabled, is_inherited)
              VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,true)
            `, [mac.id, tpl.id, tpl.custom_name, tpl.enabled,
                tpl.interval_hours, tpl.hours_enabled,
                tpl.interval_days, tpl.days_enabled,
                tpl.interval_km, tpl.km_enabled]);
            created++;
          }
        }
      }
    }

    await client.query('COMMIT');
    res.json({
      message: `Synced ${templates.rows.length} templates to ${machines.rows.length} machines`,
      created,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('syncToMachines error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

module.exports = { getByType, getSections, create, update, remove, syncToMachines };
