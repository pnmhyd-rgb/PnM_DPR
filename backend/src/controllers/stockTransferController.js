const db = require('../config/db');

const nextNo = async (client) => {
  const r = await client.query(
    `SELECT transfer_number FROM stock_transfers WHERE transfer_number ~ '^TRF-[0-9]+$'
     ORDER BY LENGTH(transfer_number) DESC, transfer_number DESC LIMIT 1`
  );
  return r.rows.length ? `TRF-${parseInt(r.rows[0].transfer_number.replace('TRF-', '')) + 1}` : 'TRF-1001';
};

const getAll = async (req, res) => {
  try {
    const { status, from, to, warehouse_id } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (status)      { params.push(status);      where += ` AND st.status=$${params.length}`; }
    if (warehouse_id){ params.push(warehouse_id); where += ` AND (st.from_warehouse_id=$${params.length} OR st.to_warehouse_id=$${params.length})`; }
    if (from)        { params.push(from);         where += ` AND st.transfer_date>=$${params.length}`; }
    if (to)          { params.push(to);           where += ` AND st.transfer_date<=$${params.length}`; }

    const r = await db.query(`
      SELECT st.*, fw.name AS from_warehouse_name, tw.name AS to_warehouse_name,
             u.name AS created_by_name, COUNT(sti.id) AS item_count
      FROM stock_transfers st
      LEFT JOIN warehouses fw ON fw.id=st.from_warehouse_id
      LEFT JOIN warehouses tw ON tw.id=st.to_warehouse_id
      LEFT JOIN users u ON u.id=st.created_by
      LEFT JOIN stock_transfer_items sti ON sti.transfer_id=st.id
      ${where}
      GROUP BY st.id, fw.name, tw.name, u.name
      ORDER BY st.transfer_date DESC, st.created_at DESC
    `, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('getAll transfers:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getOne = async (req, res) => {
  try {
    const [tf, items] = await Promise.all([
      db.query(`
        SELECT st.*, fw.name AS from_warehouse_name, tw.name AS to_warehouse_name,
               u.name AS created_by_name
        FROM stock_transfers st
        LEFT JOIN warehouses fw ON fw.id=st.from_warehouse_id
        LEFT JOIN warehouses tw ON tw.id=st.to_warehouse_id
        LEFT JOIN users u ON u.id=st.created_by
        WHERE st.id=$1`, [req.params.id]),
      db.query(`
        SELECT sti.*, ii.part_name, ii.part_code, ii.unit
        FROM stock_transfer_items sti
        JOIN inventory_items ii ON ii.id=sti.item_id
        WHERE sti.transfer_id=$1 ORDER BY sti.id`, [req.params.id])
    ]);
    if (!tf.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ...tf.rows[0], items: items.rows } });
  } catch (err) {
    console.error('getOne transfer:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { transfer_date, from_warehouse_id, to_warehouse_id, reason, remarks, items } = req.body;
    if (!transfer_date || !from_warehouse_id || !to_warehouse_id || !items?.length)
      return res.status(400).json({ error: 'transfer_date, from/to warehouse, and items required' });
    if (from_warehouse_id === to_warehouse_id)
      return res.status(400).json({ error: 'From and To warehouse must be different' });

    const transfer_number = await nextNo(client);
    const tR = await client.query(`
      INSERT INTO stock_transfers (transfer_number, transfer_date, from_warehouse_id, to_warehouse_id,
        status, reason, remarks, created_by)
      VALUES ($1,$2,$3,$4,'draft',$5,$6,$7) RETURNING *`,
      [transfer_number, transfer_date, from_warehouse_id, to_warehouse_id,
       reason || null, remarks || null, req.user.id]
    );
    const transfer = tR.rows[0];

    for (const it of items) {
      await client.query(`
        INSERT INTO stock_transfer_items (transfer_id, item_id, from_location_id, to_location_id, requested_qty, remarks)
        VALUES ($1,$2,$3,$4,$5,$6)`,
        [transfer.id, it.item_id, it.from_location_id || null, it.to_location_id || null,
         parseFloat(it.requested_qty) || 0, it.remarks || null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ data: transfer });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('create transfer:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

const approve = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const tR = await client.query(`
      SELECT st.*, json_agg(json_build_object(
        'item_id',sti.item_id,'requested_qty',sti.requested_qty,'from_location_id',sti.from_location_id,'to_location_id',sti.to_location_id
      )) AS items
      FROM stock_transfers st
      JOIN stock_transfer_items sti ON sti.transfer_id=st.id
      WHERE st.id=$1 GROUP BY st.id`, [req.params.id]
    );
    if (!tR.rows.length) return res.status(404).json({ error: 'Not found' });
    const tf = tR.rows[0];
    if (tf.status !== 'draft') return res.status(400).json({ error: 'Already processed' });

    // Validate stock availability
    for (const it of tf.items) {
      const sR = await client.query(
        `SELECT current_qty FROM inventory_stock WHERE item_id=$1 AND warehouse_id=$2`,
        [it.item_id, tf.from_warehouse_id]
      );
      const avail = parseFloat(sR.rows[0]?.current_qty) || 0;
      if (avail < parseFloat(it.requested_qty)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient stock for item id ${it.item_id}` });
      }
    }

    // Update stocks
    for (const it of tf.items) {
      const qty = parseFloat(it.requested_qty);
      const fromSR = await client.query(
        `SELECT average_cost FROM inventory_stock WHERE item_id=$1 AND warehouse_id=$2`,
        [it.item_id, tf.from_warehouse_id]
      );
      const avgCost = parseFloat(fromSR.rows[0]?.average_cost) || 0;

      // Deduct from source
      await client.query(`
        UPDATE inventory_stock SET current_qty = current_qty - $1, last_updated=NOW()
        WHERE item_id=$2 AND warehouse_id=$3`, [qty, it.item_id, tf.from_warehouse_id]
      );
      // Add to destination
      await client.query(`
        INSERT INTO inventory_stock (item_id, warehouse_id, location_id, current_qty, average_cost)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (item_id, warehouse_id) DO UPDATE
          SET current_qty = inventory_stock.current_qty + $4, last_updated=NOW()`,
        [it.item_id, tf.to_warehouse_id, it.to_location_id || null, qty, avgCost]
      );
      // Ledger: out from source
      const prevOut = await client.query(
        `SELECT closing_qty FROM stock_ledger WHERE item_id=$1 AND warehouse_id=$2 ORDER BY created_at DESC LIMIT 1`,
        [it.item_id, tf.from_warehouse_id]
      );
      const openOut = parseFloat(prevOut.rows[0]?.closing_qty) || 0;
      await client.query(`
        INSERT INTO stock_ledger (item_id, warehouse_id, txn_date, txn_type, reference_type, reference_id,
          reference_no, opening_qty, out_qty, closing_qty, rate, amount, created_by)
        VALUES ($1,$2,$3,'TRANSFER_OUT','transfer',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [it.item_id, tf.from_warehouse_id, tf.transfer_date, tf.id, tf.transfer_number,
         openOut, qty, openOut - qty, avgCost, qty * avgCost, req.user.id]
      );
      // Ledger: in to dest
      const prevIn = await client.query(
        `SELECT closing_qty FROM stock_ledger WHERE item_id=$1 AND warehouse_id=$2 ORDER BY created_at DESC LIMIT 1`,
        [it.item_id, tf.to_warehouse_id]
      );
      const openIn = parseFloat(prevIn.rows[0]?.closing_qty) || 0;
      await client.query(`
        INSERT INTO stock_ledger (item_id, warehouse_id, txn_date, txn_type, reference_type, reference_id,
          reference_no, opening_qty, in_qty, closing_qty, rate, amount, created_by)
        VALUES ($1,$2,$3,'TRANSFER_IN','transfer',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [it.item_id, tf.to_warehouse_id, tf.transfer_date, tf.id, tf.transfer_number,
         openIn, qty, openIn + qty, avgCost, qty * avgCost, req.user.id]
      );
    }

    await client.query(
      `UPDATE stock_transfers SET status='received', approved_by=$1 WHERE id=$2`,
      [req.user.id, tf.id]
    );
    await client.query('COMMIT');
    res.json({ message: 'Transfer approved and stock updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('approve transfer:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(
      `DELETE FROM stock_transfers WHERE id=$1 AND status='draft' RETURNING id`, [req.params.id]
    );
    if (!r.rows.length) return res.status(400).json({ error: 'Only draft transfers can be deleted' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('remove transfer:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getOne, create, approve, remove };
