-- Fuel type options (manageable list for the asset name fuel type dropdown)
CREATE TABLE IF NOT EXISTS fuel_type_options (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default options
INSERT INTO fuel_type_options (name) VALUES ('Diesel'), ('Petrol')
ON CONFLICT (name) DO NOTHING;

-- Fuel type on each equipment type (asset name)
ALTER TABLE equipment_types
  ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(50);
