import { useState, useEffect, useCallback } from 'react'
import React from 'react'
import { getInvoiceCalcs, getInvoiceCalc, deleteInvoiceCalc, updateInvoiceCalc } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { downloadHireBillOwnershipPdf } from './hireBillOwnershipPdf'
import { downloadHireBillExcel } from './hireBillExcel'
import {
  Receipt, RefreshCw, Search, Eye, Trash2, FileText, X,
  FileDown, Download, Edit2, Plus, Save, Check, FileSpreadsheet
} from 'lucide-react'

// Derive machineCalcs-compatible object from stored invoice_calc_machines row
function calcFromStored(mac) {
  const nv = v => parseFloat(v) || 0
  const cDays   = nv(mac.cal_days) || 30
  const dailyRate = cDays > 0 ? nv(mac.monthly_rate) / cDays : 0
  return {
    cDays,
    dailyRate,
    monthAmt:      nv(mac.hire_amount),   // stored as combined (month+hours+km)
    plannedHrs:    nv(mac.planned_hrs_month),
    exHrs:         0,
    hoursAmt:      0,
    plannedKm:     0,
    exKm:          0,
    kmAmt:         0,
    macBasic:      nv(mac.hire_amount),
    fuelAmt:       nv(mac.fuel_deduction),
    actualFuelLtrHr: nv(mac.actual_hours) > 0 ? nv(mac.diesel_qty) / nv(mac.actual_hours) : 0,
    utilPct:       nv(mac.utilization_pct),
  }
}

// Augment stored machine row so hireBillOwnershipPdf can render fuel rows
function augmentMachine(mac) {
  const nv = v => parseFloat(v) || 0
  return {
    ...mac,
    hours_rate:          0,
    km_rate:             0,
    planned_km_month:    0,
    fuel_applicable:     nv(mac.fuel_deduction) > 0,
    fuel_performance_type: 'consumption',
    approved_fuel_consumption: null,
    approved_mileage:    null,
    fuel_deduction_rate: null,   // not stored — show — in PDF
  }
}

function buildBillData(calc) {
  const nv = v => parseFloat(v) || 0
  const machines     = (calc.machines || []).map(augmentMachine)
  const machCalcs    = machines.map(calcFromStored)
  const totalBasic   = nv(calc.basic_amount)
  const totalBrkDays = machines.reduce((s, m) => s + nv(m.breakdown_days), 0)
  const totalBrkAmt  = machines.reduce((s, m) => s + nv(m.maintenance_deduction), 0) || nv(calc.maintenance_amount)
  const totalFuelAmt = machines.reduce((s, m) => s + nv(m.fuel_deduction), 0) || nv(calc.fuel_deduction_amount)
  const manItems     = calc.manual_items || []
  const manAdd       = manItems.filter(x => x.type === 'addition')
  const manDed       = manItems.filter(x => x.type === 'deduction')
  const manAddTotal  = manAdd.reduce((s, x) => s + nv(x.amount), 0)
  const manDedTotal  = manDed.reduce((s, x) => s + nv(x.amount), 0)
  const totalDed     = totalBrkAmt + totalFuelAmt + manDedTotal
  return {
    vendor:           calc.display_owner_name || '—',
    vendorDetails:    { gst_no: calc.manual_gst_no || '', bank_name: calc.manual_bank_name || '', bank_account: calc.manual_bank_account || '', bank_ifsc: calc.manual_bank_ifsc || '' },
    previewMachines:  machines,
    machineCalcs:     machCalcs,
    dateFrom:         calc.period_from?.split('T')[0] || '',
    dateTo:           calc.period_to?.split('T')[0]   || '',
    totalBasic,
    totalBreakdownDays: totalBrkDays,
    totalBreakdownAmt:  totalBrkAmt,
    totalFuelAmt,
    totalDeductions:  totalDed,
    totalAdditions:   manAddTotal,
    gstRate:          nv(calc.gst_rate) || 18,
    gstAmt:           nv(calc.gst_amount),
    tdsRate:          nv(calc.income_tax_rate) || 2,
    tdsAmt:           nv(calc.income_tax_amount),
    netPayable:       nv(calc.net_payable) || nv(calc.final_total),
    manualAdditions:  manAdd.map(x => ({ label: x.notes || '', amount: x.amount })),
    manualDeductions: manDed.map(x => ({ label: x.notes || '', amount: x.amount })),
    projectCode:      calc.project_code || '',
    projectName:      calc.project_name || '',
    raBillNo:         calc.ra_bill_no || '',
  }
}

async function downloadPdf(calc) {
  await downloadHireBillOwnershipPdf(buildBillData(calc))
}

async function downloadExcel(calc) {
  await downloadHireBillExcel(buildBillData(calc))
}

const n       = v => parseFloat(v) || 0
const fm      = v => v != null ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const fmtDT   = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'

