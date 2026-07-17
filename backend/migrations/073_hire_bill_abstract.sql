-- 073 - Hire Bill Abstract: per-machine breakdown + enhanced invoice calc fields

ALTER TABLE invoice_calculations
  ADD COLUMN IF NOT EXISTS ra_bill_no         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gst_rate           NUMERIC(5,2)  DEFAULT 18,
  ADD COLUMN IF NOT EXISTS gst_amount         NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_payable      NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS income_tax_rate    NUMERIC(5,2)  DEFAULT 2,
  ADD COLUMN IF NOT EXISTS income_tax_amount  NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stores_amount      NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_amount     NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_recoveries   NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable        NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diesel_rate        NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prev_calc_id       INTEGER REFERENCES invoice_calculations(id);

CREATE TABLE IF NOT EXISTS invoice_calc_machines (
  id                SERIAL PRIMARY KEY,
  calc_id           INTEGER NOT NULL REFERENCES invoice_calculations(id) ON DELETE CASCADE,
  machine_id        INTEGER REFERENCES machines(id),
  reg_no            VARCHAR(50),
  description       VARCHAR(200),
  unit              VARCHAR(20)   NOT NULL DEFAULT 'Month',
  monthly_rate      NUMERIC(14,2) NOT NULL DEFAULT 0,
  cal_days          INTEGER       NOT NULL DEFAULT 30,
  working_days      INTEGER       NOT NULL DEFAULT 0,
  hire_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  diesel_qty        NUMERIC(10,2) NOT NULL DEFAULT 0,
  diesel_rate       NUMERIC(10,2) NOT NULL DEFAULT 0,
  diesel_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_hire_diesel NUMERIC(14,2) NOT NULL DEFAULT 0,
  cubic_meter_qty   NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_per_cum      NUMERIC(10,2) NOT NULL DEFAULT 0,
  actual_hours      NUMERIC(10,2) NOT NULL DEFAULT 0,
  actual_km         NUMERIC(10,2) NOT NULL DEFAULT 0,
  planned_hrs_month NUMERIC(10,2) NOT NULL DEFAULT 0,
  utilization_pct   NUMERIC(6,2)  NOT NULL DEFAULT 0,
  is_tm             BOOLEAN       NOT NULL DEFAULT false,
  is_mobilization   BOOLEAN       NOT NULL DEFAULT false,
  mob_qty           INTEGER                DEFAULT 1,
  mob_unit_rate     NUMERIC(14,2)          DEFAULT 0,
  sort_order        INTEGER       NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_inv_calc_machines_calc ON invoice_calc_machines(calc_id);
