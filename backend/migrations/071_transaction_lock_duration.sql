-- Transaction Lock Duration: project-wise date restriction for transactions
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS transaction_lock_duration INT NULL
  CONSTRAINT chk_tld_range CHECK (transaction_lock_duration >= 1 AND transaction_lock_duration <= 365);

-- Audit log for blocked transaction attempts
CREATE TABLE IF NOT EXISTS transaction_lock_audit_log (
  id               SERIAL PRIMARY KEY,
  user_id          INT,
  user_name        VARCHAR(100),
  project_id       INT,
  project_name     VARCHAR(100),
  module_name      VARCHAR(100),
  transaction_date DATE,
  check_date       DATE DEFAULT CURRENT_DATE,
  lock_duration    INT,
  attempt_at       TIMESTAMPTZ DEFAULT NOW(),
  status           VARCHAR(20) DEFAULT 'Blocked',
  reason           TEXT
);

CREATE INDEX IF NOT EXISTS idx_tl_audit_project ON transaction_lock_audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_tl_audit_user    ON transaction_lock_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_tl_audit_at      ON transaction_lock_audit_log(attempt_at);
