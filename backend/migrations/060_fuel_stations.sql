CREATE TABLE IF NOT EXISTS fuel_stations (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  station_type VARCHAR(20)  NOT NULL DEFAULT 'Internal',
  linked_sites TEXT[]       NOT NULL DEFAULT '{}',
  fuel_types   TEXT[]       NOT NULL DEFAULT '{}',
  active       BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
