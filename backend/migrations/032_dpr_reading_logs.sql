-- Multi-reading DPR log: stores individual reading values per entry per reading type
CREATE TABLE IF NOT EXISTS dpr_reading_logs (
  id               SERIAL PRIMARY KEY,
  entry_id         INTEGER NOT NULL REFERENCES dpr_entries(id) ON DELETE CASCADE,
  reading_type_id  INTEGER NOT NULL REFERENCES reading_types(id) ON DELETE CASCADE,
  open_value       DECIMAL(12,2),
  close_value      DECIMAL(12,2),
  total            DECIMAL(12,2),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entry_id, reading_type_id)
);

CREATE INDEX IF NOT EXISTS idx_drl_entry ON dpr_reading_logs(entry_id);
