-- Year of manufacture on machine master (separate from date_of_purchase)
ALTER TABLE machines ADD COLUMN IF NOT EXISTS yom VARCHAR(10);

-- Formal work-order fields needed to replicate the legal-letter style hire WO
ALTER TABLE hire_work_orders
  ADD COLUMN IF NOT EXISTS description_line     TEXT,
  ADD COLUMN IF NOT EXISTS site_address         TEXT,
  ADD COLUMN IF NOT EXISTS reporting_date       DATE,
  ADD COLUMN IF NOT EXISTS site_contact_name    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS site_contact_phone   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS mobilization_advance VARCHAR(100) DEFAULT 'NA';

-- Equipment specifics + shift-wise rates on each WO line item (snapshot, editable per WO)
ALTER TABLE hire_wo_items
  ADD COLUMN IF NOT EXISTS reg_no             VARCHAR(50),
  ADD COLUMN IF NOT EXISTS manufacturer       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS model              VARCHAR(100),
  ADD COLUMN IF NOT EXISTS yom                VARCHAR(10),
  ADD COLUMN IF NOT EXISTS rate_single_shift  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS rate_double_shift  NUMERIC(14,2);
