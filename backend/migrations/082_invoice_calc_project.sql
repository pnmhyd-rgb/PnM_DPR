-- 082 - Store project_id directly on invoice_calculations (for direct-preview bills)
ALTER TABLE invoice_calculations
  ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
