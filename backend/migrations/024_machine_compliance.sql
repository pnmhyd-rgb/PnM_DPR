-- RTA Compliance tracking: one row per (machine, doc_type, doc_label)
-- doc_label is '' for standard types, custom name for custom docs
CREATE TABLE IF NOT EXISTS machine_compliance (
  id            SERIAL PRIMARY KEY,
  machine_id    INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  doc_type      VARCHAR(60)  NOT NULL,
  doc_label     VARCHAR(100) NOT NULL DEFAULT '',
  doc_no        VARCHAR(100),
  issued_date   DATE,
  expiry_date   DATE,
  issued_by     VARCHAR(100),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(machine_id, doc_type, doc_label)
);

CREATE INDEX IF NOT EXISTS machine_compliance_machine_idx ON machine_compliance(machine_id);
CREATE INDEX IF NOT EXISTS machine_compliance_expiry_idx  ON machine_compliance(expiry_date);
