import { useState, useEffect, useMemo } from 'react'
import { getProjects, getMachines, createMachine, updateMachine, deleteMachine, getEquipmentTypes } from '../../lib/api'
import {
  Plus, Edit2, Trash2, X, Search, ChevronUp, ChevronDown as ChevDown,
  RotateCcw, Eye, EyeOff, Filter
} from 'lucide-react'

const SHIFT_OPTIONS = ['Single Shift', 'Dual Shift']

const blank = {
  project_id: '', slno: '', eq_type: '', capacity: '', reg_no: '',
  ownership: 'Own', vendor: '', rate: '', reading1_basis: 'Hours',
  reading2_basis: '', dual_reading: false, fuel_min: '', fuel_max: '',
  planned_hours: '10', shift_type: ''
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevDown size={11} className="text-gray-300 ml-0.5" />
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="text-blue-600 ml-0.5" />
    : <ChevDown size={11} className="text-blue-600 ml-0.5" />
}

export default function Machines() {
  const [projects,      setProjects]      = useState([])
  const [eqTypes,       setEqTypes]       = useState([])
  const [machines,      setMachines]      = useState([])

  // Filters
  const [filterProj,    setFilterProj]    = useState('')
  const [filterType,    setFilterType]    = useState('')
  const [filterOwn,     setFilterOwn]     = useState('')
  const [search,        setSearch]        = useState('')
  const [showInactive,  setShowInactive]  = useState(false)

  // Sort
  const [sortCol,       setSortCol]       = useState('slno')
  const [sortDir,       setSortDir]       = useState('asc')

  // Multi-select
  const [selected,      setSelected]      = useState(new Set())
  const [bulkDeleting,  setBulkDeleting]  = useState(false)

  // Modal
  const [modal,         setModal]         = useState(null)
  const [form,          setForm]          = useState(blank)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  const load = () => {
    const params = {}
    if (filterProj) params.project_code = filterProj
    if (showInactive) params.include_inactive = 'true'
    getMachines(params).then(r => { setMachines(r.data.data); setSelected(new Set()) })
  }

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data))
    getEquipmentTypes().then(r => setEqTypes(r.data.data))
  }, [])

  useEffect(() => { load() }, [filterProj, showInactive])

  // ── Filtered + sorted list ─────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = machines
    if (filterType) list = list.filter(m => m.eq_type === filterType)
    if (filterOwn)  list = list.filter(m => m.ownership === filterOwn)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.slno?.toLowerCase().includes(q) ||
        m.eq_type?.toLowerCase().includes(q) ||
        m.reg_no?.toLowerCase().includes(q) ||
        m.project_code?.toLowerCase().includes(q) ||
        m.manufacturer?.toLowerCase().includes(q) ||
        m.model?.toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      let av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [machines, filterType, filterOwn, search, sortCol, sortDir])

  const activeCount   = machines.filter(m => m.active).length
  const inactiveCount = machines.filter(m => !m.active).length

  // ── Sort toggle ────────────────────────────────────────────────────────────
  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  const toggleOne   = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allChecked  = displayed.length > 0 && displayed.every(m => selected.has(m.id))
  const someChecked = displayed.some(m => selected.has(m.id)) && !allChecked
  const toggleAll   = () => {
    if (allChecked) setSelected(prev => { const n = new Set(prev); displayed.forEach(m => n.delete(m.id)); return n })
    else setSelected(prev => { const n = new Set(prev); displayed.forEach(m => n.add(m.id)); return n })
  }
  const selectedCount = [...selected].filter(id => displayed.find(m => m.id === id)).length

  // ── Bulk deactivate ────────────────────────────────────────────────────────
  const handleBulkDeactivate = async () => {
    const ids = [...selected].filter(id => displayed.find(m => m.id === id))
    if (!confirm(`Deactivate ${ids.length} machine${ids.length > 1 ? 's' : ''}?`)) return
    setBulkDeleting(true)
    try { await Promise.all(ids.map(id => deleteMachine(id))); load() }
    finally { setBulkDeleting(false) }
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...blank, project_id: projects.find(p => p.code === filterProj)?.id?.toString() || '' })
    setError(''); setModal('add')
  }
  const openEdit = (m) => {
    setForm({
      project_id: String(m.project_id), slno: m.slno, eq_type: m.eq_type,
      capacity: m.capacity || '', reg_no: m.reg_no || '',
      ownership: m.ownership, vendor: m.vendor || '', rate: m.rate || '',
      reading1_basis: m.reading1_basis, reading2_basis: m.reading2_basis || '',
      dual_reading: m.dual_reading, fuel_min: m.fuel_min || '', fuel_max: m.fuel_max || '',
      planned_hours: String(m.planned_hours || 10), shift_type: m.shift_type || 'Single Shift'
    })
    setError(''); setModal({ edit: m })
  }
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = async () => {
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        project_id: parseInt(form.project_id),
        rate: form.rate || null, fuel_min: form.fuel_min || null,
        fuel_max: form.fuel_max || null, capacity: form.capacity || null,
        vendor: form.vendor || null, reg_no: form.reg_no || null,
        reading2_basis: form.reading2_basis || null,
        planned_hours: parseFloat(form.planned_hours) || 10,
        shift_type: form.shift_type
      }
      modal === 'add' ? await createMachine(payload) : await updateMachine(modal.edit.id, payload)
      setModal(null); load()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  const reactivate = async (id) => {
    await updateMachine(id, { active: true }); load()
  }

  const deactivate = async (id) => {
    if (!confirm('Deactivate this machine?')) return
    await deleteMachine(id); load()
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'
  const thCls = col => `px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap cursor-pointer select-none hover:text-gray-700`

  const HEADERS = [
    { label: 'Project',   col: 'project_code' },
    { label: 'SL #',      col: 'slno' },
    { label: 'Type',      col: 'eq_type' },
    { label: 'Reg #',     col: 'reg_no' },
    { label: 'Own/Hire',  col: 'ownership' },
    { label: 'Shift',     col: 'shift_type' },
    { label: 'Basis',     col: 'reading1_basis' },
    { label: 'Fuel Min',  col: 'fuel_min' },
    { label: 'Fuel Max',  col: 'fuel_max' },
    { label: 'Planned',   col: 'planned_hours' },
  ]

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Machine Registry</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} active{inactiveCount > 0 ? `, ${inactiveCount} inactive` : ''}
            {displayed.length !== machines.length ? ` · ${displayed.length} shown` : ''}
          </p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors">
          <Plus size={15} />Add Machine
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by SL#, type, reg no, project, manufacturer…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>

        {/* Dropdowns row */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter size={13} className="text-gray-400" />
          <select value={filterProj} onChange={e => setFilterProj(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
          </select>

          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Types</option>
            {eqTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>

          <select value={filterOwn} onChange={e => setFilterOwn(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Own &amp; Hire</option>
            <option value="Own">Own only</option>
            <option value="Hire">Hire only</option>
          </select>

          <button onClick={() => setShowInactive(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              showInactive ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>
            {showInactive ? <Eye size={13} /> : <EyeOff size={13} />}
            {showInactive ? 'Hiding inactive' : 'Show inactive'}
          </button>

          {(search || filterType || filterOwn) && (
            <button onClick={() => { setSearch(''); setFilterType(''); setFilterOwn('') }}
              className="text-xs text-blue-600 hover:underline">Clear filters</button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Bulk action toolbar */}
        {selectedCount > 0 && (
          <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">{selectedCount} machine{selectedCount > 1 ? 's' : ''} selected</span>
            <button onClick={handleBulkDeactivate} disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
              <Trash2 size={13} />{bulkDeleting ? 'Deactivating…' : `Deactivate ${selectedCount}`}
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {/* Select-all checkbox */}
                <th className="px-3 py-2.5 w-8">
                  <input type="checkbox" checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked }}
                    onChange={toggleAll} className="w-4 h-4 accent-blue-600" />
                </th>
                {HEADERS.map(({ label, col }) => (
                  <th key={col} className={thCls(col)} onClick={() => toggleSort(col)}>
                    <span className="flex items-center">
                      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.length === 0 && (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-gray-400">
                  {search || filterType || filterOwn ? 'No machines match the current filters' : 'No machines found'}
                </td></tr>
              )}
              {displayed.map(m => (
                <tr key={m.id} className={`transition-colors ${
                  !m.active ? 'bg-gray-50 opacity-60' : selected.has(m.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}>
                  <td className="px-3 py-2">
                    {m.active && (
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleOne(m.id)}
                        className="w-4 h-4 accent-blue-600" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded text-xs">{m.project_code}</span>
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    {m.slno}
                    {!m.active && <span className="ml-1.5 text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Inactive</span>}
                  </td>
                  <td className="px-3 py-2">{m.eq_type}</td>
                  <td className="px-3 py-2">{m.reg_no || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-medium ${m.ownership === 'Own' ? 'text-blue-600' : 'text-violet-600'}`}>{m.ownership}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      m.shift_type === 'Dual Shift' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                    }`}>{m.shift_type || 'Single Shift'}</span>
                  </td>
                  <td className="px-3 py-2">{m.reading1_basis}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.fuel_min ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.fuel_max ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.planned_hours}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {m.active ? (
                        <>
                          <button onClick={() => openEdit(m)} title="Edit"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 size={13} /></button>
                          <button onClick={() => deactivate(m.id)} title="Deactivate"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={13} /></button>
                        </>
                      ) : (
                        <button onClick={() => reactivate(m.id)} title="Reactivate"
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"><RotateCcw size={13} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {displayed.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-right">
            {displayed.length} of {machines.length} machine{machines.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Add / Edit modal ── */}
      {modal && (
        <Modal title={modal === 'add' ? 'Add Machine' : 'Edit Machine'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Project *</label>
                <select value={form.project_id} onChange={set('project_id')} className={inp} required>
                  <option value="">— select —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>SL# *</label>
                <input type="text" value={form.slno} onChange={set('slno')} className={inp} placeholder="e.g. E6-EX-02" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Equipment Type *</label>
                <select value={form.eq_type} onChange={set('eq_type')} className={inp} required>
                  <option value="">— select —</option>
                  {eqTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Capacity</label>
                <input type="text" value={form.capacity} onChange={set('capacity')} className={inp} placeholder="e.g. 20T" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Reg No</label>
                <input type="text" value={form.reg_no} onChange={set('reg_no')} className={inp} />
              </div>
              <div>
                <label className={lbl}>Ownership</label>
                <select value={form.ownership} onChange={set('ownership')} className={inp}>
                  <option>Own</option><option>Hire</option>
                </select>
              </div>
            </div>

            <div>
              <label className={lbl}>Shift Type *</label>
              <select value={form.shift_type} onChange={set('shift_type')} className={inp} required>
                <option value="">— select shift —</option>
                {SHIFT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Single Shift: operator selects Day or Night each entry. Dual Shift: both readings captured together.</p>
            </div>

            {form.ownership === 'Hire' && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Vendor</label><input type="text" value={form.vendor} onChange={set('vendor')} className={inp} /></div>
                <div><label className={lbl}>Rate (₹/day)</label><input type="number" value={form.rate} onChange={set('rate')} className={inp} /></div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Reading 1 Basis</label>
                <select value={form.reading1_basis} onChange={set('reading1_basis')} className={inp}>
                  <option>Hours</option><option>KM</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="dual" checked={form.dual_reading} onChange={set('dual_reading')} className="rounded border-gray-300" />
                <label htmlFor="dual" className="text-sm text-gray-700 select-none">Dual Reading</label>
              </div>
            </div>

            {form.dual_reading && (
              <div>
                <label className={lbl}>Reading 2 Basis</label>
                <select value={form.reading2_basis} onChange={set('reading2_basis')} className={inp}>
                  <option value="">— select —</option><option>Hours</option><option>KM</option>
                </select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div><label className={lbl}>Fuel Min (L/hr)</label><input type="number" step="0.1" value={form.fuel_min} onChange={set('fuel_min')} className={inp} /></div>
              <div><label className={lbl}>Fuel Max (L/hr)</label><input type="number" step="0.1" value={form.fuel_max} onChange={set('fuel_max')} className={inp} /></div>
              <div><label className={lbl}>Planned Hrs/Day</label><input type="number" step="0.5" value={form.planned_hours} onChange={set('planned_hours')} className={inp} /></div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={save} disabled={saving}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setModal(null)}
                className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
