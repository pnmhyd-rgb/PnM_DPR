-- Add detailed asset status tracking to machines
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS asset_status        VARCHAR(20)  DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS asset_status_since  TIMESTAMP    DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS asset_status_remarks TEXT,
  ADD COLUMN IF NOT EXISTS asset_status_changed_by INT REFERENCES users(id);

-- Seed initial status from existing active flag
UPDATE machines
SET asset_status = CASE WHEN active THEN 'Active' ELSE 'Scrap' END
WHERE asset_status IS NULL OR asset_status = 'Active';

-- Audit trail for status changes
CREATE TABLE IF NOT EXISTS machine_status_history (
  id          SERIAL PRIMARY KEY,
  machine_id  INT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL,
  remarks     TEXT,
  changed_by  INT REFERENCES users(id),
  changed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machine_status_history_machine ON machine_status_history(machine_id);
