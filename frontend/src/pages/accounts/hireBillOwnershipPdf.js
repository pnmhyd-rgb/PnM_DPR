/**
 * Hire Bill Abstract PDF — Ownership bills
 * Portrait A4 | Plain professional layout | RVR logo top-left
 * Uses Rs. prefix (avoids jsPDF Helvetica Unicode issue with rupee sign)
 */

const nv = v => parseFloat(v) || 0
const INR = v => nv(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const Amt = v => `Rs.${INR(v)}`

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(String(d).split('T')[0] + 'T00:00:00')
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`
}

function fmtMY(d) {
  if (!d) return ''
  const dt = new Date(String(d).split('T')[0] + 'T00:00:00')
  const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']
  return `${months[dt.getMonth()]} ${dt.getFullYear()}`
}

function numToWords(amount) {
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  function iw(n) {
    if (n < 20)   return a[n]
    if (n < 100)  return b[Math.floor(n/10)] + (n%10 ? ' '+a[n%10] : '')
    if (n < 1000) return a[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+iw(n%100) : '')
    if (n < 1e5)  return iw(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+iw(n%1000) : '')
    if (n < 1e7)  return iw(Math.floor(n/1e5))  + ' Lakh'     + (n%1e5  ? ' '+iw(n%1e5)  : '')
    return iw(Math.floor(n/1e7)) + ' Crore' + (n%1e7 ? ' '+iw(n%1e7) : '')
  }
  const whole = Math.round(Math.abs(amount))
  return (whole === 0 ? 'Zero' : iw(whole)) + ' Only/-'
}

async function loadImageDataUrl(src) {
  try {
    const resp = await fetch(src)
    const blob = await resp.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ─── Neutral palette — no blue ───────────────────────────────────────────────
const BLACK  = [20,  20,  20]
const DARK   = [50,  50,  50]
const BORD   = [170, 170, 170]
const GH     = [210, 210, 210]   // table header fill
const GT     = [235, 235, 235]   // total-row fill
const GALT   = [250, 250, 250]   // alternate row fill

export async function downloadHireBillOwnershipPdf(data) {
  const { jsPDF }              = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const {
    vendor           = '—',
    vendorDetails    = {},
    previewMachines  = [],
    machineCalcs     = [],
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

  // ── Page setup ──────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW = 210, PH = 297
  const ML = 12,  MR = 12
  const TW = PW - ML - MR   // 186 mm

  const woMachine    = previewMachines.find(m => m.wo_number)
  const monthLabel   = fmtMY(dateFrom)
  const fuelLabels   = ['a','b','c','d','e','f','g','h','i','j']
  const fuelMachines = previewMachines.filter(
    (m, i) => m.fuel_applicable && machineCalcs[i] && nv(machineCalcs[i].fuelAmt) > 0
  )
  const mac0 = previewMachines[0] || {}

  // ── Load logo ────────────────────────────────────────────────────────────
  const logoData = await loadImageDataUrl('/rvr-logo-new.png')

  // ── Header (Page 1) ──────────────────────────────────────────────────────
  // Logo: top-left, 36mm wide × 18mm tall
  const LOGO_W = 36, LOGO_H = 18
  const LOGO_X = ML, LOGO_Y = 8

  if (logoData) {
    doc.addImage(logoData, 'PNG', LOGO_X, LOGO_Y, LOGO_W, LOGO_H)
  }

  // Company name + title — centred on the FULL page width (logo sits beside, no overlap)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BLACK)
  doc.text('RVR PROJECTS PVT LTD', PW / 2, 14, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text('HIRE BILL ABSTRACT', PW / 2, 20, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  doc.text(`For the Month of ${monthLabel}`, PW / 2, 26, { align: 'center' })

  // Full-width rule below header
  doc.setDrawColor(...BORD)
  doc.setLineWidth(0.5)
  doc.line(ML, 30, PW - MR, 30)

  let y = 34

  // ── Bill-reference line ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  doc.text(`RA Bill No: ${raBillNo || '—'}`, ML, y)
  doc.text(`Period: ${fmtDate(dateFrom)}  to  ${fmtDate(dateTo)}`, PW / 2, y, { align: 'center' })
  doc.text(`Date: ${fmtDate(new Date().toISOString().split('T')[0])}`, PW - MR, y, { align: 'right' })

  y += 3
  doc.setDrawColor(...BORD)
  doc.setLineWidth(0.2)
  doc.line(ML, y, PW - MR, y)
  y += 4

  // ── Two-column info block ────────────────────────────────────────────────
  const halfW = Math.floor((TW - 6) / 2)
  const col2X = ML + halfW + 6
  const lineH = 5.2

  const leftRows = [
    ['Bill To',  vendor],
    ['GST No',   vendorDetails.gst_no       || '—'],
    ['Bank',     vendorDetails.bank_name    || '—'],
    ['A/C No',   vendorDetails.bank_account || '—'],
    ['IFSC',     vendorDetails.bank_ifsc    || '—'],
  ]
  const rightRows = [
    ['WO No',     woMachine?.wo_number || '—'],
    ['Project',   `${data.projectCode || ''} ${data.projectName || ''}`.trim() || '—'],
    ['Cal. Days', `${nv(mac0.cal_days) || 30} Days`],
    ['Working',   `${nv(mac0.working_days).toFixed(0)} Days`],
  ]

  const boxH = Math.max(leftRows.length, rightRows.length) * lineH + 6
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...BORD)
  doc.setLineWidth(0.3)
  doc.rect(ML,     y, halfW, boxH, 'FD')
  doc.rect(col2X,  y, halfW, boxH, 'FD')

  const bY = y + 4.5
  leftRows.forEach(([lbl, val], i) => {
    doc.setFont('helvetica', 'bold');   doc.setFontSize(7);   doc.setTextColor(80, 80, 80)
    doc.text(lbl, ML + 2, bY + i * lineH)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...BLACK)
    const txt = String(val || '—')
    doc.text(txt.length > 36 ? txt.slice(0, 35) + '…' : txt, ML + 22, bY + i * lineH)
  })
  rightRows.forEach(([lbl, val], i) => {
    doc.setFont('helvetica', 'bold');   doc.setFontSize(7);   doc.setTextColor(80, 80, 80)
    doc.text(lbl, col2X + 2, bY + i * lineH)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...BLACK)
    const txt = String(val || '—')
    // Value at +20mm leaves clear space after longest label ("Cal. Days" ≈ 14mm at 7pt bold)
    doc.text(txt.length > 36 ? txt.slice(0, 35) + '…' : txt, col2X + 20, bY + i * lineH)
  })

  y += boxH + 6

  // ── Section-label helper (plain, no colour) ──────────────────────────────
  const secLabel = (text) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...BLACK)
    doc.text(text, ML, y)
    doc.setDrawColor(...BORD)
    doc.setLineWidth(0.3)
    // Rule 3mm below text baseline — clearly below descenders
    doc.line(ML, y + 3, PW - MR, y + 3)
    y += 8
  }

  // Common table style — plain grid, gray header, no colour
  // bottom:15 keeps autoTable rows away from the footer line at PH-10
  const baseStyle = {
    theme:  'grid',
    margin: { left: ML, right: MR, bottom: 15 },
    styles: {
      fontSize:    7.5,
      cellPadding: 1.8,
      lineColor:   BORD,
      lineWidth:   0.25,
      textColor:   BLACK,
    },
    headStyles: {
      fillColor:  GH,
      textColor:  BLACK,
      fontStyle:  'bold',
      fontSize:   7.5,
      halign:     'center',
    },
    alternateRowStyles: { fillColor: GALT },
  }

  // ── A. Machine-wise Hire Charges ─────────────────────────────────────────
  // Column widths sum = 186 mm (= TW)
  // Sr(10) + Asset(36) + Unit(11) + Rate(24) + Limit(16) + Actual(16) + Excess(16) + URate(24) + Amt(33)
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
      { content: asset,           rowSpan, styles: { valign:'middle' } },
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
      styles:  { halign:'right', fontStyle:'bold', fillColor: GT, textColor: BLACK },
    },
    { content: Amt(totalBasic), styles: { halign:'right', fontStyle:'bold', fillColor: GT } },
  ])

  autoTable(doc, {
    ...baseStyle,
    startY:      y,
    tableWidth:  TW,
    head: [['Sr.', 'Asset / Reg. No', 'Unit', 'Basic Rate', 'Limit', 'Actual', 'Excess', 'Unit Rate', 'Amount']],
    body: summaryBody,
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

  // ── B. Additions ──────────────────────────────────────────────────────────
  {
    secLabel('B.  Additions')
    const rows = manualAdditions.length > 0
      ? manualAdditions.map((item, i) => [
          `${i + 1})  ${item.label || '—'}`,
          { content: Amt(item.amount), styles: { halign:'right' } },
        ])
      : [['1)  —', { content: 'Rs.0.00', styles: { halign:'right', textColor:[160,160,160] } }]]

    rows.push([
      { content:'Total Additions  (B)', styles:{ halign:'right', fontStyle:'bold', fillColor: GT } },
      { content: Amt(totalAdditions || 0), styles:{ halign:'right', fontStyle:'bold', fillColor: GT } },
    ])

    autoTable(doc, {
      ...baseStyle,
      startY:     y,
      tableWidth: TW,
      body:  rows,
      columnStyles: {
        0: { cellWidth: TW - 38 },
        1: { cellWidth: 38, halign:'right' },
      },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── C. Deductions ─────────────────────────────────────────────────────────
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
        styles:  { fontStyle:'bold', fillColor: [242, 242, 242] },
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
          { content: detail, styles: { textColor: DARK } },
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
      { content:'Total Deductions  (C)', styles:{ halign:'right', fontStyle:'bold', fillColor: GT } },
      { content: Amt(totalDeductions || 0), styles:{ halign:'right', fontStyle:'bold', fillColor: GT } },
    ])

    autoTable(doc, {
      ...baseStyle,
      startY:     y,
      tableWidth: TW,
      body:   dedRows,
      columnStyles: {
        0: { cellWidth: TW - 38 },
        1: { cellWidth: 38, halign:'right' },
      },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Net Payable (right-aligned block, 148 mm wide) ───────────────────────
  {
    const bW  = 148
    const bML = ML + TW - bW

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
        { content:'Net Amount Payable  (A + B - C - TDS)', styles:{ fontStyle:'bold', fillColor: GH } },
        { content: Amt(netPayable || 0), styles:{ halign:'right', fontStyle:'bold', fillColor: GH } },
      ],
    ]

    autoTable(doc, {
      ...baseStyle,
      startY:     y,
      tableWidth: bW,
      margin:     { left: bML, right: MR },
      body:       totRows,
      styles:     { ...baseStyle.styles, fontSize: 8 },
      columnStyles: {
        0: { cellWidth: bW - 44 },
        1: { cellWidth: 44, halign:'right' },
      },
    })
    y = doc.lastAutoTable.finalY + 5
  }

  // ── Amount in words ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  const words     = `Rupees: ${numToWords(nv(netPayable))}`
  const wordLines = doc.splitTextToSize(words, TW)
  doc.text(wordLines, ML, y)
  y += wordLines.length * 5 + 4

  // ── Bank Details ─────────────────────────────────────────────────────────
  if (vendorDetails.bank_name || vendorDetails.bank_account) {
    doc.setFont('helvetica', 'bold');   doc.setFontSize(7.5); doc.setTextColor(...BLACK)
    doc.text('Bank Details:', ML, y); y += 4
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...DARK)
    ;[
      vendorDetails.bank_name    ? `Bank Name : ${vendorDetails.bank_name}`    : null,
      vendorDetails.bank_account ? `A/C No    : ${vendorDetails.bank_account}` : null,
      vendorDetails.bank_ifsc    ? `IFSC Code : ${vendorDetails.bank_ifsc}`    : null,
    ].filter(Boolean).forEach(ln => { doc.text(ln, ML + 4, y); y += 4 })
    y += 2
  }

  // ── Signature block ───────────────────────────────────────────────────────
  // Push to a new page if there isn't enough room for the signature + footer
  if (y > PH - 44) {
    doc.addPage()
    y = 20
  }
  y = Math.max(y, PH - 42)
  const sigW    = 50
  const sigGap  = (TW - 3 * sigW) / 2
  const sigX    = [ML, ML + sigW + sigGap, ML + 2 * (sigW + sigGap)]
  const sigLbls = ['Prepared by', 'Checked by', 'Authorized Signatory']

  doc.setDrawColor(...BORD)
  doc.setLineWidth(0.35)
  sigX.forEach(x => doc.line(x, y, x + sigW, y))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(80, 80, 80)
  sigX.forEach((x, i) => doc.text(sigLbls[i], x, y + 5))

  // ── Page footers on every page ───────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...BORD)
    doc.setLineWidth(0.2)
    doc.line(ML, PH - 10, PW - MR, PH - 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(130, 130, 130)
    doc.text('RVR Projects Pvt Ltd  —  Hire Bill Abstract', ML, PH - 6)
    doc.text(`Page ${p} of ${totalPages}`, PW - MR, PH - 6, { align: 'right' })
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const safePeriod = (dateFrom || 'period').replace(/-/g, '').slice(0, 8)
  const safeVendor = (vendor || 'vendor').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)
  doc.save(`HireBill_${raBillNo || 'Draft'}_${safeVendor}_${safePeriod}.pdf`)
}
