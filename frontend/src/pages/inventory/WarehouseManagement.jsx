import { useState, useEffect } from 'react'
import {
  getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse,
  getWarehouseLocations, createWarehouseLocation, deleteWarehouseLocation,
  getProjects
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Plus, Edit2, Trash2, X, Warehouse, ChevronDown, ChevronRight, MapPin } from 'lucide-react'

const emptyWH = () => ({ code: '', name: '', project_id: '', manager: '', contact: '', address: '' })
const emptyLoc = () => ({ rack: '', shelf: '', bin: '' })

export default function WarehouseManagement() {
  const { isAdmin } = useAuth()
  const [warehouses, setWarehouses] = useState([])
  const [projects, setProjects]     = useState([])
  const [loading, setLoading]       = useState(false)
  const [expanded, setExpanded]     = useState({})
  const [locations, setLocations]   = useState({})
  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState(emptyWH())
  const [editId, setEditId]         = useState(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [delId, setDelId]           = useState(null)
  const [locModal, setLocModal]     = useState(null)
  const [locForm, setLocForm]       = useState(emptyLoc())
  const [savingLoc, setSavingLoc]   = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [wr, pr] = await Promise.all([getWarehouses(), getProjects()])
      setWarehouses(wr.data.data); setProjects(pr.data.data)
    } catch { setError('Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const toggleExpand = async (id) => {
    setExpanded(e => ({ ...e, [id]: !e[id] }))
    if (!expanded[id] && !locations[id]) {
      try {
        const r = await getWarehouseLocations(id)
        setLocations(l => ({ ...l, [id]: r.data.data }))
      } catch {}
    }
  }

  const openAdd  = () => { setForm(emptyWH()); setEditId(null); setError(''); setModal(true) }
  const openEdit = (w) => {
    setForm({ code: w.code, name: w.name, project_id: w.project_id || '', manager: w.manager || '', contact: w.contact || '', address: w.address || '' })
    setEditId(w.id); setError(''); setModal(true)
  }

  const save = async () => {
    if (!form.code || !form.name) { setError('Code and Name are required'); return }
    setSaving(true); setError('')
    try {
      if (editId) await updateWarehouse(editId, form)
      else        await createWarehouse(form)
      setModal(false); load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const del = async () => {
    try { await deleteWarehouse(delId); setDelId(null); load() }
    catch (err) { alert(err.response?.data?.error || 'Failed to delete') }
  }

  const addLocation = async () => {
    setSavingLoc(true)
    try {
      await createWarehouseLocation(locModal, locForm)
      const r = await getWarehouseLocations(locModal)
      setLocations(l => ({ ...l, [locModal]: r.data.data }))
      setLocModal(null); setLocForm(emptyLoc())
    } catch (err) { alert(err.response?.data?.error || 'Failed to add') }
    finally { setSavingLoc(false) }
  }

  const delLocation = async (wid, lid) => {
    if (!window.confirm('Delete this location?')) return
    try {
      await deleteWarehouseLocation(wid, lid)
      setLocations(l => ({ ...l, [wid]: l[wid].filter(x => x.id !== lid) }))
    } catch (err) { alert(err.response?.data?.error || 'Failed to delete') }
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Warehouse size={20} />Warehouse Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{warehouses.length} warehouses</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={15} /> Add Warehouse
          </button>
        )}
      </div>

      {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : warehouses.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">No warehouses yet</div>
        ) : warehouses.map(w => (
          <div key={w.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => toggleExpand(w.id)} className="text-gray-400 hover:text-gray-700">
                {expanded[w.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">{w.code}</span>
                  <span className="font-semibold text-gray-900">{w.name}</span>
                  <span className="text-xs text-gray-400">{w.project_name || ''}</span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  {w.manager && <span>Manager: <strong>{w.manager}</strong></span>}
                  {w.contact && <span>Contact: {w.contact}</span>}
                  <span>{w.location_count || 0} locations</span>
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <button onClick={() => { setLocModal(w.id); setLocForm(emptyLoc()) }} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 flex items-center gap-1">
                    <Plus size={11} /> Location
                  </button>
                  <button onClick={() => openEdit(w)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={14} /></button>
                  <button onClick={() => setDelId(w.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                </div>
              )}
            </div>

            {/* Locations */}
            {expanded[w.id] && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1"><MapPin size={11} />Locations</p>
                {!locations[w.id] ? (
                  <p className="text-xs text-gray-400">Loading…</p>
                ) : locations[w.id].length === 0 ? (
                  <p className="text-xs text-gray-400">No locations defined</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {locations[w.id].map(loc => (
                      <div key={loc.id} className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs">
                        <span className="text-gray-700">
                          {[loc.rack && `R:${loc.rack}`, loc.shelf && `S:${loc.shelf}`, loc.bin && `B:${loc.bin}`].filter(Boolean).join(' / ') || 'Default'}
                        </span>
                        {isAdmin && (
                          <button onClick={() => delLocation(w.id, loc.id)} className="text-red-400 hover:text-red-600 ml-1"><X size={11} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Warehouse Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">{editId ? 'Edit Warehouse' : 'Add Warehouse'}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Warehouse Code *</label>
                  <input className={inp} value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value.toUpperCase()}))} placeholder="WH-01" />
                </div>
                <div>
                  <label className={lbl}>Warehouse Name *</label>
                  <input className={inp} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Main Store" />
                </div>
              </div>
              <div>
                <label className={lbl}>Site / Project</label>
                <select className={inp} value={form.project_id} onChange={e => setForm(f => ({...f, project_id: e.target.value}))}>
                  <option value="">— Select Site —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Manager</label>
                  <input className={inp} value={form.manager} onChange={e => setForm(f => ({...f, manager: e.target.value}))} />
                </div>
                <div>
                  <label className={lbl}>Contact</label>
                  <input className={inp} value={form.contact} onChange={e => setForm(f => ({...f, contact: e.target.value}))} />
                </div>
              </div>
              <div>
                <label className={lbl}>Address</label>
                <textarea className={inp} rows={2} value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} />
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

      {/* Add Location Modal */}
      {locModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Add Location</h2>
              <button onClick={() => setLocModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className={lbl}>Rack</label>
                <input className={inp} value={locForm.rack} onChange={e => setLocForm(f => ({...f, rack: e.target.value}))} placeholder="R1" />
              </div>
              <div>
                <label className={lbl}>Shelf</label>
                <input className={inp} value={locForm.shelf} onChange={e => setLocForm(f => ({...f, shelf: e.target.value}))} placeholder="S1" />
              </div>
              <div>
                <label className={lbl}>Bin</label>
                <input className={inp} value={locForm.bin} onChange={e => setLocForm(f => ({...f, bin: e.target.value}))} placeholder="B1" />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={addLocation} disabled={savingLoc} className="flex-1 bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-medium">
                  {savingLoc ? 'Adding…' : 'Add Location'}
                </button>
                <button onClick={() => setLocModal(null)} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {delId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="font-semibold text-gray-900 mb-2">Delete Warehouse?</p>
            <p className="text-sm text-gray-500 mb-5">This will deactivate the warehouse.</p>
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
