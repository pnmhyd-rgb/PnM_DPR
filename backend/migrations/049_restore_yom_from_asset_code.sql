-- Restore yom from asset_code for own assets (format RVR/XX/YEAR/... → 3rd segment is year)
-- Hire assets (HIRE/XX/seq) have no year in their code — those need re-upload via bulk upload
UPDATE machines
SET yom = SPLIT_PART(asset_code, '/', 3)
WHERE yom IS NULL
  AND asset_code IS NOT NULL
  AND SPLIT_PART(asset_code, '/', 3) ~ '^\d{4}$'
  AND CAST(SPLIT_PART(asset_code, '/', 3) AS INTEGER) BETWEEN 1990 AND 2030;
