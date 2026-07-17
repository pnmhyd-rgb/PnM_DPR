const db = require('../config/db');

const getDashboard = async (req, res) => {
  try {
    const [
      itemStats, warehouseCount, stockStats, lowStock, outOfStock,
      todayConsumption, monthlyConsumption, monthlyGRN, pendingGRN, pendingTransfers,
      monthlyConsumptionTrend, monthlyGRNTrend, topConsumed, warehouseStock, categoryValue
    ] = await Promise.all([
      // Total items
      db.query(`SELECT COUNT(*) AS total_items FROM inventory_items WHERE active=true`),

      // Total warehouses
      db.query(`SELECT COUNT(*) AS total FROM warehouses WHERE active=true`),

      // Stock stats
      db.query(`
        SELECT
          COALESCE(SUM(s.current_qty), 0) AS total_current_qty,
          COALESCE(SUM(s.reserved_qty), 0) AS total_reserved_qty,
          COALESCE(SUM(s.current_qty - s.reserved_qty), 0) AS total_available_qty,
          COALESCE(SUM(s.current_qty * COALESCE(s.average_cost, 0)), 0) AS total_inventory_value
        FROM inventory_stock s
        JOIN inventory_items ii ON ii.id=s.item_id AND ii.active=true
      `),

      // Low stock items
      db.query(`
        SELECT COUNT(DISTINCT ii.id) AS count
        FROM inventory_items ii
        LEFT JOIN inventory_stock s ON s.item_id=ii.id AND s.warehouse_id=ii.warehouse_id
        WHERE ii.active=true
          AND COALESCE(s.current_qty,0) > 0
          AND COALESCE(s.current_qty,0) <= ii.reorder_level
      `),

      // Out of stock
      db.query(`
        SELECT COUNT(DISTINCT ii.id) AS count
        FROM inventory_items ii
        LEFT JOIN inventory_stock s ON s.item_id=ii.id AND s.warehouse_id=ii.warehouse_id
        WHERE ii.active=true AND COALESCE(s.current_qty,0) = 0
      `),

      // Today's consumption
      db.query(`
        SELECT COALESCE(SUM(ci.amount),0) AS amount, COALESCE(SUM(ci.consumption_qty),0) AS qty
        FROM consumption_items ci
        JOIN inventory_consumption ic ON ic.id=ci.consumption_id
        WHERE ic.txn_date=CURRENT_DATE
      `),

      // This month's consumption
      db.query(`
        SELECT COALESCE(SUM(ci.amount),0) AS amount
        FROM consumption_items ci
        JOIN inventory_consumption ic ON ic.id=ci.consumption_id
        WHERE DATE_TRUNC('month',ic.txn_date)=DATE_TRUNC('month',CURRENT_DATE)
      `),

      // This month's GRN
      db.query(`
        SELECT COALESCE(SUM(total_amount),0) AS amount
        FROM goods_receipts
        WHERE DATE_TRUNC('month',grn_date)=DATE_TRUNC('month',CURRENT_DATE) AND status='approved'
      `),

      // Pending GRN
      db.query(`SELECT COUNT(*) AS count FROM goods_receipts WHERE status='draft'`),

      // Pending transfers
      db.query(`SELECT COUNT(*) AS count FROM stock_transfers WHERE status='draft'`),

      // Monthly consumption trend (last 6 months)
      db.query(`
        SELECT TO_CHAR(DATE_TRUNC('month',ic.txn_date),'Mon YY') AS month,
               DATE_TRUNC('month',ic.txn_date) AS month_date,
               COALESCE(SUM(ci.amount),0) AS amount
        FROM consumption_items ci
        JOIN inventory_consumption ic ON ic.id=ci.consumption_id
        WHERE ic.txn_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month',ic.txn_date)
        ORDER BY month_date
      `),

      // Monthly GRN trend (last 6 months)
      db.query(`
        SELECT TO_CHAR(DATE_TRUNC('month',grn_date),'Mon YY') AS month,
               DATE_TRUNC('month',grn_date) AS month_date,
               COALESCE(SUM(total_amount),0) AS amount
        FROM goods_receipts
        WHERE status='approved' AND grn_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month',grn_date)
        ORDER BY month_date
      `),

      // Top 5 consumed items (this month)
      db.query(`
        SELECT ii.part_name, ii.part_code, ii.unit,
               COALESCE(SUM(ci.consumption_qty),0) AS total_qty,
               COALESCE(SUM(ci.amount),0) AS total_amount
        FROM consumption_items ci
        JOIN inventory_consumption ic ON ic.id=ci.consumption_id
        JOIN inventory_items ii ON ii.id=ci.item_id
        WHERE ic.txn_date >= DATE_TRUNC('month',CURRENT_DATE)
        GROUP BY ii.id, ii.part_name, ii.part_code, ii.unit
        ORDER BY total_qty DESC LIMIT 5
      `),

      // Warehouse-wise stock value
      db.query(`
        SELECT w.name AS warehouse_name,
               COALESCE(SUM(s.current_qty * COALESCE(s.average_cost,0)),0) AS stock_value,
               COALESCE(SUM(s.current_qty),0) AS total_qty
        FROM inventory_stock s
        JOIN warehouses w ON w.id=s.warehouse_id
        WHERE w.active=true
        GROUP BY w.id, w.name
        ORDER BY stock_value DESC
      `),

      // Category-wise inventory value
      db.query(`
        SELECT cat.name AS category_name,
               COALESCE(SUM(s.current_qty * COALESCE(s.average_cost,0)),0) AS value,
               COUNT(DISTINCT ii.id) AS item_count
        FROM inventory_items ii
        JOIN inventory_categories cat ON cat.id=ii.category_id
        LEFT JOIN inventory_stock s ON s.item_id=ii.id
        WHERE ii.active=true
        GROUP BY cat.id, cat.name
        ORDER BY value DESC LIMIT 10
      `)
    ]);

    const stock = stockStats.rows[0];

    res.json({
      data: {
        summary: {
          total_items:           parseInt(itemStats.rows[0].total_items),
          total_warehouses:      parseInt(warehouseCount.rows[0].total),
          total_inventory_value: parseFloat(stock.total_inventory_value),
          total_current_qty:     parseFloat(stock.total_current_qty),
          total_reserved_qty:    parseFloat(stock.total_reserved_qty),
          total_available_qty:   parseFloat(stock.total_available_qty),
          low_stock_count:       parseInt(lowStock.rows[0].count),
          out_of_stock_count:    parseInt(outOfStock.rows[0].count),
          today_consumption_amount: parseFloat(todayConsumption.rows[0].amount),
          today_consumption_qty:    parseFloat(todayConsumption.rows[0].qty),
          monthly_consumption:   parseFloat(monthlyConsumption.rows[0].amount),
          monthly_purchase:      parseFloat(monthlyGRN.rows[0].amount),
          pending_grn:           parseInt(pendingGRN.rows[0].count),
          pending_transfers:     parseInt(pendingTransfers.rows[0].count),
        },
        charts: {
          monthly_consumption_trend: monthlyConsumptionTrend.rows,
          monthly_grn_trend:         monthlyGRNTrend.rows,
          top_consumed:              topConsumed.rows,
          warehouse_stock:           warehouseStock.rows,
          category_value:            categoryValue.rows,
        }
      }
    });
  } catch (err) {
    console.error('getDashboard inventory:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getDashboard };
