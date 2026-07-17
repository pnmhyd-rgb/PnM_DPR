const INR = v => v != null ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
const fmtD = d => {
  if (!d) return '—'
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}-${dt.toLocaleString('en-IN',{month:'short'})}-${dt.getFullYear()}`
}
const n = v => parseFloat(v) || 0

// Draw a filled rect that looks like only top corners are rounded
function topRounded(doc, x, y, w, h, r, color) {
  doc.setFillColor(...color)
  doc.roundedRect(x, y, w, h, r, r, 'F')
  doc.rect(x, y + h - r, w, r, 'F')
}

// Section row (label left, value right) inside a card
function infoRow(doc, x, y, w, label, value, grayColor, darkColor) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...grayColor)
  doc.text(label, x, y)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...darkColor)
  const valStr = String(value ?? '—')
  doc.text(valStr, x + w, y, { align: 'right' })
}

export async function downloadInvoiceCalcPDF(calc) {
  const { jsPDF }              = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW  = doc.internal.pageSize.getWidth()   // 210
  const PH  = doc.internal.pageSize.getHeight()  // 297

  const machine    = (calc.machines || [])[0] || {}
  const manItems   = calc.manual_items || []
  const manAddRows = manItems.filter(x => x.type === 'addition')
  const manDedRows = manItems.filter(x => x.type === 'deduction')

  const basicAmt  = n(calc.basic_amount)
  const gstRate   = n(calc.gst_rate) || 18
  const gstAmt    = n(calc.gst_amount)   || basicAmt * gstRate / 100
  const itRate    = n(calc.income_tax_rate) || 2
  const itAmt     = n(calc.income_tax_amount) || basicAmt * itRate / 100
  const manAddTot = manAddRows.reduce((s, r) => s + n(r.amount), 0)
  const manDedTot = manDedRows.reduce((s, r) => s + n(r.amount), 0)
  const maintDed  = n(machine.maintenance_deduction) || n(calc.maintenance_amount)
  const fuelDed   = n(machine.fuel_deduction) || n(calc.fuel_deduction_amount)
  const totalDed  = maintDed + fuelDed + manDedTot
  const invoiceAmt = basicAmt + manAddTot - totalDed
  const netPayable = n(calc.net_payable) || n(calc.final_total)

  // Palette
  const BLUE   = [30, 71, 160]
  const TEAL   = [0, 148, 155]
  const ORANGE = [230, 110, 0]
  const RED    = [200, 40, 40]
  const DARK   = [18, 22, 42]
  const GRAY   = [100, 116, 139]
  const LGRAY  = [245, 247, 250]
  const BORDER = [210, 215, 222]
  const WHITE  = [255, 255, 255]

  let y = 8

  // ══════════════════════════════════════════════
  // HEADER
  // ══════════════════════════════════════════════

  // Logo block
  doc.setFillColor(...BLUE)
  doc.roundedRect(10, y, 16, 16, 2, 2, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...WHITE)
  doc.text('RVR', 18, y + 7, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5)
  doc.text('■ ■ ■', 18, y + 12, { align: 'center' })

  // Company name
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...BLUE)
  doc.text('RVR PROJECTS', 30, y + 7)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY)
  doc.text('PRIVATE LIMITED', 30, y + 12.5)

  // Right: Invoice Transaction ID + Site Name
  const invoiceTag = calc.invoice_number || calc.ra_bill_no || `#${calc.id}`
  const siteName   = calc.project_name || '—'

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY)
  doc.text('Invoice Transaction ID', PW - 10, y + 4, { align: 'right' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BLUE)
  doc.text(invoiceTag, PW - 10, y + 10, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY)
  doc.text('Site Name', PW - 10, y + 15, { align: 'right' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(30, 30, 30)
  doc.text(siteName, PW - 10, y + 20, { align: 'right' })

  y += 24
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.3)
  doc.line(10, y, PW - 10, y)
  y += 5

  // ══════════════════════════════════════════════
  // TWO-COLUMN: ASSET DETAILS (left) + CALC SUMMARY (right)
  // ══════════════════════════════════════════════

  const CARD_H  = 68
  const LEFT_W  = 92
  const RIGHT_W = PW - LEFT_W - 23
  const LX      = 10
  const RX      = LX + LEFT_W + 5

  // ── Left card background
  doc.setFillColor(...LGRAY)
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.25)
  doc.roundedRect(LX, y, LEFT_W, CARD_H, 2, 2, 'FD')

  // Blue header (top-rounded only)
  topRounded(doc, LX, y, LEFT_W, 8, 2, BLUE)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...WHITE)
  doc.text('ASSET, PERIOD & INVOICE RULE', LX + 4, y + 5.5)

  // Machine name — use description (nickname) or reg_no fallback
  const macName  = machine.description || machine.reg_no || '—'
  const macLines = doc.splitTextToSize(macName, LEFT_W - 8)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...BLUE)
  doc.text(macLines, LX + 4, y + 14)

  // Blue left accent bar
  doc.setFillColor(...BLUE)
  doc.rect(LX + 2, y + 10, 1, CARD_H - 14, 'F')

  let ly = y + 14 + macLines.length * 4.5 + 2

  const assetRows = [
    ['Asset Code',        machine.reg_no           || '—'],
    ['Asset Type',        machine.eq_type_name      || '—'],
    ['Manufacturer',      machine.manufacturer      || '—'],
    ['Asset Model',       machine.asset_model       || '—'],
    ['Current Site',      calc.project_name         || '—'],
    ['Invoice Rule Name', calc.rule_name || calc.rule_number || '—'],
  ]
  assetRows.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY)
    doc.text(lbl, LX + 6, ly)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(25, 25, 25)
    const vLines = doc.splitTextToSize(String(val), LEFT_W - 36)
    doc.text(vLines[0], LX + LEFT_W - 4, ly, { align: 'right' })
    ly += 4.8
  })

  // ── Right card background
  doc.setFillColor(...LGRAY)
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.25)
  doc.roundedRect(RX, y, RIGHT_W, CARD_H, 2, 2, 'FD')

  topRounded(doc, RX, y, RIGHT_W, 8, 2, BLUE)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...WHITE)
  doc.text('CALCULATION SUMMARY', RX + 4, y + 5.5)

  let ry = y + 14
  const calRows = [
    ['Period',             `${fmtD(calc.period_from)} to ${fmtD(calc.period_to)}`],
    ['Basic Rate',         `₹ ${INR(n(machine.monthly_rate))} / ${machine.cal_days || 30}`],
    ['Billable Days',      String(machine.cal_days || 30)],
    ['Basic Days for Rent',String(machine.cal_days || 30)],
    ['Actual Days',        String(machine.working_days || 0)],
  ]
  calRows.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY)
    doc.text(lbl, RX + 4, ry)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(25, 25, 25)
    doc.text(String(val), RX + RIGHT_W - 4, ry, { align: 'right' })
    ry += 5
  })

  // BASIC AMOUNT box inside right card
  const baY = y + CARD_H - 20
  doc.setFillColor(220, 232, 255)
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.4)
  doc.roundedRect(RX + 3, baY, RIGHT_W - 6, 16, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...BLUE)
  doc.text('BASIC AMOUNT', RX + RIGHT_W / 2, baY + 5.5, { align: 'center' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...BLUE)
  doc.text(`₹ ${INR(basicAmt)}`, RX + RIGHT_W / 2, baY + 13, { align: 'center' })

  y += CARD_H + 5

  // ══════════════════════════════════════════════
  // ADDITIONS TABLE
  // ══════════════════════════════════════════════

  topRounded(doc, 10, y, PW - 20, 8, 2, ORANGE)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...WHITE)
  doc.text('⊕  ADDITIONS', 14, y + 5.5)
  y += 8

  const addTableRows = manAddRows.map(r => [
    r.notes || 'Manual Addition', '—', '—', '—', `₹ ${INR(n(r.amount))}`,
  ])
  if (addTableRows.length === 0) addTableRows.push(['—', '0', '0', '0.00', '₹ 0.00'])
  addTableRows.push([
    { content: 'SUB TOTAL (ADDITIONS)', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right', fillColor: [255, 243, 224] } },
    { content: `₹ ${INR(manAddTot)}`, styles: { fontStyle: 'bold', halign: 'right', textColor: ORANGE, fillColor: [255, 243, 224] } },
  ])

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Days', '%', '₹ Per Day', 'Amount']],
    body:  addTableRows,
    styles:     { fontSize: 7.5, cellPadding: 2, lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: [255, 240, 210], textColor: ORANGE, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 82 }, 1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 37, halign: 'right' },
    },
    margin: { left: 10, right: 10 }, tableWidth: PW - 20,
  })
  y = doc.lastAutoTable.finalY + 4

  // ══════════════════════════════════════════════
  // DEDUCTIONS TABLE
  // ══════════════════════════════════════════════

  topRounded(doc, 10, y, PW - 20, 8, 2, RED)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...WHITE)
  doc.text('⊖  DEDUCTIONS', 14, y + 5.5)
  y += 8

  const dedTableRows = []
  if (maintDed > 0) {
    const exDays = n(machine.excess_maintenance_days) || 0
    dedTableRows.push(['Maintenance Deduction', String(exDays), '—', exDays ? `₹ ${INR(maintDed / exDays)}` : '—', `₹ ${INR(maintDed)}`])
  }
  if (fuelDed > 0) {
    dedTableRows.push(['Fuel Consumption', '—', '—', '—', `₹ ${INR(fuelDed)}`])
  }
  manDedRows.forEach(r => {
    dedTableRows.push([r.notes || 'Manual Deduction', '—', '—', '—', `₹ ${INR(n(r.amount))}`])
  })
  if (dedTableRows.length === 0) dedTableRows.push(['—', '0', '0', '0.00', '₹ 0.00'])
  dedTableRows.push([
    { content: 'SUB TOTAL (DEDUCTIONS)', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right', fillColor: [255, 235, 235] } },
    { content: `- ₹ ${INR(totalDed)}`, styles: { fontStyle: 'bold', halign: 'right', textColor: RED, fillColor: [255, 235, 235] } },
  ])

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Days', '%', '₹ Per Day', 'Amount']],
    body:  dedTableRows,
    styles:     { fontSize: 7.5, cellPadding: 2, lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: [255, 232, 232], textColor: RED, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 82 }, 1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 37, halign: 'right' },
    },
    margin: { left: 10, right: 10 }, tableWidth: PW - 20,
  })
  y = doc.lastAutoTable.finalY + 5

  // ══════════════════════════════════════════════
  // INVOICE AMOUNT PANEL + TOTAL AMOUNT
  // ══════════════════════════════════════════════

  const PNL_H  = 42
  const INV_W  = 88
  const RP_W   = PW - 20 - INV_W - 4
  const INV_X  = 10
  const RP_X   = INV_X + INV_W + 4

  // Left: Invoice Amount
  doc.setFillColor(232, 242, 255)
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.4)
  doc.roundedRect(INV_X, y, INV_W, PNL_H, 2, 2, 'FD')
  topRounded(doc, INV_X, y, INV_W, 8, 2, BLUE)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...WHITE)
  doc.text('INVOICE AMOUNT', INV_X + 4, y + 5.5)

  // Big amount
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...TEAL)
  doc.text(`₹ ${INR(invoiceAmt)}`, INV_X + INV_W / 2, y + 19, { align: 'center' })

  // GST row
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2)
  doc.line(INV_X + 4, y + 22, INV_X + INV_W - 4, y + 22)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY)
  doc.text(`GST  F-${gstRate}%`, INV_X + 4, y + 27)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(30, 30, 30)
  doc.text(`₹ ${INR(gstAmt)}`, INV_X + INV_W - 4, y + 27, { align: 'right' })

  // IT row
  doc.line(INV_X + 4, y + 30, INV_X + INV_W - 4, y + 30)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY)
  doc.text(`INCOME TAX  ${itRate}%`, INV_X + 4, y + 35)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...RED)
  doc.text(`₹ ${INR(itAmt)}`, INV_X + INV_W - 4, y + 35, { align: 'right' })

  // Date stamp
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(170, 170, 170)
  doc.text(new Date().toLocaleString('en-IN'), INV_X + 4, y + 40)

  // Right: Manual Addition chip + Notes chip + Total Amount dark box
  const CHIP_W  = RP_W / 2 - 1
  const CHIP_H  = 15

  // Manual Addition chip
  doc.setFillColor(225, 240, 255)
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.2)
  doc.roundedRect(RP_X, y, CHIP_W, CHIP_H, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...BLUE)
  doc.text('MANUAL ADDITION', RP_X + 3, y + 5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20, 20, 20)
  doc.text(`₹ ${INR(manAddTot)}`, RP_X + CHIP_W / 2, y + 12, { align: 'center' })

  // Notes chip
  const NX = RP_X + CHIP_W + 2
  doc.setFillColor(250, 250, 250)
  doc.setDrawColor(...BORDER)
  doc.roundedRect(NX, y, CHIP_W, CHIP_H, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...GRAY)
  doc.text('NOTES', NX + 3, y + 5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(60, 60, 60)
  const noteVal = doc.splitTextToSize(calc.remarks || '—', CHIP_W - 6)
  doc.text(noteVal.slice(0, 2), NX + 3, y + 10)

  // Dark Total Amount box
  const TOTAL_Y = y + CHIP_H + 2
  const TOTAL_H = PNL_H - CHIP_H - 2
  doc.setFillColor(...DARK)
  doc.roundedRect(RP_X, TOTAL_Y, RP_W, TOTAL_H, 2, 2, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(180, 205, 255)
  doc.text('TOTAL AMOUNT', RP_X + RP_W / 2, TOTAL_Y + 6, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(130, 155, 210)
  doc.text('Gross Payable − Income Tax Deduction', RP_X + RP_W / 2, TOTAL_Y + 10.5, { align: 'center' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...TEAL)
  doc.text(`₹ ${INR(netPayable)}`, RP_X + RP_W / 2, TOTAL_Y + 21, { align: 'center' })

  y += PNL_H + 6

  // ══════════════════════════════════════════════
  // DISCLAIMER NOTES
  // ══════════════════════════════════════════════

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY)
  const disc = [
    '⊕ In case the equipment is under breakdown for the whole payroll then breakdown deductions will be equal to the Basic Amount.',
    '⊕ As per the invoice type money will not be deducted against other info.',
  ]
  disc.forEach(line => {
    const wrapped = doc.splitTextToSize(line, PW - 20)
    doc.text(wrapped, 10, y)
    y += wrapped.length * 3.5
  })

  y += 4

  // ══════════════════════════════════════════════
  // SIGNATURES
  // ══════════════════════════════════════════════

  y = Math.max(y, PH - 32)

  const sigLabels = ['Prepared By', 'Recommended By', 'Approved By']
  const sigW      = 55
  const sigGap    = (PW - 20 - sigW * 3) / 2
  const sigXArr   = [10, 10 + sigW + sigGap, 10 + sigW * 2 + sigGap * 2]

  sigXArr.forEach((sx, i) => {
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3)
    doc.line(sx, y, sx + sigW, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...GRAY)
    doc.text(sigLabels[i], sx + sigW / 2, y + 5, { align: 'center' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(160, 160, 160)
    doc.text('Date :', sx, y + 11)
    doc.setDrawColor(200, 200, 200)
    doc.line(sx + 10, y + 11, sx + sigW, y + 11)
  })

  // Footer line
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(190, 190, 190)
  doc.text('RVR Projects Pvt Ltd — Invoice Calculation', 10, PH - 5)
  doc.text(new Date().toLocaleString('en-IN'), PW - 10, PH - 5, { align: 'right' })

  const period = calc.period_from
    ? new Date(calc.period_from).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    : 'Bill'
  doc.save(`InvoiceCalc_${calc.invoice_number || calc.ra_bill_no || calc.id}_${period}.pdf`)
}
