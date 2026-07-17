-- 086 - Machine SCS: per-asset service checksheet overrides
-- Extends equipment_type_scs with KM interval + creates machine-level override table

ALTER TABLE equipment_type_scs
  ADD COLUMN IF NOT EXISTS interval_km  INTEGER,
  ADD COLUMN IF NOT EXISTS km_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS machine_scs (
  id              SERIAL PRIMARY KEY,
  machine_id      INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  eq_type_scs_id  INTEGER REFERENCES equipment_type_scs(id) ON DELETE SET NULL,
  check_sheet_id  INTEGER REFERENCES check_sheets(id) ON DELETE CASCADE,
  custom_name     VARCHAR(255),
  enabled         BOOLEAN NOT NULL DEFAULT true,
  interval_hours  INTEGER,
  hours_enabled   BOOLEAN NOT NULL DEFAULT true,
  interval_days   INTEGER,
  days_enabled    BOOLEAN NOT NULL DEFAULT false,
  interval_km     INTEGER,
  km_enabled      BOOLEAN NOT NULL DEFAULT false,
  is_inherited    BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(machine_id, check_sheet_id)
);

CREATE INDEX IF NOT EXISTS idx_machine_scs_machine     ON machine_scs(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_scs_eq_type_scs ON machine_scs(eq_type_scs_id);
CREATE INDEX IF NOT EXISTS idx_machine_scs_check_sheet ON machine_scs(check_sheet_id);
