import { useState, useEffect } from 'react'
import { getProjects, getOperators, getAttendance, createAttendance, deleteAttendance } from '../../lib/api'
import { today, exportCSV } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { Plus, Trash2, Download, X } from 'lucide-react'

const ATT_STATUSES = ['Present', 'Absent', 'Half Day', 'On Leave', 'Holiday']
const SHIFTS       = ['Day', 'Night', 'Full Day']

const emptyForm = () => ({
  project_id: '', operator_id: '', entry_date: today(),
  status: 'Present', shift: 'Day', ot_hours: '', remarks: ''
})

const ATT_BADGE = {
  Present:    'bg-green-100 text-green-800',
  Absent:     'bg-red-100 text-red-800',
  'Half Day': 'bg-yellow-100 text-yellow-800',
  'On Leave': 'bg-orange-100 text-orange-800',
  Holiday:    'bg-blue-100 text-blue-800',
}

export default function Attendance() {
  const { isAdmin } = useAuth()
  const [projects, setProjects]       = useState([])
  const [allOperators, setAllOperators] = useState([])
  const [filteredOps, setFilteredOps] = useState([])
  const [records, setRecords]         = useState([])
  const [loading, setLoading]         = useState(false)
  const [filters, setFilters]         = useState({ project_code: '', from: today(), to: today() })
  const [showModal, setShowModal]     = useState(false)
  const [form, setForm]               = useState(emptyForm())
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data))
    getOperators().then(r => setAllOperators(r.data.data))
  }, [])

  // filter operator dropdown in modal by chosen project
  useEffect(() => {
    if (form.project_id) {
      setFilteredOps(allOperators.filter(o => String(o.project_id) === String(form.project_id)))
    } else {
      setFilteredOps(allOperators)
    }
  }, [form.project_id, allOperators])

  const load = () => {
    setLoading(true)
    const p = {}
    if (filters.project_code) p.project_code = filters.project_code
    if (filters.from) p.from = filters.from
    if (filters.to)   p.to   = filters.to
    getAttendance(p).then(r => setRecords(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filters])

  const setF  = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))
  const setFm = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const presentCount = records.filter(r => r.status === 'Present').length
  const absentCount  = records.filter(r => r.status === 'Absent').length

  const openModal  = () => { setForm(emptyForm()); setError(''); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setError('') }

  const handleSave = async () => {
    if (!form.operator_id || !form.project_id || !form.entry_date) {
      setError('Operator, project, and date are required.')
      return
    }
    setSaving(true); setError('')
    try {
      await createAttendance(form)
      closeModal(); load()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this attendance record?')) return
    await deleteAttendance(id)
    load()
  }

  const handleExport = () => {
    exportCSV(
      ['Date', 'Project', 'Emp ID', 'Operator', 'Designation', 'Shift', 'Status', 'OT Hours', 'Remarks'],
      records.map(r => [
        r.entry_date, r.project_code, r.emp_id ?? '', r.operator_name,
        r.designation, r.shift, r.status, r.ot_hours ?? 0, r.remarks ?? ''
      ]),
      `Attendance_${filters.from}_${filters.to}.csv`
    )
  }

  const sel = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {records.length} records · {presentCount} present · {absentCount} absent
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors">
            <Download size={15} />Export
          </button>
          <button onClick={openModal} className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors">
            <Plus size={15} />Mark Attendance
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <select value={filters.project_code} onChange={setF('project_code')} className={sel}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
          </select>
          <input type="date" value={filters.from} onChange={setF('from')} className={sel} />
          <input type="date" value={filters.to}   onChange={setF('to')}   className={sel} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm">No attendance records found. Click "Mark Attendance" to add.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Date','Project','Emp ID','Operator','Designation','Shift','Status','OT Hrs','Remarks',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{r.entry_date}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">{r.project_code}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.emp_id ?? '—'}</td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{r.operator_name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.designation}</td>
                    <td className="px-4 py-3 text-gray-600">{r.shift}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ATT_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.ot_hours > 0 ? r.ot_hours : '—'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate">{r.remarks ?? '—'}</td>
                    <td className="px-4 py-3">
                      {isAdmin && (
                        <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:text-red-700 p-1 rounded">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={10} className="px-4 py-2 text-xs text-gray-400">{records.length} records</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mt-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">Mark Attendance</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
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
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Operator *</label>
                  <select value={form.operator_id} onChange={setFm('operator_id')} className={inp}>
                    <option value="">Select operator</option>
                    {filteredOps.map(o => (
                      <option key={o.id} value={o.id}>{o.name}{o.emp_id ? ` (${o.emp_id})` : ''} – {o.designation}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shift</label>
                  <select value={form.shift} onChange={setFm('shift')} className={inp}>
                    {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={setFm('status')} className={inp}>
                    {ATT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">OT Hours</label>
                  <input type="number" min="0" step="0.5" placeholder="0" value={form.ot_hours} onChange={setFm('ot_hours')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Remarks</label>
                  <input type="text" placeholder="Notes…" value={form.remarks} onChange={setFm('remarks')} className={inp} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button onClick={closeModal} className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
