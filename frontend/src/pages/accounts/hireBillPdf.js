const INR = v => v != null ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN') : '-'

const NAVY   = [30, 58, 95]
const LIGHT  = [248, 250, 252]
const BORDER = [180, 180, 180]

function numToWords(amount) {
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  function iw(n) {
    if (n < 20)      return a[n]
    if (n < 100)     return b[Math.floor(n/10)] + (n%10 ? ' '+a[n%10] : '')
    if (n < 1000)    return a[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+iw(n%100) : '')
    if (n < 100000)  return iw(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+iw(n%1000) : '')
    if (n < 1e7)     return iw(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' '+iw(n%100000) : '')
    return iw(Math.floor(n/1e7)) + ' Crore' + (n%1e7 ? ' '+iw(n%1e7) : '')
  }
  const n = Math.round(Math.abs(amount))
  return (n === 0 ? 'Zero' : iw(n)) + ' Only/-'
}

// Draws a labelled info box at (x,y) w×h, returns nothing
function infoBox(doc, x, y, w, h, label, lines) {
  doc.setFillColor(...LIGHT)
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.rect(x, y, w, h, 'FD')
  doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(100,116,139)
  doc.text(label, x+3, y+4)
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(20,20,20)
  lines.forEach((l, i) => { if (l) doc.text(String(l), x+3, y+9+i*4.5) })
}

// Section heading underline
function sectionHead(doc, text, x, y) {
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...NAVY)
  doc.text(text, x, y)
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.4)
  doc.line(x, y+1.2, x + doc.getTextWidth(text), y+1.2)
}

// Page footer
function footer(doc, pw, ph, page) {
  doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(150)
  doc.text('RVR Projects Pvt Ltd — Hire Bill Abstract', 10, ph-5)
  doc.text(`Page ${page}`, pw-10, ph-5, { align:'right' })
}

