CREATE TABLE IF NOT EXISTS spare_transactions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  txn_type VARCHAR(10) NOT NULL CHECK (txn_type IN ('Receipt', 'Issue', 'Return')),
  item_name VARCHAR(100) NOT NULL,
  item_code VARCHAR(50),
  unit VARCHAR(20) NOT NULL DEFAULT 'Nos',
  -- machine snapshot
  slno VARCHAR(50),
  eq_type VARCHAR(100),
  qty DECIMAL(10,2) NOT NULL,
  unit_cost DECIMAL(10,2),
  total DECIMAL(12,2),
  remarks TEXT,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spare_project_date ON spare_transactions(project_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_spare_item       ON spare_transactions(item_name);
