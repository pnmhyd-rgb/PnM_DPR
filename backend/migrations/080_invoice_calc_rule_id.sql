-- 080 - Store rule_id on invoice_calculations for direct-preview bills
ALTER TABLE invoice_calculations
  ADD COLUMN IF NOT EXISTS rule_id INTEGER REFERENCES invoice_rules(id);
