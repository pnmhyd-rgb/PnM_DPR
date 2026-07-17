-- 076 - Add breakdown_days to invoice_rule_deductions
ALTER TABLE invoice_rule_deductions
  ADD COLUMN IF NOT EXISTS breakdown_days INTEGER DEFAULT 0;
