const db = require('../config/db');

// ── HELPERS ──────────────────────────────────────────────────────────────────

function financialYearLabel(date) {
  const d = new Date(date);
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
}

async function generateIndentNumber(indentDate, projectCode) {
  const fyLabel = financialYearLabel(indentDate);
  const countRes = await db.query(
    `SELECT COUNT(*) FROM hire_indents WHERE indent_number LIKE $1`,
    [`RVR/HO/%/IND/${fyLabel}/%`]
  );
  const seq = parseInt(countRes.rows[0].count) + 1;
  return `RVR/HO/${projectCode}/IND/${fyLabel}/${String(seq).padStart(4, '0')}`;
}

const INDENT_SELECT = `
  SELECT hi.*,
    p.code  AS project_code,
    p.name  AS project_name,
    p.address AS project_address,
    u.name  AS created_by_name,
    su.name AS submitted_by_name,
    l1.name AS l1_approved_by_name,
    au.name AS approved_by_name,
    ru.name AS rejected_by_name,
    cu.name AS converted_by_name,
    hw.wo_number,
    (SELECT COUNT(*) FROM hire_indent_items ii WHERE ii.indent_id = hi.id)::int AS item_count
  FROM hire_indents hi
  LEFT JOIN projects p   ON p.id  = hi.project_id
  LEFT JOIN users u      ON u.id  = hi.created_by
  LEFT JOIN users su     ON su.id = hi.submitted_by
  LEFT JOIN users l1     ON l1.id = hi.l1_approved_by
  LEFT JOIN users au     ON au.id = hi.approved_by
  LEFT JOIN users ru     ON ru.id = hi.rejected_by
  LEFT JOIN users cu     ON cu.id = hi.converted_by
  LEFT JOIN hire_work_orders hw ON hw.id = hi.wo_id
`;

// ── LIST ─────────────────────────────────────────────────────────────────────

