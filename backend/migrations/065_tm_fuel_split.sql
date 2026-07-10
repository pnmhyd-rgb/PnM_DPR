-- Transit Mixer fuel split configuration
ALTER TABLE equipment_type_configs
  ADD COLUMN IF NOT EXISTS tm_split_mode  VARCHAR(20),   -- 'drum_rate' or 'vehicle_rate'
  ADD COLUMN IF NOT EXISTS tm_split_value DECIMAL(10,3); -- the configured constant

-- Propagated to machines so DPR download can read it directly
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS tm_split_mode  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tm_split_value DECIMAL(10,3);
