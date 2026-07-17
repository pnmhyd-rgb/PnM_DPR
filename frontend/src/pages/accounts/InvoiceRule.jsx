import { useState, useEffect } from 'react'
import {
  getInvoiceRules, createInvoiceRule, updateInvoiceRule, deleteInvoiceRule,
  bulkCreateInvoiceRules,
  getOwnershipVendors, getOwnershipMachines, getMachines, getProjects,
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import {
  Plus, Edit2, Trash2, X, Receipt, RefreshCw, Search,
  Building2, Truck, Link2, CheckSquare, Square, ChevronDown, ChevronUp, Fuel,
} from 'lucide-react'

// ── Module-level constants ────────────────────────────────────────────────────
const INP = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const LBL = 'block text-xs font-medium text-gray-600 mb-1'

const fmtMoney = v => v != null ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 0 })}` : '—'
const fmtRate  = v => v ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 0 })}/mo` : '—'
const calDaysThisMonth = () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()

function Toggle({ on, onClick, color = 'bg-blue-600', size = 'normal' }) {
  const h = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9'
  const d = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'
  const on_t = size === 'sm' ? 'translate-x-3.5' : 'translate-x-5'
  return (
    <button type="button" onClick={onClick}
      className={`relative inline-flex ${h} shrink-0 items-center rounded-full transition-colors ${on ? color : 'bg-gray-300'}`}>
      <span className={`inline-block ${d} transform rounded-full bg-white transition-transform ${on ? on_t : 'translate-x-0.5'}`} />
    </button>
  )
}

