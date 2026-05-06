import { useState, useEffect } from 'react'
import { getProjects, createProject, updateProject, deleteProject, getUsers } from '../../lib/api'
import { Plus, Edit2, Trash2, X, MapPin, Users, Hash } from 'lucide-react'

const blank = { name: '', address: '', code: '', user_ids: [] }

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [users, setUsers]       = useState([])
  const [modal, setModal]       = useState(null)   // null | 'add' | { edit: project }
  const [form, setForm]         = useState(blank)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const load = () => getProjects().then(r => setProjects(r.data.data))

  useEffect(() => {
    load()
    getUsers().then(r => setUsers(r.data.data.filter(u => u.role !== 'admin' && u.active)))
  }, [])

  const openAdd = () => { setForm(blank); setError(''); setModal('add') }

  const openEdit = (p) => {
    setForm({
      name:     p.name,
      address:  p.address || '',
      code:     p.code,
      user_ids: p.linked_user_ids || [],
    })
    setError('')
    setModal({ edit: p })
  }

  const toggleUser = (id) =>
    setForm(f => ({
      ...f,
      user_ids: f.user_ids.includes(id)
        ? f.user_ids.filter(x => x !== id)
        : [...f.user_ids, id]
    }))

  const save = async () => {
    setError('')
    if (!form.name.trim())    { setError('Project name is required'); return }
    if (!form.address.trim()) { setError('Site address is required'); return }
    setSaving(true)
    try {
      const payload = {
        name:     form.name.trim(),
        address:  form.address.trim(),
        code:     form.code.trim() || undefined,
        user_ids: form.user_ids,
      }
      if (modal === 'add') {
        await createProject(payload)
      } else {
        await updateProject(modal.edit.id, payload)
      }
      setModal(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  const del = async (p) => {
    if (!confirm(`Deactivate project "${p.name}"? All linked users will lose access.`)) return
    await deleteProject(p.id)
    load()
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors"
        >
          <Plus size={15} />New Project
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Site Code', 'Project Name', 'Site Address', 'Linked Users', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projects.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No projects yet</td></tr>
            )}
            {projects.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded text-xs">{p.code}</span>
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 text-gray-500 max-w-52">
                  <span className="flex items-start gap-1">
                    <MapPin size={11} className="mt-0.5 flex-shrink-0 text-gray-400" />
                    {p.address || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.linked_users?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {p.linked_users.map(name => (
                        <span key={name} className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs">{name}</span>
                      ))}
                    </div>
                  ) : <span className="text-gray-400">None</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">Active</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 size={13} /></button>
                    <button onClick={() => del(p)}      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-semibold text-gray-900">
                {modal === 'add' ? 'New Project' : `Edit — ${modal.edit.name}`}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Project Name */}
              <div>
                <label className={lbl}>Project Name *</label>
                <input
                  type="text" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inp} placeholder="e.g. RVR Highway Phase 2"
                />
              </div>

              {/* Site Address */}
              <div>
                <label className={lbl}>
                  <span className="flex items-center gap-1"><MapPin size={11} />Site Address *</span>
                </label>
                <textarea
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className={inp + ' resize-none'} rows={2}
                  placeholder="Full site address…"
                />
              </div>

              {/* Site Code */}
              <div>
                <label className={lbl}>
                  <span className="flex items-center gap-1"><Hash size={11} />Site Code <span className="text-gray-400 font-normal">(optional — auto-generated if blank)</span></span>
                </label>
                <input
                  type="text" value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className={inp + (modal !== 'add' ? ' bg-gray-50 text-gray-400' : '')}
                  placeholder="e.g. RHP2"
                  readOnly={modal !== 'add'}
                  maxLength={10}
                />
                {modal !== 'add' && <p className="text-xs text-gray-400 mt-1">Site code cannot be changed after creation.</p>}
              </div>

              {/* Users to link */}
              <div>
                <label className={lbl}>
                  <span className="flex items-center gap-1"><Users size={11} />Link Users to this Project *</span>
                </label>
                {users.length === 0 ? (
                  <p className="text-xs text-gray-400">No operator users found. Add users in Admin → Users first.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-1 max-h-48 overflow-y-auto pr-1">
                    {users.map(u => (
                      <button
                        key={u.id} type="button"
                        onClick={() => toggleUser(u.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-colors ${
                          form.user_ids.includes(u.id)
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${form.user_ids.includes(u.id) ? 'bg-blue-500' : 'bg-gray-300'}`} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{u.name}</p>
                          <p className="text-gray-400 truncate">@{u.username}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {form.user_ids.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1.5">{form.user_ids.length} user{form.user_ids.length !== 1 ? 's' : ''} selected</p>
                )}
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
              <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Saving…' : modal === 'add' ? 'Create Project' : 'Save Changes'}
              </button>
              <button onClick={() => setModal(null)} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
