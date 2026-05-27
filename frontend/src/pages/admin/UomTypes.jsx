import { useState, useEffect } from 'react'
import { getUomTypes, createUomType, deleteUomType } from '../../lib/api'
import { Plus, Trash2, Search, X } from 'lucide-react'

export default function UomTypes() {
  const [uomList,  setUomList]  = useState([])
  const [search,   setSearch]   = useState('')
  const [newName,  setNewName]  = useState('')
  const [adding,   setAdding]   = useState(false)
  const [addError, setAddError] = useState('')
  const [deleting, setDeleting] = useState(null)

  const load = () => getUomTypes().then(r => setUomList(r.data.data)).catch(() => {})

  useEffect(() => { load() }, [])

  const displayed = search
    ? uomList.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))
    : uomList

  const handleAdd = async () => {
    if (!newName.trim()) return
    setAdding(true); setAddError('')
    try {
      await createUomType({ name: newName.trim() })
      setNewName('')
      load()
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add')
    } finally { setAdding(false) }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete UOM "${name}"? This will not affect machines that already use it.`)) return
    setDeleting(id)
    try {
      await deleteUomType(id)
      setUomList(prev => prev.filter(u => u.id !== id))
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed')
    } finally { setDeleting(null) }
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">UOM Types</h1>
        <p className="text-sm text-gray-500 mt-0.5">Units of measure used for equipment capacity (MT, Liters, Nos, etc.)</p>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add New UOM</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={lbl}>UOM Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => { setNewName(e.target.value); setAddError('') }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className={inp + ' w-full'}
              placeholder="e.g. MT, Liters, Nos, CUM"
            />
            {addError && <p className="text-xs text-red-600 mt-1">{addError}</p>}
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={14} />{adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      </div>

      {/* Search + list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Search size={14} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search UOM types…"
            className="flex-1 text-sm outline-none bg-transparent"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-300 hover:text-gray-500">
              <X size={13} />
            </button>
          )}
        </div>

        {displayed.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            {search ? 'No UOM types match the search' : 'No UOM types added yet'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {displayed.map(u => (
              <li key={u.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors">
                <span className="text-sm font-medium text-gray-800">{u.name}</span>
                <button
                  onClick={() => handleDelete(u.id, u.name)}
                  disabled={deleting === u.id}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {displayed.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-right">
            {displayed.length} of {uomList.length} types
          </div>
        )}
      </div>
    </div>
  )
}
