CREATE TABLE IF NOT EXISTS breakdown_incidents (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  -- machine snapshot
  slno VARCHAR(50),
  eq_type VARCHAR(100),
  -- incident details
  description TEXT NOT NULL,
  cause VARCHAR(100),
  action_taken TEXT,
  downtime_hours DECIMAL(6,2),
  repair_cost DECIMAL(10,2),
  status VARCHAR(20) NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'In Progress', 'Resolved')),
  resolved_at TIMESTAMPTZ,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breakdown_project_date ON breakdown_incidents(project_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_breakdown_machine      ON breakdown_incidents(machine_id);
CREATE INDEX IF NOT EXISTS idx_breakdown_status       ON breakdown_incidents(status);
