import { useState, useEffect } from 'react'
import { getMachines, getProjects } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Plus, Download } from 'lucide-react'
import AddAssetModal from './AddAssetModal'
import AssetRegisterDownloadModal from './AssetRegisterDownloadModal'

export default function OwnNonMeasurable() {
  const { isAdmin, user }         = useAuth()
  const canAdd                    = isAdmin || user?.can_add_assets
  const [machines, setMachines]   = useState([])
  const [projects, setProjects]   = useState([])
  const [filterProj, setFilterProj] = useState('')
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [showDownload, setShowDownload] = useState(false)

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data))
  }, [])

  const load = () => {
    setLoading(true)
    getMachines(filterProj ? { project_code: filterProj } : {})
      .then(r => {
        setMachines(r.data.data.filter(m => m.ownership === 'Own' && !m.reading1_basis))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filterProj])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Own Asset Register — Non-Measurable Assets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Company-owned assets without a meter reading</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDownload(true)} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors">
            <Download size={15} />Download
          </button>
          {canAdd && (
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors">
              <Plus size={15} />Add Asset
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <select
          value={filterProj} onChange={e => setFilterProj(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#','Project','SL No','Type','Manufacturer','Model','Capacity / UOM','Reg No','Chassis No','Shift','Purchase Date','PO No','Price (₹)'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={13} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>}
              {!loading && machines.length === 0 && <tr><td colSpan={13} className="px-4 py-10 text-center text-gray-400">No non-measurable own assets found</td></tr>}
              {!loading && machines.map((m, i) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2"><span className="bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded text-xs">{m.project_code}</span></td>
                  <td className="px-3 py-2 font-semibold text-gray-900">{m.slno}</td>
                  <td className="px-3 py-2 text-gray-800">{m.eq_type}</td>
                  <td className="px-3 py-2 text-gray-600">{m.manufacturer || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.model || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.capacity ? `${m.capacity} ${m.uom || ''}`.trim() : '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.reg_no || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.chassis_no || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${m.shift_type === 'Dual Shift' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>{m.shift_type}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{m.date_of_purchase ? new Date(m.date_of_purchase).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.po_number || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{m.price ? `₹${Number(m.price).toLocaleString('en-IN')}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && machines.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-right">{machines.length} asset{machines.length !== 1 ? 's' : ''}</div>
        )}
      </div>

      {showAdd && <AddAssetModal onClose={() => setShowAdd(false)} onSaved={load} />}
      {showDownload && <AssetRegisterDownloadModal onClose={() => setShowDownload(false)} />}
    </div>
  )
}
