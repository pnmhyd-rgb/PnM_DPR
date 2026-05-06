import { useState, useEffect, useMemo, useRef } from 'react'
import { getProjects, getMachines, createMachine, bulkCreateMachines, updateMachine, deleteMachine, getEquipmentTypes } from '../../lib/api'
import {
  Plus, Edit2, Trash2, X, Search, ChevronUp, ChevronDown as ChevDown,
  RotateCcw, Eye, EyeOff, Filter, Upload, Download
} from 'lucide-react'

/* ── Bulk upload helpers ──────────────────────────────────────────────────── */
async function downloadMachineTemplate(projects) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const projList = projects.map(p => p.code).join(', ') || 'PROJECT_CODE'
  const ws = XLSX.utils.aoa_to_sheet([
    ['Machine Registry Bulk Upload Template'],
    [`Project Codes available: ${projList}`],
    ['Ownership: Own or Hire  |  Shift Type: Single Shift or Dual Shift  |  Reading Basis: Hours or KM'],
    [],
    ['Sl No', 'Project Code', 'Machine SL#', 'Equipment Type', 'Ownership', 'Shift Type',
     'Capacity', 'Reg No', 'Vendor', 'Reading Basis', 'Fuel Min (L/hr)', 'Fuel Max (L/hr)', 'Planned Hrs/Day'],
    [1, projects[0]?.code || 'PRJ001', 'E6-EX-02', 'Excavator',       'Own',  'Single Shift', '20T',    'KA01AB1234', '',        'Hours', 5, 8, 10],
    [2, projects[0]?.code || 'PRJ001', 'E6-DG-01', 'Diesel Generator', 'Hire', 'Single Shift', '125KVA', '',           'AcmeCo',  'Hours', 3, 6, 10],
  ])
  ws['!cols'] = [
    { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 14 },
    { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ]
  const headerR = 4
  for (let ci = 0; ci < 13; ci++) {
    const ref = XLSX.utils.encode_cell({ r: headerR, c: ci })
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D0D8E8' } } }
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  XLSX.writeFile(wb, 'MachineRegistry_Template.xlsx')
}

async function parseMachineFile(file) {
  const XLSX = await import('xlsx')
  const data = await file.arrayBuffer()
  const wb   = XLSX.read(data)
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Find header row
  let headerRow = -1
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map(c => String(c).trim().toLowerCase())
    if (lower.includes('machine sl#') || lower.includes('project code')) { headerRow = i; break }
  }
  if (headerRow === -1)
    return { error: 'Could not find the header row. Ensure your file has "Project Code" and "Machine SL#" columns.' }

  const headers = rows[headerRow].map(c => String(c).trim().toLowerCase())
  const col = k => headers.findIndex(h => h.startsWith(k))

  const projCol    = col('project code')
  const slnoCol    = col('machine sl')
  const typeCol    = col('equipment type')
  const ownCol     = col('ownership')
  const shiftCol   = col('shift type')
  const capCol     = col('capacity')
  const regCol     = col('reg no')
  const vendorCol  = col('vendor')
  const basisCol   = col('reading basis')
  const fuelMinCol = col('fuel min')
  const fuelMaxCol = col('fuel max')
  const planCol    = col('planned')

  if (projCol === -1 || slnoCol === -1 || typeCol === -1)
    return { error: 'Missing required columns: "Project Code", "Machine SL#", "Equipment Type".' }

  const items = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i]
    const slno = String(r[slnoCol] ?? '').trim()
    if (!slno) continue
    items.push({
      project_code:   String(r[projCol]   ?? '').trim(),
      slno,
      eq_type:        String(r[typeCol]   ?? '').trim(),
      ownership:      String(r[ownCol]    ?? 'Own').trim() || 'Own',
      shift_type:     String(r[shiftCol]  ?? 'Single Shift').trim() || 'Single Shift',
      capacity:       String(r[capCol]    ?? '').trim() || null,
      reg_no:         String(r[regCol]    ?? '').trim() || null,
      vendor:         vendorCol  >= 0 ? (String(r[vendorCol]  ?? '').trim() || null) : null,
      reading1_basis: basisCol   >= 0 ? (String(r[basisCol]   ?? 'Hours').trim() || 'Hours') : 'Hours',
      fuel_min:       fuelMinCol >= 0 ? (parseFloat(r[fuelMinCol]) || null) : null,
      fuel_max:       fuelMaxCol >= 0 ? (parseFloat(r[fuelMaxCol]) || null) : null,
      planned_hours:  planCol    >= 0 ? (parseFloat(r[planCol])    || 10)   : 10,
    })
  }
  if (items.length === 0) return { error: 'No machine rows found in the file.' }
  return { items }
}

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

  // Bulk upload
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkFile,      setBulkFile]      = useState(null)
  const [bulkPreview,   setBulkPreview]   = useState(null)
  const [bulkSaving,    setBulkSaving]    = useState(false)
  const [bulkResult,    setBulkResult]    = useState(null)
  const fileInputRef = useRef()

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

  // ── Bulk upload ────────────────────────────────────────────────────────────
  const resetBulk = () => {
    setBulkFile(null); setBulkPreview(null); setBulkResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  const closeBulkModal = () => { setShowBulkModal(false); resetBulk() }

  const handleBulkFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkFile(file); setBulkResult(null)
    setBulkPreview(await parseMachineFile(file))
  }

  const handleBulkUpload = async () => {
    if (!bulkPreview?.items?.length) return
    setBulkSaving(true); setBulkResult(null)
    try {
      const res = await bulkCreateMachines(bulkPreview.items)
      setBulkResult(res.data)
      if (res.data.created > 0) { load(); resetBulk() }
    } catch (err) {
      setBulkResult({ error: err.response?.data?.error || 'Upload failed' })
    } finally { setBulkSaving(false) }
  }

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
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBulkModal(true)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            <Upload size={14} />Bulk Upload
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors">
            <Plus size={15} />Add Machine
          </button>
        </div>
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

      {/* ── Bulk Upload modal ── */}
      {showBulkModal && (
        <Modal title="Bulk Upload Machines" onClose={closeBulkModal}>
          <div className="space-y-4">

            {/* Step 1 — download template */}
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <span className="w-5 h-5 flex-shrink-0 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold mt-0.5">1</span>
              <div className="flex-1 space-y-2">
                <p className="text-xs font-medium text-gray-700">Download the template, fill in your machine data, then re-upload.</p>
                <p className="text-xs text-gray-500">
                  Required columns: <strong>Project Code</strong>, <strong>Machine SL#</strong>, <strong>Equipment Type</strong>.
                  Ownership: <em>Own</em> or <em>Hire</em>. Shift: <em>Single Shift</em> or <em>Dual Shift</em>.
                </p>
                <button onClick={() => downloadMachineTemplate(projects)}
                  className="flex items-center gap-2 px-3 py-1.5 border border-blue-400 text-blue-700 bg-white hover:bg-blue-50 text-xs font-medium rounded-lg transition-colors">
                  <Download size={13} />Download Template (.xlsx)
                </button>
              </div>
            </div>

            {/* Step 2 — upload file */}
            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <span className="w-5 h-5 flex-shrink-0 rounded-full bg-gray-500 text-white text-xs flex items-center justify-center font-bold mt-0.5">2</span>
              <div className="flex-1 space-y-2">
                <p className="text-xs font-medium text-gray-700">Upload the filled template</p>
                <label className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 text-xs font-medium rounded-lg transition-colors cursor-pointer w-fit">
                  <Upload size={13} />
                  {bulkFile ? bulkFile.name : 'Choose .xlsx file…'}
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulkFileChange} />
                </label>

                {bulkPreview?.error && (
                  <p className="text-xs text-red-600">{bulkPreview.error}</p>
                )}

                {bulkPreview?.items && (
                  <div className="space-y-2">
                    <p className="text-xs text-green-700 font-medium">{bulkPreview.items.length} row{bulkPreview.items.length !== 1 ? 's' : ''} ready to upload</p>
                    <div className="overflow-x-auto rounded border border-gray-200">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-100 text-gray-600">
                          <tr>
                            <th className="px-2 py-1 text-left font-medium">#</th>
                            <th className="px-2 py-1 text-left font-medium">Project</th>
                            <th className="px-2 py-1 text-left font-medium">SL#</th>
                            <th className="px-2 py-1 text-left font-medium">Equipment Type</th>
                            <th className="px-2 py-1 text-left font-medium">Own/Hire</th>
                            <th className="px-2 py-1 text-left font-medium">Shift</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {bulkPreview.items.slice(0, 6).map((item, i) => (
                            <tr key={i} className="bg-white">
                              <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                              <td className="px-2 py-1 font-medium text-blue-700">{item.project_code}</td>
                              <td className="px-2 py-1 font-semibold">{item.slno}</td>
                              <td className="px-2 py-1">{item.eq_type}</td>
                              <td className="px-2 py-1">
                                <span className={`font-medium ${item.ownership === 'Own' ? 'text-blue-600' : 'text-violet-600'}`}>
                                  {item.ownership}
                                </span>
                              </td>
                              <td className="px-2 py-1 text-gray-600">{item.shift_type}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {bulkPreview.items.length > 6 && (
                      <p className="text-xs text-gray-400">…and {bulkPreview.items.length - 6} more</p>
                    )}
                    <div className="flex items-center gap-3 pt-1">
                      <button onClick={handleBulkUpload} disabled={bulkSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors">
                        <Upload size={14} />{bulkSaving ? 'Uploading…' : `Upload ${bulkPreview.items.length} Machine${bulkPreview.items.length !== 1 ? 's' : ''}`}
                      </button>
                      <button onClick={resetBulk} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Clear</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Result */}
            {bulkResult && (
              <div className={`rounded-lg p-3 text-xs space-y-1 ${bulkResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
                {bulkResult.error
                  ? <p>{bulkResult.error}</p>
                  : <>
                      <p className="font-semibold">{bulkResult.created} added{bulkResult.failed > 0 ? `, ${bulkResult.failed} failed` : ''}</p>
                      {bulkResult.errors?.map((e, i) => (
                        <p key={i} className="text-amber-700">Row {e.row} ({e.slno || '—'}): {e.error}</p>
                      ))}
                    </>
                }
              </div>
            )}
          </div>
        </Modal>
      )}

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
