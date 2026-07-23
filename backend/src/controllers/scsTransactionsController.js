const db = require('../config/db');

const generateTxNo = async (client) => {
  const year = new Date().getFullYear();
  const r = await (client || db).query(
    `SELECT COUNT(*) AS cnt FROM scs_transactions WHERE transaction_no LIKE $1`,
    [`SC-${year}-%`]
  );
  const seq = String(parseInt(r.rows[0].cnt) + 1).padStart(5, '0');
  return `SC-${year}-${seq}`;
};

// Unions real scs_transactions + legacy machine_scs executions not yet in scs_transactions
const ALL_TX_CTE = `
WITH all_tx AS (
  SELECT
    st.id,
    st.transaction_no,
    st.machine_scs_id,
    st.machine_id,
    st.execution_date,
    st.execution_hours,
    st.execution_km,
    st.prev_hours,
    st.prev_km,
    st.prev_date,
    st.scs_name,
    st.scs_description,
    st.scs_section,
    st.scs_sub_section,
    st.recommended_hours,
    st.recommended_days,
    st.recommended_km,
    st.ticket_ref,
    st.remark,
    st.parameter,
    st.executed_parameter,
    st.execution_site,
    st.executed_by,
    st.created_by,
    st.created_at,
    st.updated_by,
    st.updated_at,
    m.nickname,
    m.slno           AS machine_slno,
    m.eq_type,
    p.code           AS project_code,
    p.name           AS project_name,
    u1.name          AS executed_by_name,
    u2.name          AS created_by_name
  FROM scs_transactions st
  JOIN machines m ON m.id = st.machine_id
  LEFT JOIN projects p   ON p.id = m.project_id
  LEFT JOIN users u1 ON u1.id = st.executed_by
  LEFT JOIN users u2 ON u2.id = st.created_by

  UNION ALL

  SELECT
    ms.id * -1                                              AS id,
    NULL                                                    AS transaction_no,
    ms.id                                                   AS machine_scs_id,
    ms.machine_id,
    ms.last_done_date                                       AS execution_date,
    ms.last_done_hours                                      AS execution_hours,
    ms.last_done_km                                         AS execution_km,
    NULL::NUMERIC                                           AS prev_hours,
    NULL::NUMERIC                                           AS prev_km,
    NULL::DATE                                              AS prev_date,
    COALESCE(ms.custom_name, ets.custom_name, cs.name)     AS scs_name,
    ets.description                                         AS scs_description,
    ets.section                                             AS scs_section,
    ets.sub_section                                         AS scs_sub_section,
    COALESCE(ms.interval_hours, ets.interval_hours)        AS recommended_hours,
    COALESCE(ms.interval_days,  ets.interval_days)         AS recommended_days,
    COALESCE(ms.interval_km,    ets.interval_km)           AS recommended_km,
    NULL                                                    AS ticket_ref,
    ms.last_done_note                                       AS remark,
    NULL                                                    AS parameter,
    NULL                                                    AS executed_parameter,
    NULL                                                    AS execution_site,
    NULL::INTEGER                                           AS executed_by,
    NULL::INTEGER                                           AS created_by,
    ms.updated_at                                           AS created_at,
    NULL::INTEGER                                           AS updated_by,
    NULL::TIMESTAMPTZ                                       AS updated_at,
    m.nickname,
    m.slno           AS machine_slno,
    m.eq_type,
    p.code           AS project_code,
    p.name           AS project_name,
    NULL             AS executed_by_name,
    NULL             AS created_by_name
  FROM machine_scs ms
  JOIN machines m ON m.id = ms.machine_id
  LEFT JOIN equipment_type_scs ets ON ets.id = ms.eq_type_scs_id
  LEFT JOIN check_sheets cs        ON cs.id  = ms.check_sheet_id
  LEFT JOIN projects p             ON p.id   = m.project_id
  WHERE ms.last_done_date IS NOT NULL
    AND ms.id NOT IN (
      SELECT DISTINCT machine_scs_id FROM scs_transactions
      WHERE machine_scs_id IS NOT NULL
    )
)
`;

