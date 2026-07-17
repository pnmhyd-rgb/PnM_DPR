const db = require('../config/db');

const nextGRNNo = async (client) => {
  const r = await client.query(
    `SELECT grn_number FROM goods_receipts WHERE grn_number ~ '^GRN-[0-9]+$'
     ORDER BY LENGTH(grn_number) DESC, grn_number DESC LIMIT 1`
  );
  if (!r.rows.length) return 'GRN-1001';
  return `GRN-${parseInt(r.rows[0].grn_number.replace('GRN-', '')) + 1}`;
};

const getAll = async (req, res) => {
  try {
    const { status, from, to, vendor_id, warehouse_id } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (status)      { params.push(status);      where += ` AND g.status=$${params.length}`; }
    if (vendor_id)   { params.push(vendor_id);   where += ` AND g.vendor_id=$${params.length}`; }
    if (warehouse_id){ params.push(warehouse_id); where += ` AND g.warehouse_id=$${params.length}`; }
    if (from)        { params.push(from);         where += ` AND g.grn_date>=$${params.length}`; }
    if (to)          { params.push(to);           where += ` AND g.grn_date<=$${params.length}`; }

    const r = await db.query(`
      SELECT g.*, v.name AS vendor_name, w.name AS warehouse_name,
             u.name AS created_by_name, a.name AS approved_by_name,
             COUNT(gi.id) AS item_count
      FROM goods_receipts g
      LEFT JOIN vendors v ON v.id=g.vendor_id
      LEFT JOIN warehouses w ON w.id=g.warehouse_id
      LEFT JOIN users u ON u.id=g.created_by
      LEFT JOIN users a ON a.id=g.approved_by
      LEFT JOIN goods_receipt_items gi ON gi.grn_id=g.id
      ${where}
      GROUP BY g.id, v.name, w.name, u.name, a.name
      ORDER BY g.grn_date DESC, g.created_at DESC
    `, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('getAll GRN:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getOne = async (req, res) => {
  try {
    const [grn, items] = await Promise.all([
      db.query(`
        SELECT g.*, v.name AS vendor_name, w.name AS warehouse_name,
               u.name AS created_by_name, a.name AS approved_by_name
        FROM goods_receipts g
        LEFT JOIN vendors v ON v.id=g.vendor_id
        LEFT JOIN warehouses w ON w.id=g.warehouse_id
        LEFT JOIN users u ON u.id=g.created_by
        LEFT JOIN users a ON a.id=g.approved_by
        WHERE g.id=$1`, [req.params.id]),
      db.query(`
        SELECT gi.*, ii.part_name, ii.part_code, ii.unit,
               wl.rack, wl.shelf, wl.bin
        FROM goods_receipt_items gi
        JOIN inventory_items ii ON ii.id=gi.item_id
        LEFT JOIN warehouse_locations wl ON wl.id=gi.location_id
        WHERE gi.grn_id=$1 ORDER BY gi.id`, [req.params.id])
    ]);
    if (!grn.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ...grn.rows[0], items: items.rows } });
  } catch (err) {
    console.error('getOne GRN:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { po_number, vendor_id, invoice_number, grn_date, warehouse_id, remarks, items } = req.body;
    if (!grn_date || !warehouse_id || !items?.length)
      return res.status(400).json({ error: 'grn_date, warehouse_id, and items are required' });

    const grn_number = await nextGRNNo(client);

    let sub_total = 0, gst_amount = 0;
    items.forEach(it => {
      const base = (parseFloat(it.accepted_qty) || 0) * (parseFloat(it.rate) || 0);
      const gst  = base * (parseFloat(it.gst_percent) || 0) / 100;
      sub_total  += base;
      gst_amount += gst;
    });
    const total_amount = sub_total + gst_amount;

    const gR = await client.query(`
      INSERT INTO goods_receipts (grn_number, po_number, vendor_id, invoice_number, grn_date,
        warehouse_id, status, sub_total, gst_amount, total_amount, remarks, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$11) RETURNING *`,
      [grn_number, po_number || null, vendor_id || null, invoice_number || null,
       grn_date, warehouse_id, sub_total, gst_amount, total_amount, remarks || null, req.user.id]
    );
    const grn = gR.rows[0];

    for (const it of items) {
      const accepted = parseFloat(it.accepted_qty) || 0;
      const rate = parseFloat(it.rate) || 0;
      const gst_pct = parseFloat(it.gst_percent) || 0;
      const gst_amt = accepted * rate * gst_pct / 100;
      const total_amt = accepted * rate + gst_amt;
      await client.query(`
        INSERT INTO goods_receipt_items
          (grn_id, item_id, ordered_qty, received_qty, accepted_qty, rejected_qty,
           rate, gst_percent, gst_amount, total_amount, location_id, remarks)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [grn.id, it.item_id, parseFloat(it.ordered_qty) || null,
         parseFloat(it.received_qty) || accepted, accepted,
         parseFloat(it.rejected_qty) || 0, rate, gst_pct, gst_amt, total_amt,
         it.location_id || null, it.remarks || null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ data: grn });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('create GRN:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

const approve = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const gR = await client.query(
      `SELECT g.*, json_agg(json_build_object(
         'item_id',gi.item_id,'accepted_qty',gi.accepted_qty,'rate',gi.rate,'location_id',gi.location_id
       )) AS items
       FROM goods_receipts g
       JOIN goods_receipt_items gi ON gi.grn_id=g.id
       WHERE g.id=$1 GROUP BY g.id`,
      [req.params.id]
    );
    if (!gR.rows.length) return res.status(404).json({ error: 'Not found' });
    const grn = gR.rows[0];
    if (grn.status !== 'draft') return res.status(400).json({ error: 'Already approved' });

    await client.query(
      `UPDATE goods_receipts SET status='approved', approved_by=$1 WHERE id=$2`,
      [req.user.id, grn.id]
    );

    for (const it of grn.items) {
      const qty = parseFloat(it.accepted_qty) || 0;
      const rate = parseFloat(it.rate) || 0;

      // Get current stock for weighted average
      const sR = await client.query(
        `SELECT current_qty, average_cost FROM inventory_stock
         WHERE item_id=$1 AND warehouse_id=$2`, [it.item_id, grn.warehouse_id]
      );
      let newAvg = rate;
      if (sR.rows.length) {
        const cur = sR.rows[0];
        const curQty = parseFloat(cur.current_qty) || 0;
        const curCost = parseFloat(cur.average_cost) || 0;
        if (curQty + qty > 0) newAvg = ((curQty * curCost) + (qty * rate)) / (curQty + qty);
      }

      await client.query(`
        INSERT INTO inventory_stock (item_id, warehouse_id, location_id, current_qty, average_cost)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (item_id, warehouse_id) DO UPDATE
          SET current_qty = inventory_stock.current_qty + $4,
              average_cost = $5, last_updated = NOW()`,
        [it.item_id, grn.warehouse_id, it.location_id || null, qty, newAvg]
      );

      // Ledger entry
      const prevR = await client.query(
        `SELECT closing_qty FROM stock_ledger WHERE item_id=$1 AND warehouse_id=$2
         ORDER BY created_at DESC LIMIT 1`, [it.item_id, grn.warehouse_id]
      );
      const opening = parseFloat(prevR.rows[0]?.closing_qty) || 0;

      await client.query(`
        INSERT INTO stock_ledger
          (item_id, warehouse_id, txn_date, txn_type, reference_type, reference_id, reference_no,
           opening_qty, in_qty, closing_qty, rate, amount, created_by)
        VALUES ($1,$2,$3,'GRN','grn',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [it.item_id, grn.warehouse_id, grn.grn_date, grn.id, grn.grn_number,
         opening, qty, opening + qty, rate, qty * rate, req.user.id]
      );

      // Update item average cost
      await client.query(
        `UPDATE inventory_items SET average_cost=$1, updated_at=NOW() WHERE id=$2`,
        [newAvg, it.item_id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'GRN approved and stock updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('approve GRN:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(
      `DELETE FROM goods_receipts WHERE id=$1 AND status='draft' RETURNING id`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(400).json({ error: 'Only draft GRNs can be deleted' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('remove GRN:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getOne, create, approve, remove };
