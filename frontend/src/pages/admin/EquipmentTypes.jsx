import { useState, useEffect, useRef } from 'react'
import {
  getEquipmentTypes, createEquipmentType, bulkCreateEquipmentTypes,
  updateEquipmentType, deleteEquipmentType
} from '../../lib/api'
import {
  Plus, Trash2, Pencil, Check, X, Search, List, AlertTriangle,
  Download, FileSpreadsheet, FileText
} from 'lucide-react'

const OWN_CATEGORIES = ['Measurable', 'Non-Measurable']

/* ── Download helpers ─────────────────────────────────────────────────────── */
const COLS = [
  { header: '#',              val: (t, i) => i + 1 },
  { header: 'Equipment Type', val: t => t.name },
  { header: 'Ownership',      val: t => t.ownership_type },
  { header: 'Category',       val: t => t.asset_category || (t.ownership_type === 'Hire' ? 'N/A' : '') },
  { header: 'Machines in Use',val: t => t.usage_count ?? 0 },
]

async function doExcel(rows) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()
  const header = COLS.map(c => c.header)
  const data   = rows.map((t, i) => COLS.map(c => c.val(t, i)))
  const ws     = XLSX.utils.aoa_to_sheet([
    ['Equipment Types'],
    [`Generated: ${new Date().toLocaleString('en-IN')}`],
    [],
    header,
    ...data,
  ])
  ws['!cols'] = COLS.map((c, ci) => ({ wch: ci === 0 ? 5 : Math.min(Math.max(c.header.length + 4, 14), 40) }))
  XLSX.utils.book_append_sheet(wb, ws, 'Equipment Types')
  XLSX.writeFile(wb, `EquipmentTypes_${new Date().toISOString().slice(0,10)}.xlsx`)
}

async function doPDF(rows) {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('Equipment Types', 14, 12)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 19)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 24,
    head: [COLS.map(c => c.header)],
    body: rows.map((t, i) => COLS.map(c => String(c.val(t, i)))),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: { 0: { cellWidth: 10 } },
    margin: { left: 14, right: 14 },
  })
  doc.save(`EquipmentTypes_${new Date().toISOString().slice(0,10)}.pdf`)
}

