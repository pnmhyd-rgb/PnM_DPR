import { useState, useEffect } from 'react'
import { getFuelStations, createFuelStation, updateFuelStation, deleteFuelStation, getProjects } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { Plus, Search, Pencil, Trash2, X, Loader2, Fuel, CheckCircle2 } from 'lucide-react'

const STATION_TYPES = ['Internal', 'External']
const FUEL_TYPE_OPTIONS = ['HS Diesel', 'Petrol', 'CNG', 'LDO', 'HSD + Petrol']

const TYPE_BADGE = {
  Internal: 'bg-blue-100 text-blue-700',
  External: 'bg-orange-100 text-orange-700',
}

function Modal({ title, onClose, onSave, saving, projects, initial }) {
  const [name,        setName]        = useState(initial?.name        || '')
  const [stationType, setStationType] = useState(initial?.station_type || 'Internal')
  const [linkedSites, setLinkedSites] = useState(initial?.linked_sites || [])
  const [fuelTypes,   setFuelTypes]   = useState(initial?.fuel_types   || [])
  const [active,      setActive]      = useState(initial?.active !== false)
  const [error,       setError]       = useState('')

  const toggleSite = (code) =>
    setLinkedSites(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])

  const toggleFuel = (ft) =>
    setFuelTypes(prev => prev.includes(ft) ? prev.filter(f => f !== ft) : [...prev, ft])

  const handleSave = () => {
    if (!name.trim()) { setError('Station name is required'); return }
    if (fuelTypes.length === 0) { setError('Select at least one fuel type'); return }
    setError('')
    onSave({ name: name.trim(), station_type: stationType, linked_sites: linkedSites, fuel_types: fuelTypes, active })
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Fuel size={16} className="text-blue-600" /> {title}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* Station Name */}
          <div>
            <label className={lbl}>Station Name <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="e.g. ADCL-Camp-01" />
          </div>

          {/* Station Type */}
          <div>
            <label className={lbl}>Station Type</label>
            <div className="flex gap-3">
              {STATION_TYPES.map(t => (
                <button
                  key={t} type="button"
                  onClick={() => setStationType(t)}
                  className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    stationType === t
                      ? t === 'Internal' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Fuel Types */}
          <div>
            <label className={lbl}>Fuel Type <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {FUEL_TYPE_OPTIONS.map(ft => (
                <button
                  key={ft} type="button"
                  onClick={() => toggleFuel(ft)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    fuelTypes.includes(ft)
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {fuelTypes.includes(ft) && <span className="mr-1">✓</span>}{ft}
                </button>
              ))}
            </div>
          </div>

          {/* Linked Sites */}
          <div>
            <label className={lbl}>Linked Sites</label>
            {projects.length === 0 ? (
              <p className="text-xs text-gray-400">No projects found</p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                {projects.map(p => (
                  <label key={p.code} className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={linkedSites.includes(p.code)}
                      onChange={() => toggleSite(p.code)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="text-sm text-gray-800">{p.name}</span>
                    <span className="ml-auto text-xs text-gray-400">{p.code}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Status — only for edits */}
          {initial && (
            <div>
              <label className={lbl}>Status</label>
              <div className="flex gap-3">
                {[true, false].map(v => (
                  <button key={String(v)} type="button" onClick={() => setActive(v)}
                    className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      active === v
                        ? v ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-400 bg-red-50 text-red-600'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {v ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-200 flex-shrink-0">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {saving ? 'Saving…' : 'Save Station'}
          </button>
          <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FuelStation() {
  const { isAdmin } = useAuth()
  const [stations,  setStations]  = useState([])
  const [projects,  setProjects]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [addOpen,   setAddOpen]   = useState(false)
  const [editItem,  setEditItem]  = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)

  const load = () => {
    setLoading(true)
    getFuelStations()
      .then(r => setStations(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    getProjects().then(r => setProjects(r.data.data || [])).catch(() => {})
  }, [])

  const handleAdd = async (data) => {
    setSaving(true)
    try {
      await createFuelStation(data)
      setAddOpen(false)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create station')
    } finally { setSaving(false) }
  }

  const handleEdit = async (data) => {
    setSaving(true)
    try {
      await updateFuelStation(editItem.id, data)
      setEditItem(null)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update station')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteFuelStation(deleteItem.id)
      setDeleteItem(null)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete station')
    } finally { setDeleting(false) }
  }

  const toggleActive = async (station) => {
    try {
      await updateFuelStation(station.id, { active: !station.active })
      load()
    } catch {}
  }

  const filtered = stations.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.station_type?.toLowerCase().includes(search.toLowerCase()) ||
    (s.fuel_types || []).join(' ').toLowerCase().includes(search.toLowerCase()) ||
    (s.linked_sites || []).join(' ').toLowerCase().includes(search.toLowerCase())
  )

  const projectName = (code) => projects.find(p => p.code === code)?.name || code

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Fuel size={20} className="text-blue-600" /> Fuel Station
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">{stations.length} station{stations.length !== 1 ? 's' : ''} registered</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <Search size={14} className="text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search stations…"
              className="text-sm outline-none text-gray-700 placeholder-gray-400 w-44"
            />
          </div>
          {isAdmin && (
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors">
              <Plus size={15} /> Add Fuel Station
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide w-12">S.No</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Station Name</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Station Type</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Linked Sites</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Fuel Type</th>
              <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wide w-24">Status</th>
              {isAdmin && <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wide w-24">Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isAdmin ? 7 : 6} className="text-center py-12 text-gray-400">
                <Loader2 size={20} className="animate-spin mx-auto mb-2" />Loading…
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={isAdmin ? 7 : 6} className="text-center py-16 text-gray-400">
                <Fuel size={32} className="mx-auto mb-2 text-gray-200" />
                {search ? 'No stations match your search' : 'No fuel stations added yet'}
              </td></tr>
            ) : filtered.map((s, idx) => (
              <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{s.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${TYPE_BADGE[s.station_type] || 'bg-gray-100 text-gray-600'}`}>
                    {s.station_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {(s.linked_sites || []).length === 0 ? (
                    <span className="text-gray-400 text-xs">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {s.linked_sites.map(code => (
                        <span key={code} className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                          {projectName(code)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {(s.fuel_types || []).length === 0 ? (
                    <span className="text-gray-400 text-xs">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {s.fuel_types.map(ft => (
                        <span key={ft} className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-xs font-medium">
                          {ft}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {isAdmin ? (
                    <button
                      onClick={() => toggleActive(s)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                        s.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${s.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                      {s.active ? 'Active' : 'Inactive'}
                    </button>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                      {s.active ? 'Active' : 'Inactive'}
                    </span>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setEditItem(s)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteItem(s)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {addOpen && (
        <Modal
          title="Add Fuel Station"
          onClose={() => setAddOpen(false)}
          onSave={handleAdd}
          saving={saving}
          projects={projects}
          initial={null}
        />
      )}

      {/* Edit Modal */}
      {editItem && (
        <Modal
          title="Edit Fuel Station"
          onClose={() => setEditItem(null)}
          onSave={handleEdit}
          saving={saving}
          projects={projects}
          initial={editItem}
        />
      )}

      {/* Delete Confirm */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={16} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Delete Fuel Station</h3>
                <p className="text-xs text-gray-500 mt-0.5">{deleteItem.name}</p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete <strong>{deleteItem.name}</strong>? This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={handleDelete} disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => setDeleteItem(null)}
                className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
