CREATE TABLE IF NOT EXISTS user_permissions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module      VARCHAR(100) NOT NULL,
  full_access BOOLEAN NOT NULL DEFAULT false,
  can_view    BOOLEAN NOT NULL DEFAULT false,
  can_add     BOOLEAN NOT NULL DEFAULT false,
  can_edit    BOOLEAN NOT NULL DEFAULT false,
  can_delete  BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, module)
);
