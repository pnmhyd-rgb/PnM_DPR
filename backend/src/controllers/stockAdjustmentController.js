const db = require('../config/db');

const nextNo = async (client) => {
  const r = await client.query(
    `SELECT adjustment_number FROM stock_adjustments WHERE adjustment_number ~ '^ADJ-[0-9]+$'
     ORDER BY LENGTH(adjustment_number) DESC, adjustment_number DESC LIMIT 1`
  );
  return r.rows.length ? `ADJ-${parseInt(r.rows[0].adjustment_number.replace('ADJ-', '')) + 1}` : 'ADJ-1001';
};

const getAll = async (req, res) => {
  try {
    const { status, warehouse_id, from, to } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (status)      { params.push(status);      where += ` AND sa.status=$${params.length}`; }
    if (warehouse_id){ params.push(warehouse_id); where += ` AND sa.warehouse_id=$${params.length}`; }
    if (from)        { params.push(from);         where += ` AND sa.adjustment_date>=$${params.length}`; }
    if (to)          { params.push(to);           where += ` AND sa.adjustment_date<=$${params.length}`; }

    const r = await db.query(`
      SELECT sa.*, w.name AS warehouse_name, u.name AS created_by_name,
             a.name AS approved_by_name, COUNT(sai.id) AS item_count
      FROM stock_adjustments sa
      LEFT JOIN warehouses w ON w.id=sa.warehouse_id
      LEFT JOIN users u ON u.id=sa.created_by
      LEFT JOIN users a ON a.id=sa.approved_by
      LEFT JOIN stock_adjustment_items sai ON sai.adjustment_id=sa.id
      ${where}
      GROUP BY sa.id, w.name, u.name, a.name
      ORDER BY sa.adjustment_date DESC, sa.created_at DESC
    `, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('getAll adjustments:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getOne = async (req, res) => {
  try {
    const [adj, items] = await Promise.all([
      db.query(`
        SELECT sa.*, w.name AS warehouse_name, u.name AS created_by_name
        FROM stock_adjustments sa
        LEFT JOIN warehouses w ON w.id=sa.warehouse_id
        LEFT JOIN users u ON u.id=sa.created_by
        WHERE sa.id=$1`, [req.params.id]),
      db.query(`
        SELECT sai.*, ii.part_name, ii.part_code, ii.unit
        FROM stock_adjustment_items sai
        JOIN inventory_items ii ON ii.id=sai.item_id
        WHERE sai.adjustment_id=$1 ORDER BY sai.id`, [req.params.id])
    ]);
    if (!adj.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ...adj.rows[0], items: items.rows } });
  } catch (err) {
    console.error('getOne adjustment:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { adjustment_date, warehouse_id, reason, remarks, items } = req.body;
    if (!adjustment_date || !warehouse_id || !reason || !items?.length)
      return res.status(400).json({ error: 'adjustment_date, warehouse_id, reason, and items are required' });

    const adjustment_number = await nextNo(client);
    const aR = await client.query(`
      INSERT INTO stock_adjustments (adjustment_number, adjustment_date, warehouse_id, status, reason, remarks, created_by)
      VALUES ($1,$2,$3,'pending',$4,$5,$6) RETURNING *`,
      [adjustment_number, adjustment_date, warehouse_id, reason, remarks || null, req.user.id]
    );
    const adj = aR.rows[0];

    for (const it of items) {
      await client.query(`
        INSERT INTO stock_adjustment_items (adjustment_id, item_id, location_id, system_qty, physical_qty, remarks)
        VALUES ($1,$2,$3,$4,$5,$6)`,
        [adj.id, it.item_id, it.location_id || null,
         parseFloat(it.system_qty) || 0, parseFloat(it.physical_qty) || 0, it.remarks || null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ data: adj });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('create adjustment:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

const approve = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const aR = await client.query(`
      SELECT sa.*, json_agg(json_build_object(
        'item_id',sai.item_id,'physical_qty',sai.physical_qty,'system_qty',sai.system_qty,'difference',sai.difference
      )) AS items
      FROM stock_adjustments sa
      JOIN stock_adjustment_items sai ON sai.adjustment_id=sa.id
      WHERE sa.id=$1 GROUP BY sa.id`, [req.params.id]
    );
    if (!aR.rows.length) return res.status(404).json({ error: 'Not found' });
    const adj = aR.rows[0];
    if (adj.status !== 'pending') return res.status(400).json({ error: 'Already processed' });

    for (const it of adj.items) {
      const physical = parseFloat(it.physical_qty);
      const diff = parseFloat(it.difference);

      await client.query(`
        INSERT INTO inventory_stock (item_id, warehouse_id, current_qty, average_cost)
        VALUES ($1,$2,$3, (SELECT average_cost FROM inventory_items WHERE id=$1))
        ON CONFLICT (item_id, warehouse_id) DO UPDATE
          SET current_qty = $3, last_updated=NOW()`,
        [it.item_id, adj.warehouse_id, physical]
      );

      const prevR = await client.query(
        `SELECT closing_qty FROM stock_ledger WHERE item_id=$1 AND warehouse_id=$2 ORDER BY created_at DESC LIMIT 1`,
        [it.item_id, adj.warehouse_id]
      );
      const opening = parseFloat(prevR.rows[0]?.closing_qty) || parseFloat(it.system_qty);
      const inQty  = diff > 0 ? diff : 0;
      const outQty = diff < 0 ? Math.abs(diff) : 0;

      await client.query(`
        INSERT INTO stock_ledger (item_id, warehouse_id, txn_date, txn_type, reference_type, reference_id,
          reference_no, opening_qty, in_qty, out_qty, closing_qty, created_by)
        VALUES ($1,$2,$3,'ADJUSTMENT','adjustment',$4,$5,$6,$7,$8,$9,$10)`,
        [it.item_id, adj.warehouse_id, adj.adjustment_date, adj.id, adj.adjustment_number,
         opening, inQty, outQty, physical, req.user.id]
      );
    }

    await client.query(
      `UPDATE stock_adjustments SET status='approved', approved_by=$1 WHERE id=$2`,
      [req.user.id, adj.id]
    );
    await client.query('COMMIT');
    res.json({ message: 'Adjustment approved and stock updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('approve adjustment:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(
      `DELETE FROM stock_adjustments WHERE id=$1 AND status='pending' RETURNING id`, [req.params.id]
    );
    if (!r.rows.length) return res.status(400).json({ error: 'Only pending adjustments can be deleted' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('remove adjustment:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getOne, create, approve, remove };
