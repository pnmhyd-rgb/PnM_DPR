-- Clear existing machines for project AM and re-seed from Excel
DO $$
DECLARE am_id INTEGER;
BEGIN
  SELECT id INTO am_id FROM projects WHERE code = 'AM';
  IF am_id IS NOT NULL THEN
    -- Detach related records that lack ON DELETE CASCADE/SET NULL on machine_id
    UPDATE hire_wo_items   SET machine_id = NULL WHERE machine_id IN (SELECT id FROM machines WHERE project_id = am_id);
    UPDATE hire_bill_items SET machine_id = NULL WHERE machine_id IN (SELECT id FROM machines WHERE project_id = am_id);
    -- Now delete all AM machines (other FKs use ON DELETE CASCADE or SET NULL)
    DELETE FROM machines WHERE project_id = am_id;
  END IF;
END $$;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'P84096322', 'RVR/DG/2013/125/10', 'Diesel Generator', 'Mahindra and Mahindra Limited', 'C 125 D5P', '2013', '125', 'KVA', NULL, NULL, '07/1303/02677', 'Own', 'Measurable Asset', NULL, 'Hours', 10, 15, NULL, NULL, 10, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'P84105764', 'RVR/DG/2013/125/12', 'Diesel Generator', 'Mahindra and Mahindra Limited', 'C 125 D5P', '2013', '125', 'KVA', NULL, NULL, '07/1306/0507', 'Own', 'Measurable Asset', NULL, 'Hours', 10, 15, NULL, NULL, 10, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, '2409004020', 'RVR/DG/2024/58.5/1', 'Diesel Generator', 'Mahindra and Mahindra Limited', 'SP-IV-58.5', '2024', '58.5', 'KVA', NULL, NULL, 'CJG0241008760', 'Own', 'Measurable Asset', NULL, 'Hours', 5, 7, NULL, NULL, 10, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, '121059275', 'RVR/DG/2013/30/4', 'Diesel Generator', 'Cummins India Limited', 'C 30 D5P', '2013', '30', 'KVA', NULL, NULL, '07/1306/0494', 'Own', 'Measurable Asset', NULL, 'Hours', 3, 4, NULL, NULL, 10, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'NNH4AAJ0026', 'RVR/DG/2022/10/1', 'Diesel Generator', 'Cummins India Limited', '2185', '2022', '10', 'KVA', NULL, NULL, '2223RP0305', 'Own', 'Measurable Asset', NULL, 'Hours', 1, 2, NULL, NULL, 3, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'NNF4AAJ0159', 'RVR/DG/2022/10/2', 'Diesel Generator', 'Cummins India Limited', '2185', '2022', '10', 'KVA', NULL, NULL, '2223RP1312', 'Own', 'Measurable Asset', NULL, 'Hours', 1, 2, NULL, NULL, 3, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'NNF4AAJ0095', 'RVR/DG/2022/10/3', 'Diesel Generator', 'Cummins India Limited', '2185', '2022', '10', 'KVA', NULL, NULL, '2223RP1313', 'Own', 'Measurable Asset', NULL, 'Hours', 1, 2, NULL, NULL, 3, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, '38050', 'RVR/DG/2013/15/7', 'Diesel Generator', 'Cummins India Limited', 'C15D5P', '2013', '15', 'KVA', NULL, NULL, '2361', 'Own', 'Measurable Asset', NULL, 'Hours', 1.5, 3, NULL, NULL, 3, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, '180610913', 'RVR/DG/2018/15/15', 'Diesel Generator', 'Cummins India Limited', 'C15D5P', '2018', '15', 'KVA', NULL, NULL, 'CJGS18071800', 'Own', 'Measurable Asset', NULL, 'Hours', 1.5, 3, NULL, NULL, 3, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, '8985367', 'RVR/DG/2013/7.5/4', 'Diesel Generator', 'Mahindra and Mahindra Limited', 'EA10', '2013', '7.5', 'KVA', NULL, NULL, NULL, 'Own', 'Measurable Asset', NULL, 'Hours', 1, 2, NULL, NULL, 3, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, '5217900286', 'RVR/DG/2022/5/5', 'Diesel Generator', 'Mahindra and Mahindra Limited', 'DG.5M1N.R.STD', '2022', '5', 'KVA', NULL, NULL, '161353', 'Own', 'Measurable Asset', NULL, 'Hours', 0.8, 1, NULL, NULL, 3, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'DGP/22-23/447', 'RVR/DG/2022/5/4', 'Diesel Generator', 'Kirloskar Oil Engines Limited', 'DG.5M1N.R.STD', '2022', '5', 'KVA', NULL, NULL, '2919', 'Own', 'Measurable Asset', NULL, 'Hours', 0.8, 1, NULL, NULL, 3, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'ARGO4-2012-03-1437', 'RVR/SLCM/2012/02', 'Self loading concrete mixer', 'Ajax Fiori', 'Agro 4000', '2012', '4', 'CUM', 'AP31DT8976', '4H.3306/122025', NULL, 'Own', 'Measurable Asset', NULL, 'Hours', 6, 8, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'ARGO4-2011-11-1309', 'RVR/SLCM/2011/01', 'Self loading concrete mixer', 'Ajax Fiori', 'Agro 4000', '2011', '4', 'CUM', 'AP31DT8981', '4H.3306/120014', NULL, 'Own', 'Measurable Asset', NULL, 'Hours', 6, 8, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'F8BIN4616136', 'RVR/AMB/2013/3', 'Ambulance', 'Maruti Suzuki', 'Omni BS-IV', '2013', '5 Seater', 'Nos', 'TG06T6286', 'MA3EVB11S01449207', NULL, 'Own', 'Measurable Asset', NULL, 'KM', NULL, NULL, 12, 15, 20, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, '4SPCR19KVX630752', 'RVR/FT/2024/11', 'Mobile Diesel Browser', 'Tata Motors Limited', '912 LPT', '2024', '5000', 'ltrs', 'TG06T2528', 'MAT786051R8K17904', NULL, 'Own', 'Measurable Asset', NULL, 'KM', NULL, NULL, 5, 7, 40, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, '61000006', 'RVR/MTC/2010/1', 'Mobile tower crane', 'Action Construction Equipment', 'MTC - 2418', '2010', '1.6 Tons and 24 Meters', 'Tons/Mtrs', NULL, NULL, NULL, 'Own', 'Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, '15103', 'RVR/MTC/2010/3', 'Mobile tower crane', 'Action Construction Equipment', 'MTC - 3625', '2010', '2.5 Tons and 36 Meters', 'Tons/Mtrs', NULL, NULL, NULL, 'Own', 'Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'S433B36221', 'RVR/MTC/2022/7', 'Mobile tower crane', 'Action Construction Equipment', 'MTC - 2418', '2022', '1.6 Tons and 24 Meters', 'Tons/Mtrs', 'MH40CQ1868', 'ACEMTC24LN1163940', NULL, 'Own', 'Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'T4191877', 'RVR/TC/2019/4', 'Tower crane', 'Action Construction Equipment', 'TC 5540', '2019', '5', 'Tons', NULL, NULL, NULL, 'Own', 'Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 10, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'T4222371', 'RVR/TC/2022/5', 'Tower crane', 'Action Construction Equipment', 'TC 5540', '2022', '5', 'Tons', NULL, NULL, NULL, 'Own', 'Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 10, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, '2330/8019116.00', 'RVR/BP/2011/7', 'Concrete Batching plant', 'Schwing Stetter India', 'CP 30', '2011', '30', 'cum', NULL, NULL, NULL, 'Own', 'Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 8, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, '202502100010', 'RVR/WBR/2025/7', 'Walk Behind Vibratory Roller', 'Husqvarna Construction', 'LP 6500 I', '2025', '681', 'kgs', NULL, NULL, NULL, 'Own', 'Measurable Asset', NULL, 'Hours', 0.8, 1.5, NULL, NULL, 3, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11ECR9M26217', 'RVR/MCWG/2025/328', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09F6702', 'MBLHAW142S9A50064', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11ECS5C19747', 'RVR/MCWG/2025/329', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09F6703', 'MBLHAW386S5C84800', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11ECS5C19806', 'RVR/MCWG/2025/327', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09F6704', 'MBLHAW386S5C84859', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11F4SHK14166', 'RVR/MCWG/2025/429', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09J9457', 'MBLHAW430SHK18161', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11F4SHK14154', 'RVR/MCWG/2025/430', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09J9458', 'MBLHAW435SHK18155', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11F4SHK14086', 'RVR/MCWG/2025/431', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09J9460', 'MBLHAW431SHK18153', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11F4SHH04726', 'RVR/MCWG/2025/449', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09K1759', 'MBLHAW434SHH30475', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11F4SHJ00508', 'RVR/MCWG/2025/450', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09K1760', 'MBLHAW430SHJ02488', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11F4SHJ11550', 'RVR/MCWG/2025/451', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09K1757', 'MBLHAW436SHJ12880', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11F4SHH04255', 'RVR/MCWG/2025/452', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09K1761', 'MBLHAW437SHH05070', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11F4SHJ09170', 'RVR/MCWG/2025/453', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09K1758', 'MBLHAW433SHJ10262', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11ECR9M08553', 'RVR/MCWG/2025/367', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09G5398', 'MBLHAW140S9A50208', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11ECS9A00076', 'RVR/MCWG/2025/366', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09G5399', 'MBLHAW141S9A50122', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11ECR9G06551', 'RVR/MCWG/2024/219', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2024', '2 Seater', 'Nos', 'TG09B7784', 'MBLHAW103R9G52060', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11ECR9G04189', 'RVR/MCWG/2024/218', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2024', '2 Seater', 'Nos', 'TG09B7787', 'MBLHAW108R9G51020', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11ECR9G04619', 'RVR/MCWG/2024/220', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2024', '2 Seater', 'Nos', 'TG09B7790', 'MBLHAW100R9G50959', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11ECR5H55317', 'RVR/MCWG/2024/221', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2024', '2 Seater', 'Nos', 'TG09B7791', 'MBLHAW376R5H00409', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11ECR9G06509', 'RVR/MCWG/2024/216', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2024', '2 Seater', 'Nos', 'TG09B7792', 'MBLHAW109R9G52175', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11ECR9G05406', 'RVR/MCWG/2024/217', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2024', '2 Seater', 'Nos', 'TG09B7793', 'MBLHAW10XR9G51360', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11EBS9A00423', 'RVR/MCWG/2025/249', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09E3804', 'MBLHAC049S9A50675', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11EBR9B00264', 'RVR/MCWG/2024/250', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2024', '2 Seater', 'Nos', 'TG09E3805', 'MBLHAC040R9B32546', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HA11EBS9A00167', 'RVR/MCWG/2025/251', 'Motorcycle', 'Hero', 'HF DELUXE BS-VI', '2025', '2 Seater', 'Nos', 'TG09E3806', 'MBLHAC040S9A50645', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'PFXWLH37083', 'RVR/MCWG/2020/106', 'Motorcycle', 'Bajaj Auto', 'Bajaj Platina', '2020', '2 Seater', 'Nos', 'CG12BD2107', 'MD2A76AX6LWH05611', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'PFYRJL68506', 'RVR/MCWG/2018/86', 'Motorcycle', 'Bajaj Auto', 'Bajaj Platina', '2018', '2 Seater', 'Nos', 'AP07DW4023', 'MD2A76AY5JRL98949', NULL, 'Own', 'Non-Measurable Asset', NULL, 'KM', NULL, NULL, 50, 60, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HT18WB60T52964', 'RVR/WB/2018/12', 'Weight Bridge', 'Tulaman', '60 MT', '2018', '60', 'MT', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BCM/2022/34', 'RVR/BCM/2022/34', 'Bar Cutting Machine', 'Spantech Engineering', 'SB 42', '2022', 'Bar Dia. 32 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BCM/2024/42', 'RVR/BCM/2024/42', 'Bar Cutting Machine', 'Spartan Engineering', 'SCM 42', '2024', 'Bar Dia. 36 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BCM/2024/44', 'RVR/BCM/2024/44', 'Bar Cutting Machine', 'Universal Construction', 'UCM42', '2024', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BCM/2016/18', 'RVR/BCM/2016/18', 'Bar Cutting Machine', 'Spantech Engineering', 'SB 42', '2016', 'Bar Dia. 32 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BCM/2018/25', 'RVR/BCM/2018/25', 'Bar Cutting Machine', 'Spantech Engineering', 'SB 42', '2018', 'Bar Dia. 32 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BCM/2022/35', 'RVR/BCM/2022/35', 'Bar Cutting Machine', 'Spantech Engineering', 'SB 42', '2022', 'Bar Dia. 32 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BCM/2024/45', 'RVR/BCM/2024/45', 'Bar Cutting Machine', 'Universal Construction', 'UCM42', '2024', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BCM/2024/43', 'RVR/BCM/2024/43', 'Bar Cutting Machine', 'Acme Concrete Mixers', 'BCM 40', '2024', 'Bar Dia. 40 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BCM/2016/14', 'RVR/BCM/2016/14', 'Bar Cutting Machine', 'Universal Construction', 'UCM42', '2016', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BBM/2022/42', 'RVR/BBM/2022/42', 'Bar Bending Machine', 'Spantech Engineering', 'SB 42', '2022', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BBM/2022/40', 'RVR/BBM/2022/40', 'Bar Bending Machine', 'Spantech Engineering', 'SB 42', '2022', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BBM/2022/44', 'RVR/BBM/2022/44', 'Bar Bending Machine', 'Spantech Engineering', 'SB 42', '2022', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BBM/2017/14', 'RVR/BBM/2017/14', 'Bar Bending Machine', 'Universal Construction', 'UBM42', '2017', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BBM/2017/26', 'RVR/BBM/2017/26', 'Bar Bending Machine', 'Universal Construction', 'UBM42', '2017', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BBM/2016/12', 'RVR/BBM/2016/12', 'Bar Bending Machine', 'Universal Construction', 'UBM42', '2016', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BBM/2023/51', 'RVR/BBM/2023/51', 'Bar Bending Machine', 'Universal Construction', 'UBM42', '2023', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BBM/2023/52', 'RVR/BBM/2023/52', 'Bar Bending Machine', 'Universal Construction', 'UBM42', '2023', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/BBM/2024/60', 'RVR/BBM/2024/60', 'Bar Bending Machine', 'Spartan Engineering', 'SBM 42V', '2024', 'Bar Dia. 42 MM', 'MM', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/SILO/2014/8', 'RVR/SILO/2014/8', 'Storage Silo', 'Schwing Stetter India', 'Silo', '2014', '100', 'Tons', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 10, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'RVR/SILO/2014/9', 'RVR/SILO/2014/9', 'Storage Silo', 'Schwing Stetter India', 'Silo', '2014', '100', 'Tons', NULL, NULL, NULL, 'Own', 'Non-Measurable Asset', NULL, 'Hours', NULL, NULL, NULL, NULL, 10, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/BHL/08', 'HIRE/BHL/08', 'Backhoe Loader', 'JCB India Limited', 'JCB-3DX', '2018', '49', 'HP', 'AP31EJ2659', NULL, NULL, 'Hire', 'Measurable Asset', 'Potnuru Satish', 'Hours', 4, 5, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/BHL/51', 'HIRE/BHL/51', 'Backhoe Loader', 'JCB India Limited', 'JCB-3DX', '2016', '49', 'HP', 'TS07EZ7109', NULL, NULL, 'Hire', 'Measurable Asset', 'D. Praveen', 'Hours', 4, 5, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/BHL/58', 'HIRE/BHL/58', 'Backhoe Loader', 'JCB India Limited', 'JCB-3DX', '2018', '49', 'HP', 'TS345376', NULL, NULL, 'Hire', 'Measurable Asset', 'Saritha Bhai Rathode', 'Hours', 4, 5, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/BHL/82', 'HIRE/BHL/82', 'Backhoe Loader', 'JCB India Limited', 'JCB-3DX', '2018', '49', 'HP', 'TG347302', NULL, NULL, 'Hire', 'Measurable Asset', 'Mudavath sai teja', 'Hours', 4, 5, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/BHL/80', 'HIRE/BHL/80', 'Backhoe Loader', 'JCB India Limited', 'JCB-3DX', '2017', '49', 'HP', 'TS223956', NULL, NULL, 'Hire', 'Measurable Asset', 'Nagaram Srikanth', 'Hours', 4, 5, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/BHL/83', 'HIRE/BHL/83', 'Backhoe Loader', 'JCB India Limited', 'JCB-3DX', '2025', '49', 'HP', 'TG07WTR2210', NULL, NULL, 'Hire', 'Measurable Asset', 'Vadde pandaiah', 'Hours', 4, 5, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/EX/118', 'HIRE/EX/118', 'Excavator', 'Tata hitachi', '210', '2019', '132', 'HP', 'SP21-45095', NULL, NULL, 'Hire', 'Measurable Asset', 'SMS Developers & Contractors', 'Hours', 12, 14, NULL, NULL, 9, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/EX/165', 'HIRE/EX/165', 'Excavator', 'Hyundai', '210', '2017', '132', 'HP', 'N633D00901', NULL, NULL, 'Hire', 'Measurable Asset', 'SMS Developers & Contractors', 'Hours', 12, 14, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/EX/08', 'HIRE/EX/08', 'Excavator', 'Tata hitachi', '210', '2022', '132', 'HP', 'SP21-47799', NULL, NULL, 'Hire', 'Measurable Asset', 'Asta Lakshmi Prasanna Engineering Works', 'Hours', 12, 14, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/EX/256', 'HIRE/EX/256', 'Excavator', 'Hyundai', '210', '2025', '140', 'HP', '68452', NULL, NULL, 'Hire', 'Measurable Asset', 'Nageswar goud', 'Hours', 12, 14, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/EX/257', 'HIRE/EX/257', 'Excavator', 'Sany', '210', '2024', '140', 'HP', '0593D8', NULL, NULL, 'Hire', 'Measurable Asset', 'G&S Projects', 'Hours', 12, 14, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/EX/141', 'HIRE/EX/141', 'Excavator', 'JCB', '205', '2024', '140', 'HP', NULL, NULL, NULL, 'Hire', 'Measurable Asset', 'Kalyani Enterprises', 'Hours', 12, 14, NULL, NULL, 9, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/EX/167', 'HIRE/EX/167', 'Excavator', 'Tata hitachi', '210', '2019', '132', 'HP', 'SP21-45557', NULL, NULL, 'Hire', 'Measurable Asset', 'Vijay Bhaskar Reddy Thippana', 'Hours', 12, 14, NULL, NULL, 9, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/EX/180', 'HIRE/EX/180', 'Excavator', 'Tata hitachi', '210', '2023', '132', 'HP', 'SP21-47979', NULL, NULL, 'Hire', 'Measurable Asset', 'Orsu Janaiah', 'Hours', 12, 14, NULL, NULL, 9, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/PCC/03', 'HIRE/PCC/03', 'Mobile Cranes', 'ACE', '14XW', '2022', '14', 'TON', 'TS15FL4044', NULL, NULL, 'Hire', 'Measurable Asset', 'Someswara Enterprises & Service', 'Hours', 2.5, 4, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/PCC/23', 'HIRE/PCC/23', 'Mobile Cranes', 'ACE', '14XW', '2022', '14', 'TON', 'TS15FL1343', NULL, NULL, 'Hire', 'Measurable Asset', 'Someswara Enterprises & Service', 'Hours', 2.5, 4, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/PCC/85', 'HIRE/PCC/85', 'Mobile Cranes', 'Escorts', '14XW', '2022', '14', 'TON', 'TS15FQ3303', NULL, NULL, 'Hire', 'Measurable Asset', 'Someswara Enterprises & Service', 'Hours', 2.5, 4, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/PCC/86', 'HIRE/PCC/86', 'Mobile Cranes', 'ACE', '14XW', '2022', '14', 'TON', 'TS15FQ3009', NULL, NULL, 'Hire', 'Measurable Asset', 'Someswara Enterprises & Service', 'Hours', 2.5, 4, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/PCC/12', 'HIRE/PCC/12', 'Mobile Cranes', 'ACE', '14XW', '2016', '14', 'TON', 'AP05DQ2547', NULL, NULL, 'Hire', 'Measurable Asset', 'Sabbireddy Ashok', 'Hours', 2.5, 4, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/PCC/99', 'HIRE/PCC/99', 'Mobile Cranes', 'ACE', '14XW', '2023', '14', 'TON', 'TS31K2667', NULL, NULL, 'Hire', 'Measurable Asset', 'Sri Laxmi Prasanna Construction & Engineering', 'Hours', 2.5, 4, NULL, NULL, 8, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/SC/32', 'HIRE/SC/32', 'Compaction Equipment', 'Ingersoll Rand,', 'SD110D', '2008', '140', 'HP', 'AP05BG6739', NULL, NULL, 'Hire', 'Measurable Asset', 'Mohammad Sadeeq Hussain', 'Hours', 8, 10, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/MG/06', 'HIRE/MG/06', 'Road Finishing Equipment', 'CAT', '120H', '2012', '125', 'HP', 'NL06DA0223', NULL, NULL, 'Hire', 'Measurable Asset', 'SLV Constructions', 'Hours', 10, 12, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TM/13', 'HIRE/TM/13', 'RMC Equipment', 'Ashok leyland', '2518', '2024', '7', 'CUM', 'AP39TX1607', NULL, NULL, 'Hire', 'Measurable Asset', 'RAJGRUHA RMC TRANSPORT', 'Hours', 2, 3, NULL, NULL, 8, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TM/14', 'HIRE/TM/14', 'RMC Equipment', 'Ashok leyland', '2518', '2024', '7', 'CUM', 'AP39UV6468', NULL, NULL, 'Hire', 'Measurable Asset', 'RK TRANSPORT', 'Hours', 2, 3, NULL, NULL, 8, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TM/23', 'HIRE/TM/23', 'RMC Equipment', 'Ashok leyland', '2820', '2022', '7', 'CUM', 'TSO7UK6237', NULL, NULL, 'Hire', 'Measurable Asset', 'ARNAV ENTERPRISES', 'Hours', 2, 3, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TM/24', 'HIRE/TM/24', 'RMC Equipment', 'Tata', '2518C', '2022', '7', 'CUM', 'TSO7UF3090', NULL, NULL, 'Hire', 'Measurable Asset', 'ARNAV ENTERPRISES', 'Hours', 2, 3, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TM/38', 'HIRE/TM/38', 'RMC Equipment', 'Ashok leyland', '2820', '2024', '7', 'CUM', 'TG08V0291', NULL, NULL, 'Hire', 'Measurable Asset', 'GK CONCRETE SOLUTIONS', 'Hours', 2, 3, NULL, NULL, 8, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TM/44', 'HIRE/TM/44', 'RMC Equipment', 'Ashok leyland', '2518', '2025', '7', 'CUM', 'TS07UP0259', NULL, NULL, 'Hire', 'Measurable Asset', 'GK STAR ASSOCIATES', 'Hours', 2, 3, NULL, NULL, 8, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TM/45', 'HIRE/TM/45', 'RMC Equipment', 'Ashok leyland', '2523', '2025', '7', 'CUM', 'TS07UP0261', NULL, NULL, 'Hire', 'Measurable Asset', 'GK STAR ASSOCIATES', 'Hours', 2, 3, NULL, NULL, 8, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/CBP/05', 'HIRE/CBP/05', 'Concrete Placement Equipment', 'Putzmeister', 'M36-4', '2021', '36', 'Mtrs', 'TS07HW6414', NULL, NULL, 'Hire', 'Measurable Asset', 'Star Infra', 'Hours', 10, 12, NULL, NULL, 8, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TP/11', 'HIRE/TP/11', 'Material Transport Vehicles', 'Ashok leyland', 'U2518T', '2018', '225', 'HP', 'AP39TA0489', NULL, NULL, 'Hire', 'Measurable Asset', 'Ramulu Rupani', 'Hours', 1.5, 2.5, NULL, NULL, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TP/12', 'HIRE/TP/12', 'Material Transport Vehicles', 'Ashok leyland', 'U2518T', '2018', '225', 'HP', 'AP39TA0669', NULL, NULL, 'Hire', 'Measurable Asset', 'Ramulu Rupani', 'Hours', 1.5, 2.5, NULL, NULL, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TP/165', 'HIRE/TP/165', 'Material Transport Vehicles', 'Ashok leyland', 'U2518T', '2016', '225', 'HP', 'TS12UD8185', NULL, NULL, 'Hire', 'Measurable Asset', 'Cherlagudem Rajendar Reddy', 'Hours', 1.5, 2.5, NULL, NULL, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TP/223', 'HIRE/TP/223', 'Material Transport Vehicles', 'Ashok leyland', 'U2518T', '2020', '225', 'HP', 'MH48AG8780', NULL, NULL, 'Hire', 'Measurable Asset', 'G&S Projects', 'Hours', 1.5, 2.5, NULL, NULL, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TP/224', 'HIRE/TP/224', 'Material Transport Vehicles', 'Ashok leyland', 'U2518T', '2020', '225', 'HP', 'MH48AG7610', NULL, NULL, 'Hire', 'Measurable Asset', 'G&S Projects', 'Hours', 1.5, 2.5, NULL, NULL, 50, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/WT/02', 'HIRE/WT/02', 'Water Equipment', 'Ashok leyland', 'Ecomet 1412', '2019', '12', 'KL', 'TS12UC8232', NULL, NULL, 'Hire', 'Measurable Asset', 'Arnav Enterprises', 'Hours', 2, 3, NULL, NULL, 20, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/WT/31', 'HIRE/WT/31', 'Water Equipment', 'Ashok leyland', 'Ecomet 1412', '2019', '12', 'KL', 'TS08UL9992', NULL, NULL, 'Hire', 'Measurable Asset', 'Arnav Enterprises', 'Hours', 2, 3, NULL, NULL, 30, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/WT/40', 'HIRE/WT/40', 'Water Equipment', 'Ashok leyland', '1612', '2018', '12', 'KL', 'TS12UA5494', NULL, NULL, 'Hire', 'Measurable Asset', 'Hafeez', 'Hours', 2, 3, NULL, NULL, 20, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/WT/59', 'HIRE/WT/59', 'Water Equipment', 'Ashok leyland', '1612', '2018', '12', 'KL', 'TS12UB8976', NULL, NULL, 'Hire', 'Measurable Asset', 'Hafeez', 'Hours', 2, 3, NULL, NULL, 30, 'Dual Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/60', 'HIRE/TT/60', 'Trailer Equipment', 'Sonalika/ DI 42 RX', 'DI 42', '2018', NULL, NULL, 'TG34T4836', NULL, NULL, 'Hire', 'Measurable Asset', 'Vislavath Vinod Kumar', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/61', 'HIRE/TT/61', 'Trailer Equipment', 'New Holland', '250', '2024', NULL, NULL, 'TS34A6077', NULL, NULL, 'Hire', 'Measurable Asset', 'Vislavath Srikanth', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/62', 'HIRE/TT/62', 'Trailer Equipment', 'Mahindra 585 DI', '585di', '2024', NULL, NULL, 'TG 34 T7318', NULL, NULL, 'Hire', 'Measurable Asset', 'Vislavath Srikanth', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/63', 'HIRE/TT/63', 'Trailer Equipment', 'Mahindra Novo 605', '605', '2018', NULL, NULL, 'TG34T6382', NULL, NULL, 'Hire', 'Measurable Asset', 'Nenavath Naresh/ vindoh kumar', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/64', 'HIRE/TT/64', 'Trailer Equipment', 'John Deere', NULL, '2025', NULL, NULL, 'TS34A2848', NULL, NULL, 'Hire', 'Measurable Asset', 'Kethavath Shanker', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/65', 'HIRE/TT/65', 'Trailer Equipment', 'John Deere', NULL, '2025', NULL, NULL, 'TG08NTR5840', NULL, NULL, 'Hire', 'Measurable Asset', 'Vislavath Lokya Nayak', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/66', 'HIRE/TT/66', 'Trailer Equipment', 'MAHINDRA/ULTRA 605 DI', '605', '2022', NULL, NULL, 'TG34TR3144', NULL, NULL, 'Hire', 'Measurable Asset', 'Shak Nazeema Begum', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/67', 'HIRE/TT/67', 'Trailer Equipment', 'John Deere', NULL, '2022', NULL, NULL, 'AP28DP2414', NULL, NULL, 'Hire', 'Measurable Asset', 'Madaram Anji', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/68', 'HIRE/TT/68', 'Trailer Equipment', 'MAHINDRA/ULTRA 605 DI', '605', '2021', NULL, NULL, 'AP23X7601', NULL, NULL, 'Hire', 'Measurable Asset', 'Kosgi Mallesh', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/69', 'HIRE/TT/69', 'Trailer Equipment', 'MAHINDRA/ULTRA 605 DI', '605', '2023', NULL, NULL, 'TS34H3921', NULL, NULL, 'Hire', 'Measurable Asset', 'Male Nagesh', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/70', 'HIRE/TT/70', 'Trailer Equipment', 'Mahindra', '575', '2021', NULL, NULL, 'AP28DU3886', NULL, NULL, 'Hire', 'Measurable Asset', 'Kummari sujatha', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/71', 'HIRE/TT/71', 'Trailer Equipment', 'Mahindra', '575', '2023', NULL, NULL, 'TG34TB4154', NULL, NULL, 'Hire', 'Measurable Asset', 'Kethavath Shanker', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/72', 'HIRE/TT/72', 'Tanker Equipment', 'Mahindra 475DI', '475', '2024', NULL, NULL, 'TS17B1977', NULL, NULL, 'Hire', 'Measurable Asset', 'Vadtya Ravi', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/73', 'HIRE/TT/73', 'Tanker Equipment', 'John Deere', NULL, '2021', NULL, NULL, 'TS34TB0926', NULL, NULL, 'Hire', 'Measurable Asset', 'B. Naveen Kumar', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/74', 'HIRE/TT/74', 'Tanker Equipment', 'Kubota', NULL, '2023', NULL, NULL, 'TS15FB5611', NULL, NULL, 'Hire', 'Measurable Asset', 'Ganganola Ganesh', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TT/75', 'HIRE/TT/75', 'Tanker Equipment', 'Swaraj', NULL, '2022', NULL, NULL, 'TS34G8926', NULL, NULL, 'Hire', 'Measurable Asset', 'Ram charan', 'Hours', 2, 3, NULL, NULL, 5, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/FW/76', 'HIRE/FW/76', 'Utility Vehicles', 'Mahindra/BOLERO NEO', 'BS6', '2025', NULL, NULL, 'TG09AE3036', NULL, NULL, 'Hire', 'Measurable Asset', 'Baswa Srinivas Goud', 'Hours', 10, 12, NULL, NULL, 80, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/FW/77', 'HIRE/FW/77', 'Utility Vehicles', 'Mahindra/BOLERO B6', 'BS6', '2025', NULL, NULL, 'RJ43UA2473', NULL, NULL, 'Hire', 'Measurable Asset', 'Mahipal', 'Hours', 10, 12, NULL, NULL, 80, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/FW/78', 'HIRE/FW/78', 'Utility Vehicles', 'Mahindra/BOLERO B6', 'BS6', '2024', NULL, NULL, 'AP40EM5511', NULL, NULL, 'Hire', 'Measurable Asset', 'Asta Lakshmi Prasanna Engineering Works', 'Hours', 10, 12, NULL, NULL, 80, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/FW/79', 'HIRE/FW/79', 'Utility Vehicles', 'Mahindra/BOLERO NEO', 'BS6', '2022', NULL, NULL, 'TG07AL8604', NULL, NULL, 'Hire', 'Measurable Asset', 'Kurapati Rangaraju', 'Hours', 10, 12, NULL, NULL, 80, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/FW/80', 'HIRE/FW/80', 'Utility Vehicles', 'Chevrolet', 'BS4', '2018', NULL, NULL, 'AP10AG0549', NULL, NULL, 'Hire', 'Measurable Asset', 'Mohammad Mustaq hussain', 'Hours', 10, 12, NULL, NULL, 80, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/FW/81', 'HIRE/FW/81', 'Utility Vehicles', 'Chevrolet', 'BS4', '2019', NULL, NULL, 'AP22L6086', NULL, NULL, 'Hire', 'Measurable Asset', 'Kalva Chandra Sekhar', 'Hours', 10, 12, NULL, NULL, 80, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/FW/82', 'HIRE/FW/82', 'Utility Vehicles', 'Force', 'BS4', '2021', NULL, NULL, 'AP22Y8689', NULL, NULL, 'Hire', 'Measurable Asset', 'Udandaraopally Yadaiah', 'Hours', 10, 12, NULL, NULL, 80, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/PP/83', 'HIRE/PP/83', 'Utility Vehicles', 'Mahindra', 'BS6', '2023', NULL, NULL, 'TS34TB2339', NULL, NULL, 'Hire', 'Measurable Asset', 'BuddenkaHaritha', 'Hours', 10, 12, NULL, NULL, 80, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TTL/82', 'HIRE/TTL/82', 'Lighting Equipment', 'Kirloskar', NULL, '2018', '5', 'KVA', '111', NULL, NULL, 'Hire', 'Measurable Asset', 'Modern hiring services', 'Hours', 2, 3, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/TTL/82', 'HIRE/TTL/82', 'Lighting Equipment', 'Kirloskar', NULL, '2016', '5', 'KVA', '22', NULL, NULL, 'Hire', 'Measurable Asset', 'Modern hiring services', 'Hours', 2, 3, NULL, NULL, 6, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/DG/11', 'HIRE/DG/11', 'Diesel Generator', 'Kirloskar', NULL, '2016', '250', 'KVA', '33', NULL, NULL, 'Hire', 'Measurable Asset', 'Modern hiring services', 'Hours', 15, 20, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

INSERT INTO machines (project_id, slno, asset_code, eq_type, manufacturer, model, yom, capacity, uom, reg_no, chassis_no, engine_no, ownership, asset_type, vendor, reading1_basis, fuel_min, fuel_max, fuel_min_km, fuel_max_km, planned_hours, shift_type, active)
  SELECT id, 'HIRE/DG/22', 'HIRE/DG/22', 'Diesel Generator', 'Kirloskar', NULL, '2019', '250', 'KVA', '44', NULL, NULL, 'Hire', 'Measurable Asset', 'Voltstar engineering', 'Hours', 15, 20, NULL, NULL, 8, 'Single Shift', true
  FROM projects WHERE code = 'AM'
  ON CONFLICT (project_id, slno) DO NOTHING;

