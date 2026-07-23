-- Add workflow columns to inventory_consumption
ALTER TABLE inventory_consumption
  ADD COLUMN IF NOT EXISTS updated_by  INT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ;