const getAll = async (req, res) => {
  try {
    const { machine_id, search, from_date, to_date } = req.query;
    const params = [];
    const where  = [];

    if (machine_id) { params.push(machine_id); where.push(`machine_id = $${params.length}`); }
    if (from_date)  { params.push(from_date);  where.push(`execution_date >= $${params.length}`); }
    if (to_date)    { params.push(to_date);    where.push(`execution_date <= $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      where.push(`(COALESCE(scs_name,'') ILIKE $${n} OR COALESCE(transaction_no,'') ILIKE $${n} OR COALESCE(nickname,'') ILIKE $${n} OR COALESCE(machine_slno,'') ILIKE $${n})`);
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const r = await db.query(
      `${ALL_TX_CTE} SELECT * FROM all_tx ${whereStr} ORDER BY execution_date DESC, created_at DESC NULLS LAST`,
      params
    );
    res.json({ data: r.rows });
  } catch (err) {
    console.error('getScsTransactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getById = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT st.*,
             m.nickname, m.slno AS machine_slno, m.eq_type,
             p.code AS project_code, p.name AS project_name,
             u1.name AS executed_by_name,
             u2.name AS created_by_name,
             u3.name AS updated_by_name
        FROM scs_transactions st
        JOIN machines m ON m.id = st.machine_id
        LEFT JOIN projects p   ON p.id = m.project_id
        LEFT JOIN users u1 ON u1.id = st.executed_by
        LEFT JOIN users u2 ON u2.id = st.created_by
        LEFT JOIN users u3 ON u3.id = st.updated_by
       WHERE st.id = $1
    `, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('getScsTransactionById error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const {
      machine_scs_id, execution_date,
      execution_hours, execution_km,
      ticket_ref, remark, parameter, executed_parameter, execution_site,
    } = req.body;

    if (!machine_scs_id || !execution_date) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'machine_scs_id and execution_date are required' });
    }

    const msRes = await client.query(`
      SELECT ms.*,
             m.id AS m_id, m.nickname, m.slno, m.eq_type, m.project_id,
             p.code AS project_code, p.name AS project_name,
             ets.custom_name   AS ets_name,
             ets.section       AS ets_section,
             ets.sub_section   AS ets_sub_section,
             ets.description   AS ets_description,
             ets.interval_hours AS rec_hours,
             ets.interval_days  AS rec_days,
             ets.interval_km    AS rec_km
        FROM machine_scs ms
        JOIN machines m ON m.id = ms.machine_id
        LEFT JOIN projects p             ON p.id = m.project_id
        LEFT JOIN equipment_type_scs ets ON ets.id = ms.eq_type_scs_id
       WHERE ms.id = $1
    `, [machine_scs_id]);

    if (!msRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Machine SCS not found' });
    }

    const ms = msRes.rows[0];

    let site = execution_site;
    if (!site && ms.project_code) {
      site = ms.project_name ? `${ms.project_code} (${ms.project_name})` : ms.project_code;
    }

    const scs_name      = ms.custom_name || ms.ets_name || '—';
    const transaction_no = await generateTxNo(client);
    const exec_h        = execution_hours != null ? parseFloat(execution_hours) : null;
    const exec_km       = execution_km    != null ? parseFloat(execution_km)    : null;

    const r = await client.query(`
      INSERT INTO scs_transactions (
        transaction_no, machine_scs_id, machine_id,
        execution_date, execution_hours, execution_km,
        prev_hours, prev_km, prev_date,
        scs_name, scs_description, scs_section, scs_sub_section,
        recommended_hours, recommended_days, recommended_km,
        ticket_ref, remark, parameter, executed_parameter, execution_site,
        executed_by, created_by, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
        $17,$18,$19,$20,$21,$22,$23,NOW()
      ) RETURNING *
    `, [
      transaction_no, machine_scs_id, ms.m_id,
      execution_date, exec_h, exec_km,
      ms.last_done_hours ?? null, ms.last_done_km ?? null, ms.last_done_date ?? null,
      scs_name,
      ms.ets_description || null,
      ms.ets_section     || null,
      ms.ets_sub_section || null,
      ms.rec_hours || ms.interval_hours || null,
      ms.rec_days  || ms.interval_days  || null,
      ms.rec_km    || ms.interval_km    || null,
      ticket_ref || null, remark || null, parameter || null,
      executed_parameter || null, site || null,
      req.user?.id || null, req.user?.id || null,
    ]);

    await client.query(`
      UPDATE machine_scs SET
        last_done_date  = $1,
        last_done_hours = $2,
        last_done_km    = $3,
        last_done_note  = $4,
        updated_at      = NOW()
      WHERE id = $5
    `, [execution_date, exec_h, exec_km, remark || null, machine_scs_id]);

    await client.query('COMMIT');
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createScsTransaction error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const update = async (req, res) => {
  try {
    const { ticket_ref, remark, parameter, executed_parameter, execution_site } = req.body;
    const r = await db.query(`
      UPDATE scs_transactions SET
        ticket_ref = $1, remark = $2, parameter = $3,
        executed_parameter = $4, execution_site = $5,
        updated_by = $6, updated_at = NOW()
      WHERE id = $7 RETURNING *
    `, [ticket_ref || null, remark || null, parameter || null,
        executed_parameter || null, execution_site || null,
        req.user?.id || null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('updateScsTransaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(`DELETE FROM scs_transactions WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('deleteScsTransaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getById, create, update, remove };
