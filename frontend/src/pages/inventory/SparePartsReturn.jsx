import { useState, useEffect, useCallback } from 'react'
import { getPartsReturns, getPartsReturn, createPartsReturn, getWarehouses, getInventoryItems, getConsumptions } from '../../lib/api'
import { Plus, X, Eye, RefreshCw, RotateCcw } from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'

const CONDITIONS = [
  { value: 'good',    label: 'Good — Return to Inventory', color: 'bg-green-100 text-green-800' },
  { value: 'damaged', label: 'Damaged — Move to Damaged Stock', color: 'bg-amber-100 text-amber-800' },
  { value: 'scrap',   label: 'Scrap', color: 'bg-red-100 text-red-700' },
]

const emptyRow = () => ({ item_id: '', issued_qty: '', return_qty: '', condition: 'good', reason: '', remarks: '' })

export default function SparePartsReturn() {
  const [returns, setReturns]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [modal, setModal]         = useState(false)
  const [viewModal, setViewModal] = useState(null)
  const [warehouses, setWarehouses] = useState([])
  const [items, setItems]         = useState([])
  const [consumptions, setConsumptions] = useState([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const [form, setForm] = useState({
    return_date: today(), consumption_id: '', warehouse_id: '', remarks: '', items: [emptyRow()]
  })

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await getPartsReturns(); setReturns(r.data.data) }
    catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => {
    Promise.all([getWarehouses(), getInventoryItems({ limit: 500 }), getConsumptions({ status: 'approved' })]).then(([w, it, c]) => {
      setWarehouses(w.data.data); setItems(it.data.data); setConsumptions(c.data.data)
    })
  }, [])
  useEffect(() => { load() }, [load])

  const addRow    = () => setForm(f => ({ ...f, items: [...f.items, emptyRow()] }))
  const removeRow = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const updateRow = (i, field, val) => setForm(f => {
    const rows = [...f.items]; rows[i] = { ...rows[i], [field]: val }; return { ...f, items: rows }
  })

  const save = async () => {
    if (!form.warehouse_id) { setError('Warehouse is required'); return }
    if (form.items.some(r => !r.item_id || !r.return_qty)) { setError('All rows must have item and return qty'); return }
    setSaving(true); setError('')
    try { await createPartsReturn(form); setModal(false); load() }
    catch (err) { setError(err.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  const openView = async (id) => {
    try { const r = await getPartsReturn(id); setViewModal(r.data.data) } catch {}
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><RotateCcw size={20} />Spare Parts Return</h1>
          <p className="text-sm text-gray-500 mt-0.5">{returns.length} returns</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
          <button onClick={() => { setForm({ return_date: today(), consumption_id: '', warehouse_id: '', remarks: '', items: [emptyRow()] }); setError(''); setModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={15} /> New Return
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Return No.</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Ref. Consumption</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Warehouse</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Items</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Created By</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : returns.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400">No return records</td></tr>
            ) : returns.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{r.return_number}</td>
                <td className="px-4 py-3">{fmtDate(r.return_date)}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.consumption_number || '—'}</td>
                <td className="px-4 py-3 text-gray-700">{r.warehouse_name}</td>
                <td className="px-4 py-3 text-right">{r.item_count}</td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">{r.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.created_by_name}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openView(r.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-6">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-semibold text-gray-900">New Parts Return</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={lbl}>Return Date *</label>
                  <input type="date" className={inp} value={form.return_date} onChange={e => setForm(f => ({...f, return_date: e.target.value}))} />
                </div>
                <div>
                  <label className={lbl}>Warehouse *</label>
                  <select className={inp} value={form.warehouse_id} onChange={e => setForm(f => ({...f, warehouse_id: e.target.value}))}>
                    <option value="">— Select —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Reference Consumption</label>
                  <select className={inp} value={form.consumption_id} onChange={e => setForm(f => ({...f, consumption_id: e.target.value}))}>
                    <option value="">— None —</option>
                    {consumptions.map(c => <option key={c.id} value={c.id}>{c.consumption_number} ({fmtDate(c.txn_date)})</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className={lbl}>Remarks</label>
                  <input className={inp} value={form.remarks} onChange={e => setForm(f => ({...f, remarks: e.target.value}))} />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Return Items</p>
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Spare Part</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 w-24">Issued Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 w-24">Return Qty</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 w-48">Condition</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Reason</th>
                    <th className="px-3 py-2 w-8" />
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.items.map((row, i) => (
                      <tr key={i} className="bg-white">
                        <td className="px-3 py-2">
                          <select className="w-full border border-gray-200 rounded px-2 py-1 text-sm" value={row.item_id} onChange={e => updateRow(i, 'item_id', e.target.value)}>
                            <option value="">— Select —</option>
                            {items.map(it => <option key={it.id} value={it.id}>{it.part_code} - {it.part_name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" value={row.issued_qty} onChange={e => updateRow(i, 'issued_qty', e.target.value)} min="0" step="0.001" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" value={row.return_qty} onChange={e => updateRow(i, 'return_qty', e.target.value)} min="0" step="0.001" />
                        </td>
                        <td className="px-3 py-2">
                          <select className="w-full border border-gray-200 rounded px-2 py-1 text-sm" value={row.condition} onChange={e => updateRow(i, 'condition', e.target.value)}>
                            {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label.split('—')[0].trim()}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input className="w-full border border-gray-200 rounded px-2 py-1 text-sm" value={row.reason} onChange={e => updateRow(i, 'reason', e.target.value)} />
                        </td>
                        <td className="px-3 py-2">
                          {form.items.length > 1 && <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600"><X size={14} /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={addRow} className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"><Plus size={14} /> Add Item</button>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-3">
                <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
                  {saving ? 'Saving…' : 'Save Return'}
                </button>
                <button onClick={() => setModal(false)} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-semibold text-gray-900">{viewModal.return_number}</h2>
              <button onClick={() => setViewModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 text-sm space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[['Date', fmtDate(viewModal.return_date)], ['Warehouse', viewModal.warehouse_name], ['Ref. Consumption', viewModal.consumption_number || '—'], ['Status', viewModal.status]].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg px-3 py-2"><p className="text-xs text-gray-400">{k}</p><p className="font-medium">{v}</p></div>
                ))}
              </div>
              <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
                <thead className="bg-gray-50"><tr>
                  <th className="px-2 py-2 text-left">Part</th>
                  <th className="px-2 py-2 text-right">Return Qty</th>
                  <th className="px-2 py-2 text-center">Condition</th>
                  <th className="px-2 py-2 text-left">Reason</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {(viewModal.items || []).map(it => {
                    const cond = CONDITIONS.find(c => c.value === it.condition)
                    return (
                      <tr key={it.id} className="hover:bg-gray-50">
                        <td className="px-2 py-2">{it.part_name}</td>
                        <td className="px-2 py-2 text-right">{it.return_qty} {it.unit}</td>
                        <td className="px-2 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cond?.color || 'bg-gray-100'}`}>{it.condition}</span>
                        </td>
                        <td className="px-2 py-2 text-gray-500">{it.reason || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
