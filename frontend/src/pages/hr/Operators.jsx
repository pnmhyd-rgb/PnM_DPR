import { useState, useEffect } from 'react'
import { getProjects, getMachines, getOperators, createOperator, updateOperator, deleteOperator } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

const DESIGNATIONS = ['Operator', 'Driver', 'Helper', 'Mechanic', 'Supervisor', 'Site Engineer', 'Site Manager']
const STATUSES     = ['Active', 'Inactive', 'On Leave']

const emptyForm = () => ({
  project_id: '', name: '', emp_id: '', designation: 'Operator',
  mobile: '', licence_no: '', joining_date: '', daily_wage: '',
  status: 'Active', machine_id: ''
})

const STATUS_BADGE = {
  Active:     'bg-green-100 text-green-800',
  Inactive:   'bg-gray-100 text-gray-600',
  'On Leave': 'bg-yellow-100 text-yellow-800',
}

export default function Operators() {
  const { isAdmin } = useAuth()
  const [projects, setProjects]   = useState([])
  const [machines, setMachines]   = useState([])
  const [operators, setOperators] = useState([])
  const [loading, setLoading]     = useState(false)
  const [filters, setFilters]     = useState({ project_code: '', status: '' })
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => { getProjects().then(r => setProjects(r.data.data)) }, [])

  useEffect(() => {
    if (form.project_id) {
      getMachines({ project_id: form.project_id }).then(r => setMachines(r.data.data))
    } else {
      setMachines([])
    }
  }, [form.project_id])

  const load = () => {
    setLoading(true)
    const p = {}
    if (filters.project_code) p.project_code = filters.project_code
    if (filters.status)       p.status        = filters.status
    getOperators(p).then(r => setOperators(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filters])

  const setF  = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))
  const setFm = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const openAdd = () => { setForm(emptyForm()); setEditId(null); setError(''); setShowModal(true) }

  const openEdit = (op) => {
    setForm({
      project_id:   op.project_id   ?? '',
      name:         op.name,
      emp_id:       op.emp_id       ?? '',
      designation:  op.designation,
      mobile:       op.mobile       ?? '',
      licence_no:   op.licence_no   ?? '',
      joining_date: op.joining_date ? op.joining_date.split('T')[0] : '',
      daily_wage:   op.daily_wage   ?? '',
      status:       op.status,
      machine_id:   op.machine_id   ?? '',
    })
    setEditId(op.id)
    setError('')
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditId(null); setError('') }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError('')
    try {
      if (editId) {
        await updateOperator(editId, form)
      } else {
        await createOperator(form)
      }
      closeModal(); load()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this operator?')) return
    await deleteOperator(id)
    load()
  }

  const activeCount   = operators.filter(o => o.status === 'Active').length
  const onLeaveCount  = operators.filter(o => o.status === 'On Leave').length

  const sel = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Operators / Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {operators.length} total · {activeCount} active · {onLeaveCount} on leave
          </p>
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors">
            <Plus size={15} />Add Operator
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <select value={filters.project_code} onChange={setF('project_code')} className={sel}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
          </select>
          <select value={filters.status} onChange={setF('status')} className={sel}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : operators.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-4xl mb-3">👷</div>
            <p className="text-sm">No operators found.{isAdmin ? ' Click "Add Operator" to register one.' : ''}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Emp ID','Name','Designation','Project','Mobile','Licence No.','Joining Date','Daily Wage (₹)','Assigned Machine','Status',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {operators.map(op => (
                  <tr key={op.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs">{op.emp_id ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">{op.name}</td>
                    <td className="px-4 py-3 text-gray-600">{op.designation}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {op.project_code
                        ? <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">{op.project_code}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{op.mobile ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{op.licence_no ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {op.joining_date ? new Date(op.joining_date).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {op.daily_wage ? `₹${op.daily_wage}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {op.machine_slno ? `${op.machine_slno} – ${op.machine_eq_type}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[op.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {op.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(op)} className="text-gray-400 hover:text-blue-600 p-1 rounded">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(op.id)} className="text-gray-400 hover:text-red-600 p-1 rounded">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 bg-gray-50">
              {operators.length} records
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mt-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">{editId ? 'Edit Operator' : 'Add Operator'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name *</label>
                  <input type="text" placeholder="Full name" value={form.name} onChange={setFm('name')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee ID</label>
                  <input type="text" placeholder="e.g. EMP001" value={form.emp_id} onChange={setFm('emp_id')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Designation</label>
                  <select value={form.designation} onChange={setFm('designation')} className={inp}>
                    {DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={setFm('status')} className={inp}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned Project</label>
                  <select value={form.project_id} onChange={setFm('project_id')} className={inp}>
                    <option value="">Not Assigned</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned Machine</label>
                  <select value={form.machine_id} onChange={setFm('machine_id')} className={inp}>
                    <option value="">Not Assigned</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.slno} – {m.eq_type}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mobile No.</label>
                  <input type="text" placeholder="10-digit mobile" value={form.mobile} onChange={setFm('mobile')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Licence No.</label>
                  <input type="text" placeholder="Driving licence no." value={form.licence_no} onChange={setFm('licence_no')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Joining Date</label>
                  <input type="date" value={form.joining_date} onChange={setFm('joining_date')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Daily Wage (₹)</label>
                  <input type="number" min="0" placeholder="e.g. 650" value={form.daily_wage} onChange={setFm('daily_wage')} className={inp} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button onClick={closeModal} className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60">
                {saving ? 'Saving…' : editId ? 'Update' : 'Save Operator'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
