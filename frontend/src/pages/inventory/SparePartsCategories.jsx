import { useState, useEffect } from 'react'
import { getInventoryCategories, createInventoryCategory, updateInventoryCategory, deleteInventoryCategory } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Plus, Edit2, Trash2, X, Tag } from 'lucide-react'

const empty = () => ({ name: '', parent_id: '', description: '' })

export default function SparePartsCategories() {
  const { isAdmin } = useAuth()
  const [cats, setCats]     = useState([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(empty())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [delId, setDelId]   = useState(null)

  const load = async () => {
    setLoading(true)
    try { const r = await getInventoryCategories(); setCats(r.data.data) }
    catch { setError('Failed to load categories') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openAdd  = () => { setForm(empty()); setEditId(null); setError(''); setModal(true) }
  const openEdit = (c) => { setForm({ name: c.name, parent_id: c.parent_id || '', description: c.description || '' }); setEditId(c.id); setError(''); setModal(true) }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = { name: form.name, parent_id: form.parent_id || null, description: form.description }
      if (editId) await updateInventoryCategory(editId, payload)
      else        await createInventoryCategory(payload)
      setModal(false); load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const del = async () => {
    try { await deleteInventoryCategory(delId); setDelId(null); load() }
    catch (err) { alert(err.response?.data?.error || 'Failed to delete') }
  }

  const parents = cats.filter(c => !c.parent_id)
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Tag size={20} />Spare Parts Categories</h1>
          <p className="text-sm text-gray-500 mt-0.5">{cats.length} categories</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={15} /> Add Category
          </button>
        )}
      </div>

      {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Category</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Parent</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Description</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Items</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : cats.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No categories yet</td></tr>
            ) : cats.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900 flex items-center gap-2">
                  {c.parent_id && <span className="text-gray-300 ml-3">↳</span>}
                  {c.name}
                </td>
                <td className="px-4 py-3 text-gray-500">{c.parent_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{c.description || '—'}</td>
                <td className="px-4 py-3 text-right text-gray-700">{c.item_count || 0}</td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={14} /></button>
                      <button onClick={() => setDelId(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">{editId ? 'Edit Category' : 'Add Category'}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={lbl}>Category Name *</label>
                <input className={inp} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Hydraulic Parts" />
              </div>
              <div>
                <label className={lbl}>Parent Category (for sub-categories)</label>
                <select className={inp} value={form.parent_id} onChange={e => setForm(f => ({...f, parent_id: e.target.value}))}>
                  <option value="">— Root Category —</option>
                  {parents.filter(p => p.id !== editId).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Description</label>
                <textarea className={inp} rows={2} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setModal(false)} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {delId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="font-semibold text-gray-900 mb-2">Delete Category?</p>
            <p className="text-sm text-gray-500 mb-5">This will remove the category from the system.</p>
            <div className="flex gap-3">
              <button onClick={del} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
              <button onClick={() => setDelId(null)} className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm py-2">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
