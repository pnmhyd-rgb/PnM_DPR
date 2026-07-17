-- 070 - Link invoice_rules to specific machine from asset master
ALTER TABLE invoice_rules
  ADD COLUMN IF NOT EXISTS machine_id INTEGER REFERENCES machines(id);

CREATE INDEX IF NOT EXISTS idx_invoice_rules_machine ON invoice_rules(machine_id);
