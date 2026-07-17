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

// 12-column layout matching the PDF abstract format:
// A(0)=Sr, B(1)=Asset, C(2)=merged-with-B, D(3)=Unit,
// E(4)=Basic Rate, F(5)=Limit, G(6)=Actual, H(7)=Excess,
// I(8)=Unit Rate, J(9)=Amount, K(10)=Util%, L(11)=Remarks
export async function downloadHireBillExcel(data) {
  const xlsxMod = await import('xlsx')
  const XLSX = xlsxMod.default || xlsxMod

  const {
    vendor = '—',
    vendorDetails = {},
    previewMachines = [],
    machineCalcs = [],
    dateFrom, dateTo,
    totalBasic = 0,
    totalBreakdownDays = 0,
    totalBreakdownAmt = 0,
    totalDeductions = 0,
    totalAdditions = 0,
    gstRate = 18,
    gstAmt = 0,
    tdsRate = 2,
    tdsAmt = 0,
    netPayable = 0,
    manualAdditions = [],
    manualDeductions = [],
    raBillNo = '',
    projectCode = '',
    projectName = '',
  } = data

  const woMachine    = previewMachines.find(m => m.wo_number)
  const fuelLabels   = ['a','b','c','d','e','f','g','h','i','j']
  const fuelMachines = previewMachines.filter((m, i) => m.fuel_applicable && machineCalcs[i] && nv(machineCalcs[i].fuelAmt) > 0)

  const rows   = []
  const merges = []
  let   r      = 0

  // Push a 12-element row; extra args ignored, missing cols stay ''
  const R = (...cells) => {
    const row = Array(12).fill('')
    cells.forEach((v, i) => { if (i < 12) row[i] = v })
    rows.push(row)
    return r++
  }

  // ── Title (merged A–L) ────────────────────────────────────────────────────
  R('RVR PROJECTS PVT LTD')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:11} })

  R(`PROJECT: ${projectCode} ${projectName}`)
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:11} })

  R(`HIRE BILL ABSTRACT FOR THE MONTH OF ${fmtMY(dateFrom)}`)
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:11} })

  R(`(Period ${fmtDate(dateFrom)} to ${fmtDate(dateTo)})`)
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:11} })

  // ── Two-column info block (left A–E merged, right F–K merged) ─────────────
  const leftInfo = [
    `Ownership: ${vendor}`,
    `Asset: ${previewMachines.map(m => m.description || m.reg_no).join(', ')}`,
    `GST. No.: ${vendorDetails.gst_no || '—'}`,
    `BANK DETAILS: ${vendorDetails.bank_name || '—'}`,
    `A/C NO: ${vendorDetails.bank_account || '—'}`,
    `IFSC CODE: ${vendorDetails.bank_ifsc || '—'}`,
  ]
  const rightInfo = [
    `RA Bill No : ${raBillNo || '—'}`,
    `RA Bill Date : ${fmtDate(new Date().toISOString().split('T')[0])}`,
    `Project : ${projectCode} ${projectName}`,
    `Bill period : ${fmtDate(dateFrom)} TO ${fmtDate(dateTo)}`,
    `WO No : ${woMachine?.wo_number || '—'}`,
    `WO Date : ${woMachine?.wo_date ? fmtDate(woMachine.wo_date) : '—'}`,
  ]

  for (let i = 0; i < 6; i++) {
    const row = Array(12).fill('')
    row[0] = leftInfo[i]
    row[6] = rightInfo[i]
    rows.push(row)
    merges.push({ s:{r,c:0}, e:{r,c:5} })
    merges.push({ s:{r,c:6}, e:{r,c:11} })
    r++
  }

  // ── Summary label ──────────────────────────────────────────────────────────
  R('Summary')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:11} })

  // ── Table header ──────────────────────────────────────────────────────────
  R('Sr. No', 'Asset', '', 'Unit', 'Basic Rate', 'Limit', 'Actual', 'Excess', 'Unit Rate', 'Amount', 'Util%', 'Remarks')
  merges.push({ s:{r:r-1,c:1}, e:{r:r-1,c:2} })

  // ── Machine rows ──────────────────────────────────────────────────────────
  previewMachines.forEach((mac, idx) => {
    const c        = machineCalcs[idx] || {}
    const hasHrs   = nv(mac.hours_rate) > 0 && nv(c.hoursAmt) > 0
    const hasKm    = nv(mac.km_rate) > 0    && nv(c.kmAmt)    > 0
    const rowCount = 1 + (hasHrs ? 1 : 0) + (hasKm ? 1 : 0)
    const assetName = `${mac.description || mac.reg_no}${mac.eq_type_name ? ' ('+mac.eq_type_name+')' : ''}`
    const mRow = r

    R(
      idx + 1, assetName, '', 'Month',
      `₹${INR(mac.monthly_rate)}`,
      `${c.cDays || 30} Days`,
      `${nv(mac.working_days).toFixed(0)} Days`,
      `${Math.max(0, nv(mac.working_days) - (c.cDays || 30)).toFixed(0)} Days`,
      `₹${INR(c.dailyRate || 0)}`,
      `₹${INR(c.macBasic || mac.hire_amount || 0)}`,
      nv(c.utilPct) > 0 ? `${nv(c.utilPct).toFixed(1)}%` : '—',
      ''
    )

    if (rowCount > 1) {
      merges.push({ s:{r:mRow,c:0}, e:{r:mRow+rowCount-1,c:0} })
      merges.push({ s:{r:mRow,c:1}, e:{r:mRow+rowCount-1,c:2} })
    } else {
      merges.push({ s:{r:mRow,c:1}, e:{r:mRow,c:2} })
    }

    if (hasHrs) {
      R('', '', '', 'Hours',
        `₹${INR(mac.hours_rate)} / Hr`,
        `${nv(c.plannedHrs).toFixed(0)} Hrs`,
        `${nv(mac.actual_hours).toFixed(0)} Hrs`,
        `${nv(c.exHrs).toFixed(0)} Hrs`,
        `₹${INR(mac.hours_rate)}`,
        `₹${INR(c.hoursAmt)}`, '', '')
    }
    if (hasKm) {
      R('', '', '', 'KM',
        `₹${INR(mac.km_rate)} / KM`,
        `${nv(c.plannedKm).toFixed(0)} KM`,
        `${nv(mac.actual_km).toFixed(0)} KM`,
        `${nv(c.exKm).toFixed(0)} KM`,
        `₹${INR(mac.km_rate)}`,
        `₹${INR(c.kmAmt)}`, '', '')
    }
  })

  // ── Total Basic ───────────────────────────────────────────────────────────
  R('Total Basic', '','','','','','','','', `₹${INR(totalBasic)}`, '', '')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:8} })

  // ── Additions ─────────────────────────────────────────────────────────────
  R('Additions')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:11} })

  if (manualAdditions.length === 0) {
    R('1)  —')
    merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:8} })
  } else {
    manualAdditions.forEach((item, i) => {
      R(`${i+1})  ${item.label || ''}`, '','','','','','','','', `₹${INR(item.amount)}`, '', '')
      merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:8} })
    })
  }

  R('Total Additions', '','','','','','','','', `₹${INR(totalAdditions)}`, '', '')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:8} })

  // ── Deductions ────────────────────────────────────────────────────────────
  R('Deductions')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:11} })

  // Sub-header: columns align with table (F=Limit G=Actual H=Excess I=Unit Rate J=Amount)
  R('', '', '', '', '', 'Limit', 'Actual', 'Excess', 'Unit Rate', 'Amount', '', '')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:4} })

  R('1)  Downtime', '', '', '', '', `${totalBreakdownDays} Days`, '', '', '', `₹${INR(totalBreakdownAmt)}`, '', '')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:4} })

  if (fuelMachines.length > 0) {
    R('2)  Fuel Consumption')
    merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:11} })

    fuelMachines.forEach((mac, fi) => {
      const ci    = previewMachines.indexOf(mac)
      const c2    = machineCalcs[ci] || {}
      const isKm  = mac.fuel_performance_type === 'mileage'
      const unit  = isKm ? 'KM/L' : 'L/Hr'
      const appRaw = isKm ? mac.approved_mileage : mac.approved_fuel_consumption
      const appStr = appRaw != null ? `${nv(appRaw).toFixed(2)} ${unit}` : '—'
      const actStr = nv(c2.actualFuelLtrHr) > 0 ? `${nv(c2.actualFuelLtrHr).toFixed(2)} ${unit}` : '—'
      const rtStr  = mac.fuel_deduction_rate != null ? `₹${nv(mac.fuel_deduction_rate).toFixed(2)}/L` : '—'

      R(`    ${fuelLabels[fi]})  ${mac.description || mac.reg_no}`, '', '', '', '',
        appStr, actStr, `${nv(mac.diesel_qty).toFixed(2)} Ltrs`, rtStr,
        `₹${INR(c2.fuelAmt)}`, '', '')
      merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:4} })
    })
  }

  if (manualDeductions.length > 0) {
    const base = fuelMachines.length > 0 ? 3 : 2
    manualDeductions.forEach((item, i) => {
      R(`${base + i})  ${item.label || ''}`, '','','','','','','','', `₹${INR(item.amount)}`, '', '')
      merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:8} })
    })
  }

  R('Total Deductions', '','','','','','','','', `₹${INR(totalDeductions)}`, '', '')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:8} })

  // ── Totals ────────────────────────────────────────────────────────────────
  R(`GST @ ${nv(gstRate)}%`, '','','','','','','','', `₹${INR(gstAmt)}`, '', '')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:8} })

  R(`TDS @ ${nv(tdsRate)}%`, '','','','','','','','', `₹${INR(tdsAmt)}`, '', '')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:8} })

  R('Net Payable (Total Basic + Total Additions + GST - TDS - Total Deductions)', '','','','','','','','', `₹${INR(netPayable)}`, '', '')
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:8} })

  R(`Rupees in words: ${numToWords(netPayable)}`)
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:11} })

  // Footer
  {
    const row = Array(12).fill('')
    row[3] = 'Prepared by'; row[7] = 'Recommended by'; row[10] = 'Approved by'
    rows.push(row); r++
  }

  // ── Build workbook ────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!merges'] = merges
  ws['!cols'] = [
    { wch: 6  }, // A Sr
    { wch: 32 }, // B Asset
    { wch: 4  }, // C merged with B
    { wch: 10 }, // D Unit
    { wch: 20 }, // E Basic Rate
    { wch: 16 }, // F Limit
    { wch: 16 }, // G Actual
    { wch: 16 }, // H Excess
    { wch: 18 }, // I Unit Rate
    { wch: 20 }, // J Amount
    { wch: 12 }, // K Util%
    { wch: 15 }, // L Remarks
  ]
  XLSX.utils.book_append_sheet(wb, ws, '2nd Abstract')

  const safePeriod = (dateFrom || 'period').replace(/-/g, '')
  const safeVendor = (vendor || 'vendor').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
  XLSX.writeFile(wb, `HireBillAbstract_${safeVendor}_${safePeriod}.xlsx`)
}
