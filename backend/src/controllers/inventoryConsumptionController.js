const db = require('../config/db');

const nextNo = async (client) => {
  const r = await client.query(
    `SELECT consumption_number FROM inventory_consumption WHERE consumption_number ~ '^CON-[0-9]+$'
     ORDER BY LENGTH(consumption_number) DESC, consumption_number DESC LIMIT 1`
  );
  return r.rows.length ? `CON-${parseInt(r.rows[0].consumption_number.replace('CON-', '')) + 1}` : 'CON-1001';
};

const getAll = async (req, res) => {
  try {
    const { status, warehouse_id, consumption_type, machine_id, from, to } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (status)           { params.push(status);           where += ` AND ic.status=$${params.length}`; }
    if (warehouse_id)     { params.push(warehouse_id);     where += ` AND ic.warehouse_id=$${params.length}`; }
    if (consumption_type) { params.push(consumption_type); where += ` AND ic.consumption_type=$${params.length}`; }
    if (machine_id)       { params.push(machine_id);       where += ` AND ic.machine_id=$${params.length}`; }
    if (from)             { params.push(from);             where += ` AND ic.txn_date>=$${params.length}`; }
    if (to)               { params.push(to);               where += ` AND ic.txn_date<=$${params.length}`; }

    const r = await db.query(`
      SELECT ic.*, w.name AS warehouse_name,
             m.slno AS machine_slno, m.nickname AS machine_nickname,
             m.asset_code, et.name AS asset_type,
             wo.wo_number, p.name AS project_name, p.code AS project_code,
             u.name AS created_by_name,
             COUNT(ci.id) AS item_count,
             SUM(ci.consumption_qty) AS total_qty
      FROM inventory_consumption ic
      LEFT JOIN warehouses w ON w.id=ic.warehouse_id
      LEFT JOIN machines m ON m.id=ic.machine_id
      LEFT JOIN equipment_types et ON et.id=m.equipment_type_id
      LEFT JOIN hire_work_orders wo ON wo.id=ic.work_order_id
      LEFT JOIN projects p ON p.id=ic.project_id
      LEFT JOIN users u ON u.id=ic.created_by
      LEFT JOIN consumption_items ci ON ci.consumption_id=ic.id
      ${where}
      GROUP BY ic.id, w.name, m.slno, m.nickname, m.asset_code, et.name, wo.wo_number, p.name, p.code, u.name
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
        SELECT ic.*, w.name AS warehouse_name,
               m.slno AS machine_slno, m.nickname AS machine_nickname, m.asset_code,
               et.name AS asset_type, wo.wo_number, p.name AS project_name,
               u.name AS created_by_name
        FROM inventory_consumption ic
        LEFT JOIN warehouses w ON w.id=ic.warehouse_id
        LEFT JOIN machines m ON m.id=ic.machine_id
        LEFT JOIN equipment_types et ON et.id=m.equipment_type_id
        LEFT JOIN hire_work_orders wo ON wo.id=ic.work_order_id
        LEFT JOIN projects p ON p.id=ic.project_id
        LEFT JOIN users u ON u.id=ic.created_by
        WHERE ic.id=$1`, [req.params.id]),
      db.query(`
        SELECT ci.*, ii.part_name, ii.part_code, ii.unit AS item_unit,
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
      project_id, department, notes, adjustment, items
    } = req.body;
    if (!txn_date || !warehouse_id || !consumption_type || !items?.length)
      return res.status(400).json({ error: 'txn_date, warehouse_id, consumption_type, and items are required' });

    let sub_total = 0;
    for (const it of items) {
      sub_total += (parseFloat(it.consumption_qty) || 0) * (parseFloat(it.unit_rate) || 0);
    }
    const total_amount = sub_total + parseFloat(adjustment || 0);
    const consumption_number = await nextNo(client);

    const cR = await client.query(`
      INSERT INTO inventory_consumption
        (consumption_number, txn_date, warehouse_id, consumption_type, machine_id, work_order_id,
         project_id, department, status, sub_total, total_amount, notes, adjustment, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'submitted',$9,$10,$11,$12,$13) RETURNING *`,
      [consumption_number, txn_date, warehouse_id, consumption_type,
       machine_id || null, work_order_id || null, project_id || null,
       department || null, sub_total, total_amount, notes || null,
       parseFloat(adjustment) || 0, req.user.id]
    );
    const con = cR.rows[0];

    for (const it of items) {
      const qty = parseFloat(it.consumption_qty) || 0;
      const rate = parseFloat(it.unit_rate) || 0;
      const amount = qty * rate;

      // Check available stock
      const sR = await client.query(
        `SELECT current_qty, reserved_qty, average_cost FROM inventory_stock
         WHERE item_id=$1 AND warehouse_id=$2`, [it.item_id, warehouse_id]
      );
      const avail = parseFloat(sR.rows[0]?.current_qty) - parseFloat(sR.rows[0]?.reserved_qty || 0);
      if (avail < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient available stock for item id ${it.item_id}` });
      }

      await client.query(`
        INSERT INTO consumption_items (consumption_id, item_id, warehouse_id, location_id,
          demand_qty, allocated_qty, consumption_qty, unit, unit_rate, amount, remarks)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [con.id, it.item_id, warehouse_id, it.location_id || null,
         parseFloat(it.demand_qty) || null, parseFloat(it.allocated_qty) || null,
         qty, it.unit || null, rate, amount, it.remarks || null]
      );

      // Deduct stock
      await client.query(`
        UPDATE inventory_stock SET current_qty = current_qty - $1, last_updated=NOW()
        WHERE item_id=$2 AND warehouse_id=$3`, [qty, it.item_id, warehouse_id]
      );

      // Ledger
      const prevR = await client.query(
        `SELECT closing_qty FROM stock_ledger WHERE item_id=$1 AND warehouse_id=$2 ORDER BY created_at DESC LIMIT 1`,
        [it.item_id, warehouse_id]
      );
      const opening = parseFloat(prevR.rows[0]?.closing_qty) || 0;
      const avgCost = parseFloat(sR.rows[0]?.average_cost) || rate;

      await client.query(`
        INSERT INTO stock_ledger (item_id, warehouse_id, txn_date, txn_type, reference_type, reference_id,
          reference_no, opening_qty, out_qty, closing_qty, rate, amount, created_by)
        VALUES ($1,$2,$3,'CONSUMPTION','consumption',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [it.item_id, warehouse_id, txn_date, con.id, consumption_number,
         opening, qty, opening - qty, avgCost, qty * avgCost, req.user.id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ data: con });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('create consumption:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(
      `SELECT status FROM inventory_consumption WHERE id=$1`, [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    if (r.rows[0].status === 'approved') return res.status(400).json({ error: 'Approved consumptions cannot be deleted' });
    await db.query(`DELETE FROM inventory_consumption WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('remove consumption:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getOne, create, remove };
