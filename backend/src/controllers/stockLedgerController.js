const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { item_id, warehouse_id, txn_type, from, to, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = 'WHERE 1=1';
    if (item_id)      { params.push(item_id);      where += ` AND sl.item_id=$${params.length}`; }
    if (warehouse_id) { params.push(warehouse_id); where += ` AND sl.warehouse_id=$${params.length}`; }
    if (txn_type)     { params.push(txn_type);     where += ` AND sl.txn_type=$${params.length}`; }
    if (from)         { params.push(from);          where += ` AND sl.txn_date>=$${params.length}`; }
    if (to)           { params.push(to);            where += ` AND sl.txn_date<=$${params.length}`; }

    const countRes = await db.query(
      `SELECT COUNT(*) FROM stock_ledger sl ${where}`, params
    );
    const total = parseInt(countRes.rows[0].count);

    params.push(parseInt(limit), offset);
    const r = await db.query(`
      SELECT sl.*, ii.part_name, ii.part_code, ii.unit,
             w.name AS warehouse_name, u.name AS created_by_name
      FROM stock_ledger sl
      JOIN inventory_items ii ON ii.id=sl.item_id
      LEFT JOIN warehouses w ON w.id=sl.warehouse_id
      LEFT JOIN users u ON u.id=sl.created_by
      ${where}
      ORDER BY sl.txn_date DESC, sl.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    res.json({ data: r.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('getAll stock_ledger:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll };
