const db = require('../config/db');

const nextNo = async (client) => {
  const r = await client.query(
    `SELECT return_number FROM parts_returns WHERE return_number ~ '^RTN-[0-9]+$'
     ORDER BY LENGTH(return_number) DESC, return_number DESC LIMIT 1`
  );
  return r.rows.length ? `RTN-${parseInt(r.rows[0].return_number.replace('RTN-', '')) + 1}` : 'RTN-1001';
};

const getAll = async (req, res) => {
  try {
    const { status, warehouse_id, from, to } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (status)      { params.push(status);      where += ` AND pr.status=$${params.length}`; }
    if (warehouse_id){ params.push(warehouse_id); where += ` AND pr.warehouse_id=$${params.length}`; }
    if (from)        { params.push(from);         where += ` AND pr.return_date>=$${params.length}`; }
    if (to)          { params.push(to);           where += ` AND pr.return_date<=$${params.length}`; }

    const r = await db.query(`
      SELECT pr.*, w.name AS warehouse_name, u.name AS created_by_name,
             ic.consumption_number, COUNT(pri.id) AS item_count
      FROM parts_returns pr
      LEFT JOIN warehouses w ON w.id=pr.warehouse_id
      LEFT JOIN users u ON u.id=pr.created_by
      LEFT JOIN inventory_consumption ic ON ic.id=pr.consumption_id
      LEFT JOIN parts_return_items pri ON pri.return_id=pr.id
      ${where}
      GROUP BY pr.id, w.name, u.name, ic.consumption_number
      ORDER BY pr.return_date DESC, pr.created_at DESC
    `, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('getAll returns:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getOne = async (req, res) => {
  try {
    const [ret, items] = await Promise.all([
      db.query(`
        SELECT pr.*, w.name AS warehouse_name, u.name AS created_by_name, ic.consumption_number
        FROM parts_returns pr
        LEFT JOIN warehouses w ON w.id=pr.warehouse_id
        LEFT JOIN users u ON u.id=pr.created_by
        LEFT JOIN inventory_consumption ic ON ic.id=pr.consumption_id
        WHERE pr.id=$1`, [req.params.id]),
      db.query(`
        SELECT pri.*, ii.part_name, ii.part_code, ii.unit
        FROM parts_return_items pri
        JOIN inventory_items ii ON ii.id=pri.item_id
        WHERE pri.return_id=$1 ORDER BY pri.id`, [req.params.id])
    ]);
    if (!ret.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ...ret.rows[0], items: items.rows } });
  } catch (err) {
    console.error('getOne return:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { return_date, consumption_id, warehouse_id, remarks, items } = req.body;
    if (!return_date || !warehouse_id || !items?.length)
      return res.status(400).json({ error: 'return_date, warehouse_id, and items are required' });

    const return_number = await nextNo(client);
    const rR = await client.query(`
      INSERT INTO parts_returns (return_number, return_date, consumption_id, warehouse_id, status, remarks, created_by)
      VALUES ($1,$2,$3,$4,'submitted',$5,$6) RETURNING *`,
      [return_number, return_date, consumption_id || null, warehouse_id, remarks || null, req.user.id]
    );
    const ret = rR.rows[0];

    for (const it of items) {
      const qty = parseFloat(it.return_qty) || 0;
      const condition = it.condition || 'good';

      await client.query(`
        INSERT INTO parts_return_items (return_id, item_id, consumption_item_id, issued_qty, return_qty, condition, reason, remarks)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ret.id, it.item_id, it.consumption_item_id || null,
         parseFloat(it.issued_qty) || null, qty, condition, it.reason || null, it.remarks || null]
      );

      // Only put 'good' items back into stock
      if (condition === 'good') {
        const avgR = await client.query(
          `SELECT average_cost FROM inventory_items WHERE id=$1`, [it.item_id]
        );
        const avgCost = parseFloat(avgR.rows[0]?.average_cost) || 0;

        await client.query(`
          INSERT INTO inventory_stock (item_id, warehouse_id, current_qty, average_cost)
          VALUES ($1,$2,$3,$4)
          ON CONFLICT (item_id, warehouse_id) DO UPDATE
            SET current_qty = inventory_stock.current_qty + $3, last_updated=NOW()`,
          [it.item_id, warehouse_id, qty, avgCost]
        );

        const prevR = await client.query(
          `SELECT closing_qty FROM stock_ledger WHERE item_id=$1 AND warehouse_id=$2 ORDER BY created_at DESC LIMIT 1`,
          [it.item_id, warehouse_id]
        );
        const opening = parseFloat(prevR.rows[0]?.closing_qty) || 0;

        await client.query(`
          INSERT INTO stock_ledger (item_id, warehouse_id, txn_date, txn_type, reference_type, reference_id,
            reference_no, opening_qty, in_qty, closing_qty, rate, amount, created_by)
          VALUES ($1,$2,$3,'RETURN','return',$4,$5,$6,$7,$8,$9,$10,$11)`,
          [it.item_id, warehouse_id, return_date, ret.id, return_number,
           opening, qty, opening + qty, avgCost, qty * avgCost, req.user.id]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ data: ret });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('create return:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

module.exports = { getAll, getOne, create };
