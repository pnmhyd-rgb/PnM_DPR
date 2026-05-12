import { useState, useRef } from 'react'
import { X, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'

const ALL_COLS = [
  // Basic Info
  { key: 'idx',          h: '#',               group: 'Basic Info',  v: (m, i) => i + 1 },
  { key: 'project',      h: 'Project',          group: 'Basic Info',  v: m => m.project_code || '' },
  { key: 'slno',         h: 'SL#',              group: 'Basic Info',  v: m => m.slno || '' },
  { key: 'asset_code',   h: 'Asset Code',       group: 'Basic Info',  v: m => m.asset_code || '' },
  { key: 'eq_type',      h: 'Equipment Type',   group: 'Basic Info',  v: m => m.eq_type || '' },
  { key: 'category',     h: 'Category',         group: 'Basic Info',  v: m => m.asset_type || '' },
  { key: 'status',       h: 'Status',           group: 'Basic Info',  v: m => m.active ? 'Active' : (m.deactivation_reason || 'Inactive') },
  // Ownership & Hire
  { key: 'ownership',    h: 'Own/Hire',         group: 'Ownership',   v: m => m.ownership || '' },
  { key: 'reg_no',       h: 'Reg No',           group: 'Ownership',   v: m => m.reg_no || '' },
  { key: 'vendor',       h: 'Vendor',           group: 'Ownership',   v: m => m.vendor || '' },
  { key: 'rate',         h: 'Hire/Day (₹)',     group: 'Ownership',   v: m => m.rate || '' },
  { key: 'rate_monthly', h: 'Hire/Month (₹)',   group: 'Ownership',   v: m => m.rate_monthly || '' },
  // Technical
  { key: 'shift',        h: 'Shift',            group: 'Technical',   v: m => m.shift_type || '' },
  { key: 'basis',        h: 'Reading Basis',    group: 'Technical',   v: m => m.reading1_basis || '' },
  { key: 'fuel_min',     h: 'Fuel Min (L/hr)',  group: 'Technical',   v: m => m.fuel_min ?? '' },
  { key: 'fuel_max',     h: 'Fuel Max (L/hr)',  group: 'Technical',   v: m => m.fuel_max ?? '' },
  { key: 'fuel_min_km',  h: 'Fuel Min (km/L)',  group: 'Technical',   v: m => m.fuel_min_km ?? '' },
  { key: 'fuel_max_km',  h: 'Fuel Max (km/L)',  group: 'Technical',   v: m => m.fuel_max_km ?? '' },
  { key: 'planned',      h: 'Planned Hrs/Day',  group: 'Technical',   v: m => m.planned_hours ?? '' },
]

const GROUPS = ['Basic Info', 'Ownership', 'Technical']

function pageSettings(colCount) {
  if (colCount <= 7)  return { orientation: 'portrait',  format: 'a4', label: 'A4 Portrait' }
  if (colCount <= 13) return { orientation: 'landscape', format: 'a4', label: 'A4 Landscape' }
  return               { orientation: 'landscape', format: 'a3', label: 'A3 Landscape' }
}

export default function MachineDownloadModal({ displayed, filterProj, onClose }) {
  const [checked,     setChecked]     = useState(() => new Set(ALL_COLS.map(c => c.key)))
  const [format,      setFormat]      = useState('excel')
  const [downloading, setDownloading] = useState(false)
  const groupRefs = useRef({})

  const toggleCol = key => setChecked(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })

  const toggleGroup = group => {
    const gkeys = ALL_COLS.filter(c => c.group === group).map(c => c.key)
    const allOn = gkeys.every(k => checked.has(k))
    setChecked(prev => {
      const n = new Set(prev)
      gkeys.forEach(k => allOn ? n.delete(k) : n.add(k))
      return n
    })
  }

  const activeCols = ALL_COLS.filter(c => checked.has(c.key))
  const pg         = pageSettings(activeCols.length)

  const filename = ext => {
    const proj = filterProj || 'AllProjects'
    return `MachineRegistry_${proj}_${new Date().toISOString().slice(0, 10)}.${ext}`
  }

  const handleDownload = async () => {
    if (!activeCols.length || !displayed.length) return
    setDownloading(true)
    try {
      const proj = filterProj ? `Project: ${filterProj}` : 'All Projects'

      if (format === 'excel') {
        const XLSX  = await import('xlsx')
        const wb    = XLSX.utils.book_new()
        const wsData = [
          [`Machine Registry — ${proj}`],
          [`Generated: ${new Date().toLocaleString('en-IN')}   |   ${displayed.length} machine${displayed.length !== 1 ? 's' : ''}`],
          [],
          activeCols.map(c => c.h),
          ...displayed.map((m, i) => activeCols.map(c => c.v(m, i))),
        ]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        ws['!cols'] = activeCols.map((c, ci) => {
          const max = Math.max(c.h.length, ...displayed.map((m, i) => String(c.v(m, i)).length))
          return { wch: ci === 0 ? 5 : Math.min(Math.max(max + 2, 10), 36) }
        })
        activeCols.forEach((_, ci) => {
          const ref = XLSX.utils.encode_cell({ r: 3, c: ci })
          if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E8ECF0' } } }
        })
        XLSX.utils.book_append_sheet(wb, ws, 'Machine Registry')
        XLSX.writeFile(wb, filename('xlsx'))

      } else {
        const { jsPDF }           = await import('jspdf')
        const { default: autoTable } = await import('jspdf-autotable')
        const doc = new jsPDF({ orientation: pg.orientation, unit: 'mm', format: pg.format })
        doc.setFontSize(13); doc.setFont('helvetica', 'bold')
        doc.text('RVR Projects — Machine Registry', 14, 10)
        doc.setFontSize(8); doc.setFont('helvetica', 'normal')
        doc.text(
          `${proj}   |   ${displayed.length} machine${displayed.length !== 1 ? 's' : ''}   |   Generated: ${new Date().toLocaleString('en-IN')}`,
          14, 17
        )
        autoTable(doc, {
          startY: 22,
          head:   [activeCols.map(c => c.h)],
          body:   displayed.map((m, i) => activeCols.map(c => String(c.v(m, i)))),
          styles:           { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
          headStyles:       { fillColor: [248, 248, 248], textColor: 0, fontStyle: 'bold', fontSize: 7.5 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles:     { 0: { cellWidth: 8 } },
          margin:           { top: 22, left: 8, right: 8 },
          didDrawPage: data => {
            doc.setFontSize(7); doc.setTextColor(150)
            doc.text(
              `Page ${data.pageNumber}`,
              doc.internal.pageSize.getWidth() - 20,
              doc.internal.pageSize.getHeight() - 6
            )
            doc.setTextColor(0)
          },
        })
        doc.save(filename('pdf'))
      }
      onClose()
    } finally { setDownloading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Download Machine Registry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Column selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Columns to include</span>
              <div className="flex gap-3">
                <button onClick={() => setChecked(new Set(ALL_COLS.map(c => c.key)))}
                  className="text-xs text-blue-600 hover:underline">Select all</button>
                <button onClick={() => setChecked(new Set())}
                  className="text-xs text-gray-400 hover:underline">Clear</button>
              </div>
            </div>

            <div className="space-y-2">
              {GROUPS.map(group => {
                const gCols  = ALL_COLS.filter(c => c.group === group)
                const onCount = gCols.filter(c => checked.has(c.key)).length
                const allOn  = onCount === gCols.length
                const someOn = onCount > 0 && !allOn
                return (
                  <div key={group} className="border border-gray-200 rounded-lg overflow-hidden">
                    <label className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 cursor-pointer select-none">
                      <input type="checkbox" checked={allOn}
                        ref={el => { if (el) el.indeterminate = someOn }}
                        onChange={() => toggleGroup(group)}
                        className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                      <span className="text-xs font-semibold text-gray-700 flex-1">{group}</span>
                      <span className="text-xs text-gray-400">{onCount}/{gCols.length}</span>
                    </label>
                    <div className="grid grid-cols-2">
                      {gCols.map(col => (
                        <label key={col.key}
                          className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 select-none border-t border-gray-100">
                          <input type="checkbox" checked={checked.has(col.key)} onChange={() => toggleCol(col.key)}
                            className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0" />
                          <span className="text-xs text-gray-700 truncate">{col.h}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Format */}
          <div>
            <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Format</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'excel', label: 'Excel (.xlsx)', Icon: FileSpreadsheet, active: 'border-green-500 text-green-700 bg-green-50' },
                { key: 'pdf',   label: 'PDF',           Icon: FileText,        active: 'border-red-500 text-red-700 bg-red-50' },
              ].map(f => (
                <button key={f.key} onClick={() => setFormat(f.key)}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    format === f.key ? f.active : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  <f.Icon size={16} />{f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto page-size hint */}
          {format === 'pdf' && activeCols.length > 0 && (
            <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
              <strong>{activeCols.length} column{activeCols.length !== 1 ? 's' : ''}</strong> selected
              &nbsp;→ auto page size: <strong>{pg.label}</strong>
            </div>
          )}

          {activeCols.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
              Select at least one column to download.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex gap-3 flex-shrink-0">
          <button onClick={handleDownload}
            disabled={downloading || activeCols.length === 0 || displayed.length === 0}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
            {downloading
              ? <><Loader2 size={15} className="animate-spin" />Preparing…</>
              : <><Download size={15} />Download {displayed.length} machine{displayed.length !== 1 ? 's' : ''}</>
            }
          </button>
          <button onClick={onClose}
            className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
