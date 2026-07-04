-- Equipment type per WO line item, used to filter the machine-specific Terms & Conditions picker
ALTER TABLE hire_wo_items ADD COLUMN IF NOT EXISTS eq_type VARCHAR(100);
