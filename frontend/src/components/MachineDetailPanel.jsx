import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Edit2, X, Plus, Upload, Download, Eye, Trash2, RotateCcw,
  MoreVertical, Tag, Wrench, Calendar, IndianRupee, Clock, Info, MapPin,
  ClipboardList, ExternalLink, CheckCircle, XCircle, Loader2, ClipboardCheck,
  Check, Gauge, Settings, ArrowDownToLine, AlertCircle, History,
} from 'lucide-react'
import {
  getMachineCompliance, batchUpsertCompliance, deleteCompliance,
  getMachineDocuments, createMachineDocument, deleteMachineDocument, getMachineDocumentUrl,
  getMeterResetRequests, reviewMeterResetRequest,
  getMachineScs, updateMachineScs, executeMachineScs, inheritMachineScs,
  getLatestReadingBefore, updateMachineStatus, getMachineStatusHistory,
} from '../lib/api'

export function fmt(val) { return val ?? '—' }
export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
export function fmtMoney(v) {
  if (!v) return '—'
  return '₹ ' + Number(v).toLocaleString('en-IN')
}

export function DetailRow({ label, value, mono }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="w-44 flex-shrink-0 text-xs text-gray-400 font-medium pt-0.5">{label}</span>
      <span className={`text-xs text-gray-800 font-medium flex-1 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  )
}

export function DetailSection({ icon: Icon, title, children, menu }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        {Icon && <Icon size={13} className="text-gray-400" />}
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">{title}</span>
        {menu}
      </div>
      <div className="px-4 divide-y divide-gray-50">{children}</div>
    </div>
  )
}

export const ASSET_STATUSES = [
  { key: 'Active',    label: 'Active',    bg: 'bg-green-100',  text: 'text-green-700'  },
  { key: 'Idle',      label: 'Idle',      bg: 'bg-blue-100',   text: 'text-blue-700'   },
  { key: 'Breakdown', label: 'Breakdown', bg: 'bg-orange-100', text: 'text-orange-700' },
  { key: 'Surplus',   label: 'Surplus',   bg: 'bg-amber-100',  text: 'text-amber-700'  },
  { key: 'Accident',  label: 'Accident',  bg: 'bg-red-100',    text: 'text-red-700'    },
  { key: 'Scrap',     label: 'Scrap',     bg: 'bg-gray-100',   text: 'text-gray-600'   },
]

export function StatusBadge({ status }) {
  const s = ASSET_STATUSES.find(x => x.key === status) || ASSET_STATUSES[0]
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

export const COMP_TYPES = [
  { key: 'insurance',       label: 'Insurance Renewal' },
  { key: 'road_tax',        label: 'Road Tax Renewal' },
  { key: 'fitness',         label: 'Fitness Renewal' },
  { key: 'green_tax',       label: 'Green Tax' },
  { key: 'puc',             label: 'Pollution (PUC)' },
  { key: 'national_permit', label: 'National Permit' },
  { key: 'state_permit',    label: 'State Permit' },
  { key: 'load_test',       label: 'Load Test Cert.' },
]

export function calcCompStatus(expiryDate) {
  if (!expiryDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(expiryDate)
  const days = Math.ceil((exp - today) / 86400000)
  if (days < 0)   return 'expired'
  if (days <= 7)  return 'critical'
  if (days <= 30) return 'warning'
  return 'valid'
}

export const STATUS_DOT = {
  valid:    'bg-green-500',
  warning:  'bg-yellow-400',
  critical: 'bg-orange-500',
  expired:  'bg-red-500',
}

export function fmtCompDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Machine SCS Panel ─────────────────────────────────────────────────────────
function MachineScsPanel({ machineId }) {
  const [items,          setItems]          = useState([])
  const [unsynced,       setUnsynced]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [currentHours,   setCurrentHours]   = useState(null)
  const [currentKm,      setCurrentKm]      = useState(null)
  const [avgDailyHours,  setAvgDailyHours]  = useState(0)
  const [inheriting,     setInheriting]     = useState(false)
  const [menuId,         setMenuId]         = useState(null)
  const [intervalModal,  setIntervalModal]  = useState(null)
  const [intervalSaving, setIntervalSaving] = useState(false)
  const [executeModal,   setExecuteModal]   = useState(null)
  // execDate: the date field; execReading: auto-fetched from DPR (read-only)
  const [execDate,       setExecDate]       = useState('')
  const [execNote,       setExecNote]       = useState('')
  const [execReading,    setExecReading]    = useState({ hours: null, km: null, fetching: false, entryDate: null })
  const [execSaving,     setExecSaving]     = useState(false)

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full'

  const load = () => {
    setLoading(true)
    getMachineScs({ machine_id: machineId })
      .then(r => {
        setItems(r.data.data || [])
        setUnsynced(r.data.unsynced || [])
        setCurrentHours(r.data.current_hours ?? null)
        setCurrentKm(r.data.current_km ?? null)
        setAvgDailyHours(parseFloat(r.data.avg_daily_hours || 0))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [machineId])

  // Fetch DPR reading for a given date (used by execute modal when date changes)
  const fetchReadingForDate = async (date) => {
    if (!date) { setExecReading({ hours: null, km: null, fetching: false, entryDate: null }); return }
    setExecReading(r => ({ ...r, fetching: true }))
    try {
      const res = await getLatestReadingBefore({ machine_id: machineId, before_date: date })
      const entry = res.data.data
      setExecReading({
        hours: entry?.r1_close ?? null,
        km:    entry?.r2_close ?? null,
        fetching: false,
        entryDate: entry?.entry_date ?? null,
      })
    } catch {
      setExecReading({ hours: null, km: null, fetching: false, entryDate: null })
    }
  }

  // Calculate running status from DPR readings (auto-linked)
  const calcStatus = item => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    let worstPct = 0
    let dueDates = []
    let consumedHrs = null
    let consumedKm  = null

    if (item.hours_enabled && item.interval_hours && item.last_done_hours != null && currentHours != null) {
      consumedHrs = Math.max(0, parseFloat(currentHours) - parseFloat(item.last_done_hours))
      const pct = (consumedHrs / item.interval_hours) * 100
      if (pct > worstPct) worstPct = pct
      // Project due date from hours: remaining hours ÷ avg daily hours
      if (avgDailyHours > 0) {
        const remainingHrs = item.interval_hours - consumedHrs
        const daysUntilDue = remainingHrs / avgDailyHours
        const due = new Date(today)
        due.setDate(due.getDate() + Math.ceil(daysUntilDue))
        dueDates.push(due)
      }
    }
    if (item.days_enabled && item.interval_days && item.last_done_date) {
      const doneDt = new Date(item.last_done_date); doneDt.setHours(0, 0, 0, 0)
      const daysSince = Math.ceil((today - doneDt) / 86400000)
      const pct = (daysSince / item.interval_days) * 100
      if (pct > worstPct) worstPct = pct
      const due = new Date(doneDt); due.setDate(due.getDate() + item.interval_days)
      dueDates.push(due)
    }
    if (item.km_enabled && item.interval_km && item.last_done_km != null && currentKm != null) {
      consumedKm = Math.max(0, parseFloat(currentKm) - parseFloat(item.last_done_km))
      const pct = (consumedKm / item.interval_km) * 100
      if (pct > worstPct) worstPct = pct
    }

    const dueDate = dueDates.length ? dueDates.sort((a, b) => a - b)[0] : null
    return { pct: worstPct, dueDate, consumedHrs, consumedKm }
  }

  const barColor = pct => {
    if (pct >= 100) return 'bg-red-700'
    if (pct >=  90) return 'bg-red-400'
    if (pct >=  70) return 'bg-amber-400'
    return 'bg-green-500'
  }

  const fmtDt = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'

  const openExecute = item => {
    const today = new Date().toISOString().slice(0, 10)
    setExecuteModal(item)
    setExecDate(today)
    setExecNote('')
    setMenuId(null)
    // Auto-fetch today's DPR reading immediately
    setExecReading({ hours: currentHours, km: currentKm, fetching: false, entryDate: null })
  }

  const handleExecDateChange = (date) => {
    setExecDate(date)
    fetchReadingForDate(date)
  }

  const handleExecute = async () => {
    setExecSaving(true)
    try {
      await executeMachineScs(executeModal.id, {
        execution_date:  execDate || null,
        execution_hours: execReading.hours != null ? parseFloat(execReading.hours) : null,
        execution_km:    execReading.km    != null ? parseFloat(execReading.km)    : null,
        remark:          execNote.trim() || null,
      })
      setExecuteModal(null)
      load()
    } catch {}
    finally { setExecSaving(false) }
  }

  const handleIntervalSave = async form => {
    setIntervalSaving(true)
    try {
      await updateMachineScs(intervalModal.id, {
        ...intervalModal,
        hours_enabled:  form.hours_enabled,
        interval_hours: parseInt(form.interval_hours) || null,
        km_enabled:     form.km_enabled,
        interval_km:    parseInt(form.interval_km)    || null,
        days_enabled:   form.days_enabled,
        interval_days:  parseInt(form.interval_days)  || null,
        is_inherited:   false,
      })
      setIntervalModal(null)
      load()
    } catch {}
    finally { setIntervalSaving(false) }
  }

  const handleInherit = async () => {
    setInheriting(true)
    try { await inheritMachineScs({ machine_id: machineId }); load() } catch {}
    finally { setInheriting(false) }
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-blue-600 rounded-full" />
          <h3 className="text-sm font-semibold text-gray-800">Service CheckSheet Running Status</h3>
          {unsynced.length > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
              {unsynced.length} unsynced
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentHours != null && (
            <span className="text-[11px] text-gray-500 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg font-mono">
              Current: <span className="text-blue-700 font-semibold">{parseFloat(currentHours).toFixed(1)} Hrs</span>
              {currentKm != null ? <span className="text-gray-400"> · {parseFloat(currentKm).toFixed(0)} KM</span> : ''}
            </span>
          )}
          {unsynced.length > 0 && (
            <button onClick={handleInherit} disabled={inheriting}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-60">
              {inheriting ? <Loader2 size={11} className="animate-spin"/> : <ArrowDownToLine size={11}/>}
              Inherit
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 size={18} className="animate-spin mr-2"/> Loading…
        </div>
      ) : items.length === 0 && unsynced.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
          <ClipboardCheck size={28} className="text-gray-300"/>
          <p className="text-sm">No checksheets configured for this asset category.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr>
                <th className="px-3 py-2.5 w-7 text-center">
                  <input type="checkbox" className="w-3.5 h-3.5 accent-blue-700"/>
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Name</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Linked Items</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Last CS Done</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-44">Running Status</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Due Date</th>
                <th className="px-3 py-2.5 w-10 text-center font-semibold text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => {
                const name = item.custom_name || item.check_sheet_name || '—'
                const hasInterval = item.hours_enabled || item.days_enabled || item.km_enabled
                const hasLastDone = item.last_done_date || item.last_done_hours != null
                const { pct, dueDate, consumedHrs, consumedKm } = calcStatus(item)
                const pctCapped = Math.min(pct, 100)
                const isOverdue = pct >= 100
                const today = new Date(); today.setHours(0, 0, 0, 0)

                return (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${!item.enabled ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-3 text-center">
                      <input type="checkbox" className="w-3.5 h-3.5 accent-blue-700"/>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-gray-800 leading-tight">{name}</p>
                      {item.is_inherited && (
                        <span className="text-[10px] text-blue-400 font-normal">inherited</span>
                      )}
                      {item.section && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{item.section}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {item.hours_enabled && item.interval_hours && (
                          <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-0.5">
                            <Clock size={9}/> {item.interval_hours} Hrs
                          </span>
                        )}
                        {item.days_enabled && item.interval_days && (
                          <span className="text-[10px] text-orange-600 font-semibold flex items-center gap-0.5">
                            <Calendar size={9}/> {item.interval_days} Days
                          </span>
                        )}
                        {item.km_enabled && item.interval_km && (
                          <span className="text-[10px] text-green-600 font-semibold flex items-center gap-0.5">
                            <Gauge size={9}/> {item.interval_km} KM
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-300 text-[10px] italic">—</td>
                    <td className="px-3 py-3">
                      {hasLastDone ? (
                        <div className="space-y-0.5 text-[10px] leading-snug">
                          {item.last_done_hours != null && (
                            <p className="text-gray-500">Hours: <span className="font-semibold text-gray-800">{parseFloat(item.last_done_hours).toFixed(1)} Hr</span></p>
                          )}
                          {item.last_done_km != null && (
                            <p className="text-gray-500">KM: <span className="font-semibold text-gray-800">{parseFloat(item.last_done_km).toFixed(0)} Km</span></p>
                          )}
                          {item.last_done_date && (
                            <p className="text-gray-500">Date: <span className="font-semibold text-gray-800">{fmtDt(item.last_done_date)}</span></p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-300 italic">Not recorded</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {hasInterval && hasLastDone ? (
                        <div className="space-y-1">
                          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor(pct)}`} style={{ width: `${pctCapped}%` }}/>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {consumedHrs != null && (
                              <span className={`text-[10px] font-semibold ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                                {consumedHrs.toFixed(0)} Hrs
                              </span>
                            )}
                            {consumedKm != null && (
                              <span className={`text-[10px] font-semibold ${isOverdue ? 'text-red-600' : 'text-green-700'}`}>
                                {consumedKm.toFixed(0)} KM
                              </span>
                            )}
                            {isOverdue && (
                              <span className="text-[10px] font-bold text-red-600">Overdue</span>
                            )}
                          </div>
                        </div>
                      ) : !hasInterval ? (
                        <span className="text-[10px] text-gray-300 italic">N/A</span>
                      ) : (
                        <button onClick={() => openExecute(item)}
                          className="text-[10px] text-blue-600 hover:underline font-medium">
                          Record first execution →
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {dueDate ? (
                        <span className={`text-[11px] font-semibold whitespace-nowrap ${dueDate < today ? 'text-red-600' : 'text-gray-700'}`}>
                          {fmtDt(dueDate)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-300">N/A</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center relative">
                      <button onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                        <MoreVertical size={13}/>
                      </button>
                      {menuId === item.id && (
                        <div className="absolute right-8 top-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl w-44 py-1 text-xs text-left">
                          <button onClick={() => openExecute(item)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-green-50 text-green-700">
                            <CheckCircle size={12}/> Execute / Mark Done
                          </button>
                          <button onClick={() => { setIntervalModal(item); setMenuId(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700">
                            <Settings size={12}/> Change Interval
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {unsynced.length > 0 && (
            <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
              <p className="text-xs text-amber-700 font-semibold mb-1.5">
                {unsynced.length} category checksheet{unsynced.length !== 1 ? 's' : ''} not yet synced to this asset:
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {unsynced.map(u => (
                  <span key={u.id} className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    {u.custom_name || u.check_sheet_name}
                  </span>
                ))}
              </div>
              <button onClick={handleInherit} disabled={inheriting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg disabled:opacity-60">
                {inheriting ? <Loader2 size={11} className="animate-spin"/> : <ArrowDownToLine size={11}/>}
                Inherit Missing Checksheets
              </button>
            </div>
          )}
        </div>
      )}

      {/* Execute / Mark Done Modal */}
      {executeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 bg-green-700 rounded-t-2xl">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <CheckCircle size={15}/> Mark as Executed
              </h3>
              <button onClick={() => setExecuteModal(null)} className="text-green-200 hover:text-white"><X size={18}/></button>
            </div>
            <div className="px-5 py-2.5 bg-green-50 border-b border-green-100">
              <p className="text-xs font-semibold text-green-800">{executeModal.custom_name || executeModal.check_sheet_name}</p>
            </div>
            <div className="p-5 space-y-4">
              {/* Date — drives auto-fetch */}
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">Date of Execution *</label>
                <input type="date" value={execDate} max={new Date().toISOString().slice(0, 10)}
                  onChange={e => handleExecDateChange(e.target.value)}
                  className={inp}/>
              </div>

              {/* Auto-fetched readings — read-only */}
              <div className={`rounded-xl border p-4 space-y-3 ${execReading.fetching ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                    <Clock size={12} className="text-blue-500"/>
                    Meter Readings from DPR Log
                  </p>
                  {execReading.fetching && <Loader2 size={12} className="animate-spin text-blue-500"/>}
                  {!execReading.fetching && execReading.entryDate && (
                    <span className="text-[10px] text-gray-400">entry: {fmtDt(execReading.entryDate)}</span>
                  )}
                </div>
                {execReading.fetching ? (
                  <p className="text-xs text-blue-500">Fetching readings for selected date…</p>
                ) : execReading.hours == null && execReading.km == null ? (
                  <p className="text-xs text-amber-600">No DPR entry found for or before this date.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {(executeModal.hours_enabled || execReading.hours != null) && (
                      <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
                        <p className="text-[10px] text-gray-400 font-medium">Hours Reading</p>
                        <p className="text-sm font-bold text-blue-700 mt-0.5">
                          {execReading.hours != null ? `${parseFloat(execReading.hours).toFixed(1)} Hr` : '—'}
                        </p>
                      </div>
                    )}
                    {(executeModal.km_enabled || execReading.km != null) && (
                      <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
                        <p className="text-[10px] text-gray-400 font-medium">KM Reading</p>
                        <p className="text-sm font-bold text-green-700 mt-0.5">
                          {execReading.km != null ? `${parseFloat(execReading.km).toFixed(0)} KM` : '—'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-gray-400 italic">
                  Readings are auto-fetched from DPR log. Change the date above to fetch a different entry.
                </p>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">Note (optional)</label>
                <textarea rows={2} value={execNote}
                  onChange={e => setExecNote(e.target.value)}
                  placeholder="e.g. changed oil filter, checked levels…"
                  className={inp + ' resize-none'}/>
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
              <button
                onClick={handleExecute}
                disabled={execSaving || !execDate || execReading.fetching || (execReading.hours == null && execReading.km == null)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white font-semibold rounded-lg text-sm">
                {execSaving ? <Loader2 size={13} className="animate-spin"/> : <CheckCircle size={13}/>}
                {execSaving ? 'Saving…' : 'Mark as Done'}
              </button>
              <button onClick={() => setExecuteModal(null)}
                className="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interval Modal */}
      {intervalModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-indigo-700 rounded-t-2xl">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Settings size={14}/> Change Interval
              </h3>
              <button onClick={() => setIntervalModal(null)} className="text-indigo-200 hover:text-white"><X size={18}/></button>
            </div>
            <div className="text-xs text-gray-500 font-medium bg-indigo-50 border-b border-indigo-100 px-5 py-2.5">
              {intervalModal.custom_name || intervalModal.check_sheet_name}
              {intervalModal.is_inherited && <span className="ml-2 text-indigo-400">— override category default</span>}
            </div>
            <MachineIntervalEditor item={intervalModal} onSave={handleIntervalSave} onClose={() => setIntervalModal(null)} saving={intervalSaving} inp={inp}/>
          </div>
        </div>
      )}

      {menuId && <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)}/>}
    </div>
  )
}

function MachineIntervalEditor({ item, onSave, onClose, saving, inp }) {
  const [form, setForm] = useState({
    hours_enabled: item?.hours_enabled ?? true,
    interval_hours: item?.interval_hours ?? '',
    km_enabled: item?.km_enabled ?? false,
    interval_km: item?.interval_km ?? '',
    days_enabled: item?.days_enabled ?? false,
    interval_days: item?.interval_days ?? '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const rows = [
    { key: 'hours', label: 'Hours', icon: Clock, unit: 'Hours', active: 'border-blue-300 bg-blue-50',   chk: 'accent-blue-600',   ic: 'text-blue-600'   },
    { key: 'km',    label: 'KM',    icon: Gauge, unit: 'KM',    active: 'border-green-300 bg-green-50', chk: 'accent-green-600',  ic: 'text-green-600'  },
    { key: 'days',  label: 'Days',  icon: Calendar, unit: 'Days', active: 'border-orange-300 bg-orange-50', chk: 'accent-orange-600', ic: 'text-orange-600' },
  ]
  return (
    <div>
      <div className="p-5 space-y-3">
        {rows.map(({ key, label, icon: Icon, unit, active, chk, ic }) => (
          <div key={key} className={`rounded-xl border p-3.5 ${form[`${key}_enabled`] ? active : 'border-gray-200'}`}>
            <label className="flex items-center gap-3 cursor-pointer mb-2">
              <input type="checkbox" className={`w-4 h-4 ${chk}`}
                checked={form[`${key}_enabled`]} onChange={e => set(`${key}_enabled`, e.target.checked)}/>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                <Icon size={14} className={ic}/> {label}-based
              </span>
            </label>
            {form[`${key}_enabled`] && (
              <div className="flex items-center gap-2 pl-7">
                <input type="number" min="1" className={inp + ' max-w-[100px]'}
                  value={form[`interval_${key}`]} onChange={e => set(`interval_${key}`, e.target.value)}/>
                <span className="text-sm text-gray-500">{unit}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-3 px-5 py-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
        <button onClick={() => onSave(form)} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white font-semibold rounded-lg text-sm">
          {saving ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>}
          {saving ? 'Saving…' : 'Apply'}
        </button>
        <button onClick={onClose} className="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  )
}

export default function MachineDetailPanel({ machine: m, onClose, onEdit, initialRightTab }) {
  // ── Asset Status state ──────────────────────────────────────────────────────
  const [assetStatus,        setAssetStatus]        = useState(m.asset_status || 'Active')
  const [assetStatusSince,   setAssetStatusSince]   = useState(m.asset_status_since || m.created_at)
  const [assetStatusRemarks, setAssetStatusRemarks] = useState(m.asset_status_remarks || '')
  const [assetStatusBy,      setAssetStatusBy]      = useState(m.asset_status_changed_by_name || '')
  const [statusModal,        setStatusModal]        = useState(false)
  const [statusForm,         setStatusForm]         = useState({ status: '', remarks: '' })
  const [statusSaving,       setStatusSaving]       = useState(false)
  const [statusErr,          setStatusErr]          = useState('')
  const [statusHistory,      setStatusHistory]      = useState([])
  const [historyOpen,        setHistoryOpen]        = useState(false)
  const [historyLoading,     setHistoryLoading]     = useState(false)
  const [sectionMenu,        setSectionMenu]        = useState(null) // which section's menu is open

  const openStatusModal = () => {
    setStatusForm({ status: assetStatus, remarks: '' })
    setStatusErr('')
    setStatusModal(true)
    setSectionMenu(null)
  }

  const loadStatusHistory = async () => {
    setHistoryLoading(true)
    try {
      const r = await getMachineStatusHistory(m.id)
      setStatusHistory(r.data.data || [])
    } catch {}
    setHistoryLoading(false)
  }

  const handleStatusSave = async () => {
    if (!statusForm.remarks.trim()) { setStatusErr('Remarks are required'); return }
    setStatusSaving(true)
    setStatusErr('')
    try {
      await updateMachineStatus(m.id, { status: statusForm.status, remarks: statusForm.remarks.trim() })
      setAssetStatus(statusForm.status)
      setAssetStatusSince(new Date().toISOString())
      setAssetStatusRemarks(statusForm.remarks.trim())
      setStatusModal(false)
      // refresh history if open
      if (historyOpen) loadStatusHistory()
      window.dispatchEvent(new CustomEvent('machineStatusChanged', { detail: { id: m.id, status: statusForm.status } }))
    } catch (e) {
      setStatusErr(e.response?.data?.error || 'Failed to update status')
    } finally { setStatusSaving(false) }
  }

  // ── Compliance state ────────────────────────────────────────────────────────
  const [compDocs,     setCompDocs]     = useState([])
  const [compLoading,  setCompLoading]  = useState(true)
  const [editingKey,   setEditingKey]   = useState(null)
  const [editForm,     setEditForm]     = useState({})
  const [compSaving,   setCompSaving]   = useState(false)
  const [addingNew,    setAddingNew]    = useState(false)
  const [newLabel,     setNewLabel]     = useState('')
  const [menuOpen,     setMenuOpen]     = useState(null)
  const [deleting,     setDeleting]     = useState(null)

  const [rightTab,     setRightTab]     = useState(initialRightTab || 'compliance')

  const [resetReqs,       setResetReqs]       = useState([])
  const [resetReqsLoading, setResetReqsLoading] = useState(false)
  const [reviewingId,     setReviewingId]     = useState(null)
  const [reviewNote,      setReviewNote]      = useState('')
  const [reviewNoteOpen,  setReviewNoteOpen]  = useState(null) // { id, action }
  const [reviewErr,       setReviewErr]       = useState(null) // { id, msg }
  const [reviewSuccess,   setReviewSuccess]   = useState(null) // { id, action }

  const [docs,         setDocs]         = useState([])
  const [docsLoading,  setDocsLoading]  = useState(true)
  const [addingDoc,    setAddingDoc]    = useState(false)
  const [docForm,      setDocForm]      = useState({ doc_name: '', doc_number: '' })
  const [docFile,      setDocFile]      = useState(null)
  const [docSaving,    setDocSaving]    = useState(false)
  const [docMenuOpen,  setDocMenuOpen]  = useState(null)
  const [docDeleting,  setDocDeleting]  = useState(null)
  const docFileRef = useRef()

  useEffect(() => {
    setCompLoading(true)
    getMachineCompliance(m.id)
      .then(r => setCompDocs(r.data.data || []))
      .catch(() => {})
      .finally(() => setCompLoading(false))
    setDocsLoading(true)
    getMachineDocuments(m.id)
      .then(r => setDocs(r.data.data || []))
      .catch(() => {})
      .finally(() => setDocsLoading(false))
  }, [m.id])

  const loadResetReqs = () => {
    setResetReqsLoading(true)
    getMeterResetRequests({ machine_id: m.id })
      .then(r => setResetReqs(r.data.data || []))
      .catch(() => setResetReqs([]))
      .finally(() => setResetReqsLoading(false))
  }
  useEffect(() => { if (rightTab === 'counter-reset') loadResetReqs() }, [rightTab, m.id])

  const handleReview = async (id, action) => {
    setReviewingId(id)
    setReviewErr(null)
    setReviewSuccess(null)
    try {
      await reviewMeterResetRequest(id, { action, review_note: reviewNote || undefined })
      setReviewNoteOpen(null); setReviewNote('')
      setReviewSuccess({ id, action })
      loadResetReqs()
      window.dispatchEvent(new CustomEvent('resetRequestReviewed'))
      setTimeout(() => setReviewSuccess(null), 4000)
    } catch (e) {
      setReviewErr({ id, msg: e.response?.data?.error || 'Failed to process request' })
    } finally { setReviewingId(null) }
  }

  const handleDocFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setDocFile({ file, name: file.name, mime: file.type, dataUrl: ev.target.result })
    reader.readAsDataURL(file)
  }

  const saveDoc = async () => {
    if (!docForm.doc_name.trim()) return
    setDocSaving(true)
    try {
      await createMachineDocument({
        machine_id: m.id,
        doc_name:   docForm.doc_name.trim(),
        doc_number: docForm.doc_number.trim() || null,
        file_data:  docFile?.dataUrl || null,
        file_name:  docFile?.name    || null,
        file_mime:  docFile?.mime    || null,
      })
      const r = await getMachineDocuments(m.id)
      setDocs(r.data.data)
      setAddingDoc(false)
      setDocForm({ doc_name: '', doc_number: '' })
      setDocFile(null)
      if (docFileRef.current) docFileRef.current.value = ''
    } catch (_) {}
    setDocSaving(false)
  }

  const openDocUrl = async (doc, forceDownload = false) => {
    try {
      const res = await getMachineDocumentUrl(doc.id)
      const { url, file_name } = res.data
      if (forceDownload) {
        const a = document.createElement('a')
        a.href = url; a.download = file_name || doc.doc_name
        a.target = '_blank'; a.rel = 'noopener noreferrer'
        a.click()
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (_) {}
  }

  const handleDocDelete = async (id) => {
    setDocDeleting(id); setDocMenuOpen(null)
    try {
      await deleteMachineDocument(id)
      setDocs(prev => prev.filter(d => d.id !== id))
    } catch (_) {}
    setDocDeleting(null)
  }

  const docMap = useMemo(() => {
    const map = {}
    for (const d of compDocs) {
      const key = d.doc_type === 'custom' ? `custom__${d.doc_label}` : d.doc_type
      map[key] = d
    }
    return map
  }, [compDocs])

  const compRows = useMemo(() => {
    const standard = COMP_TYPES
      .filter(t => !docMap[t.key]?.hidden)
      .map(t => ({ key: t.key, label: t.label, doc: docMap[t.key] || null, isCustom: false }))
    const custom = compDocs
      .filter(d => d.doc_type === 'custom' && !d.hidden)
      .map(d => ({ key: `custom__${d.doc_label}`, label: d.doc_label, doc: d, isCustom: true }))
    return [...standard, ...custom]
  }, [docMap, compDocs])

  const startEdit = (key, doc) => {
    setEditingKey(key)
    setEditForm({
      expiry_date:  doc?.expiry_date  ? doc.expiry_date.slice(0, 10)  : '',
      issued_date:  doc?.issued_date  ? doc.issued_date.slice(0, 10)  : '',
      doc_no:       doc?.doc_no       || '',
      notes:        doc?.notes        || '',
    })
    setMenuOpen(null)
  }

  const saveCompDoc = async (key, label) => {
    setCompSaving(true)
    const isCustom = key.startsWith('custom__')
    try {
      await batchUpsertCompliance({
        machine_id: m.id,
        docs: [{
          doc_type:    isCustom ? 'custom' : key,
          doc_label:   isCustom ? label : '',
          expiry_date: editForm.expiry_date || null,
          issued_date: editForm.issued_date || null,
          doc_no:      editForm.doc_no      || null,
          notes:       editForm.notes       || null,
        }]
      })
      const r = await getMachineCompliance(m.id)
      setCompDocs(r.data.data)
      setEditingKey(null)
    } catch (_) {}
    setCompSaving(false)
  }

  const deleteDoc = async (id) => {
    setDeleting(id)
    try {
      await deleteCompliance(id)
      setCompDocs(prev => prev.filter(d => d.id !== id))
    } catch (_) {}
    setDeleting(null)
    setMenuOpen(null)
  }

  const removeFromList = async (key, label, doc) => {
    setMenuOpen(null)
    const isCustom = key.startsWith('custom__')
    if (isCustom && doc?.id) {
      await deleteDoc(doc.id)
      return
    }
    setCompSaving(true)
    try {
      await batchUpsertCompliance({
        machine_id: m.id,
        docs: [{ doc_type: key, doc_label: '', hidden: true,
                 expiry_date: null, issued_date: null, doc_no: null, notes: null }]
      })
      const r = await getMachineCompliance(m.id)
      setCompDocs(r.data.data)
    } catch (_) {}
    setCompSaving(false)
  }

  const addCustom = async () => {
    if (!newLabel.trim()) return
    setCompSaving(true)
    try {
      await batchUpsertCompliance({
        machine_id: m.id,
        docs: [{ doc_type: 'custom', doc_label: newLabel.trim(), expiry_date: null, notes: null }]
      })
      const r = await getMachineCompliance(m.id)
      setCompDocs(r.data.data)
      setNewLabel(''); setAddingNew(false)
    } catch (_) {}
    setCompSaving(false)
  }

  const navigate = useNavigate()

  const goToLogEntry = () => {
    onClose()
    navigate('/entry', { state: { project_code: m.project_code, machine_id: m.id } })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 bg-gray-50 shadow-2xl flex flex-col overflow-hidden border-l border-gray-200"
        style={{ width: 'min(980px, 95vw)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded text-xs flex-shrink-0">{m.project_code}</span>
            <div className="min-w-0">
              {m.nickname
                ? <>
                    <h2 className="text-base font-bold text-gray-900 truncate leading-tight">{m.nickname}</h2>
                    <p className="text-[11px] text-gray-400 font-mono leading-tight truncate">{m.slno}</p>
                  </>
                : <h2 className="text-base font-bold text-gray-900 truncate">{m.slno}</h2>
              }
            </div>
            <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              m.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
            }`}>{m.active ? 'Active' : 'Inactive'}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {onEdit && (
              <button onClick={onEdit} title="Edit"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <Edit2 size={14} />
              </button>
            )}
            <button onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Quick strip */}
        <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex-1 px-4 py-2 border-r border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Asset Name</p>
            <p className="text-xs font-semibold text-gray-800 mt-0.5 truncate">{m.eq_type || '—'}</p>
          </div>
          <div className="flex-1 px-4 py-2 border-r border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Owner</p>
            <p className={`text-xs font-semibold mt-0.5 ${m.ownership === 'Own' ? 'text-blue-600' : 'text-violet-600'}`}>
              {m.ownership === 'Own' ? 'RVR Projects Pvt Ltd' : (m.vendor || m.ownership)}
            </p>
          </div>
          <div className="flex-1 px-4 py-2">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Shift</p>
            <p className={`text-xs font-semibold mt-0.5 ${m.shift_type === 'Dual Shift' ? 'text-amber-600' : 'text-green-600'}`}>{m.shift_type || '—'}</p>
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT: Asset details */}
          <div className="w-[380px] flex-shrink-0 overflow-y-auto border-r border-gray-200 p-4 space-y-3">

            <DetailSection icon={Tag} title="Asset Identification"
              menu={
                <div className="relative">
                  <button onClick={() => setSectionMenu(sectionMenu === 'ident' ? null : 'ident')}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors">
                    <MoreVertical size={13}/>
                  </button>
                  {sectionMenu === 'ident' && onEdit && (
                    <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-36 text-xs">
                      <button onClick={() => { onEdit(); setSectionMenu(null) }}
                        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-blue-50 text-gray-700">
                        <Edit2 size={11} className="text-blue-500"/> Edit Machine
                      </button>
                    </div>
                  )}
                </div>
              }>
              {m.nickname && <DetailRow label="Nickname"        value={m.nickname} />}
              <DetailRow label="Asset Code"      value={m.asset_code} mono />
              <DetailRow label="Asset Group"     value={m.asset_group} />
              <DetailRow label="Asset Category"  value={m.asset_cat} />
              <DetailRow label="Measurability"   value={m.asset_type
                ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    m.asset_type === 'Measurable Asset' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                  }`}>{m.asset_type}</span>
                : '—'} />
              <DetailRow label="Registration No" value={m.reg_no} mono />
              <DetailRow label="Chassis No"      value={m.chassis_no} mono />
              <DetailRow label="Engine No"       value={m.engine_no} mono />
            </DetailSection>

            {/* ── Asset Status ──────────────────────────────────────────── */}
            <DetailSection icon={AlertCircle} title="Asset Status"
              menu={
                <div className="relative">
                  <button onClick={() => setSectionMenu(sectionMenu === 'status' ? null : 'status')}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors">
                    <MoreVertical size={13}/>
                  </button>
                  {sectionMenu === 'status' && (
                    <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-40 text-xs">
                      <button onClick={openStatusModal}
                        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-blue-50 text-gray-700">
                        <AlertCircle size={11} className="text-blue-500"/> Change Status
                      </button>
                      <button onClick={() => { setHistoryOpen(h => !h); if (!historyOpen) loadStatusHistory(); setSectionMenu(null) }}
                        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-50 text-gray-700">
                        <History size={11} className="text-gray-400"/> {historyOpen ? 'Hide History' : 'View History'}
                      </button>
                    </div>
                  )}
                </div>
              }>
              <DetailRow label="Status" value={<StatusBadge status={assetStatus}/>}/>
              <DetailRow label="Since"  value={fmtDate(assetStatusSince)}/>
              {assetStatusRemarks && <DetailRow label="Remarks" value={assetStatusRemarks}/>}
              {assetStatusBy && <DetailRow label="Changed By" value={assetStatusBy}/>}
            </DetailSection>

            {/* Status History (inline, collapsible) */}
            {historyOpen && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <History size={13} className="text-gray-400"/>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">Status History</span>
                  <button onClick={() => setHistoryOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={13}/>
                  </button>
                </div>
                <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-6 text-gray-400 gap-2">
                      <Loader2 size={14} className="animate-spin"/> Loading…
                    </div>
                  ) : statusHistory.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">No history recorded</p>
                  ) : statusHistory.map(h => (
                    <div key={h.id} className="px-4 py-2.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <StatusBadge status={h.status}/>
                        <span className="text-[10px] text-gray-400">{fmtDate(h.changed_at)}</span>
                      </div>
                      {h.remarks && <p className="text-[11px] text-gray-600 mt-0.5">{h.remarks}</p>}
                      {h.changed_by_name && <p className="text-[10px] text-gray-400 mt-0.5">by {h.changed_by_name}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DetailSection icon={Wrench} title="Machine Specifications"
              menu={
                <div className="relative">
                  <button onClick={() => setSectionMenu(sectionMenu === 'specs' ? null : 'specs')}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors">
                    <MoreVertical size={13}/>
                  </button>
                  {sectionMenu === 'specs' && onEdit && (
                    <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-36 text-xs">
                      <button onClick={() => { onEdit(); setSectionMenu(null) }}
                        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-blue-50 text-gray-700">
                        <Edit2 size={11} className="text-blue-500"/> Edit Machine
                      </button>
                    </div>
                  )}
                </div>
              }>
              <DetailRow label="Manufacturer" value={m.manufacturer} />
              <DetailRow label="Model"        value={m.model} />
              <DetailRow label="Year of Mfg." value={m.yom} />
              <DetailRow label="Capacity"     value={m.capacity ? `${m.capacity}${m.uom ? ' ' + m.uom : ''}` : '—'} />
              <DetailRow label="Fuel Type"    value={m.fuel_type
                ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{m.fuel_type}</span>
                : '—'} />
            </DetailSection>

            <DetailSection icon={IndianRupee} title={m.ownership === 'Hire' ? 'Hire Details' : 'Purchase Details'}>
              {m.ownership === 'Hire' ? (
                <>
                  <DetailRow label="Vendor"       value={m.vendor} />
                  <DetailRow label="Rate / Day"   value={fmtMoney(m.rate)} />
                  <DetailRow label="Rate / Month" value={fmtMoney(m.rate_monthly)} />
                </>
              ) : (
                <>
                  <DetailRow label="Date of Purchase" value={fmtDate(m.date_of_purchase)} />
                  <DetailRow label="PO Number"        value={m.po_number} mono />
                  <DetailRow label="Purchase Price"   value={fmtMoney(m.price)} />
                </>
              )}
            </DetailSection>

            <DetailSection icon={Clock} title="Operational Settings">
              <DetailRow label="Reading Basis" value={
                m.dual_reading ? `${m.reading1_basis} + ${m.reading2_basis || 'Dual'}` : (m.reading1_basis || '—')
              } />
              <DetailRow label="Fuel Min (L/hr)"  value={fmt(m.fuel_min)} />
              <DetailRow label="Fuel Max (L/hr)"  value={fmt(m.fuel_max)} />
              {(m.fuel_min_km || m.fuel_max_km) && <>
                <DetailRow label="Fuel Min (km/l)" value={fmt(m.fuel_min_km)} />
                <DetailRow label="Fuel Max (km/l)" value={fmt(m.fuel_max_km)} />
              </>}
              <DetailRow label="Planned Hrs/Day" value={m.planned_hours ? `${m.planned_hours} hrs` : '—'} />
            </DetailSection>

            <DetailSection icon={Info} title="System Info">
              {!m.active && <DetailRow label="Reason" value={m.deactivation_reason} />}
              <DetailRow label="Added On"     value={fmtDate(m.created_at)} />
              <DetailRow label="Last Updated" value={fmtDate(m.updated_at)} />
            </DetailSection>

            <DetailSection icon={Calendar} title="Shift">
              <DetailRow label="Roster"        value={m.shift_type || '—'} />
              <DetailRow label="No. of Shifts" value={m.shift_type === 'Dual Shift' ? '2' : '1'} />
              <DetailRow label="Shift 1"       value="Day Shift" />
              {m.shift_type === 'Dual Shift' && <DetailRow label="Shift 2" value="Night Shift" />}
              <DetailRow label="Planned Hrs / Shift" value={m.planned_hours ? `${m.planned_hours} hrs` : '—'} />
            </DetailSection>

            <DetailSection icon={MapPin} title="Site">
              <DetailRow label="Current Site"  value={m.project_name ? `${m.project_code} — ${m.project_name}` : m.project_code} />
              <DetailRow label="Date of Receipt"
                value={m.transferred_date ? fmtDate(m.transferred_date) : m.date_of_purchase ? fmtDate(m.date_of_purchase) : 'Inception'} />
              {m.transferred_date && (
                <DetailRow label="Transferred From" value={m.transferred_from_project_id ? `Project ID ${m.transferred_from_project_id}` : '—'} />
              )}
            </DetailSection>

          </div>

          {/* RIGHT: Tabbed panel (Compliance | Documents) */}
          <div className="flex-1 overflow-hidden flex flex-col">

            {/* Tab bar */}
            <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
              <button
                onClick={() => setRightTab('compliance')}
                className={`px-5 py-3 text-xs font-semibold border-b-2 transition-colors ${
                  rightTab === 'compliance'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                Compliance
              </button>
              <button
                onClick={() => setRightTab('documents')}
                className={`px-5 py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  rightTab === 'documents'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                Documents
                {docs.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{docs.length}</span>
                )}
              </button>
              <button
                onClick={() => setRightTab('counter-reset')}
                className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  rightTab === 'counter-reset'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                <RotateCcw size={12} />Counter Reset
                {resetReqs.filter(r => r.status === 'pending').length > 0 && (
                  <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {resetReqs.filter(r => r.status === 'pending').length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setRightTab('scs')}
                className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  rightTab === 'scs'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                <ClipboardCheck size={12} />Checksheets
              </button>
              <button
                onClick={goToLogEntry}
                className="px-5 py-3 text-xs font-semibold border-b-2 border-transparent text-gray-500 hover:text-blue-700 transition-colors flex items-center gap-1.5">
                <ClipboardList size={12} />Log Entry
                <ExternalLink size={10} className="opacity-60" />
              </button>
            </div>

            {/* COMPLIANCE TAB */}
            {rightTab === 'compliance' && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-blue-700 rounded-full" />
                    <h3 className="text-sm font-semibold text-gray-800">Asset Compliances</h3>
                  </div>
                  <button onClick={() => { setAddingNew(true); setNewLabel('') }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors">
                    <Plus size={12} />Add Compliance
                  </button>
                </div>

                {addingNew && (
                  <div className="flex items-center gap-2 px-5 py-2.5 bg-blue-50 border-b border-blue-100">
                    <input autoFocus type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCustom(); if (e.key === 'Escape') setAddingNew(false) }}
                      placeholder="Compliance name…"
                      className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={addCustom} disabled={!newLabel.trim() || compSaving}
                      className="px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg disabled:opacity-60">
                      {compSaving ? 'Adding…' : 'Add'}
                    </button>
                    <button onClick={() => setAddingNew(false)} className="px-3 py-1.5 text-gray-500 text-xs hover:bg-gray-100 rounded-lg">Cancel</button>
                  </div>
                )}

                {compLoading ? (
                  <div className="flex items-center justify-center flex-1 text-sm text-gray-400">Loading…</div>
                ) : (
                  <div className="flex-1">
                    <div className="grid grid-cols-[2fr_1.4fr_1.6fr_36px] gap-2 px-5 py-2 bg-gray-100 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      <span>Compliance Name</span><span>Due Date</span><span>Remarks</span><span />
                    </div>
                    <div className="divide-y divide-gray-100">
                      {compRows.map(({ key, label, doc, isCustom }) => {
                        const isEditing = editingKey === key
                        const status    = calcCompStatus(doc?.expiry_date)
                        const dotColor  = status ? STATUS_DOT[status] : null
                        return (
                          <div key={key} className={`${isEditing ? 'bg-blue-50 border-l-2 border-blue-400' : 'bg-white hover:bg-gray-50'} transition-colors`}>
                            {!isEditing && (
                              <div className="grid grid-cols-[2fr_1.4fr_1.6fr_36px] gap-2 px-5 py-3 items-center">
                                <span className="text-xs font-medium text-gray-800">{label}</span>
                                <span className="flex items-center gap-1.5 text-xs text-gray-700">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor || 'bg-gray-200'}`} />
                                  {doc?.expiry_date ? fmtCompDate(doc.expiry_date) : <span className="text-gray-300">—</span>}
                                </span>
                                <span className="text-xs text-gray-500 truncate">{doc?.notes || <span className="text-gray-300">—</span>}</span>
                                <div className="relative">
                                  <button onClick={() => setMenuOpen(menuOpen === key ? null : key)}
                                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                                    <MoreVertical size={13} />
                                  </button>
                                  {menuOpen === key && (
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                                      <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-40 text-xs">
                                        <button onClick={() => startEdit(key, doc)}
                                          className="flex items-center gap-2 w-full px-3 py-2 hover:bg-blue-50 text-gray-700">
                                          <Edit2 size={11} className="text-blue-500" />Edit
                                        </button>
                                        {doc?.id && !isCustom && (
                                          <button onClick={() => deleteDoc(doc.id)} disabled={deleting === doc.id}
                                            className="flex items-center gap-2 w-full px-3 py-2 hover:bg-amber-50 text-amber-700">
                                            <Trash2 size={11} />{deleting === doc.id ? 'Clearing…' : 'Clear Data'}
                                          </button>
                                        )}
                                        <div className="border-t border-gray-100 my-1" />
                                        <button onClick={() => removeFromList(key, label, doc)} disabled={compSaving}
                                          className="flex items-center gap-2 w-full px-3 py-2 hover:bg-red-50 text-red-600">
                                          <X size={11} />Remove from List
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                            {isEditing && (
                              <div className="px-5 py-3 space-y-2.5">
                                <p className="text-xs font-semibold text-blue-700">{label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] text-gray-500 font-medium mb-1">Due / Expiry Date</label>
                                    <input type="date" value={editForm.expiry_date}
                                      onChange={e => setEditForm(f => ({ ...f, expiry_date: e.target.value }))}
                                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-gray-500 font-medium mb-1">Issue Date</label>
                                    <input type="date" value={editForm.issued_date}
                                      onChange={e => setEditForm(f => ({ ...f, issued_date: e.target.value }))}
                                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] text-gray-500 font-medium mb-1">Doc / Certificate No</label>
                                    <input type="text" value={editForm.doc_no}
                                      onChange={e => setEditForm(f => ({ ...f, doc_no: e.target.value }))}
                                      placeholder="e.g. TS01234"
                                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-gray-500 font-medium mb-1">Remarks</label>
                                    <input type="text" value={editForm.notes}
                                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                                      placeholder="Optional notes"
                                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                </div>
                                <div className="flex gap-2 pt-0.5">
                                  <button onClick={() => saveCompDoc(key, label)} disabled={compSaving}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
                                    {compSaving ? 'Saving…' : 'Save'}
                                  </button>
                                  <button onClick={() => setEditingKey(null)}
                                    className="px-3 py-1.5 text-gray-500 text-xs hover:bg-gray-200 rounded-lg transition-colors">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DOCUMENTS TAB */}
            {rightTab === 'documents' && (
              <div className="flex-1 overflow-y-auto flex flex-col">

                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-blue-700 rounded-full" />
                    <h3 className="text-sm font-semibold text-gray-800">Asset Documents</h3>
                  </div>
                  <button onClick={() => setAddingDoc(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors">
                    <Plus size={12} />Add Document
                  </button>
                </div>

                {addingDoc && (
                  <div className="px-5 py-4 bg-blue-50 border-b border-blue-100 space-y-3">
                    <p className="text-xs font-semibold text-blue-700">New Document</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-500 font-medium mb-1">Document Name *</label>
                        <input autoFocus type="text" value={docForm.doc_name}
                          onChange={e => setDocForm(f => ({ ...f, doc_name: e.target.value }))}
                          placeholder="e.g. Insurance, RC, Fitness…"
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 font-medium mb-1">Document Number</label>
                        <input type="text" value={docForm.doc_number}
                          onChange={e => setDocForm(f => ({ ...f, doc_number: e.target.value }))}
                          placeholder="Optional ref. number"
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 font-medium mb-1">Attach File (PDF, image, etc.)</label>
                      <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-blue-300 bg-white rounded-lg cursor-pointer hover:bg-blue-50 text-xs text-gray-600 w-fit">
                        <Upload size={13} className="text-blue-600" />
                        {docFile ? docFile.name : 'Choose file…'}
                        <input ref={docFileRef} type="file" className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.doc,.docx"
                          onChange={handleDocFileChange} />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveDoc} disabled={!docForm.doc_name.trim() || docSaving}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
                        {docSaving ? 'Saving…' : 'Save Document'}
                      </button>
                      <button onClick={() => { setAddingDoc(false); setDocForm({ doc_name: '', doc_number: '' }); setDocFile(null) }}
                        className="px-3 py-1.5 text-gray-500 text-xs hover:bg-gray-200 rounded-lg transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {docsLoading ? (
                  <div className="flex items-center justify-center flex-1 text-sm text-gray-400">Loading…</div>
                ) : (
                  <div className="flex-1">
                    <div className="grid grid-cols-[36px_2fr_1.4fr_auto] gap-2 px-5 py-2 bg-gray-100 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      <span>S.No</span><span>Document Name</span><span>Document Number</span><span className="text-right pr-2">Actions</span>
                    </div>

                    {docs.length === 0 ? (
                      <div className="px-5 py-12 text-center text-sm text-gray-400">No documents uploaded yet.</div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {docs.map((doc, idx) => (
                          <div key={doc.id} className="grid grid-cols-[36px_2fr_1.4fr_auto] gap-2 px-5 py-3 items-center bg-white hover:bg-gray-50 transition-colors">
                            <span className="text-xs text-gray-400 font-medium">{idx + 1}</span>
                            <span className="text-xs font-medium text-gray-800 truncate">{doc.doc_name}</span>
                            <span className="text-xs text-gray-500 truncate">{doc.doc_number || <span className="text-gray-300">—</span>}</span>
                            <div className="flex items-center gap-1 justify-end">
                              {doc.has_file && (
                                <>
                                  <button onClick={() => openDocUrl(doc, false)} title="View"
                                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors">
                                    <Eye size={13} />
                                  </button>
                                  <button onClick={() => openDocUrl(doc, true)} title="Download"
                                    className="p-1.5 text-blue-700 hover:bg-blue-50 rounded transition-colors">
                                    <Download size={13} />
                                  </button>
                                </>
                              )}
                              <button onClick={() => handleDocDelete(doc.id)} disabled={docDeleting === doc.id}
                                title="Delete"
                                className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded transition-colors disabled:opacity-50">
                                {docDeleting === doc.id ? <RotateCcw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* COUNTER RESET TAB */}
            {rightTab === 'counter-reset' && (
              <div className="flex-1 overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-orange-600 rounded-full" />
                    <h3 className="text-sm font-semibold text-gray-800">Counter Log Reset Requests</h3>
                  </div>
                  <button onClick={loadResetReqs} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400" title="Refresh">
                    <RotateCcw size={13} className={resetReqsLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                {resetReqsLoading ? (
                  <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                    <Loader2 size={18} className="animate-spin" /><span className="text-sm">Loading…</span>
                  </div>
                ) : resetReqs.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-gray-400">No reset requests for this machine</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {resetReqs.map(req => (
                      <div key={req.id} className={`px-5 py-4 ${req.status === 'pending' ? 'bg-orange-50/50' : ''}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                req.status === 'pending'  ? 'bg-amber-100 text-amber-700' :
                                req.status === 'approved' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-600'
                              }`}>
                                {req.status === 'approved' && <CheckCircle size={10} />}
                                {req.status === 'rejected' && <XCircle size={10} />}
                                {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                              </span>
                              <span className="text-xs text-gray-500">{req.reading_code || 'Hours'}</span>
                            </div>
                            <div className="text-xs text-gray-700 space-y-0.5">
                              {req.actual_reading_before_reset != null && (
                                <div>Actual Prev: <span className="font-mono font-medium">{req.actual_reading_before_reset}</span>
                                  {req.old_reading != null && req.actual_reading_before_reset != null && (
                                    <span className="text-[10px] text-amber-600 ml-1.5">(adj {parseFloat(req.old_reading) - parseFloat(req.actual_reading_before_reset) >= 0 ? '+' : ''}{(parseFloat(req.old_reading) - parseFloat(req.actual_reading_before_reset)).toFixed(2)})</span>
                                  )}
                                </div>
                              )}
                              <div>Reset Reading: <span className="font-mono font-medium">{req.old_reading ?? '—'}</span>
                                <span className="mx-2 text-gray-300">→</span>
                                New: <span className="font-mono font-medium text-orange-700">{req.new_reading ?? '—'}</span>
                              </div>
                              {req.old_reading != null && req.new_reading != null && (
                                <div className="text-[11px] text-blue-700">Effective: <span className="font-mono font-semibold">{(parseFloat(req.old_reading) + parseFloat(req.new_reading)).toFixed(2)}</span> {req.reading_code || 'Hr'}</div>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              Reset Date: {new Date(req.reset_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                              {req.reset_shift && <span className="ml-2 text-orange-500 font-medium">({req.reset_shift})</span>}
                            </div>
                            {req.remark && <div className="text-xs text-gray-500 italic">"{req.remark}"</div>}
                            <div className="text-[11px] text-gray-400">
                              Requested by <span className="font-medium text-gray-600">{req.requested_by_name || 'Unknown'}</span>
                              {' · '}{new Date(req.requested_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                            </div>
                            {req.status !== 'pending' && req.reviewed_by_name && (
                              <div className="text-[11px] text-gray-400">
                                {req.status === 'approved' ? 'Approved' : 'Rejected'} by <span className="font-medium text-gray-600">{req.reviewed_by_name}</span>
                                {req.review_note && <span className="italic"> — "{req.review_note}"</span>}
                              </div>
                            )}
                          </div>

                          {req.status === 'pending' && (
                            <div className="flex flex-col gap-1.5 flex-shrink-0">
                              {reviewNoteOpen?.id === req.id ? (
                                <div className="space-y-1.5">
                                  <textarea rows={2} value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                                    placeholder="Note (optional)"
                                    className="w-40 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none" />
                                  <div className="flex gap-1.5">
                                    <button
                                      disabled={reviewingId === req.id}
                                      onClick={() => handleReview(req.id, reviewNoteOpen.action)}
                                      className={`flex-1 text-[11px] font-semibold py-1 rounded-lg transition-colors disabled:opacity-50 ${
                                        reviewNoteOpen.action === 'approve'
                                          ? 'bg-green-600 hover:bg-green-700 text-white'
                                          : 'bg-red-600 hover:bg-red-700 text-white'
                                      }`}>
                                      {reviewingId === req.id ? '…' : reviewNoteOpen.action === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
                                    </button>
                                    <button onClick={() => { setReviewNoteOpen(null); setReviewNote(''); setReviewErr(null) }}
                                      className="px-2 py-1 text-[11px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">✕</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => { setReviewNoteOpen({ id: req.id, action: 'approve' }); setReviewNote(''); setReviewErr(null) }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                                    <CheckCircle size={11} /> Approve
                                  </button>
                                  <button
                                    onClick={() => { setReviewNoteOpen({ id: req.id, action: 'reject' }); setReviewNote(''); setReviewErr(null) }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition-colors">
                                    <XCircle size={11} /> Reject
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Inline error for this request */}
                        {reviewErr?.id === req.id && (
                          <div className="mt-2 px-3 py-2 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2">
                            <XCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[11px] font-semibold text-red-700">Cannot process request</p>
                              <p className="text-[11px] text-red-600 mt-0.5">{reviewErr.msg}</p>
                            </div>
                            <button onClick={() => setReviewErr(null)} className="ml-auto text-red-400 hover:text-red-600 flex-shrink-0">
                              <XCircle size={11} />
                            </button>
                          </div>
                        )}

                        {/* Success flash for this request */}
                        {reviewSuccess?.id === req.id && (
                          <div className="mt-2 px-3 py-2 bg-green-50 border border-green-300 rounded-lg flex items-center gap-2">
                            <CheckCircle size={13} className="text-green-600 flex-shrink-0" />
                            <p className="text-[11px] font-semibold text-green-700">
                              {reviewSuccess.action === 'approve' ? 'Approved successfully' : 'Rejected successfully'} — bell will update
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SCS TAB */}
            {rightTab === 'scs' && (
              <MachineScsPanel machineId={m.id} />
            )}

            {/* LOG ENTRY TAB — navigates to Entry page */}
            {false && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white flex-shrink-0 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button onClick={() => shiftMonth(-1)} disabled={logLoading}
                      className="flex items-center gap-0.5 px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      <ChevronLeft size={11} />Prev
                    </button>
                    <input type="date" value={logFrom} onChange={e => setLogFrom(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <span className="text-xs text-gray-400">—</span>
                    <input type="date" value={logTo} onChange={e => setLogTo(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <button onClick={() => shiftMonth(1)} disabled={logLoading}
                      className="flex items-center gap-0.5 px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      Next<ChevronRight size={11} />
                    </button>
                    <button onClick={applyLogFilter} disabled={logLoading}
                      className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium rounded-lg disabled:opacity-60 transition-colors">
                      {logLoading ? 'Loading…' : 'Apply'}
                    </button>
                    <button onClick={() => openDprFor()}
                      className="flex items-center gap-1 px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors">
                      <Plus size={11} />Add DPR Entry
                    </button>
                  </div>
                </div>

                {/* Logsheet table */}
                {logLoading ? (
                  <div className="flex items-center justify-center flex-1 text-sm text-gray-400">Loading…</div>
                ) : !logFetched ? (
                  <div className="flex items-center justify-center flex-1 text-sm text-gray-400">Click Apply to load the logsheet</div>
                ) : (
                  <div className="flex-1 overflow-y-auto overflow-x-auto">
                    <table className="w-full text-xs min-w-[820px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">Date</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">Shift</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">Counterlog</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap">Fuel FeedIn (L)</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap">Downtime (Hrs)</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap">Productivity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {logRows.map(({ date, shift, entry }) => {
                          const isNight = shift === 'Night Shift'
                          return (
                            <tr key={`${date}_${shift}`}
                              className={`hover:bg-gray-50 transition-colors border-b border-gray-100 ${isNight ? 'bg-indigo-50/30' : ''}`}>
                              <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{fmtEntryDate(date)}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  isNight ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                                }`}>{isNight ? 'Night' : 'Day'}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {entry ? (
                                  <span className="tabular-nums text-gray-700">
                                    {entry.r1_open != null ? Number(entry.r1_open).toFixed(1) : '—'}
                                    {' → '}
                                    {entry.r1_close != null ? Number(entry.r1_close).toFixed(1) : '—'}
                                  </span>
                                ) : (
                                  <button onClick={() => openDprFor(date, shift)}
                                    className="text-blue-500 hover:text-blue-700 hover:underline font-medium">
                                    No Record
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                                {entry?.hsd != null ? Number(entry.hsd).toFixed(1) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {entry?.breakdown != null && entry.breakdown > 0
                                  ? <span className="text-red-500 font-semibold">{Number(entry.breakdown).toFixed(1)}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                                {entry?.qty != null ? Number(entry.qty).toFixed(2) : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 bg-white border-t border-gray-200 flex gap-2">
          {onEdit && (
            <button onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors">
              <Edit2 size={13} />Edit Machine
            </button>
          )}
          <button onClick={onClose}
            className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
            Close
          </button>
        </div>
      </div>

      {/* Click-away overlay for section menus */}
      {sectionMenu && <div className="fixed inset-0 z-10" onClick={() => setSectionMenu(null)}/>}

      {/* Change Status Modal */}
      {statusModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 bg-blue-700 rounded-t-2xl">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <AlertCircle size={15}/> Change Asset Status
              </h3>
              <button onClick={() => setStatusModal(false)} className="text-blue-200 hover:text-white"><X size={18}/></button>
            </div>
            <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-100">
              <p className="text-xs text-blue-700 font-medium truncate">
                {m.nickname || m.slno} — current: <StatusBadge status={assetStatus}/>
              </p>
            </div>
            <div className="p-5 space-y-4">
              {/* Status selector */}
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-2">New Status *</label>
                <div className="grid grid-cols-3 gap-2">
                  {ASSET_STATUSES.map(s => (
                    <button key={s.key}
                      onClick={() => setStatusForm(f => ({ ...f, status: s.key }))}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                        statusForm.status === s.key
                          ? `${s.bg} ${s.text} border-current shadow-sm`
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Remarks */}
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">Remarks / Reason *</label>
                <textarea rows={3} value={statusForm.remarks}
                  onChange={e => setStatusForm(f => ({ ...f, remarks: e.target.value }))}
                  placeholder="Explain the reason for this status change…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
                {statusErr && <p className="text-xs text-red-600 mt-1">{statusErr}</p>}
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
              <button
                onClick={handleStatusSave}
                disabled={statusSaving || !statusForm.status || !statusForm.remarks.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold rounded-lg text-sm">
                {statusSaving ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>}
                {statusSaving ? 'Saving…' : 'Save Status'}
              </button>
              <button onClick={() => setStatusModal(false)}
                className="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}
