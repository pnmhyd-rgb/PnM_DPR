DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='machines' AND column_name='fuel_avg_km') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='machines' AND column_name='fuel_min_km') THEN
      ALTER TABLE machines DROP COLUMN fuel_avg_km;
    ELSE
      ALTER TABLE machines RENAME COLUMN fuel_avg_km TO fuel_min_km;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='machines' AND column_name='fuel_min_km') THEN
    ALTER TABLE machines ADD COLUMN fuel_min_km DECIMAL(8,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='machines' AND column_name='fuel_max_km') THEN
    ALTER TABLE machines ADD COLUMN fuel_max_km DECIMAL(8,2);
  END IF;
END $$;
