ALTER TABLE machine_compliance ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255);
ALTER TABLE machine_compliance ADD COLUMN IF NOT EXISTS attachment_data TEXT;
ALTER TABLE machine_compliance ADD COLUMN IF NOT EXISTS attachment_mime VARCHAR(100);
