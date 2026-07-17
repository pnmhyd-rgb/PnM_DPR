-- 074 - Add planned_km to invoice_rules for km-based utilization tracking
ALTER TABLE invoice_rules
  ADD COLUMN IF NOT EXISTS planned_km NUMERIC(10,2);
