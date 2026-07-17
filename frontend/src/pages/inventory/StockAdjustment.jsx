import { useState, useEffect, useCallback } from 'react'
import { getStockAdjustments, getStockAdjustment, createStockAdjustment, approveStockAdjustment, deleteStockAdjustment, getWarehouses, getInventoryItems, getInventoryItem } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Plus, X, Eye, CheckCircle, Trash2, RefreshCw, SlidersHorizontal } from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
const fmtNum  = v => v != null ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'

const STATUS_BADGE = {
  pending:  'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
}

const emptyRow = () => ({ item_id: '', system_qty: 0, physical_qty: '', remarks: '' })

export default function StockAdjustment() {
  const { isAdmin } = useAuth()
  const [adjustments, setAdjustments] = useState([])
  const [loading, setLoading]         = useState(false)
  const [filterStatus, setFilter]     = useState('')
  const [modal, setModal]             = useState(false)
  const [viewModal, setViewModal]     = useState(null)
  const [warehouses, setWarehouses]   = useState([])
  const [items, setItems]             = useState([])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [delId, setDelId]             = useState(null)

  const [form, setForm] = useState({
    adjustment_date: today(), warehouse_id: '', reason: '', remarks: '', items: [emptyRow()]
  })

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await getStockAdjustments({ status: filterStatus || undefined }); setAdjustments(r.data.data) }
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
  const updateRow = async (i, field, val) => {
    setForm(f => {
      const rows = [...f.items]; rows[i] = { ...rows[i], [field]: val }; return { ...f, items: rows }
    })
    if (field === 'item_id' && val && form.warehouse_id) {
      try {
        const r = await getInventoryItem(val)
        const stock = r.data.data.current_stock || 0
        setForm(f => {
          const rows = [...f.items]; rows[i] = { ...rows[i], system_qty: stock }; return { ...f, items: rows }
        })
      } catch {}
    }
  }

  const save = async () => {
    if (!form.warehouse_id || !form.reason) { setError('Warehouse and Reason are required'); return }
    if (form.items.some(r => !r.item_id || r.physical_qty === '')) { setError('All rows must have item and physical qty'); return }
    setSaving(true); setError('')
    try { await createStockAdjustment(form); setModal(false); load() }
    catch (err) { setError(err.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  const handleApprove = async (id) => {
    if (!window.confirm('Approve adjustment? Stock will be updated.')) return
    try { await approveStockAdjustment(id); load() }
    catch (err) { alert(err.response?.data?.error || 'Failed') }
  }

  const handleDel = async () => {
    try { await deleteStockAdjustment(delId); setDelId(null); load() }
    catch (err) { alert(err.response?.data?.error || 'Failed') }
  }

  const openView = async (id) => {
    try { const r = await getStockAdjustment(id); setViewModal(r.data.data) } catch {}
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><SlidersHorizontal size={20} />Stock Adjustment</h1>
          <p className="text-sm text-gray-500 mt-0.5">{adjustments.length} adjustments</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
          </select>
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
          <button onClick={() => { setForm({ adjustment_date: today(), warehouse_id: '', reason: '', remarks: '', items: [emptyRow()] }); setError(''); setModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={15} /> New Adjustment
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Adj. No.</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Warehouse</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Items</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Reason</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Created By</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : adjustments.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400">No adjustments</td></tr>
            ) : adjustments.map(a => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{a.adjustment_number}</td>
                <td className="px-4 py-3">{fmtDate(a.adjustment_date)}</td>
                <td className="px-4 py-3">{a.warehouse_name}</td>
                <td className="px-4 py-3 text-right">{a.item_count}</td>
                <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{a.reason}</td>
                <td className="px-4 py-3 text-gray-500">{a.created_by_name}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[a.status] || 'bg-gray-100'}`}>{a.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openView(a.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={13} /></button>
                    {isAdmin && a.status === 'pending' && (
                      <>
                        <button onClick={() => handleApprove(a.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Approve"><CheckCircle size={13} /></button>
                        <button onClick={() => setDelId(a.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={13} /></button>
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
              <h2 className="font-semibold text-gray-900">New Stock Adjustment</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={lbl}>Adjustment Date *</label>
                  <input type="date" className={inp} value={form.adjustment_date} onChange={e => setForm(f => ({...f, adjustment_date: e.target.value}))} />
                </div>
                <div>
                  <label className={lbl}>Warehouse *</label>
                  <select className={inp} value={form.warehouse_id} onChange={e => setForm(f => ({...f, warehouse_id: e.target.value}))}>
                    <option value="">— Select —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Reason *</label>
                  <input className={inp} value={form.reason} onChange={e => setForm(f => ({...f, reason: e.target.value}))} placeholder="Physical count, damage, etc." />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items</p>
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Spare Part</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 w-28">System Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 w-28">Physical Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 w-28">Difference</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Remarks</th>
                    <th className="px-3 py-2 w-8" />
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.items.map((row, i) => {
                      const diff = (parseFloat(row.physical_qty) || 0) - (parseFloat(row.system_qty) || 0)
                      return (
                        <tr key={i} className="bg-white">
                          <td className="px-3 py-2">
                            <select className="w-full border border-gray-200 rounded px-2 py-1 text-sm" value={row.item_id} onChange={e => updateRow(i, 'item_id', e.target.value)}>
                              <option value="">— Select —</option>
                              {items.map(it => <option key={it.id} value={it.id}>{it.part_code} - {it.part_name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{fmtNum(row.system_qty)}</td>
                          <td className="px-3 py-2">
                            <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" value={row.physical_qty} onChange={e => updateRow(i, 'physical_qty', e.target.value)} min="0" step="0.001" />
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold ${diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {row.physical_qty !== '' ? (diff > 0 ? '+' : '') + fmtNum(diff) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <input className="w-full border border-gray-200 rounded px-2 py-1 text-sm" value={row.remarks} onChange={e => updateRow(i, 'remarks', e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            {form.items.length > 1 && <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600"><X size={14} /></button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <button onClick={addRow} className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"><Plus size={14} /> Add Item</button>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-3">
                <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
                  {saving ? 'Saving…' : 'Submit Adjustment'}
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
              <h2 className="font-semibold text-gray-900">{viewModal.adjustment_number}</h2>
              <button onClick={() => setViewModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 text-sm space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[['Date', fmtDate(viewModal.adjustment_date)], ['Warehouse', viewModal.warehouse_name], ['Reason', viewModal.reason], ['Status', viewModal.status]].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg px-3 py-2"><p className="text-xs text-gray-400">{k}</p><p className="font-medium">{v}</p></div>
                ))}
              </div>
              <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
                <thead className="bg-gray-50"><tr>
                  <th className="px-2 py-2 text-left">Part</th>
                  <th className="px-2 py-2 text-right">System</th>
                  <th className="px-2 py-2 text-right">Physical</th>
                  <th className="px-2 py-2 text-right">Diff</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {(viewModal.items || []).map(it => (
                    <tr key={it.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2">{it.part_name}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(it.system_qty)}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(it.physical_qty)}</td>
                      <td className={`px-2 py-2 text-right font-semibold ${parseFloat(it.difference) > 0 ? 'text-green-700' : parseFloat(it.difference) < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {parseFloat(it.difference) > 0 ? '+' : ''}{fmtNum(it.difference)}
                      </td>
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
            <p className="font-semibold text-gray-900 mb-4">Delete Adjustment?</p>
            <div className="flex gap-3">
              <button onClick={handleDel} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
              <button onClick={() => setDelId(null)} className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
