-- 088 - Machine SCS Executions: track when each checksheet was last done

ALTER TABLE machine_scs
  ADD COLUMN IF NOT EXISTS last_done_date  DATE,
  ADD COLUMN IF NOT EXISTS last_done_hours NUMERIC(10,1),
  ADD COLUMN IF NOT EXISTS last_done_km    NUMERIC(10,1),
  ADD COLUMN IF NOT EXISTS last_done_note  TEXT;
