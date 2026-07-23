const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { search, category_id, warehouse_id, status, low_stock, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = 'WHERE ii.active = true';

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (ii.part_name ILIKE $${params.length} OR ii.part_code ILIKE $${params.length} OR ii.oem_number ILIKE $${params.length} OR ii.barcode ILIKE $${params.length})`;
    }
    if (category_id) { params.push(category_id); where += ` AND (ii.category_id=$${params.length} OR ii.sub_category_id=$${params.length})`; }
    if (warehouse_id) { params.push(warehouse_id); where += ` AND ii.warehouse_id=$${params.length}`; }
    if (status === 'active')   where += ' AND ii.active=true';
    if (status === 'inactive') where += ' AND ii.active=false';
    if (low_stock === 'true')  where += ' AND COALESCE(s.current_qty,0) <= ii.reorder_level';

    const stockSubquery = `(
      SELECT item_id,
             SUM(current_qty)  AS current_qty,
             SUM(reserved_qty) AS reserved_qty,
             CASE WHEN SUM(current_qty) > 0
                  THEN SUM(current_qty * average_cost) / SUM(current_qty)
                  ELSE MAX(average_cost) END AS average_cost
      FROM inventory_stock
      GROUP BY item_id
    ) s`;

    const countRes = await db.query(
      `SELECT COUNT(*) FROM inventory_items ii
       LEFT JOIN ${stockSubquery} ON s.item_id=ii.id
       ${where}`, params
    );
    const total = parseInt(countRes.rows[0].count);

    params.push(parseInt(limit), offset);
    const r = await db.query(`
      SELECT
        ii.*,
        cat.name   AS category_name,
        sub.name   AS sub_category_name,
        w.name     AS warehouse_name,
        v.name     AS vendor_name,
        wl.rack, wl.shelf, wl.bin,
        COALESCE(s.current_qty, 0)  AS current_stock,
        COALESCE(s.reserved_qty, 0) AS reserved_stock,
        COALESCE(s.current_qty, 0) - COALESCE(s.reserved_qty, 0) AS available_stock,
        COALESCE(s.average_cost, ii.average_cost, 0) AS avg_cost,
        (COALESCE(s.current_qty, 0) * COALESCE(s.average_cost, ii.average_cost, 0)) AS inventory_value,
        CASE
          WHEN COALESCE(s.current_qty,0) = 0 THEN 'out_of_stock'
          WHEN COALESCE(s.current_qty,0) <= ii.reorder_level THEN 'low_stock'
          ELSE 'in_stock'
        END AS stock_status
      FROM inventory_items ii
      LEFT JOIN inventory_categories cat ON cat.id = ii.category_id
      LEFT JOIN inventory_categories sub ON sub.id = ii.sub_category_id
      LEFT JOIN warehouses w ON w.id = ii.warehouse_id
      LEFT JOIN vendors v ON v.id = ii.vendor_id
      LEFT JOIN warehouse_locations wl ON wl.id = ii.location_id
      LEFT JOIN ${stockSubquery} ON s.item_id=ii.id
      ${where}
      ORDER BY ii.part_name
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ data: r.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('getAll inventory_items:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getOne = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT ii.*, cat.name AS category_name, sub.name AS sub_category_name,
             w.name AS warehouse_name, v.name AS vendor_name,
             wl.rack, wl.shelf, wl.bin,
             COALESCE(s.current_qty, 0)  AS current_stock,
             COALESCE(s.reserved_qty, 0) AS reserved_stock,
             COALESCE(s.current_qty, 0) - COALESCE(s.reserved_qty, 0) AS available_stock,
             COALESCE(s.average_cost, ii.average_cost, 0) AS avg_cost
      FROM inventory_items ii
      LEFT JOIN inventory_categories cat ON cat.id = ii.category_id
      LEFT JOIN inventory_categories sub ON sub.id = ii.sub_category_id
      LEFT JOIN warehouses w ON w.id = ii.warehouse_id
      LEFT JOIN vendors v ON v.id = ii.vendor_id
      LEFT JOIN warehouse_locations wl ON wl.id = ii.location_id
      LEFT JOIN (
        SELECT item_id, SUM(current_qty) AS current_qty, SUM(reserved_qty) AS reserved_qty,
               CASE WHEN SUM(current_qty) > 0
                    THEN SUM(current_qty * average_cost) / SUM(current_qty)
                    ELSE MAX(average_cost) END AS average_cost
        FROM inventory_stock GROUP BY item_id
      ) s ON s.item_id=ii.id
      WHERE ii.id=$1
    `, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('getOne inventory_item:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Generate next part code
const nextCode = async (client) => {
  const r = await client.query(
    `SELECT part_code FROM inventory_items WHERE part_code ~ '^SP-[0-9]+$'
     ORDER BY LENGTH(part_code) DESC, part_code DESC LIMIT 1`
  );
  if (!r.rows.length) return 'SP-1001';
  const last = parseInt(r.rows[0].part_code.replace('SP-', ''));
  return `SP-${last + 1}`;
};

const create = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const {
      part_code, part_name, description, category_id, sub_category_id, oem_number,
      manufacturer, brand, vendor_id, unit, gst_percent, hsn_code,
      purchase_price, average_cost, selling_price, opening_qty,
      min_stock, max_stock, reorder_level, warehouse_id, location_id,
      barcode, qr_code, image_url, costing_method
    } = req.body;

    if (!part_name) return res.status(400).json({ error: 'part_name is required' });

    const code = part_code?.trim() || await nextCode(client);
    const openQty = parseFloat(opening_qty) || 0;
    const avgCost = parseFloat(average_cost) || parseFloat(purchase_price) || 0;

    const r = await client.query(`
      INSERT INTO inventory_items
        (part_code, part_name, description, category_id, sub_category_id, oem_number,
         manufacturer, brand, vendor_id, unit, gst_percent, hsn_code,
         purchase_price, average_cost, selling_price, opening_qty,
         min_stock, max_stock, reorder_level, warehouse_id, location_id,
         barcode, qr_code, image_url, costing_method, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
      RETURNING *`,
      [
        code, part_name.trim(), description || null, category_id || null, sub_category_id || null,
        oem_number || null, manufacturer || null, brand || null, vendor_id || null,
        unit || 'Nos', parseFloat(gst_percent) || 18, hsn_code || null,
        parseFloat(purchase_price) || null, avgCost, parseFloat(selling_price) || null,
        openQty, parseFloat(min_stock) || 0, parseFloat(max_stock) || null,
        parseFloat(reorder_level) || 0, warehouse_id || null, location_id || null,
        barcode || null, qr_code || null, image_url || null, costing_method || 'weighted_avg',
        req.user.id
      ]
    );
    const item = r.rows[0];

    // Initialize stock record if warehouse given
    if (warehouse_id && openQty > 0) {
      await client.query(`
        INSERT INTO inventory_stock (item_id, warehouse_id, location_id, current_qty, average_cost)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (item_id, warehouse_id) DO UPDATE
          SET current_qty = inventory_stock.current_qty + $4,
              average_cost = $5, last_updated = NOW()`,
        [item.id, warehouse_id, location_id || null, openQty, avgCost]
      );
      // Opening balance ledger entry
      await client.query(`
        INSERT INTO stock_ledger (item_id, warehouse_id, txn_date, txn_type, reference_type,
          opening_qty, in_qty, closing_qty, rate, amount, created_by, remarks)
        VALUES ($1,$2,NOW(),'OPENING','item',$3,$4,$5,$6,$7,$8,'Opening balance')`,
        [item.id, warehouse_id, 0, openQty, openQty, avgCost, openQty * avgCost, req.user.id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ data: item });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Part code already exists' });
    console.error('create inventory_item:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

const update = async (req, res) => {
  try {
    const {
      part_code, part_name, description, category_id, sub_category_id, oem_number,
      manufacturer, brand, vendor_id, unit, gst_percent, hsn_code,
      purchase_price, average_cost, selling_price, opening_qty,
      min_stock, max_stock, reorder_level, warehouse_id, location_id,
      barcode, qr_code, image_url, costing_method, active
    } = req.body;

    const r = await db.query(`
      UPDATE inventory_items SET
        part_code=$1, part_name=$2, description=$3, category_id=$4, sub_category_id=$5,
        oem_number=$6, manufacturer=$7, brand=$8, vendor_id=$9, unit=$10, gst_percent=$11,
        hsn_code=$12, purchase_price=$13, average_cost=$14, selling_price=$15,
        opening_qty=$16, min_stock=$17, max_stock=$18, reorder_level=$19,
        warehouse_id=$20, location_id=$21, barcode=$22, qr_code=$23, image_url=$24,
        costing_method=$25, active=$26, updated_at=NOW()
      WHERE id=$27 RETURNING *`,
      [
        part_code?.trim(), part_name?.trim(), description || null, category_id || null,
        sub_category_id || null, oem_number || null, manufacturer || null, brand || null,
        vendor_id || null, unit || 'Nos', parseFloat(gst_percent) || 18, hsn_code || null,
        parseFloat(purchase_price) || null, parseFloat(average_cost) || 0,
        parseFloat(selling_price) || null, parseFloat(opening_qty) || 0,
        parseFloat(min_stock) || 0, parseFloat(max_stock) || null,
        parseFloat(reorder_level) || 0, warehouse_id || null, location_id || null,
        barcode || null, qr_code || null, image_url || null, costing_method || 'weighted_avg',
        active !== false, req.params.id
      ]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Part code already exists' });
    console.error('update inventory_item:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE inventory_items SET active=false WHERE id=$1 RETURNING id`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('remove inventory_item:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const bulkCreate = async (req, res) => {
  try {
    const rows = req.body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required' });
    }

    // Seed the SP- code counter once to avoid per-row DB round-trips
    let codeCounter = null;
    const getNextCode = async () => {
      if (codeCounter === null) {
        const r = await db.query(
          `SELECT part_code FROM inventory_items WHERE part_code ~ '^SP-[0-9]+$'
           ORDER BY LENGTH(part_code) DESC, part_code DESC LIMIT 1`
        );
        codeCounter = r.rows.length ? parseInt(r.rows[0].part_code.replace('SP-', '')) + 1 : 1001;
      }
      return `SP-${codeCounter++}`;
    };

    let imported = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const part_name = row.part_name?.toString().trim();
        if (!part_name) throw new Error('Part Description is required');

        const part_code = row.part_code?.toString().trim() || await getNextCode();

        await db.query(`
          INSERT INTO inventory_items
            (part_code, part_name, description, oem_number,
             manufacturer, unit, gst_percent, purchase_price, selling_price, active, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (part_code) DO UPDATE SET
            part_name      = EXCLUDED.part_name,
            description    = COALESCE(EXCLUDED.description,    inventory_items.description),
            oem_number     = COALESCE(EXCLUDED.oem_number,     inventory_items.oem_number),
            manufacturer   = COALESCE(EXCLUDED.manufacturer,   inventory_items.manufacturer),
            unit           = EXCLUDED.unit,
            gst_percent    = EXCLUDED.gst_percent,
            purchase_price = COALESCE(EXCLUDED.purchase_price, inventory_items.purchase_price),
            selling_price  = COALESCE(EXCLUDED.selling_price,  inventory_items.selling_price),
            active         = EXCLUDED.active,
            updated_at     = NOW()
        `, [
          part_code,
          part_name,
          row.description?.toString().trim() || null,
          row.oem_number?.toString().trim()   || null,
          row.manufacturer?.toString().trim() || null,
          row.unit?.toString().trim()         || 'Nos',
          parseFloat(row.gst_percent)         || 0,
          parseFloat(row.purchase_price)      || null,
          parseFloat(row.selling_price)       || null,
          row.active !== 'Inactive',
          req.user.id
        ]);

        imported++;
      } catch (err) {
        errors.push({ row: i + 1, part_name: row.part_name || '(blank)', error: err.message });
      }
    }

    res.json({ imported, errors });
  } catch (err) {
    console.error('bulkCreate inventory_items:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, getOne, create, update, remove, bulkCreate };
