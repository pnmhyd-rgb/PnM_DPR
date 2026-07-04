-- Remove the single machine record created with slno='-' by the broken bulk-upload parser.
-- All 86 hire/BCM/BBM/Silo machines that had Machine Sl no='-' were collapsed into this one row.
-- The correct records (with asset_code as slno) were seeded in migration 046 and are intact.
DELETE FROM machines WHERE slno = '-';
