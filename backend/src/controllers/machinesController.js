const db = require('../config/db');

// Auto-create machine_reading_configs from equipment_reading_mappings for a given machine + eq_type
async function autoCreateReadingConfigs(machineId, eqType) {
  const mappings = await db.query(
    `SELECT erm.reading_type_id, erm.display_order
     FROM equipment_reading_mappings erm
     WHERE LOWER(erm.equipment_type_name) = LOWER($1)
     ORDER BY erm.display_order`,
    [eqType]
  );
  for (const m of mappings.rows) {
    await db.query(
      `INSERT INTO machine_reading_configs (machine_id, reading_type_id, is_active, display_order)
       VALUES ($1, $2, true, $3) ON CONFLICT DO NOTHING`,
      [machineId, m.reading_type_id, m.display_order]
    );
  }
}

const getAll = async (req, res) => {
  try {
    const { project_id, project_code } = req.query;
    const { include_inactive } = req.query;
    // include_inactive=true → show ONLY deactivated machines; default → only active
    const activeFilter = include_inactive === 'true' ? 'false' : 'true';
    let query = `
      SELECT m.*, p.code AS project_code, p.name AS project_name,
        COALESCE(
          (SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', mrc.id,
              'reading_type_id', rt.id,
              'code', rt.code,
              'reading_name', rt.name,
              'unit', rt.unit,
              'display_order', mrc.display_order,
              'is_active', mrc.is_active
            ) ORDER BY mrc.display_order
          ) FROM machine_reading_configs mrc
            JOIN reading_types rt ON rt.id = mrc.reading_type_id
          WHERE mrc.machine_id = m.id AND mrc.is_active = true),
          '[]'::json
        ) AS reading_configs
      FROM machines m JOIN projects p ON m.project_id = p.id WHERE m.active = ${activeFilter}`;
    const params = [];

    if (project_id) { params.push(project_id); query += ` AND m.project_id = $${params.length}`; }
    if (project_code) { params.push(project_code); query += ` AND p.code = $${params.length}`; }
    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }
    query += ' ORDER BY p.code, m.slno';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get machines error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

function canAddAsset(user) {
  return user.role === 'admin' || user.can_add_assets;
}

const create = async (req, res) => {
  try {
    if (!canAddAsset(req.user)) return res.status(403).json({ error: 'Not permitted to add assets' });

    const {
      project_id, slno, asset_code, eq_type, manufacturer, model, capacity, uom,
      reg_no, chassis_no, ownership, asset_type, vendor, rate, rate_monthly,
      fuel_type, reading1_basis, reading2_basis, dual_reading,
      fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type,
      date_of_purchase, po_number, price
    } = req.body;

    if (!project_id || !slno || !eq_type) {
      return res.status(400).json({ error: 'project_id, slno, and eq_type are required' });
    }
    if (!shift_type || !['Single Shift', 'Dual Shift'].includes(shift_type)) {
      return res.status(400).json({ error: 'shift_type is required (Single Shift or Dual Shift)' });
    }
    if (ownership === 'Own' && !date_of_purchase) {
      return res.status(400).json({ error: 'date_of_purchase is required for own assets' });
    }

    // Validate equipment type against pre-defined list
    const etCheck = await db.query('SELECT id FROM equipment_types WHERE LOWER(name) = LOWER($1)', [eq_type.trim()]);
    if (etCheck.rows.length === 0) {
      return res.status(400).json({ error: `Equipment type "${eq_type}" is not recognised. Please use a type defined in Admin › Equipment Types.` });
    }

    const result = await db.query(
      `INSERT INTO machines
        (project_id, slno, asset_code, eq_type, manufacturer, model, capacity, uom,
         reg_no, chassis_no, ownership, asset_type, vendor, rate, rate_monthly,
         fuel_type, reading1_basis, reading2_basis, dual_reading,
         fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type,
         date_of_purchase, po_number, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       RETURNING *`,
      [
        project_id, slno.trim(), asset_code?.trim() || null, eq_type.trim(),
        manufacturer || null, model || null,
        capacity || null, uom || null,
        reg_no || null, chassis_no || null,
        ownership || 'Own', asset_type || null,
        vendor || null, rate || null, rate_monthly || null,
        fuel_type || null,
        reading1_basis || 'Hours', reading2_basis || null,
        dual_reading || false,
        fuel_min || null, fuel_max || null,
        fuel_min_km || null, fuel_max_km || null,
        planned_hours || 10, shift_type,
        date_of_purchase || null, po_number || null, price || null
      ]
    );

    // Auto-save vendor to vendor history
    if (ownership === 'Hire' && vendor?.trim()) {
      await db.query('INSERT INTO vendors (name) VALUES ($1) ON CONFLICT DO NOTHING', [vendor.trim()]);
    }

    // Auto-create reading configs from equipment mapping
    await autoCreateReadingConfigs(result.rows[0].id, eq_type.trim());

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Machine SL No already exists in this project' });
    console.error('Create machine error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const bulkCreate = async (req, res) => {
  try {
    if (!canAddAsset(req.user)) return res.status(403).json({ error: 'Not permitted to add assets' });

    const rows = req.body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required' });
    }

    // Load valid equipment types once for validation
    const etRes     = await db.query('SELECT LOWER(name) AS name FROM equipment_types');
    const validTypes = new Set(etRes.rows.map(r => r.name));

    const results = [];
    const errors  = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Validate equipment type
        if (!row.eq_type?.trim()) throw new Error('eq_type is required');
        if (!validTypes.has(row.eq_type.trim().toLowerCase())) {
          throw new Error(`Equipment type "${row.eq_type}" is not recognised. Use a type from Admin › Equipment Types.`);
        }

        // Resolve project_code (or project name) to project_id
        let project_id = row.project_id;
        if (!project_id && row.project_code) {
          const pRes = await db.query(
            'SELECT id FROM projects WHERE code = $1 OR LOWER(name) = LOWER($1)',
            [row.project_code.toString().trim()]
          );
          if (pRes.rows.length === 0) throw new Error(`Project "${row.project_code}" not found`);
          project_id = pRes.rows[0].id;
        }
        if (!project_id) throw new Error('project_code or project_id is required');

        const shift = row.shift_type || 'Single Shift';
        if (!['Single Shift', 'Dual Shift'].includes(shift)) throw new Error(`Invalid shift_type: ${shift}`);

        const slnoTrimmed = row.slno?.toString().trim();

        // Check if this machine already exists (to report created vs updated/reactivated)
        const existsRes = await db.query(
          'SELECT id, active FROM machines WHERE project_id = $1 AND slno = $2',
          [project_id, slnoTrimmed]
        );
        const isNew = existsRes.rows.length === 0;
        const wasInactive = existsRes.rows[0]?.active === false;

        await db.query(
          `INSERT INTO machines
            (project_id, slno, asset_code, eq_type, manufacturer, model, capacity, uom,
             reg_no, chassis_no, ownership, asset_type, vendor, rate, rate_monthly,
             fuel_type, reading1_basis, reading2_basis, dual_reading,
             fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type,
             date_of_purchase, po_number, price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
           ON CONFLICT (project_id, slno) DO UPDATE SET
             asset_code       = EXCLUDED.asset_code,
             eq_type          = EXCLUDED.eq_type,
             manufacturer     = EXCLUDED.manufacturer,
             model            = EXCLUDED.model,
             capacity         = EXCLUDED.capacity,
             uom              = EXCLUDED.uom,
             reg_no           = EXCLUDED.reg_no,
             chassis_no       = EXCLUDED.chassis_no,
             ownership        = EXCLUDED.ownership,
             asset_type       = EXCLUDED.asset_type,
             vendor           = EXCLUDED.vendor,
             rate             = EXCLUDED.rate,
             rate_monthly     = EXCLUDED.rate_monthly,
             fuel_type        = EXCLUDED.fuel_type,
             reading1_basis   = EXCLUDED.reading1_basis,
             reading2_basis   = EXCLUDED.reading2_basis,
             dual_reading     = EXCLUDED.dual_reading,
             fuel_min         = EXCLUDED.fuel_min,
             fuel_max         = EXCLUDED.fuel_max,
             fuel_min_km      = EXCLUDED.fuel_min_km,
             fuel_max_km      = EXCLUDED.fuel_max_km,
             planned_hours      = EXCLUDED.planned_hours,
             shift_type         = EXCLUDED.shift_type,
             date_of_purchase   = EXCLUDED.date_of_purchase,
             po_number          = EXCLUDED.po_number,
             price              = EXCLUDED.price,
             active             = true,
             deactivation_reason = NULL,
             updated_at         = NOW()`,
          [
            project_id, slnoTrimmed, row.asset_code?.toString().trim() || null,
            row.eq_type?.trim(),
            row.manufacturer || null, row.model || null,
            row.capacity || null, row.uom || null,
            row.reg_no || null, row.chassis_no || null,
            row.ownership || 'Own', row.asset_type || null,
            row.vendor || null, row.rate || null, row.rate_monthly || null,
            row.fuel_type || null,
            row.reading1_basis || 'Hours', row.reading2_basis || null,
            row.dual_reading === true || row.dual_reading === 'true',
            row.fuel_min || null, row.fuel_max || null,
            row.fuel_min_km || null, row.fuel_max_km || null,
            row.planned_hours || 10, shift,
            row.date_of_purchase || null, row.po_number || null, row.price || null
          ]
        );
        if (row.ownership === 'Hire' && row.vendor?.trim()) {
          await db.query('INSERT INTO vendors (name) VALUES ($1) ON CONFLICT DO NOTHING', [row.vendor.trim()]);
        }
        // Auto-create reading configs for new or reactivated machines
        if (isNew || wasInactive) {
          await autoCreateReadingConfigs(
            (await db.query('SELECT id FROM machines WHERE project_id = $1 AND slno = $2', [project_id, slnoTrimmed])).rows[0]?.id,
            row.eq_type?.trim()
          );
        }
        results.push({ row: i + 1, slno: slnoTrimmed, status: isNew ? 'created' : wasInactive ? 'reactivated' : 'updated' });
      } catch (err) {
        errors.push({ row: i + 1, slno: row.slno, error: err.message });
      }
    }

    const created     = results.filter(r => r.status === 'created').length;
    const updated     = results.filter(r => r.status === 'updated').length;
    const reactivated = results.filter(r => r.status === 'reactivated').length;
    res.json({ created, updated, reactivated, failed: errors.length, results, errors });
  } catch (err) {
    console.error('Bulk create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      slno, asset_code, eq_type, manufacturer, model, capacity, uom,
      reg_no, chassis_no, ownership, asset_type, vendor, rate, rate_monthly,
      fuel_type, reading1_basis, reading2_basis, dual_reading,
      fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active,
      date_of_purchase, po_number, price
    } = req.body;

    if (shift_type && !['Single Shift', 'Dual Shift'].includes(shift_type)) {
      return res.status(400).json({ error: 'shift_type must be Single Shift or Dual Shift' });
    }

    const result = await db.query(
      `UPDATE machines SET
        slno             = COALESCE($1,  slno),
        asset_code       = COALESCE($2,  asset_code),
        eq_type          = COALESCE($3,  eq_type),
        manufacturer     = COALESCE($4,  manufacturer),
        model            = COALESCE($5,  model),
        capacity         = COALESCE($6,  capacity),
        uom              = COALESCE($7,  uom),
        reg_no           = COALESCE($8,  reg_no),
        chassis_no       = COALESCE($9,  chassis_no),
        ownership        = COALESCE($10, ownership),
        asset_type       = COALESCE($11, asset_type),
        vendor           = COALESCE($12, vendor),
        rate             = COALESCE($13, rate),
        rate_monthly     = COALESCE($14, rate_monthly),
        fuel_type        = COALESCE($15, fuel_type),
        reading1_basis   = COALESCE($16, reading1_basis),
        reading2_basis   = COALESCE($17, reading2_basis),
        dual_reading     = COALESCE($18, dual_reading),
        fuel_min         = COALESCE($19, fuel_min),
        fuel_max         = COALESCE($20, fuel_max),
        fuel_min_km      = COALESCE($21, fuel_min_km),
        fuel_max_km      = COALESCE($22, fuel_max_km),
        planned_hours    = COALESCE($23, planned_hours),
        shift_type       = COALESCE($24, shift_type),
        active           = COALESCE($25, active),
        date_of_purchase = COALESCE($26, date_of_purchase),
        po_number        = COALESCE($27, po_number),
        price            = COALESCE($28, price),
        updated_at       = NOW()
       WHERE id = $29
       RETURNING *`,
      [
        slno || null, asset_code || null, eq_type || null,
        manufacturer || null, model || null,
        capacity || null, uom || null,
        reg_no || null, chassis_no || null,
        ownership || null, asset_type || null,
        vendor || null, rate || null, rate_monthly || null,
        fuel_type || null,
        reading1_basis || null, reading2_basis || null,
        dual_reading !== undefined ? dual_reading : null,
        fuel_min || null, fuel_max || null,
        fuel_min_km || null, fuel_max_km || null,
        planned_hours || null, shift_type || null,
        active !== undefined ? active : null,
        date_of_purchase || null, po_number || null, price || null,
        id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Update machine error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const { reason } = req.body || {};
    await db.query(
      'UPDATE machines SET active = false, deactivation_reason = $1, updated_at = NOW() WHERE id = $2',
      [reason || null, req.params.id]
    );
    res.json({ message: 'Machine deactivated' });
  } catch (err) {
    console.error('Delete machine error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const transfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_project_id, transferred_date } = req.body;
    if (!new_project_id) return res.status(400).json({ error: 'new_project_id is required' });
    if (!transferred_date) return res.status(400).json({ error: 'transferred_date is required' });

    const current = await db.query('SELECT project_id FROM machines WHERE id = $1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
    if (current.rows[0].project_id === parseInt(new_project_id)) {
      return res.status(400).json({ error: 'Machine is already assigned to that project' });
    }

    const result = await db.query(
      `UPDATE machines SET project_id = $1, transferred_from_project_id = $2, transferred_date = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
      [new_project_id, current.rows[0].project_id, transferred_date, id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Transfer machine error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const hardDelete = async (req, res) => {
  try {
    const { id } = req.params;
    // Related tables (dpr_entries, fuel_entries, service_entries, breakdown_incidents,
    // spare_transactions, attendance) all use ON DELETE SET NULL, so deleting the machine
    // row auto-nulls those FK references while preserving snapshot data.
    const result = await db.query('DELETE FROM machines WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
    res.json({ message: 'Machine permanently deleted' });
  } catch (err) {
    console.error('Hard delete machine error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const fleetSummary = async (req, res) => {
  try {
    const { date, project_code } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const params = [targetDate];
    let extraFilters = '';

    if (project_code) {
      params.push(project_code);
      extraFilters += ` AND p.code = $${params.length}`;
    }
    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      params.push(req.user.project_codes);
      extraFilters += ` AND p.code = ANY($${params.length})`;
    }

    const result = await db.query(`
      SELECT
        COALESCE(m.asset_type, 'Unclassified') AS asset_type,
        CASE
          WHEN e.id IS NULL                         THEN 'Not Deployed'
          WHEN COALESCE(e.breakdown, 0) > 0         THEN 'Breakdown'
          WHEN COALESCE(e.working_hours, 0) > 0     THEN 'Active'
          ELSE 'Idle'
        END AS status,
        COUNT(*)::int AS count
      FROM machines m
      JOIN projects p ON m.project_id = p.id
      LEFT JOIN (
        SELECT DISTINCT ON (machine_id) id, machine_id, breakdown, working_hours
        FROM dpr_entries
        WHERE entry_date = $1
        ORDER BY machine_id, id DESC
      ) e ON e.machine_id = m.id
      WHERE m.active = true ${extraFilters}
      GROUP BY m.asset_type, status
      ORDER BY m.asset_type, status
    `, params);

    res.json({ data: result.rows, date: targetDate });
  } catch (err) {
    console.error('Fleet summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, update, remove, transfer, hardDelete, bulkCreate, fleetSummary };