export async function downloadHireBillPDF(calc) {
  const { jsPDF }              = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw  = doc.internal.pageSize.getWidth()
  const ph  = doc.internal.pageSize.getHeight()

  const prev          = calc.prev_calc || {}
  const allMachines   = calc.machines || []
  const hireMachines  = allMachines.filter(m => !m.is_mobilization)
  const mobRows       = allMachines.filter(m => m.is_mobilization)
  const nonTmMachines = hireMachines.filter(m => !m.is_tm)
  const tmMachines    = hireMachines.filter(m => m.is_tm)
  const tmWithCum     = (tmMachines.length ? tmMachines : hireMachines).filter(m => parseFloat(m.cubic_meter_qty) > 0)
  const dieselMachines= hireMachines.filter(m => parseFloat(m.diesel_qty) > 0)
  const prevMachines  = Array.isArray(prev.machines) ? prev.machines : []

  const prevBasic  = parseFloat(prev.basic_amount)       || 0
  const prevGst    = parseFloat(prev.gst_amount)         || 0
  const prevGross  = parseFloat(prev.gross_payable)      || 0
  const prevIT     = parseFloat(prev.income_tax_amount)  || 0
  const prevMaint  = parseFloat(prev.maintenance_amount) || 0
  const prevStores = parseFloat(prev.stores_amount)      || 0
  const prevAdv    = parseFloat(prev.advance_amount)     || 0
  const prevRec    = parseFloat(prev.total_recoveries)   || 0
  const prevNet    = parseFloat(prev.net_payable)        || 0

  const thisBasic  = parseFloat(calc.basic_amount)       || 0
  const thisGst    = parseFloat(calc.gst_amount)         || 0
  const thisGross  = parseFloat(calc.gross_payable)      || 0
  const thisIT     = parseFloat(calc.income_tax_amount)  || 0
  const thisMaint  = parseFloat(calc.maintenance_amount) || 0
  const thisStores = parseFloat(calc.stores_amount)      || 0
  const thisAdv    = parseFloat(calc.advance_amount)     || 0
  const thisRec    = parseFloat(calc.total_recoveries)   || 0
  const thisNet    = parseFloat(calc.net_payable)        || 0

  const periodMonth = calc.period_from
    ? new Date(calc.period_from).toLocaleString('en-IN', { month:'long', year:'numeric' }).toUpperCase()
    : ''

  let pageNum = 1

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 1 — ABSTRACT
  // ══════════════════════════════════════════════════════════════════════

  // ── Header bar ──────────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, pw, 24, 'F')
  doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(255,255,255)
  doc.text('RVR PROJECTS PVT LTD', pw/2, 10, { align:'center' })
  doc.setFontSize(9); doc.setFont('helvetica','normal')
  doc.text(`HIRE BILL ABSTRACT — ${periodMonth}`, pw/2, 17, { align:'center' })

  let y = 30

  // ── Bill reference strip ─────────────────────────────────────────────
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(20,20,20)
  doc.text(`RA Bill No: ${calc.ra_bill_no || '—'}`, 12, y)
  doc.text(`Invoice No: ${calc.invoice_number || '—'}`, pw/2, y, { align:'center' })
  doc.text(`Date: ${fmtDate(calc.invoice_date)}`, pw-12, y, { align:'right' })
  y += 5
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2)
  doc.line(10, y, pw-10, y)
  y += 5

  // ── Info boxes row ───────────────────────────────────────────────────
  const boxH = 22, boxW = (pw-24)/3
  infoBox(doc, 10,        y, boxW, boxH, 'SUB-CONTRACTOR', [
    calc.vendor_name || '—',
    calc.vendor_gst  ? `GSTIN: ${calc.vendor_gst}` : null,
    calc.bank_name   ? `Bank:  ${calc.bank_name}`  : null,
  ])
  infoBox(doc, 12+boxW,   y, boxW, boxH, 'PROJECT / SITE', [
    calc.project_name || '—',
    calc.project_code ? `Code:  ${calc.project_code}` : null,
    calc.wo_number    ? `WO No: ${calc.wo_number}`    : null,
  ])
  infoBox(doc, 14+boxW*2, y, boxW, boxH, 'BILL PERIOD', [
    `From: ${fmtDate(calc.period_from)}`,
    `To:   ${fmtDate(calc.period_to)}`,
    `Cal Days: ${calc.cal_days || hireMachines[0]?.cal_days || '—'}`,
  ])
  y += boxH + 6

  // ── Abstract summary table ───────────────────────────────────────────
  sectionHead(doc, 'A.  Bill Summary', 10, y); y += 5

  const gstLbl = `GST @ ${calc.gst_rate || 18}%`
  const itLbl  = `(a) Income Tax @ ${calc.income_tax_rate || 2}%`

  const summaryRows = [
    ['Gross Hire Charges',   INR(prevBasic+thisBasic),  INR(prevBasic),  INR(thisBasic)],
    [gstLbl,                 INR(prevGst+thisGst),      INR(prevGst),    INR(thisGst)],
    [{ content:'Gross Payable  (A)', styles:{fontStyle:'bold'} },
      {content:INR(prevGross+thisGross),styles:{fontStyle:'bold'}},
      {content:INR(prevGross),styles:{fontStyle:'bold'}},
      {content:INR(thisGross),styles:{fontStyle:'bold'}}],
    [{ content:'B.  Recoveries', colSpan:4, styles:{fontStyle:'bold', fillColor:LIGHT, textColor:NAVY} }],
    [itLbl,                  INR(prevIT+thisIT),        prevIT?INR(prevIT):'-',        INR(thisIT)],
    ['(b) Maintenance',      thisMaint?INR(prevMaint+thisMaint):'-',  prevMaint?INR(prevMaint):'-',   thisMaint?INR(thisMaint):'-'],
    ['(c) Stores',           thisStores?INR(prevStores+thisStores):'-', prevStores?INR(prevStores):'-', thisStores?INR(thisStores):'-'],
    ['(d) Advance',          thisAdv?INR(prevAdv+thisAdv):'-',        prevAdv?INR(prevAdv):'-',       thisAdv?INR(thisAdv):'-'],
    [{ content:'Total Recoveries  (B)', styles:{fontStyle:'bold'} },
      {content:INR(prevRec+thisRec),styles:{fontStyle:'bold'}},
      {content:INR(prevRec),styles:{fontStyle:'bold'}},
      {content:INR(thisRec),styles:{fontStyle:'bold'}}],
  ]

  autoTable(doc, {
    startY: y,
    head: [[
      { content:'Description',       styles:{halign:'left'} },
      { content:'Cumulative',        styles:{halign:'right'} },
      { content:'Previously Billed', styles:{halign:'right'} },
      { content:'This Bill',         styles:{halign:'right'} },
    ]],
    body: summaryRows,
    styles:           { fontSize:8, cellPadding:1.8, lineColor:BORDER, lineWidth:0.25 },
    headStyles:       { fillColor:NAVY, textColor:255, fontStyle:'bold', fontSize:8 },
    alternateRowStyles:{ fillColor:LIGHT },
    columnStyles:     { 0:{cellWidth:82}, 1:{halign:'right',cellWidth:34}, 2:{halign:'right',cellWidth:34}, 3:{halign:'right',cellWidth:34} },
    margin:           { left:10, right:10 },
    tableWidth:       190,
    didDrawPage: ({ pageNumber }) => { footer(doc, pw, ph, pageNum++) },
  })
  y = doc.lastAutoTable.finalY

  // Net payable highlight row
  doc.setFillColor(239, 246, 255)
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.25)
  doc.rect(10, y, 190, 8, 'FD')
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...NAVY)
  doc.text('Net Amount Payable  (A − B)', 14, y+5.5)
  doc.text(INR(thisNet), pw-14, y+5.5, { align:'right' })
  y += 13

  // Amount in words
  doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(60,60,60)
  doc.text(`Rupees: ${numToWords(thisNet)}`, 10, y)
  y += 8

  // ── TM Cost/CuM table ────────────────────────────────────────────────
  if (tmWithCum.length > 0) {
    sectionHead(doc, 'Transit Mixer — Cost Analysis', 10, y); y += 5
    const avgFuel = tmWithCum.reduce((s,m)=>s+(parseFloat(m.diesel_qty)/(parseFloat(m.cubic_meter_qty)||1)),0)/tmWithCum.length
    const avgCum  = tmWithCum.reduce((s,m)=>s+parseFloat(m.cost_per_cum||0),0)/tmWithCum.length
    autoTable(doc, {
      startY: y,
      head: [['Reg. No', 'Hire Charges', 'Cubic Metres', 'Cost / M³', 'Diesel (L)', 'Fuel / M³']],
      body: [
        ...tmWithCum.map(m => [
          m.reg_no || m.description,
          INR(m.hire_amount),
          parseFloat(m.cubic_meter_qty).toFixed(2),
          `₹ ${INR(m.cost_per_cum)}`,
          parseFloat(m.diesel_qty).toFixed(2),
          `${(parseFloat(m.diesel_qty)/(parseFloat(m.cubic_meter_qty)||1)).toFixed(2)} L/M³`,
        ]),
        [{ content:'Average', styles:{fontStyle:'bold'} }, '', '',
          { content:`₹ ${INR(avgCum)}`, styles:{fontStyle:'bold'} }, '',
          { content:`${avgFuel.toFixed(2)} L/M³`, styles:{fontStyle:'bold'} }],
      ],
      styles:     { fontSize:8, cellPadding:1.8, lineColor:BORDER, lineWidth:0.25 },
      headStyles: { fillColor:NAVY, textColor:255, fontStyle:'bold', fontSize:8 },
      alternateRowStyles: { fillColor:LIGHT },
      columnStyles: { 1:{halign:'right'}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right'} },
      margin: { left:10, right:10 }, tableWidth:190,
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Utilization table ────────────────────────────────────────────────
  if (nonTmMachines.length > 0) {
    sectionHead(doc, 'Utilization Summary', 10, y); y += 5
    autoTable(doc, {
      startY: y,
      head: [['Machine / Description', 'Working Days', 'Planned / Month', 'Actual Planned', 'Actual Hrs / KMs', 'Util %']],
      body: nonTmMachines.map(m => [
        m.description || m.reg_no,
        m.working_days,
        m.planned_hrs_month ? Number(m.planned_hrs_month).toFixed(2) : '-',
        m.planned_hrs_month ? ((m.planned_hrs_month/(m.cal_days||30))*(m.working_days||0)).toFixed(2) : '-',
        Number(m.actual_hours||m.actual_km||0).toFixed(2),
        m.utilization_pct ? `${Number(m.utilization_pct).toFixed(2)}%` : '-',
      ]),
      styles:     { fontSize:8, cellPadding:1.8, lineColor:BORDER, lineWidth:0.25 },
      headStyles: { fillColor:NAVY, textColor:255, fontStyle:'bold', fontSize:8 },
      alternateRowStyles: { fillColor:LIGHT },
      columnStyles: { 1:{halign:'center'}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right',cellWidth:18} },
      margin: { left:10, right:10 }, tableWidth:190,
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Signatures page 1 ────────────────────────────────────────────────
  y = Math.max(y, ph - 28)
  const sigLabels = ['Prepared by', 'Recommended by', 'Approved by']
  const sigX = [14, pw/2 - 25, pw - 74]
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(60,60,60)
  sigLabels.forEach((s, i) => {
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3)
    doc.line(sigX[i], y, sigX[i]+56, y)
    doc.text(s, sigX[i], y+5)
  })
  footer(doc, pw, ph, pageNum)

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 2 — DETAIL
  // ══════════════════════════════════════════════════════════════════════
  doc.addPage(); pageNum++

  // Header bar page 2
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, pw, 24, 'F')
  doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(255,255,255)
  doc.text('RVR PROJECTS PVT LTD', pw/2, 10, { align:'center' })
  doc.setFontSize(9); doc.setFont('helvetica','normal')
  doc.text(`MACHINE-WISE HIRE CHARGES — ${periodMonth}`, pw/2, 17, { align:'center' })
  y = 32

  // ── Machine-wise detail table ────────────────────────────────────────
  sectionHead(doc, 'B.  Machine-wise Hire Charges', 10, y); y += 5

  const detailBody = []
  hireMachines.forEach((m, i) => {
    const pm = prevMachines.find(p => p.machine_id === m.machine_id && !p.is_mobilization)
    detailBody.push([
      i+1,
      m.reg_no || m.description || '',
      m.unit || 'Month',
      INR(m.monthly_rate),
      pm ? pm.working_days : '-',
      pm ? INR(pm.hire_amount) : '-',
      m.working_days,
      INR(m.hire_amount),
      pm ? (pm.working_days + (m.working_days||0)) : (m.working_days||'-'),
      pm ? INR(parseFloat(pm.hire_amount||0)+parseFloat(m.hire_amount||0)) : INR(m.hire_amount),
      '',
    ])
  })
  mobRows.forEach((m, i) => {
    const pm = prevMachines.find(p => p.is_mobilization)
    const prevQty = pm ? (pm.mob_qty||0) : 0
    detailBody.push([
      hireMachines.length+i+1,
      'Mobilization Charges', "No's",
      INR(m.mob_unit_rate||m.monthly_rate),
      pm ? prevQty : '-',
      pm ? INR(pm.hire_amount) : '-',
      m.mob_qty||1, INR(m.hire_amount),
      pm ? (prevQty+(m.mob_qty||0)) : (m.mob_qty||1), '-', '',
    ])
  })
  detailBody.push([
    { content:'Total  (A) ==>', colSpan:4, styles:{fontStyle:'bold', halign:'right', fillColor:LIGHT} },
    { content:INR(prevBasic), colSpan:2, styles:{fontStyle:'bold', halign:'right', fillColor:LIGHT} },
    { content:INR(thisBasic), colSpan:2, styles:{fontStyle:'bold', halign:'right', fillColor:LIGHT} },
    { content:INR(prevBasic+thisBasic), colSpan:2, styles:{fontStyle:'bold', halign:'right', fillColor:LIGHT} },
    '',
  ])

  autoTable(doc, {
    startY: y,
    head: [
      ['#', 'Description', 'Unit', 'Rate',
        { content:'Previous Bill', colSpan:2, styles:{halign:'center'} },
        { content:'This Bill',     colSpan:2, styles:{halign:'center'} },
        { content:'Cumulative',    colSpan:2, styles:{halign:'center'} },
        'Remarks'],
      ['','','','', 'Days','Amount', 'Days','Amount', 'Days','Amount', ''],
    ],
    body: detailBody,
    styles:     { fontSize:7.5, cellPadding:1.5, lineColor:BORDER, lineWidth:0.25 },
    headStyles: { fillColor:NAVY, textColor:255, fontStyle:'bold', fontSize:7.5 },
    alternateRowStyles: { fillColor:LIGHT },
    columnStyles: {
      0: { cellWidth:8,  halign:'center' },
      1: { cellWidth:30 },
      2: { cellWidth:13, halign:'center' },
      3: { cellWidth:20, halign:'right' },
      4: { cellWidth:13, halign:'center' },
      5: { cellWidth:19, halign:'right' },
      6: { cellWidth:13, halign:'center' },
      7: { cellWidth:19, halign:'right' },
      8: { cellWidth:13, halign:'center' },
      9: { cellWidth:19, halign:'right' },
      10:{ cellWidth:16 },
    },
    margin: { left:10, right:10 }, tableWidth:190,
    didDrawPage: ({ pageNumber }) => { footer(doc, pw, ph, pageNum++) },
  })
  y = doc.lastAutoTable.finalY + 6

  // ── Diesel / Cost analysis ───────────────────────────────────────────
  if (dieselMachines.length > 0) {
    sectionHead(doc, 'C.  Diesel & Cost Analysis', 10, y); y += 5
    autoTable(doc, {
      startY: y,
      head: [['#', 'Machine', 'Hire Charges', 'Diesel Qty (L)', 'Rate (₹/L)', 'Diesel Amount', 'Hire + Diesel', 'M³ Qty', 'Cost / M³']],
      body: dieselMachines.map((m, i) => [
        i+1,
        m.reg_no || m.description,
        INR(m.hire_amount),
        Number(m.diesel_qty).toFixed(2),
        m.diesel_rate ? Number(m.diesel_rate).toFixed(2) : '-',
        m.diesel_amount ? INR(m.diesel_amount) : '-',
        INR(m.total_hire_diesel),
        m.cubic_meter_qty ? Number(m.cubic_meter_qty).toFixed(1) : '-',
        m.cost_per_cum    ? `₹ ${INR(m.cost_per_cum)}` : '-',
      ]),
      styles:     { fontSize:7.5, cellPadding:1.5, lineColor:BORDER, lineWidth:0.25 },
      headStyles: { fillColor:NAVY, textColor:255, fontStyle:'bold', fontSize:7.5 },
      alternateRowStyles: { fillColor:LIGHT },
      columnStyles: {
        0:{cellWidth:8,halign:'center'},
        2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'},
        5:{halign:'right'}, 6:{halign:'right'}, 7:{halign:'right'}, 8:{halign:'right'},
      },
      margin: { left:10, right:10 }, tableWidth:190,
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Utilization page 2 ───────────────────────────────────────────────
  if (nonTmMachines.length > 0) {
    sectionHead(doc, 'D.  Utilization Details', 10, y); y += 5
    autoTable(doc, {
      startY: y,
      head: [['Machine / Description', 'Working Days', 'Planned / Month', 'Actual Planned', 'Actual Hrs / KMs', 'Util %']],
      body: nonTmMachines.map(m => [
        m.description || m.reg_no,
        m.working_days,
        m.planned_hrs_month ? Number(m.planned_hrs_month).toFixed(2) : '-',
        m.planned_hrs_month ? ((m.planned_hrs_month/(m.cal_days||30))*(m.working_days||0)).toFixed(2) : '-',
        Number(m.actual_hours||m.actual_km||0).toFixed(2),
        m.utilization_pct ? `${Number(m.utilization_pct).toFixed(2)}%` : '-',
      ]),
      styles:     { fontSize:7.5, cellPadding:1.5, lineColor:BORDER, lineWidth:0.25 },
      headStyles: { fillColor:NAVY, textColor:255, fontStyle:'bold', fontSize:7.5 },
      alternateRowStyles: { fillColor:LIGHT },
      columnStyles: { 1:{halign:'center'}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right',cellWidth:18} },
      margin: { left:10, right:10 }, tableWidth:190,
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Signatures page 2 ────────────────────────────────────────────────
  y = Math.max(y, ph - 28)
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(60,60,60)
  sigLabels.forEach((s, i) => {
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3)
    doc.line(sigX[i], y, sigX[i]+56, y)
    doc.text(s, sigX[i], y+5)
  })
  footer(doc, pw, ph, pageNum)

  const period = calc.period_from
    ? new Date(calc.period_from).toLocaleString('en-IN', { month:'long', year:'numeric' })
    : 'Bill'
  doc.save(`HireBill_${calc.ra_bill_no || calc.id || 'Draft'}_${period}.pdf`)
}
