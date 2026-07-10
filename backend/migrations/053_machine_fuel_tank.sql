-- Add fuel tank capacity to machines
ALTER TABLE machines ADD COLUMN IF NOT EXISTS fuel_tank_l NUMERIC;
