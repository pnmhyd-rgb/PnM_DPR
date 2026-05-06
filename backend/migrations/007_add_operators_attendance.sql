-- Operators / Employees
CREATE TABLE IF NOT EXISTS operators (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  emp_id VARCHAR(50),
  designation VARCHAR(50) NOT NULL DEFAULT 'Operator',
  mobile VARCHAR(20),
  licence_no VARCHAR(50),
  joining_date DATE,
  daily_wage DECIMAL(8,2),
  status VARCHAR(20) NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Inactive', 'On Leave')),
  machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operators_project ON operators(project_id);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Present'
    CHECK (status IN ('Present', 'Absent', 'Half Day', 'On Leave', 'Holiday')),
  shift VARCHAR(20) NOT NULL DEFAULT 'Day'
    CHECK (shift IN ('Day', 'Night', 'Full Day')),
  ot_hours DECIMAL(4,2) DEFAULT 0,
  remarks TEXT,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (operator_id, entry_date, shift)
);

CREATE INDEX IF NOT EXISTS idx_attendance_project_date ON attendance(project_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_attendance_operator_date ON attendance(operator_id, entry_date);
