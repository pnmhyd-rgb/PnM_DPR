const db = require('../config/db');

// ── Machine SCS ───────────────────────────────────────────────────────────────

const getByMachine = async (req, res) => {
  try {
    const { machine_id } = req.query;
    if (!machine_id) return res.status(400).json({ error: 'machine_id required' });

    const machRes = await db.query(
      `SELECT et.id AS eq_type_id FROM machines m
         JOIN equipment_types et ON LOWER(et.name)=LOWER(m.eq_type)
        WHERE m.id=$1`, [machine_id]
    );
    if (!machRes.rows.length) return res.status(404).json({ error: 'Machine not found' });
    const eq_type_id = machRes.rows[0].eq_type_id;

    const r = await db.query(`
      SELECT ms.*,
             cs.name       AS check_sheet_name,
             cs.sheet_code,
             cs.check_items,
             cs.frequency,
             ets.interval_hours AS type_interval_hours,
             ets.interval_km    AS type_interval_km,
             ets.interval_days  AS type_interval_days
        FROM machine_scs ms
        LEFT JOIN check_sheets cs          ON ms.check_sheet_id = cs.id
        LEFT JOIN equipment_type_scs ets   ON ms.eq_type_scs_id = ets.id
       WHERE ms.machine_id = $1
       ORDER BY ms.sort_order, ms.id
    `, [machine_id]);

    // Templates not yet synced to this machine
    let unsynced = [];
    if (eq_type_id) {
      const u = await db.query(`
        SELECT ets.*,
               cs.name AS check_sheet_name, cs.sheet_code, cs.check_items
          FROM equipment_type_scs ets
          LEFT JOIN check_sheets cs ON ets.check_sheet_id = cs.id
         WHERE ets.equipment_type_id = $1
           AND ets.check_sheet_id NOT IN (
             SELECT check_sheet_id FROM machine_scs
              WHERE machine_id=$2 AND check_sheet_id IS NOT NULL
           )
      `, [eq_type_id, machine_id]);
      unsynced = u.rows;
    }

    res.json({ data: r.rows, unsynced });
  } catch (err) {
    console.error('getByMachine SCS error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const {
      machine_id, eq_type_scs_id, check_sheet_id, custom_name, enabled,
      interval_hours, hours_enabled, interval_days, days_enabled,
      interval_km, km_enabled, is_inherited,
    } = req.body;
    if (!machine_id || !check_sheet_id) {
      return res.status(400).json({ error: 'machine_id and check_sheet_id required' });
    }

    const r = await db.query(`
      INSERT INTO machine_scs
        (machine_id, eq_type_scs_id, check_sheet_id, custom_name, enabled,
         interval_hours, hours_enabled, interval_days, days_enabled,
         interval_km, km_enabled, is_inherited)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (machine_id, check_sheet_id) DO UPDATE SET
        enabled=$5, custom_name=$4,
        interval_hours=$6, hours_enabled=$7,
        interval_days=$8, days_enabled=$9,
        interval_km=$10, km_enabled=$11,
        updated_at=NOW()
      RETURNING *
    `, [machine_id, eq_type_scs_id || null, check_sheet_id,
        custom_name || null, enabled !== false,
        interval_hours || null, hours_enabled !== false,
        interval_days || null, days_enabled || false,
        interval_km || null, km_enabled || false,
        is_inherited !== false]);

    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error('create machine SCS error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const {
      custom_name, enabled,
      interval_hours, hours_enabled, interval_days, days_enabled, interval_km, km_enabled,
    } = req.body;

    const r = await db.query(`
      UPDATE machine_scs SET
        custom_name=$1, enabled=$2,
        interval_hours=$3, hours_enabled=$4,
        interval_days=$5, days_enabled=$6,
        interval_km=$7, km_enabled=$8,
        is_inherited=false, updated_at=NOW()
      WHERE id=$9 RETURNING *
    `, [custom_name || null, enabled !== false,
        interval_hours || null, hours_enabled !== false,
        interval_days || null, days_enabled || false,
        interval_km || null, km_enabled || false,
        req.params.id]);

    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('update machine SCS error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(`DELETE FROM machine_scs WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('delete machine SCS error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const inheritFromType = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { machine_id } = req.body;
    if (!machine_id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'machine_id required' }); }

    const machRes = await client.query(
      `SELECT et.id AS eq_type_id FROM machines m
         JOIN equipment_types et ON LOWER(et.name)=LOWER(m.eq_type)
        WHERE m.id=$1`, [machine_id]
    );
    if (!machRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Machine not found or no equipment type assigned' }); }
    const eq_type_id = machRes.rows[0].eq_type_id;

    if (!eq_type_id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Machine has no equipment type assigned' }); }

    const templates = await client.query(
      `SELECT * FROM equipment_type_scs WHERE equipment_type_id=$1`, [eq_type_id]
    );

    let created = 0;
    for (const tpl of templates.rows) {
      const ins = await client.query(`
        INSERT INTO machine_scs
          (machine_id, eq_type_scs_id, check_sheet_id, custom_name, enabled,
           interval_hours, hours_enabled, interval_days, days_enabled,
           interval_km, km_enabled, is_inherited)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
        ON CONFLICT (machine_id, check_sheet_id) DO NOTHING
        RETURNING id
      `, [machine_id, tpl.id, tpl.check_sheet_id, tpl.custom_name, tpl.enabled,
          tpl.interval_hours, tpl.hours_enabled,
          tpl.interval_days, tpl.days_enabled,
          tpl.interval_km, tpl.km_enabled]);
      if (ins.rows.length) created++;
    }

    await client.query('COMMIT');
    res.json({ message: `Inherited ${created} checksheets from category`, created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('inheritFromType error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

module.exports = { getByMachine, create, update, remove, inheritFromType };
