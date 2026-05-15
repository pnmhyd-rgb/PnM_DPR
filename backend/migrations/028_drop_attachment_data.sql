-- Run AFTER migrate-attachments-to-spaces.js confirms zero rows with attachment_data NOT NULL
ALTER TABLE machine_compliance DROP COLUMN IF EXISTS attachment_data;
