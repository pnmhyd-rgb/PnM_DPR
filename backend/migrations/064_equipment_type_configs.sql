CREATE TABLE IF NOT EXISTS equipment_type_configs (
  id              SERIAL PRIMARY KEY,
  eq_type_id      INTEGER NOT NULL UNIQUE REFERENCES equipment_types(id) ON DELETE CASCADE,

  -- Reading Configuration
  reading_configs      JSONB NOT NULL DEFAULT '[]',
  reset_reading_codes  JSONB NOT NULL DEFAULT '[]',

  -- Fuel Configuration
  fuel_applicable        BOOLEAN NOT NULL DEFAULT true,
  fuel_type              VARCHAR(50),
  fuel_tank_count        SMALLINT NOT NULL DEFAULT 1,
  fuel_formula_type      VARCHAR(20) NOT NULL DEFAULT 'L_per_Hr',
  fuel_consumption_min   DECIMAL(10,3),
  fuel_consumption_max   DECIMAL(10,3),
  fuel_economy_min       DECIMAL(10,3),
  fuel_economy_max       DECIMAL(10,3),

  -- Log Entry Validation Rules
  qty_mandatory_if_km        BOOLEAN NOT NULL DEFAULT false,
  qty_mandatory_if_hrs       BOOLEAN NOT NULL DEFAULT false,
  closing_reading_mandatory  BOOLEAN NOT NULL DEFAULT true,
  allow_negative_reading     BOOLEAN NOT NULL DEFAULT false,
  max_daily_reading          DECIMAL(10,3),

  -- Counter Log Settings
  counter_reset_allowed   BOOLEAN NOT NULL DEFAULT true,

  -- DPR / Shift Settings
  shift_type              VARCHAR(30) NOT NULL DEFAULT 'Single Shift',
  fuel_entry_enabled      BOOLEAN NOT NULL DEFAULT true,
  breakdown_entry_enabled BOOLEAN NOT NULL DEFAULT true,
  work_done_mandatory     BOOLEAN NOT NULL DEFAULT false,

  -- Operator Settings
  mandatory_operator      BOOLEAN NOT NULL DEFAULT false,

  -- Maintenance Configuration
  service_interval_hrs       INTEGER,
  preventive_maintenance     BOOLEAN NOT NULL DEFAULT true,
  breakdown_maintenance      BOOLEAN NOT NULL DEFAULT true,
  lubrication_interval_hrs   INTEGER,

  -- Alert Settings
  low_fuel_alert            BOOLEAN NOT NULL DEFAULT false,
  service_due_alert         BOOLEAN NOT NULL DEFAULT false,
  calibration_due_alert     BOOLEAN NOT NULL DEFAULT false,
  counter_exception_alert   BOOLEAN NOT NULL DEFAULT false,

  -- Approval Settings
  entry_approval      BOOLEAN NOT NULL DEFAULT false,
  supervisor_approval BOOLEAN NOT NULL DEFAULT false,
  lock_after_approval BOOLEAN NOT NULL DEFAULT true,

  -- Report Settings
  report_show_fuel_cost        BOOLEAN NOT NULL DEFAULT true,
  report_show_fuel_rate        BOOLEAN NOT NULL DEFAULT true,
  report_show_quantity         BOOLEAN NOT NULL DEFAULT true,
  report_show_reading_details  BOOLEAN NOT NULL DEFAULT true,
  report_show_work_done        BOOLEAN NOT NULL DEFAULT true,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