// ── Shared config for the bulk ownership modal (days / hours / km / maintenance only)
function SharedConfig({ s, setS }) {
  const calDays = calDaysThisMonth()
  return (
    <div className="space-y-4">
      {/* Days */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LBL}>Billing Days <span className="text-red-500">*</span></label>
          <input type="number" min="1"
            className={`${INP} ${s.adjust_calendar_days ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
            value={s.days} onChange={e => setS('days', e.target.value)}
            readOnly={!!s.adjust_calendar_days} />
          <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
            <input type="checkbox" checked={!!s.adjust_calendar_days}
              onChange={e => { const c = e.target.checked; setS('adjust_calendar_days', c); setS('days', c ? calDays : '26') }}
              className="rounded border-gray-300 text-emerald-600" />
            <span className="text-xs text-emerald-700 font-medium">Calendar Month ({calDays} days this month)</span>
          </label>
        </div>
        <div className="flex items-end pb-1">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs w-full text-emerald-800">
            Bill rates and fuel/breakdown settings are configured per asset in the table above.
          </div>
        </div>
      </div>

      {/* Hours / KM */}
      <div>
        <label className={LBL}>Productivity (applies to all selected assets)</label>
        <div className="border border-gray-200 rounded-xl divide-y overflow-hidden">
          <div className={`px-3 py-2.5 ${s.hours_enabled ? 'bg-blue-50' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-3 flex-wrap">
              <input type="checkbox" checked={!!s.hours_enabled}
                onChange={e => setS('hours_enabled', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 shrink-0" />
              <span className="text-sm font-medium text-gray-700">Working Hrs / Month</span>
              {s.hours_enabled && (
                <>
                  <input type="number" min="1" step="0.5" placeholder="Hours"
                    className="border border-gray-300 rounded px-2 py-1 text-xs w-20 focus:outline-none"
                    value={s.hours} onChange={e => setS('hours', e.target.value)} />
                  <span className="text-xs text-gray-400">hrs @</span>
                  <input type="number" min="0" step="0.01" placeholder="₹/Hr"
                    className="border border-gray-300 rounded px-2 py-1 text-xs w-24 focus:outline-none"
                    value={s.hours_rate} onChange={e => setS('hours_rate', e.target.value)} />
                </>
              )}
            </div>
          </div>
          <div className={`px-3 py-2.5 ${s.km_enabled ? 'bg-green-50' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-3 flex-wrap">
              <input type="checkbox" checked={!!s.km_enabled}
                onChange={e => setS('km_enabled', e.target.checked)}
                className="rounded border-gray-300 text-green-600 shrink-0" />
              <span className="text-sm font-medium text-gray-700">Working KM / Month</span>
              {s.km_enabled && (
                <>
                  <input type="number" min="1" step="1" placeholder="KM"
                    className="border border-gray-300 rounded px-2 py-1 text-xs w-24 focus:outline-none"
                    value={s.planned_km} onChange={e => setS('planned_km', e.target.value)} />
                  <span className="text-xs text-gray-400">km @</span>
                  <input type="number" min="0" step="0.01" placeholder="₹/KM"
                    className="border border-gray-300 rounded px-2 py-1 text-xs w-24 focus:outline-none"
                    value={s.km_rate} onChange={e => setS('km_rate', e.target.value)} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Maintenance */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Additions</p>
        <div className={`rounded-xl border p-3 space-y-2 ${s.maintenance_applicable ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center gap-2">
            <Toggle on={s.maintenance_applicable} onClick={() => setS('maintenance_applicable', !s.maintenance_applicable)} />
            <span className="text-sm text-gray-700 font-medium">Maintenance Charges</span>
          </div>
          {s.maintenance_applicable && (
            <div className="flex items-center gap-3 pl-8 pt-1 flex-wrap">
              <div>
                <p className="text-xs text-gray-500 mb-1">Allowed Days/Month</p>
                <input type="number" min="0" placeholder="e.g. 1"
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none"
                  value={s.allowed_maintenance_days} onChange={e => setS('allowed_maintenance_days', e.target.value)} />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Excess Rate (₹/day)</p>
                <input type="number" min="0" step="0.01" placeholder="Blank = daily rate"
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none"
                  value={s.maintenance_excess_rate} onChange={e => setS('maintenance_excess_rate', e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Default state factories ───────────────────────────────────────────────────
const emptyForm = () => ({
  rule_number: '', rule_name: '', description: '',
  ownership_vendor: '', machine_id: '',
  basic_rate: '', days: '', adjust_calendar_days: false,
  hours_enabled: false, hours: '', hours_rate: '',
  km_enabled: false, planned_km: '', km_rate: '',
  maintenance_applicable: false, allowed_maintenance_days: '', maintenance_excess_rate: '',
  breakdown_applicable: false,
  deductions: { fuel: false, fuel_performance_type: 'economy', approved_mileage: '', approved_fuel_consumption: '', fuel_rate: '' },
  other_charges: [], active: true,
})

const emptyShared = () => ({
  days: '26', adjust_calendar_days: false,
  hours_enabled: false, hours: '', hours_rate: '',
  km_enabled: false, planned_km: '', km_rate: '',
  maintenance_applicable: false, allowed_maintenance_days: '', maintenance_excess_rate: '',
})

const emptyMachineRow = (m = {}) => ({
  selected: true,
  basic_rate: m.rate_monthly ? String(m.rate_monthly) : '',
  // per-machine deductions
  breakdown: false,
  fuel: false,
  fuel_type: 'economy',
  fuel_mileage: '',        // KM/L if economy
  fuel_consumption: '',    // L/Hr if consumption
  fuel_rate: '',           // ₹/Litre
})

// ─────────────────────────────────────────────────────────────────────────────

export default function InvoiceRule() {
  const { isAdmin } = useAuth()
  const [rules, setRules]     = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Generic modal (Button A + all edits)
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(emptyForm())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [delId, setDelId]   = useState(null)

  // Bulk Ownership modal (Button B)
  const [ownerModal, setOwnerModal]   = useState(false)
  const [ownerTab, setOwnerTab]       = useState('Hire')
  const [ownerSaving, setOwnerSaving] = useState(false)
  const [ownerError, setOwnerError]   = useState('')
  const [ownerResult, setOwnerResult] = useState(null)

  const [hireVendors, setHireVendors]             = useState([])
  const [selectedVendor, setSelectedVendor]       = useState('')
  const [ownProjects, setOwnProjects]             = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')

  const [machineList, setMachineList] = useState([])
  const [machLoading, setMachLoading] = useState(false)
  // { [machineId]: { selected, basic_rate, breakdown, fuel, fuel_type, fuel_mileage, fuel_consumption, fuel_rate } }
  const [machineRows, setMachineRows] = useState({})
  const [linkWO, setLinkWO]           = useState(true)

  const [shared, setShared]                     = useState(emptyShared())
  const [showSharedConfig, setShowSharedConfig] = useState(true)

  // ── Data helpers ──────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true)
    try { const r = await getInvoiceRules(); setRules(r.data.data || []) }
    catch { /* silent */ }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const nextRuleNumber = () => {
    const nums = rules
      .map(r => { const m = (r.rule_number || '').match(/(\d+)$/); return m ? parseInt(m[1]) : 0 })
      .filter(n => !isNaN(n))
    return `IR-${String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(3, '0')}`
  }

  const buildFormFromRule = r => ({
    rule_number: r.rule_number || '', rule_name: r.rule_name || '', description: r.description || '',
    ownership_vendor: r.ownership_vendor || '', machine_id: r.machine_id ? String(r.machine_id) : '',
    basic_rate: r.basic_rate || '', days: r.days || '', adjust_calendar_days: r.adjust_calendar_days || false,
    hours_enabled: r.hours != null && r.hours !== '', hours: r.hours || '', hours_rate: r.hours_rate || '',
    km_enabled: r.planned_km != null && r.planned_km !== '', planned_km: r.planned_km || '', km_rate: r.km_rate || '',
    maintenance_applicable: r.maintenance_applicable || false,
    allowed_maintenance_days: r.allowed_maintenance_days || '', maintenance_excess_rate: r.maintenance_excess_rate || '',
    breakdown_applicable: r.breakdown_applicable || false,
    deductions: {
      fuel: r.fuel_applicable || false, fuel_performance_type: r.fuel_performance_type || 'economy',
      approved_mileage: r.approved_mileage || '', approved_fuel_consumption: r.approved_fuel_consumption || '',
      fuel_rate: r.fuel_deduction_rate || '',
    },
    other_charges: r.other_charges || [], active: r.active !== false,
  })

  // ── Generic modal ─────────────────────────────────────────────────────────

  const openAdd = () => {
    setForm({ ...emptyForm(), rule_number: nextRuleNumber() })
    setEditId(null); setError(''); setModal(true)
  }
  const openEdit = r => { setForm(buildFormFromRule(r)); setEditId(r.id); setError(''); setModal(true) }

  const setF  = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setFD = (k, v) => setForm(f => ({ ...f, deductions: { ...f.deductions, [k]: v } }))

  const buildPayload = f => {
    const d = f.deductions
    return {
      rule_number: f.rule_number, rule_name: f.rule_name, description: f.description,
      ownership_vendor: f.ownership_vendor || null,
      machine_id: f.machine_id ? parseInt(f.machine_id) : null,
      basic_rate: f.basic_rate, days: f.days, adjust_calendar_days: f.adjust_calendar_days,
      hours: f.hours_enabled ? f.hours : null, hours_rate: f.hours_enabled ? f.hours_rate : null,
      planned_km: f.km_enabled ? f.planned_km : null, km_rate: f.km_enabled ? f.km_rate : null,
      maintenance_applicable: f.maintenance_applicable,
      allowed_maintenance_days: f.maintenance_applicable ? (f.allowed_maintenance_days || null) : null,
      maintenance_excess_rate:  f.maintenance_applicable ? (f.maintenance_excess_rate || null) : null,
      breakdown_applicable: f.breakdown_applicable, breakdown_days: 0, breakdown_deduction_rate: null,
      fuel_applicable: d.fuel, fuel_performance_type: d.fuel ? d.fuel_performance_type : 'economy',
      approved_mileage: d.fuel && d.fuel_performance_type === 'economy' ? (d.approved_mileage || null) : null,
      approved_fuel_consumption: d.fuel && d.fuel_performance_type === 'consumption' ? (d.approved_fuel_consumption || null) : null,
      fuel_deduction_rate: d.fuel ? (d.fuel_rate || null) : null,
      active: f.active,
    }
  }

  const save = async () => {
    if (!form.rule_name) { setError('Rule Name is required'); return }
    if (!form.days || parseInt(form.days) < 1) { setError('Days is required'); return }
    if (form.hours_enabled && (!form.hours || parseFloat(form.hours) <= 0)) { setError('Working Hours/Month required'); return }
    if (form.km_enabled   && (!form.planned_km || parseFloat(form.planned_km) <= 0)) { setError('Working KM/Month required'); return }
    if (form.deductions.fuel && !form.deductions.fuel_rate) { setError('Fuel rate required'); return }
    setSaving(true); setError('')
    try {
      if (editId) await updateInvoiceRule(editId, buildPayload(form))
      else        await createInvoiceRule(buildPayload(form))
      setModal(false); load()
    } catch (err) { setError(err.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  const del = async () => {
    try { await deleteInvoiceRule(delId); setDelId(null); load() }
    catch (err) { alert(err.response?.data?.error || 'Failed') }
  }

  // ── Bulk Ownership modal ──────────────────────────────────────────────────

  const openOwnerAdd = async () => {
    setOwnerTab('Hire'); setSelectedVendor(''); setSelectedProjectId('')
    setMachineList([]); setMachineRows({}); setLinkWO(true)
    setShared(emptyShared()); setOwnerError(''); setOwnerResult(null)
    setOwnerSaving(false); setShowSharedConfig(true)
    const [vRes, pRes] = await Promise.all([
      getOwnershipVendors().catch(() => ({ data: { data: [] } })),
      getProjects().catch(() => ({ data: [] })),
    ])
    setHireVendors(vRes.data.data || [])
    setOwnProjects(pRes.data.data || pRes.data || [])
    setOwnerModal(true)
  }

  const handleTabChange = tab => {
    setOwnerTab(tab); setSelectedVendor(''); setSelectedProjectId('')
    setMachineList([]); setMachineRows({}); setOwnerError(''); setOwnerResult(null)
  }

  const preSelectAll = list => {
    const rows = {}
    list.forEach(m => { rows[m.id] = emptyMachineRow(m) })
    return rows
  }

  const loadHireMachines = async vendorName => {
    setSelectedVendor(vendorName); setMachineList([]); setMachineRows({})
    if (!vendorName) return
    setMachLoading(true)
    try {
      const r = await getOwnershipMachines(vendorName)
      const list = r.data.data || []
      setMachineList(list); setMachineRows(preSelectAll(list))
    } catch { setMachineList([]) }
    finally { setMachLoading(false) }
  }

  const loadOwnMachines = async projectId => {
    setSelectedProjectId(projectId); setMachineList([]); setMachineRows({})
    if (!projectId) return
    setMachLoading(true)
    try {
      const r = await getMachines({ project_id: projectId })
      const list = (r.data.data || r.data || []).filter(m => m.ownership === 'Own')
      setMachineList(list); setMachineRows(preSelectAll(list))
    } catch { setMachineList([]) }
    finally { setMachLoading(false) }
  }

  // row-level updates
  const setRow  = (id, k, v) => setMachineRows(prev => ({ ...prev, [id]: { ...prev[id], [k]: v } }))
  const toggleMachine = id => setRow(id, 'selected', !machineRows[id]?.selected)
  const toggleAllMachines = () => {
    const anySelected = machineList.some(m => machineRows[m.id]?.selected)
    setMachineRows(prev => {
      const next = { ...prev }
      machineList.forEach(m => { next[m.id] = { ...next[m.id], selected: !anySelected } })
      return next
    })
  }

  const selectedMachines = machineList.filter(m => machineRows[m.id]?.selected)
  const totalRate = selectedMachines.reduce((s, m) => s + (parseFloat(machineRows[m.id]?.basic_rate) || 0), 0)

  const setS = (k, v) => setShared(s => ({ ...s, [k]: v }))

  const saveOwnerBulk = async () => {
    if (ownerTab === 'Hire' && !selectedVendor)    { setOwnerError('Select a Hire Vendor'); return }
    if (ownerTab === 'Own'  && !selectedProjectId) { setOwnerError('Select a Project');    return }
    if (selectedMachines.length === 0)             { setOwnerError('Select at least one asset'); return }
    if (!shared.days || parseInt(shared.days) < 1) { setOwnerError('Billing Days is required'); return }
    const missing = selectedMachines.find(m => !machineRows[m.id]?.basic_rate)
    if (missing) { setOwnerError(`Enter billing rate for ${missing.slno}`); return }
    const fuelMissing = selectedMachines.find(m => {
      const row = machineRows[m.id] || {}
      return row.fuel && !row.fuel_rate
    })
    if (fuelMissing) { setOwnerError(`Enter fuel rate (₹/Litre) for ${fuelMissing.slno}`); return }

    const ownership_vendor = ownerTab === 'Own' ? 'Own' : selectedVendor

    const machinesPayload = selectedMachines.map(m => {
      const row = machineRows[m.id] || {}
      return {
        machine_id:  m.id,
        basic_rate:  parseFloat(row.basic_rate) || 0,
        wo_item_id:  (linkWO && m.wo_item_id) ? m.wo_item_id : null,
        // per-machine deductions
        breakdown_applicable:      row.breakdown || false,
        fuel_applicable:           row.fuel || false,
        fuel_performance_type:     row.fuel_type || 'economy',
        approved_mileage:          row.fuel && row.fuel_type === 'economy'       ? (row.fuel_mileage || null) : null,
        approved_fuel_consumption: row.fuel && row.fuel_type === 'consumption'   ? (row.fuel_consumption || null) : null,
        fuel_deduction_rate:       row.fuel ? (row.fuel_rate || null) : null,
      }
    })

    const sharedPayload = {
      days:                     parseInt(shared.days),
      adjust_calendar_days:     shared.adjust_calendar_days,
      hours:                    shared.hours_enabled ? shared.hours : null,
      hours_rate:               shared.hours_enabled ? shared.hours_rate : null,
      planned_km:               shared.km_enabled ? shared.planned_km : null,
      km_rate:                  shared.km_enabled ? shared.km_rate : null,
      maintenance_applicable:   shared.maintenance_applicable,
      allowed_maintenance_days: shared.maintenance_applicable ? (shared.allowed_maintenance_days || null) : null,
      maintenance_excess_rate:  shared.maintenance_applicable ? (shared.maintenance_excess_rate || null) : null,
    }

    setOwnerSaving(true); setOwnerError('')
    try {
      const r = await bulkCreateInvoiceRules({ ownership_vendor, link_wo: linkWO, machines: machinesPayload, shared: sharedPayload })
      setOwnerResult(r.data); load()
    } catch (err) { setOwnerError(err.response?.data?.error || 'Failed to create rules') }
    finally { setOwnerSaving(false) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const displayed = searchQuery
    ? rules.filter(r => {
        const q = searchQuery.toLowerCase()
        return (r.rule_number || '').toLowerCase().includes(q)
          || (r.rule_name || '').toLowerCase().includes(q)
          || (r.ownership_vendor || '').toLowerCase().includes(q)
      })
    : rules

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Receipt size={20} />Invoice Rules</h1>
          <p className="text-sm text-gray-500 mt-0.5">{displayed.length} rule{displayed.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
          {isAdmin && (
            <>
              <button onClick={openAdd}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <Plus size={15} /> Add Rule
              </button>
              <button onClick={openOwnerAdd}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                <Building2 size={15} /> Add Rule (Ownership)
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 bg-white border border-gray-200 rounded-xl p-3">
        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white max-w-sm">
          <Search size={14} className="text-gray-400 shrink-0" />
          <input className="flex-1 text-sm outline-none placeholder-gray-400"
            placeholder="Search rule no., name, or vendor…"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>}
        </div>
      </div>

      {/* Rules table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 text-center font-semibold text-gray-600 w-10">Sr.</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Rule No.</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Rule Name</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Ownership / Asset</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Description</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Basic Rate</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Days</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Rate/Day</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">WO Links</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
              {isAdmin && <th className="px-4 py-3 w-20" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={11} className="py-10 text-center text-gray-400">
                <RefreshCw size={16} className="inline animate-spin mr-2" />Loading…
              </td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={11} className="py-10 text-center text-gray-400">No invoice rules yet.</td></tr>
            ) : displayed.map((r, idx) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-3 text-center text-xs text-gray-400">{idx + 1}</td>
                <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{r.rule_number || '—'}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{r.rule_name}</td>
                <td className="px-4 py-3">
                  {r.ownership_vendor ? (
                    <div>
                      <div className={`flex items-center gap-1 text-xs font-medium ${r.ownership_vendor === 'Own' ? 'text-blue-700' : 'text-emerald-700'}`}>
                        {r.ownership_vendor === 'Own' ? <Truck size={11} /> : <Building2 size={11} />}
                        {r.ownership_vendor === 'Own' ? 'Own Fleet' : r.ownership_vendor}
                      </div>
                      {r.machine_slno && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {r.machine_slno}{r.machine_nickname ? ` · ${r.machine_nickname}` : ''}{r.machine_eq_type ? ` (${r.machine_eq_type})` : ''}
                        </div>
                      )}
                    </div>
                  ) : <span className="text-xs text-gray-400">Generic</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{r.description || '—'}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(r.basic_rate)}</td>
                <td className="px-4 py-3 text-right">{r.days}</td>
                <td className="px-4 py-3 text-right text-blue-700 font-medium">
                  {r.basic_rate && r.days ? fmtMoney(parseFloat(r.basic_rate) / parseInt(r.days)) : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  {parseInt(r.linked_assets) > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                      <Link2 size={10} />{r.linked_assets}
                    </span>
                  ) : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {r.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={14} /></button>
                      <button onClick={() => setDelId(r.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ══ Generic Add / Edit Modal ════════════════════════════════════════════ */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-semibold text-gray-900">{editId ? 'Edit Invoice Rule' : 'Add Invoice Rule'}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-5">
              {editId && form.ownership_vendor && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border
                  ${form.ownership_vendor === 'Own' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                  {form.ownership_vendor === 'Own' ? <Truck size={13} /> : <Building2 size={13} />}
                  Ownership Rule — {form.ownership_vendor === 'Own' ? 'Own Fleet' : form.ownership_vendor}
                  {form.machine_id && <span className="opacity-60 ml-1">· Machine #{form.machine_id}</span>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LBL}>Rule Number</label>
                  <div className="relative">
                    <input className={`${INP} ${!editId ? 'bg-gray-50 text-gray-500 pr-16' : ''}`}
                      value={form.rule_number} onChange={e => setF('rule_number', e.target.value)} readOnly={!editId} />
                    {!editId && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">auto</span>}
                  </div>
                </div>
                <div>
                  <label className={LBL}>Rule Name <span className="text-red-500">*</span></label>
                  <input className={INP} value={form.rule_name} onChange={e => setF('rule_name', e.target.value)} />
                </div>
                <div>
                  <label className={LBL}>Basic Rate (₹/Month)</label>
                  <input type="number" step="0.01" className={INP} value={form.basic_rate} onChange={e => setF('basic_rate', e.target.value)} />
                </div>
                <div>
                  <label className={LBL}>Days <span className="text-red-500">*</span></label>
                  <input type="number" min="1"
                    className={`${INP} ${form.adjust_calendar_days ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    value={form.days} onChange={e => setF('days', e.target.value)} readOnly={!!form.adjust_calendar_days} />
                  <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={!!form.adjust_calendar_days}
                      onChange={e => { const c = e.target.checked; setF('adjust_calendar_days', c); setF('days', c ? calDaysThisMonth() : '') }}
                      className="rounded border-gray-300 text-blue-600" />
                    <span className="text-xs text-blue-700">Adjust as Calendar Month</span>
                  </label>
                </div>
                {form.basic_rate && form.days && (
                  <div className="col-span-2 bg-blue-50 rounded-lg px-3 py-2 text-sm">
                    <span className="text-blue-700 font-medium">Rate/Day: </span>
                    <span className="text-blue-900 font-bold">{fmtMoney(parseFloat(form.basic_rate) / parseInt(form.days))}</span>
                  </div>
                )}
                <div className="col-span-2">
                  <label className={LBL}>Description</label>
                  <textarea className={INP} rows={2} value={form.description} onChange={e => setF('description', e.target.value)} />
                </div>
              </div>

              {/* Additions */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Additions</p>
                <div className={`rounded-xl border p-3 space-y-2 ${form.maintenance_applicable ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <Toggle on={form.maintenance_applicable} onClick={() => setF('maintenance_applicable', !form.maintenance_applicable)} />
                    <span className="text-sm text-gray-700 font-medium">Maintenance Charges</span>
                  </div>
                  {form.maintenance_applicable && (
                    <div className="flex gap-3 pt-1 pl-8 flex-wrap">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Allowed Days/Month</p>
                        <input type="number" min="0" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none"
                          value={form.allowed_maintenance_days} onChange={e => setF('allowed_maintenance_days', e.target.value)} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Excess Rate (₹/day)</p>
                        <input type="number" min="0" step="0.01" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none"
                          value={form.maintenance_excess_rate} onChange={e => setF('maintenance_excess_rate', e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Deductions */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deductions</p>
                <div className="space-y-2">
                  <div className={`rounded-xl border p-3 ${form.breakdown_applicable ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <Toggle on={form.breakdown_applicable} onClick={() => setF('breakdown_applicable', !form.breakdown_applicable)} color="bg-red-600" />
                      <span className="text-sm text-gray-700 font-medium">Breakdown Deduction</span>
                    </div>
                  </div>
                  <div className={`rounded-xl border p-3 space-y-3 ${form.deductions.fuel ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <Toggle on={form.deductions.fuel} onClick={() => setFD('fuel', !form.deductions.fuel)} color="bg-amber-500" />
                      <span className="text-sm text-gray-700 font-medium">Fuel Deduction</span>
                    </div>
                    {form.deductions.fuel && (
                      <div className="space-y-2 pl-8">
                        <div className="flex gap-4">
                          {['economy', 'consumption'].map(v => (
                            <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="radio" name="gen_fuel" value={v}
                                checked={form.deductions.fuel_performance_type === v}
                                onChange={() => setFD('fuel_performance_type', v)} className="accent-amber-600" />
                              <span className="text-xs text-gray-700">{v === 'economy' ? 'KM/Litre' : 'Litre/Hour'}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-3 flex-wrap">
                          {form.deductions.fuel_performance_type === 'economy' ? (
                            <div>
                              <p className="text-xs text-gray-500 mb-1">KM/Litre <span className="text-red-500">*</span></p>
                              <input type="number" min="0" step="0.01" className="border rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none"
                                value={form.deductions.approved_mileage} onChange={e => setFD('approved_mileage', e.target.value)} />
                            </div>
                          ) : (
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Litre/Hour <span className="text-red-500">*</span></p>
                              <input type="number" min="0" step="0.01" className="border rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none"
                                value={form.deductions.approved_fuel_consumption} onChange={e => setFD('approved_fuel_consumption', e.target.value)} />
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Rate ₹/Litre <span className="text-red-500">*</span></p>
                            <input type="number" min="0" step="0.01" className="border rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none"
                              value={form.deductions.fuel_rate} onChange={e => setFD('fuel_rate', e.target.value)} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-3">
                <button onClick={save} disabled={saving}
                  className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
                  {saving ? 'Saving…' : editId ? 'Update Rule' : 'Create Rule'}
                </button>
                <button onClick={() => setModal(false)} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Add Ownership Rules — Bulk Modal ════════════════════════════════════ */}
      {ownerModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-6">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-emerald-600" />
                <h2 className="font-semibold text-gray-900">Add Invoice Rules — Ownership</h2>
              </div>
              <button onClick={() => setOwnerModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            {/* Success */}
            {ownerResult ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckSquare size={32} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{ownerResult.created} Rule{ownerResult.created !== 1 ? 's' : ''} Created</p>
                  {ownerResult.linked_wo > 0 && (
                    <p className="text-sm text-emerald-700 mt-1 flex items-center justify-center gap-1">
                      <Link2 size={14} />{ownerResult.linked_wo} Work Order item{ownerResult.linked_wo !== 1 ? 's' : ''} auto-linked
                    </p>
                  )}
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-left max-w-md mx-auto divide-y divide-gray-100">
                  {(ownerResult.rules || []).map(r => (
                    <div key={r.id} className="flex items-center gap-3 py-2 text-xs">
                      <span className="font-mono text-blue-700 font-semibold w-16 shrink-0">{r.rule_number}</span>
                      <span className="text-gray-700 font-medium">{r.machine_slno}</span>
                      <span className="text-gray-400">{fmtMoney(r.basic_rate)}/mo</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 justify-center pt-2">
                  <button onClick={() => setOwnerModal(false)}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 font-medium">Done</button>
                  <button onClick={() => {
                    setOwnerResult(null); setMachineList([]); setMachineRows({})
                    setSelectedVendor(''); setSelectedProjectId('')
                  }} className="px-6 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Create More</button>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-5">

                {/* Step 1 */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-3">
                    Step 1 — Select Ownership Type &amp; Load Assets
                  </p>
                  <div className="flex gap-1 mb-4 bg-white border border-gray-200 rounded-lg p-1 w-fit">
                    {[['Hire', Building2, 'bg-emerald-600'], ['Own', Truck, 'bg-blue-600']].map(([tab, Icon, cls]) => (
                      <button key={tab} onClick={() => handleTabChange(tab)}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                          ${ownerTab === tab ? `${cls} text-white` : 'text-gray-600 hover:bg-gray-100'}`}>
                        <Icon size={13} />{tab === 'Hire' ? 'Hire Fleet' : 'Own Fleet'}
                      </button>
                    ))}
                  </div>
                  {ownerTab === 'Hire' && (
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className={LBL}>Hire Vendor <span className="text-red-500">*</span></label>
                        <select className="w-full border border-emerald-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          value={selectedVendor} onChange={e => loadHireMachines(e.target.value)}>
                          <option value="">— Select vendor —</option>
                          {hireVendors.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                        </select>
                      </div>
                      {selectedVendor && !machLoading && (
                        <div className="text-xs text-emerald-700 bg-emerald-100 px-3 py-2 rounded-lg self-end mb-0.5 whitespace-nowrap">
                          {machineList.length} asset{machineList.length !== 1 ? 's' : ''} found
                        </div>
                      )}
                    </div>
                  )}
                  {ownerTab === 'Own' && (
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className={LBL}>Project / Site <span className="text-red-500">*</span></label>
                        <select className="w-full border border-blue-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={selectedProjectId} onChange={e => loadOwnMachines(e.target.value)}>
                          <option value="">— Select project —</option>
                          {ownProjects.filter(p => p.active !== false).map(p => (
                            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                          ))}
                        </select>
                      </div>
                      {selectedProjectId && !machLoading && (
                        <div className="text-xs text-blue-700 bg-blue-100 px-3 py-2 rounded-lg self-end mb-0.5 whitespace-nowrap">
                          {machineList.length} own asset{machineList.length !== 1 ? 's' : ''} found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {machLoading && (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    <RefreshCw size={16} className="inline animate-spin mr-2" />Loading assets…
                  </div>
                )}

                {/* Step 2 — Machine table with per-machine options */}
                {!machLoading && machineList.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Step 2 — Select Assets &amp; Configure Per-Asset Settings
                      </p>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">{selectedMachines.length} of {machineList.length} selected</span>
                        {totalRate > 0 && (
                          <span className="text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            Total {fmtMoney(totalRate)}/mo
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="px-3 py-2.5 w-10">
                              <button onClick={toggleAllMachines} title="Toggle all">
                                {selectedMachines.length === machineList.length && machineList.length > 0
                                  ? <CheckSquare size={16} className="text-emerald-600" />
                                  : <Square size={16} className="text-gray-400" />}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">SlNo / Asset</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">Equipment Type</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600">Ref Rate</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600">
                              Bill Rate (₹/mo) <span className="text-red-500">*</span>
                            </th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600">
                              <span className="text-red-600">Brkd</span>
                            </th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600">
                              <span className="text-amber-600 flex items-center justify-center gap-1"><Fuel size={11} />Fuel</span>
                            </th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">
                              <div className="flex items-center gap-1"><Link2 size={11} />Active WO</div>
                            </th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">Existing Rule</th>
                          </tr>
                        </thead>
                        <tbody>
                          {machineList.map(m => {
                            const row = machineRows[m.id] || {}
                            const sel = !!row.selected
                            const fuelOn = !!row.fuel
                            return (
                              <>
                                {/* Main machine row */}
                                <tr key={m.id}
                                  className={`border-t border-gray-50 transition-colors ${sel ? 'bg-white hover:bg-emerald-50/20' : 'bg-gray-50 opacity-50'}`}>
                                  <td className="px-3 py-2.5">
                                    <button onClick={() => toggleMachine(m.id)}>
                                      {sel ? <CheckSquare size={16} className="text-emerald-600" /> : <Square size={16} className="text-gray-300" />}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="font-medium text-gray-900 text-xs">{m.slno}</div>
                                    {m.nickname && <div className="text-xs text-gray-400">{m.nickname}</div>}
                                  </td>
                                  <td className="px-3 py-2.5 text-xs text-gray-700">{m.eq_type_name || m.eq_type || '—'}</td>
                                  <td className="px-3 py-2.5 text-right text-xs text-gray-400">{fmtRate(m.rate_monthly)}</td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center justify-end gap-1">
                                      <span className="text-xs text-gray-400">₹</span>
                                      <input type="number" min="0" step="100" disabled={!sel}
                                        className={`w-28 border rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-400
                                          ${sel ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-100 cursor-not-allowed'}`}
                                        value={row.basic_rate || ''}
                                        onChange={e => setRow(m.id, 'basic_rate', e.target.value)} />
                                    </div>
                                  </td>
                                  {/* Breakdown toggle */}
                                  <td className="px-3 py-2.5 text-center">
                                    <Toggle
                                      on={!!row.breakdown} size="sm"
                                      onClick={() => sel && setRow(m.id, 'breakdown', !row.breakdown)}
                                      color="bg-red-500"
                                    />
                                  </td>
                                  {/* Fuel toggle */}
                                  <td className="px-3 py-2.5 text-center">
                                    <Toggle
                                      on={fuelOn} size="sm"
                                      onClick={() => sel && setRow(m.id, 'fuel', !fuelOn)}
                                      color="bg-amber-500"
                                    />
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {m.wo_number ? (
                                      <div>
                                        <span className="text-xs font-medium text-blue-700">{m.wo_number}</span>
                                        {linkWO && sel && m.wo_item_id && (
                                          <span className="ml-1.5 text-xs text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded">will link</span>
                                        )}
                                      </div>
                                    ) : <span className="text-xs text-gray-400">—</span>}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {m.rule_id
                                      ? <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-mono">{m.rule_number}</span>
                                      : <span className="text-xs text-gray-400">—</span>}
                                  </td>
                                </tr>

                                {/* Fuel detail sub-row — expands when fuel is ON for this machine */}
                                {sel && fuelOn && (
                                  <tr key={`${m.id}-fuel`} className="bg-amber-50 border-t border-amber-100">
                                    <td colSpan={9} className="px-6 py-3">
                                      <div className="flex items-center gap-6 flex-wrap">
                                        <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                                          <Fuel size={12} />Fuel Deduction — {m.slno}
                                        </span>
                                        {/* Fuel type */}
                                        <div className="flex gap-4">
                                          {[
                                            ['economy',     'Economy (KM/Litre)'],
                                            ['consumption', 'Consumption (Litre/Hr)'],
                                          ].map(([v, label]) => (
                                            <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                                              <input type="radio"
                                                name={`fuel_type_${m.id}`}
                                                value={v}
                                                checked={(row.fuel_type || 'economy') === v}
                                                onChange={() => setRow(m.id, 'fuel_type', v)}
                                                className="accent-amber-600" />
                                              <span className="text-xs text-gray-700">{label}</span>
                                            </label>
                                          ))}
                                        </div>
                                        {/* Mileage or consumption */}
                                        {(row.fuel_type || 'economy') === 'economy' ? (
                                          <div className="flex items-center gap-1.5">
                                            <label className="text-xs text-gray-500 whitespace-nowrap">Approved Mileage (KM/L) <span className="text-red-500">*</span></label>
                                            <input type="number" min="0" step="0.01" placeholder="e.g. 3.5"
                                              className="border border-amber-300 rounded-lg px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                                              value={row.fuel_mileage || ''}
                                              onChange={e => setRow(m.id, 'fuel_mileage', e.target.value)} />
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1.5">
                                            <label className="text-xs text-gray-500 whitespace-nowrap">Consumption (L/Hr) <span className="text-red-500">*</span></label>
                                            <input type="number" min="0" step="0.001" placeholder="e.g. 12.5"
                                              className="border border-amber-300 rounded-lg px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                                              value={row.fuel_consumption || ''}
                                              onChange={e => setRow(m.id, 'fuel_consumption', e.target.value)} />
                                          </div>
                                        )}
                                        {/* Fuel rate */}
                                        <div className="flex items-center gap-1.5">
                                          <label className="text-xs text-gray-500 whitespace-nowrap">Rate (₹/Litre) <span className="text-red-500">*</span></label>
                                          <input type="number" min="0" step="0.01" placeholder="e.g. 85"
                                            className="border border-amber-300 rounded-lg px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                                            value={row.fuel_rate || ''}
                                            onChange={e => setRow(m.id, 'fuel_rate', e.target.value)} />
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* WO link toggle */}
                    {ownerTab === 'Hire' && machineList.some(m => m.wo_item_id) && (
                      <div className="mt-2.5 flex items-center gap-2">
                        <Toggle on={linkWO} onClick={() => setLinkWO(v => !v)} color="bg-emerald-600" />
                        <span className="text-xs text-gray-700">
                          Auto-link rules to Hire Work Orders
                          <span className="text-gray-400 ml-1">
                            ({selectedMachines.filter(m => m.wo_item_id).length} WO item{selectedMachines.filter(m => m.wo_item_id).length !== 1 ? 's' : ''} will be updated)
                          </span>
                        </span>
                      </div>
                    )}

                    {/* Legend */}
                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" />Brkd = Breakdown Deduction</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" />Fuel = Fuel Deduction (configures below row when ON)</span>
                    </div>
                  </div>
                )}

                {/* Step 3 — Shared config */}
                {!machLoading && machineList.length > 0 && (
                  <div>
                    <button onClick={() => setShowSharedConfig(v => !v)}
                      className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 hover:text-gray-700">
                      {showSharedConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      Step 3 — Shared Configuration (days / hours / km / maintenance — applies to all)
                    </button>
                    {showSharedConfig && (
                      <div className="border border-gray-200 rounded-xl p-4">
                        <SharedConfig s={shared} setS={setS} />
                      </div>
                    )}
                  </div>
                )}

                {ownerError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{ownerError}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button onClick={saveOwnerBulk}
                    disabled={ownerSaving || selectedMachines.length === 0}
                    className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">
                    {ownerSaving
                      ? <><RefreshCw size={14} className="animate-spin" />Creating…</>
                      : <><Plus size={15} />Create {selectedMachines.length > 0 ? `${selectedMachines.length} ` : ''}Ownership Rule{selectedMachines.length !== 1 ? 's' : ''}</>
                    }
                  </button>
                  <button onClick={() => setOwnerModal(false)}
                    className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
            <p className="font-semibold text-gray-900 mb-2">Delete Invoice Rule?</p>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={del} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
              <button onClick={() => setDelId(null)} className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg py-2 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
