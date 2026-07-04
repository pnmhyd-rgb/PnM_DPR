-- Asset Matrix master table
-- Uniqueness: one AM ID per make+model combination
-- Capacity varies per individual machine and is stored on the machines table
CREATE TABLE IF NOT EXISTS asset_matrix (
  id               SERIAL PRIMARY KEY,
  am_id            VARCHAR(20) UNIQUE NOT NULL,      -- RVR-AM-00001
  asset_type       VARCHAR(150),
  manufacturer     VARCHAR(150) NOT NULL,
  model            VARCHAR(150) NOT NULL,
  fuel_type        VARCHAR(50),
  technical_specs  JSONB NOT NULL DEFAULT '{}',
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (manufacturer, model)
);

CREATE INDEX IF NOT EXISTS idx_asset_matrix_manufacturer ON asset_matrix (lower(manufacturer));
CREATE INDEX IF NOT EXISTS idx_asset_matrix_model        ON asset_matrix (lower(model));
CREATE INDEX IF NOT EXISTS idx_asset_matrix_asset_type   ON asset_matrix (asset_type);

-- Auto-increment AM ID sequence starting after RVR-AM-00867 (seed data ceiling)
CREATE SEQUENCE IF NOT EXISTS asset_matrix_seq START 868;
