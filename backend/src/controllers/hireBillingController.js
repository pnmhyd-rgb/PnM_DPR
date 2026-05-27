const db = require('../config/db');

// ── BILL NUMBER GENERATOR ────────────────────────────────────────────────────

async function generateBillNumber(periodFrom) {
  const year  = new Date(periodFrom).getFullYear();
  const month = String(new Date(periodFrom).getMonth() + 1).padStart(2, '0');
  const countRes = await db.query(
    `SELECT COUNT(*) FROM hire_bills
     WHERE EXTRACT(YEAR FROM billing_period_from) = $1`, [year]
  );
  const seq = parseInt(countRes.rows[0].count) + 1;
  return `HB/${year}${month}/${String(seq).padStart(4, '0')}`;
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

const BILL_SELECT = `
  SELECT b.*,
    w.wo_number, w.billing_rules,
    v.name            AS vendor_name,
    v.phone           AS vendor_phone,
    v.gst_no          AS vendor_gst,
    v.bank_name, v.bank_account, v.bank_ifsc,
    p.code            AS project_code,
    p.name            AS project_name,
    uc.name           AS created_by_name,
    ua.name           AS approved_by_name,
    up.name           AS paid_by_name
  FROM hire_bills b
  JOIN hire_work_orders w ON b.wo_id = w.id
  LEFT JOIN hire_vendors v ON b.vendor_id = v.id
  LEFT JOIN projects p     ON b.project_id = p.id
  LEFT JOIN users uc ON b.created_by  = uc.id
  LEFT JOIN users ua ON b.approved_by = ua.id
  LEFT JOIN users up ON b.paid_by     = up.id
`;

// ── GET LIST ─────────────────────────────────────────────────────────────────

const getBills = async (req, res) => {
  try {
    const { wo_id, vendor_id, status, project_id, from, to } = req.query;
    let query  = BILL_SELECT + ' WHERE 1=1';
    const params = [];

    if (wo_id)      { params.push(wo_id);      query += ` AND b.wo_id=$${params.length}`; }
    if (vendor_id)  { params.push(vendor_id);  query += ` AND b.vendor_id=$${params.length}`; }
    if (project_id) { params.push(project_id); query += ` AND b.project_id=$${params.length}`; }
    if (status)     { params.push(status);     query += ` AND b.status=$${params.length}`; }
    if (from)       { params.push(from);       query += ` AND b.billing_period_from >= $${params.length}`; }
    if (to)         { params.push(to);         query += ` AND b.billing_period_to <= $${params.length}`; }

    if (req.user.role !== 'admin' && req.user.project_codes?.length) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ' ORDER BY b.created_at DESC';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getBills:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET ONE ──────────────────────────────────────────────────────────────────

const getBill = async (req, res) => {
  try {
    const { id } = req.params;
    const [billRes, itemsRes] = await Promise.all([
      db.query(BILL_SELECT + ' WHERE b.id=$1', [id]),
      db.query(
        `SELECT bi.*, m.slno, m.reg_no, m.eq_type
         FROM hire_bill_items bi
         LEFT JOIN machines m ON bi.machine_id = m.id
         WHERE bi.bill_id=$1 ORDER BY bi.id`, [id]
      ),
    ]);
    if (!billRes.rows.length) return res.status(404).json({ error: 'Bill not found' });
    res.json({ data: { ...billRes.rows[0], items: itemsRes.rows } });
  } catch (err) {
    console.error('getBill:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── FETCH DPR DATA FOR A WO + PERIOD ─────────────────────────────────────────
// Returns per-machine working days from DPR entries in the date range

const fetchDprData = async (req, res) => {
  try {
    const { wo_id, from, to } = req.query;
    if (!wo_id || !from || !to) {
      return res.status(400).json({ error: 'wo_id, from, to are required' });
    }

    // Get machine ids from WO items
    const itemsRes = await db.query(
      `SELECT id AS wo_item_id, machine_id, equipment_desc, rate, rate_type, quantity, unit
       FROM hire_wo_items WHERE wo_id=$1`, [wo_id]
    );
    if (!itemsRes.rows.length) return res.json({ data: [] });

    const machineIds = itemsRes.rows.map(r => r.machine_id).filter(Boolean);

    let dprMap = {};
    if (machineIds.length) {
      // Count working days and sum hours from DPR for each machine
      const dprRes = await db.query(
        `SELECT
           e.machine_id,
           COUNT(DISTINCT e.entry_date)                                          AS working_days,
           COUNT(DISTINCT CASE WHEN EXTRACT(DOW FROM e.entry_date) = 0
                               THEN e.entry_date END)                            AS sunday_days,
           COALESCE(SUM(CASE WHEN rt.unit = 'Hrs' THEN rl.total ELSE 0 END), 0) AS working_hours
         FROM dpr_entries e
         LEFT JOIN dpr_reading_logs rl ON rl.entry_id = e.id
         LEFT JOIN reading_types rt    ON rt.id = rl.reading_type_id
         WHERE e.machine_id = ANY($1)
           AND e.entry_date BETWEEN $2 AND $3
         GROUP BY e.machine_id`,
        [machineIds, from, to]
      );
      for (const r of dprRes.rows) {
        dprMap[r.machine_id] = {
          working_days:  parseFloat(r.working_days),
          sunday_days:   parseInt(r.sunday_days),
          working_hours: parseFloat(r.working_hours),
        };
      }
    }

    // Compute calendar days in period
    const calDays = Math.round(
      (new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)
    ) + 1;

    const result = itemsRes.rows.map(item => ({
      ...item,
      working_days:  dprMap[item.machine_id]?.working_days  || 0,
      sunday_days:   dprMap[item.machine_id]?.sunday_days   || 0,
      working_hours: dprMap[item.machine_id]?.working_hours || 0,
      overtime_hrs:  0,
      calendar_days: calDays,
    }));

    res.json({ data: result, calendar_days: calDays });
  } catch (err) {
    console.error('fetchDprData:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── CREATE ───────────────────────────────────────────────────────────────────

const createBill = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const {
      wo_id, billing_period_from, billing_period_to,
      total_calendar_days, total_working_days, total_working_hours,
      sunday_days_worked, overtime_hours,
      base_amount, overtime_amount, sunday_amount,
      other_additions, deductions, net_amount,
      gst_percent, gst_amount, total_amount,
      vendor_bill_no, vendor_bill_date, remarks,
      items = [],
    } = req.body;

    if (!wo_id || !billing_period_from || !billing_period_to) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'wo_id, billing_period_from and billing_period_to are required' });
    }

    const woRes = await client.query(
      `SELECT vendor_id, project_id FROM hire_work_orders WHERE id=$1 AND status='approved'`,
      [wo_id]
    );
    if (!woRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only approved work orders can be billed' });
    }
    const { vendor_id, project_id } = woRes.rows[0];

    const billing_month = billing_period_from.slice(0, 7);
    const bill_number   = await generateBillNumber(billing_period_from);

    const billRes = await client.query(
      `INSERT INTO hire_bills
         (bill_number, wo_id, vendor_id, project_id,
          billing_period_from, billing_period_to, billing_month,
          total_calendar_days, total_working_days, total_working_hours,
          sunday_days_worked, overtime_hours,
          base_amount, overtime_amount, sunday_amount,
          other_additions, deductions, net_amount,
          gst_percent, gst_amount, total_amount,
          vendor_bill_no, vendor_bill_date, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING *`,
      [
        bill_number, wo_id, vendor_id, project_id,
        billing_period_from, billing_period_to, billing_month,
        total_calendar_days || 0, total_working_days || 0, total_working_hours || 0,
        sunday_days_worked || 0, overtime_hours || 0,
        base_amount || 0, overtime_amount || 0, sunday_amount || 0,
        other_additions || 0, deductions || 0, net_amount || 0,
        gst_percent || 18, gst_amount || 0, total_amount || 0,
        vendor_bill_no || null, vendor_bill_date || null, remarks || null,
        req.user.id,
      ]
    );
    const bill = billRes.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO hire_bill_items
           (bill_id, wo_item_id, machine_id, equipment_desc, rate_type, rate,
            quantity, unit, working_days, working_hours, sunday_days, overtime_hrs,
            base_amount, overtime_amount, sunday_amount, total_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          bill.id, item.wo_item_id || null, item.machine_id || null,
          item.equipment_desc, item.rate_type || 'per_month', item.rate || 0,
          item.quantity || 1, item.unit || 'No.',
          item.working_days || 0, item.working_hours || 0,
          item.sunday_days || 0, item.overtime_hrs || 0,
          item.base_amount || 0, item.overtime_amount || 0,
          item.sunday_amount || 0, item.total_amount || 0,
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ data: bill });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createBill:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

// ── UPDATE ───────────────────────────────────────────────────────────────────

const updateBill = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const existing = await client.query('SELECT status FROM hire_bills WHERE id=$1', [id]);
    if (!existing.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (!['draft'].includes(existing.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only draft bills can be edited' });
    }

    const {
      billing_period_from, billing_period_to,
      total_calendar_days, total_working_days, total_working_hours,
      sunday_days_worked, overtime_hours,
      base_amount, overtime_amount, sunday_amount,
      other_additions, deductions, net_amount,
      gst_percent, gst_amount, total_amount,
      vendor_bill_no, vendor_bill_date, remarks,
      items = [],
    } = req.body;

    const billing_month = billing_period_from?.slice(0, 7);

    await client.query(
      `UPDATE hire_bills SET
         billing_period_from=$1, billing_period_to=$2, billing_month=$3,
         total_calendar_days=$4, total_working_days=$5, total_working_hours=$6,
         sunday_days_worked=$7, overtime_hours=$8,
         base_amount=$9, overtime_amount=$10, sunday_amount=$11,
         other_additions=$12, deductions=$13, net_amount=$14,
         gst_percent=$15, gst_amount=$16, total_amount=$17,
         vendor_bill_no=$18, vendor_bill_date=$19, remarks=$20,
         updated_at=NOW()
       WHERE id=$21`,
      [
        billing_period_from, billing_period_to, billing_month,
        total_calendar_days || 0, total_working_days || 0, total_working_hours || 0,
        sunday_days_worked || 0, overtime_hours || 0,
        base_amount || 0, overtime_amount || 0, sunday_amount || 0,
        other_additions || 0, deductions || 0, net_amount || 0,
        gst_percent || 18, gst_amount || 0, total_amount || 0,
        vendor_bill_no || null, vendor_bill_date || null, remarks || null,
        id,
      ]
    );

    await client.query('DELETE FROM hire_bill_items WHERE bill_id=$1', [id]);
    for (const item of items) {
      await client.query(
        `INSERT INTO hire_bill_items
           (bill_id, wo_item_id, machine_id, equipment_desc, rate_type, rate,
            quantity, unit, working_days, working_hours, sunday_days, overtime_hrs,
            base_amount, overtime_amount, sunday_amount, total_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          id, item.wo_item_id || null, item.machine_id || null,
          item.equipment_desc, item.rate_type || 'per_month', item.rate || 0,
          item.quantity || 1, item.unit || 'No.',
          item.working_days || 0, item.working_hours || 0,
          item.sunday_days || 0, item.overtime_hrs || 0,
          item.base_amount || 0, item.overtime_amount || 0,
          item.sunday_amount || 0, item.total_amount || 0,
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Bill updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateBill:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

// ── DELETE ───────────────────────────────────────────────────────────────────

const deleteBill = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT status FROM hire_bills WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Only draft bills can be deleted' });
    }
    await db.query('DELETE FROM hire_bills WHERE id=$1', [id]);
    res.json({ message: 'Bill deleted' });
  } catch (err) {
    console.error('deleteBill:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── STATUS TRANSITIONS ───────────────────────────────────────────────────────

const submitBill = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT status FROM hire_bills WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Only draft bills can be submitted' });
    }
    await db.query(
      `UPDATE hire_bills SET status='submitted', submitted_by=$1, submitted_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [req.user.id, id]
    );
    res.json({ message: 'Bill submitted' });
  } catch (err) {
    console.error('submitBill:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const approveBill = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const existing = await db.query('SELECT status FROM hire_bills WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'submitted') {
      return res.status(400).json({ error: 'Bill must be submitted before approval' });
    }
    await db.query(
      `UPDATE hire_bills SET status='approved', approved_by=$1, approved_at=NOW(), approval_remarks=$2, updated_at=NOW() WHERE id=$3`,
      [req.user.id, remarks || null, id]
    );
    res.json({ message: 'Bill approved' });
  } catch (err) {
    console.error('approveBill:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const markPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_date, payment_reference, payment_mode } = req.body;
    const existing = await db.query('SELECT status FROM hire_bills WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'approved') {
      return res.status(400).json({ error: 'Bill must be approved before marking paid' });
    }
    await db.query(
      `UPDATE hire_bills SET
         status='paid', paid_by=$1, paid_at=NOW(),
         payment_date=$2, payment_reference=$3, payment_mode=$4,
         updated_at=NOW()
       WHERE id=$5`,
      [req.user.id, payment_date || null, payment_reference || null, payment_mode || null, id]
    );
    res.json({ message: 'Bill marked as paid' });
  } catch (err) {
    console.error('markPaid:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const rejectBill = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    if (!remarks?.trim()) return res.status(400).json({ error: 'Rejection remarks required' });
    const existing = await db.query('SELECT status FROM hire_bills WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!['submitted'].includes(existing.rows[0].status)) {
      return res.status(400).json({ error: 'Only submitted bills can be rejected' });
    }
    await db.query(
      `UPDATE hire_bills SET status='rejected', approval_remarks=$1, updated_at=NOW() WHERE id=$2`,
      [remarks.trim(), id]
    );
    res.json({ message: 'Bill rejected' });
  } catch (err) {
    console.error('rejectBill:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── UPDATE BILLING RULES ON WO ───────────────────────────────────────────────

const updateWoBillingRules = async (req, res) => {
  try {
    const { id } = req.params;
    const { billing_rules } = req.body;
    await db.query(
      `UPDATE hire_work_orders SET billing_rules=$1, updated_at=NOW() WHERE id=$2`,
      [JSON.stringify(billing_rules), id]
    );
    res.json({ message: 'Billing rules updated' });
  } catch (err) {
    console.error('updateWoBillingRules:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getBills, getBill, fetchDprData,
  createBill, updateBill, deleteBill,
  submitBill, approveBill, rejectBill, markPaid,
  updateWoBillingRules,
};
