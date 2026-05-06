ALTER TABLE equipment_types
  ADD COLUMN IF NOT EXISTS ownership_type  VARCHAR(10)  NOT NULL DEFAULT 'Own',
  ADD COLUMN IF NOT EXISTS asset_category  VARCHAR(20);

-- asset_category only applies to Own types: 'Measurable' | 'Non-Measurable'
-- Hire types leave asset_category NULL
