-- 081 - Store WO/owner display fields on invoice_calculations (for direct-preview bills)
ALTER TABLE invoice_calculations
  ADD COLUMN IF NOT EXISTS display_wo_number  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS display_wo_date    DATE,
  ADD COLUMN IF NOT EXISTS display_owner_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS display_ownership  VARCHAR(20);
