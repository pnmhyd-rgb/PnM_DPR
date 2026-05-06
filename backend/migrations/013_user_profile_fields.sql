ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mobile      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS email       VARCHAR(150),
  ADD COLUMN IF NOT EXISTS designation VARCHAR(100);

CREATE TABLE IF NOT EXISTS designations (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO designations (name) VALUES
  ('Site Engineer'),('Site Supervisor'),('Plant Manager'),
  ('Foreman'),('Equipment Operator'),('Store Keeper'),
  ('Site Incharge'),('Project Manager')
ON CONFLICT DO NOTHING;
