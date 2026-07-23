-- 089 - SCS Transactions: records every execution of a machine's service checksheet

CREATE TABLE IF NOT EXISTS scs_transactions (
  id                   SERIAL PRIMARY KEY,
  transaction_no       VARCHAR(30) UNIQUE NOT NULL,
  machine_scs_id       INTEGER NOT NULL REFERENCES machine_scs(id) ON DELETE CASCADE,
  machine_id           INTEGER NOT NULL REFERENCES machines(id)    ON DELETE CASCADE,
  execution_date       DATE NOT NULL,
  execution_hours      NUMERIC(10,1),
  execution_km         NUMERIC(10,1),
  prev_hours           NUMERIC(10,1),
  prev_km              NUMERIC(10,1),
  prev_date            DATE,
  scs_name             VARCHAR(255),
  scs_description      TEXT,
  scs_section          VARCHAR(150),
  scs_sub_section      VARCHAR(150),
  recommended_hours    INTEGER,
  recommended_days     INTEGER,
  recommended_km       INTEGER,
  ticket_ref           VARCHAR(100),
  remark               TEXT,
  parameter            TEXT,
  executed_parameter   TEXT,
  execution_site       VARCHAR(200),
  executed_by          INTEGER REFERENCES users(id),
  created_by           INTEGER REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by           INTEGER REFERENCES users(id),
  updated_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scs_tx_machine   ON scs_transactions(machine_id);
CREATE INDEX IF NOT EXISTS idx_scs_tx_mach_scs  ON scs_transactions(machine_scs_id);
CREATE INDEX IF NOT EXISTS idx_scs_tx_date      ON scs_transactions(execution_date DESC);
