import { useState, useEffect, useCallback } from 'react'
import {
  getCheckSheets, getCheckSheet, createCheckSheet, updateCheckSheet,
  getServiceSchedules, createServiceSchedule,
  getServiceExecutions, createServiceExecution,
  getMachines, getProjects,
} from '../../lib/api'
import { Plus, X, Eye, RefreshCw, Edit2, ClipboardCheck, Calendar, Clock, CircleCheck, TriangleAlert } from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom (days)' },
]

const TABS = ['Running Status', 'Execution History', 'Check Sheet Master', 'Service Schedule']

const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const lbl = 'block text-xs font-medium text-gray-600 mb-1'

// ── Check Sheet Master ────────────────────────────────────────────────────────

function CheckSheetModal({ sheet, onClose, onSaved }) {
  const emptyItem = () => ({ seq: '', task: '', category: '', inspection_method: '', acceptance_criteria: '', is_mandatory: true })
  const [form, setForm] = useState(sheet ? {
    name: sheet.name, asset_type: sheet.asset_type || '', frequency: sheet.frequency,
    frequency_value: sheet.frequency_value || 1,
    estimated_duration_hours: sheet.estimated_duration_hours || '',
    active: sheet.active,
    check_items: sheet.check_items || [],
    parts_required: sheet.parts_required || [],
  } : {
    name: '', asset_type: '', frequency: 'daily', frequency_value: 1,
    estimated_duration_hours: '', active: true, check_items: [], parts_required: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addItem    = () => setForm(f => ({ ...f, check_items: [...f.check_items, emptyItem()] }))
  const removeItem = (i) => setForm(f => ({ ...f, check_items: f.check_items.filter((_, idx) => idx !== i) }))
  const updateItem = (i, k, v) => setForm(f => {
    const arr = [...f.check_items]; arr[i] = { ...arr[i], [k]: v }; return { ...f, check_items: arr }
  })

  const save = async () => {
    if (!form.name) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const items = form.check_items.map((it, idx) => ({ ...it, seq: idx + 1 }))
      if (sheet) await updateCheckSheet(sheet.id, { ...form, check_items: items })
      else await createCheckSheet({ ...form, check_items: items })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-6">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="font-semibold text-gray-900">{sheet ? 'Edit Check Sheet' : 'New Check Sheet'}</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={lbl}>Check Sheet Name *</label>
              <input className={inp} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g., Daily PM Excavator" />
            </div>
            <div>
              <label className={lbl}>Asset Type</label>
              <input className={inp} value={form.asset_type} onChange={e => setForm(f => ({...f, asset_type: e.target.value}))} placeholder="e.g., Excavator" />
            </div>
            <div>
              <label className={lbl}>Frequency</label>
              <select className={inp} value={form.frequency} onChange={e => setForm(f => ({...f, frequency: e.target.value}))}>
                {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            {form.frequency === 'custom' && (
              <div>
                <label className={lbl}>Every N Days</label>
                <input type="number" className={inp} value={form.frequency_value} onChange={e => setForm(f => ({...f, frequency_value: e.target.value}))} min="1" />
              </div>
            )}
            <div>
              <label className={lbl}>Est. Duration (hours)</label>
              <input type="number" className={inp} value={form.estimated_duration_hours} onChange={e => setForm(f => ({...f, estimated_duration_hours: e.target.value}))} step="0.5" min="0" />
            </div>
            {sheet && (
              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" id="active_cs" checked={form.active} onChange={e => setForm(f => ({...f, active: e.target.checked}))} className="rounded" />
                <label htmlFor="active_cs" className="text-sm text-gray-700">Active</label>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Check Items</p>
              <button onClick={addItem} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"><Plus size={14} /> Add Item</button>
            </div>
            {form.check_items.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No items yet. Add check items above.</p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-gray-600 w-8">#</th>
                      <th className="px-2 py-2 text-left text-gray-600">Task / Check Point</th>
                      <th className="px-2 py-2 text-left text-gray-600 w-28">Category</th>
                      <th className="px-2 py-2 text-left text-gray-600 w-24">Method</th>
                      <th className="px-2 py-2 text-left text-gray-600 w-28">Acceptance</th>
                      <th className="px-2 py-2 text-center text-gray-600 w-16">Mandatory</th>
                      <th className="px-2 py-2 w-6" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.check_items.map((item, i) => (
                      <tr key={i} className="bg-white">
                        <td className="px-2 py-1.5 text-gray-500">{i + 1}</td>
                        <td className="px-2 py-1.5"><input className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs" value={item.task} onChange={e => updateItem(i, 'task', e.target.value)} placeholder="Task description" /></td>
                        <td className="px-2 py-1.5"><input className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs" value={item.category} onChange={e => updateItem(i, 'category', e.target.value)} placeholder="Category" /></td>
                        <td className="px-2 py-1.5"><input className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs" value={item.inspection_method} onChange={e => updateItem(i, 'inspection_method', e.target.value)} placeholder="Visual / Measure" /></td>
                        <td className="px-2 py-1.5"><input className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs" value={item.acceptance_criteria} onChange={e => updateItem(i, 'acceptance_criteria', e.target.value)} placeholder="Pass criteria" /></td>
                        <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={item.is_mandatory} onChange={e => updateItem(i, 'is_mandatory', e.target.checked)} /></td>
                        <td className="px-2 py-1.5"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><X size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
              {saving ? 'Saving…' : (sheet ? 'Update' : 'Create Check Sheet')}
            </button>
            <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Schedule Modal ────────────────────────────────────────────────────────────

function ScheduleModal({ sheets, machines, onClose, onSaved }) {
  const [form, setForm] = useState({ check_sheet_id: '', machine_id: '', project_id: '', start_date: today(), next_due_date: today() })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [projects, setProjects] = useState([])

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data || [])).catch(() => {})
  }, [])

  const save = async () => {
    if (!form.check_sheet_id || !form.machine_id) { setError('Check sheet and machine are required'); return }
    setSaving(true); setError('')
    try { await createServiceSchedule(form); onSaved() }
    catch (err) { setError(err.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">New Service Schedule</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={lbl}>Check Sheet *</label>
            <select className={inp} value={form.check_sheet_id} onChange={e => setForm(f => ({...f, check_sheet_id: e.target.value}))}>
              <option value="">— Select —</option>
              {sheets.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.sheet_code} — {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Machine / Asset *</label>
            <select className={inp} value={form.machine_id} onChange={e => setForm(f => ({...f, machine_id: e.target.value}))}>
              <option value="">— Select —</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.nickname || m.slno} — {m.eq_type}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Project</label>
            <select className={inp} value={form.project_id} onChange={e => setForm(f => ({...f, project_id: e.target.value}))}>
              <option value="">— None —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Start Date</label>
              <input type="date" className={inp} value={form.start_date} onChange={e => setForm(f => ({...f, start_date: e.target.value}))} />
            </div>
            <div>
              <label className={lbl}>First Due Date</label>
              <input type="date" className={inp} value={form.next_due_date} onChange={e => setForm(f => ({...f, next_due_date: e.target.value}))} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-3">
            <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
              {saving ? 'Saving…' : 'Create Schedule'}
            </button>
            <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Execute Modal ─────────────────────────────────────────────────────────────

function ExecuteModal({ schedule, onClose, onSaved }) {
  const items = schedule.check_items || []
  const [form, setForm] = useState({
    execution_date: today(), start_time: '', end_time: '',
    meter_reading: '', technician_name: '', overall_status: 'completed', remarks: '',
    items_result: items.map(it => ({ seq: it.seq, task: it.task, status: 'ok', remarks: '', value: '' })),
    parts_used: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const setItemResult = (i, k, v) => setForm(f => {
    const arr = [...f.items_result]; arr[i] = { ...arr[i], [k]: v }; return { ...f, items_result: arr }
  })

  const save = async () => {
    setSaving(true); setError('')
    try {
      await createServiceExecution({ ...form, schedule_id: schedule.id })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const STATUS_BADGE = { ok: 'bg-green-100 text-green-800', fail: 'bg-red-100 text-red-800', na: 'bg-gray-100 text-gray-600' }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-6">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="font-semibold text-gray-900">Execute: {schedule.check_sheet_name}</h2>
            <p className="text-xs text-gray-500">{schedule.machine_name || schedule.machine_slno}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Execution Date *</label>
              <input type="date" className={inp} value={form.execution_date} onChange={e => setForm(f => ({...f, execution_date: e.target.value}))} />
            </div>
            <div>
              <label className={lbl}>Start Time</label>
              <input type="time" className={inp} value={form.start_time} onChange={e => setForm(f => ({...f, start_time: e.target.value}))} />
            </div>
            <div>
              <label className={lbl}>End Time</label>
              <input type="time" className={inp} value={form.end_time} onChange={e => setForm(f => ({...f, end_time: e.target.value}))} />
            </div>
            <div>
              <label className={lbl}>Meter Reading</label>
              <input type="number" className={inp} value={form.meter_reading} onChange={e => setForm(f => ({...f, meter_reading: e.target.value}))} />
            </div>
            <div>
              <label className={lbl}>Technician</label>
              <input className={inp} value={form.technician_name} onChange={e => setForm(f => ({...f, technician_name: e.target.value}))} />
            </div>
            <div>
              <label className={lbl}>Overall Status</label>
              <select className={inp} value={form.overall_status} onChange={e => setForm(f => ({...f, overall_status: e.target.value}))}>
                <option value="completed">Completed</option>
                <option value="in_progress">In Progress</option>
                <option value="failed">Failed / Issues Found</option>
              </select>
            </div>
          </div>

          {items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Check Items</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-600">#</th>
                      <th className="px-3 py-2 text-left text-gray-600">Task</th>
                      <th className="px-3 py-2 text-left text-gray-600 w-28">Status</th>
                      <th className="px-3 py-2 text-left text-gray-600 w-20">Value</th>
                      <th className="px-3 py-2 text-left text-gray-600">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.items_result.map((it, i) => (
                      <tr key={i} className={`${it.status === 'fail' ? 'bg-red-50' : 'bg-white'}`}>
                        <td className="px-3 py-2 text-gray-500">{it.seq}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{it.task}</td>
                        <td className="px-3 py-2">
                          <select
                            className={`border rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[it.status]}`}
                            value={it.status}
                            onChange={e => setItemResult(i, 'status', e.target.value)}
                          >
                            <option value="ok">OK / Pass</option>
                            <option value="fail">Fail / Issue</option>
                            <option value="na">N/A</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs" value={it.value} onChange={e => setItemResult(i, 'value', e.target.value)} placeholder="Reading" />
                        </td>
                        <td className="px-3 py-2">
                          <input className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs" value={it.remarks} onChange={e => setItemResult(i, 'remarks', e.target.value)} placeholder={it.status === 'fail' ? 'Describe issue…' : ''} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <label className={lbl}>Remarks</label>
            <textarea className={inp + ' resize-none'} rows={2} value={form.remarks} onChange={e => setForm(f => ({...f, remarks: e.target.value}))} />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-3">
            <button onClick={save} disabled={saving} className="flex-1 bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
              {saving ? 'Saving…' : 'Submit Execution'}
            </button>
            <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ServiceCheckSheets() {
  const [activeTab, setActiveTab] = useState(0)
  const [sheets, setSheets]       = useState([])
  const [schedules, setSchedules] = useState([])
  const [executions, setExecutions] = useState([])
  const [machines, setMachines]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [sheetModal, setSheetModal]   = useState(false)
  const [editSheet, setEditSheet]     = useState(null)
  const [scheduleModal, setScheduleModal] = useState(false)
  const [executeSchedule, setExecuteSchedule] = useState(null)
  const [viewExecution, setViewExecution] = useState(null)
  const [exFilter, setExFilter]   = useState({ from: '', to: '' })

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sh, sc, ex, mc] = await Promise.all([
        getCheckSheets(), getServiceSchedules(), getServiceExecutions(), getMachines(),
      ])
      setSheets(sh.data.data || [])
      setSchedules(sc.data.data || [])
      setExecutions(ex.data.data || [])
      setMachines((mc.data.data || mc.data || []))
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const statusColor = (s) => {
    if (!s) return 'bg-gray-100 text-gray-600'
    const map = { active: 'bg-green-100 text-green-700', paused: 'bg-amber-100 text-amber-700', completed: 'bg-blue-100 text-blue-700' }
    return map[s] || 'bg-gray-100 text-gray-600'
  }

  const overdueCount = schedules.filter(s => s.status === 'active' && s.days_overdue > 0).length
  const dueToday = schedules.filter(s => s.status === 'active' && s.days_overdue === 0).length

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><ClipboardCheck size={20} />Service Check Sheets</h1>
          <div className="flex items-center gap-3 mt-1">
            {overdueCount > 0 && <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1"><TriangleAlert size={11} />{overdueCount} Overdue</span>}
            {dueToday > 0 && <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={11} />{dueToday} Due Today</span>}
          </div>
        </div>
        <button onClick={loadAll} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-4 gap-1">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${activeTab === i ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab 0: Running Status ── */}
      {activeTab === 0 && (
        <div className="space-y-3">
          {loading ? (
            <div className="py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</div>
          ) : schedules.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <Calendar size={32} className="mx-auto mb-2 text-gray-300" />
              <p>No schedules yet. Create a schedule in the <strong>Service Schedule</strong> tab.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {schedules.map(sc => {
                const overdue = sc.days_overdue > 0
                const dueToday = sc.days_overdue === 0
                return (
                  <div key={sc.id} className={`bg-white rounded-xl border p-4 flex items-start gap-4 ${overdue ? 'border-red-200 bg-red-50/30' : dueToday ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900 text-sm">{sc.machine_name || sc.machine_slno}</span>
                        <span className="text-xs text-gray-400">{sc.eq_type}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(sc.status)}`}>{sc.status}</span>
                      </div>
                      <p className="text-sm text-blue-700 font-medium">{sc.check_sheet_name}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                        <span>Frequency: <strong>{sc.frequency}</strong></span>
                        {sc.next_due_date && <span className={overdue ? 'text-red-600 font-semibold' : dueToday ? 'text-amber-600 font-semibold' : ''}>
                          Next Due: <strong>{fmtDate(sc.next_due_date)}</strong>
                          {overdue && <span className="ml-1 text-red-500">({sc.days_overdue}d overdue)</span>}
                          {dueToday && <span className="ml-1 text-amber-500">(Today)</span>}
                        </span>}
                        {sc.last_done_date && <span>Last Done: <strong>{fmtDate(sc.last_done_date)}</strong></span>}
                        {sc.project_code && <span>Project: {sc.project_code}</span>}
                      </div>
                    </div>
                    {sc.status === 'active' && (
                      <button
                        onClick={() => setExecuteSchedule(sc)}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 whitespace-nowrap"
                      >
                        <CircleCheck size={15} /> Execute
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 1: Execution History ── */}
      {activeTab === 1 && (
        <div>
          <div className="flex gap-2 mb-3">
            <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={exFilter.from} onChange={e => setExFilter(f => ({...f, from: e.target.value}))} />
            <span className="flex items-center text-gray-400 text-sm">to</span>
            <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={exFilter.to} onChange={e => setExFilter(f => ({...f, to: e.target.value}))} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Execution No.</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Check Sheet</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Asset</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Technician</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={7} className="py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</td></tr>
                ) : executions.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-gray-400">No execution records</td></tr>
                ) : executions.map(ex => {
                  const sc = { ok: 'bg-green-100 text-green-800', completed: 'bg-green-100 text-green-800', failed: 'bg-red-100 text-red-800', in_progress: 'bg-blue-100 text-blue-800', pending: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={ex.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{ex.execution_number}</td>
                      <td className="px-4 py-3">{fmtDate(ex.execution_date)}</td>
                      <td className="px-4 py-3 text-gray-700">{ex.check_sheet_name}</td>
                      <td className="px-4 py-3 text-gray-600">{ex.machine_name || ex.machine_slno}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{ex.technician_name || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sc[ex.overall_status] || 'bg-gray-100 text-gray-600'}`}>{ex.overall_status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setViewExecution(ex)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={13} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab 2: Check Sheet Master ── */}
      {activeTab === 2 && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => { setEditSheet(null); setSheetModal(true) }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Plus size={15} /> New Check Sheet
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Code</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Asset Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Frequency</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Items</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Schedules</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={8} className="py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</td></tr>
                ) : sheets.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-gray-400">No check sheets</td></tr>
                ) : sheets.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{s.sheet_code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.asset_type || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{s.frequency}{s.frequency === 'custom' ? ` (${s.frequency_value}d)` : ''}</td>
                    <td className="px-4 py-3 text-right">{(s.check_items || []).length}</td>
                    <td className="px-4 py-3 text-right">{s.schedule_count || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setEditSheet(s); setSheetModal(true) }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab 3: Service Schedule ── */}
      {activeTab === 3 && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setScheduleModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Plus size={15} /> New Schedule
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Asset</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Check Sheet</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Frequency</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Next Due</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Last Done</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Project</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={7} className="py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</td></tr>
                ) : schedules.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-gray-400">No schedules yet</td></tr>
                ) : schedules.map(sc => (
                  <tr key={sc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{sc.machine_name || sc.machine_slno}</div>
                      <div className="text-xs text-gray-400">{sc.eq_type}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{sc.check_sheet_name}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{sc.frequency}</td>
                    <td className={`px-4 py-3 text-sm ${sc.days_overdue > 0 ? 'text-red-600 font-semibold' : ''}`}>{fmtDate(sc.next_due_date)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(sc.last_done_date)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{sc.project_code || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(sc.status)}`}>{sc.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {sheetModal && (
        <CheckSheetModal
          sheet={editSheet}
          onClose={() => { setSheetModal(false); setEditSheet(null) }}
          onSaved={() => { setSheetModal(false); setEditSheet(null); loadAll() }}
        />
      )}
      {scheduleModal && (
        <ScheduleModal
          sheets={sheets} machines={machines}
          onClose={() => setScheduleModal(false)}
          onSaved={() => { setScheduleModal(false); loadAll() }}
        />
      )}
      {executeSchedule && (
        <ExecuteModal
          schedule={executeSchedule}
          onClose={() => setExecuteSchedule(null)}
          onSaved={() => { setExecuteSchedule(null); loadAll() }}
        />
      )}

      {/* View Execution */}
      {viewExecution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-semibold text-gray-900">{viewExecution.execution_number}</h2>
              <button onClick={() => setViewExecution(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 text-sm space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[['Date', fmtDate(viewExecution.execution_date)], ['Asset', viewExecution.machine_name || viewExecution.machine_slno], ['Check Sheet', viewExecution.check_sheet_name], ['Technician', viewExecution.technician_name || '—'], ['Status', viewExecution.overall_status], ['Remarks', viewExecution.remarks || '—']].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg px-3 py-2"><p className="text-xs text-gray-400">{k}</p><p className="font-medium truncate">{v}</p></div>
                ))}
              </div>
              {viewExecution.items_result?.length > 0 && (
                <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Task</th>
                    <th className="px-2 py-2 text-center">Status</th>
                    <th className="px-2 py-2 text-left">Value</th>
                    <th className="px-2 py-2 text-left">Remarks</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {viewExecution.items_result.map((it, i) => {
                      const bc = { ok: 'bg-green-100 text-green-700', fail: 'bg-red-100 text-red-700', na: 'bg-gray-100 text-gray-500' }
                      return (
                        <tr key={i} className={it.status === 'fail' ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-2 py-2">{it.seq}</td>
                          <td className="px-2 py-2">{it.task}</td>
                          <td className="px-2 py-2 text-center"><span className={`px-1.5 py-0.5 rounded text-xs font-medium ${bc[it.status] || 'bg-gray-100'}`}>{it.status}</span></td>
                          <td className="px-2 py-2">{it.value || '—'}</td>
                          <td className="px-2 py-2 text-gray-500">{it.remarks || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
