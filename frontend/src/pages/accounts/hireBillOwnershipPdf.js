/**
 * Hire Bill Abstract PDF — Ownership bills
 * Section-by-section layout to match the HTML view exactly.
 */

const nv = v => parseFloat(v) || 0

const INR = v => nv(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date((String(d)).split('T')[0] + 'T00:00:00')
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`
}

function fmtMY(d) {
  if (!d) return ''
  const dt = new Date((String(d)).split('T')[0] + 'T00:00:00')
  const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return `${m[dt.getMonth()]}-${String(dt.getFullYear()).slice(-2)}`
}

function numToWords(amount) {
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  function iw(n){if(n<20)return a[n];if(n<100)return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');if(n<1000)return a[Math.floor(n/100)]+' Hundred'+(n%100?' '+iw(n%100):'');if(n<100000)return iw(Math.floor(n/1000))+' Thousand'+(n%1000?' '+iw(n%1000):'');if(n<1e7)return iw(Math.floor(n/100000))+' Lakh'+(n%100000?' '+iw(n%100000):'');return iw(Math.floor(n/1e7))+' Crore'+(n%1e7?' '+iw(n%1e7):'')}
  const whole = Math.round(Math.abs(amount))
  return (whole === 0 ? 'Zero' : iw(whole)) + ' Only/-'
}

export async function downloadHireBillOwnershipPdf(data) {
  const { jsPDF }              = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const {
    vendor, vendorDetails = {}, previewMachines = [], machineCalcs = [],
    dateFrom, dateTo,
    totalBasic, totalBreakdownDays, totalBreakdownAmt, totalFuelAmt,
    totalDeductions, totalAdditions,
    gstRate, gstAmt, tdsRate, tdsAmt, netPayable,
    manualAdditions = [], manualDeductions = [],
    raBillNo = '', billForm = {},
    projectCode = '', projectName = '',
  } = data

  // ── Page setup ──────────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const PW  = 297, PH = 210, ML = 10, MR = 10, TW = PW - ML - MR  // 277mm
  let y = 10

  const DARK   = [30, 30, 30]
  const GREY   = [100, 100, 100]
  const HBG    = [40, 50, 70]    // header background
  const SECBG  = [220, 225, 235] // section header background
  const TOTBG  = [235, 240, 248]
  const NETBG  = [200, 215, 240]

  const cText = (text, sz, bold, color) => {
    doc.setFontSize(sz)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...(color || DARK))
    doc.text(text, PW / 2, y, { align: 'center' })
    y += sz * 0.42 + 0.8
  }

  const hline = (lw = 0.3, color = [180,180,180]) => {
    doc.setDrawColor(...color)
    doc.setLineWidth(lw)
    doc.line(ML, y, PW - MR, y)
    y += 2
  }

  const woMachine  = previewMachines.find(m => m.wo_number)
  const monthLabel = fmtMY(dateFrom)
  const fuelLabels = ['a','b','c','d','e','f','g','h','i','j']

  // ── Header ──────────────────────────────────────────────────────────────────
  cText('RVR PROJECTS PVT LTD', 14, true)
  cText(`PROJECT: ${projectCode} ${projectName}`, 9)
  cText(`HIRE BILL ABSTRACT FOR THE MONTH OF ${monthLabel}`, 10, true)
  cText(`(Period ${fmtDate(dateFrom)} to ${fmtDate(dateTo)})`, 8, false, GREY)
  y += 1
  hline(0.5, DARK)

  // ── Two-column info block ───────────────────────────────────────────────────
  const COL   = TW / 2
  const LX    = ML, RX = ML + COL + 4
  const iY    = y
  const lineH = 5

  doc.setFontSize(8)
  const leftRows = [
    ['Ownership', vendor || '—'],
    ['Asset(s)', previewMachines.map(m => m.description || m.reg_no).join(', ')],
    ['GST. No.', vendorDetails.gst_no || '—'],
    ['BANK DETAILS', vendorDetails.bank_name || '—'],
    ['A/C NO', vendorDetails.bank_account || '—'],
    ['IFSC CODE', vendorDetails.bank_ifsc || '—'],
  ]
  const rightRows = [
    ['RA Bill No', raBillNo || 'Auto-assigned on save'],
    ['RA Bill Date', fmtDate(new Date().toISOString().split('T')[0])],
    ['Project', `${projectCode} ${projectName}`],
    ['Bill period', `${fmtDate(dateFrom)} TO ${fmtDate(dateTo)}`],
    ['WO No', woMachine?.wo_number || '—'],
    ['WO Date', woMachine?.wo_date ? fmtDate(woMachine.wo_date) : '—'],
  ]

  leftRows.forEach(([label, val], i) => {
    doc.setFont('helvetica','bold');  doc.setTextColor(...DARK)
    doc.text(`${label}:`, LX, iY + i * lineH)
    doc.setFont('helvetica','normal')
    doc.text(String(val), LX + 30, iY + i * lineH)
  })
  rightRows.forEach(([label, val], i) => {
    doc.setFont('helvetica','bold'); doc.setTextColor(...DARK)
    doc.text(`${label} :`, RX, iY + i * lineH)
    doc.setFont('helvetica','normal')
    doc.text(String(val), RX + 28, iY + i * lineH)
  })

  y = iY + leftRows.length * lineH + 3
  hline(0.4, [150,150,150])

  // ── Summary table ───────────────────────────────────────────────────────────
  // 9 columns (drop Pln Hrs / Util% / Remarks to keep widths sane)
  // Total width used: 12+48+14+24+18+18+18+24+28 = 204mm  (TW=277, fits fine)
  const COLS = {
    sr:    12,
    asset: 48,
    unit:  14,
    rate:  24,
    limit: 18,
    actual:18,
    excess:18,
    urate: 24,
    amt:   28,
  }
  const summaryBody = []

  previewMachines.forEach((mac, idx) => {
    const calc      = machineCalcs[idx]
    const hasHrs    = nv(mac.hours_rate) > 0
    const hasKm     = nv(mac.km_rate) > 0 && nv(mac.planned_km_month) > 0
    const asset     = `${mac.description || mac.reg_no}${mac.eq_type_name ? '\n('+mac.eq_type_name+')' : ''}`
    const rowSpan   = 1 + (hasHrs ? 1 : 0) + (hasKm ? 1 : 0)

    // Month row
    summaryBody.push([
      { content: String(idx + 1), rowSpan, styles: { halign: 'center', valign: 'middle' } },
      { content: asset,           rowSpan, styles: { valign: 'middle' } },
      'Month',
      `₹${INR(mac.monthly_rate)}`,
      `${calc.cDays} Days`,
      `${nv(mac.working_days).toFixed(0)} Days`,
      `${Math.max(0, nv(mac.working_days) - calc.cDays).toFixed(0)} Days`,
      `₹${INR(calc.dailyRate)}`,
      { content: `₹${INR(calc.macBasic)}`, styles: { fontStyle: 'bold' } },
    ])
    if (hasHrs) {
      summaryBody.push([
        'Hours',
        `${INR(mac.hours_rate)} Rs`,
        `${calc.plannedHrs.toFixed(0)} Hrs`,
        `${nv(mac.actual_hours).toFixed(0)} Hrs`,
        `${calc.exHrs.toFixed(0)} Hrs`,
        `₹${INR(mac.hours_rate)}`,
        { content: `₹${INR(calc.hoursAmt)}`, styles: { fontStyle: 'bold' } },
      ])
    }
    if (hasKm) {
      summaryBody.push([
        'KM',
        `${INR(mac.km_rate)} Rs`,
        `${calc.plannedKm.toFixed(0)} KM`,
        `${nv(mac.actual_km).toFixed(0)} KM`,
        `${calc.exKm.toFixed(0)} KM`,
        `₹${INR(mac.km_rate)}`,
        { content: `₹${INR(calc.kmAmt)}`, styles: { fontStyle: 'bold' } },
      ])
    }
  })

  // Total Basic row
  summaryBody.push([
    { content: 'Total Basic', colSpan: 8, styles: { halign: 'right', fontStyle: 'bold', fillColor: TOTBG } },
    { content: `₹${INR(totalBasic)}`,      styles: { halign: 'right', fontStyle: 'bold', fillColor: TOTBG } },
  ])

  autoTable(doc, {
    startY: y,
    head: [['Sr.No', 'Asset', 'Unit', 'Basic Rate', 'Limit', 'Actual', 'Excess', 'Unit Rate', 'Amount']],
    body: summaryBody,
    theme: 'grid',
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles:     { fontSize: 7.5, cellPadding: 1.8, lineColor: [180,180,180], lineWidth: 0.25, textColor: DARK },
    headStyles: { fillColor: HBG, textColor: 255, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    columnStyles: {
      0: { cellWidth: COLS.sr,    halign: 'center' },
      1: { cellWidth: COLS.asset  },
      2: { cellWidth: COLS.unit,  halign: 'center' },
      3: { cellWidth: COLS.rate,  halign: 'right'  },
      4: { cellWidth: COLS.limit, halign: 'center' },
      5: { cellWidth: COLS.actual,halign: 'center' },
      6: { cellWidth: COLS.excess,halign: 'center' },
      7: { cellWidth: COLS.urate, halign: 'right'  },
      8: { cellWidth: COLS.amt,   halign: 'right'  },
    },
  })
  y = doc.lastAutoTable.finalY + 2

  // ── Additions ───────────────────────────────────────────────────────────────
  const addRows = manualAdditions.length > 0
    ? manualAdditions.map((item, i) => [
        { content: `${i+1}) ${item.label || ''}`, styles: { cellWidth: TW - 40 } },
        { content: `₹${INR(item.amount)}`, styles: { halign: 'right' } },
      ])
    : [['1)  —', '']]

  addRows.push([
    { content: 'Total Additions', styles: { halign: 'right', fontStyle: 'bold', fillColor: TOTBG } },
    { content: `₹${INR(totalAdditions)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: TOTBG } },
  ])

  autoTable(doc, {
    startY: y,
    head: [[{ content: 'Additions', colSpan: 2, styles: { fillColor: SECBG, textColor: DARK, fontStyle: 'bold' } }]],
    body: addRows,
    theme: 'grid',
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles:     { fontSize: 7.5, cellPadding: 1.8, lineColor: [180,180,180], lineWidth: 0.25, textColor: DARK },
    headStyles: { fontSize: 7.5 },
    columnStyles: { 0: { cellWidth: TW - 40 }, 1: { cellWidth: 40, halign: 'right' } },
  })
  y = doc.lastAutoTable.finalY + 2

  // ── Deductions ──────────────────────────────────────────────────────────────
  const fuelMachines = previewMachines.filter((m, i) => m.fuel_applicable && machineCalcs[i].fuelAmt > 0)

  const dedRows = []

  // 1) Downtime
  dedRows.push([
    `1)  Downtime — ${totalBreakdownDays} Days`,
    { content: `₹${INR(totalBreakdownAmt)}`, styles: { halign: 'right' } },
  ])

  // 2) Fuel Consumption header (merged)
  if (fuelMachines.length > 0) {
    dedRows.push([
      { content: '2)  Fuel Consumption', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245,245,245] } },
    ])
    fuelMachines.forEach((mac, fi) => {
      const calc2       = machineCalcs[previewMachines.indexOf(mac)]
      const isKm        = mac.fuel_performance_type === 'mileage'
      const unit        = isKm ? 'KM/L' : 'L/Hr'
      const approvedRaw = isKm ? mac.approved_mileage : mac.approved_fuel_consumption
      const approvedStr = approvedRaw != null ? `${nv(approvedRaw).toFixed(2)} ${unit}` : '—'
      const actualStr   = calc2.actualFuelLtrHr > 0 ? `${calc2.actualFuelLtrHr.toFixed(2)} ${unit}` : '—'
      const rateStr     = mac.fuel_deduction_rate != null ? `@ ₹${nv(mac.fuel_deduction_rate).toFixed(2)}/L` : '—'
      const detail      = `${mac.description || mac.reg_no}   Approved: ${approvedStr}   Actual: ${actualStr}   ${nv(mac.diesel_qty).toFixed(2)} Ltrs   ${rateStr}`
      dedRows.push([
        { content: `    ${fuelLabels[fi]})  ${detail}`, styles: { textColor: [60,60,60] } },
        { content: `₹${INR(calc2.fuelAmt)}`, styles: { halign: 'right' } },
      ])
    })
  }

  // Manual deductions
  manualDeductions.forEach((item, i) => {
    dedRows.push([
      `${fuelMachines.length + i + 3})  ${item.label || ''}`,
      { content: `₹${INR(item.amount)}`, styles: { halign: 'right' } },
    ])
  })

  // Total Deductions
  dedRows.push([
    { content: 'Total Deductions', styles: { halign: 'right', fontStyle: 'bold', fillColor: TOTBG } },
    { content: `₹${INR(totalDeductions)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: TOTBG } },
  ])

  autoTable(doc, {
    startY: y,
    head: [[{ content: 'Deductions', colSpan: 2, styles: { fillColor: SECBG, textColor: DARK, fontStyle: 'bold' } }]],
    body: dedRows,
    theme: 'grid',
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles:     { fontSize: 7.5, cellPadding: 1.8, lineColor: [180,180,180], lineWidth: 0.25, textColor: DARK },
    headStyles: { fontSize: 7.5 },
    columnStyles: { 0: { cellWidth: TW - 40 }, 1: { cellWidth: 40, halign: 'right' } },
  })
  y = doc.lastAutoTable.finalY + 2

  // ── Totals block ─────────────────────────────────────────────────────────────
  const totalsRows = [
    [`GST @ ${nv(gstRate)}%`,  `₹${INR(gstAmt)}`],
    [`TDS @ ${nv(tdsRate)}%`,  `₹${INR(tdsAmt)}`],
    [
      { content: 'Net Payable  (Total Basic + Total Additions + GST − TDS − Total Deductions)', styles: { fontStyle: 'bold', fillColor: NETBG } },
      { content: `₹${INR(netPayable)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: NETBG } },
    ],
  ]

  autoTable(doc, {
    startY: y,
    body: totalsRows,
    theme: 'grid',
    margin: { left: ML + TW * 0.35, right: MR },
    tableWidth: TW * 0.65,
    styles:     { fontSize: 8, cellPadding: 2, lineColor: [180,180,180], lineWidth: 0.25, textColor: DARK },
    columnStyles: {
      0: { cellWidth: TW * 0.48 },
      1: { cellWidth: TW * 0.17, halign: 'right' },
    },
  })
  y = doc.lastAutoTable.finalY + 4

  // ── Rupees in words ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  doc.text(`Rupees in words: ${numToWords(netPayable)}`, ML, y)

  // ── Save ──────────────────────────────────────────────────────────────────────
  const safePeriod = (dateFrom || 'period').replace(/-/g, '')
  const safeVendor = (vendor || 'vendor').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
  doc.save(`HireBillAbstract_${safeVendor}_${safePeriod}.pdf`)
}
