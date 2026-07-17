-- 084 - Store ownership vendor on invoice_rules for ownership-linked rules
-- When an invoice rule is created via "Add Rule (Ownership)", both the
-- owning vendor name and the specific machine (asset) are stored here.
ALTER TABLE invoice_rules
  ADD COLUMN IF NOT EXISTS ownership_vendor VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_invoice_rules_ownership ON invoice_rules(ownership_vendor)
  WHERE ownership_vendor IS NOT NULL;
