-- ── 068: Full Inventory Management Module ───────────────────────────────────

-- Categories (self-referential hierarchy: category → sub-category)
CREATE TABLE IF NOT EXISTS inventory_categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  parent_id   INTEGER REFERENCES inventory_categories(id) ON DELETE SET NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(30) UNIQUE NOT NULL,
  name       VARCHAR(150) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  manager    VARCHAR(100),
  contact    VARCHAR(30),
  address    TEXT,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Warehouse Locations (Rack / Shelf / Bin)
CREATE TABLE IF NOT EXISTS warehouse_locations (
  id           SERIAL PRIMARY KEY,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  rack         VARCHAR(50),
  shelf        VARCHAR(50),
  bin          VARCHAR(50),
  active       BOOLEAN NOT NULL DEFAULT true
);

-- Spare Parts / Inventory Items master
CREATE TABLE IF NOT EXISTS inventory_items (
  id                   SERIAL PRIMARY KEY,
  part_code            VARCHAR(60) UNIQUE NOT NULL,
  part_name            VARCHAR(200) NOT NULL,
  description          TEXT,
  category_id          INTEGER REFERENCES inventory_categories(id) ON DELETE SET NULL,
  sub_category_id      INTEGER REFERENCES inventory_categories(id) ON DELETE SET NULL,
  oem_number           VARCHAR(100),
  manufacturer         VARCHAR(100),
  brand                VARCHAR(100),
  vendor_id            INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  unit                 VARCHAR(20) NOT NULL DEFAULT 'Nos',
  gst_percent          NUMERIC(5,2) NOT NULL DEFAULT 18,
  hsn_code             VARCHAR(20),
  purchase_price       NUMERIC(14,2),
  average_cost         NUMERIC(14,2) DEFAULT 0,
  selling_price        NUMERIC(14,2),
  opening_qty          NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_stock            NUMERIC(14,3) NOT NULL DEFAULT 0,
  max_stock            NUMERIC(14,3),
  reorder_level        NUMERIC(14,3) NOT NULL DEFAULT 0,
  warehouse_id         INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
  location_id          INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  barcode              VARCHAR(100),
  qr_code              VARCHAR(200),
  image_url            TEXT,
  costing_method       VARCHAR(20) NOT NULL DEFAULT 'weighted_avg',
  active               BOOLEAN NOT NULL DEFAULT true,
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory Stock (current balance per item per warehouse)
CREATE TABLE IF NOT EXISTS inventory_stock (
  id           SERIAL PRIMARY KEY,
  item_id      INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  location_id  INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  current_qty  NUMERIC(14,3) NOT NULL DEFAULT 0,
  reserved_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  average_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_id, warehouse_id)
);

-- Stock Ledger (immutable audit trail of every movement)
CREATE TABLE IF NOT EXISTS stock_ledger (
  id             SERIAL PRIMARY KEY,
  item_id        INTEGER NOT NULL REFERENCES inventory_items(id),
  warehouse_id   INTEGER REFERENCES warehouses(id),
  txn_date       DATE NOT NULL,
  txn_type       VARCHAR(50) NOT NULL,
  reference_type VARCHAR(50),
  reference_id   INTEGER,
  reference_no   VARCHAR(60),
  opening_qty    NUMERIC(14,3) NOT NULL DEFAULT 0,
  in_qty         NUMERIC(14,3) NOT NULL DEFAULT 0,
  out_qty        NUMERIC(14,3) NOT NULL DEFAULT 0,
  closing_qty    NUMERIC(14,3) NOT NULL DEFAULT 0,
  rate           NUMERIC(14,2),
  amount         NUMERIC(16,2),
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remarks        TEXT
);

-- Goods Receipts (GRN)
CREATE TABLE IF NOT EXISTS goods_receipts (
  id             SERIAL PRIMARY KEY,
  grn_number     VARCHAR(40) UNIQUE NOT NULL,
  po_number      VARCHAR(60),
  vendor_id      INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  invoice_number VARCHAR(60),
  grn_date       DATE NOT NULL,
  warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id),
  status         VARCHAR(20) NOT NULL DEFAULT 'draft',
  sub_total      NUMERIC(16,2) DEFAULT 0,
  gst_amount     NUMERIC(16,2) DEFAULT 0,
  total_amount   NUMERIC(16,2) DEFAULT 0,
  remarks        TEXT,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id           SERIAL PRIMARY KEY,
  grn_id       INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES inventory_items(id),
  ordered_qty  NUMERIC(14,3),
  received_qty NUMERIC(14,3) NOT NULL,
  accepted_qty NUMERIC(14,3) NOT NULL,
  rejected_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  rate         NUMERIC(14,2) NOT NULL,
  gst_percent  NUMERIC(5,2) DEFAULT 0,
  gst_amount   NUMERIC(14,2) DEFAULT 0,
  total_amount NUMERIC(14,2) DEFAULT 0,
  location_id  INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  remarks      TEXT
);

