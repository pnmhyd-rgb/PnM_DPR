CREATE TABLE IF NOT EXISTS meter_reset_requests (
  id               SERIAL PRIMARY KEY,
  machine_id       INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  reading_code     VARCHAR(50),
  old_reading      NUMERIC(10,2),
  new_reading      NUMERIC(10,2),
  reset_date       TIMESTAMPTZ NOT NULL,
  remark           TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  requested_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  review_note      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
