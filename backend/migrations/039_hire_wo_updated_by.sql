-- Track who last edited a hire work order, for showing "Last edited by" on draft copies
ALTER TABLE hire_work_orders ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
