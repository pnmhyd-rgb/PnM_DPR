-- Link machines to asset matrix for auto-fill on asset creation
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS am_id VARCHAR(20) REFERENCES asset_matrix(am_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_machines_am_id ON machines (am_id);
