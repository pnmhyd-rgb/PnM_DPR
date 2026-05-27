-- Add billing_rules JSONB to hire_work_orders
ALTER TABLE hire_work_orders
  ADD COLUMN IF NOT EXISTS billing_rules JSONB;

-- hire_bills: one bill per WO per billing period
CREATE TABLE IF NOT EXISTS hire_bills (
  id                  SERIAL PRIMARY KEY,
  bill_number         VARCHAR(50) UNIQUE NOT NULL,
  wo_id               INTEGER NOT NULL REFERENCES hire_work_orders(id),
  vendor_id           INTEGER REFERENCES hire_vendors(id),
  project_id          INTEGER REFERENCES projects(id),

  billing_period_from DATE NOT NULL,
  billing_period_to   DATE NOT NULL,
  billing_month       VARCHAR(7),               -- 'YYYY-MM'

  total_calendar_days INTEGER      DEFAULT 0,
  total_working_days  NUMERIC(8,2) DEFAULT 0,
  total_working_hours NUMERIC(8,2) DEFAULT 0,
  sunday_days_worked  INTEGER      DEFAULT 0,
  overtime_hours      NUMERIC(8,2) DEFAULT 0,

  base_amount         NUMERIC(14,2) DEFAULT 0,
  overtime_amount     NUMERIC(14,2) DEFAULT 0,
  sunday_amount       NUMERIC(14,2) DEFAULT 0,
  other_additions     NUMERIC(14,2) DEFAULT 0,
  deductions          NUMERIC(14,2) DEFAULT 0,
  net_amount          NUMERIC(14,2) DEFAULT 0,
  gst_percent         NUMERIC(5,2)  DEFAULT 18,
  gst_amount          NUMERIC(14,2) DEFAULT 0,
  total_amount        NUMERIC(14,2) DEFAULT 0,

  vendor_bill_no      VARCHAR(100),
  vendor_bill_date    DATE,

  payment_date        DATE,
  payment_reference   VARCHAR(200),
  payment_mode        VARCHAR(50),

  status              VARCHAR(30) NOT NULL DEFAULT 'draft',
  remarks             TEXT,

  created_by          INTEGER REFERENCES users(id),
  submitted_by        INTEGER REFERENCES users(id),
  submitted_at        TIMESTAMPTZ,
  approved_by         INTEGER REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  approval_remarks    TEXT,
  paid_by             INTEGER REFERENCES users(id),
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- hire_bill_items: one row per equipment item per bill
CREATE TABLE IF NOT EXISTS hire_bill_items (
  id              SERIAL PRIMARY KEY,
  bill_id         INTEGER NOT NULL REFERENCES hire_bills(id) ON DELETE CASCADE,
  wo_item_id      INTEGER REFERENCES hire_wo_items(id),
  machine_id      INTEGER REFERENCES machines(id),
  equipment_desc  VARCHAR(200) NOT NULL,
  rate_type       VARCHAR(20)  DEFAULT 'per_month',
  rate            NUMERIC(14,2) DEFAULT 0,
  quantity        NUMERIC(10,2) DEFAULT 1,
  unit            VARCHAR(20)  DEFAULT 'No.',
  working_days    NUMERIC(8,2) DEFAULT 0,
  working_hours   NUMERIC(8,2) DEFAULT 0,
  sunday_days     INTEGER      DEFAULT 0,
  overtime_hrs    NUMERIC(8,2) DEFAULT 0,
  base_amount     NUMERIC(14,2) DEFAULT 0,
  overtime_amount NUMERIC(14,2) DEFAULT 0,
  sunday_amount   NUMERIC(14,2) DEFAULT 0,
  total_amount    NUMERIC(14,2) DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
