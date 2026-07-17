import { useState, useEffect } from 'react'
import React from 'react'
import {
  Building2, Check, RefreshCw, FileText,
  Users, Calculator, Printer, ClipboardList, Link2, Download, Plus, Trash2,
  Search, ChevronDown
} from 'lucide-react'
import {
  getOwnershipVendors, getOwnershipMachines, getInvoiceRules,
  getDirectPreview, createInvoiceCalc, getNextRaBillNo, getHireWorkOrders
} from '../../lib/api'
import { downloadHireBillOwnershipPdf } from './hireBillOwnershipPdf'

const nv = v => parseFloat(v) || 0
const fm = v => '₹ ' + nv(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]

function localISO(d) {
  const y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0')
  return `${y}-${mo}-${day}`
}
function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`
}
function fmtMonthYear(d) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return `${months[dt.getMonth()]}-${String(dt.getFullYear()).slice(-2)}`
}
function numToWords(amount) {
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  function iw(n){if(n<20)return a[n];if(n<100)return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');if(n<1000)return a[Math.floor(n/100)]+' Hundred'+(n%100?' '+iw(n%100):'');if(n<100000)return iw(Math.floor(n/1000))+' Thousand'+(n%1000?' '+iw(n%1000):'');if(n<1e7)return iw(Math.floor(n/100000))+' Lakh'+(n%100000?' '+iw(n%100000):'');return iw(Math.floor(n/1e7))+' Crore'+(n%1e7?' '+iw(n%1e7):'')}
  const whole=Math.round(Math.abs(amount));return(whole===0?'Zero':iw(whole))+' Only/-'
}

const getMachineCalc = mac => {
  const cDays      = nv(mac.cal_days) || 30
  const dailyRate  = cDays > 0 ? nv(mac.monthly_rate) / cDays : 0
  const monthAmt   = nv(mac.working_days) * dailyRate
  const plannedHrs = nv(mac.planned_hrs_month)
  const exHrs      = nv(mac.hours_rate) > 0 ? Math.max(0, nv(mac.actual_hours) - plannedHrs) : 0
  const hoursAmt   = exHrs * nv(mac.hours_rate)
  const plannedKm  = nv(mac.planned_km_month)
  const exKm       = nv(mac.km_rate) > 0 && plannedKm > 0 ? Math.max(0, nv(mac.actual_km) - plannedKm) : 0
  const kmAmt      = exKm * nv(mac.km_rate)
  const macBasic   = monthAmt + hoursAmt + kmAmt
  const fuelAmt    = mac.fuel_applicable ? nv(mac.diesel_qty) * nv(mac.fuel_deduction_rate) : 0
  const actualFuelLtrHr = nv(mac.actual_hours) > 0 ? nv(mac.diesel_qty) / nv(mac.actual_hours) : 0
  const utilPct    = plannedHrs > 0 ? (nv(mac.actual_hours) / plannedHrs) * 100
                   : plannedKm  > 0 ? (nv(mac.actual_km)    / plannedKm)  * 100 : 0
  const excessDays = Math.max(0, nv(mac.working_days) - cDays)
  return { cDays, dailyRate, monthAmt, plannedHrs, exHrs, hoursAmt, plannedKm, exKm, kmAmt, macBasic, fuelAmt, actualFuelLtrHr, utilPct, excessDays }
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const tdCls = 'border border-gray-400 px-2 py-1 text-xs'

export default function InvoiceCalculationOwnership() {
  const [vendors,          setVendors]         = useState([])
  const [allRules,         setAllRules]        = useState([])
  const [selectedVendor,  setSelectedVendor]  = useState('')
  const [vendorSearch,     setVendorSearch]    = useState('')
  const [vendorOpen,       setVendorOpen]      = useState(false)
  const [dateFrom,         setDateFrom]        = useState('')
  const [dateTo,           setDateTo]          = useState('')
  const [vendorMachines,  setVendorMachines]  = useState([])
  const [selectedIds,      setSelectedIds]     = useState(new Set())
  const [machineRules,     setMachineRules]    = useState({})
  const [loading,          setLoading]         = useState(false)
  const [calculating,      setCalculating]     = useState(false)
  const [reportData,       setReportData]      = useState(null)
  const [saving,           setSaving]          = useState(false)
  const [saveErr,          setSaveErr]         = useState('')
  const [saved,            setSaved]           = useState(false)
  const [billForm,         setBillForm]        = useState({ gst_rate:'18', income_tax_rate:'2', remarks:'' })
  const [vendorDetails,    setVendorDetails]   = useState({ gst_no:'', bank_name:'', bank_account:'', bank_ifsc:'' })
  const [manualAdditions,  setManualAdditions] = useState([])
  const [manualDeductions, setManualDeductions]= useState([])
  const [nextRaBillNo,     setNextRaBillNo]    = useState('')
  const [woList,           setWoList]          = useState([])
  const [woFetching,       setWoFetching]      = useState(false)
  const [selectedWoId,     setSelectedWoId]    = useState('')
  const [woMode,           setWoMode]          = useState('') // '' | 'auto' | 'manual'
  const [manualWo,         setManualWo]        = useState({ wo_number: '', wo_date: '' })

  useEffect(() => {
    getOwnershipVendors().then(r => setVendors(r.data.data || [])).catch(() => {})
    getInvoiceRules({ active: true }).then(r => setAllRules(r.data.data || r.data || [])).catch(() => {})
  }, [])

  const filteredVendors = vendors.filter(v =>
    !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase())
  )

  const fetchVendorWOs = async vendorName => {
    if (!vendorName) { setWoList([]); setWoMode(''); return }
    setWoFetching(true)
    try {
      const r = await getHireWorkOrders({ vendor_name: vendorName })
      const wos = r.data.data || []
      setWoList(wos)
      if (wos.length > 0) {
        setWoMode('auto')
        setSelectedWoId(String(wos[0].id))
      } else {
        setWoMode('manual')
        setSelectedWoId('')
      }
    } catch { setWoList([]); setWoMode('manual') }
    finally { setWoFetching(false) }
  }

  const handleVendorSelect = v => {
    setSelectedVendor(v.name)
    setVendorSearch(v.name)
    setVendorOpen(false)
    setVendorMachines([])
    setReportData(null)
    setSaved(false)
    setWoList([])
    setWoMode('')
    setSelectedWoId('')
    setManualWo({ wo_number: '', wo_date: '' })
    fetchVendorWOs(v.name)
  }

  const fetchVendorMachines = async () => {
    if (!selectedVendor) return
    setLoading(true)
    setReportData(null)
    setSaved(false)
    try {
      const r = await getOwnershipMachines(selectedVendor)
      const machines = r.data.data || []
      setVendorMachines(machines)
      const ruleMap = {}
      machines.forEach(m => { if (m.rule_id) ruleMap[m.id] = String(m.rule_id) })
      setMachineRules(ruleMap)
      setSelectedIds(new Set(machines.map(m => m.id)))
    } catch { setVendorMachines([]) }
    finally { setLoading(false) }
  }

  const toggleMachine = id => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  const toggleAll = () => {
    if (vendorMachines.every(m => selectedIds.has(m.id))) setSelectedIds(new Set())
    else setSelectedIds(new Set(vendorMachines.map(m => m.id)))
  }
  const setMachineRule = (machineId, ruleId) => {
    setMachineRules(prev => ({ ...prev, [machineId]: ruleId }))
    setReportData(null)
  }

  const readyMachines = vendorMachines.filter(m => selectedIds.has(m.id) && machineRules[m.id])
  const missingRule   = vendorMachines.filter(m => selectedIds.has(m.id) && !machineRules[m.id])

  const handleCalculate = async () => {
    if (!dateFrom || !dateTo) { alert('Please select a date range'); return }
    if (!readyMachines.length) { alert('Select at least one machine and assign an invoice rule'); return }
    setCalculating(true)
    setReportData(null)
    setSaveErr('')
    setSaved(false)
    try {
      const machine_rules = readyMachines.map(m => ({
        machine_id: m.id,
        rule_id:    parseInt(machineRules[m.id]),
      }))
      const r = await getDirectPreview({ machine_rules, from: dateFrom, to: dateTo })
      setReportData(r.data.data)
      // Fetch next RA bill number for this vendor (preview only; backend assigns atomically on save)
      if (selectedVendor) {
        getNextRaBillNo(selectedVendor).then(nr => setNextRaBillNo(nr.data.next_ra || '')).catch(() => {})
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Calculation failed')
    } finally { setCalculating(false) }
  }

  // ── Derived calculations ────────────────────────────────────────────────────
  const previewMachines = reportData?.machines || []
  const machineCalcs    = previewMachines.map(getMachineCalc)

  const totalBasic          = machineCalcs.reduce((s, c) => s + c.macBasic, 0)
  const manAddTotal         = manualAdditions.reduce((s, x) => s + nv(x.amount), 0)
  const manDedTotal         = manualDeductions.reduce((s, x) => s + nv(x.amount), 0)
  const totalBreakdownDays  = previewMachines.reduce((s, m) => s + nv(m.breakdown_days), 0)
  const totalBreakdownAmt   = previewMachines.reduce((s, m) => s + nv(m.maintenance_deduction), 0)
  const totalFuelAmt        = machineCalcs.reduce((s, c) => s + c.fuelAmt, 0)
  const totalDeductions     = totalBreakdownAmt + totalFuelAmt + manDedTotal
  const gstRate             = nv(billForm.gst_rate)
  const tdsRate             = nv(billForm.income_tax_rate)
  const gstAmt              = totalBasic * gstRate / 100
  const tdsAmt              = totalBasic * tdsRate / 100
  const netPayable          = totalBasic + manAddTotal + gstAmt - tdsAmt - totalDeductions

  // WO display values
  const activeWo       = woMode === 'auto' ? woList.find(w => String(w.id) === selectedWoId) : null
  const displayWoNum   = woMode === 'manual' ? manualWo.wo_number : (activeWo?.wo_number || '')
  const displayWoDate  = woMode === 'manual' ? manualWo.wo_date   : (activeWo?.wo_date?.split('T')[0] || '')

  const handleSave = async () => {
    setSaving(true); setSaveErr('')
    try {
      const saved = await createInvoiceCalc({
        period_from:           dateFrom,
        period_to:             dateTo,
        rule_id:               parseInt(machineRules[readyMachines[0]?.id]) || null,
        display_owner_name:    selectedVendor,
        display_ownership:     'Own',
        display_wo_number:     displayWoNum  || null,
        display_wo_date:       displayWoDate || null,
        manual_gst_no:         vendorDetails.gst_no     || null,
        manual_bank_name:      vendorDetails.bank_name  || null,
        manual_bank_account:   vendorDetails.bank_account || null,
        manual_bank_ifsc:      vendorDetails.bank_ifsc  || null,
        invoice_date:          today(),
        invoice_number:        '',
        ra_bill_no:            '',
        remarks:               billForm.remarks,
        status:                'final',
        gst_rate:              billForm.gst_rate,
        gst_amount:            gstAmt,
        gross_payable:         totalBasic + gstAmt,
        income_tax_rate:       billForm.income_tax_rate,
        income_tax_amount:     tdsAmt,
        maintenance_amount:    totalBreakdownAmt,
        stores_amount:         0,
        advance_amount:        0,
        fuel_deduction_amount: totalFuelAmt,
        total_recoveries:      tdsAmt,
        net_payable:           netPayable,
        basic_amount:          totalBasic,
        final_total:           netPayable,
        machines: previewMachines.map((mac, i) => {
          const calc = machineCalcs[i]
          return {
            machine_id:               mac.machine_id,
            reg_no:                   mac.reg_no || '',
            description:              mac.description || '',
            unit:                     'Month',
            monthly_rate:             mac.monthly_rate,
            cal_days:                 mac.cal_days,
            working_days:             mac.working_days,
            hire_amount:              calc.macBasic,
            diesel_qty:               mac.diesel_qty,
            actual_hours:             mac.actual_hours,
            actual_km:                mac.actual_km,
            planned_hrs_month:        mac.planned_hrs_month,
            utilization_pct:          mac.utilization_pct,
            breakdown_days:           mac.breakdown_days,
            allowed_maintenance_days: mac.allowed_maintenance_days,
            maintenance_deduction:    mac.maintenance_deduction,
            fuel_deduction:           calc.fuelAmt,
          }
        }),
        manual_items: [
          ...manualAdditions.map(x => ({ notes: x.label, amount: nv(x.amount), type: 'addition' })),
          ...manualDeductions.map(x => ({ notes: x.label, amount: nv(x.amount), type: 'deduction' })),
        ],
      })
      // Show the actual assigned RA bill number
      const assignedRa = saved.data?.data?.ra_bill_no
      if (assignedRa) setNextRaBillNo(assignedRa)
      setSaved(true)
    } catch (e) { setSaveErr(e.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  const handleDownloadPdf = () => {
    const firstMac = previewMachines[0] || {}
    downloadHireBillOwnershipPdf({
      vendor: selectedVendor,
      vendorDetails,
      previewMachines,
      machineCalcs,
      dateFrom,
      dateTo,
      totalBasic,
      totalBreakdownDays,
      totalBreakdownAmt,
      totalFuelAmt,
      totalDeductions,
      totalAdditions: manAddTotal,
      gstRate,
      gstAmt,
      tdsRate,
      tdsAmt,
      netPayable,
      manualAdditions,
      manualDeductions,
      billForm,
      raBillNo: nextRaBillNo,
      projectCode: firstMac.project_code || '',
      projectName: firstMac.project_name || '',
      woNumber: displayWoNum || '',
      woDate: displayWoDate || '',
    })
  }

  // Manual rows helpers
  const addManualAddition  = () => setManualAdditions(prev => [...prev, { label:'', amount:'' }])
  const addManualDeduction = () => setManualDeductions(prev => [...prev, { label:'', amount:'' }])
  const updateManualAdd    = (i, field, val) => setManualAdditions(prev => prev.map((x,idx) => idx===i ? {...x,[field]:val} : x))
  const updateManualDed    = (i, field, val) => setManualDeductions(prev => prev.map((x,idx) => idx===i ? {...x,[field]:val} : x))
  const removeManualAdd    = i => setManualAdditions(prev => prev.filter((_,idx) => idx!==i))
  const removeManualDed    = i => setManualDeductions(prev => prev.filter((_,idx) => idx!==i))

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 p-6">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* PAGE HEADER */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-700 rounded-xl">
            <Users size={20} className="text-white"/>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Invoice Calculation (Ownership)</h1>
            <p className="text-xs text-gray-500">Generate hire bill abstract for vendor with multiple assets</p>
          </div>
        </div>

        {/* FILTER CARD */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Select Vendor</label>
              <div className="relative">
                <div className={`flex items-center border rounded-lg overflow-hidden bg-white ${selectedVendor ? 'border-green-400' : 'border-gray-300'} focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-400`}>
                  <Search size={13} className="ml-3 text-gray-400 shrink-0"/>
                  <input
                    className="flex-1 px-2 py-2 text-sm outline-none placeholder-gray-400 bg-transparent"
                    placeholder="Search vendor…"
                    value={vendorSearch}
                    onFocus={() => setVendorOpen(true)}
                    onChange={e => {
                      setVendorSearch(e.target.value)
                      setVendorOpen(true)
                      if (!e.target.value) { setSelectedVendor(''); setVendorMachines([]); setReportData(null); setSaved(false) }
                    }}
                    onBlur={() => setTimeout(() => setVendorOpen(false), 150)}
                  />
                  {selectedVendor && <Check size={13} className="mr-2.5 text-green-500 shrink-0"/>}
                </div>
                {vendorOpen && filteredVendors.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-20 max-h-52 overflow-y-auto mt-1">
                    {filteredVendors.map(v => (
                      <button key={v.name} onMouseDown={() => handleVendorSelect(v)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0 font-medium ${selectedVendor===v.name ? 'text-blue-700 bg-blue-50' : 'text-gray-800'}`}>
                        {v.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Date From</label>
              <input type="date" className={inp} value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Date To</label>
              <input type="date" className={inp} value={dateTo} onChange={e => setDateTo(e.target.value)}/>
            </div>
          </div>

          {/* Work Order section */}
          {selectedVendor && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-blue-100">
                <div className="flex items-center gap-2">
                  <FileText size={13} className="text-blue-700"/>
                  <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">Work Order</span>
                </div>
                <div className="flex items-center gap-2">
                  {woFetching && <RefreshCw size={12} className="animate-spin text-blue-500"/>}
                  {!woFetching && woMode === 'auto' && <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">Auto-fetched ({woList.length})</span>}
                  {!woFetching && woMode === 'manual' && <span className="text-[10px] bg-yellow-100 text-yellow-700 font-bold px-2 py-0.5 rounded-full">Manual Entry</span>}
                </div>
              </div>
              {woFetching && (
                <div className="px-4 py-3 text-xs text-gray-400 italic flex items-center gap-2">
                  <RefreshCw size={11} className="animate-spin"/> Fetching work orders…
                </div>
              )}
              {!woFetching && woMode === 'auto' && (
                <div className="px-4 py-3 flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">Select Work Order</label>
                    <div className="relative">
                      <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedWoId} onChange={e => setSelectedWoId(e.target.value)}>
                        {woList.map(w => (
                          <option key={w.id} value={String(w.id)}>
                            {w.wo_number} · {fmtDate(w.wo_date?.split('T')[0])}{w.project_code ? ` · ${w.project_code}` : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                    </div>
                  </div>
                  <button onClick={() => { setWoMode('manual'); setManualWo({ wo_number: activeWo?.wo_number || '', wo_date: activeWo?.wo_date?.split('T')[0] || '' }) }}
                    className="text-xs text-blue-600 hover:underline pb-2 shrink-0">
                    Enter manually
                  </button>
                </div>
              )}
              {!woFetching && woMode === 'manual' && (
                <div className="px-4 py-3 flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">WO Number</label>
                    <input className={inp} value={manualWo.wo_number}
                      onChange={e => setManualWo(p => ({...p, wo_number: e.target.value}))} placeholder="e.g. WO/2024/001"/>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">WO Date</label>
                    <input type="date" className={inp} value={manualWo.wo_date}
                      onChange={e => setManualWo(p => ({...p, wo_date: e.target.value}))}/>
                  </div>
                  {woList.length > 0 && (
                    <button onClick={() => { setWoMode('auto'); setSelectedWoId(String(woList[0].id)) }}
                      className="text-xs text-blue-600 hover:underline pb-2 shrink-0">
                      Use WO list
                    </button>
                  )}
                </div>
              )}
              <p className="px-4 py-1.5 text-[10px] text-gray-400 bg-gray-50 border-t border-gray-100">
                approved work orders will automatically fetch
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-medium">Quick:</span>
            {['This Month','Last Month'].map(label => {
              const now = new Date()
              const range = label === 'This Month'
                ? { from: localISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: localISO(new Date(now.getFullYear(), now.getMonth()+1, 0)) }
                : { from: localISO(new Date(now.getFullYear(), now.getMonth()-1, 1)), to: localISO(new Date(now.getFullYear(), now.getMonth(), 0)) }
              return (
                <button key={label} onClick={() => { setDateFrom(range.from); setDateTo(range.to) }}
                  className="px-3 py-1 text-xs border border-gray-200 rounded-full text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700">
                  {label}
                </button>
              )
            })}
          </div>

          <div className="flex gap-3 items-center">
            <button
              onClick={fetchVendorMachines}
              disabled={!selectedVendor || loading}
              className="flex items-center gap-2 px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
            >
              {loading ? <RefreshCw size={14} className="animate-spin"/> : <Building2 size={14}/>}
              {loading ? 'Loading…' : 'Fetch Assets'}
            </button>
            {vendorMachines.length > 0 && (
              <span className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
                <Check size={13}/> {vendorMachines.length} assets found
              </span>
            )}
          </div>
        </div>

        {/* MACHINE TABLE */}
        {vendorMachines.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-blue-700">
              <div className="flex items-center gap-2">
                <ClipboardList size={15} className="text-white"/>
                <span className="text-sm font-bold text-white">Assets for {selectedVendor}</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-white cursor-pointer font-medium">
                <input type="checkbox" className="w-3.5 h-3.5"
                  checked={vendorMachines.length > 0 && vendorMachines.every(m => selectedIds.has(m.id))}
                  onChange={toggleAll}/>
                Select All
              </label>
            </div>

            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-start gap-2 text-xs text-amber-800">
              <Link2 size={13} className="mt-0.5 shrink-0 text-amber-600"/>
              <span>
                <strong>Assign Invoice Rule per machine</strong> — if a rule was pre-linked to the machine it is auto-selected.
                You can change it or pick one for machines without a rule using the dropdown below.
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-[10px] tracking-wide">
                    <th className="px-3 py-2.5 w-8"></th>
                    <th className="px-3 py-2.5 text-left">#</th>
                    <th className="px-3 py-2.5 text-left">Asset</th>
                    <th className="px-3 py-2.5 text-left">Asset ID</th>
                    <th className="px-3 py-2.5 text-left min-w-[220px]">Invoice Rule</th>
                    <th className="px-3 py-2.5 text-right">Monthly Rate</th>
                    <th className="px-3 py-2.5 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorMachines.map((m, i) => {
                    const checked    = selectedIds.has(m.id)
                    const assignedId = machineRules[m.id] || ''
                    const previewM   = previewMachines.find(pm => pm.machine_id === m.id)
                    const calcM      = previewM ? getMachineCalc(previewM) : null
                    const isAutoLinked = !!m.rule_id && String(m.rule_id) === assignedId
                    return (
                      <tr key={m.id} className={`border-b border-gray-100 ${checked ? 'bg-blue-50/30' : 'opacity-60'} hover:bg-gray-50 transition-colors`}>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600"
                            checked={checked} onChange={() => toggleMachine(m.id)}/>
                        </td>
                        <td className="px-3 py-2.5 text-gray-400">{i+1}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-gray-800">{m.nickname || m.slno}</p>
                          <p className="text-gray-400">{m.eq_type_name || m.eq_type}</p>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-blue-700">{m.slno}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <select
                              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                              value={assignedId}
                              onChange={e => setMachineRule(m.id, e.target.value)}
                              onClick={e => e.stopPropagation()}
                            >
                              <option value="">— Select rule —</option>
                              {allRules.map(r => (
                                <option key={r.id} value={String(r.id)}>
                                  {r.rule_number} · {r.rule_name}
                                </option>
                              ))}
                            </select>
                            {isAutoLinked && (
                              <span className="shrink-0 text-[9px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">AUTO</span>
                            )}
                          </div>
                          {!assignedId && checked && (
                            <p className="text-amber-600 text-[10px] mt-1 font-medium">⚠ Rule required to calculate</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-600">
                          {assignedId ? (() => {
                            const r = allRules.find(r => String(r.id) === assignedId)
                            return r ? `₹ ${nv(r.basic_rate).toLocaleString('en-IN',{maximumFractionDigits:0})}/mo` : '—'
                          })() : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold">
                          {calcM !== null && calcM
                            ? <span className="text-blue-700">{fm(calcM.macBasic)}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 text-xs">
                    <td colSpan={4} className="px-3 py-2.5 text-gray-500">
                      {readyMachines.length} of {vendorMachines.length} machines ready
                      {missingRule.length > 0 && <span className="text-amber-600 ml-2">· {missingRule.length} missing rule</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500 font-medium">Total Basic</td>
                    <td/>
                    <td className="px-3 py-2.5 text-right font-bold text-blue-800 text-sm">
                      {previewMachines.length > 0 ? fm(totalBasic) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* CALCULATE BUTTON */}
        {vendorMachines.length > 0 && (
          <div className="flex justify-center">
            <button
              onClick={handleCalculate}
              disabled={calculating || readyMachines.length === 0 || !dateFrom || !dateTo}
              className="flex items-center gap-2 px-8 py-3 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-md"
            >
              {calculating ? <RefreshCw size={16} className="animate-spin"/> : <Calculator size={16}/>}
              {calculating ? 'Calculating…' : `Calculate Invoice (${readyMachines.length} machines)`}
            </button>
          </div>
        )}

        {/* ── BILL VIEW (document style) ─────────────────────────────────── */}
        {reportData && (() => {
          const firstMac    = previewMachines[0] || {}
          const projectCode = firstMac.project_code || ''
          const projectName = firstMac.project_name || ''
          const monthLabel  = dateFrom ? fmtMonthYear(dateFrom) : ''
          const fuelMachines = previewMachines.filter((m, i) => m.fuel_applicable && machineCalcs[i].fuelAmt > 0)
          const fuelLabels   = ['a','b','c','d','e','f','g','h','i','j']

          return (
            <div className="space-y-4">
              {/* Vendor details inputs (above document) */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Vendor / Bank Details (for bill header)</h3>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">GST No.</label>
                    <input className={inp} value={vendorDetails.gst_no} onChange={e => setVendorDetails(p=>({...p,gst_no:e.target.value}))} placeholder="GST Number"/>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Bank Name</label>
                    <input className={inp} value={vendorDetails.bank_name} onChange={e => setVendorDetails(p=>({...p,bank_name:e.target.value}))} placeholder="Bank Name"/>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">A/C No.</label>
                    <input className={inp} value={vendorDetails.bank_account} onChange={e => setVendorDetails(p=>({...p,bank_account:e.target.value}))} placeholder="Account Number"/>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">IFSC Code</label>
                    <input className={inp} value={vendorDetails.bank_ifsc} onChange={e => setVendorDetails(p=>({...p,bank_ifsc:e.target.value}))} placeholder="IFSC Code"/>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">GST Rate (%)</label>
                    <input type="number" className={inp} value={billForm.gst_rate} onChange={e=>setBillForm(f=>({...f,gst_rate:e.target.value}))}/>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">TDS / Income Tax Rate (%)</label>
                    <input type="number" className={inp} value={billForm.income_tax_rate} onChange={e=>setBillForm(f=>({...f,income_tax_rate:e.target.value}))}/>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Remarks</label>
                    <input className={inp} value={billForm.remarks} onChange={e=>setBillForm(f=>({...f,remarks:e.target.value}))} placeholder="Optional"/>
                  </div>
                </div>
              </div>

              {/* ── DOCUMENT CARD ─────────────────────────────────────────── */}
              <div className="bg-white border-2 border-gray-700 p-0 rounded overflow-hidden">
                <table className="w-full border-collapse text-xs" style={{borderCollapse:'collapse'}}>
                  <tbody>
                    {/* Title rows */}
                    <tr>
                      <td colSpan={12} className="border border-gray-400 py-2 text-center font-bold text-base">
                        RVR PROJECTS PVT LTD
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={12} className="border border-gray-400 py-1 text-center text-xs">
                        PROJECT: {projectCode} {projectName}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={12} className="border border-gray-400 py-1 text-center font-bold text-xs">
                        HIRE BILL ABSTRACT FOR THE MONTH OF {monthLabel}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={12} className="border border-gray-400 py-1 text-center text-xs">
                        (Period {fmtDate(dateFrom)} to {fmtDate(dateTo)})
                      </td>
                    </tr>

                    {/* Two-column info block */}
                    <tr>
                      <td colSpan={6} className={tdCls + ' align-top'}>
                        <div className="space-y-0.5">
                          <div><span className="font-semibold">Ownership:</span> {selectedVendor}</div>
                          <div><span className="font-semibold">Asset:</span> {previewMachines.map(m => m.description || m.reg_no).join(', ')}</div>
                          <div><span className="font-semibold">GST. No.:</span> {vendorDetails.gst_no || <span className="text-gray-400 italic">—</span>}</div>
                          <div><span className="font-semibold">BANK DETAILS:</span> {vendorDetails.bank_name || <span className="text-gray-400 italic">—</span>}</div>
                          <div><span className="font-semibold">A/C NO:</span> {vendorDetails.bank_account || <span className="text-gray-400 italic">—</span>}</div>
                          <div><span className="font-semibold">IFSC CODE:</span> {vendorDetails.bank_ifsc || <span className="text-gray-400 italic">—</span>}</div>
                        </div>
                      </td>
                      <td colSpan={6} className={tdCls + ' align-top'}>
                        <div className="space-y-0.5">
                          <div><span className="font-semibold">RA Bill No</span> : {nextRaBillNo ? <span className="font-bold text-blue-700">{nextRaBillNo}</span> : <span className="text-gray-400 italic">Will auto-assign on save</span>}</div>
                          <div><span className="font-semibold">RA Bill Date</span> : {fmtDate(today())}</div>
                          <div><span className="font-semibold">Project</span> : {projectCode} {projectName}</div>
                          <div><span className="font-semibold">Bill period</span> : {fmtDate(dateFrom)} TO {fmtDate(dateTo)}</div>
                          <div><span className="font-semibold">WO No</span> : {displayWoNum || '—'}</div>
                          <div><span className="font-semibold">WO Date</span> : {displayWoDate ? fmtDate(displayWoDate) : '—'}</div>
                        </div>
                      </td>
                    </tr>

                    {/* Summary table header */}
                    <tr className="bg-gray-50 font-bold text-xs">
                      <td className={tdCls + ' text-center'}>Sr.No</td>
                      <td className={tdCls}>Asset</td>
                      <td className={tdCls + ' text-center'}>Unit</td>
                      <td className={tdCls + ' text-right'}>Basic Rate</td>
                      <td className={tdCls + ' text-center'}>Limit</td>
                      <td className={tdCls + ' text-center'}>Actual</td>
                      <td className={tdCls + ' text-center'}>Excess</td>
                      <td className={tdCls + ' text-right'}>Unit Rate</td>
                      <td className={tdCls + ' text-right'}>Amount</td>
                      <td className={tdCls + ' text-center'}>Planned Hrs/Month</td>
                      <td className={tdCls + ' text-center'}>Util%</td>
                      <td className={tdCls}>Remarks</td>
                    </tr>

                    {/* Per-machine rows */}
                    {previewMachines.map((mac, idx) => {
                      const calc    = machineCalcs[idx]
                      const hasHrs  = nv(mac.hours_rate) > 0
                      const hasKm   = nv(mac.km_rate) > 0 && nv(mac.planned_km_month) > 0
                      const rowSpan = 1 + (hasHrs ? 1 : 0) + (hasKm ? 1 : 0)
                      const assetLabel = `${mac.description || mac.reg_no}${mac.eq_type_name ? ' ('+mac.eq_type_name+')' : ''}`
                      return (
                        <React.Fragment key={mac.machine_id}>
                          {/* Month row */}
                          <tr>
                            <td className={tdCls + ' text-center'} rowSpan={rowSpan}>{idx+1}</td>
                            <td className={tdCls} rowSpan={rowSpan}>{assetLabel}</td>
                            <td className={tdCls + ' text-center'}>Month</td>
                            <td className={tdCls + ' text-right'}>₹{nv(mac.monthly_rate).toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
                            <td className={tdCls + ' text-center'}>{calc.cDays} Days</td>
                            <td className={tdCls + ' text-center'}>{nv(mac.working_days).toFixed(0)} Days</td>
                            <td className={tdCls + ' text-center'}>{Math.max(0, nv(mac.working_days)-calc.cDays).toFixed(0)} Days</td>
                            <td className={tdCls + ' text-right'}>₹{calc.dailyRate.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                            <td className={tdCls + ' text-right'}>{fm(calc.monthAmt)}</td>
                            <td className={tdCls + ' text-center'} rowSpan={rowSpan}>{calc.plannedHrs > 0 ? nv(mac.planned_hrs_month).toFixed(0)+' Hrs' : '—'}</td>
                            <td className={tdCls + ' text-center'} rowSpan={rowSpan}>{calc.utilPct > 0 ? calc.utilPct.toFixed(1)+'%' : '—'}</td>
                            <td className={tdCls} rowSpan={rowSpan}></td>
                          </tr>
                          {/* Hours row */}
                          {hasHrs && (
                            <tr>
                              <td className={tdCls + ' text-center'}>Hours</td>
                              <td className={tdCls + ' text-right'}>{nv(mac.hours_rate).toLocaleString('en-IN',{maximumFractionDigits:2})} Rs.</td>
                              <td className={tdCls + ' text-center'}>{calc.plannedHrs.toFixed(0)} Hrs</td>
                              <td className={tdCls + ' text-center'}>{nv(mac.actual_hours).toFixed(0)} Hrs</td>
                              <td className={tdCls + ' text-center'}>{calc.exHrs.toFixed(0)} Hrs</td>
                              <td className={tdCls + ' text-right'}>₹{nv(mac.hours_rate).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                              <td className={tdCls + ' text-right'}>{fm(calc.hoursAmt)}</td>
                            </tr>
                          )}
                          {/* KM row */}
                          {hasKm && (
                            <tr>
                              <td className={tdCls + ' text-center'}>KM</td>
                              <td className={tdCls + ' text-right'}>{nv(mac.km_rate).toLocaleString('en-IN',{maximumFractionDigits:2})} Rs.</td>
                              <td className={tdCls + ' text-center'}>{calc.plannedKm.toFixed(0)} KM</td>
                              <td className={tdCls + ' text-center'}>{nv(mac.actual_km).toFixed(0)} KM</td>
                              <td className={tdCls + ' text-center'}>{calc.exKm.toFixed(0)} KM</td>
                              <td className={tdCls + ' text-right'}>₹{nv(mac.km_rate).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                              <td className={tdCls + ' text-right'}>{fm(calc.kmAmt)}</td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}

                    {/* Total Basic */}
                    <tr className="font-bold bg-gray-50">
                      <td colSpan={8} className={tdCls + ' text-right font-bold'}>Total Basic</td>
                      <td className={tdCls + ' text-right font-bold'}>{fm(totalBasic)}</td>
                      <td colSpan={3} className={tdCls}></td>
                    </tr>

                    {/* ── ADDITIONS ── */}
                    <tr className="font-bold bg-gray-100">
                      <td colSpan={12} className={tdCls + ' font-bold'}>Additions</td>
                    </tr>
                    {manualAdditions.length === 0 && (
                      <tr>
                        <td colSpan={8} className={tdCls + ' text-gray-400 italic'}>1)</td>
                        <td colSpan={4} className={tdCls}></td>
                      </tr>
                    )}
                    {manualAdditions.map((item, i) => (
                      <tr key={i}>
                        <td colSpan={8} className={tdCls}>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">{i+1})</span>
                            <input
                              className="flex-1 border-b border-gray-300 outline-none text-xs px-1 py-0.5"
                              value={item.label}
                              onChange={e => updateManualAdd(i,'label',e.target.value)}
                              placeholder="Description"
                            />
                            <button onClick={() => removeManualAdd(i)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        </td>
                        <td className={tdCls}>
                          <input
                            type="number"
                            className="w-full border-b border-gray-300 outline-none text-xs text-right px-1 py-0.5"
                            value={item.amount}
                            onChange={e => updateManualAdd(i,'amount',e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                        <td colSpan={3} className={tdCls}></td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={12} className={tdCls}>
                        <button onClick={addManualAddition}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
                          <Plus size={12}/> Add Manual Addition
                        </button>
                      </td>
                    </tr>
                    <tr className="font-bold">
                      <td colSpan={8} className={tdCls + ' text-right font-bold'}>Total Additions</td>
                      <td className={tdCls + ' text-right font-bold'}>{fm(manAddTotal)}</td>
                      <td colSpan={3} className={tdCls}></td>
                    </tr>

                    {/* ── DEDUCTIONS ── */}
                    <tr className="font-bold bg-gray-100">
                      <td colSpan={12} className={tdCls + ' font-bold'}>Deductions</td>
                    </tr>

                    {/* Downtime / breakdown */}
                    <tr>
                      <td colSpan={5} className={tdCls}>1) Downtime</td>
                      <td className={tdCls + ' text-center'}>{totalBreakdownDays} Days</td>
                      <td colSpan={2} className={tdCls}></td>
                      <td className={tdCls + ' text-right'}>{fm(totalBreakdownAmt)}</td>
                      <td colSpan={3} className={tdCls}></td>
                    </tr>

                    {/* Fuel Consumption sub-header */}
                    <tr className="bg-gray-50">
                      <td colSpan={12} className={tdCls + ' font-semibold'}>2) Fuel Consumption</td>
                    </tr>
                    {fuelMachines.map((mac, fi) => {
                      const calc = getMachineCalc(mac)
                      const isKmBased = mac.fuel_performance_type === 'mileage'
                      const approvedVal = isKmBased ? nv(mac.approved_mileage) : nv(mac.approved_fuel_consumption)
                      const unit = isKmBased ? 'KM/L' : 'L/Hr'
                      return (
                        <tr key={mac.machine_id}>
                          <td colSpan={2} className={tdCls}>
                            {fuelLabels[fi]}) {mac.description || mac.reg_no}
                          </td>
                          <td className={tdCls + ' text-center'}>Approved: {approvedVal.toFixed(2)} {unit}</td>
                          <td className={tdCls + ' text-center'}>Actual: {calc.actualFuelLtrHr.toFixed(2)} {unit}</td>
                          <td className={tdCls + ' text-center'}>{nv(mac.diesel_qty).toFixed(2)} Ltrs</td>
                          <td className={tdCls + ' text-center'}>@ ₹{nv(mac.fuel_deduction_rate).toFixed(2)}</td>
                          <td colSpan={2} className={tdCls}></td>
                          <td className={tdCls + ' text-right'}>{fm(calc.fuelAmt)}</td>
                          <td colSpan={3} className={tdCls}></td>
                        </tr>
                      )
                    })}

                    {/* Manual deductions */}
                    {manualDeductions.map((item, i) => (
                      <tr key={i}>
                        <td colSpan={8} className={tdCls}>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">{fuelMachines.length + i + 3})</span>
                            <input
                              className="flex-1 border-b border-gray-300 outline-none text-xs px-1 py-0.5"
                              value={item.label}
                              onChange={e => updateManualDed(i,'label',e.target.value)}
                              placeholder="Description"
                            />
                            <button onClick={() => removeManualDed(i)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        </td>
                        <td className={tdCls}>
                          <input
                            type="number"
                            className="w-full border-b border-gray-300 outline-none text-xs text-right px-1 py-0.5"
                            value={item.amount}
                            onChange={e => updateManualDed(i,'amount',e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                        <td colSpan={3} className={tdCls}></td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={12} className={tdCls}>
                        <button onClick={addManualDeduction}
                          className="flex items-center gap-1 text-red-600 hover:text-red-800 text-xs font-medium">
                          <Plus size={12}/> Add Manual Deduction
                        </button>
                      </td>
                    </tr>
                    <tr className="font-bold">
                      <td colSpan={8} className={tdCls + ' text-right font-bold'}>Total Deductions</td>
                      <td className={tdCls + ' text-right font-bold'}>{fm(totalDeductions)}</td>
                      <td colSpan={3} className={tdCls}></td>
                    </tr>

                    {/* ── FOOTER TOTALS ── */}
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
                    <tr className="font-bold bg-gray-50">
                      <td colSpan={8} className={tdCls + ' text-right font-bold text-xs'}>
                        Net Payable (Total Basic + Total Additions + GST - TDS - Total Deductions)
                      </td>
                      <td className={tdCls + ' text-right font-bold text-sm'}>{fm(netPayable)}</td>
                      <td colSpan={3} className={tdCls}></td>
                    </tr>

                    {/* Rupees in words */}
                    <tr>
                      <td colSpan={12} className={tdCls + ' italic text-xs py-2'}>
                        Rupees in words: <span className="font-semibold">{numToWords(netPayable)}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Action buttons */}
              {saveErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{saveErr}</p>}
              {saved ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  <Check size={16} className="text-green-600"/>
                  <span className="text-sm font-semibold text-green-700">Invoice saved! Invoice number auto-assigned.</span>
                </div>
              ) : (
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setReportData(null); setSaveErr('') }}
                    className="px-5 py-2 border border-gray-300 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={handleDownloadPdf}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-sm">
                    <Download size={14}/>
                    Download PDF
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-2 px-8 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-bold rounded-lg text-sm">
                    {saving ? <RefreshCw size={14} className="animate-spin"/> : <Printer size={14}/>}
                    {saving ? 'Saving…' : 'Generate & Save Invoice'}
                  </button>
                </div>
              )}
            </div>
          )
        })()}

      </div>
    </div>
  )
}
