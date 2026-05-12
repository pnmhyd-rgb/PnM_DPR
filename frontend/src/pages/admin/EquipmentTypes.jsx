import { useState, useEffect, useRef } from 'react'
import {
  getEquipmentTypes, createEquipmentType, bulkCreateEquipmentTypes,
  updateEquipmentType, deleteEquipmentType
} from '../../lib/api'
import {
  Plus, Trash2, Pencil, Check, X, Search, List,
  AlertTriangle, FileSpreadsheet, FileText, Download, Upload
} from 'lucide-react'

const CATEGORIES = ['Measurable', 'Non-Measurable']

/* ── Export helpers ───────────────────────────────────────────────────────── */
const COLS = [
  { header: 'Sl No',           val: (t, i) => i + 1 },
  { header: 'Equipment Type',  val: t => t.name },
  { header: 'Category',        val: t => t.asset_category || '—' },
  { header: 'Own (Working)',   val: t => parseInt(t.own_count)   || 0 },
  { header: 'Hire (Working)',  val: t => parseInt(t.hire_count)  || 0 },
  { header: 'Total Machines',  val: t => parseInt(t.usage_count) || 0 },
]

async function exportExcel(rows) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()

  const totalOwn  = rows.reduce((s, t) => s + (parseInt(t.own_count)   || 0), 0)
  const totalHire = rows.reduce((s, t) => s + (parseInt(t.hire_count)  || 0), 0)
  const totalAll  = rows.reduce((s, t) => s + (parseInt(t.usage_count) || 0), 0)
  const totalsRow = ['', 'GRAND TOTAL', '', totalOwn, totalHire, totalAll]

  const ws = XLSX.utils.aoa_to_sheet([
    ['Equipment Types'],
    [`Generated: ${new Date().toLocaleString('en-IN')}`],
    [],
    COLS.map(c => c.header),
    ...rows.map((t, i) => COLS.map(c => c.val(t, i))),
    [],
    totalsRow,
  ])
  ws['!cols'] = [{ wch: 8 }, { wch: 36 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]

  COLS.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: 3, c: ci })
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'DCDCDC' } } }
  })
  const totalsR = 4 + rows.length + 1
  totalsRow.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: totalsR, c: ci })
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D0E0FF' } } }
  })

  XLSX.utils.book_append_sheet(wb, ws, 'Equipment Types')
  XLSX.writeFile(wb, `EquipmentTypes_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function exportPDF(rows) {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const totalOwn  = rows.reduce((s, t) => s + (parseInt(t.own_count)   || 0), 0)
  const totalHire = rows.reduce((s, t) => s + (parseInt(t.hire_count)  || 0), 0)
  const totalAll  = rows.reduce((s, t) => s + (parseInt(t.usage_count) || 0), 0)

  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('Equipment Types', 14, 12)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
  doc.text(
    `${rows.length} types  |  Own: ${totalOwn}  Hire: ${totalHire}  Total Machines: ${totalAll}  |  Generated: ${new Date().toLocaleString('en-IN')}`,
    14, 19
  )
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 24,
    head: [COLS.map(c => c.header)],
    body: [
      ...rows.map((t, i) => COLS.map(c => String(c.val(t, i)))),
      ['', 'GRAND TOTAL', '', String(totalOwn), String(totalHire), String(totalAll)],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [248, 248, 248], textColor: 0, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: { cellWidth: 14 },
      2: { cellWidth: 28 },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 26, halign: 'center' },
      5: { cellWidth: 26, halign: 'center' },
    },
    didParseCell: d => {
      if (d.row.index === rows.length) {
        d.cell.styles.fontStyle = 'bold'
        d.cell.styles.fillColor = [208, 224, 255]
      }
    },
    margin: { left: 14, right: 14 },
    didDrawPage: d => {
      doc.setFontSize(7); doc.setTextColor(150)
      doc.text(`Page ${d.pageNumber}`, doc.internal.pageSize.getWidth() - 20, doc.internal.pageSize.getHeight() - 6)
    }
  })
  doc.save(`EquipmentTypes_${new Date().toISOString().slice(0, 10)}.pdf`)
}

/* ── Bulk upload helpers ──────────────────────────────────────────────────── */
async function downloadTemplate() {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    ['Equipment Types Bulk Upload Template'],
    ['Fill in Equipment Type (required) and Category (Measurable or Non-Measurable). Do not edit the header row (row 4).'],
    [],
    ['Sl No', 'Equipment Type', 'Category'],
    [1, 'Excavator', 'Measurable'],
    [2, 'Generator', 'Measurable'],
    [3, 'Safety Helmet', 'Non-Measurable'],
  ])
  ws['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 22 }]
  ;['A4', 'B4', 'C4'].forEach(ref => {
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D0D8E8' } } }
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  XLSX.writeFile(wb, 'EquipmentTypes_Template.xlsx')
}

async function parseUploadFile(file) {
  const XLSX = await import('xlsx')
  const data = await file.arrayBuffer()
  const wb   = XLSX.read(data)
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Find header row by locating "equipment type"
  let headerRow = -1
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map(c => String(c).trim().toLowerCase())
    if (lower.includes('equipment type')) { headerRow = i; break }
  }
  if (headerRow === -1)
    return { error: 'Could not find a header row with an "Equipment Type" column.' }

  const headers  = rows[headerRow].map(c => String(c).trim().toLowerCase())
  const nameCol  = headers.findIndex(h => h === 'equipment type')
  const catCol   = headers.findIndex(h => h === 'category')

  const items = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row  = rows[i]
    const name = String(row[nameCol] ?? '').trim()
    if (!name) continue
    const catRaw       = catCol >= 0 ? String(row[catCol] ?? '').trim() : ''
    const asset_category = CATEGORIES.includes(catRaw) ? catRaw : null
    items.push({ name, asset_category })
  }
  if (items.length === 0)
    return { error: 'No equipment type rows found in the file.' }
  return { items }
}

/* ── Component ────────────────────────────────────────────────────────────── */
export default function EquipmentTypes() {
  const [types,      setTypes]      = useState([])
  const [search,     setSearch]     = useState('')

  // Single add
  const [name,       setName]       = useState('')
  const [category,   setCategory]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [addError,   setAddError]   = useState('')

  // Bulk upload
  const [showBulk,      setShowBulk]      = useState(false)
  const [bulkFile,      setBulkFile]      = useState(null)
  const [bulkPreview,   setBulkPreview]   = useState(null)   // { items } | { error }
  const [bulkSaving,    setBulkSaving]    = useState(false)
  const [bulkResult,    setBulkResult]    = useState(null)
  const fileInputRef = useRef()

  // Selection (shared for delete + download)
  const [selected,   setSelected]   = useState(new Set())
  const [deleting,   setDeleting]   = useState(false)
  const [downloading,setDownloading] = useState(false)

  // Inline edit
  const [editId,     setEditId]     = useState(null)
  const [editVal,    setEditVal]    = useState('')
  const [editCat,    setEditCat]    = useState('')
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
      await createEquipmentType({ name: name.trim(), asset_category: category || null })
      setName(''); setCategory(''); load()
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add')
    } finally { setSaving(false) }
  }

  /* ── Bulk upload ─────────────────────────────────────────────────────────── */
  const resetBulk = () => {
    setBulkFile(null); setBulkPreview(null); setBulkResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkFile(file); setBulkResult(null)
    const result = await parseUploadFile(file)
    setBulkPreview(result)
  }

  const handleBulkUpload = async () => {
    if (!bulkPreview?.items?.length) return
    setBulkSaving(true); setBulkResult(null)
    try {
      const res = await bulkCreateEquipmentTypes(bulkPreview.items)
      setBulkResult(res.data)
      if (res.data.created > 0) { load(); resetBulk() }
    } catch (err) {
      setBulkResult({ error: err.response?.data?.error || 'Upload failed' })
    } finally { setBulkSaving(false) }
  }

  /* ── Inline edit ─────────────────────────────────────────────────────────── */
  const startEdit   = t => { setEditId(t.id); setEditVal(t.name); setEditCat(t.asset_category || ''); setEditError('') }
  const cancelEdit  = ()  => { setEditId(null); setEditVal(''); setEditCat(''); setEditError('') }
  const saveEdit    = async id => {
    if (!editVal.trim()) return
    setEditSaving(true); setEditError('')
    try {
      await updateEquipmentType(id, { name: editVal.trim(), asset_category: editCat || null })
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
    : types

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
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Equipment Types</h1>
          <p className="text-sm text-gray-500 mt-0.5">{types.length} type{types.length !== 1 ? 's' : ''} defined</p>
        </div>
        <button
          onClick={() => { setShowBulk(v => !v); resetBulk() }}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
        >
          <List size={14} />{showBulk ? 'Single Add' : 'Bulk Upload'}
        </button>
      </div>

      {/* ── Single add ── */}
      {!showBulk && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex gap-3">
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Excavator, Genset, Backhoe Loader…"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex-shrink-0">
              <option value="">— Category —</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors flex-shrink-0">
              <Plus size={15} />{saving ? 'Adding…' : 'Add'}
            </button>
          </div>
          <p className="text-xs text-gray-400">Category (Measurable / Non-Measurable) will auto-fill in the asset register when this type is selected.</p>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
        </form>
      )}

      {/* ── Bulk upload ── */}
      {showBulk && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Bulk Upload Equipment Types</p>

          {/* Step 1 — download template */}
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <span className="w-5 h-5 flex-shrink-0 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold mt-0.5">1</span>
            <div className="flex-1 space-y-2">
              <p className="text-xs font-medium text-gray-700">Download the template, fill in your data, then re-upload.</p>
              <p className="text-xs text-gray-500">Columns: <strong>Sl No</strong>, <strong>Equipment Type</strong> (required), <strong>Category</strong> — must be <em>Measurable</em> or <em>Non-Measurable</em>.</p>
              <button onClick={downloadTemplate}
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
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
              </label>

              {/* Parse preview */}
              {bulkPreview?.error && (
                <p className="text-xs text-red-600">{bulkPreview.error}</p>
              )}
              {bulkPreview?.items && (
                <div className="space-y-2">
                  <p className="text-xs text-green-700 font-medium">{bulkPreview.items.length} row{bulkPreview.items.length !== 1 ? 's' : ''} ready to upload</p>
                  {/* Mini preview table — first 5 rows */}
                  <div className="overflow-x-auto rounded border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100 text-gray-600">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium w-8">#</th>
                          <th className="px-2 py-1 text-left font-medium">Equipment Type</th>
                          <th className="px-2 py-1 text-left font-medium">Category</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bulkPreview.items.slice(0, 5).map((item, i) => (
                          <tr key={i} className="bg-white">
                            <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                            <td className="px-2 py-1 text-gray-800">{item.name}</td>
                            <td className="px-2 py-1">
                              {item.asset_category
                                ? <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                                    item.asset_category === 'Measurable'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-purple-100 text-purple-700'
                                  }`}>{item.asset_category}</span>
                                : <span className="text-gray-400">—</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {bulkPreview.items.length > 5 && (
                    <p className="text-xs text-gray-400">…and {bulkPreview.items.length - 5} more</p>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    <button onClick={handleBulkUpload} disabled={bulkSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors">
                      <Upload size={14} />{bulkSaving ? 'Uploading…' : `Upload ${bulkPreview.items.length} Type${bulkPreview.items.length !== 1 ? 's' : ''}`}
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
            <span className="text-xs font-medium text-gray-500">
              {selectedCount > 0 ? `${selectedCount} selected` : `${filtered.length} type${filtered.length !== 1 ? 's' : ''}${search ? ' found' : ''}`}
            </span>

            <div className="flex items-center gap-2">
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

              {selectedCount > 0 && (
                <button onClick={handleDeleteSelected} disabled={deleting}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors ml-1">
                  <Trash2 size={13} />{deleting ? 'Deleting…' : `Delete ${selectedCount}`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2.5 w-8">
                  <input type="checkbox" checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked }}
                    onChange={toggleAll} className="w-4 h-4 accent-blue-600"
                  />
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500 w-10">#</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Equipment Type</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500 w-44">Category</th>
                <th className="px-4 py-2.5 text-center font-semibold text-gray-500 w-28">Own (Working)</th>
                <th className="px-4 py-2.5 text-center font-semibold text-gray-500 w-28">Hire (Working)</th>
                <th className="px-4 py-2.5 text-center font-semibold text-gray-500 w-28">Total Machines</th>
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                    {search ? 'No types match your search' : 'No equipment types yet'}
                  </td>
                </tr>
              )}

              {filtered.map((t, idx) => (
                <tr key={t.id} className={`transition-colors ${selected.has(t.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)}
                      className="w-4 h-4 accent-blue-600" />
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-right pr-2">{idx + 1}.</td>

                  {editId === t.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input ref={editRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') cancelEdit() }}
                          className="w-full border border-blue-400 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {editError && <p className="text-xs text-red-600 mt-1">{editError}</p>}
                      </td>
                      <td className="px-4 py-2">
                        <select value={editCat} onChange={e => setEditCat(e.target.value)}
                          className="w-full border border-blue-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="">— Category —</option>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td colSpan={3} />
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => saveEdit(t.id)} disabled={editSaving}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors" title="Save (Enter)">
                            <Check size={15} />
                          </button>
                          <button onClick={cancelEdit}
                            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded transition-colors" title="Cancel (Esc)">
                            <X size={15} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-sm text-gray-800 font-medium">{t.name}</td>
                      <td className="px-4 py-2.5">
                        {t.asset_category ? (
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                            t.asset_category === 'Measurable'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}>
                            {t.asset_category}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {parseInt(t.own_count) > 0
                          ? <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">{t.own_count}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {parseInt(t.hire_count) > 0
                          ? <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">{t.hire_count}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {parseInt(t.usage_count) > 0
                          ? <span className="text-xs bg-gray-200 text-gray-700 font-medium px-2 py-0.5 rounded-full">{t.usage_count}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
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
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={4} className="px-4 py-2 text-xs text-gray-400">
                    {filtered.length} of {types.length} type{types.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-2 text-center text-xs font-semibold text-gray-600">
                    {types.reduce((s, t) => s + (parseInt(t.own_count) || 0), 0)}
                  </td>
                  <td className="px-4 py-2 text-center text-xs font-semibold text-gray-600">
                    {types.reduce((s, t) => s + (parseInt(t.hire_count) || 0), 0)}
                  </td>
                  <td className="px-4 py-2 text-center text-xs font-semibold text-gray-600">
                    {types.reduce((s, t) => s + (parseInt(t.usage_count) || 0), 0)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
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
