import { useState, useEffect, useCallback } from 'react'
import { getStockTransfers, getStockTransfer, createStockTransfer, approveStockTransfer, deleteStockTransfer, getWarehouses, getInventoryItems } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Plus, X, Eye, CheckCircle, Trash2, RefreshCw, ArrowRightLeft } from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'

const STATUS_BADGE = {
  draft:    'bg-gray-100 text-gray-700',
  received: 'bg-green-100 text-green-800',
  cancelled:'bg-red-100 text-red-700',
}

const emptyRow = () => ({ item_id: '', requested_qty: '', remarks: '' })

export default function StockTransfer() {
  const { isAdmin } = useAuth()
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading]     = useState(false)
  const [filterStatus, setFilter] = useState('')
  const [modal, setModal]         = useState(false)
  const [viewModal, setViewModal] = useState(null)
  const [warehouses, setWarehouses] = useState([])
  const [items, setItems]         = useState([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [delId, setDelId]         = useState(null)

  const [form, setForm] = useState({
    transfer_date: today(), from_warehouse_id: '', to_warehouse_id: '',
    reason: '', remarks: '', items: [emptyRow()]
  })

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await getStockTransfers({ status: filterStatus || undefined }); setTransfers(r.data.data) }
    catch {} finally { setLoading(false) }
  }, [filterStatus])

  useEffect(() => {
    Promise.all([getWarehouses(), getInventoryItems({ limit: 500 })]).then(([w, it]) => {
      setWarehouses(w.data.data); setItems(it.data.data)
    })
  }, [])
  useEffect(() => { load() }, [load])

  const addRow    = () => setForm(f => ({ ...f, items: [...f.items, emptyRow()] }))
  const removeRow = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const updateRow = (i, field, val) => setForm(f => {
    const rows = [...f.items]; rows[i] = { ...rows[i], [field]: val }; return { ...f, items: rows }
  })

  const save = async () => {
    if (!form.from_warehouse_id || !form.to_warehouse_id) { setError('From and To warehouses are required'); return }
    if (form.from_warehouse_id === form.to_warehouse_id) { setError('From and To warehouses must be different'); return }
    if (form.items.some(r => !r.item_id || !r.requested_qty)) { setError('All rows must have item and quantity'); return }
    setSaving(true); setError('')
    try { await createStockTransfer(form); setModal(false); load() }
    catch (err) { setError(err.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  const handleApprove = async (id) => {
    if (!window.confirm('Approve transfer? Stock will be moved.')) return
    try { await approveStockTransfer(id); load() }
    catch (err) { alert(err.response?.data?.error || 'Failed') }
  }

  const handleDel = async () => {
    try { await deleteStockTransfer(delId); setDelId(null); load() }
    catch (err) { alert(err.response?.data?.error || 'Failed') }
  }

  const openView = async (id) => {
    try { const r = await getStockTransfer(id); setViewModal(r.data.data) } catch {}
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><ArrowRightLeft size={20} />Stock Transfer</h1>
          <p className="text-sm text-gray-500 mt-0.5">{transfers.length} transfers</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="received">Received</option>
          </select>
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
          <button onClick={() => { setForm({ transfer_date: today(), from_warehouse_id: '', to_warehouse_id: '', reason: '', remarks: '', items: [emptyRow()] }); setError(''); setModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={15} /> New Transfer
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Transfer No.</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">From</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">To</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Items</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Reason</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : transfers.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400">No transfers</td></tr>
            ) : transfers.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{t.transfer_number}</td>
                <td className="px-4 py-3">{fmtDate(t.transfer_date)}</td>
                <td className="px-4 py-3">{t.from_warehouse_name}</td>
                <td className="px-4 py-3">{t.to_warehouse_name}</td>
                <td className="px-4 py-3 text-right">{t.item_count}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{t.reason || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[t.status] || 'bg-gray-100'}`}>{t.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openView(t.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={13} /></button>
                    {isAdmin && t.status === 'draft' && (
                      <>
                        <button onClick={() => handleApprove(t.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Approve"><CheckCircle size={13} /></button>
                        <button onClick={() => setDelId(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
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
              <h2 className="font-semibold text-gray-900">New Stock Transfer</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={lbl}>Transfer Date *</label>
                  <input type="date" className={inp} value={form.transfer_date} onChange={e => setForm(f => ({...f, transfer_date: e.target.value}))} />
                </div>
                <div>
                  <label className={lbl}>From Warehouse *</label>
                  <select className={inp} value={form.from_warehouse_id} onChange={e => setForm(f => ({...f, from_warehouse_id: e.target.value}))}>
                    <option value="">— Select —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>To Warehouse *</label>
                  <select className={inp} value={form.to_warehouse_id} onChange={e => setForm(f => ({...f, to_warehouse_id: e.target.value}))}>
                    <option value="">— Select —</option>
                    {warehouses.filter(w => w.id !== parseInt(form.from_warehouse_id)).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={lbl}>Reason</label>
                  <input className={inp} value={form.reason} onChange={e => setForm(f => ({...f, reason: e.target.value}))} />
                </div>
                <div>
                  <label className={lbl}>Remarks</label>
                  <input className={inp} value={form.remarks} onChange={e => setForm(f => ({...f, remarks: e.target.value}))} />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items</p>
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Spare Part</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 w-32">Qty</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Remarks</th>
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
                          <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" value={row.requested_qty} onChange={e => updateRow(i, 'requested_qty', e.target.value)} min="0" step="0.001" />
                        </td>
                        <td className="px-3 py-2">
                          <input className="w-full border border-gray-200 rounded px-2 py-1 text-sm" value={row.remarks} onChange={e => updateRow(i, 'remarks', e.target.value)} />
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
                  {saving ? 'Saving…' : 'Create Transfer'}
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
              <h2 className="font-semibold text-gray-900">{viewModal.transfer_number}</h2>
              <button onClick={() => setViewModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 text-sm space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[['Date', fmtDate(viewModal.transfer_date)], ['From', viewModal.from_warehouse_name], ['To', viewModal.to_warehouse_name], ['Status', viewModal.status]].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg px-3 py-2"><p className="text-xs text-gray-400">{k}</p><p className="font-medium">{v}</p></div>
                ))}
              </div>
              <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
                <thead className="bg-gray-50"><tr>
                  <th className="px-2 py-2 text-left">Part</th>
                  <th className="px-2 py-2 text-right">Requested</th>
                  <th className="px-2 py-2 text-left">Remarks</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {(viewModal.items || []).map(it => (
                    <tr key={it.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2">{it.part_name} <span className="text-gray-400">({it.part_code})</span></td>
                      <td className="px-2 py-2 text-right">{it.requested_qty} {it.unit}</td>
                      <td className="px-2 py-2 text-gray-500">{it.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {delId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
            <p className="font-semibold text-gray-900 mb-2">Delete Transfer?</p>
            <div className="flex gap-3 mt-4">
              <button onClick={handleDel} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
              <button onClick={() => setDelId(null)} className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
