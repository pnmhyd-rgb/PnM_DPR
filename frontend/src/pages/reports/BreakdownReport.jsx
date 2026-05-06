import { useState, useEffect } from 'react'
import {
  getProjects, getMachines,
  getBreakdownIncidents, createBreakdownIncident,
  updateBreakdownStatus, deleteBreakdownIncident,
  getBreakdownSummary
} from '../../lib/api'
import { today, formatNum, exportCSV, daysAgo } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { Plus, Trash2, Download, X, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

const CAUSES = [
  'Mechanical Failure', 'Electrical Fault', 'Hydraulic Failure',
  'Engine Problem', 'Tyre/Track Damage', 'Operator Error',
  'Routine Maintenance', 'Fuel/Lubrication Issue', 'Structural Damage', 'Other'
]

const STATUS_OPTS = ['Open', 'In Progress', 'Resolved']

const STATUS_BADGE = {
  'Open':        'bg-red-100 text-red-800',
  'In Progress': 'bg-yellow-100 text-yellow-800',
  'Resolved':    'bg-green-100 text-green-800',
}

const STATUS_ICON = {
  'Open':        AlertTriangle,
  'In Progress': Clock,
  'Resolved':    CheckCircle,
}

const emptyForm = () => ({
  project_id: '', machine_id: '', entry_date: today(),
  description: '', cause: '', action_taken: '',
  downtime_hours: '', repair_cost: ''
})

const emptyStatusForm = () => ({ status: '', action_taken: '', repair_cost: '', downtime_hours: '' })

export default function BreakdownReport() {
  const { isAdmin } = useAuth()
  const [projects, setProjects]     = useState([])
  const [machines, setMachines]     = useState([])
  const [incidents, setIncidents]   = useState([])
  const [summary, setSummary]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [tab, setTab]               = useState('incidents')

  const [filters, setFilters]       = useState({ project_code: '', status: '', from: daysAgo(30), to: today() })
  const [sumFilters, setSumFilters] = useState({ project_code: '', from: daysAgo(30), to: today() })

  const [showAdd, setShowAdd]       = useState(false)
  const [form, setForm]             = useState(emptyForm())
  const [saving, setSaving]         = useState(false)
  const [addError, setAddError]     = useState('')

  const [showStatus, setShowStatus] = useState(false)
  const [statusTarget, setStatusTarget] = useState(null)
  const [statusForm, setStatusForm] = useState(emptyStatusForm())
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError]   = useState('')

  useEffect(() => { getProjects().then(r => setProjects(r.data.data)) }, [])

  useEffect(() => {
    if (form.project_id) getMachines({ project_id: form.project_id }).then(r => setMachines(r.data.data))
    else setMachines([])
  }, [form.project_id])

  const loadIncidents = () => {
    setLoading(true)
    const p = {}
    if (filters.project_code) p.project_code = filters.project_code
    if (filters.status)       p.status        = filters.status
    if (filters.from) p.from = filters.from
    if (filters.to)   p.to   = filters.to
    getBreakdownIncidents(p).then(r => setIncidents(r.data.data)).finally(() => setLoading(false))
  }

  const loadSummary = () => {
    setLoading(true)
    const p = { from: sumFilters.from, to: sumFilters.to }
    if (sumFilters.project_code) p.project_code = sumFilters.project_code
    getBreakdownSummary(p).then(r => setSummary(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { if (tab === 'incidents') loadIncidents() }, [filters, tab])
  useEffect(() => { if (tab === 'summary')   loadSummary()   }, [sumFilters, tab])

  const setF  = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))
  const setSF = k => e => setSumFilters(f => ({ ...f, [k]: e.target.value }))
  const setFm = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setSFm = k => e => setStatusForm(f => ({ ...f, [k]: e.target.value }))

  // ── Stats for incidents tab ──
  const openCount       = incidents.filter(i => i.status === 'Open').length
  const inProgressCount = incidents.filter(i => i.status === 'In Progress').length
  const resolvedCount   = incidents.filter(i => i.status === 'Resolved').length
  const totalDowntime   = incidents.reduce((s, i) => s + (parseFloat(i.downtime_hours) || 0), 0)
  const totalRepairCost = incidents.reduce((s, i) => s + (parseFloat(i.repair_cost) || 0), 0)

  // ── Add incident ──
  const openAdd  = () => { setForm(emptyForm()); setAddError(''); setShowAdd(true) }
  const closeAdd = () => { setShowAdd(false); setAddError('') }

  const handleSave = async () => {
    if (!form.project_id || !form.entry_date || !form.description.trim()) {
      setAddError('Project, date, and description are required.')
      return
    }
    setSaving(true); setAddError('')
    try {
      await createBreakdownIncident(form)
      closeAdd(); loadIncidents()
    } catch (err) {
      setAddError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Update status ──
  const openStatusModal = (incident) => {
    setStatusTarget(incident)
    setStatusForm({ status: incident.status, action_taken: incident.action_taken ?? '', repair_cost: incident.repair_cost ?? '', downtime_hours: incident.downtime_hours ?? '' })
    setStatusError('')
    setShowStatus(true)
  }
  const closeStatus = () => { setShowStatus(false); setStatusTarget(null) }

  const handleStatusSave = async () => {
    if (!statusForm.status) { setStatusError('Select a status.'); return }
    setStatusSaving(true); setStatusError('')
    try {
      await updateBreakdownStatus(statusTarget.id, statusForm)
      closeStatus(); loadIncidents()
    } catch (err) {
      setStatusError(err.response?.data?.error || 'Update failed')
    } finally {
      setStatusSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this incident record?')) return
    await deleteBreakdownIncident(id)
    loadIncidents()
  }

  const handleExportIncidents = () => exportCSV(
    ['Date','Project','Machine SL#','Eq Type','Description','Cause','Action Taken','Downtime Hrs','Repair Cost (₹)','Status','Resolved At'],
    incidents.map(i => [
      i.entry_date, i.project_code, i.slno ?? '', i.eq_type ?? '',
      i.description, i.cause ?? '', i.action_taken ?? '',
      i.downtime_hours ?? '', i.repair_cost ?? '', i.status,
      i.resolved_at ? new Date(i.resolved_at).toLocaleDateString('en-IN') : ''
    ]),
    `Breakdown_Incidents_${filters.from}_${filters.to}.csv`
  )

  const handleExportSummary = () => exportCSV(
    ['Project','SL#','Eq Type','Ownership','Total Entries','Breakdown Days','Total Breakdown Hrs','Total Working Hrs','Breakdown %','First Breakdown','Last Breakdown'],
    summary.map(s => [
      s.project_code, s.slno, s.eq_type, s.ownership,
      s.total_entries, s.breakdown_days, s.total_breakdown_hrs,
      s.total_working_hrs, s.breakdown_pct,
      s.first_breakdown ?? '', s.last_breakdown ?? ''
    ]),
    `Breakdown_DPR_Summary_${sumFilters.from}_${sumFilters.to}.csv`
  )

  const sel = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Breakdown Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {tab === 'incidents'
              ? `${incidents.length} incidents · ${openCount} open · ${inProgressCount} in progress`
              : `${summary.length} machines with breakdown hours`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={tab === 'incidents' ? handleExportIncidents : handleExportSummary}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Download size={15} />Export
          </button>
          {tab === 'incidents' && (
            <button onClick={openAdd} className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors">
              <Plus size={15} />Report Breakdown
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {[
          { key: 'incidents', label: 'Incident Log' },
          { key: 'summary',   label: 'DPR Breakdown Summary' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{label}</button>
        ))}
      </div>

      {/* ── INCIDENTS TAB ── */}
      {tab === 'incidents' && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total',       val: incidents.length,          color: 'text-gray-900' },
              { label: 'Open',        val: openCount,                 color: 'text-red-600' },
              { label: 'In Progress', val: inProgressCount,           color: 'text-yellow-600' },
              { label: 'Resolved',    val: resolvedCount,             color: 'text-green-600' },
              { label: 'Downtime Hrs',val: totalDowntime.toFixed(1),  color: 'text-gray-700' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className={`text-2xl font-bold ${color}`}>{val}</div>
                <div className="text-xs text-gray-500 mt-1">{label}</div>
                {label === 'Resolved' && totalRepairCost > 0 && (
                  <div className="text-xs text-gray-400 mt-0.5">₹{formatNum(totalRepairCost, 0)} repair cost</div>
                )}
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <select value={filters.project_code} onChange={setF('project_code')} className={sel}>
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
              </select>
              <select value={filters.status} onChange={setF('status')} className={sel}>
                <option value="">All Statuses</option>
                {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="date" value={filters.from} onChange={setF('from')} className={sel} />
              <input type="date" value={filters.to}   onChange={setF('to')}   className={sel} />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : incidents.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <AlertTriangle size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No breakdown incidents found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Date','Project','Machine SL#','Eq Type','Description','Cause','Downtime Hrs','Repair Cost','Status','Action'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {incidents.map(inc => {
                      const Icon = STATUS_ICON[inc.status]
                      return (
                        <tr key={inc.id} className={`hover:bg-gray-50 ${inc.status === 'Open' ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-3 whitespace-nowrap font-medium">{inc.entry_date}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">{inc.project_code}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{inc.slno ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{inc.eq_type ?? '—'}</td>
                          <td className="px-4 py-3 max-w-[180px]">
                            <p className="truncate text-gray-800" title={inc.description}>{inc.description}</p>
                            {inc.action_taken && <p className="text-xs text-gray-400 truncate mt-0.5" title={inc.action_taken}>{inc.action_taken}</p>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{inc.cause ?? '—'}</td>
                          <td className="px-4 py-3 font-semibold text-red-700">{inc.downtime_hours ?? '—'}</td>
                          <td className="px-4 py-3 font-medium">{inc.repair_cost ? `₹${formatNum(inc.repair_cost, 0)}` : '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[inc.status]}`}>
                              {Icon && <Icon size={11} />}{inc.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex gap-1">
                              {inc.status !== 'Resolved' && (
                                <button onClick={() => openStatusModal(inc)} className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600">
                                  Update
                                </button>
                              )}
                              {isAdmin && (
                                <button onClick={() => handleDelete(inc.id)} className="text-red-500 hover:text-red-700 p-1 rounded">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── DPR BREAKDOWN SUMMARY TAB ── */}
      {tab === 'summary' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <select value={sumFilters.project_code} onChange={setSF('project_code')} className={sel}>
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
              </select>
              <input type="date" value={sumFilters.from} onChange={setSF('from')} className={sel} />
              <input type="date" value={sumFilters.to}   onChange={setSF('to')}   className={sel} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : summary.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <CheckCircle size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No breakdown hours found in DPR entries for this period.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Project','SL#','Eq Type','Own/Hire','Entries','Breakdown Days','Breakdown Hrs','Working Hrs','Breakdown %','First','Last'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {summary.map((s, i) => {
                      const pct = parseFloat(s.breakdown_pct)
                      const pctClass = pct >= 20 ? 'text-red-600 font-bold' : pct >= 10 ? 'text-yellow-600 font-semibold' : 'text-gray-700'
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">{s.project_code}</span>
                          </td>
                          <td className="px-4 py-3 font-medium">{s.slno}</td>
                          <td className="px-4 py-3 text-gray-600">{s.eq_type}</td>
                          <td className="px-4 py-3 text-gray-600">{s.ownership}</td>
                          <td className="px-4 py-3 text-gray-600">{s.total_entries}</td>
                          <td className="px-4 py-3 text-red-600 font-semibold">{s.breakdown_days}</td>
                          <td className="px-4 py-3 text-red-700 font-bold">{s.total_breakdown_hrs}</td>
                          <td className="px-4 py-3 text-gray-600">{s.total_working_hrs}</td>
                          <td className={`px-4 py-3 ${pctClass}`}>{s.breakdown_pct}%</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{s.first_breakdown ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{s.last_breakdown ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={11} className="px-4 py-2 text-xs text-gray-400">
                        {summary.length} machines · Breakdown % = breakdown hrs ÷ (working + breakdown hrs) · Red ≥ 20%, Yellow ≥ 10%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── ADD INCIDENT MODAL ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mt-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle size={17} className="text-red-500" />Report Breakdown Incident
              </h2>
              <button onClick={closeAdd} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              {addError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date *</label>
                  <input type="date" value={form.entry_date} onChange={setFm('entry_date')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Project *</label>
                  <select value={form.project_id} onChange={setFm('project_id')} className={inp}>
                    <option value="">Select project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Machine</label>
                  <select value={form.machine_id} onChange={setFm('machine_id')} className={inp}>
                    <option value="">Select machine</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.slno} – {m.eq_type}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cause</label>
                  <select value={form.cause} onChange={setFm('cause')} className={inp}>
                    <option value="">Select cause</option>
                    {CAUSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description *</label>
                  <textarea rows={2} placeholder="Describe the breakdown…" value={form.description} onChange={setFm('description')} className={`${inp} resize-none`} />
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Action Taken</label>
                  <textarea rows={2} placeholder="Repair / action taken…" value={form.action_taken} onChange={setFm('action_taken')} className={`${inp} resize-none`} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Downtime Hours</label>
                  <input type="number" min="0" step="0.5" placeholder="e.g. 4.5" value={form.downtime_hours} onChange={setFm('downtime_hours')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Repair Cost (₹)</label>
                  <input type="number" min="0" placeholder="e.g. 8500" value={form.repair_cost} onChange={setFm('repair_cost')} className={inp} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button onClick={closeAdd} className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
                {saving ? 'Saving…' : 'Report Incident'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── UPDATE STATUS MODAL ── */}
      {showStatus && statusTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mt-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">Update Incident Status</h2>
              <button onClick={closeStatus} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              {statusError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{statusError}</p>}
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-200">
                <span className="font-medium">{statusTarget.slno ?? 'No machine'}</span>
                {statusTarget.eq_type ? ` – ${statusTarget.eq_type}` : ''}<br />
                <span className="text-xs text-gray-400">{statusTarget.description}</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Status *</label>
                  <div className="flex gap-2">
                    {STATUS_OPTS.map(s => {
                      const Icon = STATUS_ICON[s]
                      return (
                        <button key={s} onClick={() => setStatusForm(f => ({ ...f, status: s }))}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                            statusForm.status === s
                              ? s === 'Resolved' ? 'bg-green-600 text-white border-green-600'
                                : s === 'In Progress' ? 'bg-yellow-500 text-white border-yellow-500'
                                : 'bg-red-600 text-white border-red-600'
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <Icon size={13} />{s}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Action Taken</label>
                  <textarea rows={2} placeholder="Describe repair / resolution…" value={statusForm.action_taken} onChange={setSFm('action_taken')} className={`${inp} resize-none`} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Downtime Hours</label>
                  <input type="number" min="0" step="0.5" value={statusForm.downtime_hours} onChange={setSFm('downtime_hours')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Repair Cost (₹)</label>
                  <input type="number" min="0" value={statusForm.repair_cost} onChange={setSFm('repair_cost')} className={inp} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button onClick={closeStatus} className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50">Cancel</button>
              <button onClick={handleStatusSave} disabled={statusSaving} className="px-4 py-2 text-sm rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60">
                {statusSaving ? 'Saving…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
