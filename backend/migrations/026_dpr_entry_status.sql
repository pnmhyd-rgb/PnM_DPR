-- DPR Entry Status Workflow
-- Status lifecycle: submitted (default on create) → closed (admin finalises)
-- Admin can reopen to 'open' for correction; 'open' blocks next-day entry for that machine.

ALTER TABLE dpr_entries
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('open', 'submitted', 'closed'));

-- All pre-existing entries are treated as submitted
UPDATE dpr_entries SET status = 'submitted' WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS idx_dpr_entries_machine_date_status
  ON dpr_entries (machine_id, entry_date, status);
