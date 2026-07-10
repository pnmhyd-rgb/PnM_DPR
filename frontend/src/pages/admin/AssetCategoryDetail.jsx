import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Settings2, ChevronRight, CheckCircle2, Loader2, FolderTree } from 'lucide-react'
import { getEquipmentTypes } from '../../lib/api'

export default function AssetCategoryDetail() {
  const { group }  = useParams()
  const groupName  = decodeURIComponent(group)
  const navigate   = useNavigate()

  const [types,   setTypes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    setLoading(true)
    getEquipmentTypes()
      .then(r => {
        const all = r.data.data || []
        setTypes(all.filter(t => t.asset_group === groupName))
      })
      .catch(() => setError('Failed to load asset types'))
      .finally(() => setLoading(false))
  }, [groupName])

  const totalMachines = types.reduce((s, t) => s + (parseInt(t.usage_count) || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/admin/equipment-types')}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
            Asset Category
          </p>
          <h1 className="text-xl font-bold text-gray-900">{groupName}</h1>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Asset types card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <FolderTree size={15} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">{groupName}</span>
            <span className="text-xs text-slate-400 font-normal">
              {types.length} asset type{types.length !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-xs text-slate-400">{totalMachines} total machine{totalMachines !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        {types.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            No asset types found for this group.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/40">
                <th className="text-left text-xs font-semibold text-gray-400 px-5 py-2.5">Asset Name</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2.5">Measurability</th>
                <th className="text-center text-xs font-semibold text-gray-400 px-4 py-2.5">Own</th>
                <th className="text-center text-xs font-semibold text-gray-400 px-4 py-2.5">Hire</th>
                <th className="text-center text-xs font-semibold text-gray-400 px-4 py-2.5">Total</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2.5">Config</th>
                <th className="px-4 py-2.5 w-36" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {types.map(t => (
                <tr key={t.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3">
                    {t.asset_category ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        t.asset_category === 'Measurable'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>{t.asset_category}</span>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {parseInt(t.own_count) > 0
                      ? <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">{t.own_count}</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {parseInt(t.hire_count) > 0
                      ? <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">{t.hire_count}</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {parseInt(t.usage_count) > 0
                      ? <span className="text-xs bg-gray-200 text-gray-700 font-medium px-2 py-0.5 rounded-full">{t.usage_count}</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {t.has_config
                      ? <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle2 size={12} />Configured</span>
                      : <span className="text-xs text-gray-300">Not configured</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
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
        )}
      </div>
    </div>
  )
}