-- Stock Transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
  id                SERIAL PRIMARY KEY,
  transfer_number   VARCHAR(40) UNIQUE NOT NULL,
  transfer_date     DATE NOT NULL,
  from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  to_warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'draft',
  reason            TEXT,
  remarks           TEXT,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id                SERIAL PRIMARY KEY,
  transfer_id       INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  item_id           INTEGER NOT NULL REFERENCES inventory_items(id),
  from_location_id  INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  to_location_id    INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  requested_qty     NUMERIC(14,3) NOT NULL,
  transferred_qty   NUMERIC(14,3),
  received_qty      NUMERIC(14,3),
  remarks           TEXT
);

-- Stock Adjustments
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id                SERIAL PRIMARY KEY,
  adjustment_number VARCHAR(40) UNIQUE NOT NULL,
  adjustment_date   DATE NOT NULL,
  warehouse_id      INTEGER NOT NULL REFERENCES warehouses(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
  reason            TEXT NOT NULL,
  remarks           TEXT,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_adjustment_items (
  id             SERIAL PRIMARY KEY,
  adjustment_id  INTEGER NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  item_id        INTEGER NOT NULL REFERENCES inventory_items(id),
  location_id    INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  system_qty     NUMERIC(14,3) NOT NULL,
  physical_qty   NUMERIC(14,3) NOT NULL,
  difference     NUMERIC(14,3) GENERATED ALWAYS AS (physical_qty - system_qty) STORED,
  remarks        TEXT
);

-- Consumption
CREATE TABLE IF NOT EXISTS inventory_consumption (
  id                 SERIAL PRIMARY KEY,
  consumption_number VARCHAR(40) UNIQUE NOT NULL,
  txn_date           DATE NOT NULL,
  warehouse_id       INTEGER NOT NULL REFERENCES warehouses(id),
  consumption_type   VARCHAR(50) NOT NULL,
  machine_id         INTEGER REFERENCES machines(id) ON DELETE SET NULL,
  work_order_id      INTEGER REFERENCES hire_work_orders(id) ON DELETE SET NULL,
  project_id         INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  department         VARCHAR(100),
  status             VARCHAR(20) NOT NULL DEFAULT 'draft',
  sub_total          NUMERIC(16,2) NOT NULL DEFAULT 0,
  gst_amount         NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_amount       NUMERIC(16,2) NOT NULL DEFAULT 0,
  notes              TEXT,
  adjustment         NUMERIC(14,2) DEFAULT 0,
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consumption_items (
  id             SERIAL PRIMARY KEY,
  consumption_id INTEGER NOT NULL REFERENCES inventory_consumption(id) ON DELETE CASCADE,
  item_id        INTEGER NOT NULL REFERENCES inventory_items(id),
  warehouse_id   INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
  location_id    INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  demand_qty     NUMERIC(14,3),
  allocated_qty  NUMERIC(14,3),
  consumption_qty NUMERIC(14,3) NOT NULL,
  unit           VARCHAR(20),
  unit_rate      NUMERIC(14,2),
  amount         NUMERIC(14,2),
  remarks        TEXT
);

-- Parts Returns
CREATE TABLE IF NOT EXISTS parts_returns (
  id             SERIAL PRIMARY KEY,
  return_number  VARCHAR(40) UNIQUE NOT NULL,
  return_date    DATE NOT NULL,
  consumption_id INTEGER REFERENCES inventory_consumption(id) ON DELETE SET NULL,
  warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id),
  status         VARCHAR(20) NOT NULL DEFAULT 'draft',
  remarks        TEXT,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parts_return_items (
  id                  SERIAL PRIMARY KEY,
  return_id           INTEGER NOT NULL REFERENCES parts_returns(id) ON DELETE CASCADE,
  item_id             INTEGER NOT NULL REFERENCES inventory_items(id),
  consumption_item_id INTEGER REFERENCES consumption_items(id) ON DELETE SET NULL,
  issued_qty          NUMERIC(14,3),
  return_qty          NUMERIC(14,3) NOT NULL,
  condition           VARCHAR(20) NOT NULL DEFAULT 'good',
  reason              TEXT,
  remarks             TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_warehouse ON inventory_items(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_item ON inventory_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_warehouse ON inventory_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_item ON stock_ledger(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_date ON stock_ledger(txn_date);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_ref ON stock_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_grn_date ON goods_receipts(grn_date);
CREATE INDEX IF NOT EXISTS idx_grn_status ON goods_receipts(status);
CREATE INDEX IF NOT EXISTS idx_consumption_date ON inventory_consumption(txn_date);
CREATE INDEX IF NOT EXISTS idx_consumption_status ON inventory_consumption(status);
CREATE INDEX IF NOT EXISTS idx_consumption_machine ON inventory_consumption(machine_id);
