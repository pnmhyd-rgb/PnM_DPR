-- Extend machines table with full asset register fields
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS manufacturer    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS model           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS chassis_no      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS uom             VARCHAR(30),
  ADD COLUMN IF NOT EXISTS fuel_type       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS asset_type      VARCHAR(30),
  ADD COLUMN IF NOT EXISTS date_of_purchase DATE,
  ADD COLUMN IF NOT EXISTS po_number       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS price           DECIMAL(14,2);

-- UOM types (admin-managed)
CREATE TABLE IF NOT EXISTS uom_types (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO uom_types (name) VALUES
  ('Nos'),('Tons'),('Cum'),('Kgs'),('Litres'),('Metres'),('Sets'),('Pairs')
ON CONFLICT DO NOTHING;

-- Vendor history (auto-saved on hire asset creation)
CREATE TABLE IF NOT EXISTS vendors (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(150) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permission: non-admin users who may add assets
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_add_assets BOOLEAN DEFAULT false;
