import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, Check, Gauge } from 'lucide-react'
import { getReadingTypes, createReadingType, updateReadingType, deleteReadingType } from '../../lib/api'

const UNITS = ['Hrs', 'Km', 'Rpm', 'Bar', 'L', 'Ton', 'Cycle']
const blank = { code: '', name: '', unit: 'Hrs', input_type: 'Number', decimal_allowed: true }

export default function ReadingMaster() {
  const [types,   setTypes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [form,    setForm]    = useState(blank)
  const [editing, setEditing] = useState(null) // id being edited
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setTypes((await getReadingTypes()).data.data) } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setForm(blank); setEditing(null); setError(''); setShowForm(true) }
  const openEdit = (t) => {
    setForm({ code: t.code, name: t.name, unit: t.unit, input_type: t.input_type, decimal_allowed: t.decimal_allowed })
    setEditing(t.id); setError(''); setShowForm(true)
  }
  const cancel = () => { setShowForm(false); setError('') }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) { setError('Code and Name are required'); return }
    setSaving(true); setError('')
    try {
      if (editing) await updateReadingType(editing, { name: form.name, unit: form.unit, input_type: form.input_type, decimal_allowed: form.decimal_allowed })
      else         await createReadingType(form)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const del = async (t) => {
    if (!confirm(`Delete reading type "${t.code}"? This cannot be undone.`)) return
    try { await deleteReadingType(t.id); await load() }
    catch (err) { alert(err.response?.data?.error || 'Delete failed') }
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Gauge size={20} className="text-blue-600" /> Reading Master
          </h1>
          <p className="text-sm text-gray-500 mt-1">Define reading types used by equipment (Hours, KM, RPM, etc.)</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus size={15} /> Add Reading Type
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{editing ? 'Edit Reading Type' : 'New Reading Type'}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <label className={lbl}>Code *</label>
              <input className={inp} value={form.code} readOnly={!!editing}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '_') }))}
                placeholder="ENG_HRS" style={editing ? { background: '#f9fafb', color: '#6b7280' } : {}} />
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className={lbl}>Name *</label>
              <input className={inp} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Engine Hours" />
            </div>
            <div>
              <label className={lbl}>Unit</label>
              <select className={inp} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={form.decimal_allowed}
                  onChange={e => setForm(f => ({ ...f, decimal_allowed: e.target.checked }))}
                  className="rounded" />
                Decimal Allowed
              </label>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              <Check size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={cancel} className="flex items-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm px-4 py-2 rounded-lg transition-colors">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Code</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Unit</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Decimal</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Mapped To</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Machines</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Loading…</td></tr>
            ) : types.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">No reading types defined yet.</td></tr>
            ) : (
              types.map(t => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded">{t.code}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-800 font-medium">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {t.decimal_allowed
                      ? <span className="text-green-500 text-xs font-bold">Yes</span>
                      : <span className="text-gray-400 text-xs">No</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                      {t.mapping_count} eq. types
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                      {t.machine_count} machines
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(t)}
                        className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => del(t)} disabled={t.mapping_count > 0 || t.machine_count > 0}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
