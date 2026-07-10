CREATE TABLE IF NOT EXISTS site_permissions (
  id           SERIAL PRIMARY KEY,
  project_code VARCHAR(20) NOT NULL REFERENCES projects(code) ON DELETE CASCADE,
  module       VARCHAR(100) NOT NULL,
  full_access  BOOLEAN NOT NULL DEFAULT false,
  can_view     BOOLEAN NOT NULL DEFAULT false,
  can_add      BOOLEAN NOT NULL DEFAULT false,
  can_edit     BOOLEAN NOT NULL DEFAULT false,
  can_delete   BOOLEAN NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_code, module)
);
