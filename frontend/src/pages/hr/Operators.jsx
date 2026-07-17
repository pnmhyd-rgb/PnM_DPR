import { useState, useEffect, useRef } from 'react'
import { getProjects, getMachines, getOperators, createOperator, updateOperator, deleteOperator } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Plus, Pencil, Trash2, X, ChevronDown, Search } from 'lucide-react'

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

// ── Searchable dropdown ───────────────────────────────────────────────────────
function SearchableSelect({ value, onChange, options, placeholder, disabled = false, emptyLabel = 'Not Assigned' }) {
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(false)
  const ref = useRef()

  const selected = options.find(o => String(o.value) === String(value))
  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  useEffect(() => { if (!open) setSearch('') }, [open])

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = v => { onChange(v); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => { if (!disabled) setOpen(o => !o) }}
        className={`border rounded-lg px-3 py-2 text-sm flex items-center gap-2 min-h-[38px] transition-colors
          ${disabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
            : open
              ? 'border-blue-500 ring-2 ring-blue-100 bg-white cursor-pointer'
              : 'border-gray-300 bg-white cursor-pointer hover:border-gray-400'
          }`}
      >
        {open ? (
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Type to search…"
            className="flex-1 outline-none text-sm bg-transparent"
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className={`flex-1 truncate text-sm ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
            {selected ? selected.label : (placeholder || emptyLabel)}
          </span>
        )}
        <span className="flex-shrink-0 flex items-center gap-1">
          {value && !disabled && (
            <button
              onClick={e => { e.stopPropagation(); select('') }}
              className="text-gray-300 hover:text-gray-500 p-0.5 rounded"
            >
              <X size={12} />
            </button>
          )}
          <ChevronDown size={13} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-52 overflow-y-auto">
            <button
              onClick={() => select('')}
              className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100
                ${!value ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-400 hover:bg-gray-50'}`}
            >
              {emptyLabel}
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">No results for "{search}"</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => select(String(opt.value))}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors
                    ${String(opt.value) === String(value)
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
          {filtered.length > 0 && (
            <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50">
              <p className="text-[10px] text-gray-400">{filtered.length} of {options.length} shown</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Operators() {
  const { isAdmin } = useAuth()
  const [projects,        setProjects]        = useState([])
  const [machines,        setMachines]        = useState([])
  const [machinesLoading, setMachinesLoading] = useState(false)
  const [operators,       setOperators]       = useState([])
  const [loading,         setLoading]         = useState(false)
  const [filters,         setFilters]         = useState({ project_code: '', status: '' })
  const [showModal,       setShowModal]       = useState(false)
  const [editId,          setEditId]          = useState(null)
  const [form,            setForm]            = useState(emptyForm())
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')

  useEffect(() => { getProjects().then(r => setProjects(r.data.data)) }, [])

  // When project changes inside the form, load that project's machines
  useEffect(() => {
    if (!form.project_id) { setMachines([]); return }
    setMachinesLoading(true)
    getMachines({ project_id: form.project_id })
      .then(r => setMachines(r.data.data))
      .catch(() => setMachines([]))
      .finally(() => setMachinesLoading(false))
  }, [form.project_id])

  const load = () => {
    setLoading(true)
    const p = {}
    if (filters.project_code) p.project_code = filters.project_code
    if (filters.status)       p.status        = filters.status
    getOperators(p).then(r => setOperators(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const setFm = (k, v) => setForm(f => ({ ...f, [k]: v }))

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

  const closeModal = () => { setShowModal(false); setEditId(null); setError(''); setMachines([]) }

  const handleSave = async () => {
    const trimmedName  = form.name.trim()
    const trimmedEmpId = form.emp_id.trim()

    if (!trimmedName) { setError('Name is required.'); return }

    // Frontend duplicate checks against already-loaded operators list
    const others = operators.filter(o => o.id !== editId)

    if (trimmedEmpId) {
      const empDup = others.find(o => o.emp_id && o.emp_id.toLowerCase() === trimmedEmpId.toLowerCase())
      if (empDup) {
        setError(`Employee Code "${trimmedEmpId}" is already assigned to "${empDup.name}". EMP ID must be unique.`)
        return
      }
    }

    const nameDup = others.find(o =>
      o.name.toLowerCase() === trimmedName.toLowerCase() &&
      (String(o.project_id ?? '') === String(form.project_id ?? ''))
    )
    if (nameDup) {
      setError(`An operator named "${trimmedName}" already exists${form.project_id ? ' for this project' : ' (unassigned)'}. Use a different name or assign to a different project.`)
      return
    }

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

  const activeCount  = operators.filter(o => o.status === 'Active').length
  const onLeaveCount = operators.filter(o => o.status === 'On Leave').length

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

  // Options for SearchableSelect
  const projectOptions       = projects.map(p => ({ value: p.id,   label: `${p.code} — ${p.name}` }))
  const projectFilterOptions = projects.map(p => ({ value: p.code, label: `${p.code} — ${p.name}` }))
  const machineOptions       = machines.map(m => ({
    value: m.id,
    label: `${m.slno}${m.nickname ? ` (${m.nickname})` : ''} — ${m.eq_type}`,
  }))

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <SearchableSelect
              value={filters.project_code}
              onChange={v => setFilters(f => ({ ...f, project_code: v }))}
              options={projectFilterOptions}
              placeholder="All Projects"
              emptyLabel="All Projects"
            />
          </div>
          <select
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            className={inp}
          >
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
                {/* Name */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name *</label>
                  <input type="text" placeholder="Full name" value={form.name}
                    onChange={e => setFm('name', e.target.value)} className={inp} />
                </div>
                {/* Employee ID */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee ID</label>
                  <input type="text" placeholder="e.g. EMP001" value={form.emp_id}
                    onChange={e => setFm('emp_id', e.target.value)} className={inp} />
                </div>
                {/* Designation */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Designation</label>
                  <select value={form.designation} onChange={e => setFm('designation', e.target.value)} className={inp}>
                    {DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                {/* Status */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => setFm('status', e.target.value)} className={inp}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Assigned Project — full width, searchable */}
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Assigned Project / Site
                  </label>
                  <SearchableSelect
                    value={form.project_id}
                    onChange={v => {
                      // Clear machine when project changes
                      setForm(f => ({ ...f, project_id: v, machine_id: '' }))
                    }}
                    options={projectOptions}
                    placeholder="Search project…"
                    emptyLabel="Not Assigned"
                  />
                </div>

                {/* Assigned Machine — full width, searchable, loads from project */}
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Assigned Machinery
                    {form.project_id && !machinesLoading && (
                      <span className="ml-2 text-gray-400 normal-case font-normal">
                        — {machines.length} machine{machines.length !== 1 ? 's' : ''} on site
                      </span>
                    )}
                  </label>
                  <SearchableSelect
                    value={form.machine_id}
                    onChange={v => setFm('machine_id', v)}
                    options={machineOptions}
                    placeholder={
                      machinesLoading
                        ? 'Loading machines…'
                        : form.project_id
                          ? machines.length === 0
                            ? 'No machines on this site'
                            : 'Search by S.No, type, or nickname…'
                          : 'Select a project first'
                    }
                    disabled={!form.project_id || machinesLoading}
                    emptyLabel="Not Assigned"
                  />
                  {form.project_id && !machinesLoading && machines.length === 0 && (
                    <p className="text-xs text-amber-600">No active machines found for this project.</p>
                  )}
                </div>

                {/* Mobile */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mobile No.</label>
                  <input type="text" placeholder="10-digit mobile" value={form.mobile}
                    onChange={e => setFm('mobile', e.target.value)} className={inp} />
                </div>
                {/* Licence */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Licence No.</label>
                  <input type="text" placeholder="Driving licence no." value={form.licence_no}
                    onChange={e => setFm('licence_no', e.target.value)} className={inp} />
                </div>
                {/* Joining Date */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Joining Date</label>
                  <input type="date" value={form.joining_date}
                    onChange={e => setFm('joining_date', e.target.value)} className={inp} />
                </div>
                {/* Daily Wage */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Daily Wage (₹)</label>
                  <input type="number" min="0" placeholder="e.g. 650" value={form.daily_wage}
                    onChange={e => setFm('daily_wage', e.target.value)} className={inp} />
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
