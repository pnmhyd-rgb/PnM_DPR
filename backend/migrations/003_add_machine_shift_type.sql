-- Add shift_type to machines so the administrator fixes the shift during asset registration
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS shift_type VARCHAR(20) NOT NULL DEFAULT 'Day Shift'
  CHECK (shift_type IN ('Day Shift', 'Night Shift', 'Dual Shift'));
