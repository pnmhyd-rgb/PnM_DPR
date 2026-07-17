-- 077 - Make invoice rules generic (no machine binding)
-- Add description column to invoice_rules
ALTER TABLE invoice_rules ADD COLUMN IF NOT EXISTS description TEXT;

-- Add invoice_rule_id to hire_wo_items so rules are assigned per WO line item
ALTER TABLE hire_wo_items ADD COLUMN IF NOT EXISTS invoice_rule_id INTEGER REFERENCES invoice_rules(id);

-- machine_id on invoice_rules is retained for backward compatibility
-- but is no longer required or used by the UI/API
