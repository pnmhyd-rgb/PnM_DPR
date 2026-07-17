const db = require('../config/db');

const STATUS_FLOW = {
  draft:          ['open', 'cancelled'],
  open:           ['assigned', 'in_progress', 'cancelled'],
  assigned:       ['in_progress', 'cancelled'],
  in_progress:    ['waiting_parts', 'completed', 'cancelled'],
  waiting_parts:  ['in_progress', 'cancelled'],
  completed:      ['closed', 'in_progress'],
  closed:         [],
  cancelled:      [],
};

const getAll = async (req, res) => {
  try {
    const { ticket_type, status, machine_id, project_id, from, to, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let q = `
      SELECT t.*,
             m.slno AS machine_slno, m.nickname AS machine_name, m.eq_type,
             p.code AS project_code, p.name AS project_name,
             rb.name AS reported_by_name, ab.name AS assigned_to_name,
             v.name AS vendor_name,
             COALESCE(t.total_parts_cost,0) + COALESCE(t.total_labour_cost,0) AS total_cost
        FROM service_tickets t
        LEFT JOIN machines m ON t.machine_id = m.id
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN users rb ON t.reported_by = rb.id
        LEFT JOIN users ab ON t.assigned_to = ab.id
        LEFT JOIN vendors v ON t.vendor_id = v.id
       WHERE 1=1
    `;
    const params = [];
    if (ticket_type) { params.push(ticket_type); q += ` AND t.ticket_type = $${params.length}`; }
    if (status) { params.push(status); q += ` AND t.status = $${params.length}`; }
    if (machine_id) { params.push(machine_id); q += ` AND t.machine_id = $${params.length}`; }
    if (project_id) { params.push(project_id); q += ` AND t.project_id = $${params.length}`; }
    if (from) { params.push(from); q += ` AND t.reported_date >= $${params.length}`; }
    if (to) { params.push(to); q += ` AND t.reported_date <= $${params.length}`; }
    if (search) { params.push(`%${search}%`); q += ` AND (t.ticket_number ILIKE $${params.length} OR t.title ILIKE $${params.length})`; }

    const countQ = q.replace(/SELECT t\.\*[\s\S]+?FROM/, 'SELECT COUNT(*) FROM');
    const totalR = await db.query(countQ, params);
    const total = parseInt(totalR.rows[0].count);

    q += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);
    const result = await db.query(q, params);
    res.json({ data: result.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('getAll tickets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getOne = async (req, res) => {
  try {
    const [ticketR, historyR, partsR] = await Promise.all([
      db.query(`
        SELECT t.*,
               m.slno AS machine_slno, m.nickname AS machine_name, m.eq_type,
               p.code AS project_code, p.name AS project_name,
               rb.name AS reported_by_name, ab.name AS assigned_to_name,
               v.name AS vendor_name,
               COALESCE(t.total_parts_cost,0) + COALESCE(t.total_labour_cost,0) AS total_cost
          FROM service_tickets t
          LEFT JOIN machines m ON t.machine_id = m.id
          LEFT JOIN projects p ON t.project_id = p.id
          LEFT JOIN users rb ON t.reported_by = rb.id
          LEFT JOIN users ab ON t.assigned_to = ab.id
          LEFT JOIN vendors v ON t.vendor_id = v.id
         WHERE t.id = $1`, [req.params.id]),
      db.query(`SELECT h.*, u.name AS changed_by_name FROM ticket_history h LEFT JOIN users u ON h.changed_by = u.id WHERE h.ticket_id = $1 ORDER BY h.changed_at ASC`, [req.params.id]),
      db.query(`SELECT * FROM ticket_parts WHERE ticket_id = $1 ORDER BY id`, [req.params.id]),
    ]);
    if (!ticketR.rows.length) return res.status(404).json({ error: 'Not found' });
    const ticket = ticketR.rows[0];
    ticket.history = historyR.rows;
    ticket.parts = partsR.rows;
    res.json({ data: ticket });
  } catch (err) {
    console.error('getOne ticket error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const {
      ticket_type, title, description, machine_id, project_id,
      reported_date, assigned_to, vendor_id, priority, meter_reading, estimated_hours
    } = req.body;

    if (!ticket_type || !title || !reported_date) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'ticket_type, title, reported_date are required' });
    }

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const lastT = await client.query(`SELECT ticket_number FROM service_tickets WHERE ticket_number LIKE $1 ORDER BY id DESC LIMIT 1`, [`QT-${today}-%`]);
    let seq = 1;
    if (lastT.rows.length) {
      const m = lastT.rows[0].ticket_number.match(/-(\d+)$/);
      if (m) seq = parseInt(m[1]) + 1;
    }
    const ticket_number = `QT-${today}-${String(seq).padStart(5, '0')}`;

    const r = await client.query(
      `INSERT INTO service_tickets
         (ticket_number, ticket_type, title, description, machine_id, project_id,
          reported_date, reported_by, assigned_to, vendor_id, priority,
          meter_reading, estimated_hours, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14) RETURNING *`,
      [ticket_number, ticket_type, title, description || null,
       machine_id || null, project_id || null, reported_date, req.user.id,
       assigned_to || null, vendor_id || null, priority || 'medium',
       meter_reading || null, estimated_hours || null, req.user.id]
    );
    const ticket = r.rows[0];

    await client.query(
      `INSERT INTO ticket_history (ticket_id, from_status, to_status, changed_by, changed_by_name, remarks)
       VALUES ($1, NULL, 'draft', $2, $3, 'Ticket created')`,
      [ticket.id, req.user.id, req.user.name]
    );

    await client.query('COMMIT');
    res.status(201).json({ data: ticket });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('create ticket error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const update = async (req, res) => {
  try {
    const {
      title, description, machine_id, project_id, assigned_to, vendor_id,
      priority, meter_reading, estimated_hours, actual_hours,
      start_date, completed_date, root_cause, resolution,
      total_parts_cost, total_labour_cost
    } = req.body;
    const r = await db.query(
      `UPDATE service_tickets SET
         title=$1, description=$2, machine_id=$3, project_id=$4,
         assigned_to=$5, vendor_id=$6, priority=$7, meter_reading=$8,
         estimated_hours=$9, actual_hours=$10, start_date=$11,
         completed_date=$12, root_cause=$13, resolution=$14,
         total_parts_cost=$15, total_labour_cost=$16, updated_at=NOW()
       WHERE id=$17 RETURNING *`,
      [title, description || null, machine_id || null, project_id || null,
       assigned_to || null, vendor_id || null, priority || 'medium',
       meter_reading || null, estimated_hours || null, actual_hours || null,
       start_date || null, completed_date || null, root_cause || null,
       resolution || null, total_parts_cost || 0, total_labour_cost || 0,
       req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('update ticket error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateStatus = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { status: newStatus, remarks } = req.body;
    const ticketR = await client.query('SELECT * FROM service_tickets WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!ticketR.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

    const ticket = ticketR.rows[0];
    const allowed = STATUS_FLOW[ticket.status] || [];
    if (!allowed.includes(newStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot move from ${ticket.status} to ${newStatus}` });
    }

    const updates = { status: newStatus, updated_at: 'NOW()' };
    if (newStatus === 'in_progress' && !ticket.start_date) updates.start_date = new Date().toISOString().slice(0, 10);
    if (newStatus === 'completed') updates.completed_date = new Date().toISOString().slice(0, 10);
    if (newStatus === 'closed') updates.closed_date = new Date().toISOString().slice(0, 10);

    const r = await client.query(
      `UPDATE service_tickets SET status=$1, start_date=COALESCE(start_date,$2), completed_date=COALESCE(completed_date,$3), closed_date=COALESCE(closed_date,$4), updated_at=NOW() WHERE id=$5 RETURNING *`,
      [newStatus, updates.start_date || null, updates.completed_date || null, updates.closed_date || null, req.params.id]
    );

    await client.query(
      `INSERT INTO ticket_history (ticket_id, from_status, to_status, changed_by, changed_by_name, remarks)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.id, ticket.status, newStatus, req.user.id, req.user.name, remarks || null]
    );

    await client.query('COMMIT');
    res.json({ data: r.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateStatus error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const addPart = async (req, res) => {
  try {
    const { item_id, part_name, part_code, qty_required, qty_consumed, unit, unit_cost } = req.body;
    if (!part_name) return res.status(400).json({ error: 'part_name is required' });
    const amount = unit_cost && qty_consumed ? parseFloat(unit_cost) * parseFloat(qty_consumed) : null;
    const r = await db.query(
      `INSERT INTO ticket_parts (ticket_id, item_id, part_name, part_code, qty_required, qty_consumed, unit, unit_cost, amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, item_id || null, part_name, part_code || null,
       qty_required || 0, qty_consumed || 0, unit || null, unit_cost || null, amount]
    );
    const total = await db.query(`SELECT COALESCE(SUM(amount),0) AS total FROM ticket_parts WHERE ticket_id=$1`, [req.params.id]);
    await db.query(`UPDATE service_tickets SET total_parts_cost=$1, updated_at=NOW() WHERE id=$2`, [total.rows[0].total, req.params.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error('addPart error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const removePart = async (req, res) => {
  try {
    await db.query('DELETE FROM ticket_parts WHERE id=$1 AND ticket_id=$2', [req.params.partId, req.params.id]);
    const total = await db.query(`SELECT COALESCE(SUM(amount),0) AS total FROM ticket_parts WHERE ticket_id=$1`, [req.params.id]);
    await db.query(`UPDATE service_tickets SET total_parts_cost=$1, updated_at=NOW() WHERE id=$2`, [total.rows[0].total, req.params.id]);
    res.json({ message: 'Removed' });
  } catch (err) {
    console.error('removePart error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getOne, create, update, updateStatus, addPart, removePart };
