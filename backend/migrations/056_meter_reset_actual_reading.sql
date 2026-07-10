ALTER TABLE meter_reset_requests
  ADD COLUMN IF NOT EXISTS actual_reading_before_reset NUMERIC(10,2);

ALTER TABLE machine_meter_resets
  ADD COLUMN IF NOT EXISTS actual_reading_before_reset NUMERIC(10,2);
