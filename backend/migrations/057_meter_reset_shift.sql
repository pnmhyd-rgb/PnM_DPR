ALTER TABLE meter_reset_requests
  ADD COLUMN IF NOT EXISTS reset_shift VARCHAR(20);
