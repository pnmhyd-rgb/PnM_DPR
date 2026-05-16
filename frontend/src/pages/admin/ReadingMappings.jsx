import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Check, Link2, ChevronDown, ChevronRight, Search } from 'lucide-react'
import {
  getReadingMappingsGrouped, getReadingTypes, getEquipmentTypes,
  createReadingMapping, deleteReadingMapping, bulkReplaceReadingMappings,
} from '../../lib/api'

const UNIT_COLOR = { Hrs: 'bg-blue-100 text-blue-700', Km: 'bg-green-100 text-green-700' }

export default function ReadingMappings() {
  const [grouped,   setGrouped]   = useState([])
  const [rtypes,    setRtypes]    = useState([]) // all reading types
  const [eqTypes,   setEqTypes]   = useState([]) // all equipment types
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [expanded,  setExpanded]  = useState({})

  // Edit panel
  const [editEq,    setEditEq]    = useState(null) // equipment_type_name being edited
  const [editReadings, setEditReadings] = useState([]) // [{reading_type_id, display_order, code, reading_name, unit}]
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [grp, rt, et] = await Promise.all([
        getReadingMappingsGrouped(),
        getReadingTypes(),
        getEquipmentTypes(),
      ])
      setGrouped(grp.data.data)
      setRtypes(rt.data.data)
      setEqTypes(et.data.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggle = (name) => setExpanded(e => ({ ...e, [name]: !e[name] }))

  const openEdit = (item) => {
    setEditEq(item.equipment_type_name)
    setEditReadings((item.readings || []).map(r => ({ ...r })))
    setError('')
  }

  const openNewEq = () => {
    setEditEq('__new__')
    setEditReadings([])
    setError('')
  }

  const closeEdit = () => { setEditEq(null); setEditReadings([]) }

  const addReading = (rtId) => {
    const rt = rtypes.find(r => r.id === rtId)
    if (!rt) return
    if (editReadings.some(r => r.reading_type_id === rtId)) return
    const nextOrder = editReadings.length + 1
    setEditReadings(prev => [
      ...prev,
      { reading_type_id: rtId, code: rt.code, reading_name: rt.name, unit: rt.unit, display_order: nextOrder, mandatory: true }
    ])
  }

  const removeReading = (rtId) => {
    setEditReadings(prev => {
      const next = prev.filter(r => r.reading_type_id !== rtId)
      return next.map((r, i) => ({ ...r, display_order: i + 1 }))
    })
  }

  const moveReading = (rtId, dir) => {
    setEditReadings(prev => {
      const idx = prev.findIndex(r => r.reading_type_id === rtId)
      if (idx < 0) return prev
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next.map((r, i) => ({ ...r, display_order: i + 1 }))
    })
  }

  const [newEqName, setNewEqName] = useState('')

  const save = async () => {
    const name = editEq === '__new__' ? newEqName.trim() : editEq
    if (!name) { setError('Equipment type name is required'); return }
    setSaving(true); setError('')
    try {
      await bulkReplaceReadingMappings({
        equipment_type_name: name,
        readings: editReadings.map(r => ({
          reading_type_id: r.reading_type_id,
          mandatory: r.mandatory,
          display_order: r.display_order,
        })),
      })
      closeEdit()
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const filtered = grouped.filter(g =>
    g.equipment_type_name.toLowerCase().includes(search.toLowerCase())
  )

  // Equipment types not yet in any mapping
  const mappedNames = new Set(grouped.map(g => g.equipment_type_name.toLowerCase()))
  const unmapped = eqTypes.filter(e => !mappedNames.has(e.name.toLowerCase()))

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Link2 size={20} className="text-blue-600" /> Equipment Reading Mappings
          </h1>
          <p className="text-sm text-gray-500 mt-1">Define which reading types apply to each equipment category</p>
        </div>
        <button onClick={openNewEq}
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus size={15} /> Add Mapping
        </button>
      </div>

      {/* Edit Panel */}
      {editEq && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            {editEq === '__new__' ? 'New Equipment Mapping' : `Edit: ${editEq}`}
          </h2>

          {editEq === '__new__' && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Equipment Type</label>
              <select className={`${inp} w-full`} value={newEqName} onChange={e => setNewEqName(e.target.value)}>
                <option value="">— Select equipment type —</option>
                {unmapped.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                {eqTypes.filter(e => mappedNames.has(e.name.toLowerCase())).map(e => (
                  <option key={e.id} value={e.name} style={{ color: '#9ca3af' }}>{e.name} (has mapping)</option>
                ))}
              </select>
            </div>
          )}

          {/* Current readings */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Active Readings ({editReadings.length})</p>
            {editReadings.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No readings configured — equipment is Non-Measurable</p>
            ) : (
              <div className="space-y-1.5">
                {editReadings.map((r, idx) => (
                  <div key={r.reading_type_id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-400 w-4 font-mono">{idx + 1}</span>
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{r.code}</span>
                    <span className="text-sm text-gray-700 flex-1">{r.reading_name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${UNIT_COLOR[r.unit] || 'bg-gray-100 text-gray-600'}`}>{r.unit}</span>
                    <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                      <input type="checkbox" checked={r.mandatory}
                        onChange={e => setEditReadings(prev => prev.map(p => p.reading_type_id === r.reading_type_id ? { ...p, mandatory: e.target.checked } : p))} />
                      Mandatory
                    </label>
                    <div className="flex gap-0.5">
                      <button onClick={() => moveReading(r.reading_type_id, -1)} disabled={idx === 0}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-20 p-0.5 text-xs">↑</button>
                      <button onClick={() => moveReading(r.reading_type_id, 1)} disabled={idx === editReadings.length - 1}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-20 p-0.5 text-xs">↓</button>
                    </div>
                    <button onClick={() => removeReading(r.reading_type_id)}
                      className="text-gray-300 hover:text-red-500 p-0.5 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add reading */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Add Reading Type</p>
            <div className="flex flex-wrap gap-2">
              {rtypes
                .filter(rt => !editReadings.some(er => er.reading_type_id === rt.id))
                .map(rt => (
                  <button key={rt.id} onClick={() => addReading(rt.id)}
                    className="flex items-center gap-1.5 text-xs border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors">
                    <Plus size={11} />
                    <span className="font-mono font-bold">{rt.code}</span>
                    <span className="text-gray-400">({rt.unit})</span>
                  </button>
                ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              <Check size={14} /> {saving ? 'Saving…' : 'Save Mapping'}
            </button>
            <button onClick={closeEdit}
              className="flex items-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm px-4 py-2 rounded-lg transition-colors">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="w-full border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Search equipment type…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Grouped list */}
      <div className="space-y-2">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">No mappings found.</div>
        ) : (
          filtered.map(g => (
            <div key={g.equipment_type_name} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggle(g.equipment_type_name)}
              >
                <div className="flex items-center gap-3">
                  {expanded[g.equipment_type_name] ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                  <span className="text-sm font-semibold text-gray-800">{g.equipment_type_name}</span>
                  {g.asset_category && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      g.asset_category === 'Measurable' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>{g.asset_category}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{g.readings?.length || 0} readings</span>
                  <button onClick={e => { e.stopPropagation(); openEdit(g) }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors">
                    Edit
                  </button>
                </div>
              </div>
              {expanded[g.equipment_type_name] && (
                <div className="border-t border-gray-100 px-4 py-3">
                  {(!g.readings || g.readings.length === 0) ? (
                    <p className="text-xs text-gray-400 italic">No readings — Non-Measurable</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {g.readings.map((r, i) => (
                        <div key={r.id} className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
                          <span className="text-xs text-gray-400 font-mono">{i + 1}.</span>
                          <span className="font-mono text-xs font-bold text-blue-700">{r.code}</span>
                          <span className="text-xs text-gray-600">{r.reading_name}</span>
                          <span className={`text-xs px-1 py-0.5 rounded ${UNIT_COLOR[r.unit] || 'bg-gray-100 text-gray-600'}`}>{r.unit}</span>
                          {r.mandatory && <span className="text-[10px] text-red-600 bg-red-50 px-1 rounded">Mandatory</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Unmapped equipment types */}
      {unmapped.length > 0 && !search && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 mb-2">Equipment types without reading mappings ({unmapped.length})</p>
          <div className="flex flex-wrap gap-2">
            {unmapped.map(e => (
              <button key={e.id} onClick={() => { openNewEq(); setNewEqName(e.name) }}
                className="text-xs text-amber-700 bg-white border border-amber-200 hover:bg-amber-50 px-2.5 py-1 rounded-lg transition-colors">
                {e.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
