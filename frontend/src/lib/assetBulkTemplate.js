/* Unified bulk upload template shared between Asset Register and Admin › Machine Registry */

export const TEMPLATE_HEADERS = [
  'Sl No', 'Project Code', 'Asset Code', 'Asset Group', 'Asset Category', 'Asset Name', 'Measurability',
  'Ownership', 'Owner name', 'Manufacturer', 'Model', 'Year of Manufacturing',
  'Capacity', 'UOM', 'Reg No', 'Machine Sl no', 'Chassis No', 'Engine number',
  'Nickname',
  'Shift Type', 'Fuel Min (L/hr)', 'Fuel Max (L/hr)', 'Fuel Min (kms/ltr)', 'Fuel Max (kms/ltr)', 'Planned Hrs/Day',
]

export async function downloadAssetTemplate(projects, eqTypes) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()
  const projList = projects.map(p => p.code).join(' | ') || 'PROJECT_CODE'

  const ws = XLSX.utils.aoa_to_sheet([
    ['Asset Bulk Upload Template'],
    [`Project Codes available: ${projList}`],
    ['Ownership: Own or Hire  |  Shift: Single Shift or Dual Shift  |  Reading Basis: Hours or KM  |  Fuel Type: Diesel / Petrol / EV / N/A'],
    ['Fuel Min/Max (L/hr) for Hours-basis machines. Fuel Min/Max (kms/ltr) for KM-basis machines. Hire Charges/Day and /Month for Hire assets.'],
    [],
    TEMPLATE_HEADERS,
    [
      1, projects[0]?.code || 'PRJ001', 'RVR/EX/2024/01',
      'Earthmoving Equipment', 'Excavation Equipment', 'Excavator', 'Measurable Asset',
      'Own', 'RVR Projects pvt ltd', 'Komatsu', 'PC200', '2024',
      '20', 'Tons', 'KA01AB1234', 'E6-EX-02', 'CH12345', 'ENG12345',
      'Single Shift', 12, 14, '', '', 10,
    ],
    [
      2, projects[0]?.code || 'PRJ001', 'HIRE/BHL/01',
      'Earthmoving Equipment', 'Excavation Equipment', 'Backhoe Loader', 'Measurable Asset',
      'Hire', 'John Doe', 'JCB India Limited', 'JCB-3DX', '2022',
      '49', 'HP', 'TG01AB1234', 'E6-BHL-01', '-', '-',
      'Single Shift', 4, 5, '', '', 8,
    ],
    [
      3, projects[0]?.code || 'PRJ001', 'RVR/MCWG/2024/01',
      'Emergency & Utility Vehicles', 'Utility Vehicles', 'Motorcycle', 'Non-Measurable Asset',
      'Own', 'RVR Projects pvt ltd', 'Hero', 'HF DELUXE BS-VI', '2024',
      '2 Seater', 'Nos', 'TG09A0001', 'HA11ABC1234567', 'MBLHAW000S0A00001', '-',
      'Single Shift', '', '', 50, 60, 50,
    ],
  ])

  ws['!cols'] = [
    {wch:6},{wch:14},{wch:22},{wch:30},{wch:30},{wch:28},{wch:18},
    {wch:10},{wch:26},{wch:26},{wch:16},{wch:20},
    {wch:12},{wch:8},{wch:14},{wch:18},{wch:20},{wch:20},
    {wch:28},
    {wch:14},{wch:16},{wch:16},{wch:18},{wch:18},{wch:14},
  ]

  const headerR = 5
  TEMPLATE_HEADERS.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: headerR, c: ci })
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D0D8E8' } } }
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Asset Register')

  if (eqTypes?.length > 0) {
    const etWs = XLSX.utils.aoa_to_sheet([
      ['Asset Names Reference — use exact "Asset Name" spelling in the main sheet'],
      [],
      ['No', 'Asset Group', 'Asset Category', 'Asset Name', 'Measurability'],
      ...eqTypes.map((t, i) => [
        i + 1,
        t.asset_group    || '—',
        t.asset_cat      || '—',
        t.name,
        t.asset_category === 'Measurable' ? 'Measurable Asset' : t.asset_category === 'Non-Measurable' ? 'Non-Measurable Asset' : (t.asset_category || '—'),
      ]),
    ])
    etWs['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 32 }, { wch: 34 }, { wch: 20 }]
    ;['A3', 'B3', 'C3', 'D3', 'E3'].forEach(ref => {
      if (etWs[ref]) etWs[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D0D8E8' } } }
    })
    XLSX.utils.book_append_sheet(wb, etWs, 'Asset Names Ref')
  }

  XLSX.writeFile(wb, `Asset_BulkUpload_Template_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export async function parseAssetFile(file) {
  const XLSX = await import('xlsx')
  const data = await file.arrayBuffer()
  const wb   = XLSX.read(data)
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  let headerRow = -1
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map(c => String(c).trim().toLowerCase())
    if (lower.includes('project code') && (lower.includes('machine sl no') || lower.includes('machine sl#') || lower.includes('asset name') || lower.includes('asset code'))) {
      headerRow = i; break
    }
  }
  if (headerRow === -1)
    return { error: 'Cannot find the header row. Ensure columns "Project Code" and "Asset Name" are present.' }

  const headers = rows[headerRow].map(c => String(c).trim().toLowerCase())
  const col = k => headers.findIndex(h => h.includes(k))

  const projCol        = col('project code')
  const assetCodeCol   = col('asset code')
  // "Machine Sl no" (new format) or "Machine SL#" (old format)
  const slnoCol        = headers.findIndex(h => h.startsWith('machine sl'))
  // "Asset Name" (both formats)
  const typeCol        = headers.findIndex(h => h === 'asset name' || h === 'equipment type')
  // Measurability: accepts "Measurable Asset", "Non-Measurable Asset", "Measurable", "Non-Measurable"
  const measCol        = headers.findIndex(h => h === 'measurability' || h === 'category')
  const ownCol         = col('ownership')
  // "Owner name" (new) or "Vendor" (old) — used as vendor for Hire assets
  const ownerCol       = headers.findIndex(h => h === 'owner name' || h === 'vendor')
  const mfrCol         = col('manufacturer')
  const modelCol       = col('model')
  const yomCol         = headers.findIndex(h => h.includes('year of man') || h === 'yom' || h === 'year')
  const capCol         = col('capacity')
  const uomCol         = col('uom')
  const regCol         = col('reg no')
  const chassisCol     = col('chassis')
  const engineNoCol    = headers.findIndex(h => h === 'engine number' || h === 'engine no')
  const nicknameCol    = col('nickname')
  const shiftCol       = col('shift type')
  const fuelMinCol     = col('fuel min (l')
  const fuelMaxCol     = col('fuel max (l')
  const fuelMinKmCol   = col('fuel min (k')
  const fuelMaxKmCol   = col('fuel max (k')
  const planCol        = col('planned')
  // Legacy columns (old format only)
  const fuelTypeCol    = col('fuel type')
  const basisCol       = col('reading basis')
  const dobCol         = col('date of purchase')
  const poCol          = col('po number')
  const priceCol       = col('purchase price')
  const rateDayCol     = col('hire charges/d')
  const rateMonthlyCol = col('hire charges/m')

  if (projCol === -1 || typeCol === -1)
    return { error: 'Missing required columns: "Project Code" and "Asset Name".' }

  const txt = (v) => {
    const s = String(v ?? '').trim()
    return (s === '' || s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A' || s === '-') ? null : s
  }
  const num = (v) => {
    const s = String(v ?? '').trim()
    if (!s || s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A' || s === '-') return null
    const n = parseFloat(s)
    return isNaN(n) ? null : n
  }

  const items   = []
  const skipped = []

  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i]
    if (r.every(c => String(c ?? '').trim() === '')) continue

    const assetCodeRaw = assetCodeCol >= 0 ? String(r[assetCodeCol] ?? '').trim() : ''
    // txt() treats '-', 'NA', 'N/A', '' as null so '-' slno falls back to asset code
    const slnoRaw      = slnoCol >= 0 ? txt(r[slnoCol]) : null
    const slno         = slnoRaw || assetCodeRaw

    if (!slno) {
      const eqLabel = typeCol >= 0 ? String(r[typeCol] ?? '').trim() : ''
      skipped.push({
        row: i + 1,
        reason: `No Machine Sl no or Asset Code${eqLabel ? ` (Asset Name in row: "${eqLabel}")` : ''} — fill in column "Asset Code" or "Machine Sl no" and re-upload`,
      })
      continue
    }

    const proj = String(r[projCol] ?? '').trim()
    if (!proj) {
      skipped.push({ row: i + 1, slno, reason: 'No Project Code — row skipped' })
      continue
    }

    const eqType = String(r[typeCol] ?? '').trim()
    if (!eqType) {
      skipped.push({ row: i + 1, slno, reason: 'No Asset Name — row skipped' })
      continue
    }

    // Measurability: support both full ("Measurable Asset") and short ("Measurable") forms
    const measRaw = measCol >= 0 ? String(r[measCol] ?? '').trim() : ''
    const asset_type =
      measRaw === 'Measurable Asset'     ? 'Measurable Asset'     :
      measRaw === 'Non-Measurable Asset' ? 'Non-Measurable Asset' :
      measRaw === 'Measurable'           ? 'Measurable Asset'     :
      measRaw === 'Non-Measurable'       ? 'Non-Measurable Asset' : null

    const ownership  = String(r[ownCol] ?? 'Own').trim() || 'Own'
    const ownerName  = ownerCol >= 0 ? txt(r[ownerCol]) : null
    // vendor only stored for Hire assets
    const vendor     = ownership === 'Hire' ? ownerName : null

    const fuelMinKm  = num(fuelMinKmCol >= 0 ? r[fuelMinKmCol] : null)
    const fuelMaxKm  = num(fuelMaxKmCol >= 0 ? r[fuelMaxKmCol] : null)
    const hasKm      = fuelMinKm !== null || fuelMaxKm !== null

    // reading1_basis: if KM fuel values present → KM; else use explicit "Reading Basis" col or default Hours
    let reading1_basis = hasKm ? 'KM' : 'Hours'
    if (!hasKm && basisCol >= 0) {
      const basisRaw = String(r[basisCol] ?? '').trim()
      if (basisRaw && basisRaw.toUpperCase() !== 'NA') reading1_basis = basisRaw
    }

    items.push({
      project_code:     proj,
      asset_code:       assetCodeRaw || null,
      slno,
      eq_type:          eqType,
      asset_type,
      ownership,
      vendor,
      manufacturer:     mfrCol    >= 0 ? txt(r[mfrCol])    : null,
      model:            modelCol  >= 0 ? txt(r[modelCol])  : null,
      yom:              yomCol    >= 0 ? txt(r[yomCol])    : null,
      capacity:         capCol    >= 0 ? txt(r[capCol])    : null,
      uom:              uomCol    >= 0 ? txt(r[uomCol])    : null,
      reg_no:           regCol    >= 0 ? txt(r[regCol])    : null,
      chassis_no:       chassisCol>= 0 ? txt(r[chassisCol]): null,
      engine_no:        engineNoCol>=0 ? txt(r[engineNoCol]): null,
      nickname:         nicknameCol>=0 ? txt(r[nicknameCol]): null,
      fuel_type:        fuelTypeCol>=0 ? txt(r[fuelTypeCol]): null,
      shift_type:       String(r[shiftCol] ?? 'Single Shift').trim() || 'Single Shift',
      reading1_basis,
      fuel_min:         num(fuelMinCol    >= 0 ? r[fuelMinCol]    : null),
      fuel_max:         num(fuelMaxCol    >= 0 ? r[fuelMaxCol]    : null),
      fuel_min_km:      fuelMinKm,
      fuel_max_km:      fuelMaxKm,
      planned_hours:    num(planCol >= 0 ? r[planCol] : null) ?? 10,
      date_of_purchase: dobCol    >= 0 ? txt(r[dobCol])   : null,
      po_number:        poCol     >= 0 ? txt(r[poCol])    : null,
      price:            num(priceCol  >= 0 ? r[priceCol]  : null),
      rate:             num(rateDayCol >= 0 ? r[rateDayCol]: null),
      rate_monthly:     num(rateMonthlyCol >= 0 ? r[rateMonthlyCol] : null),
    })
  }

  if (items.length === 0) return { error: 'No asset rows found in the file.' }
  return { items, skipped }
}
