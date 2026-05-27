import { useState, useEffect } from 'react'
import { getVendors, upsertVendor, deleteVendor } from '../../lib/api'
import { Plus, Trash2, Search, X, Pencil, Check } from 'lucide-react'

export default function Vendors() {
  const [vendors,  setVendors]  = useState([])
  const [search,   setSearch]   = useState('')
  const [newName,  setNewName]  = useState('')
  const [adding,   setAdding]   = useState(false)
  const [addError, setAddError] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [editId,   setEditId]   = useState(null)
  const [editName, setEditName] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const load = () => getVendors().then(r => setVendors(r.data.data)).catch(() => {})

  useEffect(() => { load() }, [])

  const displayed = search
    ? vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()))
    : vendors

  const handleAdd = async () => {
    if (!newName.trim()) return
    setAdding(true); setAddError('')
    try {
      await upsertVendor({ name: newName.trim() })
      setNewName('')
      load()
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add vendor')
    } finally { setAdding(false) }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete vendor "${name}"?\n\nMachines already linked to this vendor will retain the vendor name.`)) return
    setDeleting(id)
    try {
      await deleteVendor(id)
      setVendors(prev => prev.filter(v => v.id !== id))
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed')
    } finally { setDeleting(null) }
  }

  const startEdit = (v) => { setEditId(v.id); setEditName(v.name) }
  const cancelEdit = () => { setEditId(null); setEditName('') }

  const handleRename = async (oldName) => {
    if (!editName.trim() || editName.trim() === oldName) { cancelEdit(); return }
    setEditSaving(true)
    try {
      await deleteVendor(editId)
      await upsertVendor({ name: editName.trim() })
      cancelEdit()
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Rename failed')
    } finally { setEditSaving(false) }
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Vendor Master</h1>
        <p className="text-sm text-gray-500 mt-0.5">Vendors used in the asset register for hired equipment</p>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Vendor</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={lbl}>Vendor Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => { setNewName(e.target.value); setAddError('') }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className={inp + ' w-full'}
              placeholder="e.g. L&T Construction Ltd"
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
            placeholder="Search vendors…"
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
            {search ? 'No vendors match the search' : 'No vendors added yet'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {displayed.map(v => (
              <li key={v.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                {editId === v.id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(v.name); if (e.key === 'Escape') cancelEdit() }}
                      className={inp + ' flex-1 py-1'}
                      autoFocus
                    />
                    <button
                      onClick={() => handleRename(v.name)}
                      disabled={editSaving}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                      title="Save"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded transition-colors"
                      title="Cancel"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-gray-800">{v.name}</span>
                    <button
                      onClick={() => startEdit(v)}
                      className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                      title="Rename"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(v.id, v.name)}
                      disabled={deleting === v.id}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {displayed.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-right">
            {displayed.length} of {vendors.length} vendors
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 px-1">
        Note: Renaming a vendor updates only this master list. Existing machines retain the old vendor name stored at the time of entry.
      </p>
    </div>
  )
}
