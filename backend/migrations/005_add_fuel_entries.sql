CREATE TABLE IF NOT EXISTS fuel_entries (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  slno VARCHAR(50),
  eq_type VARCHAR(100),
  fuel_type VARCHAR(20) NOT NULL DEFAULT 'Diesel',
  qty DECIMAL(8,2) NOT NULL,
  rate DECIMAL(8,2),
  total DECIMAL(10,2),
  operator_name VARCHAR(100),
  remarks TEXT,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_entries_project_date ON fuel_entries(project_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_fuel_entries_machine ON fuel_entries(machine_id);
