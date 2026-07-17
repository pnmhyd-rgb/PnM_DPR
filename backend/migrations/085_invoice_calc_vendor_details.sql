-- Store vendor bank/GST details manually entered for ownership bills
ALTER TABLE invoice_calculations
  ADD COLUMN IF NOT EXISTS manual_gst_no      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS manual_bank_name   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS manual_bank_account VARCHAR(50),
  ADD COLUMN IF NOT EXISTS manual_bank_ifsc   VARCHAR(20);
