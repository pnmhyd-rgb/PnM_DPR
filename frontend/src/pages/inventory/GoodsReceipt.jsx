import { useState, useEffect, useCallback } from 'react'
import { getGRNs, getGRN, createGRN, approveGRN, deleteGRN, getWarehouses, getHireVendors, getInventoryItems } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Plus, X, Eye, CheckCircle, Trash2, RefreshCw, Search, FileCheck } from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]
const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
const fmtMoney = v => v != null ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'

const STATUS_BADGE = {
  draft:    'bg-gray-100 text-gray-700',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

const emptyItem = () => ({ item_id: '', ordered_qty: '', received_qty: '', accepted_qty: '', rejected_qty: 0, rate: '', gst_percent: 18, location_id: '', remarks: '' })

export default function GoodsReceipt() {
  const { isAdmin } = useAuth()
  const [grns, setGrns]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal]       = useState(false)
  const [viewModal, setViewModal] = useState(null)
  const [warehouses, setWarehouses] = useState([])
  const [vendors, setVendors]     = useState([])
  const [items, setItems]         = useState([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [delId, setDelId]         = useState(null)

  const [form, setForm] = useState({
    po_number: '', vendor_id: '', invoice_number: '', grn_date: today(), warehouse_id: '', remarks: '',
    items: [emptyItem()]
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getGRNs({ status: filterStatus || undefined })
      setGrns(r.data.data)
    } catch {}
    finally { setLoading(false) }
  }, [filterStatus])

  useEffect(() => {
    Promise.all([getWarehouses(), getHireVendors(), getInventoryItems({ limit: 500 })]).then(([w, v, it]) => {
      setWarehouses(w.data.data); setVendors(v.data.data); setItems(it.data.data)
    })
  }, [])

  useEffect(() => { load() }, [load])

  const addRow    = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))
  const removeRow = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const updateRow = (i, field, val) => setForm(f => {
    const items = [...f.items]
    items[i] = { ...items[i], [field]: val }
    if (field === 'received_qty') items[i].accepted_qty = val
    if (field === 'item_id') {
      const found = items.find(it => it.id === parseInt(val))
      if (found) items[i].rate = found.purchase_price || found.average_cost || ''
    }
    return { ...f, items }
  })

  const calcTotals = () => {
    let sub = 0, gst = 0
    form.items.forEach(it => {
      const base = (parseFloat(it.accepted_qty) || 0) * (parseFloat(it.rate) || 0)
      const g = base * (parseFloat(it.gst_percent) || 0) / 100
      sub += base; gst += g
    })
    return { sub, gst, total: sub + gst }
  }

  const save = async () => {
    if (!form.grn_date || !form.warehouse_id) { setError('GRN Date and Warehouse are required'); return }
    if (form.items.some(it => !it.item_id || !it.accepted_qty || !it.rate)) { setError('All item rows must have item, accepted qty and rate'); return }
    setSaving(true); setError('')
    try {
      await createGRN(form)
      setModal(false); load()
    } catch (err) { setError(err.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this GRN? Stock will be updated.')) return
    try { await approveGRN(id); load() }
    catch (err) { alert(err.response?.data?.error || 'Failed to approve') }
  }

  const handleDel = async () => {
    try { await deleteGRN(delId); setDelId(null); load() }
    catch (err) { alert(err.response?.data?.error || 'Failed to delete') }
  }

  const openView = async (id) => {
    try { const r = await getGRN(id); setViewModal(r.data.data) } catch {}
  }

  const { sub, gst, total } = calcTotals()
  const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><FileCheck size={20} />Goods Receipt (GRN)</h1>
          <p className="text-sm text-gray-500 mt-0.5">{grns.length} records</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
          </select>
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
          <button onClick={() => { setForm({ po_number: '', vendor_id: '', invoice_number: '', grn_date: today(), warehouse_id: '', remarks: '', items: [emptyItem()] }); setError(''); setModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={15} /> New GRN
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">GRN No.</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Vendor</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Invoice No.</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Warehouse</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Items</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Total</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : grns.length === 0 ? (
              <tr><td colSpan={9} className="py-10 text-center text-gray-400">No GRN records</td></tr>
            ) : grns.map(g => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{g.grn_number}</td>
                <td className="px-4 py-3">{fmtDate(g.grn_date)}</td>
                <td className="px-4 py-3 text-gray-700">{g.vendor_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{g.invoice_number || '—'}</td>
                <td className="px-4 py-3 text-gray-700">{g.warehouse_name}</td>
                <td className="px-4 py-3 text-right">{g.item_count}</td>
                <td className="px-4 py-3 text-right font-semibold">{fmtMoney(g.total_amount)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[g.status] || 'bg-gray-100 text-gray-600'}`}>{g.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openView(g.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={13} /></button>
                    {isAdmin && g.status === 'draft' && (
                      <>
                        <button onClick={() => handleApprove(g.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Approve"><CheckCircle size={13} /></button>
                        <button onClick={() => setDelId(g.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create GRN Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-6">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-semibold text-gray-900">New Goods Receipt (GRN)</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={lbl}>GRN Date *</label>
                  <input type="date" className={inp} value={form.grn_date} onChange={e => setForm(f => ({...f, grn_date: e.target.value}))} />
                </div>
                <div>
                  <label className={lbl}>Warehouse *</label>
                  <select className={inp} value={form.warehouse_id} onChange={e => setForm(f => ({...f, warehouse_id: e.target.value}))}>
                    <option value="">— Select —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Vendor</label>
                  <select className={inp} value={form.vendor_id} onChange={e => setForm(f => ({...f, vendor_id: e.target.value}))}>
                    <option value="">— Select —</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>PO Number</label>
                  <input className={inp} value={form.po_number} onChange={e => setForm(f => ({...f, po_number: e.target.value}))} />
                </div>
                <div>
                  <label className={lbl}>Invoice Number</label>
                  <input className={inp} value={form.invoice_number} onChange={e => setForm(f => ({...f, invoice_number: e.target.value}))} />
                </div>
                <div>
                  <label className={lbl}>Remarks</label>
                  <input className={inp} value={form.remarks} onChange={e => setForm(f => ({...f, remarks: e.target.value}))} />
                </div>
              </div>

              {/* Items Grid */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Spare Part</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-24">Ordered</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-24">Received</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-24">Accepted</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-24">Rejected</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-28">Rate (₹)</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-20">GST %</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-32">Amount</th>
                        <th className="px-3 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {form.items.map((row, i) => {
                        const amt = (parseFloat(row.accepted_qty) || 0) * (parseFloat(row.rate) || 0) * (1 + (parseFloat(row.gst_percent) || 0) / 100)
                        return (
                          <tr key={i} className="bg-white">
                            <td className="px-3 py-2">
                              <select className="w-full border border-gray-200 rounded px-2 py-1 text-sm" value={row.item_id} onChange={e => updateRow(i, 'item_id', e.target.value)}>
                                <option value="">— Select —</option>
                                {items.map(it => <option key={it.id} value={it.id}>{it.part_code} - {it.part_name}</option>)}
                              </select>
                            </td>
                            {['ordered_qty', 'received_qty', 'accepted_qty', 'rejected_qty'].map(f => (
                              <td key={f} className="px-3 py-2">
                                <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" value={row[f]} onChange={e => updateRow(i, f, e.target.value)} step="0.001" min="0" />
                              </td>
                            ))}
                            <td className="px-3 py-2">
                              <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" value={row.rate} onChange={e => updateRow(i, 'rate', e.target.value)} step="0.01" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" value={row.gst_percent} onChange={e => updateRow(i, 'gst_percent', e.target.value)} step="0.1" />
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-gray-800">₹{(amt || 0).toFixed(2)}</td>
                            <td className="px-3 py-2">
                              {form.items.length > 1 && (
                                <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={7} className="px-3 py-2 text-right text-xs text-gray-500">Sub Total</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(sub)}</td>
                        <td />
                      </tr>
                      <tr>
                        <td colSpan={7} className="px-3 py-2 text-right text-xs text-gray-500">GST</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(gst)}</td>
                        <td />
                      </tr>
                      <tr>
                        <td colSpan={7} className="px-3 py-2 text-right text-sm font-bold text-gray-900">Total</td>
                        <td className="px-3 py-2 text-right text-base font-bold text-blue-700">{fmtMoney(total)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <button onClick={addRow} className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                  <Plus size={14} /> Add Item
                </button>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
                  {saving ? 'Saving…' : 'Save GRN (Draft)'}
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-semibold text-gray-900">{viewModal.grn_number}</h2>
              <button onClick={() => setViewModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                {[['Date', fmtDate(viewModal.grn_date)], ['Vendor', viewModal.vendor_name || '—'], ['Invoice', viewModal.invoice_number || '—'], ['Warehouse', viewModal.warehouse_name], ['Status', viewModal.status]].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg px-3 py-2"><p className="text-xs text-gray-400">{k}</p><p className="font-medium">{v}</p></div>
                ))}
              </div>
              <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
                <thead className="bg-gray-50"><tr>
                  <th className="px-2 py-2 text-left">Part</th>
                  <th className="px-2 py-2 text-right">Accepted</th>
                  <th className="px-2 py-2 text-right">Rejected</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {(viewModal.items || []).map(it => (
                    <tr key={it.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2">{it.part_name} <span className="text-gray-400">({it.part_code})</span></td>
                      <td className="px-2 py-2 text-right">{it.accepted_qty} {it.unit}</td>
                      <td className="px-2 py-2 text-right text-red-600">{it.rejected_qty}</td>
                      <td className="px-2 py-2 text-right">{fmtMoney(it.rate)}</td>
                      <td className="px-2 py-2 text-right font-semibold">{fmtMoney(it.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr><td colSpan={4} className="px-2 py-2 text-right font-bold">Total</td>
                    <td className="px-2 py-2 text-right font-bold text-blue-700">{fmtMoney(viewModal.total_amount)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {delId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
            <p className="font-semibold text-gray-900 mb-2">Delete GRN?</p>
            <p className="text-sm text-gray-500 mb-5">Only draft GRNs can be deleted.</p>
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
