-- 083 - Service Checksheet (SCS) settings per equipment type
-- Links check_sheets to equipment types with per-type interval overrides

CREATE TABLE IF NOT EXISTS equipment_type_scs (
  id                  SERIAL PRIMARY KEY,
  equipment_type_id   INTEGER NOT NULL REFERENCES equipment_types(id) ON DELETE CASCADE,
  check_sheet_id      INTEGER REFERENCES check_sheets(id) ON DELETE CASCADE,
  custom_name         VARCHAR(255),        -- alias / display name override
  enabled             BOOLEAN NOT NULL DEFAULT true,
  interval_hours      INTEGER,             -- NULL = use check sheet default
  hours_enabled       BOOLEAN NOT NULL DEFAULT true,
  interval_days       INTEGER,             -- NULL = use check sheet default
  days_enabled        BOOLEAN NOT NULL DEFAULT false,
  sort_order          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(equipment_type_id, check_sheet_id)
);

CREATE INDEX IF NOT EXISTS idx_eq_type_scs_type ON equipment_type_scs(equipment_type_id);
