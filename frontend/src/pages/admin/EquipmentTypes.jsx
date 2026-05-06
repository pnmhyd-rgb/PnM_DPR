import { useState, useEffect } from 'react'
import { getEquipmentTypes, createEquipmentType, deleteEquipmentType } from '../../lib/api'
import { Plus, Trash2 } from 'lucide-react'

export default function EquipmentTypes() {
  const [types,    setTypes]    = useState([])
  const [name,     setName]     = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [selected, setSelected] = useState(new Set())
  const [deleting, setDeleting] = useState(false)

  const load = () => getEquipmentTypes().then(r => { setTypes(r.data.data); setSelected(new Set()) })
  useEffect(() => { load() }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError('')
    try {
      await createEquipmentType({ name: name.trim() })
      setName(''); load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add')
    } finally { setSaving(false) }
  }

  const toggleOne = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const allChecked  = types.length > 0 && selected.size === types.length
  const someChecked = selected.size > 0 && selected.size < types.length

  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(types.map(t => t.id)))

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} equipment type${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await Promise.all([...selected].map(id => deleteEquipmentType(id)))
      load()
    } finally { setDeleting(false) }
  }

  const handleDeleteOne = async (id) => {
    if (!confirm('Delete this equipment type?')) return
    await deleteEquipmentType(id); load()
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Equipment Types</h1>

      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="New equipment type name…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <button
            type="submit" disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors flex-shrink-0"
          >
            <Plus size={15} />{saving ? 'Adding…' : 'Add'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allChecked}
              ref={el => { if (el) el.indeterminate = someChecked }}
              onChange={toggleAll}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-xs font-medium text-gray-600">
              {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
            </span>
          </label>

          {selected.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Trash2 size={13} />
              {deleting ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-100">
          {types.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No equipment types yet</p>
          )}
          {types.map(t => (
            <div
              key={t.id}
              onClick={() => toggleOne(t.id)}
              className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                selected.has(t.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggleOne(t.id)}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 accent-blue-600 flex-shrink-0"
                />
                <span className="text-sm text-gray-800 truncate">{t.name}</span>
              </label>
              <button
                onClick={e => { e.stopPropagation(); handleDeleteOne(t.id) }}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
