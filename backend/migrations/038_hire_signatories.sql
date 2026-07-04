-- Managed list of designations (Director, President, AGM, etc.)
CREATE TABLE IF NOT EXISTS hire_signatory_designations (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO hire_signatory_designations (name) VALUES
  ('Director'), ('President'), ('AGM')
ON CONFLICT (name) DO NOTHING;

-- Authorized signatories (name + designation) selectable per work order
CREATE TABLE IF NOT EXISTS hire_signatories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  designation VARCHAR(100) NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO hire_signatories (name, designation)
SELECT 'R SATYANARAYANA', 'Director'
WHERE NOT EXISTS (SELECT 1 FROM hire_signatories WHERE name = 'R SATYANARAYANA');

-- Which signatory signs a given work order (defaults to the seeded one above when null)
ALTER TABLE hire_work_orders ADD COLUMN IF NOT EXISTS signatory_id INTEGER REFERENCES hire_signatories(id);
