ALTER TABLE dpr_entries
  ADD COLUMN IF NOT EXISTS reset_old_reading NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS reset_new_reading NUMERIC(10,2);
