const db      = require('../config/db')
const storage = require('../services/storageService')

// GET /machine-documents/:machineId
async function getByMachine(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, machine_id, doc_name, doc_number, file_name, file_mime,
              (file_key IS NOT NULL) AS has_file, created_at
       FROM machine_documents WHERE machine_id = $1 ORDER BY created_at ASC`,
      [req.params.machineId]
    )
    res.json({ data: rows })
  } catch (err) {
    console.error('Get machine documents error:', err)
    res.status(500).json({ error: 'Server error' })
  }
}

// POST /machine-documents
async function create(req, res) {
  try {
    const { machine_id, doc_name, doc_number, file_data, file_name, file_mime } = req.body
    if (!machine_id || !doc_name?.trim())
      return res.status(400).json({ error: 'machine_id and doc_name are required' })

    let file_key = null
    if (file_data && file_name) {
      try {
        const raw = file_data.includes(',') ? file_data.split(',')[1] : file_data
        file_key = await storage.uploadFile(raw, file_name, file_mime, 'machine-docs')
      } catch (uploadErr) {
        console.error('Spaces upload error:', uploadErr.message)
        return res.status(500).json({ error: 'File upload failed: ' + uploadErr.message })
      }
    }

    const { rows } = await db.query(
      `INSERT INTO machine_documents (machine_id, doc_name, doc_number, file_key, file_name, file_mime)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, doc_name, doc_number, file_name, file_mime,
               (file_key IS NOT NULL) AS has_file, created_at`,
      [machine_id, doc_name.trim(), doc_number?.trim() || null, file_key, file_name || null, file_mime || null]
    )
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    console.error('Create machine document error:', err)
    res.status(500).json({ error: 'Server error' })
  }
}

// GET /machine-documents/:id/download  → return signed URL as JSON
async function download(req, res) {
  try {
    const { rows } = await db.query(
      'SELECT file_key, file_name, file_mime FROM machine_documents WHERE id = $1', [req.params.id]
    )
    if (!rows.length || !rows[0].file_key)
      return res.status(404).json({ error: 'No file found' })
    const url = await storage.getSignedDownloadUrl(rows[0].file_key)
    res.json({ url, file_name: rows[0].file_name, file_mime: rows[0].file_mime })
  } catch (err) {
    console.error('Download machine document error:', err)
    res.status(500).json({ error: 'Server error' })
  }
}

// DELETE /machine-documents/:id
async function remove(req, res) {
  try {
    const { rows } = await db.query(
      'DELETE FROM machine_documents WHERE id = $1 RETURNING file_key', [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Document not found' })
    await storage.deleteFile(rows[0].file_key)
    res.json({ success: true })
  } catch (err) {
    console.error('Delete machine document error:', err)
    res.status(500).json({ error: 'Server error' })
  }
}

module.exports = { getByMachine, create, download, remove }
