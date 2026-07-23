const db = require('../config/db')
const storage = require('../services/storageService')

function calcStatus(expiryDate) {
  if (!expiryDate) return { status: 'na', days: null }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(expiryDate)
  const days = Math.ceil((exp - today) / 86400000)
  let status = 'valid'
  if (days < 0)       status = 'expired'
  else if (days <= 7)  status = 'critical'
  else if (days <= 30) status = 'warning'
  return { status, days }
}

// GET /compliance — all active machines with their docs pivoted
// Excludes attachment_data (large) — returns has_attachment flag only
async function getAll(req, res) {
  const { project_code, ownership } = req.query
  const params = []; const conds = ['m.active = true']
  if (project_code) { params.push(project_code); conds.push(`p.code = $${params.length}`) }
  if (ownership)    { params.push(ownership);    conds.push(`m.ownership = $${params.length}`) }

  try {
    const { rows } = await db.query(`
      SELECT m.id AS machine_id, m.slno, m.reg_no, m.eq_type, m.capacity, m.ownership,
             m.asset_type, m.nickname,
             p.code AS project_code,
             et.asset_group, et.asset_cat,
             mc.id AS doc_id, mc.doc_type, mc.doc_label,
             mc.doc_no, mc.issued_date, mc.expiry_date, mc.issued_by, mc.notes,
             (mc.attachment_key IS NOT NULL) AS has_attachment,
             mc.attachment_name, mc.attachment_mime
      FROM machines m
      JOIN projects p ON m.project_id = p.id
      LEFT JOIN equipment_types et ON LOWER(et.name) = LOWER(m.eq_type)
      LEFT JOIN machine_compliance mc ON mc.machine_id = m.id AND (mc.hidden IS NULL OR mc.hidden = false)
      WHERE ${conds.join(' AND ')}
      ORDER BY COALESCE(et.asset_group,'~'), COALESCE(et.asset_cat,'~'), m.eq_type, p.code, m.slno, mc.doc_type, mc.doc_label
    `, params)

    const STATUS_PRIORITY = { expired: 4, critical: 3, warning: 2, valid: 1, na: 0 }
    const machineMap = {}

    for (const row of rows) {
      if (!machineMap[row.machine_id]) {
        machineMap[row.machine_id] = {
          machine_id: row.machine_id,
          slno: row.slno, reg_no: row.reg_no, eq_type: row.eq_type,
          capacity: row.capacity, ownership: row.ownership,
          asset_type: row.asset_type,
          nickname: row.nickname,
          project_code: row.project_code,
          asset_group: row.asset_group || '',
          asset_cat: row.asset_cat || '',
          docs: {}, worst_status: 'na',
        }
      }
      if (row.doc_id) {
        const { status, days } = calcStatus(row.expiry_date)
        const key = row.doc_type === 'custom' ? `custom__${row.doc_label}` : row.doc_type
        machineMap[row.machine_id].docs[key] = {
          id: row.doc_id, doc_type: row.doc_type, doc_label: row.doc_label,
          doc_no: row.doc_no, issued_date: row.issued_date,
          expiry_date: row.expiry_date, issued_by: row.issued_by, notes: row.notes,
          has_attachment: row.has_attachment,
          attachment_name: row.attachment_name,
          attachment_mime: row.attachment_mime,
          status, days,
        }
        const cur = machineMap[row.machine_id].worst_status
        if ((STATUS_PRIORITY[status] || 0) > (STATUS_PRIORITY[cur] || 0))
          machineMap[row.machine_id].worst_status = status
      }
    }

    res.json({ data: Object.values(machineMap) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB error' })
  }
}

// GET /compliance/summary
async function getSummary(req, res) {
  try {
    const { rows } = await db.query(`
      SELECT mc.expiry_date
      FROM machine_compliance mc
      JOIN machines m ON m.id = mc.machine_id
      WHERE m.active = true
    `)
    const summary = { expired: 0, critical: 0, warning: 0, valid: 0, na: 0, total: 0 }
    for (const row of rows) {
      const { status } = calcStatus(row.expiry_date)
      summary[status] = (summary[status] || 0) + 1
      summary.total++
    }
    res.json({ data: summary })
  } catch (err) {
    res.status(500).json({ error: 'DB error' })
  }
}

// GET /compliance/upcoming?days=30
async function getUpcoming(req, res) {
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 0), 365)
  try {
    const { rows } = await db.query(`
      SELECT mc.id, mc.doc_type, mc.doc_label, mc.doc_no, mc.expiry_date, mc.issued_by,
             m.id AS machine_id, m.slno, m.reg_no, m.eq_type, m.ownership,
             p.code AS project_code,
             et.asset_group, et.asset_cat,
             (mc.expiry_date - CURRENT_DATE)::int AS days_remaining
      FROM machine_compliance mc
      JOIN machines m ON m.id = mc.machine_id
      JOIN projects p ON p.id = m.project_id
      LEFT JOIN equipment_types et ON LOWER(et.name) = LOWER(m.eq_type)
      WHERE m.active = true AND mc.expiry_date IS NOT NULL
        AND mc.expiry_date <= CURRENT_DATE + ($1 * INTERVAL '1 day')
      ORDER BY mc.expiry_date ASC
    `, [days])
    res.json({ data: rows })
  } catch (err) {
    res.status(500).json({ error: 'DB error' })
  }
}

