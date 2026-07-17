ALTER TABLE machines ADD COLUMN IF NOT EXISTS fleet_status VARCHAR(20) DEFAULT NULL;
-- NULL = Deployed (normal, active use)
-- 'Surplus'  = not required / standing by
-- 'Accident' = involved in accident / damaged
-- 'Scrap'    = written off / disposed
