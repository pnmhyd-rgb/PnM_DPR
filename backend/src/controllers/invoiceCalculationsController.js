const db = require('../config/db');

// GET  /invoice-calculations/direct-preview?machine_ids=1,2&rule_id=5&from=&to=
// POST /invoice-calculations/direct-preview  body: { machine_rules:[{machine_id,rule_id}], from, to }
const getDirectPreview = async (req, res) => {
  try {
    let machineRuleMap = {};   // { machineId -> ruleId }
    let ids  = [];
    let from, to;

    if (req.method === 'POST') {
      const { machine_rules, from: f, to: t } = req.body;
      from = f; to = t;
      if (!machine_rules || !machine_rules.length || !from || !to) {
        return res.status(400).json({ error: 'machine_rules, from and to are required' });
      }
      machine_rules.forEach(mr => {
        machineRuleMap[parseInt(mr.machine_id)] = parseInt(mr.rule_id);
        ids.push(parseInt(mr.machine_id));
      });
    } else {
      const { machine_ids, rule_id, from: f, to: t } = req.query;
      from = f; to = t;
      if (!machine_ids || !rule_id || !from || !to) {
        return res.status(400).json({ error: 'machine_ids, rule_id, from and to are required' });
      }
      ids = machine_ids.split(',').map(id => parseInt(id.trim())).filter(Boolean);
      ids.forEach(id => { machineRuleMap[id] = parseInt(rule_id); });
    }
    if (ids.length === 0) return res.status(400).json({ error: 'No valid machine IDs' });

    const fromDate = new Date(from);
    const toDate   = new Date(to);
    const calDays  = Math.round((toDate - fromDate) / 86400000) + 1;

    // Cache rule fetches — avoid re-querying same rule for each machine
    const ruleCache = {};
    const fetchRule = async (rId) => {
      if (ruleCache[rId]) return ruleCache[rId];
      const r = await db.query(`
        SELECT rule.*,
               a.maintenance_applicable, a.allowed_maintenance_days, a.maintenance_excess_rate,
               d.breakdown_applicable, d.fuel_applicable, d.fuel_performance_type,
               d.approved_mileage, d.approved_fuel_consumption, d.fuel_deduction_rate
          FROM invoice_rules rule
          LEFT JOIN invoice_rule_additions  a ON a.rule_id = rule.id
          LEFT JOIN invoice_rule_deductions d ON d.rule_id = rule.id
         WHERE rule.id = $1 AND rule.active = true
      `, [rId]);
      if (!r.rows[0]) throw new Error(`Invoice rule ${rId} not found or inactive`);
      ruleCache[rId] = r.rows[0];
      return r.rows[0];
    };

    // Pre-fetch all unique rules in parallel
    const uniqueRuleIds = [...new Set(Object.values(machineRuleMap))];
    await Promise.all(uniqueRuleIds.map(fetchRule));

    // The "primary" rule for the bill header (first machine's rule)
    const primaryRule = ruleCache[machineRuleMap[ids[0]]];

    // Fetch machines
    const machRes = await db.query(`
      SELECT m.id, m.slno, m.nickname, m.eq_type, m.project_id,
             m.ownership, m.vendor AS machine_vendor,
             et.name AS eq_type_name,
             p.code AS project_code, p.name AS project_name
        FROM machines m
        LEFT JOIN equipment_types et ON LOWER(et.name) = LOWER(m.eq_type)
        LEFT JOIN projects p ON p.id = m.project_id
       WHERE m.id = ANY($1)
    `, [ids]);

    const machines = [];
    for (const m of machRes.rows) {
      // Fetch active work order for this machine
      const woRes = await db.query(`
        SELECT w.id AS wo_id, w.wo_number, w.wo_date, hv.name AS vendor_name
          FROM hire_work_orders w
          JOIN hire_wo_items i ON i.wo_id = w.id AND i.machine_id = $1
          LEFT JOIN hire_vendors hv ON hv.id = w.vendor_id
         WHERE w.status NOT IN ('draft','rejected')
         ORDER BY w.wo_date DESC
         LIMIT 1
      `, [m.id]);
      const wo = woRes.rows[0] || null;

      const dpr = await db.query(`
        SELECT COUNT(DISTINCT entry_date)                               AS working_days,
               COALESCE(SUM(hsd), 0)                                   AS diesel_qty,
               COALESCE(SUM(working_hours), 0)                         AS actual_hours,
               COALESCE(SUM(r2_total), 0)                              AS actual_km,
               COALESCE(SUM(r1_total), 0)                              AS cubic_meter_qty,
               COUNT(DISTINCT entry_date) FILTER (WHERE breakdown > 0) AS breakdown_days
          FROM dpr_entries
         WHERE machine_id = $1
           AND entry_date BETWEEN $2::date AND $3::date
           AND status = 'submitted'
      `, [m.id, from, to]);

      const d = dpr.rows[0] || {};
      const dprData = {
        working_days:    parseInt(d.working_days)    || 0,
        diesel_qty:      parseFloat(d.diesel_qty)    || 0,
        actual_hours:    parseFloat(d.actual_hours)  || 0,
        actual_km:       parseFloat(d.actual_km)     || 0,
        cubic_meter_qty: parseFloat(d.cubic_meter_qty) || 0,
        breakdown_days:  parseInt(d.breakdown_days)  || 0,
      };

      // Use this machine's own rule
      const rule = ruleCache[machineRuleMap[m.id]];

      const monthlyRate   = parseFloat(rule.basic_rate) || 0;
      const hireAmount    = calDays > 0 ? (monthlyRate / calDays) * dprData.working_days : 0;
      const ruleDays      = parseInt(rule.days) || 30;
      const plannedHrs    = rule.hours      ? (parseFloat(rule.hours)      / ruleDays) * calDays : 0;
      const plannedKm     = rule.planned_km ? (parseFloat(rule.planned_km) / ruleDays) * calDays : 0;
      const useKm         = plannedKm > 0;
      const utilPct       = useKm
        ? (plannedKm  > 0 ? (dprData.actual_km    / plannedKm)  * 100 : 0)
        : (plannedHrs > 0 ? (dprData.actual_hours / plannedHrs) * 100 : 0);

      // Maintenance deduction
      const allowedMaintDays = parseInt(rule.allowed_maintenance_days) || 0;
      const excessDays       = Math.max(0, dprData.breakdown_days - allowedMaintDays);
      const dailyRate        = calDays > 0 ? monthlyRate / calDays : 0;
      const excessRate       = parseFloat(rule.maintenance_excess_rate) || dailyRate;
      const maintDeduction   = rule.maintenance_applicable ? Math.round(excessDays * excessRate * 100) / 100 : 0;

      // Fuel deduction
      let fuelDeduction = 0;
      if (rule.fuel_applicable) {
        const fuelRate = parseFloat(rule.fuel_deduction_rate) || 0;
        if (rule.fuel_performance_type === 'consumption') {
          const allowed = dprData.actual_hours * (parseFloat(rule.approved_fuel_consumption) || 0);
          fuelDeduction = Math.round(Math.max(0, dprData.diesel_qty - allowed) * fuelRate * 100) / 100;
        } else {
          const mileage = parseFloat(rule.approved_mileage) || 0;
          const allowed = mileage > 0 ? dprData.actual_km / mileage : 0;
          fuelDeduction = Math.round(Math.max(0, dprData.diesel_qty - allowed) * fuelRate * 100) / 100;
        }
      }

      machines.push({
        machine_id:               m.id,
        project_id:               m.project_id || null,
        project_code:             m.project_code || '',
        project_name:             m.project_name || '',
        reg_no:                   m.slno || '',
        description:              m.nickname || m.slno || '',
        eq_type_name:             m.eq_type_name || '',
        ownership:                m.ownership || 'Hire',
        machine_vendor:           m.machine_vendor || '',
        wo_id:                    wo ? wo.wo_id : null,
        wo_number:                wo ? wo.wo_number : null,
        wo_date:                  wo ? wo.wo_date : null,
        wo_vendor_name:           wo ? wo.vendor_name : null,
        unit:                     'Month',
        rule_id:                  rule.id,
        rule_name:                rule.rule_name,
        rule_number:              rule.rule_number,
        monthly_rate:             monthlyRate,
        cal_days:                 calDays,
        working_days:             dprData.working_days,
        hire_amount:              Math.round(hireAmount * 100) / 100,
        diesel_qty:               dprData.diesel_qty,
        diesel_rate:              0,
        diesel_amount:            0,
        total_hire_diesel:        Math.round(hireAmount * 100) / 100,
        cubic_meter_qty:          dprData.cubic_meter_qty,
        cost_per_cum:             0,
        actual_hours:             dprData.actual_hours,
        actual_km:                dprData.actual_km,
        planned_hrs_month:        plannedHrs,
        planned_km_month:         plannedKm,
        util_mode:                useKm ? 'km' : 'hours',
        utilization_pct:          Math.round(utilPct * 100) / 100,
        breakdown_days:           dprData.breakdown_days,
        allowed_maintenance_days: allowedMaintDays,
        excess_maintenance_days:  excessDays,
        maintenance_deduction:    maintDeduction,
        maintenance_applicable:   rule.maintenance_applicable || false,
        fuel_applicable:          rule.fuel_applicable || false,
        fuel_performance_type:    rule.fuel_performance_type || 'economy',
        approved_mileage:         parseFloat(rule.approved_mileage) || 0,
        approved_fuel_consumption:parseFloat(rule.approved_fuel_consumption) || 0,
        fuel_deduction_rate:      parseFloat(rule.fuel_deduction_rate) || 0,
        fuel_deduction:           fuelDeduction,
        hours_rate:               parseFloat(rule.hours_rate) || 0,
        km_rate:                  parseFloat(rule.km_rate)    || 0,
        is_mobilization:          false,
        is_tm:                    false,
        mob_qty:                  1,
        mob_unit_rate:            0,
      });
    }

    res.json({ data: { rule: primaryRule, cal_days: calDays, machines } });
  } catch (err) {
    console.error('getDirectPreview error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// GET /invoice-calculations — list all
const getAll = async (req, res) => {
  try {
    const { work_order_id } = req.query;
    const params = [];
    let where = '';
    if (work_order_id) { params.push(work_order_id); where = `WHERE c.work_order_id=$1`; }

    const result = await db.query(`
      SELECT c.id, c.invoice_number, c.ra_bill_no, c.invoice_date,
             c.period_from, c.period_to, c.status,
             c.basic_amount, c.gross_payable, c.net_payable, c.final_total,
             c.created_at, c.rule_id,
             w.wo_number,
             COALESCE(p.code, dp.code) AS project_code,
             COALESCE(p.name, dp.name) AS project_name,
             hv.name AS vendor_name,
             u.name AS created_by_name,
             r.rule_name, r.rule_number,
             (SELECT description FROM invoice_calc_machines
               WHERE calc_id = c.id ORDER BY sort_order, id LIMIT 1) AS machine_nickname
        FROM invoice_calculations c
        LEFT JOIN hire_work_orders w   ON w.id  = c.work_order_id
        LEFT JOIN projects         p   ON p.id  = w.project_id
        LEFT JOIN projects         dp  ON dp.id = c.project_id
        LEFT JOIN hire_vendors     hv  ON hv.id = w.vendor_id
        LEFT JOIN users            u   ON u.id  = c.created_by
        LEFT JOIN invoice_rules    r   ON r.id  = c.rule_id
       ${where}
       ORDER BY c.created_at DESC
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    console.error('getAll invoiceCalcs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /invoice-calculations/bill-data?wo_id=&from=&to=
// Auto-fetch WO details + machines + DPR data to pre-populate the bill form
const getBillData = async (req, res) => {
  try {
    const { wo_id, from, to } = req.query;
    if (!wo_id || !from || !to) {
      return res.status(400).json({ error: 'wo_id, from and to are required' });
    }

    // WO + vendor + project
    const woRes = await db.query(`
      SELECT w.*,
             p.code AS project_code, p.name AS project_name,
             hv.name AS vendor_name, hv.gst_no AS vendor_gst,
             hv.bank_name, hv.bank_account, hv.bank_ifsc, hv.pan_no
        FROM hire_work_orders w
        LEFT JOIN projects     p  ON p.id  = w.project_id
        LEFT JOIN hire_vendors hv ON hv.id = w.vendor_id
       WHERE w.id = $1
    `, [wo_id]);

    if (woRes.rows.length === 0) return res.status(404).json({ error: 'Work order not found' });
    const wo = woRes.rows[0];

    // Count calendar days in billing period
    const fromDate = new Date(from);
    const toDate   = new Date(to);
    const calDays  = Math.round((toDate - fromDate) / 86400000) + 1;

    // Machines in the WO (from hire_wo_items) + their invoice rule + maintenance config
    // Rules are now linked per WO item via invoice_rule_id (generic rules, not machine-bound)
    const itemsRes = await db.query(`
      SELECT i.id AS item_id, i.machine_id, i.invoice_rule_id, i.equipment_desc, i.quantity, i.unit,
             i.rate AS monthly_rate,
             m.slno AS reg_no, m.nickname, m.eq_type,
             r.id         AS rule_id, r.rule_name, r.basic_rate AS rule_basic_rate,
             r.days       AS rule_days, r.hours AS rule_hours, r.hours_rate AS rule_hours_rate,
             r.planned_km AS rule_planned_km, r.km_rate AS rule_km_rate,
             ra.maintenance_applicable,
             ra.allowed_maintenance_days,
             ra.maintenance_excess_rate,
             rd.fuel_applicable, rd.fuel_performance_type,
             rd.approved_mileage, rd.approved_fuel_consumption, rd.fuel_deduction_rate,
             et.name AS eq_type_name
        FROM hire_wo_items i
        LEFT JOIN machines               m  ON m.id  = i.machine_id
        LEFT JOIN equipment_types        et ON et.id = m.eq_type
        LEFT JOIN invoice_rules          r  ON r.id  = i.invoice_rule_id AND r.active = true
        LEFT JOIN invoice_rule_additions ra ON ra.rule_id = r.id
        LEFT JOIN invoice_rule_deductions rd ON rd.rule_id = r.id
       WHERE i.wo_id = $1
       ORDER BY i.id
    `, [wo_id]);

    // For each machine, fetch DPR data for the period
    const machines = [];
    for (const item of itemsRes.rows) {
      let dprData = { working_days: 0, diesel_qty: 0, actual_hours: 0, actual_km: 0, cubic_meter_qty: 0, breakdown_days: 0 };
      if (item.machine_id) {
        const dpr = await db.query(`
          SELECT COUNT(DISTINCT entry_date)                                        AS working_days,
                 COALESCE(SUM(hsd), 0)                                            AS diesel_qty,
                 COALESCE(SUM(working_hours), 0)                                  AS actual_hours,
                 COALESCE(SUM(r2_total), 0)                                       AS actual_km,
                 COALESCE(SUM(r1_total), 0)                                       AS cubic_meter_qty,
                 COUNT(DISTINCT entry_date) FILTER (WHERE breakdown > 0)          AS breakdown_days
            FROM dpr_entries
           WHERE machine_id = $1
             AND entry_date BETWEEN $2::date AND $3::date
             AND status = 'submitted'
        `, [item.machine_id, from, to]);
        if (dpr.rows[0]) {
          dprData = {
            working_days:   parseInt(dpr.rows[0].working_days)  || 0,
            diesel_qty:     parseFloat(dpr.rows[0].diesel_qty)  || 0,
            actual_hours:   parseFloat(dpr.rows[0].actual_hours)|| 0,
            actual_km:      parseFloat(dpr.rows[0].actual_km)   || 0,
            cubic_meter_qty:parseFloat(dpr.rows[0].cubic_meter_qty) || 0,
            breakdown_days: parseInt(dpr.rows[0].breakdown_days) || 0,
          };
        }
      }

      const monthlyRate   = parseFloat(item.monthly_rate) || parseFloat(item.rule_basic_rate) || 0;
      const workingDays   = dprData.working_days;
      const hireAmount    = calDays > 0 ? (monthlyRate / calDays) * workingDays : 0;
      // Planned hrs/km come from invoice rule only — prorated to cal days in billing period
      const ruleDays      = parseFloat(item.rule_days) || 30;
      const plannedHrs    = item.rule_hours    ? (parseFloat(item.rule_hours)    / ruleDays) * calDays : 0;
      const plannedKm     = item.rule_planned_km ? (parseFloat(item.rule_planned_km) / ruleDays) * calDays : 0;
      // Utilization: prefer km if rule has planned_km, else use hours
      const useKm    = plannedKm > 0;
      const utilPct  = useKm
        ? (plannedKm  > 0 ? (dprData.actual_km    / plannedKm)  * 100 : 0)
        : (plannedHrs > 0 ? (dprData.actual_hours / plannedHrs) * 100 : 0);

      // Maintenance deduction: excess breakdown days × daily rate
      const allowedMaintDays = parseInt(item.allowed_maintenance_days) || 0;
      const breakdownDays    = dprData.breakdown_days;
      const excessDays       = Math.max(0, breakdownDays - allowedMaintDays);
      const dailyRate        = calDays > 0 ? monthlyRate / calDays : 0;
      const excessRate       = parseFloat(item.maintenance_excess_rate) || dailyRate;
      const maintDeduction   = item.maintenance_applicable ? Math.round(excessDays * excessRate * 100) / 100 : 0;

      // Fuel deduction
      let fuelDeduction = 0;
      if (item.fuel_applicable) {
        const fuelRate = parseFloat(item.fuel_deduction_rate) || 0;
        if (item.fuel_performance_type === 'consumption') {
          // Litre/Hour: excess = actual fuel − (actual hours × approved L/H)
          const approvedConsumption = parseFloat(item.approved_fuel_consumption) || 0;
          const allowedFuel = dprData.actual_hours * approvedConsumption;
          const excessFuel  = Math.max(0, dprData.diesel_qty - allowedFuel);
          fuelDeduction = Math.round(excessFuel * fuelRate * 100) / 100;
        } else {
          // KM/Litre (economy): excess = actual fuel − (actual km / approved km/l)
          const approvedMileage = parseFloat(item.approved_mileage) || 0;
          const allowedFuel = approvedMileage > 0 ? dprData.actual_km / approvedMileage : 0;
          const excessFuel  = Math.max(0, dprData.diesel_qty - allowedFuel);
          fuelDeduction = Math.round(excessFuel * fuelRate * 100) / 100;
        }
      }

      machines.push({
        machine_id:               item.machine_id,
        reg_no:                   item.reg_no || item.equipment_desc,
        description:              item.nickname || item.equipment_desc,
        unit:                     'Month',
        monthly_rate:             monthlyRate,
        cal_days:                 calDays,
        working_days:             workingDays,
        hire_amount:              Math.round(hireAmount * 100) / 100,
        diesel_qty:               dprData.diesel_qty,
        diesel_rate:              0,
        diesel_amount:            0,
        total_hire_diesel:        Math.round(hireAmount * 100) / 100,
        cubic_meter_qty:          dprData.cubic_meter_qty,
        cost_per_cum:             0,
        actual_hours:             dprData.actual_hours,
        actual_km:                dprData.actual_km,
        planned_hrs_month:        plannedHrs,
        planned_km_month:         plannedKm,
        util_mode:                useKm ? 'km' : 'hours',
        utilization_pct:          Math.round(utilPct * 100) / 100,
        is_tm:                    false,
        is_mobilization:          false,
        eq_type_name:             item.eq_type_name || '',
        breakdown_days:           breakdownDays,
        allowed_maintenance_days: allowedMaintDays,
        excess_maintenance_days:  excessDays,
        maintenance_deduction:    maintDeduction,
        maintenance_applicable:   item.maintenance_applicable || false,
        fuel_applicable:          item.fuel_applicable || false,
        fuel_performance_type:    item.fuel_performance_type || 'economy',
        approved_mileage:         parseFloat(item.approved_mileage) || 0,
        approved_fuel_consumption:parseFloat(item.approved_fuel_consumption) || 0,
        fuel_deduction_rate:      parseFloat(item.fuel_deduction_rate) || 0,
        fuel_deduction:           fuelDeduction,
        hours_rate:               parseFloat(item.rule_hours_rate) || 0,
        km_rate:                  parseFloat(item.rule_km_rate) || 0,
      });
    }

    // Previous bills for this WO (for prev_calc_id picker)
    const prevBills = await db.query(`
      SELECT id, ra_bill_no, invoice_number, period_from, period_to, net_payable, gross_payable, basic_amount
        FROM invoice_calculations
       WHERE work_order_id = $1
       ORDER BY period_from DESC
    `, [wo_id]);

    res.json({
      data: {
        wo,
        cal_days: calDays,
        machines,
        prev_bills: prevBills.rows,
      }
    });
  } catch (err) {
    console.error('getBillData error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /invoice-calculations/:id
const getOne = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      SELECT c.*,
             w.wo_number, w.start_date AS wo_start, w.end_date AS wo_end,
             COALESCE(p.code, dp.code) AS project_code,
             COALESCE(p.name, dp.name) AS project_name,
             hv.name AS vendor_name, hv.gst_no AS vendor_gst,
             hv.bank_name, hv.bank_account, hv.bank_ifsc, hv.pan_no,
             u.name AS created_by_name,
             r.rule_name, r.rule_number,
             r.basic_rate AS rule_basic_rate, r.days AS rule_days
        FROM invoice_calculations c
        LEFT JOIN hire_work_orders w  ON w.id  = c.work_order_id
        LEFT JOIN projects         p  ON p.id  = w.project_id
        LEFT JOIN projects         dp ON dp.id = c.project_id
        LEFT JOIN hire_vendors     hv ON hv.id = w.vendor_id
        LEFT JOIN users            u  ON u.id  = c.created_by
        LEFT JOIN invoice_rules    r  ON r.id  = c.rule_id
       WHERE c.id = $1
    `, [id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const calc = result.rows[0];

    const mach = await db.query(`
      SELECT icm.*,
             m.slno AS machine_slno,
             et.name AS eq_type_name,
             m.manufacturer, m.model AS asset_model
        FROM invoice_calc_machines icm
        LEFT JOIN machines m ON m.id = icm.machine_id
        LEFT JOIN equipment_types et ON LOWER(et.name) = LOWER(m.eq_type)
       WHERE icm.calc_id = $1
       ORDER BY icm.sort_order, icm.id
    `, [id]);

    const manualItems = await db.query(
      'SELECT * FROM invoice_calc_manual_items WHERE calc_id=$1 ORDER BY id',
      [id]
    );

    // Previous bill data for cumulative display
    let prevCalc = null;
    if (calc.prev_calc_id) {
      const pRes = await db.query(`
        SELECT c.basic_amount, c.gst_amount, c.gross_payable,
               c.income_tax_amount, c.maintenance_amount, c.stores_amount, c.advance_amount,
               c.total_recoveries, c.net_payable,
               c.period_from, c.period_to, c.ra_bill_no,
               json_agg(
                 json_build_object(
                   'machine_id', m.machine_id,
                   'reg_no', m.reg_no,
                   'description', m.description,
                   'unit', m.unit,
                   'monthly_rate', m.monthly_rate,
                   'working_days', m.working_days,
                   'hire_amount', m.hire_amount,
                   'is_mobilization', m.is_mobilization,
                   'mob_qty', m.mob_qty,
                   'mob_unit_rate', m.mob_unit_rate
                 ) ORDER BY m.sort_order
               ) AS machines
          FROM invoice_calculations c
          LEFT JOIN invoice_calc_machines m ON m.calc_id = c.id
         WHERE c.id = $1
         GROUP BY c.id
      `, [calc.prev_calc_id]);
      if (pRes.rows[0]) prevCalc = pRes.rows[0];
    }

    res.json({
      data: {
        ...calc,
        machines:     mach.rows,
        manual_items: manualItems.rows,
        prev_calc:    prevCalc,
      }
    });
  } catch (err) {
    console.error('getOne invoiceCalc error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /invoice-calculations
const create = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const {
      work_order_id, period_from, period_to,
      invoice_date, invoice_number, ra_bill_no, remarks, status,
      gst_rate, gst_amount, gross_payable,
      income_tax_rate, income_tax_amount,
      maintenance_amount, stores_amount, advance_amount,
      total_recoveries, net_payable, diesel_rate,
      basic_amount, final_total, prev_calc_id, fuel_deduction_amount,
      rule_id,
      display_wo_number, display_wo_date, display_owner_name, display_ownership,
      manual_gst_no, manual_bank_name, manual_bank_account, manual_bank_ifsc,
      machines = [],
      manual_items = [],
    } = req.body;

    if (!period_from || !period_to) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'period_from and period_to are required' });
    }

    // Determine vendor name for per-vendor RA bill sequence
    let vendorForSeq = display_owner_name || null;
    if (!vendorForSeq && work_order_id) {
      const vRes = await client.query(
        `SELECT hv.name FROM hire_vendors hv
         JOIN hire_work_orders w ON w.vendor_id = hv.id
         WHERE w.id = $1`,
        [work_order_id]
      );
      vendorForSeq = vRes.rows[0]?.name || null;
    }

    // Auto-generate RA Bill No (vendor-specific, atomic via advisory lock)
    let autoRaBillNo = ra_bill_no || null;
    if (!autoRaBillNo) {
      if (vendorForSeq) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [vendorForSeq]);
        const raRes = await client.query(`
          SELECT 'RA' || LPAD(
            (COALESCE(MAX(
              CAST(REGEXP_REPLACE(ra_bill_no, '[^0-9]', '', 'g') AS INTEGER)
            ), 0) + 1)::TEXT,
            2, '0'
          ) AS next_ra
          FROM invoice_calculations
          WHERE ra_bill_no ~ '^RA[0-9]+$'
            AND (
              display_owner_name = $1
              OR work_order_id IN (
                SELECT w.id FROM hire_work_orders w
                JOIN hire_vendors hv ON hv.id = w.vendor_id
                WHERE hv.name = $1
              )
            )
        `, [vendorForSeq]);
        autoRaBillNo = raRes.rows[0]?.next_ra || 'RA01';
      } else {
        const c = await client.query('SELECT COUNT(*) FROM invoice_calculations');
        autoRaBillNo = `RA${String(parseInt(c.rows[0].count) + 1).padStart(2, '0')}`;
      }
    }

    // Auto-generate Invoice Number (global sequence)
    const countRes = await client.query('SELECT COUNT(*) FROM invoice_calculations');
    const seq      = parseInt(countRes.rows[0].count) + 1;
    const autoInvoiceNumber = invoice_number || `Inv-${String(seq).padStart(2, '0')}`;

    // Derive project_id from machines if not provided
    let resolvedProjectId = null;
    if (machines.length > 0 && machines[0].project_id) {
      resolvedProjectId = machines[0].project_id;
    }

    const calcRes = await client.query(`
      INSERT INTO invoice_calculations (
        work_order_id, project_id, period_from, period_to,
        invoice_date, invoice_number, ra_bill_no, remarks, status,
        gst_rate, gst_amount, gross_payable,
        income_tax_rate, income_tax_amount,
        maintenance_amount, stores_amount, advance_amount,
        fuel_deduction_amount, total_recoveries, net_payable, diesel_rate,
        basic_amount, final_total, prev_calc_id, rule_id,
        display_wo_number, display_wo_date, display_owner_name, display_ownership,
        manual_gst_no, manual_bank_name, manual_bank_account, manual_bank_ifsc,
        created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
        $31,$32,$33,$34
      ) RETURNING *
    `, [
      work_order_id || null, resolvedProjectId, period_from, period_to,
      invoice_date || null, autoInvoiceNumber, autoRaBillNo,
      remarks || null, status || 'final',
      parseFloat(gst_rate) || 18, parseFloat(gst_amount) || 0, parseFloat(gross_payable) || 0,
      parseFloat(income_tax_rate) || 2, parseFloat(income_tax_amount) || 0,
      parseFloat(maintenance_amount) || 0, parseFloat(stores_amount) || 0, parseFloat(advance_amount) || 0,
      parseFloat(fuel_deduction_amount) || 0,
      parseFloat(total_recoveries) || 0, parseFloat(net_payable) || 0, parseFloat(diesel_rate) || 0,
      parseFloat(basic_amount) || 0, parseFloat(final_total) || 0,
      prev_calc_id || null, rule_id || null,
      display_wo_number || null, display_wo_date || null, display_owner_name || null, display_ownership || null,
      manual_gst_no || null, manual_bank_name || null, manual_bank_account || null, manual_bank_ifsc || null,
      req.user.id,
    ]);

    const calc = calcRes.rows[0];

    for (let i = 0; i < machines.length; i++) {
      const m = machines[i];
      await client.query(`
        INSERT INTO invoice_calc_machines (
          calc_id, machine_id, reg_no, description, unit,
          monthly_rate, cal_days, working_days, hire_amount,
          diesel_qty, diesel_rate, diesel_amount, total_hire_diesel,
          cubic_meter_qty, cost_per_cum,
          actual_hours, actual_km, planned_hrs_month, utilization_pct,
          is_tm, is_mobilization, mob_qty, mob_unit_rate, sort_order,
          breakdown_days, allowed_maintenance_days, excess_maintenance_days, maintenance_deduction,
          fuel_deduction
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
          $25,$26,$27,$28,$29
        )
      `, [
        calc.id,
        m.machine_id || null, m.reg_no || '', m.description || '',
        m.unit || 'Month',
        parseFloat(m.monthly_rate) || 0, parseInt(m.cal_days) || 30,
        parseInt(m.working_days) || 0, parseFloat(m.hire_amount) || 0,
        parseFloat(m.diesel_qty) || 0, parseFloat(m.diesel_rate) || 0,
        parseFloat(m.diesel_amount) || 0, parseFloat(m.total_hire_diesel) || 0,
        parseFloat(m.cubic_meter_qty) || 0, parseFloat(m.cost_per_cum) || 0,
        parseFloat(m.actual_hours) || 0, parseFloat(m.actual_km) || 0,
        parseFloat(m.planned_hrs_month) || 0, parseFloat(m.utilization_pct) || 0,
        m.is_tm || false, m.is_mobilization || false,
        parseInt(m.mob_qty) || 1, parseFloat(m.mob_unit_rate) || 0,
        i,
        parseFloat(m.breakdown_days) || 0, parseInt(m.allowed_maintenance_days) || 0,
        parseFloat(m.excess_maintenance_days) || 0, parseFloat(m.maintenance_deduction) || 0,
        parseFloat(m.fuel_deduction) || 0,
      ]);
    }

    for (const item of manual_items) {
      if (!item.amount) continue;
      await client.query(
        'INSERT INTO invoice_calc_manual_items (calc_id, type, notes, amount) VALUES ($1,$2,$3,$4)',
        [calc.id, item.type, item.notes || null, parseFloat(item.amount)]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ data: calc });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('create invoiceCalc error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

// PUT /invoice-calculations/:id
const update = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const {
      invoice_date, invoice_number, ra_bill_no, remarks, status,
      gst_rate, gst_amount, gross_payable,
      income_tax_rate, income_tax_amount,
      maintenance_amount, stores_amount, advance_amount,
      fuel_deduction_amount, total_recoveries, net_payable, diesel_rate,
      basic_amount, final_total,
      display_wo_number, display_wo_date, display_owner_name, display_ownership,
      manual_gst_no, manual_bank_name, manual_bank_account, manual_bank_ifsc,
      machines = [],
      manual_items = [],
    } = req.body;

    await client.query(`
      UPDATE invoice_calculations SET
        invoice_date=$1, invoice_number=$2, ra_bill_no=$3, remarks=$4, status=$5,
        gst_rate=$6, gst_amount=$7, gross_payable=$8,
        income_tax_rate=$9, income_tax_amount=$10,
        maintenance_amount=$11, stores_amount=$12, advance_amount=$13,
        fuel_deduction_amount=$14, total_recoveries=$15, net_payable=$16,
        diesel_rate=$17, basic_amount=$18, final_total=$19,
        display_wo_number=$20, display_wo_date=$21, display_owner_name=$22, display_ownership=$23,
        manual_gst_no=$24, manual_bank_name=$25, manual_bank_account=$26, manual_bank_ifsc=$27
      WHERE id=$28
    `, [
      invoice_date || null, invoice_number || null, ra_bill_no || null,
      remarks || null, status || 'final',
      parseFloat(gst_rate) || 18, parseFloat(gst_amount) || 0, parseFloat(gross_payable) || 0,
      parseFloat(income_tax_rate) || 2, parseFloat(income_tax_amount) || 0,
      parseFloat(maintenance_amount) || 0, parseFloat(stores_amount) || 0, parseFloat(advance_amount) || 0,
      parseFloat(fuel_deduction_amount) || 0,
      parseFloat(total_recoveries) || 0, parseFloat(net_payable) || 0,
      parseFloat(diesel_rate) || 0,
      parseFloat(basic_amount) || 0, parseFloat(final_total) || 0,
      display_wo_number || null, display_wo_date || null,
      display_owner_name || null, display_ownership || null,
      manual_gst_no || null, manual_bank_name || null, manual_bank_account || null, manual_bank_ifsc || null,
      id,
    ]);

    // Replace machines
    await client.query('DELETE FROM invoice_calc_machines WHERE calc_id=$1', [id]);
    for (let i = 0; i < machines.length; i++) {
      const m = machines[i];
      await client.query(`
        INSERT INTO invoice_calc_machines (
          calc_id, machine_id, reg_no, description, unit,
          monthly_rate, cal_days, working_days, hire_amount,
          diesel_qty, diesel_rate, diesel_amount, total_hire_diesel,
          cubic_meter_qty, cost_per_cum,
          actual_hours, actual_km, planned_hrs_month, utilization_pct,
          is_tm, is_mobilization, mob_qty, mob_unit_rate, sort_order,
          breakdown_days, allowed_maintenance_days, excess_maintenance_days,
          maintenance_deduction, fuel_deduction
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29
        )
      `, [
        id,
        m.machine_id || null, m.reg_no || '', m.description || '', m.unit || 'Month',
        parseFloat(m.monthly_rate) || 0, parseInt(m.cal_days) || 30,
        parseInt(m.working_days) || 0, parseFloat(m.hire_amount) || 0,
        parseFloat(m.diesel_qty) || 0, parseFloat(m.diesel_rate) || 0,
        parseFloat(m.diesel_amount) || 0, parseFloat(m.total_hire_diesel) || 0,
        parseFloat(m.cubic_meter_qty) || 0, parseFloat(m.cost_per_cum) || 0,
        parseFloat(m.actual_hours) || 0, parseFloat(m.actual_km) || 0,
        parseFloat(m.planned_hrs_month) || 0, parseFloat(m.utilization_pct) || 0,
        m.is_tm || false, m.is_mobilization || false,
        parseInt(m.mob_qty) || 1, parseFloat(m.mob_unit_rate) || 0,
        i,
        parseFloat(m.breakdown_days) || 0, parseInt(m.allowed_maintenance_days) || 0,
        parseFloat(m.excess_maintenance_days) || 0, parseFloat(m.maintenance_deduction) || 0,
        parseFloat(m.fuel_deduction) || 0,
      ]);
    }

    // Replace manual items
    await client.query('DELETE FROM invoice_calc_manual_items WHERE calc_id=$1', [id]);
    for (const item of manual_items) {
      if (!item.amount) continue;
      await client.query(
        'INSERT INTO invoice_calc_manual_items (calc_id, type, notes, amount) VALUES ($1,$2,$3,$4)',
        [id, item.type, item.notes || null, parseFloat(item.amount)]
      );
    }

    await client.query('COMMIT');
    res.json({ data: { id } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('update invoiceCalc error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
};

// DELETE /invoice-calculations/:id
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM invoice_calculations WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('remove invoiceCalc error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /invoice-calculations/hire-vendors
const getHireVendors = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT vendor AS name
        FROM machines
       WHERE ownership = 'Hire' AND active = true AND vendor IS NOT NULL AND vendor != ''
       ORDER BY vendor
    `);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getHireVendors error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /invoice-calculations/vendor-machines?vendor_name=X
const getVendorMachines = async (req, res) => {
  try {
    const { vendor_name } = req.query;
    if (!vendor_name) return res.status(400).json({ error: 'vendor_name is required' });

    const result = await db.query(`
      SELECT m.id, m.slno, m.nickname, m.eq_type, m.manufacturer, m.model,
             m.reg_no, m.vendor, m.rate_monthly, m.ownership,
             et.name AS eq_type_name,
             ir.id        AS rule_id,   ir.rule_name,  ir.rule_number,
             ir.basic_rate AS existing_basic_rate, ir.days AS rule_days,
             ir.hours_rate, ir.km_rate,
             wo.wo_id, wo.wo_number, wo.wo_date, wo.wo_item_id
        FROM machines m
        LEFT JOIN equipment_types et ON LOWER(et.name) = LOWER(m.eq_type)
        LEFT JOIN invoice_rules   ir ON ir.machine_id = m.id AND ir.active = true
        LEFT JOIN LATERAL (
          SELECT w.id AS wo_id, w.wo_number, w.wo_date, wi.id AS wo_item_id
            FROM hire_wo_items wi
            JOIN hire_work_orders w ON w.id = wi.wo_id
           WHERE wi.machine_id = m.id
             AND w.status NOT IN ('draft', 'rejected', 'cancelled')
           ORDER BY w.wo_date DESC
           LIMIT 1
        ) wo ON true
       WHERE m.ownership = 'Hire'
         AND m.active    = true
         AND LOWER(m.vendor) = LOWER($1)
       ORDER BY m.eq_type, m.slno
    `, [vendor_name]);

    res.json({ data: result.rows });
  } catch (err) {
    console.error('getVendorMachines error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /invoice-calculations/next-ra-bill?vendor=VendorName
const getNextRaBillNo = async (req, res) => {
  const { vendor } = req.query;
  if (!vendor) return res.status(400).json({ error: 'vendor is required' });
  try {
    const result = await db.query(`
      SELECT 'RA' || LPAD(
        (COALESCE(MAX(
          CAST(REGEXP_REPLACE(ra_bill_no, '[^0-9]', '', 'g') AS INTEGER)
        ), 0) + 1)::TEXT,
        2, '0'
      ) AS next_ra
      FROM invoice_calculations
      WHERE ra_bill_no ~ '^RA[0-9]+$'
        AND (
          display_owner_name = $1
          OR work_order_id IN (
            SELECT w.id FROM hire_work_orders w
            JOIN hire_vendors hv ON hv.id = w.vendor_id
            WHERE hv.name = $1
          )
        )
    `, [vendor]);
    res.json({ next_ra: result.rows[0]?.next_ra || 'RA01' });
  } catch (err) {
    console.error('getNextRaBillNo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getOne, getBillData, getDirectPreview, getHireVendors, getVendorMachines, getNextRaBillNo, create, update, remove };
