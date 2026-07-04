-- Managed list of sub-headings (categories) for the hire WO Terms & Conditions
-- picker, so they can be added/removed independently of individual conditions.
CREATE TABLE IF NOT EXISTS hire_terms_categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO hire_terms_categories (name) VALUES
  ('Mobilization'), ('Operator Scope'), ('Fuel Scope'), ('Breakdown Maintenance'), ('Maintenance'),
  ('Equipment Availability'), ('Billing Period'), ('Idle Charges'), ('Monsoon Terms'),
  ('Accommodation & Food'), ('Overtime Charges'), ('Insurance & Compliance'), ('Equipment Specification'),
  ('Wear Parts'), ('Rate Terms'), ('Shift Charges'), ('Payment Terms'), ('Termination Notice'), ('Dispute Resolution')
ON CONFLICT (name) DO NOTHING;

-- Backfill any custom categories already in use (e.g. user-added sub-headings)
INSERT INTO hire_terms_categories (name)
SELECT DISTINCT category FROM hire_terms_library
ON CONFLICT (name) DO NOTHING;
