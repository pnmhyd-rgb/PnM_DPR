import { useState, useEffect, useRef } from 'react'
import {
  getEquipmentTypes, createEquipmentType, bulkCreateEquipmentTypes,
  updateEquipmentType, deleteEquipmentType
} from '../../lib/api'
import {
  Plus, Trash2, Pencil, Check, X, Search, List,
  AlertTriangle, FileSpreadsheet, FileText, Download
} from 'lucide-react'

/* ── Export helpers ───────────────────────────────────────────────────────── */
const COLS = [
  { header: 'Sl No',          val: (t, i) => i + 1 },
  { header: 'Equipment Type', val: t => t.name },
  { header: 'Machines in Use',val: t => parseInt(t.usage_count) || 0 },
]

async function exportExcel(rows) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()
  const ws   = XLSX.utils.aoa_to_sheet([
    ['Equipment Types'],
    [`Generated: ${new Date().toLocaleString('en-IN')}`],
    [],
    COLS.map(c => c.header),
    ...rows.map((t, i) => COLS.map(c => c.val(t, i))),
  ])
  ws['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 16 }]
  // Bold header row (row index 3)
  COLS.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: 3, c: ci })
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'DCDCDC' } } }
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Equipment Types')
  XLSX.writeFile(wb, `EquipmentTypes_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function exportPDF(rows) {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('Equipment Types', 14, 12)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
  doc.text(`Total: ${rows.length} types   |   Generated: ${new Date().toLocaleString('en-IN')}`, 14, 19)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 24,
    head: [COLS.map(c => c.header)],
    body: rows.map((t, i) => COLS.map(c => String(c.val(t, i)))),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: { 0: { cellWidth: 16 }, 2: { cellWidth: 34 } },
    margin: { left: 14, right: 14 },
    didDrawPage: d => {
      doc.setFontSize(7); doc.setTextColor(150)
      doc.text(`Page ${d.pageNumber}`, doc.internal.pageSize.getWidth() - 20, doc.internal.pageSize.getHeight() - 6)
    }
  })
  doc.save(`EquipmentTypes_${new Date().toISOString().slice(0, 10)}.pdf`)
}

/* ── Component ────────────────────────────────────────────────────────────── */
export default function EquipmentTypes() {
  const [types,      setTypes]      = useState([])
  const [search,     setSearch]     = useState('')

  // Single add
  const [name,       setName]       = useState('')
  const [saving,     setSaving]     = useState(false)
  const [addError,   setAddError]   = useState('')

  // Bulk add
  const [showBulk,   setShowBulk]  = useState(false)
  const [bulkText,   setBulkText]  = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)

  // Selection (shared for delete + download)
  const [selected,   setSelected]   = useState(new Set())
  const [deleting,   setDeleting]   = useState(false)
  const [downloading,setDownloading] = useState(false)

  // Inline edit
  const [editId,     setEditId]     = useState(null)
  const [editVal,    setEditVal]    = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError,  setEditError]  = useState('')
  const editRef = useRef()

  // Force-delete dialog
  const [forceConfirm, setForceConfirm] = useState(null)

  const load = () => getEquipmentTypes().then(r => { setTypes(r.data.data); setSelected(new Set()) })
  useEffect(() => { load() }, [])
  useEffect(() => { if (editId && editRef.current) editRef.current.focus() }, [editId])

  const filtered = types.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))

  /* ── Add ─────────────────────────────────────────────────────────────────── */
  const handleAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setAddError('')
    try {
      await createEquipmentType({ name: name.trim() })
      setName(''); load()
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add')
    } finally { setSaving(false) }
  }

  const handleBulkAdd = async () => {
    const names = bulkText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    if (!names.length) return
    setBulkSaving(true); setBulkResult(null)
    try {
      const res = await bulkCreateEquipmentTypes(names)
      setBulkResult(res.data)
      if (res.data.created > 0) { load(); setBulkText('') }
    } catch (err) {
      setBulkResult({ error: err.response?.data?.error || 'Failed' })
    } finally { setBulkSaving(false) }
  }

  /* ── Inline edit ─────────────────────────────────────────────────────────── */
  const startEdit   = t => { setEditId(t.id); setEditVal(t.name); setEditError('') }
  const cancelEdit  = ()  => { setEditId(null); setEditVal(''); setEditError('') }
  const saveEdit    = async id => {
    if (!editVal.trim()) return
    setEditSaving(true); setEditError('')
    try {
      await updateEquipmentType(id, { name: editVal.trim() })
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
    else            setSelected(prev => { const n = new Set(prev); filtered.forEach(t => n.add(t.id)); return n })
  }
  const selectedCount = [...selected].filter(id => filtered.find(t => t.id === id)).length
  const selectedRows  = () => selectedCount > 0
    ? types.filter(t => selected.has(t.id))
    : types // "all" when nothing selected

  /* ── Delete ──────────────────────────────────────────────────────────────── */
  const doDelete = async (id, force = false) => {
    try {
      await deleteEquipmentType(id, force); setForceConfirm(null); load()
    } catch (err) {
      const data = err.response?.data
      if (err.response?.status === 409 && data?.usage_count > 0)
        setForceConfirm({ id, name: types.find(t => t.id === id)?.name, count: data.usage_count })
    }
  }

  const handleDeleteSelected = async () => {
    const ids    = [...selected].filter(id => filtered.find(t => t.id === id))
    const inUse  = ids.filter(id => parseInt(types.find(t => t.id === id)?.usage_count) > 0)
    const msg    = inUse.length > 0
      ? `${inUse.length} type(s) are in use by machines and will be force-deleted.\n\nContinue?`
      : `Delete ${ids.length} equipment type${ids.length > 1 ? 's' : ''}?`
    if (!confirm(msg)) return
    setDeleting(true)
    try { await Promise.all(ids.map(id => deleteEquipmentType(id, true))); load() }
    finally { setDeleting(false) }
  }

  /* ── Download ────────────────────────────────────────────────────────────── */
  const handleDownload = async (fmt) => {
    const rows = selectedRows()
    setDownloading(true)
    try {
      fmt === 'excel' ? await exportExcel(rows) : await exportPDF(rows)
    } finally { setDownloading(false) }
  }

  return (
    <div className="max-w-xl space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Equipment Types</h1>
          <p className="text-sm text-gray-500 mt-0.5">{types.length} type{types.length !== 1 ? 's' : ''} defined</p>
        </div>
        <button onClick={() => { setShowBulk(v => !v); setBulkResult(null) }}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors">
          <List size={14} />{showBulk ? 'Single Add' : 'Bulk Add'}
        </button>
      </div>

      {/* ── Single add ── */}
      {!showBulk && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex gap-3">
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Excavator, Genset, Backhoe Loader…"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors flex-shrink-0">
              <Plus size={15} />{saving ? 'Adding…' : 'Add'}
            </button>
          </div>
          {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
        </form>
      )}

      {/* ── Bulk add ── */}
      {showBulk && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Bulk Add Equipment Types</p>
          <p className="text-xs text-gray-500">One type per line, or separate with commas.</p>
          <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
            rows={5} placeholder={"Excavator\nGenset\nBackhoe Loader\nTipper, Motor Grader"}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex items-center gap-3">
            <button onClick={handleBulkAdd} disabled={bulkSaving || !bulkText.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors">
              <Plus size={15} />{bulkSaving ? 'Adding…' : 'Add All'}
            </button>
            {bulkText.trim() && (
              <span className="text-xs text-gray-400">
                {bulkText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length} type(s) to add
              </span>
            )}
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
        {/* Search */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-100 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search equipment types…"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={allChecked}
                ref={el => { if (el) el.indeterminate = someChecked }}
                onChange={toggleAll} className="w-4 h-4 accent-blue-600"
              />
              <span className="text-xs font-medium text-gray-600">
                {selectedCount > 0 ? `${selectedCount} selected` : `Select all${search ? ' visible' : ''}`}
              </span>
            </label>

            <div className="flex items-center gap-2">
              {/* Download buttons — selected or all */}
              <span className="text-xs text-gray-400 mr-1">
                {selectedCount > 0 ? `Download ${selectedCount} selected:` : 'Download all:'}
              </span>
              <button onClick={() => handleDownload('excel')} disabled={downloading || types.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 text-xs rounded-lg disabled:opacity-50 transition-colors font-medium">
                <FileSpreadsheet size={13} />Excel
              </button>
              <button onClick={() => handleDownload('pdf')} disabled={downloading || types.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 text-xs rounded-lg disabled:opacity-50 transition-colors font-medium">
                <FileText size={13} />PDF
              </button>

              {/* Delete selected */}
              {selectedCount > 0 && (
                <button onClick={handleDeleteSelected} disabled={deleting}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors ml-1">
                  <Trash2 size={13} />{deleting ? 'Deleting…' : `Delete ${selectedCount}`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              {search ? 'No types match your search' : 'No equipment types yet'}
            </p>
          )}

          {filtered.map((t, idx) => (
            <div key={t.id}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${selected.has(t.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)}
                className="w-4 h-4 accent-blue-600 flex-shrink-0" />

              {editId === t.id ? (
                /* Edit mode */
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <input ref={editRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') cancelEdit() }}
                    className="flex-1 border border-blue-400 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                  />
                  {editError && <span className="text-xs text-red-600 flex-shrink-0">{editError}</span>}
                  <button onClick={() => saveEdit(t.id)} disabled={editSaving}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors flex-shrink-0" title="Save (Enter)">
                    <Check size={15} />
                  </button>
                  <button onClick={cancelEdit}
                    className="p-1.5 text-gray-400 hover:bg-gray-100 rounded transition-colors flex-shrink-0" title="Cancel (Esc)">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                /* Display mode */
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{idx + 1}.</span>
                  <span className="text-sm text-gray-800 flex-1 truncate">{t.name}</span>
                  {parseInt(t.usage_count) > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                      {t.usage_count} machine{parseInt(t.usage_count) !== 1 ? 's' : ''}
                    </span>
                  )}
                  <div className="flex items-center gap-1 flex-shrink-0">
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

        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-right">
            {filtered.length} of {types.length} type{types.length !== 1 ? 's' : ''}
          </div>
        )}
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
