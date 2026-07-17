import { useState, useEffect, useCallback } from 'react'
import { getMachines, getInvoiceRules, getDirectPreview, getInvoiceCalcs, createInvoiceCalc, updateInvoiceCalc, deleteInvoiceCalc, getInvoiceCalc, getNextRaBillNo } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Calculator, X, ChevronDown, RefreshCw, Check, Eye, Trash2, FileText, Plus, SlidersHorizontal, Building2, MapPin, ClipboardList, MoreVertical, Pencil, FileSignature, FileSpreadsheet } from 'lucide-react'
import { downloadHireBillOwnershipPdf } from './hireBillOwnershipPdf'
import { downloadHireBillExcel } from './hireBillExcel'

const today   = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
const fm      = v => v != null ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'
const n       = v => parseFloat(v) || 0

const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
function inWords(num) {
  if (num < 20)     return ONES[num]
  if (num < 100)    return TENS[Math.floor(num/10)] + (num%10 ? ' '+ONES[num%10] : '')
  if (num < 1000)   return ONES[Math.floor(num/100)] + ' Hundred' + (num%100 ? ' '+inWords(num%100) : '')
  if (num < 100000) return inWords(Math.floor(num/1000)) + ' Thousand' + (num%1000 ? ' '+inWords(num%1000) : '')
  if (num < 1e7)    return inWords(Math.floor(num/100000)) + ' Lakh' + (num%100000 ? ' '+inWords(num%100000) : '')
  return inWords(Math.floor(num/1e7)) + ' Crore' + (num%1e7 ? ' '+inWords(num%1e7) : '')
}
const numToWords = amt => { const x = Math.round(Math.abs(amt)); return (x===0?'Zero':inWords(x))+' Only/-' }

const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

function dateRangeForMode(mode) {
  const now = new Date()
  if (mode === 'current') {
    return { from: localISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: localISO(now) }
  }
  if (mode === 'last') {
    return {
      from: localISO(new Date(now.getFullYear(), now.getMonth()-1, 1)),
      to:   localISO(new Date(now.getFullYear(), now.getMonth(), 0)),
    }
  }
  return { from: '', to: '' }
}

function buildAdditions(rule, m) {
  const rows = []
  const plannedHrs = n(m.planned_hrs_month)
  const actualHrs  = n(m.actual_hours)
  const plannedKm  = n(m.planned_km_month)
  const actualKm   = n(m.actual_km)
  if (n(rule.hours_rate) > 0) {
    const excess = Math.max(0, actualHrs - plannedHrs)
    rows.push({ label: 'Working Hours (Hrs)', limit: plannedHrs.toFixed(2), actual: actualHrs.toFixed(2), excess: excess.toFixed(2), rate: n(rule.hours_rate), amount: Math.round(excess * n(rule.hours_rate) * 100) / 100 })
  }
  if (n(rule.km_rate) > 0) {
    const excess = Math.max(0, actualKm - plannedKm)
    rows.push({ label: 'Working KM (km)', limit: plannedKm.toFixed(2), actual: actualKm.toFixed(2), excess: excess.toFixed(2), rate: n(rule.km_rate), amount: Math.round(excess * n(rule.km_rate) * 100) / 100 })
  }
  if (m.cubic_meter_qty > 0) {
    rows.push({ label: 'Cubic Meters (M³)', limit: '—', actual: n(m.cubic_meter_qty).toFixed(2), excess: '—', rate: 0, amount: 0 })
  }
  return rows
}

