-- Link Asset (machine) to Hire Work Orders
ALTER TABLE hire_work_orders
  ADD COLUMN IF NOT EXISTS machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hire_wo_machine ON hire_work_orders(machine_id);

-- Manual / External Work Order support in Hire Bills
ALTER TABLE hire_bills
  ALTER COLUMN wo_id DROP NOT NULL;

ALTER TABLE hire_bills
  ADD COLUMN IF NOT EXISTS is_manual          BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS external_wo_number VARCHAR(100);
