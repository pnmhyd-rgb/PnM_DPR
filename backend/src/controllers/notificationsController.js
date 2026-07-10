const db = require('../config/db')

// GET /notifications — unified notification feed for all users
// Admin: pending resets + compliance alerts + breakdown reports + recently reviewed
// User: their own recently reviewed requests (last 14 days)
const getNotifications = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin'

    if (isAdmin) {
      const [pendingRes, complianceRes, breakdownRes, reviewedRes] = await Promise.all([
        // 1. Pending counter reset requests
        db.query(`
          SELECT r.id, r.machine_id, r.reading_code, r.reset_date, r.requested_at, r.remark,
                 u.name  AS requested_by_name,
                 m.slno, m.nickname, m.eq_type, m.asset_code
            FROM meter_reset_requests r
            LEFT JOIN users    u ON u.id = r.requested_by
            LEFT JOIN machines m ON m.id = r.machine_id
           WHERE r.status = 'pending'
           ORDER BY r.requested_at ASC
        `),

        // 2. Compliance alerts: expired or expiring within 30 days
        db.query(`
          SELECT mc.id, mc.doc_type, mc.doc_label, mc.doc_no, mc.expiry_date,
                 m.id AS machine_id, m.slno, m.nickname, m.eq_type, m.reg_no,
                 p.name AS project_name, p.code AS project_code,
                 (mc.expiry_date - CURRENT_DATE)::int AS days_remaining
            FROM machine_compliance mc
            JOIN machines m ON m.id = mc.machine_id
            JOIN projects p ON p.id = m.project_id
           WHERE m.active = true
             AND mc.expiry_date IS NOT NULL
             AND (mc.hidden IS NULL OR mc.hidden = false)
             AND mc.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
           ORDER BY mc.expiry_date ASC
        `),

        // 3. Breakdown entries awaiting admin review (submitted, breakdown > 0)
        db.query(`
          SELECT de.id, de.machine_id, de.entry_date, de.shift,
                 de.breakdown, de.remarks, de.work_done, de.status,
                 m.slno, m.nickname, m.eq_type,
                 p.code AS project_code,
                 u.name AS submitted_by_name
            FROM dpr_entries de
            JOIN machines m ON m.id = de.machine_id
            JOIN projects p ON p.id = m.project_id
            LEFT JOIN users u ON u.id = de.submitted_by
           WHERE de.breakdown > 0
             AND de.status = 'submitted'
           ORDER BY de.entry_date DESC, de.machine_id
           LIMIT 50
        `),

        // 4. Recently reviewed reset requests (last 7 days)
        db.query(`
          SELECT r.id, r.machine_id, r.status, r.reviewed_at, r.review_note, r.reset_date,
                 u1.name AS requested_by_name,
                 u2.name AS reviewed_by_name,
                 m.slno, m.nickname, m.eq_type
            FROM meter_reset_requests r
            LEFT JOIN users    u1 ON u1.id = r.requested_by
            LEFT JOIN users    u2 ON u2.id = r.reviewed_by
            LEFT JOIN machines m  ON m.id  = r.machine_id
           WHERE r.status IN ('approved', 'rejected')
             AND r.reviewed_at >= NOW() - INTERVAL '7 days'
           ORDER BY r.reviewed_at DESC
           LIMIT 20
        `),
      ])

      const compRows = complianceRes.rows
      return res.json({
        pending_resets:    pendingRes.rows,
        compliance: {
          expired:  compRows.filter(r => r.days_remaining <  0),
          critical: compRows.filter(r => r.days_remaining >= 0 && r.days_remaining <= 7),
          warning:  compRows.filter(r => r.days_remaining >  7),
        },
        breakdowns:        breakdownRes.rows,
        recently_reviewed: reviewedRes.rows,
      })
    } else {
      // Regular user: their own recently reviewed requests (last 14 days)
      const { rows } = await db.query(`
        SELECT r.id, r.machine_id, r.status, r.reviewed_at, r.review_note, r.reset_date,
               u.name AS reviewed_by_name,
               m.slno, m.nickname, m.eq_type
          FROM meter_reset_requests r
          LEFT JOIN users    u ON u.id = r.reviewed_by
          LEFT JOIN machines m ON m.id = r.machine_id
         WHERE r.requested_by = $1
           AND r.status IN ('approved', 'rejected')
           AND r.reviewed_at >= NOW() - INTERVAL '14 days'
         ORDER BY r.reviewed_at DESC
      `, [req.user.id])

      return res.json({ my_reviews: rows })
    }
  } catch (err) {
    console.error('getNotifications error:', err)
    res.status(500).json({ error: 'Server error' })
  }
}

module.exports = { getNotifications }
