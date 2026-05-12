ALTER TABLE machines ADD COLUMN IF NOT EXISTS deactivation_reason varchar(100);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS transferred_from_project_id int REFERENCES projects(id);
