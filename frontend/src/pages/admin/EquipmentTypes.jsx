import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getEquipmentTypes, createEquipmentType, bulkCreateEquipmentTypes,
  updateEquipmentType, deleteEquipmentType,
  getFuelTypeOptions, createFuelTypeOption, deleteFuelTypeOption,
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import {
  Plus, Trash2, Pencil, Check, X, Search, List,
  AlertTriangle, FileSpreadsheet, FileText, Download, Upload, Fuel, Settings2,
  LayoutList, FolderTree, ChevronRight, CheckCircle2,
} from 'lucide-react'

const CATEGORIES   = ['Measurable', 'Non-Measurable']

/* ── Unique sorted list helpers ───────────────────────────────────────────── */
function uniqueSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort()
}

/* ── Export helpers ───────────────────────────────────────────────────────── */
const COLS = [
  { header: 'Sl No',           val: (t, i) => i + 1 },
  { header: 'Asset Group',     val: t => t.asset_group || '—' },
  { header: 'Asset Category',  val: t => t.asset_cat   || '—' },
  { header: 'Asset Name',      val: t => t.name },
  { header: 'Measurability',   val: t => t.asset_category || '—' },
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
  const totalsRow = ['', '', '', 'GRAND TOTAL', '', totalOwn, totalHire, totalAll]

  const ws = XLSX.utils.aoa_to_sheet([
    ['Asset Names (Equipment Types)'],
    [`Generated: ${new Date().toLocaleString('en-IN')}`],
    [],
    COLS.map(c => c.header),
    ...rows.map((t, i) => COLS.map(c => c.val(t, i))),
    [],
    totalsRow,
  ])
  ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 32 }, { wch: 36 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Asset Names')
  XLSX.writeFile(wb, `AssetNames_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function exportPDF(rows) {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const totalOwn  = rows.reduce((s, t) => s + (parseInt(t.own_count)   || 0), 0)
  const totalHire = rows.reduce((s, t) => s + (parseInt(t.hire_count)  || 0), 0)
  const totalAll  = rows.reduce((s, t) => s + (parseInt(t.usage_count) || 0), 0)

  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('Asset Names (Equipment Types)', 14, 12)
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
      ['', '', '', 'GRAND TOTAL', '', String(totalOwn), String(totalHire), String(totalAll)],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [248, 248, 248], textColor: 0, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: { cellWidth: 10 },
      4: { cellWidth: 24 },
      5: { cellWidth: 22, halign: 'center' },
      6: { cellWidth: 22, halign: 'center' },
      7: { cellWidth: 22, halign: 'center' },
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
  doc.save(`AssetNames_${new Date().toISOString().slice(0, 10)}.pdf`)
}

/* ── Bulk upload helpers ──────────────────────────────────────────────────── */
async function downloadTemplate() {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    ['Asset Names Bulk Upload Template'],
    ['Fill in Asset Group, Asset Category, Asset Name (required) and Measurability. Do not edit the header row (row 4).'],
    [],
    ['Sl No', 'Asset Group', 'Asset Category', 'Asset Name', 'Measurability'],
    [1, 'Earthmoving Equipment', 'Excavation Equipment', 'Excavator', 'Measurable'],
    [2, 'Air, Power & Pump Equipment', 'Power Equipment', 'Diesel Generator', 'Measurable'],
    [3, 'Industrial Equipment', 'Steel Processing Equipment', 'Bar Bending Machine', 'Non-Measurable'],
  ])
  ws['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 32 }, { wch: 34 }, { wch: 20 }]
  ;['A4', 'B4', 'C4', 'D4', 'E4'].forEach(ref => {
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D0D8E8' } } }
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  XLSX.writeFile(wb, 'AssetNames_Template.xlsx')
}

async function parseUploadFile(file) {
  const XLSX = await import('xlsx')
  const data = await file.arrayBuffer()
  const wb   = XLSX.read(data)
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  let headerRow = -1
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map(c => String(c).trim().toLowerCase())
    if (lower.includes('asset name') || lower.includes('equipment type')) { headerRow = i; break }
  }
  if (headerRow === -1)
    return { error: 'Could not find a header row with an "Asset Name" column.' }

  const headers   = rows[headerRow].map(c => String(c).trim().toLowerCase())
  const groupCol  = headers.findIndex(h => h === 'asset group')
  const catCol    = headers.findIndex(h => h === 'asset category')
  const nameCol   = headers.findIndex(h => h === 'asset name' || h === 'equipment type')
  const measCol   = headers.findIndex(h => h === 'measurability' || h === 'category')

  const items = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row  = rows[i]
    const name = String(row[nameCol] ?? '').trim()
    if (!name) continue
    const catRaw       = measCol >= 0 ? String(row[measCol] ?? '').trim() : ''
    const asset_category = CATEGORIES.includes(catRaw) ? catRaw : null
    items.push({
      name,
      asset_group:    groupCol >= 0 ? String(row[groupCol] ?? '').trim() || null : null,
      asset_cat:      catCol   >= 0 ? String(row[catCol]   ?? '').trim() || null : null,
      asset_category,
    })
  }
  if (items.length === 0)
    return { error: 'No asset name rows found in the file.' }
  return { items }
}

/* ── Component ────────────────────────────────────────────────────────────── */
/* ── Category View (grouped by asset_cat) ────────────────────────────────── */
function CategoryView({ types, navigate }) {
  // Group by asset_cat (fall back to asset_group if no cat)
  const catMap = {}
  for (const t of types) {
    const cat = t.asset_cat || t.asset_group || 'Uncategorised'
    if (!catMap[cat]) catMap[cat] = []
    catMap[cat].push(t)
  }
  const cats = Object.keys(catMap).sort()

  if (cats.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
        No asset types defined yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {cats.map(cat => (
        <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Category header */}
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
            <button
              onClick={() => navigate(`/admin/asset-category/${encodeURIComponent(cat)}`)}
              className="flex items-center gap-2 text-left hover:text-blue-700 transition-colors group"
            >
              <FolderTree size={15} className="text-slate-500 group-hover:text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-700 group-hover:text-blue-700">{cat}</h3>
              <span className="ml-1 text-xs text-slate-400 font-normal">
                {catMap[cat].length} asset type{catMap[cat].length !== 1 ? 's' : ''}
              </span>
              <ChevronRight size={12} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
            </button>
            <span className="text-xs text-slate-400">
              {catMap[cat].reduce((s, t) => s + (parseInt(t.usage_count) || 0), 0)} total machines
            </span>
          </div>

          {/* Asset types in this category */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/40">
                <th className="text-left text-xs font-semibold text-gray-400 px-5 py-2">Asset Name</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2">Measurability</th>
                <th className="text-center text-xs font-semibold text-gray-400 px-4 py-2">Own</th>
                <th className="text-center text-xs font-semibold text-gray-400 px-4 py-2">Hire</th>
                <th className="text-center text-xs font-semibold text-gray-400 px-4 py-2">Total</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2">Config</th>
                <th className="px-4 py-2 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {catMap[cat].map(t => (
                <tr key={t.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-5 py-2.5 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-2.5">
                    {t.asset_category ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        t.asset_category === 'Measurable'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>{t.asset_category}</span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {parseInt(t.own_count) > 0
                      ? <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">{t.own_count}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {parseInt(t.hire_count) > 0
                      ? <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">{t.hire_count}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {parseInt(t.usage_count) > 0
                      ? <span className="text-xs bg-gray-200 text-gray-700 font-medium px-2 py-0.5 rounded-full">{t.usage_count}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {t.has_config
                      ? <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle2 size={12} />Configured</span>
                      : <span className="text-xs text-gray-300">Not configured</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => navigate(`/admin/asset-type-configs/${t.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors ml-auto"
                    >
                      <Settings2 size={12} />Configure
                      <ChevronRight size={11} className="opacity-50" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

/* ── Main Component ───────────────────────────────────────────────────────── */
export default function EquipmentTypes() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()

  const [viewMode,   setViewMode]   = useState('list') // 'list' | 'category'
  const [types,      setTypes]      = useState([])
  const [search,     setSearch]     = useState('')
  const [loadError,  setLoadError]  = useState('')

  // Fuel type options (global list)
  const [fuelOptions,    setFuelOptions]    = useState([])
  const [newFuelOpt,     setNewFuelOpt]     = useState('')
  const [addingFuel,     setAddingFuel]     = useState(false)
  const [fuelOptError,   setFuelOptError]   = useState('')

  // Single add
  const [name,       setName]       = useState('')
  const [assetGroup, setAssetGroup] = useState('')
  const [assetCat,   setAssetCat]   = useState('')
  const [category,   setCategory]   = useState('')
  const [fuelType,   setFuelType]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [addError,   setAddError]   = useState('')

  // Bulk upload
  const [showBulk,      setShowBulk]      = useState(false)
  const [bulkFile,      setBulkFile]      = useState(null)
  const [bulkPreview,   setBulkPreview]   = useState(null)
  const [bulkSaving,    setBulkSaving]    = useState(false)
  const [bulkResult,    setBulkResult]    = useState(null)
  const fileInputRef = useRef()

  // Selection
  const [selected,   setSelected]   = useState(new Set())
  const [deleting,   setDeleting]   = useState(false)
  const [downloading,setDownloading] = useState(false)

  // Inline edit
  const [editId,       setEditId]       = useState(null)
  const [editVal,      setEditVal]      = useState('')
  const [editGroup,    setEditGroup]    = useState('')
  const [editCatVal,   setEditCatVal]   = useState('')
  const [editCat,      setEditCat]      = useState('')
  const [editFuelType, setEditFuelType] = useState('')
  const [editSaving,   setEditSaving]   = useState(false)
  const [editError,    setEditError]    = useState('')
  const editRef = useRef()

  // Force-delete dialog
  const [forceConfirm, setForceConfirm] = useState(null)

  const loadFuelOptions = () =>
    getFuelTypeOptions().then(r => setFuelOptions(r.data.data)).catch(() => {})

  const load = () => {
    setLoadError('')
    getEquipmentTypes()
      .then(r => { setTypes(r.data.data); setSelected(new Set()) })
      .catch(err => setLoadError(err.response?.data?.error || err.message || 'Failed to load asset names'))
  }
  useEffect(() => { load(); loadFuelOptions() }, [])
  useEffect(() => { if (editId && editRef.current) editRef.current.focus() }, [editId])

  const filtered = types.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.asset_group || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.asset_cat   || '').toLowerCase().includes(search.toLowerCase())
  )

  // Unique groups / cats derived from all loaded types (for datalist suggestions)
  const allGroups = uniqueSorted(types.map(t => t.asset_group))
  const allCats   = uniqueSorted(types.map(t => t.asset_cat))

  /* ── Fuel type options management ───────────────────────────────────────── */
  const handleAddFuelOpt = async () => {
    if (!newFuelOpt.trim()) return
    setAddingFuel(true); setFuelOptError('')
    try {
      await createFuelTypeOption({ name: newFuelOpt.trim() })
      setNewFuelOpt('')
      loadFuelOptions()
    } catch (err) {
      setFuelOptError(err.response?.data?.error || 'Failed to add')
    } finally { setAddingFuel(false) }
  }

  const handleDeleteFuelOpt = async (id) => {
    try {
      await deleteFuelTypeOption(id)
      loadFuelOptions()
    } catch (err) {
      setFuelOptError(err.response?.data?.error || 'Failed to delete')
    }
  }

  /* ── Add ─────────────────────────────────────────────────────────────────── */
  const handleAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setAddError('')
    try {
      await createEquipmentType({
        name: name.trim(),
        asset_group:    assetGroup.trim() || null,
        asset_cat:      assetCat.trim()   || null,
        asset_category: category   || null,
        fuel_type:      fuelType   || null,
      })
      setName(''); setAssetGroup(''); setAssetCat(''); setCategory(''); setFuelType('')
      load()
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
  const startEdit   = t => {
    setEditId(t.id); setEditVal(t.name)
    setEditGroup(t.asset_group || ''); setEditCatVal(t.asset_cat || '')
    setEditCat(t.asset_category || ''); setEditFuelType(t.fuel_type || '')
    setEditError('')
  }
  const cancelEdit  = () => {
    setEditId(null); setEditVal(''); setEditGroup('')
    setEditCatVal(''); setEditCat(''); setEditFuelType(''); setEditError('')
  }
  const saveEdit    = async id => {
    if (!editVal.trim()) return
    setEditSaving(true); setEditError('')
    try {
      await updateEquipmentType(id, {
        name:           editVal.trim(),
        asset_group:    editGroup.trim()  || null,
        asset_cat:      editCatVal.trim() || null,
        asset_category: editCat      || null,
        fuel_type:      editFuelType || null,
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
      : `Delete ${ids.length} asset name${ids.length > 1 ? 's' : ''}?`
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

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Asset Category</h1>
          <p className="text-sm text-gray-500 mt-0.5">{types.length} asset type{types.length !== 1 ? 's' : ''} — grouped by Asset Category</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode('category')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'category'
                  ? 'bg-blue-700 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FolderTree size={13} />Category
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
                viewMode === 'list'
                  ? 'bg-blue-700 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <LayoutList size={13} />List
            </button>
          </div>
          <button
            onClick={() => { setShowBulk(v => !v); resetBulk() }}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            <List size={14} />{showBulk ? 'Single Add' : 'Bulk Upload'}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          Failed to load asset names: {loadError}
        </div>
      )}

      {/* ── Fuel Type Options Manager ── */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Fuel size={14} className="text-amber-600" />
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Fuel Type Options</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fuelOptions.map(opt => (
              <span key={opt.id} className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-2.5 py-1 rounded-full">
                {opt.name}
                <button
                  onClick={() => handleDeleteFuelOpt(opt.id)}
                  className="ml-0.5 text-amber-500 hover:text-red-600 transition-colors"
                  title={`Remove ${opt.name}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newFuelOpt}
                onChange={e => setNewFuelOpt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddFuelOpt()}
                placeholder="Add option…"
                className="border border-dashed border-gray-300 rounded-full px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 w-28"
              />
              <button
                onClick={handleAddFuelOpt}
                disabled={addingFuel || !newFuelOpt.trim()}
                className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs rounded-full transition-colors"
              >
                <Plus size={11} />{addingFuel ? '…' : 'Add'}
              </button>
            </div>
          </div>
          {fuelOptError && <p className="text-xs text-red-600 mt-1">{fuelOptError}</p>}
        </div>
      )}

      {/* ── Category View ── */}
      {viewMode === 'category' && <CategoryView types={types} navigate={navigate} />}

      {/* ── List View below ── */}
      {viewMode === 'list' && <>

      {/* ── Single add ── */}
      {!showBulk && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Asset Name</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Asset Group</label>
              <input type="text" value={assetGroup} onChange={e => setAssetGroup(e.target.value)}
                placeholder="e.g. Earthmoving Equipment"
                list="add-groups-list"
                className={inp + ' w-full'}
              />
              <datalist id="add-groups-list">
                {allGroups.map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Asset Category</label>
              <input type="text" value={assetCat} onChange={e => setAssetCat(e.target.value)}
                placeholder="e.g. Excavation Equipment"
                list="add-cats-list"
                className={inp + ' w-full'}
              />
              <datalist id="add-cats-list">
                {allCats.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div className="flex gap-3">
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Asset Name * — e.g. Excavator, Diesel Generator…"
              className={inp + ' flex-1'}
              required
            />
            <select value={category} onChange={e => setCategory(e.target.value)}
              className={inp + ' flex-shrink-0 w-44'}>
              <option value="">— Measurability —</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={fuelType} onChange={e => setFuelType(e.target.value)}
              className={inp + ' flex-shrink-0 w-36'}>
              <option value="">— Fuel Type —</option>
              {fuelOptions.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
            </select>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors flex-shrink-0">
              <Plus size={15} />{saving ? 'Adding…' : 'Add'}
            </button>
          </div>
          <p className="text-xs text-gray-400">Measurability and Fuel Type auto-fill in the asset register when this name is selected.</p>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
        </form>
      )}

      {/* ── Bulk upload ── */}
      {showBulk && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Bulk Upload Asset Names</p>

          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <span className="w-5 h-5 flex-shrink-0 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold mt-0.5">1</span>
            <div className="flex-1 space-y-2">
              <p className="text-xs font-medium text-gray-700">Download the template, fill in your data, then re-upload.</p>
              <p className="text-xs text-gray-500">Columns: <strong>Asset Group</strong>, <strong>Asset Category</strong>, <strong>Asset Name</strong> (required), <strong>Measurability</strong> — must be <em>Measurable</em> or <em>Non-Measurable</em>.</p>
              <button onClick={downloadTemplate}
                className="flex items-center gap-2 px-3 py-1.5 border border-blue-400 text-blue-700 bg-white hover:bg-blue-50 text-xs font-medium rounded-lg transition-colors">
                <Download size={13} />Download Template (.xlsx)
              </button>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <span className="w-5 h-5 flex-shrink-0 rounded-full bg-gray-500 text-white text-xs flex items-center justify-center font-bold mt-0.5">2</span>
            <div className="flex-1 space-y-2">
              <p className="text-xs font-medium text-gray-700">Upload the filled template</p>
              <label className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 text-xs font-medium rounded-lg transition-colors cursor-pointer w-fit">
                <Upload size={13} />
                {bulkFile ? bulkFile.name : 'Choose .xlsx file…'}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
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
                          <th className="px-2 py-1 text-left font-medium w-8">#</th>
                          <th className="px-2 py-1 text-left font-medium">Asset Group</th>
                          <th className="px-2 py-1 text-left font-medium">Asset Category</th>
                          <th className="px-2 py-1 text-left font-medium">Asset Name</th>
                          <th className="px-2 py-1 text-left font-medium">Measurability</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bulkPreview.items.slice(0, 5).map((item, i) => (
                          <tr key={i} className="bg-white">
                            <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                            <td className="px-2 py-1 text-gray-600">{item.asset_group || '—'}</td>
                            <td className="px-2 py-1 text-gray-600">{item.asset_cat   || '—'}</td>
                            <td className="px-2 py-1 text-gray-800 font-medium">{item.name}</td>
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
                      <Upload size={14} />{bulkSaving ? 'Uploading…' : `Upload ${bulkPreview.items.length} Name${bulkPreview.items.length !== 1 ? 's' : ''}`}
                    </button>
                    <button onClick={resetBulk} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Clear</button>
                  </div>
                </div>
              )}
            </div>
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
              placeholder="Search by asset name, group or category…"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500">
              {selectedCount > 0 ? `${selectedCount} selected` : `${filtered.length} asset name${filtered.length !== 1 ? 's' : ''}${search ? ' found' : ''}`}
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
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Asset Group</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Asset Category</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Asset Name</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500 w-36">Measurability</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500 w-28">Fuel Type</th>
                <th className="px-4 py-2.5 text-center font-semibold text-gray-500 w-24">Own</th>
                <th className="px-4 py-2.5 text-center font-semibold text-gray-500 w-24">Hire</th>
                <th className="px-4 py-2.5 text-center font-semibold text-gray-500 w-24">Total</th>
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-400">
                    {search ? 'No asset names match your search' : 'No asset names yet'}
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
                        <input value={editGroup} onChange={e => setEditGroup(e.target.value)}
                          list="edit-groups-list"
                          placeholder="Asset Group"
                          className="w-full border border-blue-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <datalist id="edit-groups-list">
                          {allGroups.map(g => <option key={g} value={g} />)}
                        </datalist>
                      </td>
                      <td className="px-4 py-2">
                        <input value={editCatVal} onChange={e => setEditCatVal(e.target.value)}
                          list="edit-cats-list"
                          placeholder="Asset Category"
                          className="w-full border border-blue-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <datalist id="edit-cats-list">
                          {allCats.map(c => <option key={c} value={c} />)}
                        </datalist>
                      </td>
                      <td className="px-4 py-2">
                        <input ref={editRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') cancelEdit() }}
                          placeholder="Asset Name *"
                          className="w-full border border-blue-400 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {editError && <p className="text-xs text-red-600 mt-1">{editError}</p>}
                      </td>
                      <td className="px-4 py-2">
                        <select value={editCat} onChange={e => setEditCat(e.target.value)}
                          className="w-full border border-blue-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="">— Measurability —</option>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select value={editFuelType} onChange={e => setEditFuelType(e.target.value)}
                          className="w-full border border-blue-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="">— Fuel Type —</option>
                          {fuelOptions.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
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
                      <td className="px-4 py-2.5 text-gray-600">
                        {t.asset_group
                          ? <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs font-medium">{t.asset_group}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {t.asset_cat
                          ? <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs">{t.asset_cat}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => navigate(`/admin/asset-type-configs/${t.id}`)}
                          className="group flex items-center gap-1 text-sm font-medium text-gray-800 hover:text-blue-700 transition-colors"
                          title="Configure this asset type"
                        >
                          {t.name}
                          <ChevronRight size={12} className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                        </button>
                      </td>
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
                      <td className="px-4 py-2.5">
                        {t.fuel_type
                          ? <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">{t.fuel_type}</span>
                          : <span className="text-gray-300">—</span>}
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
                  <td colSpan={7} className="px-4 py-2 text-xs text-gray-400">
                    {filtered.length} of {types.length} asset name{types.length !== 1 ? 's' : ''}
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

      </>}

      {/* ── Force-delete dialog ── */}
      {forceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-semibold text-gray-900 text-sm">Asset name is in use</p>
                <p className="text-sm text-gray-600 mt-1">
                  <strong>"{forceConfirm.name}"</strong> is assigned to{' '}
                  <strong>{forceConfirm.count} active machine{forceConfirm.count > 1 ? 's' : ''}</strong>.
                  Deleting it won't remove those machines — their type field will just no longer match a known name.
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