const getIndents = async (req, res) => {
  try {
    const { project_id, status } = req.query;
    const conditions = [];
    const params = [];
    if (project_id) { params.push(project_id); conditions.push(`hi.project_id = $${params.length}`); }
    if (status)     { params.push(status);     conditions.push(`hi.status = $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await db.query(`${INDENT_SELECT} ${where} ORDER BY hi.created_at DESC`, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('getIndents:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── SINGLE ───────────────────────────────────────────────────────────────────

const getIndent = async (req, res) => {
  try {
    const { id } = req.params;
    const [indentRes, itemsRes] = await Promise.all([
      db.query(`${INDENT_SELECT} WHERE hi.id = $1`, [id]),
      db.query('SELECT * FROM hire_indent_items WHERE indent_id = $1 ORDER BY id', [id]),
    ]);
    if (!indentRes.rows.length) return res.status(404).json({ error: 'Indent not found' });
    res.json({ data: { ...indentRes.rows[0], items: itemsRes.rows } });
  } catch (err) {
    console.error('getIndent:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── CREATE ───────────────────────────────────────────────────────────────────

const createIndent = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const userId = req.user.id;
    const {
      indent_date, project_id, purpose, required_from, required_to, tenure_months,
      shift_type, priority, site_address, site_contact_name, site_contact_phone, remarks,
      items = [],
    } = req.body;

    if (!project_id) return res.status(400).json({ error: 'Project is required' });
    const validItems = items.filter(i => i.equipment_desc?.trim());
    if (!validItems.length) return res.status(400).json({ error: 'Add at least one equipment item' });

    const projRes = await client.query('SELECT code FROM projects WHERE id = $1', [project_id]);
    if (!projRes.rows.length) return res.status(400).json({ error: 'Project not found' });

    const date = indent_date || new Date().toISOString().slice(0, 10);
    const indent_number = await generateIndentNumber(date, projRes.rows[0].code);

    const indentRes = await client.query(
      `INSERT INTO hire_indents
         (indent_number, indent_date, project_id, purpose, required_from, required_to, tenure_months,
          shift_type, priority, site_address, site_contact_name, site_contact_phone, remarks, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING *`,
      [indent_number, date, project_id, purpose||null, required_from||null, required_to||null,
       tenure_months||null, shift_type||'single', priority||'normal',
       site_address||null, site_contact_name||null, site_contact_phone||null, remarks||null, userId]
    );

    const indentId = indentRes.rows[0].id;
    for (const it of validItems) {
      await client.query(
        `INSERT INTO hire_indent_items
           (indent_id, equipment_desc, eq_type, quantity, unit, estimated_rate, rate_type, shift_type, purpose)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [indentId, it.equipment_desc.trim(), it.eq_type||null, it.quantity||1, it.unit||'No.',
         it.estimated_rate||null, it.rate_type||'per_month', it.shift_type||shift_type||'single', it.purpose||null]
      );
    }

    await client.query('COMMIT');
    const full = await db.query(`${INDENT_SELECT} WHERE hi.id = $1`, [indentId]);
    const fullItems = await db.query('SELECT * FROM hire_indent_items WHERE indent_id = $1 ORDER BY id', [indentId]);
    res.status(201).json({ data: { ...full.rows[0], items: fullItems.rows } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createIndent:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── UPDATE ───────────────────────────────────────────────────────────────────

const updateIndent = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await client.query('SELECT status FROM hire_indents WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'draft') return res.status(400).json({ error: 'Only draft indents can be edited' });

    const {
      indent_date, project_id, purpose, required_from, required_to, tenure_months,
      shift_type, priority, site_address, site_contact_name, site_contact_phone, remarks,
      items = [],
    } = req.body;

    await client.query(
      `UPDATE hire_indents SET
         indent_date=$1, project_id=$2, purpose=$3, required_from=$4, required_to=$5, tenure_months=$6,
         shift_type=$7, priority=$8, site_address=$9, site_contact_name=$10, site_contact_phone=$11,
         remarks=$12, updated_by=$13, updated_at=NOW()
       WHERE id=$14`,
      [indent_date, project_id, purpose||null, required_from||null, required_to||null, tenure_months||null,
       shift_type||'single', priority||'normal', site_address||null,
       site_contact_name||null, site_contact_phone||null, remarks||null, userId, id]
    );

    await client.query('DELETE FROM hire_indent_items WHERE indent_id = $1', [id]);
    for (const it of items.filter(i => i.equipment_desc?.trim())) {
      await client.query(
        `INSERT INTO hire_indent_items
           (indent_id, equipment_desc, eq_type, quantity, unit, estimated_rate, rate_type, shift_type, purpose)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, it.equipment_desc.trim(), it.eq_type||null, it.quantity||1, it.unit||'No.',
         it.estimated_rate||null, it.rate_type||'per_month', it.shift_type||shift_type||'single', it.purpose||null]
      );
    }

    await client.query('COMMIT');
    const full = await db.query(`${INDENT_SELECT} WHERE hi.id = $1`, [id]);
    const fullItems = await db.query('SELECT * FROM hire_indent_items WHERE indent_id = $1 ORDER BY id', [id]);
    res.json({ data: { ...full.rows[0], items: fullItems.rows } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateIndent:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── DELETE ───────────────────────────────────────────────────────────────────

const deleteIndent = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT status FROM hire_indents WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'draft') return res.status(400).json({ error: 'Only draft indents can be deleted' });
    await db.query('DELETE FROM hire_indents WHERE id = $1', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('deleteIndent:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── WORKFLOW ─────────────────────────────────────────────────────────────────

const submitIndent = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT status FROM hire_indents WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!['draft', 'rejected'].includes(existing.rows[0].status))
      return res.status(400).json({ error: 'Cannot submit from current status' });
    const result = await db.query(
      `UPDATE hire_indents SET status='submitted', submitted_by=$1, submitted_at=NOW(),
         rejected_by=NULL, rejected_remarks=NULL, rejected_at=NULL, updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [req.user.id, id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('submitIndent:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const approveL1Indent = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const existing = await db.query('SELECT status FROM hire_indents WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'submitted')
      return res.status(400).json({ error: 'Indent must be submitted first' });
    const result = await db.query(
      `UPDATE hire_indents SET status='l1_approved', l1_approved_by=$1, l1_remarks=$2, l1_approved_at=NOW(), updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [req.user.id, remarks||null, id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('approveL1Indent:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const approveFinalIndent = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const existing = await db.query('SELECT status FROM hire_indents WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'l1_approved')
      return res.status(400).json({ error: 'Indent must be L1 approved first' });
    const result = await db.query(
      `UPDATE hire_indents SET status='approved', approved_by=$1, approved_remarks=$2, approved_at=NOW(), updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [req.user.id, remarks||null, id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('approveFinalIndent:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const rejectIndent = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const existing = await db.query('SELECT status FROM hire_indents WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (['draft', 'converted'].includes(existing.rows[0].status))
      return res.status(400).json({ error: 'Cannot reject from current status' });
    const result = await db.query(
      `UPDATE hire_indents SET status='rejected', rejected_by=$1, rejected_remarks=$2, rejected_at=NOW(), updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [req.user.id, remarks||null, id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('rejectIndent:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── CONVERT TO WO ─────────────────────────────────────────────────────────────
// Creates a draft Work Order pre-filled from the indent, marks indent as converted.

const convertToWO = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const userId = req.user.id;

    const [indentRes, itemsRes] = await Promise.all([
      client.query(
        `SELECT hi.*, p.code AS project_code FROM hire_indents hi
         LEFT JOIN projects p ON p.id = hi.project_id WHERE hi.id = $1`,
        [id]
      ),
      client.query('SELECT * FROM hire_indent_items WHERE indent_id = $1 ORDER BY id', [id]),
    ]);

    if (!indentRes.rows.length) return res.status(404).json({ error: 'Indent not found' });
    const ind = indentRes.rows[0];
    if (ind.status !== 'approved') return res.status(400).json({ error: 'Only approved indents can be converted' });
    if (ind.wo_id) return res.status(400).json({ error: 'Already converted to a Work Order' });

    // Generate WO number using the same pattern as hireWorkOrdersController
    const woDate = new Date().toISOString().slice(0, 10);
    const fyLabel = financialYearLabel(woDate);
    const countRes = await client.query(
      `SELECT COUNT(*) FROM hire_work_orders WHERE wo_number LIKE $1`,
      [`RVR/HO/%/WO/${fyLabel}/%`]
    );
    const seq = parseInt(countRes.rows[0].count) + 1;
    const wo_number = `RVR/HO/${ind.project_code}/WO/${fyLabel}/${String(seq).padStart(4, '0')}`;

    const woRes = await client.query(
      `INSERT INTO hire_work_orders
         (wo_number, wo_date, indent_number, project_id, start_date, end_date, tenure_months,
          description_line, site_address, site_contact_name, site_contact_phone, total_value,
          created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$12) RETURNING *`,
      [wo_number, woDate, ind.indent_number, ind.project_id,
       ind.required_from||null, ind.required_to||null, ind.tenure_months||null,
       ind.purpose||null, ind.site_address||null, ind.site_contact_name||null,
       ind.site_contact_phone||null, userId]
    );
    const woId = woRes.rows[0].id;

    // Copy indent items → WO items
    for (const it of itemsRes.rows) {
      const isSingle = it.shift_type === 'single' || ind.shift_type === 'single';
      const isDouble = it.shift_type === 'double' || ind.shift_type === 'double';
      await client.query(
        `INSERT INTO hire_wo_items
           (wo_id, equipment_desc, eq_type, quantity, unit, rate, rate_type,
            rate_single_shift, rate_double_shift, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [woId, it.equipment_desc, it.eq_type||null, it.quantity, it.unit,
         it.estimated_rate||0, it.rate_type||'per_month',
         isSingle ? it.estimated_rate||null : null,
         isDouble ? it.estimated_rate||null : null,
         0]
      );
    }

    // Mark indent converted
    await client.query(
      `UPDATE hire_indents SET status='converted', wo_id=$1, converted_at=NOW(), converted_by=$2, updated_at=NOW()
       WHERE id=$3`,
      [woId, userId, id]
    );

    await client.query('COMMIT');
    res.json({ data: { wo_id: woId, wo_number } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('convertToWO:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

module.exports = {
  getIndents, getIndent,
  createIndent, updateIndent, deleteIndent,
  submitIndent, approveL1Indent, approveFinalIndent, rejectIndent,
  convertToWO,
};
