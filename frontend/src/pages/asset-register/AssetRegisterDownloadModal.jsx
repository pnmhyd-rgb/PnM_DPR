import { useState, useEffect } from 'react'
import { X, Download, Loader2, FileSpreadsheet, FileText, Sheet } from 'lucide-react'
import { getMachines, getProjects, getEquipmentTypes } from '../../lib/api'

const CATEGORIES = [
  { key: 'own_measurable',     label: 'Own — Measurable Assets',     match: m => m.ownership === 'Own' && !!m.reading1_basis },
  { key: 'own_non_measurable', label: 'Own — Non-Measurable Assets', match: m => m.ownership === 'Own' && !m.reading1_basis },
  { key: 'hire',               label: 'Hire Assets',                 match: m => m.ownership === 'Hire' },
]

const COLS = [
  { header: '#',               val: (m, i) => i + 1 },
  { header: 'Project',         val: m => m.project_code || '' },
  { header: 'SL No',           val: m => m.slno || '' },
  { header: 'Ownership',       val: m => m.ownership || '' },
  { header: 'Asset Type',      val: m => m.asset_type || '' },
  { header: 'Equipment Type',  val: m => m.eq_type || '' },
  { header: 'Manufacturer',    val: m => m.manufacturer || '' },
  { header: 'Model',           val: m => m.model || '' },
  { header: 'Capacity',        val: m => m.capacity || '' },
  { header: 'UOM',             val: m => m.uom || '' },
  { header: 'Reg No',          val: m => m.reg_no || '' },
  { header: 'Chassis No',      val: m => m.chassis_no || '' },
  { header: 'Vendor',          val: m => m.vendor || '' },
  { header: 'Fuel Type',       val: m => m.fuel_type || '' },
  { header: 'Shift Type',      val: m => m.shift_type || '' },
  { header: 'Meter Basis',     val: m => m.reading1_basis || '' },
  { header: 'Dual Meter',      val: m => m.reading2_basis || '' },
  { header: 'Fuel Min',        val: m => m.fuel_min ?? '' },
  { header: 'Fuel Max',        val: m => m.fuel_max ?? '' },
  { header: 'Planned Hrs/Day', val: m => m.planned_hours ?? '' },
  { header: 'Purchase Date',   val: m => m.date_of_purchase ? new Date(m.date_of_purchase).toLocaleDateString('en-IN') : '' },
  { header: 'PO Number',       val: m => m.po_number || '' },
  { header: 'Price (INR)',     val: m => m.price || '' },
]

function buildFilename(proj, selectedCount, categories, ext) {
  const catLabel  = selectedCount === 3 ? 'All' : CATEGORIES.filter(c => categories[c.key]).map(c => c.key).join('+')
  const projLabel = proj ? proj.code : 'AllProjects'
  return `AssetRegister_${projLabel}_${catLabel}_${new Date().toISOString().slice(0, 10)}.${ext}`
}

function downloadCSV(rows, filename) {
  const escape = v => { const s = String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s }
  const csv  = [COLS.map(c => c.header).join(','), ...rows.map((m, i) => COLS.map(c => escape(c.val(m, i))).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

async function downloadExcel(rows, filename, projName, catLabels) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()

  // Title rows then data
  const titleRow   = [`Asset Register — ${projName}`]
  const catRow     = [`Categories: ${catLabels}`]
  const dateRow    = [`Generated: ${new Date().toLocaleString('en-IN')}`]
  const blankRow   = []
  const headerRow  = COLS.map(c => c.header)
  const dataRows   = rows.map((m, i) => COLS.map(c => c.val(m, i)))

  const wsData = [titleRow, catRow, dateRow, blankRow, headerRow, ...dataRows]
  const ws     = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws['!cols'] = COLS.map((c, ci) => {
    const max = Math.max(c.header.length, ...rows.map((m, ri) => String(c.val(m, ri)).length))
    return { wch: ci === 0 ? 5 : Math.min(Math.max(max + 2, 10), 40) }
  })

  // Style header row (row index 4, 0-based)
  const headerRowIdx = 4
  COLS.forEach((_, ci) => {
    const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c: ci })
    if (!ws[cellRef]) return
    ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: '1E3A5F' } }, font: { bold: true, color: { rgb: 'FFFFFF' } } }
  })

  XLSX.utils.book_append_sheet(wb, ws, 'Asset Register')
  XLSX.writeFile(wb, filename)
}

