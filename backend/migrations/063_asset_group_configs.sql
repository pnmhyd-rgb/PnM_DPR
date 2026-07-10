CREATE TABLE IF NOT EXISTS asset_group_configs (
  id              SERIAL PRIMARY KEY,
  asset_group     VARCHAR(100) UNIQUE NOT NULL,

  -- Reading Configuration (ordered array of reading definitions)
  reading_configs  JSONB NOT NULL DEFAULT '[]',

  -- Fuel Configuration
  fuel_type                VARCHAR(50),
  fuel_tank_count          SMALLINT NOT NULL DEFAULT 1,
  fuel_consumption_min     DECIMAL(10,3),
  fuel_consumption_max     DECIMAL(10,3),
  fuel_economy_min         DECIMAL(10,3),
  fuel_economy_max         DECIMAL(10,3),
  fuel_formula_type        VARCHAR(20) NOT NULL DEFAULT 'L_per_Hr',

  -- Log Entry Validation Rules
  qty_mandatory_if_km       BOOLEAN NOT NULL DEFAULT false,
  qty_mandatory_if_hrs      BOOLEAN NOT NULL DEFAULT false,
  closing_reading_mandatory BOOLEAN NOT NULL DEFAULT true,
  allow_negative_reading    BOOLEAN NOT NULL DEFAULT false,

  -- Counter Log Settings
  counter_reset_allowed  BOOLEAN NOT NULL DEFAULT true,
  reset_reading_codes    JSONB NOT NULL DEFAULT '[]',

  -- DPR Settings
  shift_type              VARCHAR(30) NOT NULL DEFAULT 'Single Shift',
  fuel_entry_enabled      BOOLEAN NOT NULL DEFAULT true,
  breakdown_entry_enabled BOOLEAN NOT NULL DEFAULT true,
  work_done_mandatory     BOOLEAN NOT NULL DEFAULT false,

  -- Report Settings
  report_show_fuel_cost       BOOLEAN NOT NULL DEFAULT true,
  report_show_fuel_rate       BOOLEAN NOT NULL DEFAULT true,
  report_show_quantity        BOOLEAN NOT NULL DEFAULT true,
  report_show_reading_details BOOLEAN NOT NULL DEFAULT true,
  report_show_work_done       BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
