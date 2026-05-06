-- Payroll run header (one per project per period)
CREATE TABLE IF NOT EXISTS payroll_runs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Approved', 'Paid')),
  total_amount DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_project ON payroll_runs(project_id);

-- One line per operator per run
CREATE TABLE IF NOT EXISTS payroll_items (
  id SERIAL PRIMARY KEY,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  operator_id INTEGER REFERENCES operators(id) ON DELETE SET NULL,
  operator_name VARCHAR(100) NOT NULL,
  emp_id VARCHAR(50),
  designation VARCHAR(50),
  daily_wage DECIMAL(8,2) DEFAULT 0,
  present_days DECIMAL(5,2) DEFAULT 0,
  half_days INTEGER DEFAULT 0,
  absent_days INTEGER DEFAULT 0,
  on_leave_days INTEGER DEFAULT 0,
  ot_hours DECIMAL(6,2) DEFAULT 0,
  basic_pay DECIMAL(10,2) DEFAULT 0,
  ot_pay DECIMAL(10,2) DEFAULT 0,
  deductions DECIMAL(10,2) DEFAULT 0,
  net_pay DECIMAL(10,2) DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id);
