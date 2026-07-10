const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${d.padStart(2,'0')}-${MONTHS[parseInt(m,10)-1]}-${y}`
}

function dateRange(from, to) {
  const dates = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to   + 'T00:00:00')
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export async function downloadDprTemplate(machine, from, to) {
  const XLSX  = await import('xlsx')
  const isDual = machine.shift_type === 'Dual Shift'
  const unit   = machine.reading1_basis || 'Hrs'
  const name   = machine.nickname || machine.slno
  const code   = machine.asset_code || machine.slno
  const dates  = dateRange(from, to)

  // Headers mirror the DPR download columns: readings → diesel → breakdown → work done → qty → remarks
  const headers = isDual
    ? ['Date',
       `Day Opening (${unit})`, `Day Closing (${unit})`, 'Day Running Hrs',
       `Night Closing (${unit})`, 'Night Running Hrs',
       'Diesel Day (Ltrs)', 'Diesel Night (Ltrs)',
       'Day Breakdown (Hrs)', 'Night Breakdown (Hrs)',
       'Work Done', 'Qty', 'Remarks']
    : ['Date',
       `Opening (${unit})`, `Closing (${unit})`, `Running Hrs (${unit})`,
       'Diesel (Ltrs)', 'Breakdown (Hrs)', 'Work Done', 'Qty', 'Remarks']

  const noteRow = isDual
    ? ['Night Opening = Day Closing (auto). Breakdown in decimal hrs (e.g. 1.5 = 1h 30m). Work Done & Qty are optional.']
    : ['Mandatory: Date, Opening, Closing. Breakdown in decimal hrs (e.g. 1.5 = 1h 30m). Work Done & Qty are optional.']

  const aoa = [
    [`DPR Bulk Upload Template — ${name} (${code})`],
    [`Period: ${fmtDate(from)} to ${fmtDate(to)}  |  Shift Type: ${machine.shift_type || 'Single Shift'}`],
    ['NOTE: Do not modify the Date column or column headers. Enter numeric values in reading/diesel/breakdown/qty fields.'],
    noteRow,
    [],
    headers,
    ...dates.map(d => [fmtDate(d), ...Array(headers.length - 1).fill('')]),
  ]

  const ws  = XLSX.utils.aoa_to_sheet(aoa)
  const wb  = XLSX.utils.book_new()
  const HDR = 5 // 0-indexed row of headers

  // Green header fill
  headers.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: HDR, c: ci })
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'C6EFCE' } } }
  })
  const titleRef = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws[titleRef]) ws[titleRef].s = { font: { bold: true, sz: 13 } }

  ws['!cols'] = isDual
    ? [14,16,16,13,16,13,14,14,14,14,30,10,30].map(w => ({ wch: w }))
    : [14,16,16,14,13,13,30,10,30].map(w => ({ wch: w }))

  XLSX.utils.book_append_sheet(wb, ws, 'DPR Data')
  XLSX.writeFile(wb, `DPR_Template_${code}_${from}_to_${to}.xlsx`)
}

// ── Parse uploaded file ───────────────────────────────────────────────────────

function parseNum(v) {
  if (v === '' || v == null) return null
  const n = parseFloat(String(v).replace(/,/g, '').trim())
  return isNaN(n) ? NaN : n
}

function parseIso(v) {
  if (!v) return null
  const s = String(v).trim()
  // DD-Mon-YYYY
  const m1 = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (m1) {
    const mo = MONTHS.findIndex(x => x.toLowerCase() === m1[2].toLowerCase())
    if (mo >= 0) return `${m1[3]}-${String(mo+1).padStart(2,'0')}-${String(parseInt(m1[1],10)).padStart(2,'0')}`
  }
  // DD/MM/YYYY
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m2) return `${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Numeric Excel serial
  if (/^\d+(\.\d+)?$/.test(s)) {
    const d = new Date(Math.round((parseFloat(s) - 25569) * 86400000))
    if (!isNaN(d)) return d.toISOString().slice(0, 10)
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

export async function parseDprFile(file, machine) {
  const XLSX = await import('xlsx')
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(buf)
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })

  // Find header row: first column = 'date', has opening or closing column
  let hi = -1
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const lower = rows[i].map(c => String(c).trim().toLowerCase())
    if (lower[0] === 'date' && lower.some(h => h.includes('opening') || h.includes('closing'))) {
      hi = i; break
    }
  }
  if (hi === -1) return { error: 'Cannot find header row. First column must be "Date" with Opening/Closing columns present.' }

  const headers = rows[hi].map(c => String(c).trim().toLowerCase())
  const col = k => headers.findIndex(h => h.includes(k))

  const isDual = machine.shift_type === 'Dual Shift'

  const dateCol     = 0
  const openCol     = isDual ? headers.findIndex(h => h.includes('day') && h.includes('opening'))    : col('opening')
  const closeCol    = isDual ? headers.findIndex(h => h.includes('day') && h.includes('closing'))    : col('closing')
  const nCloseCol   = isDual ? headers.findIndex(h => h.includes('night') && h.includes('closing'))  : -1
  const hsdCol      = isDual ? headers.findIndex(h => h.includes('diesel') && h.includes('day'))     : col('diesel')
  const hsdNCol     = isDual ? headers.findIndex(h => h.includes('diesel') && h.includes('night'))   : -1
  const brkCol      = isDual ? headers.findIndex(h => h.includes('breakdown') && h.includes('day'))  : col('breakdown')
  const brkNCol     = isDual ? headers.findIndex(h => h.includes('breakdown') && h.includes('night')): -1
  const workDoneCol = col('work done') !== -1 ? col('work done') : col('work')
  const qtyCol      = col('qty')
  const remCol      = col('remark')

  if (openCol  === -1) return { error: 'Missing "Opening" column.' }
  if (closeCol === -1) return { error: 'Missing "Closing" column.' }

  const valid     = []
  const errors    = []
  const seenDates = new Set()

  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]
    if (r.every(c => String(c ?? '').trim() === '')) continue

    const rowNum  = i + 1
    const dateRaw = String(r[dateCol] ?? '').trim()
    const dateIso = parseIso(dateRaw)
    const rowErrs = []

    if (!dateRaw)       rowErrs.push('Date is mandatory')
    else if (!dateIso)  rowErrs.push(`Invalid date format: "${dateRaw}"`)
    else if (seenDates.has(dateIso)) rowErrs.push('Duplicate date found')
    else seenDates.add(dateIso)

    const open  = parseNum(r[openCol])
    const close = parseNum(r[closeCol])

    if (r[openCol]  === '' || r[openCol]  == null) rowErrs.push('Opening Reading is mandatory')
    else if (isNaN(open))  rowErrs.push(`Invalid Opening Reading: "${r[openCol]}"`)

    if (r[closeCol] === '' || r[closeCol] == null) rowErrs.push('Closing Reading is mandatory')
    else if (isNaN(close)) rowErrs.push(`Invalid Closing Reading: "${r[closeCol]}"`)
    else if (!isNaN(open) && close < open)         rowErrs.push('Closing Reading must be ≥ Opening Reading')

    const hsdRaw = hsdCol >= 0 ? r[hsdCol] : null
    const hsd    = hsdRaw !== null ? parseNum(hsdRaw) : null
    if (hsd !== null && isNaN(hsd)) rowErrs.push(`Invalid Diesel value: "${hsdRaw}"`)

    // Breakdown — optional decimal hours
    const brkRaw = brkCol >= 0 ? r[brkCol] : null
    const brk    = brkRaw !== null && String(brkRaw).trim() !== '' ? parseNum(brkRaw) : null
    if (brk !== null && isNaN(brk)) rowErrs.push(`Invalid Breakdown value: "${brkRaw}"`)
    else if (brk !== null && brk < 0)             rowErrs.push('Breakdown hours cannot be negative')

    // Work Done and Qty — optional
    const workDone = workDoneCol >= 0 ? (String(r[workDoneCol] ?? '').trim() || null) : null
    const qtyRaw   = qtyCol >= 0 ? r[qtyCol] : null
    const qty      = qtyRaw !== null && String(qtyRaw).trim() !== '' ? parseNum(qtyRaw) : null
    if (qty !== null && isNaN(qty)) rowErrs.push(`Invalid Qty value: "${qtyRaw}"`)

    // Dual-shift night values
    let nClose = null, hsdN = null, brkN = null
    if (isDual) {
      if (nCloseCol >= 0) {
        nClose = parseNum(r[nCloseCol])
        if (r[nCloseCol] !== '' && r[nCloseCol] != null) {
          if (isNaN(nClose))                             rowErrs.push(`Invalid Night Closing: "${r[nCloseCol]}"`)
          else if (!isNaN(close) && nClose < close)      rowErrs.push('Night Closing must be ≥ Day Closing')
        } else {
          nClose = null
        }
      }
      hsdN = hsdNCol >= 0 ? parseNum(r[hsdNCol]) : null
      if (hsdN !== null && isNaN(hsdN)) rowErrs.push('Invalid Diesel Night value')

      const brkNRaw = brkNCol >= 0 ? r[brkNCol] : null
      brkN = brkNRaw !== null && String(brkNRaw).trim() !== '' ? parseNum(brkNRaw) : null
      if (brkN !== null && isNaN(brkN)) rowErrs.push('Invalid Night Breakdown value')
      else if (brkN !== null && brkN < 0) rowErrs.push('Night Breakdown hours cannot be negative')
    }

    if (rowErrs.length > 0) {
      errors.push({ row: rowNum, date: dateRaw || `Row ${rowNum}`, errors: rowErrs })
    } else {
      valid.push({
        date:      dateIso,
        r1_open:   open,
        r1_close:  close,
        hsd:       (!isNaN(hsd) && hsd !== null) ? hsd : null,
        breakdown: (!isNaN(brk) && brk !== null) ? brk : null,
        work_done: workDone,
        qty:       (!isNaN(qty) && qty !== null) ? qty : null,
        remarks:   remCol >= 0 ? (String(r[remCol] ?? '').trim() || null) : null,
        ...(isDual ? {
          n_r1_close: nClose,
          n_hsd:      (!isNaN(hsdN) && hsdN !== null) ? hsdN : null,
          n_breakdown: (!isNaN(brkN) && brkN !== null) ? brkN : null,
        } : {}),
      })
    }
  }

  return { valid, errors, total: valid.length + errors.length }
}

export async function downloadErrorReport(errors, machineName) {
  const XLSX = await import('xlsx')
  const rows = [
    [`DPR Upload Error Report — ${machineName || ''}`],
    [`Generated: ${new Date().toLocaleString('en-IN')}`],
    [],
    ['Row', 'Date', 'Error(s)'],
    ...errors.map(e => [e.row, e.date, e.errors.join('; ')]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 90 }]
  ;['A4','B4','C4'].forEach(ref => {
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'FFCCCC' } } }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Errors')
  XLSX.writeFile(wb, `DPR_Upload_Errors_${new Date().toISOString().slice(0,10)}.xlsx`)
}
