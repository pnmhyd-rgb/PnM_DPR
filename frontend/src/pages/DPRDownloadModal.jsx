import { useState, useEffect, useRef } from 'react'
import { X, Download, Loader2, FileSpreadsheet, FileText, Search, ChevronDown } from 'lucide-react'
import { getProjects, getMachines, getEntries } from '../lib/api'

function SearchableSelect({ options, value, onChange, placeholder, disabled }) {
  const [query,  setQuery]  = useState('')
  const [open,   setOpen]   = useState(false)
  const ref = useRef()

  const selected = options.find(o => String(o.value) === String(value))

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o =>
    !query || o.label.toLowerCase().includes(query.toLowerCase())
  )

  const select = (val) => {
    onChange(val)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center border rounded-lg px-3 py-2 text-sm bg-white transition-colors ${
          disabled ? 'bg-gray-50 cursor-not-allowed border-gray-200' : 'border-gray-300 cursor-pointer hover:border-blue-400'
        } ${open ? 'border-blue-500 ring-2 ring-blue-500/20' : ''}`}
        onClick={() => { if (!disabled) setOpen(v => !v) }}
      >
        <Search size={13} className="text-gray-400 flex-shrink-0 mr-2" />
        {open ? (
          <input
            autoFocus
            value={query}
            onChange={e => { e.stopPropagation(); setQuery(e.target.value) }}
            onClick={e => e.stopPropagation()}
            placeholder="Type to search…"
            className="flex-1 outline-none bg-transparent text-gray-800 text-sm placeholder-gray-400"
          />
        ) : (
          <span className={`flex-1 truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
            {selected ? selected.label : placeholder}
          </span>
        )}
        <ChevronDown size={13} className={`text-gray-400 flex-shrink-0 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-gray-400 text-center">No results</p>
          ) : (
            filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => select(o.value)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-blue-50 ${
                  String(o.value) === String(value) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800'
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const TOGGLE_COLS = [
  { key: 'hsd',          label: 'HSD (Ltrs)',      def: true  },
  { key: 'breakdown',    label: 'Breakdown Hrs',   def: true  },
  { key: 'status',       label: 'Status',          def: true  },
  { key: 'work_done',    label: 'Work Done',       def: true  },
  { key: 'qty',          label: 'Quantity',        def: false },
  { key: 'remarks',      label: 'Remarks',         def: false },
  { key: 'submitted_by', label: 'Submitted By',    def: true  },
]

const FIXED_COLS = [
  { key: 'sno',       label: 'S.No'         },
  { key: 'date',      label: 'Date'         },
  { key: 'shift',     label: 'Shift'        },
  { key: 'r1_open',   label: 'Opening'      },
  { key: 'r1_close',  label: 'Closing'      },
  { key: 'r1_total',  label: 'Total Hrs/KMs'},
]

const SECTIONS = [
  { key: 'header',      label: 'Machine Header'      },
  { key: 'log',         label: 'Daily Log Table'      },
  { key: 'utilization', label: 'Utilization Summary'  },
  { key: 'fuel',        label: 'Fuel Summary'         },
]

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getStatus(e) {
  const wh = parseFloat(e.working_hours) || 0
  const bd = parseFloat(e.breakdown) || 0
  if (wh > 0 && bd > 0) return 'Working + Breakdown'
  if (wh > 0) return 'Working'
  if (bd > 0) return 'Breakdown'
  return 'Idle'
}

function cellVal(e, key, idx) {
  switch (key) {
    case 'sno':          return idx + 1
    case 'date':         return fmtDate(e.entry_date)
    case 'shift':        return e.shift || ''
    case 'r1_open':      return e.r1_open ?? ''
    case 'r1_close':     return e.r1_close ?? ''
    case 'r1_total':     return e.r1_total != null ? Number(e.r1_total).toFixed(2) : ''
    case 'hsd':          return e.hsd ?? ''
    case 'breakdown':    return e.breakdown ?? 0
    case 'status':       return getStatus(e)
    case 'work_done':    return e.work_done || ''
    case 'qty':          return e.qty ?? ''
    case 'remarks':      return e.remarks || ''
    case 'submitted_by': return e.submitted_by_name || ''
    default:             return ''
  }
}

function calcSummary(entries) {
  const plannedTotal = entries.reduce((s, e) => s + (parseFloat(e.planned_hours) || 0), 0)
  const workedTotal  = entries.reduce((s, e) => s + (parseFloat(e.working_hours) || 0), 0)
  const hsdTotal     = entries.reduce((s, e) => s + (parseFloat(e.hsd) || 0), 0)
  const utilPct      = plannedTotal > 0 ? ((workedTotal / plannedTotal) * 100).toFixed(1) : '—'
  const fuelAvg      = workedTotal > 0 ? (hsdTotal / workedTotal).toFixed(2) : '—'
  return { plannedTotal, workedTotal, hsdTotal, utilPct, fuelAvg }
}

async function buildExcel(machines, entriesMap, from, to, activeCols, sections, projName) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()

  for (const m of machines) {
    const entries   = entriesMap[m.id] || []
    const sheetName = (m.slno || `M${m.id}`).slice(0, 31).replace(/[:\\/?*[\]]/g, '_')
    const wsData    = []

    if (sections.header) {
      wsData.push([`Daily Progress Report — RVR Projects Pvt Ltd`])
      wsData.push([`Project:`, projName, '', `Ownership:`, m.ownership || ''])
      wsData.push([`Machine:`, m.slno || '', `Type:`, m.eq_type || '', `Reg No:`, m.reg_no || ''])
      wsData.push([`Report Period:`, `${fmtDate(from)}  to  ${fmtDate(to)}`])
      wsData.push([])
    }

    const logStartRow = wsData.length

    if (sections.log) {
      wsData.push(activeCols.map(c => c.label))
      if (entries.length > 0) {
        entries.forEach((e, i) => wsData.push(activeCols.map(c => cellVal(e, c.key, i))))
        // Total row
        const totRow = activeCols.map(c => {
          if (c.key === 'sno')       return 'Total'
          if (c.key === 'r1_total')  return entries.reduce((s, e) => s + (parseFloat(e.r1_total) || 0), 0).toFixed(2)
          if (c.key === 'hsd')       return entries.reduce((s, e) => s + (parseFloat(e.hsd) || 0), 0).toFixed(2)
          if (c.key === 'breakdown') return entries.reduce((s, e) => s + (parseFloat(e.breakdown) || 0), 0).toFixed(2)
          return ''
        })
        wsData.push(totRow)
      } else {
        wsData.push(['No entries found for this period.'])
      }
      wsData.push([])
    }

    if (sections.utilization || sections.fuel) {
      const s = calcSummary(entries)
      const utilRows = []
      const fuelRows = []

      if (sections.utilization) {
        utilRows.push(['Utilization', ''])
        utilRows.push(['Planned Hrs',  `${s.plannedTotal.toFixed(2)}`])
        utilRows.push(['Worked Hrs',   `${s.workedTotal.toFixed(2)}`])
        utilRows.push(['Utilization',  `${s.utilPct} %`])
      }
      if (sections.fuel) {
        fuelRows.push(['Fuel Summary', ''])
        fuelRows.push(['Total HSD',    `${s.hsdTotal.toFixed(2)} Ltrs`])
        fuelRows.push(['Fuel Average', `${s.fuelAvg} Ltrs/Hr`])
      }

      const maxLen = Math.max(utilRows.length, fuelRows.length)
      for (let i = 0; i < maxLen; i++) {
        const uRow = utilRows[i] || ['', '']
        const fRow = fuelRows[i] || ['', '']
        wsData.push([...uRow, '', ...fRow])
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Style header row of log table
    if (sections.log) {
      activeCols.forEach((_, ci) => {
        const ref = XLSX.utils.encode_cell({ r: logStartRow, c: ci })
        if (!ws[ref]) return
        ws[ref].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1E3A5F' } },
          alignment: { horizontal: 'center' },
        }
      })
    }

    ws['!cols'] = activeCols.map(c => ({ wch: Math.max(c.label.length + 2, 14) }))
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `DPR_${projName}_${date}.xlsx`)
}

async function buildPDF(machines, entriesMap, from, to, activeCols, sections, projName) {
  const { jsPDF }             = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc     = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pw      = doc.internal.pageSize.getWidth()
  const ph      = doc.internal.pageSize.getHeight()
  let   isFirst = true

  for (const m of machines) {
    if (!isFirst) doc.addPage()
    isFirst = false

    const entries = entriesMap[m.id] || []
    let y = 10

    if (sections.header) {
      doc.setFillColor(30, 58, 95)
      doc.rect(0, 0, pw, 8, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(255, 255, 255)
      doc.text('RVR Projects Pvt Ltd — Daily Progress Report', pw / 2, 5.5, { align: 'center' })
      y = 13

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(30, 30, 30)
      doc.text(`Project: ${projName}`, 10, y)
      doc.text(`Ownership: ${m.ownership || '—'}`, pw / 2, y)
      y += 5
      doc.text(`Machine: ${m.slno || '—'}   |   Type: ${m.eq_type || '—'}   |   Reg No: ${m.reg_no || '—'}`, 10, y)
      y += 5
      doc.text(`Report Period: ${fmtDate(from)}  to  ${fmtDate(to)}   |   Generated: ${new Date().toLocaleString('en-IN')}`, 10, y)
      y += 6
    }

    if (sections.log) {
      const body = entries.length > 0
        ? entries.map((e, i) => activeCols.map(c => String(cellVal(e, c.key, i))))
        : [['No entries found for this period.']]

      autoTable(doc, {
        startY: y,
        head: [activeCols.map(c => c.label)],
        body,
        styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 20 }, 2: { cellWidth: 22 } },
        margin: { left: 8, right: 8 },
        didDrawPage: ({ pageNumber }) => {
          doc.setFontSize(6.5)
          doc.setTextColor(160)
          doc.text(`Page ${pageNumber}`, pw - 18, ph - 5)
          doc.text('RVR Projects Pvt Ltd — DPR', 10, ph - 5)
        },
      })
      y = doc.lastAutoTable.finalY + 8
    }

    if (sections.utilization || sections.fuel) {
      const s   = calcSummary(entries)
      const col2 = pw / 2

      doc.setFontSize(8)
      doc.setTextColor(0)

      if (sections.utilization) {
        doc.setFont('helvetica', 'bold')
        doc.text('Utilization', 10, y)
        doc.setFont('helvetica', 'normal')
        doc.text(`Planned Hrs :  ${s.plannedTotal.toFixed(2)} Hrs`,  10, y + 5)
        doc.text(`Worked Hrs  :  ${s.workedTotal.toFixed(2)} Hrs`,   10, y + 10)
        doc.text(`Utilization :  ${s.utilPct} %`,                    10, y + 15)
      }
      if (sections.fuel) {
        doc.setFont('helvetica', 'bold')
        doc.text('Fuel Summary', col2, y)
        doc.setFont('helvetica', 'normal')
        doc.text(`Total HSD    :  ${s.hsdTotal.toFixed(2)} Ltrs`,    col2, y + 5)
        doc.text(`Fuel Average :  ${s.fuelAvg} Ltrs/Hr`,             col2, y + 10)
      }
    }
  }

  const date = new Date().toISOString().slice(0, 10)
  doc.save(`DPR_${projName}_${date}.pdf`)
}

export default function DPRDownloadModal({ onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) })()

  const [projects,   setProjects]  = useState([])
  const [machines,   setMachines]  = useState([])
  const [projectId,  setProjectId] = useState('')
  const [machineId,  setMachineId] = useState('')
  const [from,       setFrom]      = useState(firstOfMonth)
  const [to,         setTo]        = useState(today)
  const [sections,   setSections]  = useState({ header: true, log: true, utilization: true, fuel: true })
  const [cols,       setCols]      = useState(
    () => Object.fromEntries(TOGGLE_COLS.map(c => [c.key, c.def]))
  )
  const [format,     setFormat]    = useState('excel')
  const [loading,    setLoading]   = useState(false)
  const [error,      setError]     = useState('')

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!projectId) { setMachines([]); setMachineId(''); return }
    const proj = projects.find(p => String(p.id) === String(projectId))
    if (!proj) return
    getMachines({ project_code: proj.code }).then(r => setMachines(r.data.data)).catch(() => {})
    setMachineId('')
  }, [projectId, projects])

  const toggleSection = k => setSections(s => ({ ...s, [k]: !s[k] }))
  const toggleCol     = k => setCols(c => ({ ...c, [k]: !c[k] }))

  const activeCols = [
    ...FIXED_COLS,
    ...TOGGLE_COLS.filter(c => cols[c.key]),
  ]

  const handleDownload = async () => {
    if (!projectId) { setError('Please select a project.'); return }
    const anySection = Object.values(sections).some(Boolean)
    if (!anySection) { setError('Select at least one section.'); return }
    setError(''); setLoading(true)

    try {
      const proj     = projects.find(p => String(p.id) === String(projectId))
      const projName = proj ? (proj.code || proj.name) : 'Project'

      const entriesRes = await getEntries({ project_code: proj.code, from, to })
      const allEntries = entriesRes.data.data

      const targetMachines = machineId
        ? machines.filter(m => String(m.id) === String(machineId))
        : machines

      const entriesMap = {}
      for (const m of targetMachines) {
        entriesMap[m.id] = allEntries
          .filter(e => e.machine_id === m.id)
          .sort((a, b) => {
            const dd = new Date(a.entry_date) - new Date(b.entry_date)
            if (dd !== 0) return dd
            const order = { 'Day Shift': 0, 'Night Shift': 1, 'Dual Shift': 2 }
            return (order[a.shift] ?? 9) - (order[b.shift] ?? 9)
          })
      }

      if (format === 'excel') {
        await buildExcel(targetMachines, entriesMap, from, to, activeCols, sections, projName)
      } else {
        await buildPDF(targetMachines, entriesMap, from, to, activeCols, sections, projName)
      }

      onClose()
    } catch (e) {
      console.error(e)
      setError('Failed to generate report. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Download DPR Report</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">

          {/* Filters */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Project <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={projects.map(p => ({ value: p.id, label: p.code + (p.name ? ` — ${p.name}` : '') }))}
                value={projectId}
                onChange={setProjectId}
                placeholder="Search project…"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Machine / Equipment</label>
              <SearchableSelect
                options={[
                  { value: '', label: 'All Machines' },
                  ...machines.map(m => ({ value: m.id, label: `${m.slno}${m.eq_type ? ` · ${m.eq_type}` : ''}${m.reg_no ? ` (${m.reg_no})` : ''}` })),
                ]}
                value={machineId}
                onChange={setMachineId}
                placeholder={projectId ? 'Search machine…' : 'Select project first'}
                disabled={!projectId}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inp} />
            </div>
          </div>

          {/* Sections + Columns side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sections</label>
              <div className="space-y-1.5">
                {SECTIONS.map(s => (
                  <label key={s.key} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input type="checkbox" checked={sections[s.key]} onChange={() => toggleSection(s.key)}
                      className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                    <span className="text-sm text-gray-800">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Log Columns</label>
              </div>
              <div className="space-y-1.5">
                {/* Fixed columns note */}
                <p className="text-xs text-gray-400 px-1">Always included: S.No, Date, Shift, Opening, Closing, Total</p>
                {TOGGLE_COLS.map(c => (
                  <label key={c.key} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input type="checkbox" checked={cols[c.key]} onChange={() => toggleCol(c.key)}
                      className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                    <span className="text-sm text-gray-800">{c.label}</span>
                  </label>
                ))}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setCols(Object.fromEntries(TOGGLE_COLS.map(c => [c.key, true])))}
                    className="text-xs text-blue-600 hover:underline">All</button>
                  <button onClick={() => setCols(Object.fromEntries(TOGGLE_COLS.map(c => [c.key, false])))}
                    className="text-xs text-gray-400 hover:underline">None</button>
                </div>
              </div>
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Format</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'excel', label: 'Excel (.xlsx)', icon: FileSpreadsheet, color: 'text-green-700 border-green-400 bg-green-50' },
                { key: 'pdf',   label: 'PDF (.pdf)',    icon: FileText,        color: 'text-red-700 border-red-400 bg-red-50'   },
              ].map(f => {
                const Icon = f.icon
                return (
                  <button key={f.key} onClick={() => setFormat(f.key)}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                      format === f.key ? f.color + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    <Icon size={18} />
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex gap-3 flex-shrink-0">
          <button onClick={handleDownload} disabled={loading || !projectId}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {loading ? 'Preparing…' : `Download ${format === 'excel' ? 'Excel' : 'PDF'}`}
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
