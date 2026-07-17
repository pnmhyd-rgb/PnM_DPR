-- ============================================================
-- 067 - Accounts Module: Invoice Rules & Calculations
-- ============================================================

-- Master invoice rules
CREATE TABLE IF NOT EXISTS invoice_rules (
  id                   SERIAL PRIMARY KEY,
  rule_number          VARCHAR(50)  NOT NULL UNIQUE,
  rule_name            VARCHAR(200) NOT NULL,
  asset_type           VARCHAR(100),
  basic_rate           NUMERIC(14,2) NOT NULL,
  days                 INTEGER       NOT NULL DEFAULT 30,
  adjust_calendar_days BOOLEAN       NOT NULL DEFAULT false,
  hours                INTEGER       DEFAULT 360,
  active               BOOLEAN       NOT NULL DEFAULT true,
  created_by           INTEGER REFERENCES users(id),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Additions config (1:1 per rule)
CREATE TABLE IF NOT EXISTS invoice_rule_additions (
  id                          SERIAL PRIMARY KEY,
  rule_id                     INTEGER NOT NULL REFERENCES invoice_rules(id) ON DELETE CASCADE UNIQUE,
  excess_days_applicable      BOOLEAN NOT NULL DEFAULT true,
  day_threshold               NUMERIC(10,2),
  day_excess_rate             NUMERIC(14,4),
  excess_hours_applicable     BOOLEAN NOT NULL DEFAULT false,
  hour_threshold              NUMERIC(10,2),
  hour_excess_rate            NUMERIC(14,4),
  maintenance_applicable      BOOLEAN NOT NULL DEFAULT false,
  allowed_maintenance_days    INTEGER,
  maintenance_excess_rate     NUMERIC(14,4),
  weekly_off_applicable       BOOLEAN NOT NULL DEFAULT false,
  weekly_off_count            INTEGER,
  weekly_off_charges          NUMERIC(14,4),
  productivity_applicable     BOOLEAN NOT NULL DEFAULT false,
  productivity_target         NUMERIC(10,2),
  productivity_excess_charges NUMERIC(14,4)
);

-- Other charges (1:many per rule)
CREATE TABLE IF NOT EXISTS invoice_rule_other_charges (
  id          SERIAL PRIMARY KEY,
  rule_id     INTEGER NOT NULL REFERENCES invoice_rules(id) ON DELETE CASCADE,
  charge_name VARCHAR(200) NOT NULL,
  amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  calc_type   VARCHAR(30)  NOT NULL DEFAULT 'fixed',
  sort_order  INTEGER DEFAULT 0
);

-- Deductions config (1:1 per rule)
CREATE TABLE IF NOT EXISTS invoice_rule_deductions (
  id                       SERIAL PRIMARY KEY,
  rule_id                  INTEGER NOT NULL REFERENCES invoice_rules(id) ON DELETE CASCADE UNIQUE,
  breakdown_applicable     BOOLEAN NOT NULL DEFAULT false,
  breakdown_limit          NUMERIC(10,2),
  breakdown_deduction_rate NUMERIC(14,4),
  fuel_applicable          BOOLEAN NOT NULL DEFAULT false,
  approved_mileage         NUMERIC(10,4),
  fuel_deduction_rate      NUMERIC(14,4)
);

-- Calculation records
CREATE TABLE IF NOT EXISTS invoice_calculations (
  id                      SERIAL PRIMARY KEY,
  work_order_id           INTEGER REFERENCES hire_work_orders(id),
  rule_id                 INTEGER REFERENCES invoice_rules(id),
  machine_id              INTEGER REFERENCES machines(id),
  period_from             DATE NOT NULL,
  period_to               DATE NOT NULL,
  actual_days             INTEGER,
  actual_hours            NUMERIC(10,2),
  actual_breakdown_hrs    NUMERIC(10,2) DEFAULT 0,
  actual_hsd              NUMERIC(10,2) DEFAULT 0,
  actual_km               NUMERIC(10,2) DEFAULT 0,
  billable_days           INTEGER,
  basic_amount            NUMERIC(14,2),
  additions_total         NUMERIC(14,2) DEFAULT 0,
  deductions_total        NUMERIC(14,2) DEFAULT 0,
  invoice_amount          NUMERIC(14,2),
  manual_additions_total  NUMERIC(14,2) DEFAULT 0,
  manual_deductions_total NUMERIC(14,2) DEFAULT 0,
  final_total             NUMERIC(14,2),
  invoice_date            DATE,
  invoice_number          VARCHAR(100),
  remarks                 TEXT,
  status                  VARCHAR(30) NOT NULL DEFAULT 'draft',
  calc_snapshot           JSONB,
  created_by              INTEGER REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Manual additions/deductions per calculation
CREATE TABLE IF NOT EXISTS invoice_calc_manual_items (
  id      SERIAL PRIMARY KEY,
  calc_id INTEGER NOT NULL REFERENCES invoice_calculations(id) ON DELETE CASCADE,
  type    VARCHAR(20) NOT NULL CHECK (type IN ('addition', 'deduction')),
  notes   TEXT,
  amount  NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- Link WO to invoice rule
ALTER TABLE hire_work_orders
  ADD COLUMN IF NOT EXISTS invoice_rule_id INTEGER REFERENCES invoice_rules(id);

CREATE INDEX IF NOT EXISTS idx_invoice_calc_wo   ON invoice_calculations(work_order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_calc_rule ON invoice_calculations(rule_id);