function buildDeductions(rule, m) {
  const rows = []
  if (m.maintenance_applicable) {
    rows.push({ label: 'Maintenance / Breakdown Days', limit: n(m.allowed_maintenance_days).toFixed(0), actual: n(m.breakdown_days).toFixed(0), excess: n(m.excess_maintenance_days).toFixed(0), rate: n(rule.maintenance_excess_rate||0), amount: n(m.maintenance_deduction) })
  }
  if (m.fuel_applicable) {
    const ftype = m.fuel_performance_type || rule.fuel_performance_type || 'economy'
    const dieselActual = n(m.diesel_qty)
    if (ftype === 'consumption') {
      const allowed = n(m.actual_hours) * n(m.approved_fuel_consumption || rule.approved_fuel_consumption)
      rows.push({ label: 'Fuel Consumption (L/Hr)', limit: allowed.toFixed(2), actual: dieselActual.toFixed(2), excess: Math.max(0, dieselActual - allowed).toFixed(2), rate: n(m.fuel_deduction_rate), amount: n(m.fuel_deduction) })
    } else {
      const mileage = n(m.approved_mileage || rule.approved_mileage)
      const allowed = mileage > 0 ? n(m.actual_km) / mileage : 0
      rows.push({ label: 'Fuel Economy (KM/L)', limit: allowed.toFixed(2), actual: dieselActual.toFixed(2), excess: Math.max(0, dieselActual - allowed).toFixed(2), rate: n(m.fuel_deduction_rate), amount: n(m.fuel_deduction) })
    }
  }
  return rows
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// ── Download helpers ──────────────────────────────────────────────────────────
function augMac(mac) {
  const nv = v => parseFloat(v) || 0
  return {
    ...mac,
    hours_rate: 0, km_rate: 0, planned_km_month: 0,
    fuel_applicable: nv(mac.fuel_deduction) > 0,
    fuel_performance_type: 'consumption',
    approved_fuel_consumption: null, approved_mileage: null, fuel_deduction_rate: null,
  }
}
function calcStore(mac) {
  const nv = v => parseFloat(v) || 0
  const cDays = nv(mac.cal_days) || 30
  return {
    cDays,
    dailyRate: cDays > 0 ? nv(mac.monthly_rate) / cDays : 0,
    macBasic: nv(mac.hire_amount),
    plannedHrs: nv(mac.planned_hrs_month),
    exHrs: 0, hoursAmt: 0, plannedKm: 0, exKm: 0, kmAmt: 0,
    fuelAmt: nv(mac.fuel_deduction),
    actualFuelLtrHr: nv(mac.actual_hours) > 0 ? nv(mac.diesel_qty)/nv(mac.actual_hours) : 0,
    utilPct: nv(mac.utilization_pct),
  }
}
function buildBillDownloadData(calc) {
  const nv = v => parseFloat(v) || 0
  const machines  = (calc.machines || []).map(augMac)
  const machCalcs = machines.map(calcStore)
  const totalBrkAmt  = machines.reduce((s,m) => s+nv(m.maintenance_deduction), 0) || nv(calc.maintenance_amount)
  const totalFuelAmt = machines.reduce((s,m) => s+nv(m.fuel_deduction), 0) || nv(calc.fuel_deduction_amount)
  const manItems  = calc.manual_items || []
  const manAdd    = manItems.filter(x => x.type === 'addition')
  const manDed    = manItems.filter(x => x.type === 'deduction')
  const manAddTotal = manAdd.reduce((s,x) => s+nv(x.amount), 0)
  const manDedTotal = manDed.reduce((s,x) => s+nv(x.amount), 0)
  return {
    vendor: calc.display_owner_name || '—',
    vendorDetails: { gst_no: calc.manual_gst_no||'', bank_name: calc.manual_bank_name||'', bank_account: calc.manual_bank_account||'', bank_ifsc: calc.manual_bank_ifsc||'' },
    previewMachines: machines, machineCalcs: machCalcs,
    dateFrom: calc.period_from?.split('T')[0]||'', dateTo: calc.period_to?.split('T')[0]||'',
    totalBasic: nv(calc.basic_amount),
    totalBreakdownDays: machines.reduce((s,m) => s+nv(m.breakdown_days), 0),
    totalBreakdownAmt: totalBrkAmt, totalFuelAmt,
    totalDeductions: totalBrkAmt + totalFuelAmt + manDedTotal,
    totalAdditions: manAddTotal,
    gstRate: nv(calc.gst_rate)||18, gstAmt: nv(calc.gst_amount),
    tdsRate: nv(calc.income_tax_rate)||2, tdsAmt: nv(calc.income_tax_amount),
    netPayable: nv(calc.net_payable)||nv(calc.final_total),
    manualAdditions: manAdd.map(x => ({ label: x.notes||'', amount: x.amount })),
    manualDeductions: manDed.map(x => ({ label: x.notes||'', amount: x.amount })),
    projectCode: calc.project_code||'', projectName: calc.project_name||'',
    raBillNo: calc.ra_bill_no||'',
  }
}

// ── REPORT VIEW ───────────────────────────────────────────────────────────────
function ReportView({ reportData, dateFrom, dateTo, ruleId, onReset, onSaved }) {
  const rule     = reportData.rule
  const machines = reportData.machines
  const [activeIdx, setActiveIdx] = useState(0)
  const m = machines[activeIdx] || machines[0]

  const [manualAdd, setManualAdd] = useState([])
  const [manualDed, setManualDed] = useState([])
  const [addRow,    setAddRow]    = useState({ purpose:'', amount:'' })
  const [dedRow,    setDedRow]    = useState({ purpose:'', amount:'' })
  const [saving,    setSaving]    = useState(false)
  const [saveErr,   setSaveErr]   = useState('')
  const [billForm,  setBillForm]  = useState({ ra_bill_no:'', invoice_number:'', invoice_date:today(), remarks:'', gst_rate:'18', income_tax_rate:'2', diesel_rate:'' })

  const initWo = mac => ({
    wo_number:  mac.wo_number  || '',
    wo_date:    mac.wo_date    ? (mac.wo_date+'').split('T')[0] : '',
    owner_name: mac.wo_vendor_name || mac.machine_vendor || '',
    ownership:  mac.ownership  || 'Hire',
    auto:       !!mac.wo_number,
  })
  const [woInfo, setWoInfo] = useState(() => initWo(m))
  useEffect(() => { setWoInfo(initWo(m)) }, [activeIdx])

  const allMachineBaseTotal = machines.reduce((sum, mac) => {
    const macAdd = buildAdditions(rule, mac)
    const macDed = buildDeductions(rule, mac)
    return sum + n(mac.hire_amount) + macAdd.reduce((s,r) => s + n(r.amount), 0) - macDed.reduce((s,r) => s + n(r.amount), 0)
  }, 0)
  const manualAddTotal = manualAdd.reduce((s,r) => s + n(r.amount), 0)
  const manualDedTotal = manualDed.reduce((s,r) => s + n(r.amount), 0)
  const totalAmt = allMachineBaseTotal + manualAddTotal - manualDedTotal

  const addManualAdd = () => {
    if (!addRow.purpose || !addRow.amount) return
    setManualAdd(p => [...p, { ...addRow, amount: n(addRow.amount) }])
    setAddRow({ purpose:'', amount:'' })
  }
  const addManualDed = () => {
    if (!dedRow.purpose || !dedRow.amount) return
    setManualDed(p => [...p, { ...dedRow, amount: n(dedRow.amount) }])
    setDedRow({ purpose:'', amount:'' })
  }

  const buildSavePayload = () => {
    const gstAmt   = totalAmt * n(billForm.gst_rate) / 100
    const grossPay = totalAmt + gstAmt
    const itAmt    = totalAmt * n(billForm.income_tax_rate) / 100
    const netPay   = grossPay - itAmt
    return {
      period_from:         dateFrom,
      period_to:           dateTo,
      rule_id:             (ruleId || machines[0]?.rule_id) || null,
      display_wo_number:   woInfo.wo_number  || null,
      display_wo_date:     woInfo.wo_date    || null,
      display_owner_name:  woInfo.owner_name || null,
      display_ownership:   woInfo.ownership  || null,
      invoice_date:        billForm.invoice_date,
      invoice_number:      billForm.invoice_number,
      ra_bill_no:          billForm.ra_bill_no,
      remarks:             billForm.remarks,
      status:              'final',
      gst_rate:            billForm.gst_rate,
      gst_amount:          gstAmt,
      gross_payable:       grossPay,
      income_tax_rate:     billForm.income_tax_rate,
      income_tax_amount:   itAmt,
      maintenance_amount:  machines.reduce((s,mac) => s + buildDeductions(rule,mac).filter(r=>r.label.includes('Maint')).reduce((s2,r)=>s2+n(r.amount),0), 0),
      stores_amount:       0,
      advance_amount:      0,
      fuel_deduction_amount: machines.reduce((s,mac) => s + buildDeductions(rule,mac).filter(r=>r.label.includes('Fuel')).reduce((s2,r)=>s2+n(r.amount),0), 0),
      total_recoveries:    itAmt,
      net_payable:         netPay,
      diesel_rate:         n(billForm.diesel_rate),
      basic_amount:        machines.reduce((s,mac) => s + n(mac.hire_amount), 0),
      final_total:         netPay,
      machines: machines.map(mac => ({
        machine_id: mac.machine_id, reg_no: mac.reg_no||'', description: mac.description||'',
        unit: 'Month', monthly_rate: mac.monthly_rate, cal_days: mac.cal_days,
        working_days: mac.working_days, hire_amount: mac.hire_amount,
        diesel_qty: mac.diesel_qty, diesel_rate: n(billForm.diesel_rate),
        diesel_amount: n(mac.diesel_qty) * n(billForm.diesel_rate),
        total_hire_diesel: n(mac.hire_amount) + n(mac.diesel_qty)*n(billForm.diesel_rate),
        cubic_meter_qty: mac.cubic_meter_qty, cost_per_cum: mac.cost_per_cum,
        actual_hours: mac.actual_hours, actual_km: mac.actual_km,
        planned_hrs_month: mac.planned_hrs_month, utilization_pct: mac.utilization_pct,
        is_tm: mac.is_tm || false, is_mobilization: false, mob_qty: 1, mob_unit_rate: 0,
        breakdown_days: mac.breakdown_days, allowed_maintenance_days: mac.allowed_maintenance_days,
        excess_maintenance_days: mac.excess_maintenance_days,
        maintenance_deduction: mac.maintenance_deduction, fuel_deduction: mac.fuel_deduction,
      })),
      manual_items: [
        ...manualAdd.map(r => ({ type:'addition', notes:r.purpose, amount:r.amount })),
        ...manualDed.map(r => ({ type:'deduction', notes:r.purpose, amount:r.amount })),
      ],
    }
  }

  const handleSave = async () => {
    setSaving(true); setSaveErr('')
    try { await createInvoiceCalc(buildSavePayload()); onSaved() }
    catch (e) { setSaveErr(e.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">

      {/* Top action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-900">Invoice Calculation</h2>
          <p className="text-xs text-gray-400">{fmtDate(dateFrom)} — {fmtDate(dateTo)} · {machines.length > 1 ? `${machines.length} machines` : `${rule.rule_number} · ${rule.rule_name}`}</p>
        </div>
        <button onClick={onReset} className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
          <SlidersHorizontal size={13}/> Change Filter
        </button>
      </div>

      {/* Machine tabs + combined summary (multiple mode) */}
      {machines.length > 1 && (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {machines.map((mac, i) => (
              <button key={i} onClick={() => setActiveIdx(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${activeIdx===i ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {mac.reg_no || mac.description}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-indigo-50">
              <ClipboardList size={13} className="text-indigo-700"/>
              <span className="text-xs font-bold text-indigo-800 uppercase tracking-wide">All Machines — Combined Summary</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-indigo-700 text-white">
                    <th className="px-3 py-2 text-left font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Asset</th>
                    <th className="px-3 py-2 text-left font-semibold">Rule</th>
                    <th className="px-3 py-2 text-right font-semibold">Working Days</th>
                    <th className="px-3 py-2 text-right font-semibold">Hire Amount</th>
                    <th className="px-3 py-2 text-right font-semibold">Maint. Ded.</th>
                    <th className="px-3 py-2 text-right font-semibold">Fuel Ded.</th>
                    <th className="px-3 py-2 text-right font-semibold">Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((mac, i) => {
                    const macDed = buildDeductions(rule, mac)
                    const macAdd = buildAdditions(rule, mac)
                    const maintD = macDed.filter(r=>r.label.includes('Maint')).reduce((s,r)=>s+n(r.amount),0)
                    const fuelD  = macDed.filter(r=>r.label.includes('Fuel')).reduce((s,r)=>s+n(r.amount),0)
                    const netAmt = n(mac.hire_amount) + macAdd.reduce((s,r)=>s+n(r.amount),0) - maintD - fuelD
                    return (
                      <tr key={i} onClick={() => setActiveIdx(i)}
                        className={`cursor-pointer border-b border-gray-100 hover:bg-indigo-50 ${activeIdx===i ? 'bg-indigo-50' : ''}`}>
                        <td className="px-3 py-2 text-gray-500">{i+1}</td>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-gray-800">{mac.description || mac.reg_no}</p>
                          <p className="text-gray-400">{mac.reg_no}</p>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{mac.rule_number||rule.rule_number} · {mac.rule_name||rule.rule_name}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{n(mac.working_days).toFixed(0)} / {n(mac.cal_days).toFixed(0)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-800">{fm(n(mac.hire_amount))}</td>
                        <td className="px-3 py-2 text-right text-red-600">{maintD > 0 ? `- ${fm(maintD)}` : '—'}</td>
                        <td className="px-3 py-2 text-right text-red-600">{fuelD > 0 ? `- ${fm(fuelD)}` : '—'}</td>
                        <td className="px-3 py-2 text-right font-bold text-indigo-700">{fm(netAmt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-bold border-t-2 border-indigo-200">
                    <td className="px-3 py-2" colSpan={4}>Total ({machines.length} machines)</td>
                    <td className="px-3 py-2 text-right">{fm(machines.reduce((s,mac)=>s+n(mac.hire_amount),0))}</td>
                    <td className="px-3 py-2 text-right text-red-600">- {fm(machines.reduce((s,mac)=>s+buildDeductions(rule,mac).filter(r=>r.label.includes('Maint')).reduce((s2,r)=>s2+n(r.amount),0),0))}</td>
                    <td className="px-3 py-2 text-right text-red-600">- {fm(machines.reduce((s,mac)=>s+buildDeductions(rule,mac).filter(r=>r.label.includes('Fuel')).reduce((s2,r)=>s2+n(r.amount),0),0))}</td>
                    <td className="px-3 py-2 text-right text-indigo-800 text-sm">{fm(allMachineBaseTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Asset Period & Invoice Rule */}
      <div className="bg-white rounded-xl border-l-4 border-l-green-500 border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-green-50 rounded-tl-xl rounded-tr-xl">
          <ClipboardList size={14} className="text-green-700"/>
          <span className="text-xs font-bold text-green-800 uppercase tracking-wide">Asset Period &amp; Invoice Rule</span>
        </div>
        <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
          <div className="px-5 py-4 space-y-2.5">
            <InfoRow icon={<Building2 size={13} className="text-gray-400"/>} label="Asset Name" value={m.description || m.reg_no} />
            <InfoRow icon={null} label="Asset ID"   value={m.reg_no} />
            <InfoRow icon={null} label="Asset Type" value={m.eq_type_name || '—'} />
          </div>
          <div className="px-5 py-4 space-y-2.5">
            <InfoRow icon={<MapPin size={13} className="text-gray-400"/>} label="Invoice Rule" value={`${m.rule_number||rule.rule_number} · ${m.rule_name||rule.rule_name}`} />
            <InfoRow icon={null} label="Monthly Rate" value={`₹ ${Number(m.monthly_rate||0).toLocaleString('en-IN',{minimumFractionDigits:2})}`} />
            <InfoRow icon={null} label="Period"       value={`${fmtDate(dateFrom)} to ${fmtDate(dateTo)}`} />
          </div>
        </div>
      </div>

      {/* Work Order Details */}
      <div className="bg-white rounded-xl border-l-4 border-l-blue-500 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-blue-50 rounded-tl-xl rounded-tr-xl">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-blue-700"/>
            <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">Work Order Details</span>
          </div>
          {woInfo.auto && <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Auto-fetched</span>}
          {!woInfo.auto && <span className="text-[10px] bg-yellow-100 text-yellow-700 font-semibold px-2 py-0.5 rounded-full">Manual Entry</span>}
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">Own / Hire</p>
              <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold ${woInfo.ownership==='Own'?'bg-green-100 text-green-800':'bg-blue-100 text-blue-800'}`}>
                {woInfo.ownership || 'Hire'}
              </span>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">Owner Name</p>
              {woInfo.auto ? (
                <p className="text-sm font-semibold text-gray-800">{woInfo.owner_name || '—'}</p>
              ) : (
                <input className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter owner name" value={woInfo.owner_name}
                  onChange={e => setWoInfo(p => ({ ...p, owner_name: e.target.value }))} />
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">Work Order No.</p>
              {woInfo.auto ? (
                <p className="text-sm font-semibold text-blue-700">{woInfo.wo_number}</p>
              ) : (
                <input className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter WO number" value={woInfo.wo_number}
                  onChange={e => setWoInfo(p => ({ ...p, wo_number: e.target.value }))} />
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">Work Order Date</p>
              {woInfo.auto ? (
                <p className="text-sm font-semibold text-gray-800">{fmtDate(woInfo.wo_date)}</p>
              ) : (
                <input type="date" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={woInfo.wo_date} onChange={e => setWoInfo(p => ({ ...p, wo_date: e.target.value }))} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Calculation Summary / Save Bill */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-green-700">
          <Check size={14} className="text-white"/>
          <span className="text-xs font-bold text-white uppercase tracking-wide">Save Bill</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">RA Bill No <span className="text-gray-400">(auto)</span></label>
              <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500 italic">e.g. RA01, RA02…</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Number <span className="text-gray-400">(auto)</span></label>
              <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500 italic">e.g. Inv-01, Inv-02…</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Date <span className="text-gray-400">(fixed)</span></label>
              <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 font-medium">{fmtDate(billForm.invoice_date)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">GST Rate (%)</label>
              <input type="number" className={inp} value={billForm.gst_rate} onChange={e=>setBillForm(f=>({...f,gst_rate:e.target.value}))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Income Tax (%)</label>
              <input type="number" className={inp} value={billForm.income_tax_rate} onChange={e=>setBillForm(f=>({...f,income_tax_rate:e.target.value}))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
            <textarea className={inp} rows={2} value={billForm.remarks} onChange={e=>setBillForm(f=>({...f,remarks:e.target.value}))} />
          </div>
          <div className="bg-blue-50 rounded-lg p-4 grid grid-cols-5 gap-2 text-xs">
            <div className="text-center"><p className="text-gray-500 mb-0.5">Total Amount</p><p className="font-bold text-gray-900">{fm(totalAmt)}</p></div>
            <div className="text-center"><p className="text-gray-500 mb-0.5">GST @ {billForm.gst_rate}%</p><p className="font-semibold text-gray-700">{fm(totalAmt*n(billForm.gst_rate)/100)}</p></div>
            <div className="text-center"><p className="text-gray-500 mb-0.5">Gross Payable</p><p className="font-bold text-blue-900">{fm(totalAmt+totalAmt*n(billForm.gst_rate)/100)}</p></div>
            <div className="text-center"><p className="text-gray-500 mb-0.5">Income Tax @ {billForm.income_tax_rate}%</p><p className="font-semibold text-red-600">- {fm(totalAmt*n(billForm.income_tax_rate)/100)}</p></div>
            <div className="text-center bg-green-100 rounded-lg px-2 py-1"><p className="text-green-700 mb-0.5 font-medium">Net Payable</p><p className="font-bold text-green-900 text-sm">{fm(totalAmt+totalAmt*n(billForm.gst_rate)/100-totalAmt*n(billForm.income_tax_rate)/100)}</p></div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="w-full py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl">
            {saving ? 'Saving…' : 'Save Invoice'}
          </button>
          {saveErr && <p className="text-red-600 text-xs">{saveErr}</p>}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-gray-800">{value || '—'}</p>
      </div>
    </div>
  )
}
function SumRow({ label, value }) {
  return (
    <>
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-semibold text-gray-800 text-right">{value}</span>
    </>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function InvoiceCalculation() {
  const { isAdmin } = useAuth()

  const [reportType,       setReportType]       = useState('single')
  const [assetSearch,      setAssetSearch]       = useState('')
  const [assetOpen,        setAssetOpen]         = useState(false)
  const [selectedMachines, setSelectedMachines]  = useState([])
  const [selectedRuleId,   setSelectedRuleId]    = useState('')
  const [perMachineRules,  setPerMachineRules]   = useState({})
  const [dateRangeMode,    setDateRangeMode]     = useState('')
  const [dateFrom,         setDateFrom]          = useState('')
  const [dateTo,           setDateTo]            = useState('')
  const [allMachines,      setAllMachines]       = useState([])
  const [invoiceRules,     setInvoiceRules]      = useState([])
  const [fetching,         setFetching]          = useState(false)
  const [reportData,       setReportData]        = useState(null)
  const [filterError,      setFilterError]       = useState('')
  const [savedBills,       setSavedBills]        = useState([])
  const [loadingBills,     setLoadingBills]      = useState(false)
  const [showBills,        setShowBills]         = useState(false)
  const [viewData,         setViewData]          = useState(null)
  const [editData,         setEditData]          = useState(null)
  const [delId,            setDelId]             = useState(null)
  const [menuOpenId,       setMenuOpenId]        = useState(null)
  const [pdfLoadingId,     setPdfLoadingId]      = useState(null)
  const [xlsLoadingId,     setXlsLoadingId]      = useState(null)

  useEffect(() => {
    getMachines().then(r => setAllMachines(r.data.data || [])).catch(() => {})
    getInvoiceRules().then(r => setInvoiceRules(r.data.data || [])).catch(() => {})
  }, [])

  const loadBills = useCallback(async () => {
    setLoadingBills(true)
    try { const r = await getInvoiceCalcs(); setSavedBills(r.data.data || []) }
    catch {} finally { setLoadingBills(false) }
  }, [])
  useEffect(() => { loadBills() }, [loadBills])

  const handleDateModeChange = val => {
    setDateRangeMode(val)
    const { from, to } = dateRangeForMode(val)
    setDateFrom(from); setDateTo(to)
  }

  const filteredMachines = assetSearch.trim()
    ? allMachines.filter(m => [m.slno, m.nickname, m.eq_type_name||m.eq_type, m.manufacturer].some(v => (v||'').toLowerCase().includes(assetSearch.toLowerCase())))
    : allMachines.slice(0, 50)

  const toggleMachine = m => {
    if (reportType === 'single') { setSelectedMachines([m]); setAssetOpen(false); setAssetSearch('') }
    else { setSelectedMachines(p => p.find(x=>x.id===m.id) ? p.filter(x=>x.id!==m.id) : [...p,m]) }
  }

  const showReport = async () => {
    if (!selectedMachines.length) { setFilterError('Please select an asset'); return }
    if (!dateFrom || !dateTo) { setFilterError('Please select a date range'); return }
    setFetching(true); setFilterError('')
    try {
      const r = await getDirectPreview({
        machineIds: selectedMachines.map(m => m.id),
        ruleId: selectedRuleId || null,
        perMachineRules,
        dateFrom, dateTo,
      })
      setReportData(r.data.data)
    } catch (e) { setFilterError(e.response?.data?.error || 'Failed to fetch') }
    finally { setFetching(false) }
  }

  const openView = async id => {
    try { const r = await getInvoiceCalc(id); setViewData(r.data.data) } catch {}
  }
  const openEdit = async id => {
    try { const r = await getInvoiceCalc(id); setEditData(r.data.data) } catch {}
  }
  const handleDel = async () => {
    try { await deleteInvoiceCalc(delId); setDelId(null); loadBills() }
    catch (e) { alert(e.response?.data?.error||'Failed') }
  }
  const handleMenuPdf = async id => {
    setPdfLoadingId(id)
    try { const r = await getInvoiceCalc(id); await downloadHireBillOwnershipPdf(buildBillDownloadData(r.data.data)) }
    catch (e) { alert('PDF error: ' + e.message) }
    finally { setPdfLoadingId(null) }
  }
  const handleMenuExcel = async id => {
    setXlsLoadingId(id)
    try { const r = await getInvoiceCalc(id); await downloadHireBillExcel(buildBillDownloadData(r.data.data)) }
    catch (e) { alert('Excel error: ' + e.message) }
    finally { setXlsLoadingId(null) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 p-6">
      <div className="max-w-5xl mx-auto">

        {reportData ? (
          <ReportView
            reportData={reportData}
            dateFrom={dateFrom}
            dateTo={dateTo}
            ruleId={selectedRuleId}
            onReset={() => setReportData(null)}
            onSaved={() => { setReportData(null); loadBills(); setShowBills(true) }}
          />
        ) : (
          <>
            {/* Page header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow">
                  <Calculator size={20} className="text-white"/>
                </div>
                <h1 className="text-xl font-bold text-gray-900">Invoice Calculation</h1>
              </div>
              <button onClick={() => setShowBills(s=>!s)}
                className="flex items-center gap-2 text-sm text-blue-700 border border-blue-300 bg-white px-3 py-1.5 rounded-lg hover:bg-blue-50 shadow-sm font-medium">
                <Eye size={14}/> {showBills?'Hide':'View'} Saved Bills ({savedBills.length})
              </button>
            </div>

            {/* Filter card */}
            <div className="max-w-2xl mx-auto">
              <div className="bg-white border border-gray-100 rounded-2xl shadow-lg p-6 mb-6">

                {/* Report Type */}
                <div className="flex items-center gap-4 mb-5 pb-5 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <FileSignature size={15} className="text-blue-600"/>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-28 shrink-0">Report Type <span className="text-red-500">*</span></span>
                  <div className="flex items-center gap-6">
                    {[['single','Single Asset'],['multiple','Multiple Asset']].map(([val,label]) => (
                      <label key={val} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="reportType" value={val} checked={reportType===val}
                          onChange={() => { setReportType(val); setSelectedMachines([]); setPerMachineRules({}); setReportData(null) }}
                          className="accent-blue-600 w-4 h-4" />
                        <span className="text-sm text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Asset */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0 mt-1">
                    <Building2 size={15} className="text-purple-600"/>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-28 shrink-0 pt-2">Asset <span className="text-red-500">*</span></span>
                  <div className="flex-1 relative">
                    {reportType==='multiple' && selectedMachines.length>0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {selectedMachines.map(m => (
                          <span key={m.id} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full">
                            {m.slno}{m.nickname?` — ${m.nickname}`:''}
                            <button onClick={()=>setSelectedMachines(p=>p.filter(x=>x.id!==m.id))}><X size={11}/></button>
                          </span>
                        ))}
                      </div>
                    )}
                    {reportType==='single' && selectedMachines.length>0 ? (
                      <div className="flex items-center gap-2 border border-blue-300 bg-blue-50 rounded-xl px-3 py-2.5">
                        <span className="flex-1 text-sm text-blue-900 font-medium">
                          {selectedMachines[0].slno}{selectedMachines[0].nickname?` — ${selectedMachines[0].nickname}`:''}
                          {selectedMachines[0].eq_type_name?` (${selectedMachines[0].eq_type_name})`:''}
                        </span>
                        <button onClick={()=>setSelectedMachines([])} className="text-blue-400 hover:text-blue-700"><X size={14}/></button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-gray-50 focus-within:bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                          <input className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent placeholder-gray-400"
                            placeholder="Search Asset by Name, Code, Asset Type & Manufacturer"
                            value={assetSearch} onFocus={()=>setAssetOpen(true)}
                            onChange={e=>{setAssetSearch(e.target.value);setAssetOpen(true)}}
                            onBlur={()=>setTimeout(()=>setAssetOpen(false),150)} />
                        </div>
                        {assetOpen && (
                          <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-10 max-h-64 overflow-y-auto mt-1">
                            {filteredMachines.map(m => (
                              <button key={m.id} onClick={()=>toggleMachine(m)}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0">
                                <p className="font-semibold text-gray-800">{m.slno}{m.nickname ? ` — ${m.nickname}` : ''}</p>
                                <p className="text-xs text-gray-400">{m.eq_type_name || m.eq_type || '—'} · {m.manufacturer || '—'}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Per-machine invoice rule assignment (multiple mode) */}
                    {reportType === 'multiple' && selectedMachines.length > 0 && (
                      <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Asset</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Invoice Rule</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Rate/Day</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedMachines.map(mac => {
                              const assignedRule = invoiceRules.find(r => r.id === parseInt(perMachineRules[mac.id]))
                              return (
                                <tr key={mac.id} className="border-t border-gray-100">
                                  <td className="px-3 py-2.5">
                                    <p className="font-semibold text-gray-800">{mac.slno}</p>
                                    <p className="text-[10px] text-gray-400">{mac.nickname || mac.eq_type_name || '—'}</p>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="relative">
                                      <select
                                        className="w-full border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-xs pr-7 appearance-none focus:outline-none focus:border-teal-400"
                                        value={perMachineRules[mac.id]||''}
                                        onChange={e=>setPerMachineRules(p=>({...p,[mac.id]:e.target.value}))}>
                                        <option value="">Select Rule</option>
                                        {invoiceRules.map(r=>(
                                          <option key={r.id} value={r.id}>{r.rule_number} · {r.rule_name}</option>
                                        ))}
                                      </select>
                                      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    {assignedRule ? (
                                      <span className="text-xs font-semibold text-green-700">
                                        ₹{(parseFloat(assignedRule.basic_rate)/parseInt(assignedRule.days)).toLocaleString('en-IN',{minimumFractionDigits:2})}/day
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-300">—</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {Object.keys(perMachineRules).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedMachines.filter(m => perMachineRules[m.id]).map(mac => {
                          const r = invoiceRules.find(r => r.id === parseInt(perMachineRules[mac.id]))
                          return r ? (
                            <span key={mac.id} className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                              {mac.slno}: {r.rule_number}
                            </span>
                          ) : null
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Invoice Rule (single mode) */}
                {reportType === 'single' && (
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0 mt-1">
                      <ClipboardList size={15} className="text-teal-600"/>
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-28 shrink-0 pt-2">Invoice Rule</span>
                    <div className="flex-1 relative">
                      <select className="w-full border border-gray-200 bg-gray-50 rounded-xl px-3 py-2.5 text-sm pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 focus:bg-white"
                        value={selectedRuleId} onChange={e => setSelectedRuleId(e.target.value)}>
                        <option value="">Use machine's assigned rule</option>
                        {invoiceRules.map(r => <option key={r.id} value={r.id}>{r.rule_number} · {r.rule_name}</option>)}
                      </select>
                      <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                    </div>
                  </div>
                )}

                {/* Date Range */}
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 mt-1">
                    <MapPin size={15} className="text-orange-500"/>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-28 shrink-0 pt-2">Date Range <span className="text-red-500">*</span></span>
                  <div className="flex-1 space-y-2">
                    <div className="relative">
                      <select className="w-full border border-gray-200 bg-gray-50 rounded-xl px-3 py-2.5 text-sm pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 focus:bg-white"
                        value={dateRangeMode} onChange={e=>handleDateModeChange(e.target.value)}>
                        <option value="">Select Range</option>
                        <option value="last">Last Month</option>
                        <option value="current">Current Month</option>
                        <option value="custom">Custom Range</option>
                      </select>
                      <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                    </div>
                    {dateRangeMode === 'custom' && (
                      <div className="flex items-center gap-2">
                        <input type="date" className="flex-1 border border-gray-200 bg-gray-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                          value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
                        <span className="text-gray-400 text-xs shrink-0">to</span>
                        <input type="date" className="flex-1 border border-gray-200 bg-gray-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                          value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
                      </div>
                    )}
                    {dateRangeMode && dateRangeMode !== 'custom' && dateFrom && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <Check size={11}/> {fmtDate(dateFrom)} — {fmtDate(dateTo)}
                      </p>
                    )}
                  </div>
                </div>

                {filterError && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{filterError}</div>}

                <div className="flex justify-end">
                  <button onClick={showReport} disabled={fetching}
                    className="flex items-center gap-2 px-8 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm shadow-lg shadow-teal-200">
                    {fetching?<RefreshCw size={15} className="animate-spin"/>:<Calculator size={15}/>}
                    {fetching?'Fetching…':'Show Report'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Saved Bills */}
        {showBills && !reportData && (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">Saved Bills ({savedBills.length})</p>
              <button onClick={loadBills} className="text-gray-400 hover:text-gray-600"><RefreshCw size={14}/></button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-300 w-10">Sr.</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Nickname</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Invoice No.</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">RA Bill No</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Project</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Invoice Rule</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Period</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-300">Amount</th>
                    <th className="px-3 py-2 w-10"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loadingBills ? (
                    <tr><td colSpan={9} className="py-8 text-center text-gray-400 text-xs"><RefreshCw size={13} className="inline animate-spin mr-1"/>Loading…</td></tr>
                  ) : savedBills.length===0 ? (
                    <tr><td colSpan={9} className="py-8 text-center text-gray-400 text-xs">No saved bills yet.</td></tr>
                  ) : savedBills.map((c, i) => (
                    <tr key={c.id} className={`hover:bg-blue-50 ${i%2===0?'bg-white':'bg-gray-50/50'}`}>
                      <td className="px-3 py-2.5 text-center text-xs text-gray-400 font-medium">{i+1}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-gray-800">{c.machine_nickname||'—'}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-blue-700">{c.invoice_number||'—'}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-gray-700">{c.ra_bill_no||'—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{c.project_code||c.project_name||'—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{c.rule_number?`${c.rule_number} · ${c.rule_name||''}`:c.rule_name||'—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(c.period_from)} – {fmtDate(c.period_to)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-bold text-blue-800">{fm(c.net_payable||c.final_total)}</td>
                      <td className="px-3 py-2.5 relative">
                        <button onClick={()=>setMenuOpenId(menuOpenId===c.id?null:c.id)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                          <MoreVertical size={14}/>
                        </button>
                        {menuOpenId===c.id && (
                          <div className="absolute right-10 top-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl w-40 py-1 text-xs">
                            <button onClick={()=>{openView(c.id);setMenuOpenId(null)}}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700">
                              <Eye size={12}/> View
                            </button>
                            <button onClick={()=>{openEdit(c.id);setMenuOpenId(null)}}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-blue-700">
                              <Pencil size={12}/> Edit
                            </button>
                            <button onClick={()=>{handleMenuPdf(c.id);setMenuOpenId(null)}}
                              disabled={pdfLoadingId===c.id}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600 disabled:opacity-50">
                              <FileText size={12}/> {pdfLoadingId===c.id?'…':'Download PDF'}
                            </button>
                            <button onClick={()=>{handleMenuExcel(c.id);setMenuOpenId(null)}}
                              disabled={xlsLoadingId===c.id}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-teal-50 text-teal-700 disabled:opacity-50">
                              <FileSpreadsheet size={12}/> {xlsLoadingId===c.id?'…':'Download Excel'}
                            </button>
                            {isAdmin && (
                              <button onClick={()=>{setDelId(c.id);setMenuOpenId(null)}}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600 border-t border-gray-100">
                                <Trash2 size={12}/> Delete
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {viewData && <ViewBillModal calc={viewData} onClose={()=>setViewData(null)} />}

        {editData && (
          <EditBillModal
            calc={editData}
            onClose={()=>setEditData(null)}
            onSaved={()=>{ setEditData(null); loadBills() }}
          />
        )}

        {delId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
              <p className="font-semibold text-gray-900 mb-4">Delete this hire bill?</p>
              <div className="flex gap-3">
                <button onClick={handleDel} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
                <button onClick={()=>setDelId(null)} className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {menuOpenId && <div className="fixed inset-0 z-10" onClick={()=>setMenuOpenId(null)}/>}
      </div>
    </div>
  )
}

// ── Edit Bill Modal ───────────────────────────────────────────────────────────
function EditBillModal({ calc, onClose, onSaved }) {
  const inpE = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const storedManualAdd = (calc.manual_items||[]).filter(x=>x.type==='addition')
  const storedManualDed = (calc.manual_items||[]).filter(x=>x.type==='deduction')

  const [form, setForm]     = useState({
    ra_bill_no:      calc.ra_bill_no || '',
    invoice_number:  calc.invoice_number || '',
    invoice_date:    calc.invoice_date ? calc.invoice_date.split('T')[0] : today(),
    gst_rate:        String(calc.gst_rate || 18),
    income_tax_rate: String(calc.income_tax_rate || 2),
    diesel_rate:     String(calc.diesel_rate || 0),
    remarks:         calc.remarks || '',
  })
  const [manualAdd, setManualAdd] = useState(storedManualAdd.map(x=>({ purpose:x.notes||'', amount:String(x.amount) })))
  const [manualDed, setManualDed] = useState(storedManualDed.map(x=>({ purpose:x.notes||'', amount:String(x.amount) })))
  const [addRow, setAddRow] = useState({ purpose:'', amount:'' })
  const [dedRow, setDedRow] = useState({ purpose:'', amount:'' })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const baseAmt  = n(calc.basic_amount)
  const addTotal = manualAdd.reduce((s,r)=>s+n(r.amount),0)
  const dedTotal = manualDed.reduce((s,r)=>s+n(r.amount),0)
  const totalAmt = baseAmt + addTotal - dedTotal
  const gstAmt   = totalAmt * n(form.gst_rate) / 100
  const grossPay = totalAmt + gstAmt
  const itAmt    = totalAmt * n(form.income_tax_rate) / 100
  const netPay   = grossPay - itAmt

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      const machines = (calc.machines||[]).map(m => ({
        ...m,
        diesel_rate:       n(form.diesel_rate),
        diesel_amount:     n(m.diesel_qty) * n(form.diesel_rate),
        total_hire_diesel: n(m.hire_amount) + n(m.diesel_qty)*n(form.diesel_rate),
      }))
      await updateInvoiceCalc(calc.id, {
        invoice_date:       form.invoice_date,
        invoice_number:     form.invoice_number,
        ra_bill_no:         form.ra_bill_no,
        remarks:            form.remarks,
        status:             'final',
        gst_rate:           form.gst_rate,
        gst_amount:         gstAmt,
        gross_payable:      grossPay,
        income_tax_rate:    form.income_tax_rate,
        income_tax_amount:  itAmt,
        maintenance_amount: n(calc.maintenance_amount),
        stores_amount:      n(calc.stores_amount),
        advance_amount:     n(calc.advance_amount),
        fuel_deduction_amount: n(calc.fuel_deduction_amount),
        total_recoveries:   itAmt,
        net_payable:        netPay,
        diesel_rate:        n(form.diesel_rate),
        basic_amount:       baseAmt,
        final_total:        netPay,
        machines,
        manual_items: [
          ...manualAdd.map(r=>({ type:'addition', notes:r.purpose, amount:r.amount })),
          ...manualDed.map(r=>({ type:'deduction', notes:r.purpose, amount:r.amount })),
        ],
      })
      onSaved()
    } catch (e) { setErr(e.response?.data?.error||'Failed to update') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-blue-700 rounded-t-2xl">
          <h2 className="font-bold text-white text-sm flex items-center gap-2"><Pencil size={14}/> Edit Bill — {calc.invoice_number||`#${calc.id}`}</h2>
          <button onClick={onClose} className="text-blue-200 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">RA Bill No</label>
              <input className={inpE} value={form.ra_bill_no} onChange={e=>setForm(f=>({...f,ra_bill_no:e.target.value}))} placeholder="RA01"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Number</label>
              <input className={inpE} value={form.invoice_number} onChange={e=>setForm(f=>({...f,invoice_number:e.target.value}))} placeholder="Inv-01"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Date</label>
              <input type="date" className={inpE} value={form.invoice_date} onChange={e=>setForm(f=>({...f,invoice_date:e.target.value}))}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Diesel Rate (₹/L)</label>
              <input type="number" className={inpE} value={form.diesel_rate} onChange={e=>setForm(f=>({...f,diesel_rate:e.target.value}))} placeholder="0.00"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">GST Rate (%)</label>
              <input type="number" className={inpE} value={form.gst_rate} onChange={e=>setForm(f=>({...f,gst_rate:e.target.value}))}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Income Tax (%)</label>
              <input type="number" className={inpE} value={form.income_tax_rate} onChange={e=>setForm(f=>({...f,income_tax_rate:e.target.value}))}/>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
            <textarea className={inpE} rows={2} value={form.remarks} onChange={e=>setForm(f=>({...f,remarks:e.target.value}))}/>
          </div>

          <div>
            <p className="text-xs font-bold text-teal-700 uppercase tracking-wide mb-2">Manual Additions</p>
            <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden">
              <thead className="bg-teal-50"><tr>
                <th className="px-3 py-1.5 text-left text-teal-700">Purpose</th>
                <th className="px-3 py-1.5 text-right text-teal-700">Amount</th>
                <th className="w-6"/>
              </tr></thead>
              <tbody>
                {manualAdd.map((r,i)=>(
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-1.5">{r.purpose}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-teal-700">{fm(r.amount)}</td>
                    <td className="px-2"><button onClick={()=>setManualAdd(p=>p.filter((_,j)=>j!==i))} className="text-gray-300 hover:text-red-400"><X size={11}/></button></td>
                  </tr>
                ))}
                <tr className="border-t border-gray-100 bg-gray-50">
                  <td className="px-2 py-1.5"><input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Purpose" value={addRow.purpose} onChange={e=>setAddRow(p=>({...p,purpose:e.target.value}))}/></td>
                  <td className="px-2 py-1.5"><input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-right" placeholder="0.00" value={addRow.amount} onChange={e=>setAddRow(p=>({...p,amount:e.target.value}))}/></td>
                  <td className="px-2"><button onClick={()=>{if(!addRow.purpose||!addRow.amount)return;setManualAdd(p=>[...p,{...addRow}]);setAddRow({purpose:'',amount:''})}} className="text-teal-600"><Plus size={13}/></button></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="text-xs font-bold text-rose-700 uppercase tracking-wide mb-2">Manual Deductions</p>
            <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden">
              <thead className="bg-rose-50"><tr>
                <th className="px-3 py-1.5 text-left text-rose-700">Purpose</th>
                <th className="px-3 py-1.5 text-right text-rose-700">Amount</th>
                <th className="w-6"/>
              </tr></thead>
              <tbody>
                {manualDed.map((r,i)=>(
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-1.5">{r.purpose}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-rose-700">{fm(r.amount)}</td>
                    <td className="px-2"><button onClick={()=>setManualDed(p=>p.filter((_,j)=>j!==i))} className="text-gray-300 hover:text-red-400"><X size={11}/></button></td>
                  </tr>
                ))}
                <tr className="border-t border-gray-100 bg-gray-50">
                  <td className="px-2 py-1.5"><input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Purpose" value={dedRow.purpose} onChange={e=>setDedRow(p=>({...p,purpose:e.target.value}))}/></td>
                  <td className="px-2 py-1.5"><input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-right" placeholder="0.00" value={dedRow.amount} onChange={e=>setDedRow(p=>({...p,amount:e.target.value}))}/></td>
                  <td className="px-2"><button onClick={()=>{if(!dedRow.purpose||!dedRow.amount)return;setManualDed(p=>[...p,{...dedRow}]);setDedRow({purpose:'',amount:''})}} className="text-rose-600"><Plus size={13}/></button></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 grid grid-cols-5 gap-2 text-xs">
            <div className="text-center"><p className="text-gray-500 mb-0.5">Total Amount</p><p className="font-bold text-gray-900">{fm(totalAmt)}</p></div>
            <div className="text-center"><p className="text-gray-500 mb-0.5">GST @ {form.gst_rate}%</p><p className="font-semibold text-gray-700">{fm(gstAmt)}</p></div>
            <div className="text-center"><p className="text-gray-500 mb-0.5">Gross Payable</p><p className="font-bold text-blue-900">{fm(grossPay)}</p></div>
            <div className="text-center"><p className="text-gray-500 mb-0.5">Income Tax</p><p className="font-semibold text-red-600">- {fm(itAmt)}</p></div>
            <div className="text-center bg-blue-100 rounded-lg px-2 py-1"><p className="text-blue-700 mb-0.5 font-medium">Net Payable</p><p className="font-bold text-blue-900 text-sm">{fm(netPay)}</p></div>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold rounded-lg text-sm">
              {saving?<RefreshCw size={14} className="animate-spin"/>:<Check size={14}/>}
              {saving?'Saving…':'Save Changes'}
            </button>
            <button onClick={onClose} className="px-6 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── View Bill Modal ───────────────────────────────────────────────────────────
function ViewBillModal({ calc, onClose }) {
  const [dlErr, setDlErr] = useState('')

  const handlePDF = async () => {
    setDlErr('')
    try { await downloadHireBillOwnershipPdf(buildBillDownloadData(calc)) }
    catch (e) { setDlErr(`PDF error: ${e.message}`) }
  }
  const handleExcel = async () => {
    setDlErr('')
    try { await downloadHireBillExcel(buildBillDownloadData(calc)) }
    catch (e) { setDlErr(`Excel error: ${e.message}`) }
  }

  const machine    = (calc.machines || [])[0] || {}
  const manItems   = calc.manual_items || []
  const manAddRows = manItems.filter(x => x.type === 'addition')
  const manDedRows = manItems.filter(x => x.type === 'deduction')

  const basicAmt   = n(calc.basic_amount)
  const gstRate    = n(calc.gst_rate) || 18
  const gstAmt     = n(calc.gst_amount)
  const itRate     = n(calc.income_tax_rate) || 2
  const itAmt      = n(calc.income_tax_amount)
  const manAddTot  = manAddRows.reduce((s, r) => s + n(r.amount), 0)
  const manDedTot  = manDedRows.reduce((s, r) => s + n(r.amount), 0)
  const maintDed   = n(machine.maintenance_deduction) || n(calc.maintenance_amount)
  const fuelDed    = n(machine.fuel_deduction)        || n(calc.fuel_deduction_amount)
  const totalDed   = maintDed + fuelDed + manDedTot
  const invoiceAmt = basicAmt + manAddTot - totalDed
  const netPayable = n(calc.net_payable) || n(calc.final_total)

  const fmv = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const invoiceTag  = calc.invoice_number || calc.ra_bill_no || `#${calc.id}`
  const addDedHdr   = 'px-3 py-1.5 text-xs font-bold text-center'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 bg-black/60 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4">

        {/* Sticky toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <span className="text-sm font-bold text-gray-800">{invoiceTag} · {fmtDate(calc.period_from)} – {fmtDate(calc.period_to)}</span>
          <div className="flex items-center gap-2">
            {dlErr && <span className="text-xs text-red-500 max-w-xs truncate">{dlErr}</span>}
            <button onClick={handlePDF} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium">
              <FileText size={13}/> PDF
            </button>
            <button onClick={handleExcel} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium">
              <FileSpreadsheet size={13}/> Excel
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600"><X size={18}/></button>
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* Header */}
          <div className="flex items-start justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-700 rounded-xl flex flex-col items-center justify-center shrink-0">
                <span className="text-white font-black text-sm leading-none">RVR</span>
                <span className="text-blue-300 text-[7px] mt-0.5">■ ■ ■</span>
              </div>
              <div>
                <p className="text-base font-black text-blue-800 leading-tight">RVR PROJECTS</p>
                <p className="text-xs text-gray-500 font-medium">PRIVATE LIMITED</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Invoice Transaction ID</p>
              <p className="text-lg font-black text-blue-700 leading-tight">{invoiceTag}</p>
              <p className="text-[10px] text-gray-400 font-medium mt-1 uppercase tracking-wide">Site Name</p>
              <p className="text-sm font-bold text-gray-700">{calc.project_name || '—'}</p>
            </div>
          </div>

          {/* Two-column card */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
              <div className="bg-blue-700 px-3 py-2">
                <p className="text-xs font-bold text-white uppercase tracking-wide">⚙ Asset, Period &amp; Invoice Rule</p>
              </div>
              <div className="p-3">
                <p className="text-sm font-bold text-blue-800 mb-3 leading-snug">{machine.description || machine.reg_no || '—'}</p>
                <div className="space-y-1.5">
                  {[
                    ['Asset Code',   machine.reg_no          || '—'],
                    ['Asset Type',   machine.eq_type_name    || '—'],
                    ['Manufacturer', machine.manufacturer    || '—'],
                    ['Current Site', calc.project_name       || '—'],
                    ['Invoice Rule', calc.rule_name || calc.rule_number || '—'],
                    ['Owner',        calc.display_owner_name || '—'],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] text-gray-500 shrink-0">{lbl}</span>
                      <span className="text-[11px] font-semibold text-gray-800 text-right truncate">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
              <div className="bg-blue-700 px-3 py-2">
                <p className="text-xs font-bold text-white uppercase tracking-wide">Calculation Summary</p>
              </div>
              <div className="p-3">
                <div className="space-y-2 mb-3">
                  {[
                    ['Period',        `${fmtDate(calc.period_from)} to ${fmtDate(calc.period_to)}`],
                    ['Basic Rate',    `₹ ${fmv(n(machine.monthly_rate))} / ${machine.cal_days || 30} days`],
                    ['Working Days',  machine.working_days || 0],
                    ['Billable Days', machine.cal_days || 30],
                    ['WO Number',     calc.display_wo_number || '—'],
                    ['WO Date',       fmtDate(calc.display_wo_date)],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] text-gray-500 shrink-0">{lbl}</span>
                      <span className="text-[11px] font-semibold text-gray-800 text-right">{val}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-1">Basic Amount</p>
                  <p className="text-xl font-black text-blue-800">₹ {fmv(basicAmt)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Additions */}
          <div className="border border-orange-200 rounded-xl overflow-hidden">
            <div className="bg-orange-500 px-3 py-2">
              <p className="text-xs font-bold text-white uppercase tracking-wide">⊕ Additions</p>
            </div>
            <table className="w-full">
              <thead className="bg-orange-50">
                <tr>
                  <th className={`${addDedHdr} text-left pl-3 text-orange-700`}>Description</th>
                  <th className={`${addDedHdr} text-right pr-3 text-orange-700`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {manAddRows.length === 0 ? (
                  <tr><td colSpan={2} className="px-3 py-2 text-xs text-gray-400 text-center">—</td></tr>
                ) : manAddRows.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-orange-50/30'}>
                    <td className="px-3 py-2 text-xs text-gray-800 border-b border-gray-100">{r.notes || 'Manual Addition'}</td>
                    <td className="px-3 py-2 text-xs font-semibold text-gray-800 text-right border-b border-gray-100">₹ {fmv(n(r.amount))}</td>
                  </tr>
                ))}
                <tr className="bg-orange-50 font-bold border-t-2 border-orange-200">
                  <td className="px-3 py-2 text-xs font-bold text-orange-700 pl-3">Total Additions</td>
                  <td className="px-3 py-2 text-xs font-bold text-orange-700 text-right pr-3">₹ {fmv(manAddTot)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Deductions */}
          <div className="border border-red-200 rounded-xl overflow-hidden">
            <div className="bg-red-600 px-3 py-2">
              <p className="text-xs font-bold text-white uppercase tracking-wide">⊖ Deductions</p>
            </div>
            <table className="w-full">
              <thead className="bg-red-50">
                <tr>
                  <th className={`${addDedHdr} text-left pl-3 text-red-700`}>Description</th>
                  <th className={`${addDedHdr} text-right pr-3 text-red-700`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {maintDed === 0 && fuelDed === 0 && manDedRows.length === 0 ? (
                  <tr><td colSpan={2} className="px-3 py-2 text-xs text-gray-400 text-center">—</td></tr>
                ) : (
                  <>
                    {maintDed > 0 && (
                      <tr>
                        <td className="px-3 py-2 text-xs text-gray-800 border-b border-gray-100">Maintenance / Breakdown</td>
                        <td className="px-3 py-2 text-xs font-semibold text-red-700 text-right border-b border-gray-100">- ₹ {fmv(maintDed)}</td>
                      </tr>
                    )}
                    {fuelDed > 0 && (
                      <tr>
                        <td className="px-3 py-2 text-xs text-gray-800 border-b border-gray-100">Fuel Deduction</td>
                        <td className="px-3 py-2 text-xs font-semibold text-red-700 text-right border-b border-gray-100">- ₹ {fmv(fuelDed)}</td>
                      </tr>
                    )}
                    {manDedRows.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-red-50/30'}>
                        <td className="px-3 py-2 text-xs text-gray-800 border-b border-gray-100">{r.notes || 'Manual Deduction'}</td>
                        <td className="px-3 py-2 text-xs font-semibold text-red-700 text-right border-b border-gray-100">- ₹ {fmv(n(r.amount))}</td>
                      </tr>
                    ))}
                  </>
                )}
                <tr className="bg-red-50 font-bold border-t-2 border-red-200">
                  <td className="px-3 py-2 text-xs font-bold text-red-700 pl-3">Total Deductions</td>
                  <td className="px-3 py-2 text-xs font-bold text-red-700 text-right pr-3">- ₹ {fmv(totalDed)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Financial summary */}
          <div className="bg-blue-50 rounded-xl p-4 grid grid-cols-5 gap-3 text-center">
            <div>
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">Basic Amount</p>
              <p className="text-sm font-bold text-gray-900">₹ {fmv(basicAmt)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">Invoice Amount</p>
              <p className="text-sm font-bold text-gray-900">₹ {fmv(invoiceAmt)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">GST @ {gstRate}%</p>
              <p className="text-sm font-semibold text-blue-700">₹ {fmv(gstAmt)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">Income Tax @ {itRate}%</p>
              <p className="text-sm font-semibold text-red-600">- ₹ {fmv(itAmt)}</p>
            </div>
            <div className="bg-blue-100 rounded-lg p-2">
              <p className="text-[10px] text-blue-700 font-medium uppercase tracking-wide mb-1">Net Payable</p>
              <p className="text-base font-black text-blue-900">₹ {fmv(netPayable)}</p>
            </div>
          </div>

          {/* Amount in words */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">Net Payable in Words</p>
            <p className="text-sm font-semibold text-gray-800 italic">{numToWords(netPayable)}</p>
          </div>

        </div>
      </div>
    </div>
  )
}
