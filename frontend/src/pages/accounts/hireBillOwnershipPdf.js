/**
 * Hire Bill Abstract PDF — Ownership bills
 * Portrait A4, Rs. prefix (avoids jsPDF Helvetica Unicode issues with ₹)
 */

const nv = v => parseFloat(v) || 0

const INR = v => nv(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const Amt = v => `Rs.${INR(v)}`

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date((String(d)).split('T')[0] + 'T00:00:00')
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`
}

function fmtMY(d) {
  if (!d) return ''
  const dt = new Date((String(d)).split('T')[0] + 'T00:00:00')
  const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']
  return `${months[dt.getMonth()]} ${dt.getFullYear()}`
}

function numToWords(amount) {
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  function iw(n) {
    if (n < 20)    return a[n]
    if (n < 100)   return b[Math.floor(n/10)] + (n%10 ? ' '+a[n%10] : '')
    if (n < 1000)  return a[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+iw(n%100) : '')
    if (n < 1e5)   return iw(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+iw(n%1000) : '')
    if (n < 1e7)   return iw(Math.floor(n/1e5)) + ' Lakh' + (n%1e5 ? ' '+iw(n%1e5) : '')
    return iw(Math.floor(n/1e7)) + ' Crore' + (n%1e7 ? ' '+iw(n%1e7) : '')
  }
  const whole = Math.round(Math.abs(amount))
  return (whole === 0 ? 'Zero' : iw(whole)) + ' Only/-'
}

// ─── Colours ────────────────────────────────────────────────────────────────
const NAVY = [30,  58,  95]
const LITE = [240, 244, 250]
const BORD = [180, 180, 180]
const DARK = [20,  20,  20]

export async function downloadHireBillOwnershipPdf(data) {
  const { jsPDF }              = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const {
    vendor = '—',
    vendorDetails = {},
    previewMachines = [],
    machineCalcs = [],
    dateFrom,
    dateTo,
    totalBasic,
    totalBreakdownDays,
    totalBreakdownAmt,
    totalDeductions,
    totalAdditions,
    gstRate,
    gstAmt,
    tdsRate,
    tdsAmt,
    netPayable,
    manualAdditions  = [],
    manualDeductions = [],
    raBillNo         = '',
  } = data

  // ── Page setup — Portrait A4 ─────────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW = 210, PH = 297
  const ML = 12,  MR = 12
  const TW = PW - ML - MR   // 186 mm content width

  const woMachine  = previewMachines.find(m => m.wo_number)
  const monthLabel = fmtMY(dateFrom)
  const fuelLabels = ['a','b','c','d','e','f','g','h','i','j']
  const fuelMachines = previewMachines.filter(
    (m, i) => m.fuel_applicable && machineCalcs[i] && nv(machineCalcs[i].fuelAmt) > 0
  )

  // ── Page 1 Header ────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, PW, 22, 'F')
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255)
  doc.text('RVR PROJECTS PVT LTD', PW/2, 9, { align: 'center' })
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(200, 215, 240)
  doc.text(`HIRE BILL ABSTRACT  —  ${monthLabel}`, PW/2, 17, { align: 'center' })

  let y = 27

  // ── Bill-reference strip ─────────────────────────────────────────────────
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...DARK)
  doc.text(`RA Bill No: ${raBillNo || '—'}`, ML, y)
  doc.text(`Period: ${fmtDate(dateFrom)}  to  ${fmtDate(dateTo)}`, PW/2, y, { align: 'center' })
  doc.text(`Date: ${fmtDate(new Date().toISOString().split('T')[0])}`, PW - MR, y, { align: 'right' })
  y += 4
  doc.setDrawColor(...BORD); doc.setLineWidth(0.2)
  doc.line(ML, y, PW - MR, y)
  y += 4

  // ── Two-column info block ────────────────────────────────────────────────
  const halfW = Math.floor((TW - 8) / 2)   // ~89 mm each column
  const col2X = ML + halfW + 8
  const lineH = 5.2
  const mac0  = previewMachines[0] || {}

  const leftRows = [
    ['Bill To',  vendor],
    ['GST No',   vendorDetails.gst_no      || '—'],
    ['Bank',     vendorDetails.bank_name   || '—'],
    ['A/C No',   vendorDetails.bank_account|| '—'],
    ['IFSC',     vendorDetails.bank_ifsc   || '—'],
  ]
  const rightRows = [
    ['WO No',    woMachine?.wo_number  || '—'],
    ['Project',  `${data.projectCode||''} ${data.projectName||''}`.trim() || '—'],
    ['Cal. Days',`${nv(mac0.cal_days) || 30} Days`],
    ['Working',  `${nv(mac0.working_days).toFixed(0)} Days`],
  ]

  const boxH = Math.max(leftRows.length, rightRows.length) * lineH + 6
  doc.setFillColor(247, 249, 252)
  doc.setDrawColor(...BORD); doc.setLineWidth(0.3)
  doc.rect(ML,     y, halfW, boxH, 'FD')
  doc.rect(col2X,  y, halfW, boxH, 'FD')

  const bY = y + 4
  leftRows.forEach(([lbl, val], i) => {
    doc.setFont('helvetica','bold');  doc.setFontSize(6.8); doc.setTextColor(80, 90, 110)
    doc.text(lbl, ML + 2, bY + i * lineH)
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...DARK)
    // Truncate to prevent overflow into right column
    const maxChars = 36
    const txt = String(val || '—')
    doc.text(txt.length > maxChars ? txt.slice(0, maxChars - 1) + '…' : txt, ML + 22, bY + i * lineH)
  })
  rightRows.forEach(([lbl, val], i) => {
    doc.setFont('helvetica','bold');  doc.setFontSize(6.8); doc.setTextColor(80, 90, 110)
    doc.text(lbl, col2X + 2, bY + i * lineH)
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...DARK)
    const maxChars = 34
    const txt = String(val || '—')
    doc.text(txt.length > maxChars ? txt.slice(0, maxChars - 1) + '…' : txt, col2X + 20, bY + i * lineH)
  })

  y += boxH + 5

  // ── Section label helper ─────────────────────────────────────────────────
  const secLabel = (text) => {
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...NAVY)
    doc.text(text, ML, y)
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.3)
    doc.line(ML, y + 1, ML + doc.getTextWidth(text), y + 1)
    y += 5
  }

  // ── Machine-wise Hire Charges table ─────────────────────────────────────
  // Column widths must sum to TW = 186 mm
  // Sr(10) + Asset(36) + Unit(11) + Rate(24) + Limit(16) + Actual(16) + Excess(16) + URate(24) + Amt(33) = 186
  secLabel('A.  Machine-wise Hire Charges')

  const summaryBody = []
  previewMachines.forEach((mac, idx) => {
    const calc    = machineCalcs[idx] || {}
    const hasHrs  = nv(mac.hours_rate) > 0
    const hasKm   = nv(mac.km_rate) > 0 && nv(mac.planned_km_month) > 0
    const rowSpan = 1 + (hasHrs ? 1 : 0) + (hasKm ? 1 : 0)

    const regNo = mac.reg_no || ''
    const desc  = mac.description || ''
    const asset = regNo && desc && regNo !== desc ? `${regNo}\n${desc}` : (regNo || desc || '—')

    summaryBody.push([
      { content: String(idx + 1), rowSpan, styles: { halign:'center', valign:'middle' } },
      { content: asset,           rowSpan, styles: { valign:'middle'  } },
      'Month',
      Amt(mac.monthly_rate),
      `${nv(calc.cDays) || 30} Days`,
      `${nv(mac.working_days).toFixed(0)} Days`,
      `${Math.max(0, nv(mac.working_days) - (nv(calc.cDays) || 30)).toFixed(0)} Days`,
      Amt(calc.dailyRate),
      { content: Amt(calc.macBasic), styles: { fontStyle:'bold' } },
    ])

    if (hasHrs) {
      summaryBody.push([
        'Hours',
        `${INR(mac.hours_rate)} Rs/Hr`,
        `${nv(calc.plannedHrs).toFixed(0)} Hrs`,
        `${nv(mac.actual_hours).toFixed(0)} Hrs`,
        `${nv(calc.exHrs).toFixed(0)} Hrs`,
        Amt(mac.hours_rate),
        { content: Amt(calc.hoursAmt), styles: { fontStyle:'bold' } },
      ])
    }
    if (hasKm) {
      summaryBody.push([
        'KM',
        `${INR(mac.km_rate)} Rs/KM`,
        `${nv(calc.plannedKm).toFixed(0)} KM`,
        `${nv(mac.actual_km).toFixed(0)} KM`,
        `${nv(calc.exKm).toFixed(0)} KM`,
        Amt(mac.km_rate),
        { content: Amt(calc.kmAmt), styles: { fontStyle:'bold' } },
      ])
    }
  })

  summaryBody.push([
    {
      content: 'Total Basic Hire Charges  (A)',
      colSpan: 8,
      styles:  { halign:'right', fontStyle:'bold', fillColor: LITE, textColor: NAVY },
    },
    {
      content: Amt(totalBasic),
      styles:  { halign:'right', fontStyle:'bold', fillColor: LITE, textColor: NAVY },
    },
  ])

  autoTable(doc, {
    startY: y,
    head: [['Sr.', 'Asset / Reg. No', 'Unit', 'Basic Rate', 'Limit', 'Actual', 'Excess', 'Unit Rate', 'Amount']],
    body: summaryBody,
    theme: 'grid',
    margin:      { left: ML, right: MR },
    tableWidth:  TW,
    styles:      { fontSize: 7.5, cellPadding: 1.6, lineColor: BORD, lineWidth: 0.25, textColor: DARK },
    headStyles:  { fillColor: NAVY, textColor: 255, fontStyle:'bold', fontSize: 7.5, halign:'center' },
    alternateRowStyles: { fillColor: [250, 251, 255] },
    columnStyles: {
      0: { cellWidth: 10, halign:'center' },
      1: { cellWidth: 36 },
      2: { cellWidth: 11, halign:'center' },
      3: { cellWidth: 24, halign:'right'  },
      4: { cellWidth: 16, halign:'center' },
      5: { cellWidth: 16, halign:'center' },
      6: { cellWidth: 16, halign:'center' },
      7: { cellWidth: 24, halign:'right'  },
      8: { cellWidth: 33, halign:'right'  },
    },
  })
  y = doc.lastAutoTable.finalY + 6

  // ── Additions ─────────────────────────────────────────────────────────────
  {
    secLabel('B.  Additions')
    const rows = manualAdditions.length > 0
      ? manualAdditions.map((item, i) => [
          `${i + 1})  ${item.label || '—'}`,
          { content: Amt(item.amount), styles: { halign:'right' } },
        ])
      : [['1)  —', { content: 'Rs.0.00', styles: { halign:'right', textColor:[160,160,160] } }]]

    rows.push([
      { content:'Total Additions  (B)', styles:{ halign:'right', fontStyle:'bold', fillColor: LITE, textColor: NAVY } },
      { content: Amt(totalAdditions || 0), styles:{ halign:'right', fontStyle:'bold', fillColor: LITE, textColor: NAVY } },
    ])

    autoTable(doc, {
      startY: y,
      body:  rows,
      theme: 'grid',
      margin:     { left: ML, right: MR },
      tableWidth: TW,
      styles:     { fontSize: 7.5, cellPadding: 1.5, lineColor: BORD, lineWidth: 0.25, textColor: DARK },
      columnStyles: { 0: { cellWidth: TW - 38 }, 1: { cellWidth: 38, halign:'right' } },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Deductions ────────────────────────────────────────────────────────────
  {
    secLabel('C.  Deductions')
    const dedRows = []

    dedRows.push([
      `1)  Downtime / Breakdown — ${totalBreakdownDays || 0} Days`,
      { content: Amt(totalBreakdownAmt || 0), styles: { halign:'right' } },
    ])

    if (fuelMachines.length > 0) {
      dedRows.push([{
        content: '2)  Fuel Consumption',
        colSpan: 2,
        styles:  { fontStyle:'bold', fillColor: [245, 247, 250] },
      }])
      fuelMachines.forEach((mac, fi) => {
        const ci   = previewMachines.indexOf(mac)
        const calc = machineCalcs[ci] || {}
        const isKm = mac.fuel_performance_type === 'mileage'
        const unit = isKm ? 'KM/L' : 'L/Hr'
        const app  = isKm ? mac.approved_mileage : mac.approved_fuel_consumption
        const appS = app != null ? `${nv(app).toFixed(2)} ${unit}` : '—'
        const actS = nv(calc.actualFuelLtrHr) > 0 ? `${nv(calc.actualFuelLtrHr).toFixed(2)} ${unit}` : '—'
        const rateS = mac.fuel_deduction_rate != null
          ? `@ Rs.${nv(mac.fuel_deduction_rate).toFixed(2)}/L` : '—'
        const detail = [
          `    ${fuelLabels[fi]})`,
          mac.reg_no || mac.description,
          `Approved: ${appS}`,
          `Actual: ${actS}`,
          `${nv(mac.diesel_qty).toFixed(2)} Ltrs`,
          rateS,
        ].join('  ')
        dedRows.push([
          { content: detail, styles: { textColor: [60, 60, 60] } },
          { content: Amt(calc.fuelAmt || 0), styles: { halign:'right' } },
        ])
      })
    }

    manualDeductions.forEach((item, i) => {
      dedRows.push([
        `${fuelMachines.length + i + 3})  ${item.label || '—'}`,
        { content: Amt(item.amount), styles: { halign:'right' } },
      ])
    })

    dedRows.push([
      { content:'Total Deductions  (C)', styles:{ halign:'right', fontStyle:'bold', fillColor: LITE, textColor: NAVY } },
      { content: Amt(totalDeductions || 0), styles:{ halign:'right', fontStyle:'bold', fillColor: LITE, textColor: NAVY } },
    ])

    autoTable(doc, {
      startY: y,
      body:   dedRows,
      theme:  'grid',
      margin:     { left: ML, right: MR },
      tableWidth: TW,
      styles:     { fontSize: 7.5, cellPadding: 1.5, lineColor: BORD, lineWidth: 0.25, textColor: DARK },
      columnStyles: { 0: { cellWidth: TW - 38 }, 1: { cellWidth: 38, halign:'right' } },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Net Payable block (right-aligned, 140 mm wide) ───────────────────────
  {
    const bW  = 140
    const bML = ML + TW - bW   // align to right edge

    const totRows = [
      [
        `GST @ ${nv(gstRate) || 18}%`,
        { content: Amt(gstAmt || 0), styles: { halign:'right' } },
      ],
      [
        `TDS (Income Tax) @ ${nv(tdsRate) || 2}%`,
        { content: Amt(tdsAmt || 0), styles: { halign:'right' } },
      ],
      [
        {
          content: 'Net Amount Payable  (A + B − C − TDS)',
          styles:  { fontStyle:'bold', fillColor:[210, 225, 248], textColor: NAVY },
        },
        {
          content: Amt(netPayable || 0),
          styles:  { halign:'right', fontStyle:'bold', fillColor:[210, 225, 248], textColor: NAVY },
        },
      ],
    ]

    autoTable(doc, {
      startY: y,
      body:   totRows,
      theme:  'grid',
      margin:     { left: bML, right: MR },
      tableWidth: bW,
      styles:     { fontSize: 8, cellPadding: 2, lineColor: BORD, lineWidth: 0.25, textColor: DARK },
      columnStyles: {
        0: { cellWidth: bW - 42 },
        1: { cellWidth: 42, halign:'right' },
      },
    })
    y = doc.lastAutoTable.finalY + 4
  }

  // ── Amount in words ───────────────────────────────────────────────────────
  doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(50, 50, 50)
  // Wrap long amount-in-words if needed
  const words = `Rupees: ${numToWords(nv(netPayable))}`
  const wordLines = doc.splitTextToSize(words, TW)
  doc.text(wordLines, ML, y)
  y += wordLines.length * 5 + 4

  // ── Bank Details ──────────────────────────────────────────────────────────
  if (vendorDetails.bank_name || vendorDetails.bank_account) {
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY)
    doc.text('Bank Details:', ML, y); y += 4
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...DARK)
    const bkLines = [
      vendorDetails.bank_name    ? `Bank: ${vendorDetails.bank_name}`                  : null,
      vendorDetails.bank_account ? `A/C No: ${vendorDetails.bank_account}`             : null,
      vendorDetails.bank_ifsc    ? `IFSC Code: ${vendorDetails.bank_ifsc}`             : null,
    ].filter(Boolean)
    bkLines.forEach(ln => { doc.text(ln, ML + 4, y); y += 4 })
    y += 2
  }

  // ── Signature block ──────────────────────────────────────────────────────
  y = Math.max(y, PH - 34)
  const sigW = 52
  const sigPositions = [ML, ML + (TW/2) - sigW/2, ML + TW - sigW]
  const sigLabels    = ['Prepared by', 'Checked by', 'Authorized Signatory']

  doc.setDrawColor(...BORD); doc.setLineWidth(0.35)
  sigPositions.forEach(x => doc.line(x, y, x + sigW, y))
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80, 80, 80)
  sigPositions.forEach((x, i) => doc.text(sigLabels[i], x, y + 5))

  // ── Page footers (all pages) ─────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(150, 150, 150)
    doc.text('RVR Projects Pvt Ltd  —  Hire Bill Abstract', ML, PH - 7)
    doc.text(`Page ${p} of ${totalPages}`, PW - MR, PH - 7, { align:'right' })
    // Bottom border line
    doc.setDrawColor(...BORD); doc.setLineWidth(0.2)
    doc.line(ML, PH - 10, PW - MR, PH - 10)
  }

  // ── Save ────────────────────────────────────────────────────────────────
  const safePeriod = (dateFrom || 'period').replace(/-/g, '').slice(0, 8)
  const safeVendor = (vendor || 'vendor').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)
  doc.save(`HireBill_${raBillNo || 'Draft'}_${safeVendor}_${safePeriod}.pdf`)
}
