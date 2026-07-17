import { useState, useEffect, useCallback } from 'react'
import { getConsumptions, getConsumption, createConsumption, deleteConsumption, getWarehouses, getInventoryItems, getMachines } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Plus, X, Eye, Trash2, RefreshCw, ShoppingCart, Search } from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]
const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
const fmtMoney = v => v != null ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'
const fmtNum   = v => v != null ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'

const STATUS_BADGE = {
  draft:     'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-800',
  approved:  'bg-green-100 text-green-800',
}

const CONSUMPTION_TYPES = [
  { value: 'asset',                   label: 'Asset' },
  { value: 'preventive_maintenance',  label: 'Preventive Maintenance' },
  { value: 'corrective_maintenance',  label: 'Corrective Maintenance' },
  { value: 'breakdown',               label: 'Breakdown' },
  { value: 'work_order',              label: 'Work Order' },
  { value: 'project',                 label: 'Project' },
  { value: 'general',                 label: 'General Consumption' },
]

const emptyItem = () => ({ item_id: '', demand_qty: '', allocated_qty: '', consumption_qty: '', unit: '', unit_rate: '', remarks: '' })

export default function Consumption() {
  const { isAdmin } = useAuth()
  const [records, setRecords]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [filterStatus, setFilter] = useState('')
  const [filterType, setFilterType] = useState('')
  const [modal, setModal]         = useState(false)
  const [viewModal, setViewModal] = useState(null)
  const [warehouses, setWarehouses] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [machines, setMachines]   = useState([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [delId, setDelId]         = useState(null)
  const [itemSearch, setItemSearch] = useState('')

  const [form, setForm] = useState({
    txn_date: today(), warehouse_id: '', consumption_type: 'general',
    machine_id: '', work_order_id: '', project_id: '', department: '',
    notes: '', adjustment: 0, items: [emptyItem()]
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getConsumptions({ status: filterStatus || undefined, consumption_type: filterType || undefined })
      setRecords(r.data.data)
    } catch {} finally { setLoading(false) }
  }, [filterStatus, filterType])

  useEffect(() => {
    Promise.all([getWarehouses(), getInventoryItems({ limit: 500 }), getMachines()]).then(([w, it, m]) => {
      setWarehouses(w.data.data); setInventoryItems(it.data.data); setMachines(m.data.data || [])
    })
  }, [])
  useEffect(() => { load() }, [load])

  const addRow    = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))
  const removeRow = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const updateRow = (i, field, val) => setForm(f => {
    const rows = [...f.items]
    rows[i] = { ...rows[i], [field]: val }
    if (field === 'item_id' && val) {
      const found = inventoryItems.find(it => it.id === parseInt(val))
      if (found) {
        rows[i].unit = found.unit || ''
        rows[i].unit_rate = found.avg_cost || found.average_cost || found.purchase_price || ''
      }
    }
    if (field === 'consumption_qty' || field === 'unit_rate') {
      const qty  = parseFloat(field === 'consumption_qty' ? val : rows[i].consumption_qty) || 0
      const rate = parseFloat(field === 'unit_rate'       ? val : rows[i].unit_rate) || 0
      rows[i].amount = (qty * rate).toFixed(2)
    }
    return { ...f, items: rows }
  })

  const calcTotals = () => {
    const sub = form.items.reduce((s, it) => s + (parseFloat(it.consumption_qty) || 0) * (parseFloat(it.unit_rate) || 0), 0)
    return { sub, total: sub + parseFloat(form.adjustment || 0) }
  }

  const save = async () => {
    if (!form.warehouse_id || !form.consumption_type) { setError('Warehouse and Consumption Type are required'); return }
    if (form.items.some(r => !r.item_id || !r.consumption_qty)) { setError('All rows must have item and quantity'); return }
    setSaving(true); setError('')
    try { await createConsumption(form); setModal(false); load() }
    catch (err) { setError(err.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  const handleDel = async () => {
    try { await deleteConsumption(delId); setDelId(null); load() }
    catch (err) { alert(err.response?.data?.error || 'Cannot delete') }
  }

  const openView = async (id) => {
    try { const r = await getConsumption(id); setViewModal(r.data.data) } catch {}
  }

  const { sub, total } = calcTotals()
  const filteredItems = inventoryItems.filter(it =>
    !itemSearch || it.part_name.toLowerCase().includes(itemSearch.toLowerCase()) || it.part_code.toLowerCase().includes(itemSearch.toLowerCase())
  )

  const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><ShoppingCart size={20} />Spare Parts Consumption</h1>
          <p className="text-sm text-gray-500 mt-0.5">{records.length} records</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {CONSUMPTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
          <button onClick={() => { setForm({ txn_date: today(), warehouse_id: '', consumption_type: 'general', machine_id: '', work_order_id: '', project_id: '', department: '', notes: '', adjustment: 0, items: [emptyItem()] }); setError(''); setModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={15} /> New Consumption
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Con. No.</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Warehouse</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Asset</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Items</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Total Qty</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Amount</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Created By</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={11} className="py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={11} className="py-10 text-center text-gray-400">No consumption records</td></tr>
            ) : records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{r.consumption_number}</td>
                <td className="px-4 py-3">{fmtDate(r.txn_date)}</td>
                <td className="px-4 py-3 text-gray-700">{r.warehouse_name}</td>
                <td className="px-4 py-3 text-gray-600 text-xs capitalize">{r.consumption_type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-gray-600">{r.machine_nickname || r.machine_slno || '—'}</td>
                <td className="px-4 py-3 text-right">{r.item_count}</td>
                <td className="px-4 py-3 text-right">{fmtNum(r.total_qty)}</td>
                <td className="px-4 py-3 text-right font-semibold">{fmtMoney(r.total_amount)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.status] || 'bg-gray-100'}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.created_by_name}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openView(r.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={13} /></button>
                    {isAdmin && r.status !== 'approved' && (
                      <button onClick={() => setDelId(r.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={13} /></button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-6">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-semibold text-gray-900">New Spare Parts Consumption</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Basic Info */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Basic Information</p>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className={lbl}>Transaction Date *</label>
                    <input type="date" className={inp} value={form.txn_date} onChange={e => setForm(f => ({...f, txn_date: e.target.value}))} />
                  </div>
                  <div>
                    <label className={lbl}>Warehouse *</label>
                    <select className={inp} value={form.warehouse_id} onChange={e => setForm(f => ({...f, warehouse_id: e.target.value}))}>
                      <option value="">— Select —</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Consumption For *</label>
                    <select className={inp} value={form.consumption_type} onChange={e => setForm(f => ({...f, consumption_type: e.target.value, machine_id: ''}))}>
                      {CONSUMPTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Department</label>
                    <input className={inp} value={form.department} onChange={e => setForm(f => ({...f, department: e.target.value}))} />
                  </div>
                  {['asset','preventive_maintenance','corrective_maintenance','breakdown','work_order'].includes(form.consumption_type) && (
                    <div>
                      <label className={lbl}>Asset</label>
                      <select className={inp} value={form.machine_id} onChange={e => setForm(f => ({...f, machine_id: e.target.value}))}>
                        <option value="">— Select —</option>
                        {machines.map(m => <option key={m.id} value={m.id}>{m.nickname || m.slno} ({m.asset_code || m.eq_type})</option>)}
                      </select>
                    </div>
                  )}
                  <div className="col-span-2">
                    <label className={lbl}>Notes</label>
                    <input className={inp} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
                  </div>
                </div>
              </div>

              {/* Items Grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spare Parts</p>
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-2 text-gray-400" />
                    <input className="pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none" placeholder="Search parts…" value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50"><tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Spare Part</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 w-24">Demand Qty</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 w-28">Consumption Qty</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 w-20">Unit</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 w-28">Unit Rate (₹)</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 w-28">Amount (₹)</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Remarks</th>
                      <th className="px-3 py-2 w-8" />
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {form.items.map((row, i) => {
                        const amt = (parseFloat(row.consumption_qty) || 0) * (parseFloat(row.unit_rate) || 0)
                        return (
                          <tr key={i} className="bg-white">
                            <td className="px-3 py-2">
                              <select className="w-full border border-gray-200 rounded px-2 py-1 text-sm" value={row.item_id} onChange={e => updateRow(i, 'item_id', e.target.value)}>
                                <option value="">— Select —</option>
                                {filteredItems.map(it => (
                                  <option key={it.id} value={it.id}>
                                    {it.part_code} - {it.part_name} [Avail: {Number(it.available_stock || 0).toFixed(2)}]
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" value={row.demand_qty} onChange={e => updateRow(i, 'demand_qty', e.target.value)} min="0" step="0.001" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" value={row.consumption_qty} onChange={e => updateRow(i, 'consumption_qty', e.target.value)} min="0" step="0.001" />
                            </td>
                            <td className="px-3 py-2">
                              <input className="w-full border border-gray-200 rounded px-2 py-1 text-sm" value={row.unit} onChange={e => updateRow(i, 'unit', e.target.value)} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" value={row.unit_rate} onChange={e => updateRow(i, 'unit_rate', e.target.value)} min="0" step="0.01" />
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-gray-800">
                              {amt > 0 ? `₹${amt.toFixed(2)}` : '—'}
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
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-right text-xs text-gray-500">Sub Total</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(sub)}</td>
                        <td colSpan={2} />
                      </tr>
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-xs text-gray-500">Adjustment</td>
                        <td className="px-3 py-2">
                          <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" value={form.adjustment} onChange={e => setForm(f => ({...f, adjustment: e.target.value}))} step="0.01" />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(form.adjustment)}</td>
                        <td colSpan={2} />
                      </tr>
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-right text-sm font-bold text-gray-900">Total</td>
                        <td className="px-3 py-2 text-right text-base font-bold text-blue-700">{fmtMoney(total)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <button onClick={addRow} className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"><Plus size={14} /> Add Item</button>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
                  {saving ? 'Saving…' : 'Save Consumption'}
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
              <h2 className="font-semibold text-gray-900">{viewModal.consumption_number}</h2>
              <button onClick={() => setViewModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 text-sm space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Date', fmtDate(viewModal.txn_date)],
                  ['Warehouse', viewModal.warehouse_name],
                  ['Type', (viewModal.consumption_type || '').replace(/_/g, ' ')],
                  ['Asset', viewModal.machine_nickname || viewModal.machine_slno || '—'],
                  ['Status', viewModal.status],
                  ['Created By', viewModal.created_by_name],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg px-3 py-2"><p className="text-xs text-gray-400">{k}</p><p className="font-medium capitalize">{v}</p></div>
                ))}
              </div>
              <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
                <thead className="bg-gray-50"><tr>
                  <th className="px-2 py-2 text-left">Part</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {(viewModal.items || []).map(it => (
                    <tr key={it.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2">{it.part_name} <span className="text-gray-400">({it.part_code})</span></td>
                      <td className="px-2 py-2 text-right">{fmtNum(it.consumption_qty)} {it.unit || it.item_unit}</td>
                      <td className="px-2 py-2 text-right">{fmtMoney(it.unit_rate)}</td>
                      <td className="px-2 py-2 text-right font-semibold">{fmtMoney(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr><td colSpan={3} className="px-2 py-2 text-right font-bold">Total</td>
                    <td className="px-2 py-2 text-right font-bold text-blue-700">{fmtMoney(viewModal.total_amount)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {delId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
            <p className="font-semibold text-gray-900 mb-4">Delete Consumption?</p>
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
