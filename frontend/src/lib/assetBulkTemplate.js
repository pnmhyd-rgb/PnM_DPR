/* Unified bulk upload template shared between Asset Register and Admin › Machine Registry */

export const TEMPLATE_HEADERS = [
  'Sl No', 'Project Code', 'Asset Code', 'Equipment Type', 'Category',
  'Ownership', 'Manufacturer', 'Model', 'Capacity', 'UOM',
  'Reg No', 'Machine SL#', 'Chassis No', 'Fuel Type', 'Shift Type', 'Reading Basis',
  'Fuel Min (L/hr)', 'Fuel Max (L/hr)', 'Fuel Min (kms/ltr)', 'Fuel Max (kms/ltr)', 'Planned Hrs/Day',
  'Date of Purchase (YYYY-MM-DD)', 'PO Number', 'Purchase Price (₹)', 'Vendor',
  'Hire Charges/Day (₹)', 'Hire Charges/Month (₹)',
]

export async function downloadAssetTemplate(projects, eqTypes) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()
  const projList = projects.map(p => p.code).join(', ') || 'PROJECT_CODE'

  const ws = XLSX.utils.aoa_to_sheet([
    ['Asset Bulk Upload Template'],
    [`Project Codes available: ${projList}`],
    ['Ownership: Own or Hire  |  Shift: Single Shift or Dual Shift  |  Reading Basis: Hours or KM  |  Fuel Type: Diesel / Petrol / EV / N/A'],
    ['Fuel Min/Max (L/hr) for Hours-basis machines. Fuel Min/Max (kms/ltr) for KM-basis machines. Hire Charges/Day and /Month for Hire assets.'],
    [],
    TEMPLATE_HEADERS,
    [
      1, projects[0]?.code || 'PRJ001', 'AST-001', 'Excavator', 'Measurable',
      'Own', 'Komatsu', 'PC200', '20T', 'Tons',
      'KA01AB1234', 'E6-EX-02', 'CH12345', 'Diesel', 'Single Shift', 'Hours',
      5, 8, '', '', 10, '2024-01-15', 'PO-001', 5000000, '', '', '',
    ],
    [
      2, projects[0]?.code || 'PRJ001', 'AST-002', 'Diesel Generator', 'Measurable',
      'Hire', 'Kirloskar', 'KG2-5AS', '125', 'KVA',
      '', 'E6-DG-01', '', 'Diesel', 'Single Shift', 'Hours',
      3, 6, '', '', 10, '', '', '', 'AcmeCo', 15000, 350000,
    ],
    [
      3, projects[0]?.code || 'PRJ001', 'AST-003', 'Tipper', 'Measurable',
      'Own', 'Tata', '2518', '18T', 'Tons',
      'KA02CD5678', 'E6-TP-01', '', 'Diesel', 'Single Shift', 'KM',
      '', '', 4, 5, 250, '2023-06-01', 'PO-002', 3500000, '', '', '',
    ],
  ])

  ws['!cols'] = [
    {wch:6},{wch:14},{wch:14},{wch:28},{wch:16},
    {wch:10},{wch:14},{wch:14},{wch:10},{wch:8},
    {wch:14},{wch:14},{wch:14},{wch:10},{wch:14},{wch:14},
    {wch:14},{wch:14},{wch:16},{wch:16},{wch:14},
    {wch:26},{wch:14},{wch:18},{wch:16},{wch:20},{wch:22},
  ]

  const headerR = 5
  TEMPLATE_HEADERS.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: headerR, c: ci })
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D0D8E8' } } }
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Asset Register')

  if (eqTypes?.length > 0) {
    const etWs = XLSX.utils.aoa_to_sheet([
      ['Equipment Types Reference — use exact spelling in the "Equipment Type" column'],
      [],
      ['No', 'Equipment Type Name', 'Category'],
      ...eqTypes.map((t, i) => [i + 1, t.name, t.asset_category || '—']),
    ])
    etWs['!cols'] = [{ wch: 6 }, { wch: 36 }, { wch: 18 }]
    ;['A3', 'B3', 'C3'].forEach(ref => {
      if (etWs[ref]) etWs[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D0D8E8' } } }
    })
    XLSX.utils.book_append_sheet(wb, etWs, 'Equipment Types Ref')
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
    if (lower.includes('machine sl#') || lower.includes('project code')) { headerRow = i; break }
  }
  if (headerRow === -1)
    return { error: 'Cannot find the header row. Ensure columns "Project Code" and "Machine SL#" are present.' }

  const headers = rows[headerRow].map(c => String(c).trim().toLowerCase())
  const col = k => headers.findIndex(h => h.startsWith(k))

  const projCol       = col('project code')
  const assetCodeCol  = col('asset code')
  const slnoCol       = col('machine sl')
  const typeCol       = col('equipment type')
  const catCol        = col('category')
  const ownCol        = col('ownership')
  const mfrCol        = col('manufacturer')
  const modelCol      = col('model')
  const capCol        = col('capacity')
  const uomCol        = col('uom')
  const regCol        = col('reg no')
  const chassisCol    = col('chassis')
  const fuelTypeCol   = col('fuel type')
  const shiftCol      = col('shift type')
  const basisCol      = col('reading basis')
  const fuelMinCol    = col('fuel min (l')    // matches 'fuel min (l/hr)'
  const fuelMaxCol    = col('fuel max (l')    // matches 'fuel max (l/hr)'
  const fuelMinKmCol  = col('fuel min (k')    // matches 'fuel min (kms/ltr)'
  const fuelMaxKmCol  = col('fuel max (k')    // matches 'fuel max (kms/ltr)'
  const planCol       = col('planned')
  const dobCol        = col('date of purchase')
  const poCol         = col('po number')
  const priceCol      = col('purchase price')
  const vendorCol      = col('vendor')
  const rateDayCol     = col('hire charges/d')
  const rateMonthlyCol = col('hire charges/m')

  if (projCol === -1 || slnoCol === -1 || typeCol === -1)
    return { error: 'Missing required columns: "Project Code", "Machine SL#", "Equipment Type".' }

  /* Helper: treat empty / "NA" / "N/A" strings as null */
  const txt = (v) => {
    const s = String(v ?? '').trim()
    return (s === '' || s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') ? null : s
  }
  /* Reading basis: blank or NA → 'Hours' */
  const readBasis = (v) => {
    const s = String(v ?? '').trim()
    if (!s || s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') return 'Hours'
    return s
  }

  const items   = []
  const skipped = []

  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i]

    /* skip completely blank rows */
    if (r.every(c => String(c ?? '').trim() === '')) continue

    /* Machine SL# — fall back to Asset Code if blank */
    const slnoRaw      = String(r[slnoCol]      ?? '').trim()
    const assetCodeRaw = assetCodeCol >= 0 ? String(r[assetCodeCol] ?? '').trim() : ''
    const slno         = slnoRaw || assetCodeRaw

    if (!slno) {
      skipped.push({ row: i + 1, reason: 'No Machine SL# or Asset Code — row skipped' })
      continue
    }

    const proj = String(r[projCol] ?? '').trim()
    if (!proj) {
      skipped.push({ row: i + 1, slno, reason: 'No Project Code — row skipped' })
      continue
    }

    const eqType = String(r[typeCol] ?? '').trim()
    if (!eqType) {
      skipped.push({ row: i + 1, slno, reason: 'No Equipment Type — row skipped' })
      continue
    }

    const catRaw   = catCol >= 0 ? String(r[catCol] ?? '').trim() : ''
    const asset_type =
      catRaw === 'Measurable'     ? 'Measurable Asset'     :
      catRaw === 'Non-Measurable' ? 'Non-Measurable Asset' : null

    items.push({
      project_code:     proj,
      asset_code:       assetCodeRaw || null,
      slno,
      eq_type:          eqType,
      asset_type,
      ownership:        String(r[ownCol]   ?? 'Own').trim() || 'Own',
      manufacturer:     mfrCol    >= 0 ? txt(r[mfrCol])    : null,
      model:            modelCol  >= 0 ? txt(r[modelCol])  : null,
      capacity:         capCol    >= 0 ? txt(r[capCol])    : null,
      uom:              uomCol    >= 0 ? txt(r[uomCol])    : null,
      reg_no:           regCol    >= 0 ? txt(r[regCol])    : null,
      chassis_no:       chassisCol>= 0 ? txt(r[chassisCol]): null,
      fuel_type:        fuelTypeCol>=0 ? txt(r[fuelTypeCol]): null,
      shift_type:       String(r[shiftCol] ?? 'Single Shift').trim() || 'Single Shift',
      reading1_basis:   basisCol  >= 0 ? readBasis(r[basisCol]) : 'Hours',
      fuel_min:         fuelMinCol    >= 0 ? (parseFloat(r[fuelMinCol])    || null) : null,
      fuel_max:         fuelMaxCol    >= 0 ? (parseFloat(r[fuelMaxCol])    || null) : null,
      fuel_min_km:      fuelMinKmCol  >= 0 ? (parseFloat(r[fuelMinKmCol])  || null) : null,
      fuel_max_km:      fuelMaxKmCol  >= 0 ? (parseFloat(r[fuelMaxKmCol])  || null) : null,
      planned_hours:    planCol   >= 0 ? (parseFloat(r[planCol])   || 10) : 10,
      date_of_purchase: dobCol    >= 0 ? (txt(r[dobCol]))  : null,
      po_number:        poCol     >= 0 ? (txt(r[poCol]))   : null,
      price:            priceCol  >= 0 ? (parseFloat(r[priceCol])  || null) : null,
      vendor:           vendorCol      >= 0 ? txt(r[vendorCol])      : null,
      rate:             rateDayCol     >= 0 ? (parseFloat(r[rateDayCol])     || null) : null,
      rate_monthly:     rateMonthlyCol >= 0 ? (parseFloat(r[rateMonthlyCol]) || null) : null,
    })
  }

  if (items.length === 0) return { error: 'No asset rows found in the file.' }
  return { items, skipped }
}
