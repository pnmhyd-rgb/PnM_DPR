-- 079 - Manual productivity rates on invoice rules
-- hours_rate: ₹ per hour (for Working Hrs/Month tracking)
-- km_rate:    ₹ per km   (for Working KM/Month tracking)
ALTER TABLE invoice_rules
  ADD COLUMN IF NOT EXISTS hours_rate NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS km_rate    NUMERIC(14,4);
