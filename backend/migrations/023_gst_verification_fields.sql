-- GST verification & enrichment fields on hire_vendors
ALTER TABLE hire_vendors
  ADD COLUMN IF NOT EXISTS legal_name        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS trade_name        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS state             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS district          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pincode           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS gst_status        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS business_type     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS gst_reg_date      DATE,
  ADD COLUMN IF NOT EXISTS gst_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gst_verified_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gst_api_response  JSONB;

-- Unique active GSTIN per vendor (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS hire_vendors_gst_unique
  ON hire_vendors (UPPER(gst_no))
  WHERE gst_no IS NOT NULL AND active = TRUE;
