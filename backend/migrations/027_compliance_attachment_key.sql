ALTER TABLE machine_compliance
  ADD COLUMN IF NOT EXISTS attachment_key TEXT;
