const db = require('../config/db');

// GET /invoice-rules
const getAll = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT r.*,
             a.excess_days_applicable, a.day_threshold, a.day_excess_rate,
             a.excess_hours_applicable, a.hour_threshold, a.hour_excess_rate,
             a.maintenance_applicable, a.allowed_maintenance_days, a.maintenance_excess_rate,
             a.weekly_off_applicable, a.weekly_off_count, a.weekly_off_charges,
             a.productivity_applicable, a.productivity_target, a.productivity_excess_charges,
             d.breakdown_applicable, d.breakdown_days, d.breakdown_deduction_rate,
             d.fuel_applicable, d.fuel_performance_type, d.approved_mileage,
             d.approved_fuel_consumption, d.fuel_deduction_rate,
             m.slno       AS machine_slno,
             m.nickname   AS machine_nickname,
             m.vendor     AS machine_vendor,
             m.eq_type    AS machine_eq_type,
             m.project_id AS machine_project_id,
             (
               SELECT COUNT(DISTINCT i.machine_id)
                 FROM hire_wo_items i
                WHERE i.invoice_rule_id = r.id
                  AND i.machine_id IS NOT NULL
             ) AS linked_assets
        FROM invoice_rules r
        LEFT JOIN invoice_rule_additions  a ON a.rule_id = r.id
        LEFT JOIN invoice_rule_deductions d ON d.rule_id = r.id
        LEFT JOIN machines                m ON m.id = r.machine_id
       WHERE r.active = true
       ORDER BY r.rule_number
    `);

    const ids = result.rows.map(r => r.id);
    let otherCharges = [];
    if (ids.length > 0) {
      const oc = await db.query(
        'SELECT * FROM invoice_rule_other_charges WHERE rule_id = ANY($1) ORDER BY sort_order, id',
        [ids]
      );
      otherCharges = oc.rows;
    }

    const rows = result.rows.map(r => ({
      ...r,
      other_charges: otherCharges.filter(oc => oc.rule_id === r.id),
    }));

    res.json({ data: rows });
  } catch (err) {
    console.error('getAll invoiceRules error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /invoice-rules/:id
const getOne = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      SELECT r.*,
             a.excess_days_applicable, a.day_threshold, a.day_excess_rate,
             a.excess_hours_applicable, a.hour_threshold, a.hour_excess_rate,
             a.maintenance_applicable, a.allowed_maintenance_days, a.maintenance_excess_rate,
             a.weekly_off_applicable, a.weekly_off_count, a.weekly_off_charges,
             a.productivity_applicable, a.productivity_target, a.productivity_excess_charges,
             d.breakdown_applicable, d.breakdown_days, d.breakdown_deduction_rate,
             d.fuel_applicable, d.fuel_performance_type, d.approved_mileage,
             d.approved_fuel_consumption, d.fuel_deduction_rate
        FROM invoice_rules r
        LEFT JOIN invoice_rule_additions  a ON a.rule_id = r.id
        LEFT JOIN invoice_rule_deductions d ON d.rule_id = r.id
       WHERE r.id = $1
    `, [id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const oc = await db.query(
      'SELECT * FROM invoice_rule_other_charges WHERE rule_id = $1 ORDER BY sort_order, id',
      [id]
    );

    res.json({ data: { ...result.rows[0], other_charges: oc.rows } });
  } catch (err) {
    console.error('getOne invoiceRule error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /invoice-rules
const create = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const {
      rule_number, rule_name, description, basic_rate, days, adjust_calendar_days,
      hours, hours_rate, planned_km, km_rate,
      machine_id, ownership_vendor,
      // additions
      excess_days_applicable, day_threshold, day_excess_rate,
      excess_hours_applicable, hour_threshold, hour_excess_rate,
      maintenance_applicable, allowed_maintenance_days, maintenance_excess_rate,
      weekly_off_applicable, weekly_off_count, weekly_off_charges,
      productivity_applicable, productivity_target, productivity_excess_charges,
      // other charges
      other_charges = [],
      // deductions
      breakdown_applicable, breakdown_days, breakdown_deduction_rate,
      fuel_applicable, fuel_performance_type, approved_mileage,
      approved_fuel_consumption, fuel_deduction_rate,
    } = req.body;

    if (!rule_number || !rule_name || !basic_rate || !days) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'rule_number, rule_name, basic_rate and days are required' });
    }

    // Validate machine-ownership link when machine_id is supplied
    const resolvedMachineId = machine_id ? parseInt(machine_id) : null;
    if (resolvedMachineId) {
      const mRes = await client.query(
        'SELECT id, vendor, ownership FROM machines WHERE id = $1 AND active = true',
        [resolvedMachineId]
      );
      if (!mRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selected asset not found or inactive' });
      }
      const machOwnership = mRes.rows[0].ownership;
      // For Hire machines: vendor name must match
      if (machOwnership === 'Hire' && ownership_vendor && ownership_vendor !== 'Own') {
        if ((mRes.rows[0].vendor || '').toLowerCase() !== ownership_vendor.toLowerCase()) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Selected asset does not belong to the selected ownership' });
        }
      }
      // For Own machines: ownership_vendor must be 'Own'
      if (machOwnership === 'Own' && ownership_vendor && ownership_vendor !== 'Own') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selected asset is an own-fleet asset; set Ownership to "Own"' });
      }
    }

    const ruleRes = await client.query(`
      INSERT INTO invoice_rules (rule_number, rule_name, description, basic_rate, days, adjust_calendar_days,
        hours, hours_rate, planned_km, km_rate, machine_id, ownership_vendor, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *
    `, [rule_number, rule_name, description || null, parseFloat(basic_rate), parseInt(days),
        adjust_calendar_days ?? false,
        hours ? parseFloat(hours) : null,
        hours_rate ? parseFloat(hours_rate) : null,
        planned_km ? parseFloat(planned_km) : null,
        km_rate ? parseFloat(km_rate) : null,
        resolvedMachineId,
        ownership_vendor || null,
        req.user.id]);

    const rule = ruleRes.rows[0];

    await client.query(`
      INSERT INTO invoice_rule_additions (
        rule_id,
        excess_days_applicable, day_threshold, day_excess_rate,
        excess_hours_applicable, hour_threshold, hour_excess_rate,
        maintenance_applicable, allowed_maintenance_days, maintenance_excess_rate,
        weekly_off_applicable, weekly_off_count, weekly_off_charges,
        productivity_applicable, productivity_target, productivity_excess_charges
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    `, [
      rule.id,
      excess_days_applicable ?? true,
      day_threshold ? parseFloat(day_threshold) : null,
      day_excess_rate ? parseFloat(day_excess_rate) : null,
      excess_hours_applicable ?? false,
      hour_threshold ? parseFloat(hour_threshold) : null,
      hour_excess_rate ? parseFloat(hour_excess_rate) : null,
      maintenance_applicable ?? false,
      allowed_maintenance_days ? parseInt(allowed_maintenance_days) : null,
      maintenance_excess_rate ? parseFloat(maintenance_excess_rate) : null,
      weekly_off_applicable ?? false,
      weekly_off_count ? parseInt(weekly_off_count) : null,
      weekly_off_charges ? parseFloat(weekly_off_charges) : null,
      productivity_applicable ?? false,
      productivity_target ? parseFloat(productivity_target) : null,
      productivity_excess_charges ? parseFloat(productivity_excess_charges) : null,
    ]);

    await client.query(`
      INSERT INTO invoice_rule_deductions (
        rule_id, breakdown_applicable, breakdown_days, breakdown_deduction_rate,
        fuel_applicable, fuel_performance_type, approved_mileage,
        approved_fuel_consumption, fuel_deduction_rate
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      rule.id,
      breakdown_applicable ?? false,
      breakdown_days ? parseInt(breakdown_days) : 0,
      breakdown_deduction_rate ? parseFloat(breakdown_deduction_rate) : null,
      fuel_applicable ?? false,
      fuel_performance_type || 'economy',
      approved_mileage ? parseFloat(approved_mileage) : null,
      approved_fuel_consumption ? parseFloat(approved_fuel_consumption) : null,
      fuel_deduction_rate ? parseFloat(fuel_deduction_rate) : null,
    ]);

    for (let i = 0; i < other_charges.length; i++) {
      const oc = other_charges[i];
      if (!oc.charge_name) continue;
      await client.query(
        'INSERT INTO invoice_rule_other_charges (rule_id, charge_name, amount, calc_type, sort_order) VALUES ($1,$2,$3,$4,$5)',
        [rule.id, oc.charge_name, parseFloat(oc.amount) || 0, oc.calc_type || 'fixed', i]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ data: rule });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Rule number already exists' });
    console.error('create invoiceRule error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
};

// PUT /invoice-rules/:id
const update = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const {
      rule_number, rule_name, description, basic_rate, days, adjust_calendar_days,
      hours, hours_rate, planned_km, km_rate,
      machine_id, ownership_vendor,
      excess_days_applicable, day_threshold, day_excess_rate,
      excess_hours_applicable, hour_threshold, hour_excess_rate,
      maintenance_applicable, allowed_maintenance_days, maintenance_excess_rate,
      weekly_off_applicable, weekly_off_count, weekly_off_charges,
      productivity_applicable, productivity_target, productivity_excess_charges,
      other_charges = [],
      breakdown_applicable, breakdown_days, breakdown_deduction_rate,
      fuel_applicable, fuel_performance_type, approved_mileage,
      approved_fuel_consumption, fuel_deduction_rate,
    } = req.body;

    // Validate machine-ownership link when machine_id is supplied
    const resolvedMachineId = machine_id ? parseInt(machine_id) : null;
    if (resolvedMachineId) {
      const mRes = await client.query(
        'SELECT id, vendor, ownership FROM machines WHERE id = $1 AND active = true',
        [resolvedMachineId]
      );
      if (!mRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selected asset not found or inactive' });
      }
      const machOwnership = mRes.rows[0].ownership;
      if (machOwnership === 'Hire' && ownership_vendor && ownership_vendor !== 'Own') {
        if ((mRes.rows[0].vendor || '').toLowerCase() !== ownership_vendor.toLowerCase()) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Selected asset does not belong to the selected ownership' });
        }
      }
      if (machOwnership === 'Own' && ownership_vendor && ownership_vendor !== 'Own') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selected asset is an own-fleet asset; set Ownership to "Own"' });
      }
    }

    await client.query(`
      UPDATE invoice_rules SET rule_number=$1, rule_name=$2, description=$3,
        basic_rate=$4, days=$5, adjust_calendar_days=$6,
        hours=$7, hours_rate=$8, planned_km=$9, km_rate=$10,
        machine_id=$11, ownership_vendor=$12, updated_at=NOW()
      WHERE id=$13
    `, [rule_number, rule_name, description || null, parseFloat(basic_rate), parseInt(days),
        adjust_calendar_days ?? false,
        hours ? parseFloat(hours) : null,
        hours_rate ? parseFloat(hours_rate) : null,
        planned_km ? parseFloat(planned_km) : null,
        km_rate ? parseFloat(km_rate) : null,
        resolvedMachineId,
        ownership_vendor || null,
        id]);

    await client.query(`
      INSERT INTO invoice_rule_additions (
        rule_id, excess_days_applicable, day_threshold, day_excess_rate,
        excess_hours_applicable, hour_threshold, hour_excess_rate,
        maintenance_applicable, allowed_maintenance_days, maintenance_excess_rate,
        weekly_off_applicable, weekly_off_count, weekly_off_charges,
        productivity_applicable, productivity_target, productivity_excess_charges
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (rule_id) DO UPDATE SET
        excess_days_applicable=EXCLUDED.excess_days_applicable,
        day_threshold=EXCLUDED.day_threshold, day_excess_rate=EXCLUDED.day_excess_rate,
        excess_hours_applicable=EXCLUDED.excess_hours_applicable,
        hour_threshold=EXCLUDED.hour_threshold, hour_excess_rate=EXCLUDED.hour_excess_rate,
        maintenance_applicable=EXCLUDED.maintenance_applicable,
        allowed_maintenance_days=EXCLUDED.allowed_maintenance_days,
        maintenance_excess_rate=EXCLUDED.maintenance_excess_rate,
        weekly_off_applicable=EXCLUDED.weekly_off_applicable,
        weekly_off_count=EXCLUDED.weekly_off_count, weekly_off_charges=EXCLUDED.weekly_off_charges,
        productivity_applicable=EXCLUDED.productivity_applicable,
        productivity_target=EXCLUDED.productivity_target,
        productivity_excess_charges=EXCLUDED.productivity_excess_charges
    `, [
      id,
      excess_days_applicable ?? true,
      day_threshold ? parseFloat(day_threshold) : null,
      day_excess_rate ? parseFloat(day_excess_rate) : null,
      excess_hours_applicable ?? false,
      hour_threshold ? parseFloat(hour_threshold) : null,
      hour_excess_rate ? parseFloat(hour_excess_rate) : null,
      maintenance_applicable ?? false,
      allowed_maintenance_days ? parseInt(allowed_maintenance_days) : null,
      maintenance_excess_rate ? parseFloat(maintenance_excess_rate) : null,
      weekly_off_applicable ?? false,
      weekly_off_count ? parseInt(weekly_off_count) : null,
      weekly_off_charges ? parseFloat(weekly_off_charges) : null,
      productivity_applicable ?? false,
      productivity_target ? parseFloat(productivity_target) : null,
      productivity_excess_charges ? parseFloat(productivity_excess_charges) : null,
    ]);

    await client.query(`
      INSERT INTO invoice_rule_deductions (
        rule_id, breakdown_applicable, breakdown_days, breakdown_deduction_rate,
        fuel_applicable, fuel_performance_type, approved_mileage,
        approved_fuel_consumption, fuel_deduction_rate
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (rule_id) DO UPDATE SET
        breakdown_applicable=EXCLUDED.breakdown_applicable,
        breakdown_days=EXCLUDED.breakdown_days,
        breakdown_deduction_rate=EXCLUDED.breakdown_deduction_rate,
        fuel_applicable=EXCLUDED.fuel_applicable,
        fuel_performance_type=EXCLUDED.fuel_performance_type,
        approved_mileage=EXCLUDED.approved_mileage,
        approved_fuel_consumption=EXCLUDED.approved_fuel_consumption,
        fuel_deduction_rate=EXCLUDED.fuel_deduction_rate
    `, [
      id,
      breakdown_applicable ?? false,
      breakdown_days ? parseInt(breakdown_days) : 0,
      breakdown_deduction_rate ? parseFloat(breakdown_deduction_rate) : null,
      fuel_applicable ?? false,
      fuel_performance_type || 'economy',
      approved_mileage ? parseFloat(approved_mileage) : null,
      approved_fuel_consumption ? parseFloat(approved_fuel_consumption) : null,
      fuel_deduction_rate ? parseFloat(fuel_deduction_rate) : null,
    ]);

    await client.query('DELETE FROM invoice_rule_other_charges WHERE rule_id=$1', [id]);
    for (let i = 0; i < other_charges.length; i++) {
      const oc = other_charges[i];
      if (!oc.charge_name) continue;
      await client.query(
        'INSERT INTO invoice_rule_other_charges (rule_id, charge_name, amount, calc_type, sort_order) VALUES ($1,$2,$3,$4,$5)',
        [id, oc.charge_name, parseFloat(oc.amount) || 0, oc.calc_type || 'fixed', i]
      );
    }

    await client.query('COMMIT');
    res.json({ data: { id } });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Rule number already exists' });
    console.error('update invoiceRule error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

// DELETE /invoice-rules/:id (soft delete)
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE invoice_rules SET active=false, updated_at=NOW() WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('remove invoiceRule error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /invoice-rules/bulk  — create one rule per selected machine in a single transaction
// Body: { ownership_vendor, link_wo, machines:[{ machine_id, basic_rate, wo_item_id? }], shared:{days,...} }
const bulkCreate = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { ownership_vendor, link_wo = false, machines = [], shared = {} } = req.body;

    if (!ownership_vendor) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'ownership_vendor is required' });
    }
    if (!machines.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'At least one asset must be selected' });
    }
    if (!shared.days || parseInt(shared.days) < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Days is required in shared configuration' });
    }

    // Compute next rule number starting point
    const maxRes = await client.query(`
      SELECT COALESCE(MAX(
        CASE WHEN rule_number ~ '^IR-[0-9]+$'
             THEN CAST(SUBSTRING(rule_number FROM 4) AS INTEGER)
             ELSE 0 END
      ), 0) AS max_num FROM invoice_rules
    `);
    let nextNum = parseInt(maxRes.rows[0].max_num) + 1;

    const created = [];
    let linkedWO  = 0;

    for (const item of machines) {
      const mid = parseInt(item.machine_id);
      if (!mid) continue;

      // Validate machine exists and matches ownership
      const mRes = await client.query(
        'SELECT id, slno, eq_type, vendor, ownership FROM machines WHERE id=$1 AND active=true',
        [mid]
      );
      if (!mRes.rows[0]) throw new Error(`Asset ID ${mid} not found or inactive`);
      const m = mRes.rows[0];

      if (m.ownership === 'Hire' && ownership_vendor !== 'Own') {
        if ((m.vendor || '').toLowerCase() !== ownership_vendor.toLowerCase())
          throw new Error(`Asset ${m.slno} does not belong to ${ownership_vendor}`);
      }
      if (m.ownership === 'Own' && ownership_vendor !== 'Own')
        throw new Error(`Asset ${m.slno} is own-fleet; set Ownership to "Own"`);

      const rule_number = `IR-${String(nextNum).padStart(3, '0')}`;
      const rule_name   = item.rule_name ||
        `${ownership_vendor === 'Own' ? 'Own' : ownership_vendor} – ${m.slno}${m.eq_type ? ` (${m.eq_type})` : ''}`.trim();
      const basic_rate  = parseFloat(item.basic_rate) || 0;

      const ruleRes = await client.query(`
        INSERT INTO invoice_rules (
          rule_number, rule_name, basic_rate, days, adjust_calendar_days,
          hours, hours_rate, planned_km, km_rate,
          machine_id, ownership_vendor, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, rule_number
      `, [
        rule_number, rule_name, basic_rate,
        parseInt(shared.days), shared.adjust_calendar_days ?? false,
        shared.hours    ? parseFloat(shared.hours)    : null,
        shared.hours_rate ? parseFloat(shared.hours_rate) : null,
        shared.planned_km ? parseFloat(shared.planned_km) : null,
        shared.km_rate  ? parseFloat(shared.km_rate)  : null,
        mid, ownership_vendor, req.user.id,
      ]);
      const rule = ruleRes.rows[0];

      await client.query(`
        INSERT INTO invoice_rule_additions (
          rule_id,
          excess_days_applicable, maintenance_applicable, allowed_maintenance_days,
          maintenance_excess_rate, weekly_off_applicable, productivity_applicable
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [
        rule.id,
        true,
        shared.maintenance_applicable ?? false,
        shared.allowed_maintenance_days ? parseInt(shared.allowed_maintenance_days) : null,
        shared.maintenance_excess_rate  ? parseFloat(shared.maintenance_excess_rate) : null,
        false, false,
      ]);

      // Per-machine fuel/breakdown (item values take priority over shared fallback)
      const fuelOn  = item.fuel_applicable ?? false;
      const fuelType = item.fuel_performance_type || 'economy';
      await client.query(`
        INSERT INTO invoice_rule_deductions (
          rule_id, breakdown_applicable, breakdown_days, breakdown_deduction_rate,
          fuel_applicable, fuel_performance_type, approved_mileage,
          approved_fuel_consumption, fuel_deduction_rate
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        rule.id,
        item.breakdown_applicable ?? false, 0, null,
        fuelOn,
        fuelType,
        fuelOn && fuelType === 'economy'      ? (item.approved_mileage           ? parseFloat(item.approved_mileage)           : null) : null,
        fuelOn && fuelType === 'consumption'  ? (item.approved_fuel_consumption  ? parseFloat(item.approved_fuel_consumption)  : null) : null,
        fuelOn                                ? (item.fuel_deduction_rate        ? parseFloat(item.fuel_deduction_rate)        : null) : null,
      ]);

      // Link to hire WO item if requested
      if (link_wo && item.wo_item_id) {
        await client.query(
          'UPDATE hire_wo_items SET invoice_rule_id=$1 WHERE id=$2',
          [rule.id, parseInt(item.wo_item_id)]
        );
        linkedWO++;
      }

      created.push({ id: rule.id, rule_number, machine_id: mid, machine_slno: m.slno, basic_rate });
      nextNum++;
    }

    await client.query('COMMIT');
    res.status(201).json({ created: created.length, linked_wo: linkedWO, rules: created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('bulkCreate invoiceRules error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
};

module.exports = { getAll, getOne, create, update, remove, bulkCreate };
