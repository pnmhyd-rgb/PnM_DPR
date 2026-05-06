const db = require('../config/db');

const FULL_FIELDS = `
  m.*, p.code AS project_code, p.name AS project_name
`;

const getAll = async (req, res) => {
  try {
    const { project_id, project_code } = req.query;
    let query = `SELECT ${FULL_FIELDS} FROM machines m JOIN projects p ON m.project_id = p.id WHERE m.active = true`;
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
      project_id, slno, eq_type, manufacturer, model, capacity, uom,
      reg_no, chassis_no, ownership, asset_type, vendor,
      fuel_type, reading1_basis, reading2_basis, dual_reading,
      fuel_min, fuel_max, planned_hours, shift_type,
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

    const result = await db.query(
      `INSERT INTO machines
        (project_id, slno, eq_type, manufacturer, model, capacity, uom,
         reg_no, chassis_no, ownership, asset_type, vendor,
         fuel_type, reading1_basis, reading2_basis, dual_reading,
         fuel_min, fuel_max, planned_hours, shift_type,
         date_of_purchase, po_number, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [
        project_id, slno.trim(), eq_type.trim(),
        manufacturer || null, model || null,
        capacity || null, uom || null,
        reg_no || null, chassis_no || null,
        ownership || 'Own', asset_type || null,
        vendor || null, fuel_type || null,
        reading1_basis || 'Hours', reading2_basis || null,
        dual_reading || false,
        fuel_min || null, fuel_max || null,
        planned_hours || 10, shift_type,
        date_of_purchase || null, po_number || null, price || null
      ]
    );

    // Auto-save vendor to vendor history
    if (ownership === 'Hire' && vendor?.trim()) {
      await db.query(
        'INSERT INTO vendors (name) VALUES ($1) ON CONFLICT DO NOTHING',
        [vendor.trim()]
      );
    }

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

    const results = [];
    const errors  = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Resolve project_code to project_id
        let project_id = row.project_id;
        if (!project_id && row.project_code) {
          const pRes = await db.query('SELECT id FROM projects WHERE code = $1', [row.project_code]);
          if (pRes.rows.length === 0) throw new Error(`Project "${row.project_code}" not found`);
          project_id = pRes.rows[0].id;
        }
        if (!project_id) throw new Error('project_code or project_id is required');

        const shift = row.shift_type || 'Single Shift';
        if (!['Single Shift', 'Dual Shift'].includes(shift)) throw new Error(`Invalid shift_type: ${shift}`);

        const r = await db.query(
          `INSERT INTO machines
            (project_id, slno, eq_type, manufacturer, model, capacity, uom,
             reg_no, chassis_no, ownership, asset_type, vendor,
             fuel_type, reading1_basis, reading2_basis, dual_reading,
             fuel_min, fuel_max, planned_hours, shift_type,
             date_of_purchase, po_number, price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
           RETURNING slno`,
          [
            project_id, row.slno?.toString().trim(), row.eq_type?.trim(),
            row.manufacturer || null, row.model || null,
            row.capacity || null, row.uom || null,
            row.reg_no || null, row.chassis_no || null,
            row.ownership || 'Own', row.asset_type || null,
            row.vendor || null, row.fuel_type || null,
            row.reading1_basis || 'Hours', row.reading2_basis || null,
            row.dual_reading === true || row.dual_reading === 'true',
            row.fuel_min || null, row.fuel_max || null,
            row.planned_hours || 10, shift,
            row.date_of_purchase || null, row.po_number || null, row.price || null
          ]
        );
        if (row.ownership === 'Hire' && row.vendor?.trim()) {
          await db.query('INSERT INTO vendors (name) VALUES ($1) ON CONFLICT DO NOTHING', [row.vendor.trim()]);
        }
        results.push({ row: i + 1, slno: r.rows[0].slno, status: 'created' });
      } catch (err) {
        errors.push({ row: i + 1, slno: row.slno, error: err.message });
      }
    }

    res.json({ created: results.length, failed: errors.length, results, errors });
  } catch (err) {
    console.error('Bulk create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      slno, eq_type, manufacturer, model, capacity, uom,
      reg_no, chassis_no, ownership, asset_type, vendor,
      fuel_type, reading1_basis, reading2_basis, dual_reading,
      fuel_min, fuel_max, planned_hours, shift_type, active,
      date_of_purchase, po_number, price
    } = req.body;

    if (shift_type && !['Single Shift', 'Dual Shift'].includes(shift_type)) {
      return res.status(400).json({ error: 'shift_type must be Single Shift or Dual Shift' });
    }

    const result = await db.query(
      `UPDATE machines SET
        slno             = COALESCE($1,  slno),
        eq_type          = COALESCE($2,  eq_type),
        manufacturer     = COALESCE($3,  manufacturer),
        model            = COALESCE($4,  model),
        capacity         = COALESCE($5,  capacity),
        uom              = COALESCE($6,  uom),
        reg_no           = COALESCE($7,  reg_no),
        chassis_no       = COALESCE($8,  chassis_no),
        ownership        = COALESCE($9,  ownership),
        asset_type       = COALESCE($10, asset_type),
        vendor           = COALESCE($11, vendor),
        fuel_type        = COALESCE($12, fuel_type),
        reading1_basis   = COALESCE($13, reading1_basis),
        reading2_basis   = COALESCE($14, reading2_basis),
        dual_reading     = COALESCE($15, dual_reading),
        fuel_min         = COALESCE($16, fuel_min),
        fuel_max         = COALESCE($17, fuel_max),
        planned_hours    = COALESCE($18, planned_hours),
        shift_type       = COALESCE($19, shift_type),
        active           = COALESCE($20, active),
        date_of_purchase = COALESCE($21, date_of_purchase),
        po_number        = COALESCE($22, po_number),
        price            = COALESCE($23, price),
        updated_at       = NOW()
       WHERE id = $24
       RETURNING *`,
      [
        slno || null, eq_type || null,
        manufacturer || null, model || null,
        capacity || null, uom || null,
        reg_no || null, chassis_no || null,
        ownership || null, asset_type || null,
        vendor || null, fuel_type || null,
        reading1_basis || null, reading2_basis || null,
        dual_reading !== undefined ? dual_reading : null,
        fuel_min || null, fuel_max || null,
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
    await db.query('UPDATE machines SET active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Machine deactivated' });
  } catch (err) {
    console.error('Delete machine error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, update, remove, bulkCreate };
