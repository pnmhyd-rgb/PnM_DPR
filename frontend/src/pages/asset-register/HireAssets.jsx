import { useState, useEffect } from 'react'
import { getMachines, getProjects } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Plus, Download } from 'lucide-react'
import AddAssetModal from './AddAssetModal'
import EditAssetModal from './EditAssetModal'
import AssetRegisterDownloadModal from './AssetRegisterDownloadModal'
import MachineDetailPanel from '../../components/MachineDetailPanel'

export default function HireAssets() {
  const { isAdmin, user }         = useAuth()
  const canAdd                    = isAdmin || user?.can_add_assets
  const [machines, setMachines]   = useState([])
  const [projects, setProjects]   = useState([])
  const [filterProj, setFilterProj] = useState('')
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [showDownload, setShowDownload] = useState(false)
  const [detailPanel, setDetailPanel] = useState(null)
  const [editPanel, setEditPanel] = useState(null)

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data))
  }, [])

  const load = () => {
    setLoading(true)
    getMachines(filterProj ? { project_code: filterProj } : {})
      .then(r => {
        setMachines(r.data.data.filter(m => m.ownership === 'Hire'))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filterProj])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Hire Asset Register</h1>
          <p className="text-sm text-gray-500 mt-0.5">Equipment hired / rented from external vendors</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDownload(true)} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors">
            <Download size={15} />Download
          </button>
          {canAdd && (
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors">
              <Plus size={15} />Add Hire Asset
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
                {['#','Project','Nickname','SL No','Asset Group','Asset Category','Asset Name','Manufacturer','Model','Capacity / UOM','Vendor','Reg No','Chassis No','Fuel Type','Shift','Meter','Fuel Min','Fuel Max','Planned Hrs/Day'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={19} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>}
              {!loading && machines.length === 0 && <tr><td colSpan={19} className="px-4 py-10 text-center text-gray-400">No hire assets found</td></tr>}
              {!loading && machines.map((m, i) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2"><span className="bg-violet-50 text-violet-700 font-semibold px-1.5 py-0.5 rounded text-xs">{m.project_code}</span></td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {m.nickname
                      ? <button onClick={() => setDetailPanel(m)} className="text-blue-700 font-medium hover:text-blue-900 hover:underline text-left">{m.nickname}</button>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => setDetailPanel(m)} className="text-blue-600 hover:text-blue-800 hover:underline font-semibold text-left">
                      {m.slno}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{m.asset_group || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.asset_cat   || '—'}</td>
                  <td className="px-3 py-2 text-gray-800 font-medium">{m.eq_type}</td>
                  <td className="px-3 py-2 text-gray-600">{m.manufacturer || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.model || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.capacity ? `${m.capacity} ${m.uom || ''}`.trim() : '—'}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{m.vendor || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.reg_no || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.chassis_no || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.fuel_type || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${m.shift_type === 'Dual Shift' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>{m.shift_type}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{m.reading1_basis || '—'}{m.dual_reading && m.reading2_basis ? ` / ${m.reading2_basis}` : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{m.fuel_min ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{m.fuel_max ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{m.planned_hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && machines.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-right">{machines.length} hire asset{machines.length !== 1 ? 's' : ''}</div>
        )}
      </div>

      {showAdd && <AddAssetModal onClose={() => setShowAdd(false)} onSaved={load} />}
      {showDownload && <AssetRegisterDownloadModal onClose={() => setShowDownload(false)} />}
      {detailPanel && (
        <MachineDetailPanel
          machine={detailPanel}
          onClose={() => setDetailPanel(null)}
          onEdit={isAdmin ? () => { setEditPanel(detailPanel); setDetailPanel(null) } : undefined}
        />
      )}
      {editPanel && (
        <EditAssetModal
          machine={editPanel}
          onClose={() => setEditPanel(null)}
          onSaved={updated => { load(); setEditPanel(null); setDetailPanel(updated) }}
        />
      )}
    </div>
  )
}
