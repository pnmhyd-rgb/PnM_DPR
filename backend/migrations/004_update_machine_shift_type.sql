-- Drop old CHECK constraint first so the UPDATE below isn't blocked
ALTER TABLE machines DROP CONSTRAINT IF EXISTS machines_shift_type_check;

-- Migrate existing shift_type values: Day/Night Shift → Single Shift
UPDATE machines SET shift_type = 'Single Shift' WHERE shift_type IN ('Day Shift', 'Night Shift');

-- Add new constraint with only Single Shift / Dual Shift
ALTER TABLE machines ADD CONSTRAINT machines_shift_type_check
  CHECK (shift_type IN ('Single Shift', 'Dual Shift'));

-- Update column default
ALTER TABLE machines ALTER COLUMN shift_type SET DEFAULT 'Single Shift';
