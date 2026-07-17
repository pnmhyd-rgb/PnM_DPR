-- 078 - Fuel performance type in invoice rule deductions
ALTER TABLE invoice_rule_deductions
  ADD COLUMN IF NOT EXISTS fuel_performance_type    VARCHAR(20)    DEFAULT 'economy',
  ADD COLUMN IF NOT EXISTS approved_fuel_consumption NUMERIC(10,4);

-- Per-machine fuel deduction stored in calc
ALTER TABLE invoice_calc_machines
  ADD COLUMN IF NOT EXISTS fuel_deduction NUMERIC(14,2) DEFAULT 0;

-- Fuel deduction total at invoice level
ALTER TABLE invoice_calculations
  ADD COLUMN IF NOT EXISTS fuel_deduction_amount NUMERIC(14,2) DEFAULT 0;
