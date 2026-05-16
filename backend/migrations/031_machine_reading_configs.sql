-- Per-machine reading activation (auto-created from equipment_reading_mappings on machine add)
CREATE TABLE IF NOT EXISTS machine_reading_configs (
  id               SERIAL PRIMARY KEY,
  machine_id       INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  reading_type_id  INTEGER NOT NULL REFERENCES reading_types(id) ON DELETE CASCADE,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  display_order    INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(machine_id, reading_type_id)
);

CREATE INDEX IF NOT EXISTS idx_mrc_machine ON machine_reading_configs(machine_id);
