const db = require('../config/db');

// ── VENDORS ─────────────────────────────────────────────────────────────────

const getVendors = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM hire_vendors WHERE active = TRUE ORDER BY name'
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getVendors:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createVendor = async (req, res) => {
  try {
    const {
      name, contact_person, phone, email, address, gst_no, pan_no,
      bank_name, bank_account, bank_ifsc,
      // GST-verified enrichment fields
      legal_name, trade_name, state, district, pincode,
      gst_status, business_type, gst_reg_date,
      gst_verified, gst_verified_at, gst_api_response,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Vendor name is required' });

    // Server-side duplicate GSTIN guard
    if (gst_no?.trim()) {
      const dup = await db.query(
        `SELECT id, name FROM hire_vendors WHERE UPPER(gst_no) = UPPER($1) AND active = TRUE LIMIT 1`,
        [gst_no.trim()]
      );
      if (dup.rows.length) {
        return res.status(409).json({ error: `GST number already registered under "${dup.rows[0].name}"` });
      }
    }

    const result = await db.query(
      `INSERT INTO hire_vendors
         (name, contact_person, phone, email, address, gst_no, pan_no,
          bank_name, bank_account, bank_ifsc,
          legal_name, trade_name, state, district, pincode,
          gst_status, business_type, gst_reg_date,
          gst_verified, gst_verified_at, gst_api_response)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        name.trim(), contact_person||null, phone||null, email||null, address||null,
        gst_no||null, pan_no||null, bank_name||null, bank_account||null, bank_ifsc||null,
        legal_name||null, trade_name||null, state||null, district||null, pincode||null,
        gst_status||null, business_type||null, gst_reg_date||null,
        gst_verified||false, gst_verified_at||null,
        gst_api_response ? JSON.stringify(gst_api_response) : null,
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('createVendor:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, contact_person, phone, email, address, gst_no, pan_no,
      bank_name, bank_account, bank_ifsc,
      legal_name, trade_name, state, district, pincode,
      gst_status, business_type, gst_reg_date,
      gst_verified, gst_verified_at, gst_api_response,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Vendor name is required' });

    // Server-side duplicate GSTIN guard (exclude self)
    if (gst_no?.trim()) {
      const dup = await db.query(
        `SELECT id, name FROM hire_vendors WHERE UPPER(gst_no) = UPPER($1) AND active = TRUE AND id != $2 LIMIT 1`,
        [gst_no.trim(), id]
      );
      if (dup.rows.length) {
        return res.status(409).json({ error: `GST number already registered under "${dup.rows[0].name}"` });
      }
    }

    const result = await db.query(
      `UPDATE hire_vendors SET
         name=$1, contact_person=$2, phone=$3, email=$4, address=$5,
         gst_no=$6, pan_no=$7, bank_name=$8, bank_account=$9, bank_ifsc=$10,
         legal_name=$11, trade_name=$12, state=$13, district=$14, pincode=$15,
         gst_status=$16, business_type=$17, gst_reg_date=$18,
         gst_verified=$19, gst_verified_at=$20, gst_api_response=$21,
         updated_at=NOW()
       WHERE id=$22 RETURNING *`,
      [
        name.trim(), contact_person||null, phone||null, email||null, address||null,
        gst_no||null, pan_no||null, bank_name||null, bank_account||null, bank_ifsc||null,
        legal_name||null, trade_name||null, state||null, district||null, pincode||null,
        gst_status||null, business_type||null, gst_reg_date||null,
        gst_verified||false, gst_verified_at||null,
        gst_api_response ? JSON.stringify(gst_api_response) : null,
        id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('updateVendor:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE hire_vendors SET active=FALSE,updated_at=NOW() WHERE id=$1', [id]);
    res.json({ message: 'Vendor deactivated' });
  } catch (err) {
    console.error('deleteVendor:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── WO NUMBER GENERATOR ─────────────────────────────────────────────────────
// Format: RVR/HO/<SITE-CODE>/WO/<FY e.g. 2026-27>/<sequence, reset each FY>

function financialYearLabel(woDate) {
  const d = new Date(woDate);
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12, FY starts April
  const fyStart = m >= 4 ? y : y - 1;
  return `${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`;
}

async function generateWoNumber(woDate, projectCode) {
  const fyLabel = financialYearLabel(woDate);
  const countRes = await db.query(
    `SELECT COUNT(*) FROM hire_work_orders WHERE wo_number LIKE $1`,
    [`RVR/HO/%/WO/${fyLabel}/%`]
  );
  const seq = parseInt(countRes.rows[0].count) + 1;
  return `RVR/HO/${projectCode}/WO/${fyLabel}/${String(seq).padStart(4, '0')}`;
}

// ── WORK ORDERS ─────────────────────────────────────────────────────────────

const BASE_SELECT = `
  SELECT w.*,
    v.name            AS vendor_name,
    v.contact_person  AS vendor_contact,
    v.phone           AS vendor_phone,
    v.gst_no          AS vendor_gst,
    v.address         AS vendor_address,
    v.pan_no          AS vendor_pan,
    v.bank_name       AS vendor_bank_name,
    v.bank_account    AS vendor_bank_account,
    v.bank_ifsc       AS vendor_bank_ifsc,
    p.code            AS project_code,
    p.name            AS project_name,
    p.address         AS project_address,
    uc.name           AS created_by_name,
    us.name           AS submitted_by_name,
    ul1.name          AS l1_approved_by_name,
    ua.name           AS approved_by_name,
    ur.name           AS rejected_by_name,
    uu.name           AS updated_by_name,
    sg.name           AS signatory_name,
    sg.designation    AS signatory_designation,
    m2.slno           AS machine_slno,
    m2.nickname       AS machine_nickname,
    m2.eq_type        AS machine_eq_type,
    m2.reg_no         AS machine_reg_no
  FROM hire_work_orders w
  LEFT JOIN hire_vendors v  ON w.vendor_id   = v.id
  LEFT JOIN projects     p  ON w.project_id  = p.id
  LEFT JOIN users        uc ON w.created_by       = uc.id
  LEFT JOIN users        us ON w.submitted_by     = us.id
  LEFT JOIN users        ul1 ON w.l1_approved_by  = ul1.id
  LEFT JOIN users        ua ON w.approved_by      = ua.id
  LEFT JOIN users        ur ON w.rejected_by      = ur.id
  LEFT JOIN users        uu ON w.updated_by       = uu.id
  LEFT JOIN hire_signatories sg ON w.signatory_id = sg.id
  LEFT JOIN machines     m2 ON w.machine_id  = m2.id
`;

const getWorkOrders = async (req, res) => {
  try {
    const { project_id, vendor_id, vendor_name, status } = req.query;
    let query = BASE_SELECT + ' WHERE 1=1';
    const params = [];

    if (project_id)  { params.push(project_id);  query += ` AND w.project_id=$${params.length}`; }
    if (vendor_id)   { params.push(vendor_id);   query += ` AND w.vendor_id=$${params.length}`; }
    if (vendor_name) { params.push(vendor_name); query += ` AND LOWER(v.name)=LOWER($${params.length})`; }
    if (status)      { params.push(status);      query += ` AND w.status=$${params.length}`; }

    if (req.user.role !== 'admin' && req.user.project_codes?.length) {
      params.push(req.user.project_codes);
      query += ` AND p.code = ANY($${params.length})`;
    }

    query += ' ORDER BY w.created_at DESC';
    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getWorkOrders:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const [woRes, itemsRes] = await Promise.all([
      db.query(BASE_SELECT + ' WHERE w.id=$1', [id]),
      db.query(
        `SELECT i.*, m.slno, m.eq_type AS machine_eq_type
         FROM hire_wo_items i LEFT JOIN machines m ON i.machine_id = m.id
         WHERE i.wo_id=$1 ORDER BY i.id`, [id]
      ),
    ]);
    if (!woRes.rows.length) return res.status(404).json({ error: 'Work order not found' });
    res.json({ data: { ...woRes.rows[0], items: itemsRes.rows } });
  } catch (err) {
    console.error('getWorkOrder:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createWorkOrder = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const {
      wo_date, indent_number, vendor_offer_no, vendor_id, project_id,
      start_date, end_date, tenure_months, terms_conditions, billing_rules, items = [],
      description_line, site_address, reporting_date, site_contact_name,
      site_contact_phone, mobilization_advance, signatory_id, machine_id,
    } = req.body;

    if (!wo_date || !vendor_id || !project_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'WO date, vendor and project are required' });
    }

    const projRes = await client.query('SELECT code, address FROM projects WHERE id=$1', [project_id]);
    if (!projRes.rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Project not found' }); }
    const project = projRes.rows[0];

    const wo_number = await generateWoNumber(wo_date, project.code);

    const totalValue = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

    const woRes = await client.query(
      `INSERT INTO hire_work_orders
         (wo_number,wo_date,indent_number,vendor_offer_no,vendor_id,project_id,start_date,end_date,
          tenure_months,total_value,terms_conditions,billing_rules,created_by,updated_by,
          description_line,site_address,reporting_date,site_contact_name,site_contact_phone,mobilization_advance,
          signatory_id,machine_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [wo_number, wo_date, indent_number||null, vendor_offer_no||null, vendor_id, project_id,
       start_date||null, end_date||null, tenure_months||null,
       totalValue, terms_conditions||null,
       billing_rules ? JSON.stringify(billing_rules) : null,
       req.user.id, req.user.id,
       description_line||null, site_address || project.address || null, reporting_date||null,
       site_contact_name||null, site_contact_phone||null, mobilization_advance||'NA',
       signatory_id||null, machine_id||null]
    );
    const wo = woRes.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO hire_wo_items
           (wo_id,machine_id,equipment_desc,quantity,unit,rate,rate_type,amount,
            reg_no,manufacturer,model,yom,rate_single_shift,rate_double_shift,eq_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [wo.id, item.machine_id||null, item.equipment_desc,
         item.quantity||1, item.unit||'No.', item.rate||0,
         item.rate_type||'per_month', item.amount||0,
         item.reg_no||null, item.manufacturer||null, item.model||null, item.yom||null,
         item.rate_single_shift||null, item.rate_double_shift||null, item.eq_type||null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ data: wo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createWorkOrder:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const updateWorkOrder = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const existing = await client.query('SELECT status FROM hire_work_orders WHERE id=$1', [id]);
    if (!existing.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (!['draft', 'rejected'].includes(existing.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only draft or rejected WOs can be edited' });
    }

    const {
      wo_date, indent_number, vendor_offer_no, vendor_id, project_id,
      start_date, end_date, tenure_months, terms_conditions, billing_rules, items = [],
      description_line, site_address, reporting_date, site_contact_name,
      site_contact_phone, mobilization_advance, signatory_id, machine_id,
    } = req.body;

    const totalValue = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

    await client.query(
      `UPDATE hire_work_orders SET
         wo_date=$1,indent_number=$2,vendor_offer_no=$3,vendor_id=$4,project_id=$5,
         start_date=$6,end_date=$7,tenure_months=$8,
         total_value=$9,terms_conditions=$10,billing_rules=$11,status='draft',updated_at=NOW(),updated_by=$12,
         description_line=$13,site_address=$14,reporting_date=$15,site_contact_name=$16,
         site_contact_phone=$17,mobilization_advance=$18,signatory_id=$19,machine_id=$20
       WHERE id=$21`,
      [wo_date, indent_number||null, vendor_offer_no||null, vendor_id, project_id,
       start_date||null, end_date||null, tenure_months||null,
       totalValue, terms_conditions||null,
       billing_rules ? JSON.stringify(billing_rules) : null,
       req.user.id,
       description_line||null, site_address||null, reporting_date||null,
       site_contact_name||null, site_contact_phone||null, mobilization_advance||'NA',
       signatory_id||null, machine_id||null,
       id]
    );

    await client.query('DELETE FROM hire_wo_items WHERE wo_id=$1', [id]);
    for (const item of items) {
      await client.query(
        `INSERT INTO hire_wo_items
           (wo_id,machine_id,equipment_desc,quantity,unit,rate,rate_type,amount,
            reg_no,manufacturer,model,yom,rate_single_shift,rate_double_shift,eq_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [id, item.machine_id||null, item.equipment_desc,
         item.quantity||1, item.unit||'No.', item.rate||0,
         item.rate_type||'per_month', item.amount||0,
         item.reg_no||null, item.manufacturer||null, item.model||null, item.yom||null,
         item.rate_single_shift||null, item.rate_double_shift||null, item.eq_type||null]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Work order updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateWorkOrder:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const deleteWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT status FROM hire_work_orders WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!['draft', 'rejected'].includes(existing.rows[0].status)) {
      return res.status(400).json({ error: 'Only draft or rejected WOs can be deleted' });
    }
    await db.query('DELETE FROM hire_work_orders WHERE id=$1', [id]);
    res.json({ message: 'Work order deleted' });
  } catch (err) {
    console.error('deleteWorkOrder:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const submitWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT status FROM hire_work_orders WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!['draft', 'rejected'].includes(existing.rows[0].status)) {
      return res.status(400).json({ error: 'WO cannot be submitted in its current status' });
    }
    await db.query(
      `UPDATE hire_work_orders SET status='submitted', submitted_by=$1, submitted_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [req.user.id, id]
    );
    res.json({ message: 'Submitted for approval' });
  } catch (err) {
    console.error('submitWorkOrder:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const approveL1 = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const existing = await db.query('SELECT status FROM hire_work_orders WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'submitted') {
      return res.status(400).json({ error: 'WO must be in submitted status for L1 approval' });
    }
    await db.query(
      `UPDATE hire_work_orders SET
         status='l1_approved', l1_approved_by=$1, l1_remarks=$2, l1_approved_at=NOW(), updated_at=NOW()
       WHERE id=$3`,
      [req.user.id, remarks||null, id]
    );
    res.json({ message: 'L1 approved' });
  } catch (err) {
    console.error('approveL1:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const approveFinal = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks, machine_id } = req.body;
    if (!machine_id) return res.status(400).json({ error: 'Asset selection is required for final approval' });
    const existing = await db.query('SELECT status FROM hire_work_orders WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'l1_approved') {
      return res.status(400).json({ error: 'WO must be L1 approved before final approval' });
    }
    await db.query(
      `UPDATE hire_work_orders SET
         status='approved', approved_by=$1, approved_remarks=$2, approved_at=NOW(),
         machine_id=$3, updated_at=NOW()
       WHERE id=$4`,
      [req.user.id, remarks||null, machine_id, id]
    );
    res.json({ message: 'Work order approved' });
  } catch (err) {
    console.error('approveFinal:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const rejectWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    if (!remarks?.trim()) return res.status(400).json({ error: 'Rejection remarks are required' });
    const existing = await db.query('SELECT status FROM hire_work_orders WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!['submitted', 'l1_approved'].includes(existing.rows[0].status)) {
      return res.status(400).json({ error: 'WO cannot be rejected in its current status' });
    }
    await db.query(
      `UPDATE hire_work_orders SET
         status='rejected', rejected_by=$1, rejected_remarks=$2, rejected_at=NOW(), updated_at=NOW()
       WHERE id=$3`,
      [req.user.id, remarks.trim(), id]
    );
    res.json({ message: 'Work order rejected' });
  } catch (err) {
    console.error('rejectWorkOrder:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const renewWorkOrder = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { start_date, end_date, tenure_months, terms_conditions, items } = req.body;

    const parentRes = await client.query('SELECT * FROM hire_work_orders WHERE id=$1', [id]);
    if (!parentRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Parent WO not found' }); }
    const parent = parentRes.rows[0];
    if (parent.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only approved WOs can be renewed' });
    }

    const projRes = await client.query('SELECT code FROM projects WHERE id=$1', [parent.project_id]);
    const wo_date = new Date().toISOString().slice(0, 10);
    const wo_number = await generateWoNumber(wo_date, projRes.rows[0]?.code || '');
    const renewalItems = items || (
      await client.query('SELECT * FROM hire_wo_items WHERE wo_id=$1', [id])
    ).rows;
    const totalValue = renewalItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

    const woRes = await client.query(
      `INSERT INTO hire_work_orders
         (wo_number,wo_date,indent_number,vendor_id,project_id,
          start_date,end_date,tenure_months,total_value,terms_conditions,
          parent_wo_id,renewal_count,created_by,updated_by,
          description_line,site_address,reporting_date,site_contact_name,site_contact_phone,mobilization_advance,
          signatory_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [wo_number, wo_date, parent.indent_number, parent.vendor_id, parent.project_id,
       start_date||null, end_date||null, tenure_months||parent.tenure_months,
       totalValue, terms_conditions||parent.terms_conditions,
       id, parent.renewal_count + 1, req.user.id, req.user.id,
       parent.description_line, parent.site_address, parent.reporting_date,
       parent.site_contact_name, parent.site_contact_phone, parent.mobilization_advance,
       parent.signatory_id]
    );
    const newWo = woRes.rows[0];

    for (const item of renewalItems) {
      await client.query(
        `INSERT INTO hire_wo_items
           (wo_id,machine_id,equipment_desc,quantity,unit,rate,rate_type,amount,
            reg_no,manufacturer,model,yom,rate_single_shift,rate_double_shift,eq_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [newWo.id, item.machine_id||null, item.equipment_desc,
         item.quantity||1, item.unit||'No.', item.rate||0,
         item.rate_type||'per_month', item.amount||0,
         item.reg_no||null, item.manufacturer||null, item.model||null, item.yom||null,
         item.rate_single_shift||null, item.rate_double_shift||null, item.eq_type||null]
      );
    }

    await client.query(
      `UPDATE hire_work_orders SET status='renewed', updated_at=NOW() WHERE id=$1`, [id]
    );

    await client.query('COMMIT');
    res.status(201).json({ data: newWo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('renewWorkOrder:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

// ── TERMS LIBRARY (shared, pick-able Additional/Special Conditions) ─────────

const getTermsLibrary = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM hire_terms_library ORDER BY category, description');
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getTermsLibrary:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createTermsLibraryItem = async (req, res) => {
  try {
    const { category, description, tags } = req.body;
    if (!category?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'Category and description are required' });
    }
    const result = await db.query(
      `INSERT INTO hire_terms_library (category, description, tags, created_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (category, description) DO UPDATE SET tags = EXCLUDED.tags, updated_at = NOW()
       RETURNING *`,
      [category.trim(), description.trim(), tags || [], req.user.id]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('createTermsLibraryItem:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateTermsLibraryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, description, tags } = req.body;
    if (!category?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'Category and description are required' });
    }
    const result = await db.query(
      `UPDATE hire_terms_library SET category=$1, description=$2, tags=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [category.trim(), description.trim(), tags || [], id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('updateTermsLibraryItem:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteTermsLibraryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM hire_terms_library WHERE id=$1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Condition deleted' });
  } catch (err) {
    console.error('deleteTermsLibraryItem:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── TERMS CATEGORIES (sub-headings shown in the picker's Name dropdown) ─────

const getTermsCategories = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM hire_terms_categories ORDER BY name');
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getTermsCategories:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createTermsCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Category name is required' });
    const result = await db.query(
      `INSERT INTO hire_terms_categories (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [name.trim()]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('createTermsCategory:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteTermsCategory = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const catRes = await client.query('SELECT name FROM hire_terms_categories WHERE id=$1', [id]);
    if (!catRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    await client.query('DELETE FROM hire_terms_library WHERE category=$1', [catRes.rows[0].name]);
    await client.query('DELETE FROM hire_terms_categories WHERE id=$1', [id]);
    await client.query('COMMIT');
    res.json({ message: 'Sub-heading and its conditions removed' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('deleteTermsCategory:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

// ── SIGNATORY DESIGNATIONS (managed list: Director, President, AGM, etc.) ───

const getSignatoryDesignations = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM hire_signatory_designations ORDER BY name');
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getSignatoryDesignations:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createSignatoryDesignation = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Designation name is required' });
    const result = await db.query(
      `INSERT INTO hire_signatory_designations (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [name.trim()]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('createSignatoryDesignation:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteSignatoryDesignation = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM hire_signatory_designations WHERE id=$1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Designation removed' });
  } catch (err) {
    console.error('deleteSignatoryDesignation:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── SIGNATORIES (authorized persons selectable per work order) ─────────────

const getSignatories = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM hire_signatories WHERE active=TRUE ORDER BY name');
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getSignatories:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createSignatory = async (req, res) => {
  try {
    const { name, designation } = req.body;
    if (!name?.trim() || !designation?.trim()) {
      return res.status(400).json({ error: 'Name and designation are required' });
    }
    const result = await db.query(
      `INSERT INTO hire_signatories (name, designation) VALUES ($1,$2) RETURNING *`,
      [name.trim(), designation.trim()]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('createSignatory:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateSignatory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, designation } = req.body;
    if (!name?.trim() || !designation?.trim()) {
      return res.status(400).json({ error: 'Name and designation are required' });
    }
    const result = await db.query(
      `UPDATE hire_signatories SET name=$1, designation=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [name.trim(), designation.trim(), id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('updateSignatory:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteSignatory = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE hire_signatories SET active=FALSE, updated_at=NOW() WHERE id=$1', [id]);
    res.json({ message: 'Signatory removed' });
  } catch (err) {
    console.error('deleteSignatory:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── LINK ASSET TO APPROVED WO ────────────────────────────────────────────────

const linkAssetToWO = async (req, res) => {
  try {
    const { id } = req.params;
    const { machine_id } = req.body;
    if (!machine_id) return res.status(400).json({ error: 'machine_id is required' });
    const r = await db.query(
      `UPDATE hire_work_orders SET machine_id=$1, updated_at=NOW(), updated_by=$2
       WHERE id=$3 AND status='approved' RETURNING id`,
      [machine_id, req.user.id, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Approved work order not found' });
    res.json({ message: 'Asset linked successfully' });
  } catch (err) {
    console.error('linkAssetToWO:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── APPROVED WOs FOR BILLING ─────────────────────────────────────────────────

const getApprovedWOsForBilling = async (req, res) => {
  try {
    const { vendor_id, machine_id } = req.query;
    const params = [];
    let where = `WHERE w.status = 'approved'`;
    if (vendor_id)  { params.push(vendor_id);  where += ` AND w.vendor_id=$${params.length}`; }
    if (machine_id) { params.push(machine_id); where += ` AND w.machine_id=$${params.length}`; }

    const { rows } = await db.query(`
      SELECT w.id, w.wo_number, w.vendor_id, w.project_id, w.machine_id,
             w.start_date, w.end_date, w.total_value, w.billing_rules,
             v.name AS vendor_name,
             p.code AS project_code,
             m2.slno AS machine_slno, m2.nickname AS machine_nickname, m2.eq_type AS machine_eq_type,
             COUNT(b.id)::int AS bill_count
      FROM hire_work_orders w
      LEFT JOIN hire_vendors v ON v.id = w.vendor_id
      LEFT JOIN projects p     ON p.id = w.project_id
      LEFT JOIN machines m2    ON m2.id = w.machine_id
      LEFT JOIN hire_bills b   ON b.wo_id = w.id
      ${where}
      GROUP BY w.id, v.name, p.code, m2.slno, m2.nickname, m2.eq_type
      ORDER BY w.wo_number
    `, params);
    res.json({ data: rows });
  } catch (err) {
    console.error('getApprovedWOsForBilling:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getVendors, createVendor, updateVendor, deleteVendor,
  getWorkOrders, getWorkOrder, createWorkOrder, updateWorkOrder, deleteWorkOrder,
  submitWorkOrder, approveL1, approveFinal, rejectWorkOrder, renewWorkOrder,
  linkAssetToWO, getApprovedWOsForBilling,
  getSignatoryDesignations, createSignatoryDesignation, deleteSignatoryDesignation,
  getSignatories, createSignatory, updateSignatory, deleteSignatory,
  getTermsLibrary, createTermsLibraryItem, updateTermsLibraryItem, deleteTermsLibraryItem,
  getTermsCategories, createTermsCategory, deleteTermsCategory,
};
