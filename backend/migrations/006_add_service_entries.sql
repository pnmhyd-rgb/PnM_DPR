CREATE TABLE IF NOT EXISTS service_entries (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  slno VARCHAR(50),
  eq_type VARCHAR(100),
  service_type VARCHAR(50) NOT NULL,
  mechanic VARCHAR(100),
  meter_reading VARCHAR(50),
  next_service VARCHAR(50),
  cost DECIMAL(10,2),
  parts_replaced TEXT,
  remarks TEXT,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_entries_project_date ON service_entries(project_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_service_entries_machine ON service_entries(machine_id);
