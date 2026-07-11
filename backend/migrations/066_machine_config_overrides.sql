ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS fuel_formula_type          VARCHAR(20) DEFAULT 'L_per_Hr',
  ADD COLUMN IF NOT EXISTS fuel_entry_override        BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS breakdown_entry_override   BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closing_reading_override   BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS qty_mandatory_km_override  BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS qty_mandatory_hrs_override BOOLEAN DEFAULT NULL;
