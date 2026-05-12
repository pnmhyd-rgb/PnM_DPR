-- hire_vendors: full vendor details for hire work orders
CREATE TABLE IF NOT EXISTS hire_vendors (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(200) NOT NULL,
  contact_person VARCHAR(100),
  phone          VARCHAR(20),
  email          VARCHAR(100),
  address        TEXT,
  gst_no         VARCHAR(20),
  pan_no         VARCHAR(20),
  bank_name      VARCHAR(100),
  bank_account   VARCHAR(30),
  bank_ifsc      VARCHAR(20),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- hire_work_orders: work order master
CREATE TABLE IF NOT EXISTS hire_work_orders (
  id               SERIAL PRIMARY KEY,
  wo_number        VARCHAR(30) NOT NULL UNIQUE,
  wo_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  indent_number    VARCHAR(50),
  vendor_id        INTEGER REFERENCES hire_vendors(id),
  project_id       INTEGER REFERENCES projects(id),
  start_date       DATE,
  end_date         DATE,
  tenure_months    NUMERIC(5,1),
  total_value      NUMERIC(14,2) NOT NULL DEFAULT 0,
  terms_conditions TEXT,
  status           VARCHAR(30) NOT NULL DEFAULT 'draft',
  parent_wo_id     INTEGER REFERENCES hire_work_orders(id),
  renewal_count    INTEGER NOT NULL DEFAULT 0,
  submitted_by     INTEGER REFERENCES users(id),
  submitted_at     TIMESTAMPTZ,
  l1_approved_by   INTEGER REFERENCES users(id),
  l1_remarks       TEXT,
  l1_approved_at   TIMESTAMPTZ,
  approved_by      INTEGER REFERENCES users(id),
  approved_remarks TEXT,
  approved_at      TIMESTAMPTZ,
  rejected_by      INTEGER REFERENCES users(id),
  rejected_remarks TEXT,
  rejected_at      TIMESTAMPTZ,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- hire_wo_items: equipment line items in a work order
CREATE TABLE IF NOT EXISTS hire_wo_items (
  id             SERIAL PRIMARY KEY,
  wo_id          INTEGER NOT NULL REFERENCES hire_work_orders(id) ON DELETE CASCADE,
  machine_id     INTEGER REFERENCES machines(id),
  equipment_desc VARCHAR(200) NOT NULL,
  quantity       NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit           VARCHAR(20) NOT NULL DEFAULT 'No.',
  rate           NUMERIC(14,2) NOT NULL DEFAULT 0,
  rate_type      VARCHAR(20) NOT NULL DEFAULT 'per_month',
  amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