// ── Ownership Bill Modal ──────────────────────────────────────────────────────
function OwnershipBillModal({ calc: initCalc, onClose, onUpdated }) {
  const nv = v => parseFloat(v) || 0
  const fm = v => '₹ ' + nv(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const fmtD = d => {
    if (!d) return '—'
    const dt = new Date((d + '').split('T')[0] + 'T00:00:00')
    return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`
  }
  const fmtMY = d => {
    if (!d) return ''
    const dt = new Date((d + '').split('T')[0] + 'T00:00:00')
    return ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][dt.getMonth()] + '-' + String(dt.getFullYear()).slice(-2)
  }
  function numToWords(amount) {
    const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
    const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
    function iw(n){if(n<20)return a[n];if(n<100)return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');if(n<1000)return a[Math.floor(n/100)]+' Hundred'+(n%100?' '+iw(n%100):'');if(n<100000)return iw(Math.floor(n/1000))+' Thousand'+(n%1000?' '+iw(n%1000):'');if(n<1e7)return iw(Math.floor(n/100000))+' Lakh'+(n%100000?' '+iw(n%100000):'');return iw(Math.floor(n/1e7))+' Crore'+(n%1e7?' '+iw(n%1e7):'')}
    const whole=Math.round(Math.abs(amount));return(whole===0?'Zero':iw(whole))+' Only/-'
  }

  const [calc, setCalc]          = useState(initCalc)
  const [editMode, setEditMode]  = useState(false)
  const [billForm, setBillForm]  = useState({ gst_rate: String(initCalc.gst_rate || 18), income_tax_rate: String(initCalc.income_tax_rate || 2), remarks: initCalc.remarks || '' })
  const [vendorDet, setVendorDet]= useState({ gst_no: initCalc.manual_gst_no || '', bank_name: initCalc.manual_bank_name || '', bank_account: initCalc.manual_bank_account || '', bank_ifsc: initCalc.manual_bank_ifsc || '' })
  const [manAdd, setManAdd]      = useState((initCalc.manual_items || []).filter(x => x.type === 'addition').map(x => ({ label: x.notes || '', amount: String(x.amount || '') })))
  const [manDed, setManDed]      = useState((initCalc.manual_items || []).filter(x => x.type === 'deduction').map(x => ({ label: x.notes || '', amount: String(x.amount || '') })))
  const [saving, setSaving]      = useState(false)
  const [saveErr, setSaveErr]    = useState('')
  const [dlErr, setDlErr]        = useState('')

  const machines    = (calc.machines || []).map(augmentMachine)
  const machCalcs   = machines.map(calcFromStored)
  const fuelMachines = machines.filter((m, i) => m.fuel_applicable && machCalcs[i].fuelAmt > 0)
  const fuelLabels   = ['a','b','c','d','e','f','g','h','i','j']

  const totalBasic    = nv(calc.basic_amount)
  const manAddTotal   = manAdd.reduce((s, x) => s + nv(x.amount), 0)
  const manDedTotal   = manDed.reduce((s, x) => s + nv(x.amount), 0)
  const totalBrkDays  = machines.reduce((s, m) => s + nv(m.breakdown_days), 0)
  const totalBrkAmt   = machines.reduce((s, m) => s + nv(m.maintenance_deduction), 0)
  const totalFuelAmt  = machines.reduce((s, m) => s + nv(m.fuel_deduction), 0)
  const totalDed      = totalBrkAmt + totalFuelAmt + manDedTotal
  const gstRate       = nv(billForm.gst_rate)
  const tdsRate       = nv(billForm.income_tax_rate)
  const gstAmt        = totalBasic * gstRate / 100
  const tdsAmt        = totalBasic * tdsRate / 100
  const netPayable    = totalBasic + manAddTotal + gstAmt - tdsAmt - totalDed

  const woMachine     = machines.find(m => m.wo_number)
  const projectCode   = calc.project_code || ''
  const projectName   = calc.project_name || ''
  const monthLabel    = fmtMY(calc.period_from)

  const tdCls = 'border border-gray-400 px-2 py-1 text-xs'

  const handleSave = async () => {
    setSaving(true); setSaveErr('')
    try {
      await updateInvoiceCalc(calc.id, {
        invoice_date: calc.invoice_date, invoice_number: calc.invoice_number,
        ra_bill_no: calc.ra_bill_no, remarks: billForm.remarks, status: calc.status || 'final',
        gst_rate: gstRate, gst_amount: gstAmt, gross_payable: totalBasic + gstAmt,
        income_tax_rate: tdsRate, income_tax_amount: tdsAmt,
        maintenance_amount: totalBrkAmt, fuel_deduction_amount: totalFuelAmt,
        total_recoveries: tdsAmt, net_payable: netPayable,
        basic_amount: totalBasic, final_total: netPayable,
        display_owner_name: calc.display_owner_name, display_ownership: calc.display_ownership,
        display_wo_number: calc.display_wo_number, display_wo_date: calc.display_wo_date,
        manual_gst_no: vendorDet.gst_no || null,
        manual_bank_name: vendorDet.bank_name || null,
        manual_bank_account: vendorDet.bank_account || null,
        manual_bank_ifsc: vendorDet.bank_ifsc || null,
        machines: calc.machines || [],
        manual_items: [
          ...manAdd.filter(x => nv(x.amount) > 0).map(x => ({ type: 'addition', notes: x.label, amount: nv(x.amount) })),
          ...manDed.filter(x => nv(x.amount) > 0).map(x => ({ type: 'deduction', notes: x.label, amount: nv(x.amount) })),
        ],
      })
      // Refresh the calc data
      const r = await getInvoiceCalc(calc.id)
      const updated = r.data.data || r.data
      setCalc(updated)
      setVendorDet({ gst_no: updated.manual_gst_no || '', bank_name: updated.manual_bank_name || '', bank_account: updated.manual_bank_account || '', bank_ifsc: updated.manual_bank_ifsc || '' })
      setManAdd((updated.manual_items || []).filter(x => x.type === 'addition').map(x => ({ label: x.notes || '', amount: String(x.amount || '') })))
      setManDed((updated.manual_items || []).filter(x => x.type === 'deduction').map(x => ({ label: x.notes || '', amount: String(x.amount || '') })))
      setEditMode(false)
      if (onUpdated) onUpdated()
    } catch (e) {
      setSaveErr(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const handlePdf = async () => {
    setDlErr('')
    try {
      await downloadPdf({
        ...calc,
        manual_gst_no: vendorDet.gst_no, manual_bank_name: vendorDet.bank_name,
        manual_bank_account: vendorDet.bank_account, manual_bank_ifsc: vendorDet.bank_ifsc,
        gst_rate: gstRate, income_tax_rate: tdsRate,
        manual_items: [
          ...manAdd.map(x => ({ type: 'addition', notes: x.label, amount: x.amount })),
          ...manDed.map(x => ({ type: 'deduction', notes: x.label, amount: x.amount })),
        ],
      })
    }
    catch (e) { setDlErr(e.message) }
  }

  const inp = 'border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 w-full'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 bg-black/60 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-4">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <span className="text-sm font-bold text-gray-800">
            {calc.invoice_number || calc.ra_bill_no || `#${calc.id}`} · {fmtD(calc.period_from)} – {fmtD(calc.period_to)}
          </span>
          <div className="flex items-center gap-2">
            {dlErr  && <span className="text-xs text-red-500 max-w-xs truncate">{dlErr}</span>}
            {saveErr && <span className="text-xs text-red-500 max-w-xs truncate">{saveErr}</span>}
            {editMode ? (
              <>
                <button onClick={() => { setEditMode(false); setSaveErr('') }}
                  className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white rounded-lg text-xs font-bold">
                  {saving ? <RefreshCw size={12} className="animate-spin"/> : <Save size={12}/>}
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button onClick={handlePdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium">
                  <Download size={12}/> PDF
                </button>
                <button onClick={async () => { setDlErr(''); try { await downloadExcel({...calc, manual_gst_no: vendorDet.gst_no, manual_bank_name: vendorDet.bank_name, manual_bank_account: vendorDet.bank_account, manual_bank_ifsc: vendorDet.bank_ifsc, manual_items: [...manAdd.map(x=>({type:'addition',notes:x.label,amount:x.amount})),...manDed.map(x=>({type:'deduction',notes:x.label,amount:x.amount}))] }) } catch(e) { setDlErr(e.message) } }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium">
                  <FileSpreadsheet size={12}/> Excel
                </button>
                <button onClick={() => setEditMode(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium">
                  <Edit2 size={12}/> Edit
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600"><X size={18}/></button>
          </div>
        </div>

        <div className="p-4">
          {/* Vendor / Bank Details card — always visible, editable in edit mode */}
          <div className="mb-4 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Vendor / Bank Details (for bill header)</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'GST No.', key: 'gst_no', placeholder: 'GST Number' },
                { label: 'Bank Name', key: 'bank_name', placeholder: 'Bank Name' },
                { label: 'A/C No.', key: 'bank_account', placeholder: 'Account Number' },
                { label: 'IFSC Code', key: 'bank_ifsc', placeholder: 'IFSC Code' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  {editMode
                    ? <input className={inp} value={vendorDet[key]} onChange={e => setVendorDet(p => ({...p, [key]: e.target.value}))} placeholder={placeholder}/>
                    : <p className="text-sm font-medium text-gray-800">{vendorDet[key] || <span className="text-gray-400 italic">—</span>}</p>}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {[
                { label: 'GST Rate (%)', type: 'number', val: billForm.gst_rate, key: 'gst_rate' },
                { label: 'TDS / Income Tax Rate (%)', type: 'number', val: billForm.income_tax_rate, key: 'income_tax_rate' },
                { label: 'Remarks', type: 'text', val: billForm.remarks, key: 'remarks' },
              ].map(({ label, type, val, key }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  {editMode
                    ? <input type={type} className={inp} value={val} onChange={e => setBillForm(f => ({...f, [key]: e.target.value}))}/>
                    : <p className="text-sm font-medium text-gray-800">{val || <span className="text-gray-400 italic">—</span>}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Bill document */}
          <div className="bg-white border-2 border-gray-700 rounded overflow-hidden">
            <table className="w-full text-xs" style={{borderCollapse:'collapse'}}>
              <tbody>
                {/* Title */}
                <tr><td colSpan={12} className={tdCls + ' text-center font-bold text-sm py-2'}>RVR PROJECTS PVT LTD</td></tr>
                <tr><td colSpan={12} className={tdCls + ' text-center text-xs'}>PROJECT: {projectCode} {projectName}</td></tr>
                <tr><td colSpan={12} className={tdCls + ' text-center font-bold text-xs'}>HIRE BILL ABSTRACT FOR THE MONTH OF {monthLabel}</td></tr>
                <tr><td colSpan={12} className={tdCls + ' text-center text-xs'}>(Period {fmtD(calc.period_from)} to {fmtD(calc.period_to)})</td></tr>

                {/* Two-column info */}
                <tr>
                  <td colSpan={6} className={tdCls + ' align-top'}>
                    <div className="space-y-0.5 text-xs">
                      <div><span className="font-semibold">Ownership:</span> {calc.display_owner_name || '—'}</div>
                      <div><span className="font-semibold">Asset:</span> {machines.map(m => m.description || m.reg_no).join(', ')}</div>
                      <div><span className="font-semibold">GST. No.:</span> {vendorDet.gst_no || <span className="text-gray-400 italic">—</span>}</div>
                      <div><span className="font-semibold">BANK DETAILS:</span> {vendorDet.bank_name || <span className="text-gray-400 italic">—</span>}</div>
                      <div><span className="font-semibold">A/C NO:</span> {vendorDet.bank_account || <span className="text-gray-400 italic">—</span>}</div>
                      <div><span className="font-semibold">IFSC CODE:</span> {vendorDet.bank_ifsc || <span className="text-gray-400 italic">—</span>}</div>
                    </div>
                  </td>
                  <td colSpan={6} className={tdCls + ' align-top'}>
                    <div className="space-y-0.5 text-xs">
                      <div><span className="font-semibold">RA Bill No</span> : {calc.ra_bill_no || '—'}</div>
                      <div><span className="font-semibold">RA Bill Date</span> : {fmtD(calc.invoice_date)}</div>
                      <div><span className="font-semibold">Project</span> : {projectCode} {projectName}</div>
                      <div><span className="font-semibold">Bill period</span> : {fmtD(calc.period_from)} TO {fmtD(calc.period_to)}</div>
                      <div><span className="font-semibold">WO No</span> : {woMachine?.wo_number || calc.display_wo_number || '—'}</div>
                      <div><span className="font-semibold">WO Date</span> : {woMachine?.wo_date ? fmtD(woMachine.wo_date) : '—'}</div>
                    </div>
                  </td>
                </tr>

                {/* Summary header */}
                <tr className="bg-gray-800 text-white font-bold text-xs">
                  {['Sr.No','Asset','Unit','Basic Rate','Limit','Actual','Excess','Unit Rate','Amount','Planned Hrs/Month','Util%','Remarks'].map(h => (
                    <td key={h} className="border border-gray-600 px-2 py-1.5 text-center">{h}</td>
                  ))}
                </tr>

                {/* Per-machine rows */}
                {machines.map((mac, idx) => {
                  const calc2 = machCalcs[idx]
                  const assetLabel = `${mac.description || mac.reg_no}${mac.eq_type_name ? ' ('+mac.eq_type_name+')' : ''}`
                  return (
                    <React.Fragment key={mac.machine_id || idx}>
                      <tr>
                        <td className={tdCls + ' text-center'}>{idx+1}</td>
                        <td className={tdCls + ' font-medium'}>{assetLabel}</td>
                        <td className={tdCls + ' text-center'}>Month</td>
                        <td className={tdCls + ' text-right'}>₹{nv(mac.monthly_rate).toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
                        <td className={tdCls + ' text-center'}>{calc2.cDays} Days</td>
                        <td className={tdCls + ' text-center'}>{nv(mac.working_days).toFixed(0)} Days</td>
                        <td className={tdCls + ' text-center'}>{Math.max(0, nv(mac.working_days)-calc2.cDays).toFixed(0)} Days</td>
                        <td className={tdCls + ' text-right'}>₹{calc2.dailyRate.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                        <td className={tdCls + ' text-right font-semibold'}>{fm(calc2.macBasic)}</td>
                        <td className={tdCls + ' text-center'}>{calc2.plannedHrs > 0 ? nv(mac.planned_hrs_month).toFixed(0)+' Hrs' : '—'}</td>
                        <td className={tdCls + ' text-center'}>{calc2.utilPct > 0 ? calc2.utilPct.toFixed(1)+'%' : '—'}</td>
                        <td className={tdCls}></td>
                      </tr>
                    </React.Fragment>
                  )
                })}

                {/* Total Basic */}
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={8} className={tdCls + ' text-right font-bold'}>Total Basic</td>
                  <td className={tdCls + ' text-right font-bold'}>{fm(totalBasic)}</td>
                  <td colSpan={3} className={tdCls}></td>
                </tr>

                {/* Additions */}
                <tr className="bg-gray-100"><td colSpan={12} className={tdCls + ' font-bold'}>Additions</td></tr>
                {manAdd.length === 0 && !editMode && (
                  <tr><td colSpan={8} className={tdCls + ' text-gray-400 italic'}>1) —</td><td colSpan={4} className={tdCls}></td></tr>
                )}
                {manAdd.map((item, i) => (
                  <tr key={i}>
                    <td colSpan={8} className={tdCls}>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 shrink-0">{i+1})</span>
                        {editMode
                          ? <input className={inp} value={item.label} onChange={e => setManAdd(prev => prev.map((x,j)=>j===i?{...x,label:e.target.value}:x))} placeholder="Description"/>
                          : <span>{item.label || '—'}</span>}
                        {editMode && <button onClick={() => setManAdd(prev => prev.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={11}/></button>}
                      </div>
                    </td>
                    <td className={tdCls}>
                      {editMode
                        ? <input type="number" className={inp + ' text-right'} value={item.amount} onChange={e => setManAdd(prev => prev.map((x,j)=>j===i?{...x,amount:e.target.value}:x))} placeholder="0.00"/>
                        : <span className="block text-right">{fm(nv(item.amount))}</span>}
                    </td>
                    <td colSpan={3} className={tdCls}></td>
                  </tr>
                ))}
                {editMode && (
                  <tr><td colSpan={12} className={tdCls}>
                    <button onClick={() => setManAdd(prev => [...prev, {label:'',amount:''}])}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
                      <Plus size={11}/> Add Manual Addition
                    </button>
                  </td></tr>
                )}
                <tr className="font-bold">
                  <td colSpan={8} className={tdCls + ' text-right font-bold'}>Total Additions</td>
                  <td className={tdCls + ' text-right font-bold'}>{fm(manAddTotal)}</td>
                  <td colSpan={3} className={tdCls}></td>
                </tr>

                {/* Deductions */}
                <tr className="bg-gray-100"><td colSpan={12} className={tdCls + ' font-bold'}>Deductions</td></tr>
                <tr>
                  <td colSpan={5} className={tdCls}>1) Downtime</td>
                  <td className={tdCls + ' text-center'}>{totalBrkDays} Days</td>
                  <td colSpan={2} className={tdCls}></td>
                  <td className={tdCls + ' text-right'}>{fm(totalBrkAmt)}</td>
                  <td colSpan={3} className={tdCls}></td>
                </tr>
                <tr className="bg-gray-50"><td colSpan={12} className={tdCls + ' font-semibold'}>2) Fuel Consumption</td></tr>
                {fuelMachines.map((mac, fi) => {
                  const c2 = machCalcs[machines.indexOf(mac)]
                  return (
                    <tr key={mac.machine_id || fi}>
                      <td colSpan={2} className={tdCls}>{fuelLabels[fi]}) {mac.description || mac.reg_no}</td>
                      <td className={tdCls + ' text-center'}>Approved: —</td>
                      <td className={tdCls + ' text-center'}>Actual: {c2.actualFuelLtrHr > 0 ? c2.actualFuelLtrHr.toFixed(2)+' L/Hr' : '—'}</td>
                      <td className={tdCls + ' text-center'}>{nv(mac.diesel_qty).toFixed(2)} Ltrs</td>
                      <td className={tdCls + ' text-center'}>—</td>
                      <td colSpan={2} className={tdCls}></td>
                      <td className={tdCls + ' text-right'}>{fm(c2.fuelAmt)}</td>
                      <td colSpan={3} className={tdCls}></td>
                    </tr>
                  )
                })}
                {manDed.map((item, i) => (
                  <tr key={i}>
                    <td colSpan={8} className={tdCls}>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 shrink-0">{fuelMachines.length + i + 3})</span>
                        {editMode
                          ? <input className={inp} value={item.label} onChange={e => setManDed(prev => prev.map((x,j)=>j===i?{...x,label:e.target.value}:x))} placeholder="Description"/>
                          : <span>{item.label || '—'}</span>}
                        {editMode && <button onClick={() => setManDed(prev => prev.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={11}/></button>}
                      </div>
                    </td>
                    <td className={tdCls}>
                      {editMode
                        ? <input type="number" className={inp + ' text-right'} value={item.amount} onChange={e => setManDed(prev => prev.map((x,j)=>j===i?{...x,amount:e.target.value}:x))} placeholder="0.00"/>
                        : <span className="block text-right">{fm(nv(item.amount))}</span>}
                    </td>
                    <td colSpan={3} className={tdCls}></td>
                  </tr>
                ))}
                {editMode && (
                  <tr><td colSpan={12} className={tdCls}>
                    <button onClick={() => setManDed(prev => [...prev, {label:'',amount:''}])}
                      className="flex items-center gap-1 text-red-600 hover:text-red-800 text-xs font-medium">
                      <Plus size={11}/> Add Manual Deduction
                    </button>
                  </td></tr>
                )}
                <tr className="font-bold">
                  <td colSpan={8} className={tdCls + ' text-right font-bold'}>Total Deductions</td>
                  <td className={tdCls + ' text-right font-bold'}>{fm(totalDed)}</td>
                  <td colSpan={3} className={tdCls}></td>
                </tr>

                {/* Totals */}
                <tr>
                  <td colSpan={8} className={tdCls + ' text-right'}>GST @ {gstRate}%</td>
                  <td className={tdCls + ' text-right'}>{fm(gstAmt)}</td>
                  <td colSpan={3} className={tdCls}></td>
                </tr>
                <tr>
                  <td colSpan={8} className={tdCls + ' text-right'}>TDS @ {tdsRate}%</td>
                  <td className={tdCls + ' text-right'}>{fm(tdsAmt)}</td>
                  <td colSpan={3} className={tdCls}></td>
                </tr>
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={8} className={tdCls + ' text-right font-bold text-xs'}>Net Payable (Total Basic + Total Additions + GST - TDS - Total Deductions)</td>
                  <td className={tdCls + ' text-right font-bold text-sm text-blue-800'}>{fm(netPayable)}</td>
                  <td colSpan={3} className={tdCls}></td>
                </tr>
                <tr>
                  <td colSpan={12} className={tdCls + ' italic text-xs py-2'}>
                    Rupees in words: <span className="font-semibold">{numToWords(netPayable)}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── View Modal (ERP style, same as InvoiceCalculation) ───────────────────────
function ViewModal({ calc, onClose }) {
  const [dlErr, setDlErr] = useState('')
  const handlePDF = async () => {
    setDlErr('')
    try { await downloadPdf(calc) }
    catch (e) { setDlErr(`PDF error: ${e.message}`); console.error(e) }
  }

  const machines   = calc.machines || []
  const machine    = machines[0] || {}
  const manItems   = calc.manual_items || []
  const manAddRows = manItems.filter(x => x.type === 'addition')
  const manDedRows = manItems.filter(x => x.type === 'deduction')

  const basicAmt   = machines.reduce((s, m) => s + n(m.hire_amount), 0)
  const maintDed   = machines.reduce((s, m) => s + n(m.maintenance_deduction), 0) || n(calc.maintenance_amount)
  const fuelDed    = machines.reduce((s, m) => s + n(m.fuel_deduction), 0)        || n(calc.fuel_deduction_amount)
  const manAddTot  = manAddRows.reduce((s, r) => s + n(r.amount), 0)
  const manDedTot  = manDedRows.reduce((s, r) => s + n(r.amount), 0)
  const invoiceAmt = basicAmt + manAddTot - maintDed - fuelDed - manDedTot
  const netPayable = n(calc.net_payable) || n(calc.final_total)
  const gstAmt     = n(calc.gst_amount)
  const itAmt      = n(calc.income_tax_amount)

  const invoiceTag = calc.invoice_number || calc.ra_bill_no || `#${calc.id}`
  const fmL = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const th  = 'px-3 py-2 text-[10px] font-bold text-center text-white'
  const td  = 'px-3 py-2 text-xs text-center border-b border-gray-100'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 bg-black/60 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <span className="text-sm font-bold text-gray-800">{invoiceTag} · {fmtDate(calc.period_from)} – {fmtDate(calc.period_to)}</span>
          <div className="flex items-center gap-2">
            {dlErr && <span className="text-xs text-red-500 max-w-xs truncate">{dlErr}</span>}
            <button onClick={handlePDF} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium">
              <FileText size={13}/> PDF
            </button>
            <button onClick={async () => { setDlErr(''); try { await downloadExcel(calc) } catch(e) { setDlErr(e.message) } }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium">
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
              <p className="text-xl font-black text-blue-700">{calc.invoice_number || '—'}</p>
              <p className="text-xs text-gray-400">RA Bill No: <span className="font-semibold text-gray-700">{calc.ra_bill_no || '—'}</span></p>
              <p className="text-xs text-gray-400">Date: <span className="font-semibold text-gray-700">{fmtDate(calc.invoice_date)}</span></p>
            </div>
          </div>

          {/* Two-column asset + calc card */}
          <div className="grid grid-cols-2 gap-3">
            {/* Asset details */}
            <div className="border border-blue-100 rounded-xl overflow-hidden">
              <div className="bg-blue-700 px-3 py-2">
                <p className="text-xs font-bold text-white uppercase tracking-wide">
                  {machines.length > 1 ? `Asset Details (${machines.length} Machines)` : 'Asset Details'}
                </p>
              </div>
              <div className="p-3 space-y-1.5 text-xs">
                {machines.length > 1 ? (
                  machines.map((m, i) => (
                    <div key={i} className="flex justify-between border-b border-gray-50 pb-1.5">
                      <div>
                        <p className="font-semibold text-gray-800">{m.description || m.reg_no}</p>
                        <p className="text-gray-400 font-mono text-[10px]">{m.reg_no}</p>
                      </div>
                      <p className="font-bold text-blue-700">{fm(m.hire_amount)}</p>
                    </div>
                  ))
                ) : (
                  <>
                    <Row label="Asset Name"   value={machine.description || machine.reg_no || '—'} />
                    <Row label="Asset ID"     value={machine.reg_no || '—'} />
                    <Row label="Eq. Type"     value={machine.eq_type_name || '—'} />
                    <Row label="Manufacturer" value={machine.manufacturer || '—'} />
                    <Row label="Model"        value={machine.asset_model  || '—'} />
                  </>
                )}
                <Row label="Owner / Vendor"  value={calc.display_owner_name || calc.vendor_name || '—'} />
                <Row label="WO Number"       value={calc.display_wo_number || calc.wo_number || '—'} />
                <Row label="Project"         value={calc.project_name || calc.project_code || '—'} />
              </div>
            </div>
            {/* Calc details */}
            <div className="border border-teal-100 rounded-xl overflow-hidden">
              <div className="bg-teal-600 px-3 py-2">
                <p className="text-xs font-bold text-white uppercase tracking-wide">Calculation Details</p>
              </div>
              <div className="p-3 space-y-1.5 text-xs">
                <Row label="Invoice Rule"   value={calc.rule_number ? `${calc.rule_number} · ${calc.rule_name}` : (calc.rule_name || '—')} />
                <Row label="Period"         value={`${fmtDate(calc.period_from)} to ${fmtDate(calc.period_to)}`} />
                {machines.length === 1 && <>
                  <Row label="Monthly Rate"   value={fm(machine.monthly_rate)} />
                  <Row label="Calendar Days"  value={machine.cal_days || '—'} />
                  <Row label="Working Days"   value={machine.working_days || '—'} />
                  <Row label="Actual Hours"   value={n(machine.actual_hours).toFixed(2)} />
                  <Row label="Actual KM"      value={n(machine.actual_km).toFixed(2)} />
                </>}
                <Row label="Hire Amount"    value={fm(basicAmt)} highlight />
              </div>
            </div>
          </div>

          {/* Additions */}
          {manAddRows.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-orange-100">
              <table className="w-full text-xs">
                <thead><tr className="bg-orange-500">
                  <th className={th}>Sr.</th><th className={`${th} text-left`}>Addition</th>
                  <th className={th}>Amount (₹)</th>
                </tr></thead>
                <tbody>
                  {manAddRows.map((r,i) => (
                    <tr key={i} className={i%2===0?'bg-white':'bg-orange-50/40'}>
                      <td className={td}>{i+1}</td>
                      <td className="px-3 py-2 text-xs border-b border-gray-100">{r.notes}</td>
                      <td className={`${td} font-semibold text-orange-700`}>{fmL(r.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-orange-100 font-bold">
                    <td colSpan={2} className="px-3 py-2 text-xs text-right text-orange-800">SUB TOTAL</td>
                    <td className="px-3 py-2 text-xs text-center text-orange-800">{fmL(manAddTot)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Deductions */}
          {(maintDed > 0 || fuelDed > 0 || manDedRows.length > 0) && (
            <div className="overflow-hidden rounded-xl border border-red-100">
              <table className="w-full text-xs">
                <thead><tr className="bg-red-600">
                  <th className={th}>Sr.</th><th className={`${th} text-left`}>Deduction</th>
                  <th className={th}>Amount (₹)</th>
                </tr></thead>
                <tbody>
                  {maintDed > 0 && (
                    <tr className="bg-white border-b border-gray-100">
                      <td className={td}>1</td>
                      <td className="px-3 py-2 text-xs">Maintenance / Breakdown Deduction</td>
                      <td className={`${td} font-semibold text-red-700`}>{fmL(maintDed)}</td>
                    </tr>
                  )}
                  {fuelDed > 0 && (
                    <tr className="bg-red-50/30 border-b border-gray-100">
                      <td className={td}>{maintDed > 0 ? 2 : 1}</td>
                      <td className="px-3 py-2 text-xs">Fuel Deduction</td>
                      <td className={`${td} font-semibold text-red-700`}>{fmL(fuelDed)}</td>
                    </tr>
                  )}
                  {manDedRows.map((r, i) => (
                    <tr key={i} className={i%2===0?'bg-white':'bg-red-50/30'}>
                      <td className={td}>{i + (maintDed>0?1:0) + (fuelDed>0?1:0) + 1}</td>
                      <td className="px-3 py-2 text-xs border-b border-gray-100">{r.notes}</td>
                      <td className={`${td} font-semibold text-red-700`}>{fmL(r.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-red-100 font-bold">
                    <td colSpan={2} className="px-3 py-2 text-xs text-right text-red-800">TOTAL DEDUCTIONS</td>
                    <td className="px-3 py-2 text-xs text-center text-red-800">{fmL(maintDed + fuelDed + manDedTot)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Invoice Amount + Total */}
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-3 border border-blue-200 rounded-xl overflow-hidden bg-blue-50">
              <div className="bg-blue-700 px-3 py-2">
                <p className="text-xs font-bold text-white uppercase tracking-wide">Invoice Amount</p>
              </div>
              <div className="p-4">
                <p className="text-3xl font-black text-teal-600 text-center mb-3">₹ {fmL(invoiceAmt)}</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between border-t border-blue-200 pt-2">
                    <span className="text-gray-600">Hire Amount</span>
                    <span className="font-semibold">₹ {fmL(basicAmt)}</span>
                  </div>
                  {manAddTot > 0 && <div className="flex justify-between"><span className="text-green-600">+ Additions</span><span className="font-semibold text-green-700">₹ {fmL(manAddTot)}</span></div>}
                  {(maintDed + fuelDed + manDedTot) > 0 && <div className="flex justify-between"><span className="text-red-600">− Deductions</span><span className="font-semibold text-red-700">₹ {fmL(maintDed + fuelDed + manDedTot)}</span></div>}
                  <div className="flex justify-between border-t border-blue-200 pt-1.5">
                    <span className="text-gray-500">GST @ {n(calc.gst_rate)||18}%</span>
                    <span className="font-semibold text-blue-700">₹ {fmL(gstAmt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Gross Payable</span>
                    <span className="font-semibold">₹ {fmL(invoiceAmt + gstAmt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-500">Income Tax @ {n(calc.income_tax_rate)||2}%</span>
                    <span className="font-semibold text-red-600">− ₹ {fmL(itAmt)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-span-2 bg-[#12162a] rounded-xl p-5 flex flex-col justify-center">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 text-center">Net Payable</p>
              <p className="text-3xl font-black text-teal-400 text-center">₹ {fmL(netPayable)}</p>
              {calc.remarks && <p className="text-[10px] text-gray-500 text-center mt-3 italic">{calc.remarks}</p>}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className={`font-semibold text-right ${highlight ? 'text-blue-700' : 'text-gray-800'}`}>{value}</span>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function GeneratedInvoices() {
  const { isAdmin }    = useAuth()
  const [invoices,     setInvoices]    = useState([])
  const [loading,      setLoading]     = useState(false)
  const [search,       setSearch]      = useState('')
  const [filterFrom,   setFilterFrom]  = useState('')
  const [filterTo,     setFilterTo]    = useState('')
  const [viewData,     setViewData]    = useState(null)
  const [loadingView,  setLoadingView] = useState(null) // id being loaded
  const [delId,        setDelId]       = useState(null)
  const [deleting,     setDeleting]    = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await getInvoiceCalcs(); setInvoices(r.data.data || []) }
    catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openView = async (id) => {
    setLoadingView(id)
    try {
      const r = await getInvoiceCalc(id)
      setViewData(r.data.data || r.data)
    } catch {}
    finally { setLoadingView(null) }
  }

  const handleDelete = async () => {
    if (!delId) return
    setDeleting(true)
    try { await deleteInvoiceCalc(delId); setDelId(null); load() }
    catch {} finally { setDeleting(false) }
  }

  // Filter logic
  const filtered = invoices.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || [c.invoice_number, c.ra_bill_no, c.machine_nickname, c.vendor_name,
                           c.project_code, c.project_name, c.rule_number, c.rule_name,
                           c.created_by_name].some(v => (v||'').toLowerCase().includes(q))
    const fromOk = !filterFrom || (c.period_from && c.period_from >= filterFrom)
    const toOk   = !filterTo   || (c.period_to   && c.period_to   <= filterTo)
    return matchQ && fromOk && toOk
  })

  const totalNet = filtered.reduce((s, c) => s + n(c.net_payable || c.final_total), 0)

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* PAGE HEADER */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-700 rounded-xl">
              <Receipt size={20} className="text-white"/>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Generated Invoices</h1>
              <p className="text-xs text-gray-500">All saved invoice calculations · {invoices.length} total</p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-white">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
            Refresh
          </button>
        </div>

        {/* FILTER BAR */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400"/>
                <input
                  className={`${inp} pl-8 w-full`}
                  placeholder="Invoice No., RA Bill, Asset, Vendor, Project…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            {/* Period From */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Period From</label>
              <input type="date" className={inp} value={filterFrom} onChange={e => setFilterFrom(e.target.value)}/>
            </div>
            {/* Period To */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Period To</label>
              <input type="date" className={inp} value={filterTo} onChange={e => setFilterTo(e.target.value)}/>
            </div>
            {(search || filterFrom || filterTo) && (
              <button onClick={() => { setSearch(''); setFilterFrom(''); setFilterTo('') }}
                className="flex items-center gap-1 px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                <X size={12}/> Clear
              </button>
            )}
          </div>
        </div>

        {/* SUMMARY STRIP */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Total Net Payable</p>
              <p className="text-2xl font-bold text-blue-700">{fm(totalNet)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Showing</p>
              <p className="text-2xl font-bold text-gray-700">{filtered.length} of {invoices.length}</p>
            </div>
          </div>
        )}

        {/* INVOICE TABLE */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">Invoice List</p>
            <span className="text-xs text-gray-400">{filtered.length} records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-blue-700 text-white">
                  <th className="px-3 py-3 text-center font-semibold w-8">#</th>
                  <th className="px-3 py-3 text-left font-semibold">Invoice No.</th>
                  <th className="px-3 py-3 text-left font-semibold">RA Bill No.</th>
                  <th className="px-3 py-3 text-left font-semibold">Asset / Owner</th>
                  <th className="px-3 py-3 text-left font-semibold">Project</th>
                  <th className="px-3 py-3 text-left font-semibold">Invoice Rule</th>
                  <th className="px-3 py-3 text-left font-semibold">Period</th>
                  <th className="px-3 py-3 text-left font-semibold">Invoice Date</th>
                  <th className="px-3 py-3 text-right font-semibold">Net Payable</th>
                  <th className="px-3 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="py-12 text-center text-gray-400">
                    <RefreshCw size={18} className="inline animate-spin mr-2"/>Loading invoices…
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="py-12 text-center text-gray-400">
                    <Receipt size={28} className="mx-auto mb-2 text-gray-200"/>
                    {invoices.length === 0 ? 'No invoices generated yet.' : 'No results match your filter.'}
                  </td></tr>
                ) : filtered.map((c, i) => (
                  <tr key={c.id} className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${i%2===0?'bg-white':'bg-gray-50/40'}`}>
                    <td className="px-3 py-3 text-center text-gray-400 font-medium">{i+1}</td>
                    <td className="px-3 py-3">
                      <span className="font-bold text-blue-700">{c.invoice_number || '—'}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-semibold text-gray-700">{c.ra_bill_no || '—'}</span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-gray-800">{c.machine_nickname || '—'}</p>
                      {(c.vendor_name || c.display_owner_name) && (
                        <p className="text-gray-400 text-[10px]">{c.vendor_name || c.display_owner_name}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-600">{c.project_code || c.project_name || '—'}</td>
                    <td className="px-3 py-3">
                      {c.rule_number ? (
                        <div>
                          <p className="font-semibold text-gray-700">{c.rule_number}</p>
                          <p className="text-gray-400 text-[10px]">{c.rule_name}</p>
                        </div>
                      ) : (c.rule_name || '—')}
                    </td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      {fmtDate(c.period_from)} – {fmtDate(c.period_to)}
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{fmtDate(c.invoice_date)}</td>
                    <td className="px-3 py-3 text-right font-bold text-blue-800 whitespace-nowrap">
                      {fm(c.net_payable || c.final_total)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openView(c.id)}
                          disabled={loadingView === c.id}
                          title="View Invoice"
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {loadingView === c.id
                            ? <RefreshCw size={13} className="animate-spin"/>
                            : <Eye size={13}/>}
                        </button>
                        <button
                          onClick={async () => {
                            setLoadingView(c.id)
                            try { const r = await getInvoiceCalc(c.id); await downloadPdf(r.data.data || r.data) }
                            catch (e) { console.error(e) }
                            finally { setLoadingView(null) }
                          }}
                          disabled={loadingView === c.id}
                          title="Download PDF"
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <FileDown size={13}/>
                        </button>
                        <button
                          onClick={async () => {
                            setLoadingView(c.id)
                            try { const r = await getInvoiceCalc(c.id); await downloadExcel(r.data.data || r.data) }
                            catch (e) { console.error(e) }
                            finally { setLoadingView(null) }
                          }}
                          disabled={loadingView === c.id}
                          title="Download Excel"
                          className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <FileSpreadsheet size={13}/>
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => setDelId(c.id)}
                            title="Delete"
                            className="p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                          >
                            <Trash2 size={13}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold text-xs">
                    <td colSpan={8} className="px-3 py-3 text-right text-gray-600">
                      Total ({filtered.length} invoices)
                    </td>
                    <td className="px-3 py-3 text-right text-blue-800 text-sm">{fm(totalNet)}</td>
                    <td/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

      </div>

      {/* VIEW MODAL */}
      {viewData && (
        viewData.display_ownership === 'Own'
          ? <OwnershipBillModal calc={viewData} onClose={() => setViewData(null)} onUpdated={load}/>
          : <ViewModal calc={viewData} onClose={() => setViewData(null)}/>
      )}

      {/* DELETE CONFIRM */}
      {delId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-xl"><Trash2 size={18} className="text-red-600"/></div>
              <div>
                <p className="font-bold text-gray-900 text-sm">Delete Invoice?</p>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDelId(null)} className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg">
                {deleting ? <RefreshCw size={13} className="animate-spin"/> : <Trash2 size={13}/>}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