// GET /compliance/machine/:machineId
// Returns metadata + attachment_name/mime but NOT attachment_data (downloaded separately)
async function getMachineCompliance(req, res) {
  const { machineId } = req.params
  try {
    const { rows } = await db.query(
      `SELECT id, machine_id, doc_type, doc_label, doc_no, issued_date, expiry_date,
              issued_by, notes, hidden, attachment_name, attachment_key, attachment_mime, created_at, updated_at
       FROM machine_compliance
       WHERE machine_id = $1
       ORDER BY doc_type, doc_label`,
      [machineId]
    )
    res.json({ data: rows })
  } catch (err) {
    res.status(500).json({ error: 'DB error' })
  }
}

// GET /compliance/:id/attachment — redirect to signed Spaces URL
async function getAttachment(req, res) {
  const { id } = req.params
  try {
    const { rows } = await db.query(
      'SELECT attachment_name, attachment_key, attachment_mime FROM machine_compliance WHERE id = $1',
      [id]
    )
    if (!rows.length || !rows[0].attachment_key)
      return res.status(404).json({ error: 'No attachment found' })
    const signedUrl = await storage.getSignedDownloadUrl(rows[0].attachment_key)
    res.redirect(302, signedUrl)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB error' })
  }
}

// POST /compliance/batch — upsert multiple docs for one machine
// Attachment handling:
//   - attachment_data present  → upload to Spaces, store key
//   - attachment_data absent   → keep existing (COALESCE)
//   - clear_attachment: true   → delete from Spaces and clear DB fields after upsert
async function batchUpsert(req, res) {
  const { machine_id, docs } = req.body
  if (!machine_id || !Array.isArray(docs))
    return res.status(400).json({ error: 'machine_id and docs[] required' })

  const client = await db.getClient()
  try {
    await client.query('BEGIN')
    const results = []

    for (const doc of docs) {
      const {
        doc_type, doc_label = '', doc_no, issued_date, expiry_date, issued_by, notes,
        attachment_name, attachment_data, attachment_mime, clear_attachment,
        hidden = false,
      } = doc

      let newKey = null
      if (attachment_data && attachment_name) {
        newKey = await storage.uploadFile(attachment_data, attachment_name, attachment_mime)
      }

      const { rows } = await client.query(`
        INSERT INTO machine_compliance
          (machine_id, doc_type, doc_label, doc_no, issued_date, expiry_date, issued_by, notes,
           hidden, attachment_name, attachment_key, attachment_mime, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
        ON CONFLICT (machine_id, doc_type, doc_label) DO UPDATE SET
          doc_no          = EXCLUDED.doc_no,
          issued_date     = EXCLUDED.issued_date,
          expiry_date     = EXCLUDED.expiry_date,
          issued_by       = EXCLUDED.issued_by,
          notes           = EXCLUDED.notes,
          hidden          = EXCLUDED.hidden,
          attachment_name = COALESCE(EXCLUDED.attachment_name, machine_compliance.attachment_name),
          attachment_key  = COALESCE(EXCLUDED.attachment_key,  machine_compliance.attachment_key),
          attachment_mime = COALESCE(EXCLUDED.attachment_mime, machine_compliance.attachment_mime),
          updated_at      = NOW()
        RETURNING id, doc_type, doc_label, expiry_date, hidden, attachment_name, attachment_key, attachment_mime
      `, [
        machine_id, doc_type, doc_label,
        doc_no || null, issued_date || null, expiry_date || null, issued_by || null, notes || null,
        hidden ? true : false,
        newKey ? attachment_name : null,
        newKey,
        newKey ? attachment_mime : null,
      ])

      if (clear_attachment && rows[0]?.id) {
        const { rows: existing } = await client.query(
          'SELECT attachment_key FROM machine_compliance WHERE id = $1', [rows[0].id]
        )
        await storage.deleteFile(existing[0]?.attachment_key)
        await client.query(
          `UPDATE machine_compliance SET attachment_name=NULL, attachment_key=NULL, attachment_mime=NULL WHERE id=$1`,
          [rows[0].id]
        )
        rows[0].attachment_name = null
        rows[0].attachment_key  = null
        rows[0].attachment_mime = null
      }
      results.push(rows[0])
    }

    await client.query('COMMIT')
    res.json({ data: results })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'DB error' })
  } finally {
    client.release()
  }
}

// DELETE /compliance/:id
async function remove(req, res) {
  const { id } = req.params
  try {
    const { rows } = await db.query(
      'SELECT attachment_key FROM machine_compliance WHERE id = $1', [id]
    )
    await storage.deleteFile(rows[0]?.attachment_key)
    await db.query('DELETE FROM machine_compliance WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'DB error' })
  }
}

module.exports = { getAll, getSummary, getUpcoming, getMachineCompliance, getAttachment, batchUpsert, remove }
