-- 075 - Add maintenance tracking columns to invoice_calc_machines
ALTER TABLE invoice_calc_machines
  ADD COLUMN IF NOT EXISTS breakdown_days           NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowed_maintenance_days INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS excess_maintenance_days  NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_deduction    NUMERIC(14,2) DEFAULT 0;
