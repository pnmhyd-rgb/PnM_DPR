import { useState, useEffect } from 'react'
import { X, Download, Loader2 } from 'lucide-react'
import { getMachines, getProjects } from '../../lib/api'

const CATEGORIES = [
  { key: 'own_measurable',     label: 'Own — Measurable Assets',     match: m => m.ownership === 'Own' && !!m.reading1_basis },
  { key: 'own_non_measurable', label: 'Own — Non-Measurable Assets', match: m => m.ownership === 'Own' && !m.reading1_basis },
  { key: 'hire',               label: 'Hire Assets',                 match: m => m.ownership === 'Hire' },
]

const CSV_COLS = [
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

function toCSV(rows) {
  const escape = v => {
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = CSV_COLS.map(c => c.header).join(',')
  const lines  = rows.map(m => CSV_COLS.map(c => escape(c.val(m))).join(','))
  return [header, ...lines].join('\n')
}

export default function AssetRegisterDownloadModal({ onClose, defaultProject = '' }) {
  const [projects,    setProjects]    = useState([])
  const [projectId,   setProjectId]   = useState(defaultProject)
  const [categories,  setCategories]  = useState({ own_measurable: true, own_non_measurable: true, hire: true })
  const [downloading, setDownloading] = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data)).catch(() => {})
  }, [])

  const toggleCat = key => setCategories(prev => ({ ...prev, [key]: !prev[key] }))

  const selectedCount = Object.values(categories).filter(Boolean).length

  const handleDownload = async () => {
    if (selectedCount === 0) { setError('Select at least one category.'); return }
    setError(''); setDownloading(true)
    try {
      const proj = projects.find(p => String(p.id) === String(projectId))
      const res  = await getMachines(proj ? { project_code: proj.code } : {})
      let all    = res.data.data

      // filter by selected categories
      const matchers = CATEGORIES.filter(c => categories[c.key]).map(c => c.match)
      const filtered = all.filter(m => matchers.some(fn => fn(m)))

      if (filtered.length === 0) { setError('No assets found for the selected filters.'); setDownloading(false); return }

      const csv  = toCSV(filtered)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href = url

      const catLabel = selectedCount === 3 ? 'All' : CATEGORIES.filter(c => categories[c.key]).map(c => c.key).join('+')
      const projLabel = proj ? proj.code : 'AllProjects'
      a.download = `AssetRegister_${projLabel}_${catLabel}_${new Date().toISOString().slice(0,10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (e) {
      setError('Failed to fetch data. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Download Asset Register</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Project filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Project</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Category checkboxes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Categories to include</label>
            <div className="space-y-2">
              {CATEGORIES.map(cat => (
                <label key={cat.key} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={categories[cat.key]}
                    onChange={() => toggleCat(cat.key)}
                    className="w-4 h-4 accent-blue-600 flex-shrink-0"
                  />
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

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={handleDownload}
            disabled={downloading || selectedCount === 0}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {downloading ? 'Preparing…' : `Download CSV${selectedCount > 0 ? ` (${selectedCount} categor${selectedCount === 1 ? 'y' : 'ies'})` : ''}`}
          </button>
          <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}