/* ── Component ────────────────────────────────────────────────────────────── */
export default function EquipmentTypes() {
  const [types,      setTypes]      = useState([])
  const [search,     setSearch]     = useState('')

  // Single add form
  const [name,       setName]       = useState('')
  const [owType,     setOwType]     = useState('Own')
  const [category,   setCategory]   = useState('Measurable')
  const [saving,     setSaving]     = useState(false)
  const [addError,   setAddError]   = useState('')

  // Multi-select delete
  const [selected,   setSelected]   = useState(new Set())
  const [deleting,   setDeleting]   = useState(false)

  // Inline edit
  const [editId,     setEditId]     = useState(null)
  const [editVal,    setEditVal]    = useState('')
  const [editOwType, setEditOwType] = useState('Own')
  const [editCat,    setEditCat]    = useState('Measurable')
  const [editSaving, setEditSaving] = useState(false)
  const [editError,  setEditError]  = useState('')
  const editRef = useRef()

  // Bulk add
  const [showBulk,   setShowBulk]  = useState(false)
  const [bulkText,   setBulkText]  = useState('')
  const [bulkOwType, setBulkOwType] = useState('Own')
  const [bulkCat,    setBulkCat]   = useState('Measurable')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)

  // Force-delete dialog
  const [forceConfirm, setForceConfirm] = useState(null)

  // Download
  const [downloading, setDownloading] = useState(false)

  const load = () => getEquipmentTypes().then(r => { setTypes(r.data.data); setSelected(new Set()) })
  useEffect(() => { load() }, [])
  useEffect(() => { if (editId && editRef.current) editRef.current.focus() }, [editId])

  const filtered = types.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))

  /* ── Single add ─────────────────────────────────────────────────────────── */
  const handleAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setAddError('')
    try {
      await createEquipmentType({ name: name.trim(), ownership_type: owType, asset_category: owType === 'Own' ? category : null })
      setName(''); load()
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add')
    } finally { setSaving(false) }
  }

  /* ── Bulk add ────────────────────────────────────────────────────────────── */
  const handleBulkAdd = async () => {
    const names = bulkText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    if (!names.length) return
    setBulkSaving(true); setBulkResult(null)
    try {
      const res = await bulkCreateEquipmentTypes({
        names,
        ownership_type: bulkOwType,
        asset_category: bulkOwType === 'Own' ? bulkCat : null,
      })
      setBulkResult(res.data)
      if (res.data.created > 0) { load(); setBulkText('') }
    } catch (err) {
      setBulkResult({ error: err.response?.data?.error || 'Failed' })
    } finally { setBulkSaving(false) }
  }

  /* ── Inline edit ─────────────────────────────────────────────────────────── */
  const startEdit = t => {
    setEditId(t.id); setEditVal(t.name)
    setEditOwType(t.ownership_type || 'Own')
    setEditCat(t.asset_category || 'Measurable')
    setEditError('')
  }
  const cancelEdit = () => { setEditId(null); setEditVal(''); setEditError('') }

  const saveEdit = async id => {
    if (!editVal.trim()) return
    setEditSaving(true); setEditError('')
    try {
      await updateEquipmentType(id, {
        name: editVal.trim(),
        ownership_type: editOwType,
        asset_category: editOwType === 'Own' ? editCat : null,
      })
      cancelEdit(); load()
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to save')
    } finally { setEditSaving(false) }
  }

  /* ── Selection ───────────────────────────────────────────────────────────── */
  const toggleOne   = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allChecked  = filtered.length > 0 && filtered.every(t => selected.has(t.id))
  const someChecked = filtered.some(t => selected.has(t.id)) && !allChecked
  const toggleAll   = () => {
    if (allChecked) setSelected(prev => { const n = new Set(prev); filtered.forEach(t => n.delete(t.id)); return n })
    else setSelected(prev => { const n = new Set(prev); filtered.forEach(t => n.add(t.id)); return n })
  }

  /* ── Delete ──────────────────────────────────────────────────────────────── */
  const doDelete = async (id, force = false) => {
    try {
      await deleteEquipmentType(id, force)
      setForceConfirm(null); load()
    } catch (err) {
      const data = err.response?.data
      if (err.response?.status === 409 && data?.usage_count > 0)
        setForceConfirm({ id, name: types.find(t => t.id === id)?.name, count: data.usage_count })
    }
  }

  const handleDeleteSelected = async () => {
    const ids = [...selected]
    const inUse = ids.filter(id => parseInt(types.find(t => t.id === id)?.usage_count) > 0)
    const msg = inUse.length > 0
      ? `${inUse.length} selected type(s) are in use by machines. All selected types will be force-deleted.\n\nContinue?`
      : `Delete ${ids.length} equipment type${ids.length > 1 ? 's' : ''}?`
    if (!confirm(msg)) return
    setDeleting(true)
    try { await Promise.all(ids.map(id => deleteEquipmentType(id, true))); load() }
    finally { setDeleting(false) }
  }

  const selectedCount = [...selected].filter(id => filtered.find(t => t.id === id)).length

  /* ── Download ────────────────────────────────────────────────────────────── */
  const handleDownload = async (fmt) => {
    setDownloading(true)
    try {
      fmt === 'excel' ? await doExcel(types) : await doPDF(types)
    } finally { setDownloading(false) }
  }

  /* ── Badge helpers ───────────────────────────────────────────────────────── */
  const owBadge = t => t.ownership_type === 'Hire'
    ? <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">Hire</span>
    : <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Own</span>

  const catBadge = t => {
    if (t.ownership_type === 'Hire') return null
    return t.asset_category === 'Non-Measurable'
      ? <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">Non-Measurable</span>
      : <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700">Measurable</span>
  }

  const selectCls = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  return (
    <div className="max-w-2xl space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Equipment Types</h1>
          <p className="text-sm text-gray-500 mt-0.5">{types.length} type{types.length !== 1 ? 's' : ''} defined</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Download buttons */}
          <button onClick={() => handleDownload('excel')} disabled={downloading || types.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 text-sm rounded-lg disabled:opacity-50 transition-colors">
            <FileSpreadsheet size={14} />Excel
          </button>
          <button onClick={() => handleDownload('pdf')} disabled={downloading || types.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 text-sm rounded-lg disabled:opacity-50 transition-colors">
            <FileText size={14} />PDF
          </button>
          <button onClick={() => { setShowBulk(v => !v); setBulkResult(null) }}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            <List size={14} />{showBulk ? 'Single Add' : 'Bulk Add'}
          </button>
        </div>
      </div>

      {/* ── Single add form ── */}
      {!showBulk && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex gap-3 flex-wrap">
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Equipment type name…"
              className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <select value={owType} onChange={e => { setOwType(e.target.value); if (e.target.value === 'Hire') setCategory('') }}
              className={selectCls}>
              <option value="Own">Own</option>
              <option value="Hire">Hire</option>
            </select>
            {owType === 'Own' && (
              <select value={category} onChange={e => setCategory(e.target.value)} className={selectCls}>
                {OWN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors flex-shrink-0">
              <Plus size={15} />{saving ? 'Adding…' : 'Add'}
            </button>
          </div>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
        </form>
      )}

      {/* ── Bulk add panel ── */}
      {showBulk && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Bulk Add Equipment Types</p>
          <p className="text-xs text-gray-500">One type per line or comma-separated. All will get the same ownership and category below.</p>
          <div className="flex gap-3 flex-wrap">
            <select value={bulkOwType} onChange={e => { setBulkOwType(e.target.value); if (e.target.value === 'Hire') setBulkCat('') }}
              className={selectCls}>
              <option value="Own">Own</option>
              <option value="Hire">Hire</option>
            </select>
            {bulkOwType === 'Own' && (
              <select value={bulkCat} onChange={e => setBulkCat(e.target.value)} className={selectCls}>
                {OWN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
          <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
            rows={5} placeholder={"Excavator\nGenset\nBackhoe Loader\nTipper, Motor Grader"}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex items-center gap-3">
            <button onClick={handleBulkAdd} disabled={bulkSaving || !bulkText.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors">
              <Plus size={15} />{bulkSaving ? 'Adding…' : 'Add All'}
            </button>
            <span className="text-xs text-gray-400">
              {bulkText.trim() ? `${bulkText.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean).length} type(s) to add` : ''}
            </span>
          </div>
          {bulkResult && (
            <div className={`rounded-lg p-3 text-xs space-y-1 ${bulkResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
              {bulkResult.error
                ? <p>{bulkResult.error}</p>
                : <>
                    <p className="font-semibold">{bulkResult.created} added{bulkResult.failed > 0 ? `, ${bulkResult.failed} skipped` : ''}</p>
                    {bulkResult.errors?.map((e, i) => <p key={i} className="text-amber-700">"{e.name}": {e.error}</p>)}
                  </>
              }
            </div>
          )}
        </div>
      )}

      {/* ── List ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search equipment types…"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={allChecked}
                ref={el => { if (el) el.indeterminate = someChecked }}
                onChange={toggleAll} className="w-4 h-4 accent-blue-600"
              />
              <span className="text-xs font-medium text-gray-600">
                {selectedCount > 0 ? `${selectedCount} selected` : `Select all${search ? ' visible' : ''}`}
              </span>
            </label>
            {selectedCount > 0 && (
              <button onClick={handleDeleteSelected} disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
                <Trash2 size={13} />{deleting ? 'Deleting…' : `Delete ${selectedCount}`}
              </button>
            )}
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[2rem_1fr_auto_auto_auto_auto] items-center px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide gap-2">
          <span />
          <span>Name</span>
          <span>Ownership</span>
          <span>Category</span>
          <span>In Use</span>
          <span />
        </div>

        <div className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              {search ? 'No types match your search' : 'No equipment types yet'}
            </p>
          )}

          {filtered.map((t, idx) => (
            <div key={t.id}
              className={`px-4 py-2.5 transition-colors ${selected.has(t.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              {editId === t.id ? (
                /* ── Edit row ── */
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input ref={editRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') cancelEdit() }}
                      className="flex-1 min-w-40 border border-blue-400 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select value={editOwType} onChange={e => { setEditOwType(e.target.value); if (e.target.value === 'Hire') setEditCat('') }}
                      className={selectCls}>
                      <option value="Own">Own</option>
                      <option value="Hire">Hire</option>
                    </select>
                    {editOwType === 'Own' && (
                      <select value={editCat} onChange={e => setEditCat(e.target.value)} className={selectCls}>
                        {OWN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                    <button onClick={() => saveEdit(t.id)} disabled={editSaving}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"><Check size={15} /></button>
                    <button onClick={cancelEdit}
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded transition-colors"><X size={15} /></button>
                  </div>
                  {editError && <p className="text-xs text-red-600">{editError}</p>}
                </div>
              ) : (
                /* ── Display row ── */
                <div className="grid grid-cols-[2rem_1fr_auto_auto_auto_auto] items-center gap-2">
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-gray-800 truncate font-medium">
                    <span className="text-xs text-gray-400 mr-1.5">{idx + 1}.</span>{t.name}
                  </span>
                  <span>{owBadge(t)}</span>
                  <span>{catBadge(t)}</span>
                  <span>
                    {parseInt(t.usage_count) > 0
                      ? <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">{t.usage_count}</span>
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(t)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => doDelete(t.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Force-delete dialog ── */}
      {forceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-semibold text-gray-900 text-sm">Type is in use</p>
                <p className="text-sm text-gray-600 mt-1">
                  <strong>"{forceConfirm.name}"</strong> is assigned to{' '}
                  <strong>{forceConfirm.count} active machine{forceConfirm.count > 1 ? 's' : ''}</strong>.
                  Deleting it won't remove those machines — their type field will just no longer match a known type.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => doDelete(forceConfirm.id, true)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                Delete Anyway
              </button>
              <button onClick={() => setForceConfirm(null)}
                className="flex-1 border border-gray-300 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
