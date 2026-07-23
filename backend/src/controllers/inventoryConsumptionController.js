const db = require('../config/db');

const nextNo = async (client) => {
  const r = await client.query(
    `SELECT consumption_number FROM inventory_consumption WHERE consumption_number ~ '^CON-[0-9]+$'
     ORDER BY LENGTH(consumption_number) DESC, consumption_number DESC LIMIT 1`
  );
  return r.rows.length
    ? `CON-${parseInt(r.rows[0].consumption_number.replace('CON-', '')) + 1}`
    : 'CON-1001';
};

const getAll = async (req, res) => {
  try {
    const { status, warehouse_id, consumption_type, machine_id, from, to, search } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (status)           { params.push(status);           where += ` AND ic.status=$${params.length}`; }
    if (warehouse_id)     { params.push(warehouse_id);     where += ` AND ic.warehouse_id=$${params.length}`; }
    if (consumption_type) { params.push(consumption_type); where += ` AND ic.consumption_type=$${params.length}`; }
    if (machine_id)       { params.push(machine_id);       where += ` AND ic.machine_id=$${params.length}`; }
    if (from)             { params.push(from);             where += ` AND ic.txn_date>=$${params.length}`; }
    if (to)               { params.push(to);               where += ` AND ic.txn_date<=$${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (ic.consumption_number ILIKE $${params.length} OR m.nickname ILIKE $${params.length} OR m.slno ILIKE $${params.length})`;
    }

    const r = await db.query(`
      SELECT ic.*, w.name AS warehouse_name,
             m.slno AS machine_slno, m.nickname AS machine_nickname,
             m.asset_code, et.name AS asset_type,
             wo.wo_number, p.name AS project_name, p.code AS project_code,
             u.name AS created_by_name,
             ua.name AS approved_by_name,
             COUNT(ci.id)::int AS item_count,
             SUM(ci.consumption_qty)::numeric AS total_qty
      FROM inventory_consumption ic
      LEFT JOIN warehouses w ON w.id=ic.warehouse_id
      LEFT JOIN machines m ON m.id=ic.machine_id
      LEFT JOIN equipment_types et ON LOWER(et.name) = LOWER(m.eq_type)
      LEFT JOIN hire_work_orders wo ON wo.id=ic.work_order_id
      LEFT JOIN projects p ON p.id=ic.project_id
      LEFT JOIN users u ON u.id=ic.created_by
      LEFT JOIN users ua ON ua.id=ic.approved_by
      LEFT JOIN consumption_items ci ON ci.consumption_id=ic.id
      ${where}
      GROUP BY ic.id, w.name, m.slno, m.nickname, m.asset_code, et.name,
               wo.wo_number, p.name, p.code, u.name, ua.name
      ORDER BY ic.txn_date DESC, ic.created_at DESC
    `, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('getAll consumption:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getOne = async (req, res) => {
  try {
    const [con, items] = await Promise.all([
      db.query(`
        SELECT ic.*, w.name AS warehouse_name, w.address AS warehouse_address,
               m.slno AS machine_slno, m.nickname AS machine_nickname, m.asset_code,
               et.name AS asset_type, wo.wo_number, p.name AS project_name,
               u.name AS created_by_name, ua.name AS approved_by_name,
               st.ticket_number, st.title AS ticket_title
        FROM inventory_consumption ic
        LEFT JOIN warehouses w ON w.id=ic.warehouse_id
        LEFT JOIN machines m ON m.id=ic.machine_id
        LEFT JOIN equipment_types et ON LOWER(et.name) = LOWER(m.eq_type)
        LEFT JOIN hire_work_orders wo ON wo.id=ic.work_order_id
        LEFT JOIN projects p ON p.id=ic.project_id
        LEFT JOIN users u ON u.id=ic.created_by
        LEFT JOIN users ua ON ua.id=ic.approved_by
        LEFT JOIN service_tickets st ON st.id=ic.ticket_id
        WHERE ic.id=$1`, [req.params.id]),
      db.query(`
        SELECT ci.*, ii.part_name, ii.part_code, ii.oem_number, ii.unit AS item_unit,
               w.name AS warehouse_name, wl.rack, wl.shelf
        FROM consumption_items ci
        JOIN inventory_items ii ON ii.id=ci.item_id
        LEFT JOIN warehouses w ON w.id=ci.warehouse_id
        LEFT JOIN warehouse_locations wl ON wl.id=ci.location_id
        WHERE ci.consumption_id=$1 ORDER BY ci.id`, [req.params.id])
    ]);
    if (!con.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ...con.rows[0], items: items.rows } });
  } catch (err) {
    console.error('getOne consumption:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const {
      txn_date, warehouse_id, consumption_type, machine_id, work_order_id,
      project_id, department, notes, adjustment, items, status, ticket_id,
    } = req.body;

    if (!txn_date || !warehouse_id || !consumption_type || !items?.length)
      return res.status(400).json({ error: 'txn_date, warehouse_id, consumption_type, and items are required' });

    const txnStatus = status === 'draft' ? 'draft' : 'submitted';

    let sub_total = 0;
    for (const it of items) {
      sub_total += (parseFloat(it.consumption_qty) || 0) * (parseFloat(it.unit_rate) || 0);
    }
    const total_amount = sub_total + parseFloat(adjustment || 0);
    const consumption_number = await nextNo(client);

    const cR = await client.query(`
      INSERT INTO inventory_consumption
        (consumption_number, txn_date, warehouse_id, consumption_type, machine_id, work_order_id,
         project_id, department, status, sub_total, total_amount, notes, adjustment, ticket_id, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [consumption_number, txn_date, warehouse_id, consumption_type,
       machine_id || null, work_order_id || null, project_id || null,
       department || null, txnStatus, sub_total, total_amount, notes || null,
       parseFloat(adjustment) || 0, ticket_id || null, req.user.id]
    );
    const con = cR.rows[0];

    for (const it of items) {
      const qty  = parseFloat(it.consumption_qty) || 0;
      const rate = parseFloat(it.unit_rate) || 0;

      await client.query(`
        INSERT INTO consumption_items
          (consumption_id, item_id, warehouse_id, location_id,
           demand_qty, allocated_qty, consumption_qty, unit, unit_rate, amount, remarks)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [con.id, it.item_id, warehouse_id, it.location_id || null,
         parseFloat(it.demand_qty) || null, parseFloat(it.allocated_qty) || null,
         qty, it.unit || null, rate, qty * rate, it.remarks || null]
      );

      if (txnStatus === 'submitted') {
        const sR = await client.query(
          `SELECT current_qty, average_cost FROM inventory_stock
           WHERE item_id=$1 AND warehouse_id=$2`, [it.item_id, warehouse_id]
        );
        const avgCost = parseFloat(sR.rows[0]?.average_cost) || rate;

        await client.query(
          `INSERT INTO inventory_stock (item_id, warehouse_id, current_qty, last_updated)
           VALUES ($1,$2,-$3,NOW())
           ON CONFLICT (item_id, warehouse_id) DO UPDATE
             SET current_qty = inventory_stock.current_qty - $3, last_updated=NOW()`,
          [it.item_id, warehouse_id, qty]
        );

        const prevR = await client.query(
          `SELECT closing_qty FROM stock_ledger WHERE item_id=$1 AND warehouse_id=$2
           ORDER BY created_at DESC LIMIT 1`, [it.item_id, warehouse_id]
        );
        const opening = parseFloat(prevR.rows[0]?.closing_qty) || 0;

        await client.query(`
          INSERT INTO stock_ledger
            (item_id, warehouse_id, txn_date, txn_type, reference_type, reference_id,
             reference_no, opening_qty, out_qty, closing_qty, rate, amount, created_by)
          VALUES ($1,$2,$3,'CONSUMPTION','consumption',$4,$5,$6,$7,$8,$9,$10,$11)`,
          [it.item_id, warehouse_id, txn_date, con.id, consumption_number,
           opening, qty, opening - qty, avgCost, qty * avgCost, req.user.id]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ data: con });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('create consumption:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// Update draft header + items (full replace of items)
const update = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const chk = await client.query(
      `SELECT status FROM inventory_consumption WHERE id=$1`, [req.params.id]
    );
    if (!chk.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (chk.rows[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only draft consumptions can be edited' });
    }

    const {
      txn_date, warehouse_id, consumption_type, machine_id, work_order_id,
      project_id, department, notes, adjustment, items, ticket_id,
    } = req.body;

    if (!txn_date || !warehouse_id || !consumption_type || !items?.length)
      return res.status(400).json({ error: 'txn_date, warehouse_id, consumption_type, and items are required' });

    let sub_total = 0;
    for (const it of items) {
      sub_total += (parseFloat(it.consumption_qty) || 0) * (parseFloat(it.unit_rate) || 0);
    }
    const total_amount = sub_total + parseFloat(adjustment || 0);

    await client.query(`
      UPDATE inventory_consumption SET
        txn_date=$1, warehouse_id=$2, consumption_type=$3, machine_id=$4,
        work_order_id=$5, project_id=$6, department=$7, notes=$8,
        adjustment=$9, sub_total=$10, total_amount=$11, ticket_id=$12,
        updated_by=$13, updated_at=NOW()
      WHERE id=$14
    `, [
      txn_date, warehouse_id, consumption_type, machine_id || null,
      work_order_id || null, project_id || null, department || null,
      notes || null, parseFloat(adjustment) || 0, sub_total, total_amount,
      ticket_id || null, req.user.id, req.params.id,
    ]);

    await client.query(`DELETE FROM consumption_items WHERE consumption_id=$1`, [req.params.id]);
    for (const it of items) {
      const qty  = parseFloat(it.consumption_qty) || 0;
      const rate = parseFloat(it.unit_rate) || 0;
      await client.query(`
        INSERT INTO consumption_items
          (consumption_id, item_id, warehouse_id, location_id,
           demand_qty, allocated_qty, consumption_qty, unit, unit_rate, amount, remarks)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [
        req.params.id, it.item_id, warehouse_id, it.location_id || null,
        parseFloat(it.demand_qty) || null, parseFloat(it.allocated_qty) || null,
        qty, it.unit || null, rate, qty * rate, it.remarks || null,
      ]);
    }

    await client.query('COMMIT');
    const r = await db.query(`SELECT * FROM inventory_consumption WHERE id=$1`, [req.params.id]);
    res.json({ data: r.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('update consumption:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// Submit a saved draft → check & deduct stock
const submitDraft = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const conRes = await client.query(
      `SELECT * FROM inventory_consumption WHERE id=$1 AND status='draft'`, [req.params.id]
    );
    if (!conRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Draft consumption not found' });
    }
    const con = conRes.rows[0];

    const itemsRes = await client.query(
      `SELECT * FROM consumption_items WHERE consumption_id=$1`, [con.id]
    );
    if (!itemsRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No items on this consumption' });
    }

    for (const it of itemsRes.rows) {
      const qty = parseFloat(it.consumption_qty) || 0;
      const wid = it.warehouse_id || con.warehouse_id;

      const sR = await client.query(
        `SELECT current_qty, average_cost FROM inventory_stock WHERE item_id=$1 AND warehouse_id=$2`,
        [it.item_id, wid]
      );
      const avgCost = parseFloat(sR.rows[0]?.average_cost) || parseFloat(it.unit_rate) || 0;

      await client.query(
        `INSERT INTO inventory_stock (item_id, warehouse_id, current_qty, last_updated)
         VALUES ($1,$2,-$3,NOW())
         ON CONFLICT (item_id, warehouse_id) DO UPDATE
           SET current_qty = inventory_stock.current_qty - $3, last_updated=NOW()`,
        [it.item_id, wid, qty]
      );

      const prevR = await client.query(
        `SELECT closing_qty FROM stock_ledger WHERE item_id=$1 AND warehouse_id=$2 ORDER BY created_at DESC LIMIT 1`,
        [it.item_id, wid]
      );
      const opening = parseFloat(prevR.rows[0]?.closing_qty) || 0;

      await client.query(`
        INSERT INTO stock_ledger
          (item_id, warehouse_id, txn_date, txn_type, reference_type, reference_id,
           reference_no, opening_qty, out_qty, closing_qty, rate, amount, created_by)
        VALUES ($1,$2,$3,'CONSUMPTION','consumption',$4,$5,$6,$7,$8,$9,$10,$11)
      `, [
        it.item_id, wid, con.txn_date, con.id, con.consumption_number,
        opening, qty, opening - qty, avgCost, qty * avgCost, req.user.id,
      ]);
    }

    await client.query(
      `UPDATE inventory_consumption SET status='submitted', updated_by=$1, updated_at=NOW() WHERE id=$2`,
      [req.user.id, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Submitted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('submitDraft consumption:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// Approve a submitted consumption (admin only)
const approve = async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE inventory_consumption SET status='approved', approved_by=$1 WHERE id=$2 AND status='submitted' RETURNING id`,
      [req.user.id, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Submitted consumption not found' });
    res.json({ message: 'Approved' });
  } catch (err) {
    console.error('approve consumption:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(
      `SELECT status FROM inventory_consumption WHERE id=$1`, [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    if (r.rows[0].status === 'approved')
      return res.status(400).json({ error: 'Approved consumptions cannot be deleted' });
    await db.query(`DELETE FROM inventory_consumption WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('remove consumption:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getOne, create, update, submitDraft, approve, remove };