async function downloadPDF(rows, filename, projName, catLabels) {
  const { jsPDF }    = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })

  // Plain text header — no dark background
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('RVR Projects Pvt Ltd — Asset Register', 14, 10)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Project: ${projName}   |   Categories: ${catLabels}   |   Generated: ${new Date().toLocaleString('en-IN')}`, 14, 17)

  autoTable(doc, {
    startY: 22,
    head: [COLS.map(c => c.header)],
    body: rows.map((m, i) => COLS.map(c => String(c.val(m, i)))),
    styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 0: { cellWidth: 8 } },
    margin: { top: 22, left: 8, right: 8 },
    didDrawPage: (data) => {
      // Page number footer
      const pageCount = doc.internal.getNumberOfPages()
      doc.setFontSize(7)
      doc.setTextColor(150)
      doc.text(
        `Page ${data.pageNumber}`,
        doc.internal.pageSize.getWidth() - 20,
        doc.internal.pageSize.getHeight() - 6
      )
    }
  })

  doc.save(filename)
}

export default function AssetRegisterDownloadModal({ onClose, defaultProject = '' }) {
  const [projects,    setProjects]    = useState([])
  const [projectId,    setProjectId]   = useState(defaultProject)
  const [categories,   setCategories]  = useState({ own_measurable: true, own_non_measurable: true, hire: true })
  const [eqTypeFilter, setEqTypeFilter] = useState('')   // '' = all types
  const [eqTypes,      setEqTypes]     = useState([])
  const [format,       setFormat]      = useState('excel')
  const [downloading,  setDownloading] = useState(false)
  const [error,        setError]       = useState('')

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data)).catch(() => {})
    getEquipmentTypes().then(r => setEqTypes(r.data.data)).catch(() => {})
  }, [])

  const toggleCat     = key => setCategories(prev => ({ ...prev, [key]: !prev[key] }))
  const selectedCount = Object.values(categories).filter(Boolean).length

  const handleDownload = async () => {
    if (selectedCount === 0) { setError('Select at least one category.'); return }
    setError(''); setDownloading(true)
    try {
      const proj     = projects.find(p => String(p.id) === String(projectId))
      const res      = await getMachines(proj ? { project_code: proj.code } : {})
      const matchers = CATEGORIES.filter(c => categories[c.key]).map(c => c.match)
      let   filtered = res.data.data.filter(m => matchers.some(fn => fn(m)))
      if (eqTypeFilter) filtered = filtered.filter(m => m.eq_type === eqTypeFilter)

      if (filtered.length === 0) { setError('No assets found for the selected filters.'); setDownloading(false); return }

      const projName  = proj ? `${proj.name}${proj.code ? ` (${proj.code})` : ''}` : 'All Projects'
      const eqLabel   = eqTypeFilter ? eqTypeFilter : 'All Equipment Types'
      const catLabels = `${selectedCount === 3 ? 'All Categories' : CATEGORIES.filter(c => categories[c.key]).map(c => c.label).join(', ')} | ${eqLabel}`

      // Build filename with eq type slug
      const eqSlug   = eqTypeFilter ? `_${eqTypeFilter.replace(/\s+/g, '-')}` : ''
      const ext      = format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv'
      const catLabel = selectedCount === 3 ? 'All' : CATEGORIES.filter(c => categories[c.key]).map(c => c.key).join('+')
      const projLabel = proj ? proj.code : 'AllProjects'
      const filename  = `AssetRegister_${projLabel}_${catLabel}${eqSlug}_${new Date().toISOString().slice(0,10)}.${ext}`

      if (format === 'csv') {
        downloadCSV(filtered, filename)
      } else if (format === 'excel') {
        await downloadExcel(filtered, filename, projName, catLabels)
      } else {
        await downloadPDF(filtered, filename, projName, catLabels)
      }

      onClose()
    } catch (e) {
      console.error(e)
      setError('Failed to generate report. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const FORMAT_OPTS = [
    { key: 'excel', label: 'Excel (.xlsx)', icon: FileSpreadsheet, color: 'text-green-700 border-green-400 bg-green-50' },
    { key: 'pdf',   label: 'PDF (.pdf)',    icon: FileText,        color: 'text-red-700 border-red-400 bg-red-50' },
    { key: 'csv',   label: 'CSV (.csv)',    icon: Sheet,           color: 'text-blue-700 border-blue-400 bg-blue-50' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Download Asset Register</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Project */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
            </select>
          </div>

          {/* Categories */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Categories</label>
            <div className="space-y-2">
              {CATEGORIES.map(cat => (
                <label key={cat.key} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="checkbox" checked={categories[cat.key]} onChange={() => toggleCat(cat.key)}
                    className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                  <span className="text-sm text-gray-800">{cat.label}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 flex gap-3">
              <button onClick={() => setCategories({ own_measurable: true, own_non_measurable: true, hire: true })}
                className="text-xs text-blue-600 hover:underline">Select all</button>
              <button onClick={() => setCategories({ own_measurable: false, own_non_measurable: false, hire: false })}
                className="text-xs text-gray-400 hover:underline">Clear</button>
            </div>
          </div>

          {/* Equipment Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Equipment Type</label>
            <select value={eqTypeFilter} onChange={e => setEqTypeFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Equipment Types</option>
              {eqTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {FORMAT_OPTS.map(f => {
                const Icon = f.icon
                return (
                  <button key={f.key} onClick={() => setFormat(f.key)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-xs font-medium ${
                      format === f.key ? f.color + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    <Icon size={20} />
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
          <button onClick={handleDownload} disabled={downloading || selectedCount === 0}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {downloading ? 'Preparing…' : `Download ${format.toUpperCase()}`}
          </button>
          <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}
