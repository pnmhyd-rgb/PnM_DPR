-- Add shift column to dpr_entries
ALTER TABLE dpr_entries ADD COLUMN IF NOT EXISTS shift VARCHAR(20) DEFAULT 'Day Shift';

-- Replace the per-date unique constraint with a per-date-per-shift constraint
-- so the same machine can have Day Shift AND Night Shift entries on the same date
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dpr_entries_machine_id_entry_date_key'
  ) THEN
    ALTER TABLE dpr_entries DROP CONSTRAINT dpr_entries_machine_id_entry_date_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dpr_entries_machine_date_shift_key'
  ) THEN
    ALTER TABLE dpr_entries
      ADD CONSTRAINT dpr_entries_machine_date_shift_key UNIQUE (machine_id, entry_date, shift);
  END IF;
END $$;
