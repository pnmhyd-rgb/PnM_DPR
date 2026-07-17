-- 069_service_module.sql
-- Enhanced Service Module: Check Sheets, Schedules, Executions, Tickets

CREATE TABLE IF NOT EXISTS check_sheets (
  id                        SERIAL PRIMARY KEY,
  sheet_code                VARCHAR(30) UNIQUE NOT NULL,
  name                      VARCHAR(255) NOT NULL,
  asset_type                VARCHAR(100),
  frequency                 VARCHAR(30) NOT NULL DEFAULT 'daily',
  frequency_value           INTEGER DEFAULT 1,
  estimated_duration_hours  NUMERIC(5,2),
  check_items               JSONB NOT NULL DEFAULT '[]',
  parts_required            JSONB NOT NULL DEFAULT '[]',
  active                    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by                INTEGER REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_schedules (
  id              SERIAL PRIMARY KEY,
  check_sheet_id  INTEGER NOT NULL REFERENCES check_sheets(id),
  machine_id      INTEGER NOT NULL REFERENCES machines(id),
  project_id      INTEGER REFERENCES projects(id),
  start_date      DATE NOT NULL,
  next_due_date   DATE,
  last_done_date  DATE,
  last_meter      NUMERIC(12,2),
  next_meter      NUMERIC(12,2),
  status          VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_executions (
  id                SERIAL PRIMARY KEY,
  execution_number  VARCHAR(30) UNIQUE NOT NULL,
  schedule_id       INTEGER NOT NULL REFERENCES service_schedules(id),
  check_sheet_id    INTEGER NOT NULL REFERENCES check_sheets(id),
  machine_id        INTEGER NOT NULL REFERENCES machines(id),
  execution_date    DATE NOT NULL,
  start_time        TIME,
  end_time          TIME,
  meter_reading     NUMERIC(12,2),
  technician_name   VARCHAR(255),
  vendor_id         INTEGER REFERENCES vendors(id),
  overall_status    VARCHAR(30) NOT NULL DEFAULT 'pending',
  remarks           TEXT,
  items_result      JSONB NOT NULL DEFAULT '[]',
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_execution_parts (
  id              SERIAL PRIMARY KEY,
  execution_id    INTEGER NOT NULL REFERENCES service_executions(id) ON DELETE CASCADE,
  item_id         INTEGER,
  part_name       VARCHAR(255) NOT NULL,
  part_code       VARCHAR(50),
  qty_used        NUMERIC(10,3) NOT NULL DEFAULT 0,
  unit            VARCHAR(20),
  unit_cost       NUMERIC(12,2),
  amount          NUMERIC(12,2),
  consumption_id  INTEGER
);

CREATE TABLE IF NOT EXISTS service_tickets (
  id                SERIAL PRIMARY KEY,
  ticket_number     VARCHAR(30) UNIQUE NOT NULL,
  ticket_type       VARCHAR(30) NOT NULL,
  title             VARCHAR(500) NOT NULL,
  description       TEXT,
  machine_id        INTEGER REFERENCES machines(id),
  project_id        INTEGER REFERENCES projects(id),
  reported_date     DATE NOT NULL,
  reported_by       INTEGER REFERENCES users(id),
  assigned_to       INTEGER REFERENCES users(id),
  vendor_id         INTEGER REFERENCES vendors(id),
  priority          VARCHAR(20) NOT NULL DEFAULT 'medium',
  status            VARCHAR(30) NOT NULL DEFAULT 'draft',
  meter_reading     NUMERIC(12,2),
  estimated_hours   NUMERIC(8,2),
  actual_hours      NUMERIC(8,2),
  start_date        DATE,
  completed_date    DATE,
  closed_date       DATE,
  root_cause        TEXT,
  resolution        TEXT,
  total_parts_cost  NUMERIC(12,2) DEFAULT 0,
  total_labour_cost NUMERIC(12,2) DEFAULT 0,
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_history (
  id              SERIAL PRIMARY KEY,
  ticket_id       INTEGER NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  from_status     VARCHAR(30),
  to_status       VARCHAR(30) NOT NULL,
  changed_by      INTEGER REFERENCES users(id),
  changed_by_name VARCHAR(255),
  remarks         TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_parts (
  id              SERIAL PRIMARY KEY,
  ticket_id       INTEGER NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  item_id         INTEGER,
  part_name       VARCHAR(255) NOT NULL,
  part_code       VARCHAR(50),
  qty_required    NUMERIC(10,3) DEFAULT 0,
  qty_consumed    NUMERIC(10,3) DEFAULT 0,
  unit            VARCHAR(20),
  unit_cost       NUMERIC(12,2),
  amount          NUMERIC(12,2),
  consumption_id  INTEGER
);

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id            SERIAL PRIMARY KEY,
  ticket_id     INTEGER NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  file_name     VARCHAR(500),
  file_url      VARCHAR(1000),
  file_type     VARCHAR(50),
  remarks       TEXT,
  uploaded_by   INTEGER REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_schedules_machine ON service_schedules(machine_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_status ON service_schedules(status);
CREATE INDEX IF NOT EXISTS idx_service_schedules_next_due ON service_schedules(next_due_date);
CREATE INDEX IF NOT EXISTS idx_service_executions_schedule ON service_executions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_service_executions_date ON service_executions(execution_date);
CREATE INDEX IF NOT EXISTS idx_service_tickets_status ON service_tickets(status);
CREATE INDEX IF NOT EXISTS idx_service_tickets_type ON service_tickets(ticket_type);
CREATE INDEX IF NOT EXISTS idx_service_tickets_machine ON service_tickets(machine_id);
CREATE INDEX IF NOT EXISTS idx_service_tickets_date ON service_tickets(reported_date);
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON ticket_history(ticket_id);
