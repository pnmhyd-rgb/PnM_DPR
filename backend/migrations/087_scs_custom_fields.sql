-- 087 - Add direct-create fields to equipment_type_scs
-- Allows creating custom SCS entries without linking to an existing check_sheet

ALTER TABLE equipment_type_scs
  ADD COLUMN IF NOT EXISTS section         VARCHAR(150),
  ADD COLUMN IF NOT EXISTS sub_section     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS description     TEXT,
  ADD COLUMN IF NOT EXISTS extra_parameter BOOLEAN NOT NULL DEFAULT false;
