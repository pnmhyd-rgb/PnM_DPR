import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getConsumptions, getConsumption, createConsumption, updateConsumption,
  submitConsumption, approveConsumption, deleteConsumption,
  getWarehouses, getInventoryItems, getMachines, getServiceTickets,
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { today, fmtDate, fmtMoney, fmtNum } from '../../lib/utils'
import {
  Plus, X, Eye, Trash2, RefreshCw, ShoppingCart,
  CheckCircle, ThumbsUp, Pencil, AlertTriangle,
} from 'lucide-react'

const STATUS_BADGE = {
  draft:     'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-800',
  approved:  'bg-green-100 text-green-800',
}

const CONSUMPTION_TYPES = [
  { value: 'asset',                  label: 'Asset' },
  { value: 'preventive_maintenance', label: 'Preventive Maintenance' },
  { value: 'corrective_maintenance', label: 'Corrective Maintenance' },
  { value: 'breakdown',              label: 'Breakdown' },
  { value: 'work_order',             label: 'Work Order' },
  { value: 'project',                label: 'Project' },
  { value: 'general',                label: 'General Consumption' },
]

const ASSET_TYPES = ['asset','preventive_maintenance','corrective_maintenance','breakdown','work_order']

const emptyItem = () => ({
  item_id: '', item_label: '', demand_qty: '', allocated_qty: '',
  consumption_qty: '', unit: '', unit_rate: '', remarks: '',
})

const emptyForm = () => ({
  txn_date: today(), warehouse_id: '', consumption_type: 'general',
  machine_id: '', work_order_id: '', project_id: '', department: '',
  notes: '', adjustment: 0, status: 'submitted', ticket_id: '',
  items: [emptyItem()],
})

/* ─── Inline item search combobox ─── */
function ItemCombobox({ label, items, onSelect }) {
  const [open, setOpen] = useState(false)
  const [q, setQ]       = useState(label || '')
  const ref             = useRef(null)

  useEffect(() => { setQ(label || '') }, [label])

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = (q.length >= 1
    ? items.filter(it =>
        it.part_name?.toLowerCase().includes(q.toLowerCase()) ||
        it.part_code?.toLowerCase().includes(q.toLowerCase()) ||
        it.oem_number?.toLowerCase().includes(q.toLowerCase())
      )
    : items
  ).slice(0, 50)

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={q}
        placeholder="Search by Name / Code / MPN…"
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-50 top-full left-0 mt-0.5 w-[420px] max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-2xl text-sm">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-gray-400 text-xs">No items found</div>
          ) : filtered.map(it => (
            <button key={it.id} type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(it); setQ(`${it.part_code} — ${it.part_name}`); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-0">
              <div className="font-medium text-gray-800 truncate">{it.part_name}</div>
              <div className="text-xs text-gray-500 flex gap-3">
                <span>{it.part_code}</span>
                {it.oem_number && <span>MPN: {it.oem_number}</span>}
                <span className={Number(it.available_stock) > 0 ? 'text-green-600 font-medium' : 'text-red-500'}>
                  Avail: {Number(it.available_stock || 0).toFixed(2)} {it.unit}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Confirm dialog ─── */
function Confirm({ msg, sub, onOk, onCancel, okLabel = 'Confirm', okCls = 'bg-blue-600' }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={20} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-gray-900">{msg}</p>
            {sub && <p className="text-sm text-gray-500 mt-1">{sub}</p>}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onOk} className={`flex-1 ${okCls} text-white py-2 rounded-lg text-sm font-medium`}>{okLabel}</button>
          <button onClick={onCancel} className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function Consumption() {
  const { isAdmin } = useAuth()

  // List state
  const [records, setRecords]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [filterStatus, setFilter]   = useState('')
  const [filterType, setFilterType] = useState('')

  // Master data
  const [warehouses, setWarehouses] = useState([])
  const [allItems, setAllItems]     = useState([])
  const [machines, setMachines]     = useState([])
  const [tickets, setTickets]       = useState([])

  // Form modal
  const [modal, setModal]         = useState(false)   // false | 'create' | 'edit'
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [showOnlyAvail, setShowOnlyAvail] = useState(false)
  const [updatePrice, setUpdatePrice]     = useState(false)
  const [ticketSearch, setTicketSearch]   = useState('')

  // View modal
  const [viewRec, setViewRec]  = useState(null)

  // Action confirms
  const [confirm, setConfirm]  = useState(null)  // { type, id, label }

  /* ── Load master data once ── */
  useEffect(() => {
    Promise.all([
      getWarehouses(),
      getInventoryItems({ limit: 1000 }),
      getMachines(),
      getServiceTickets({ limit: 200 }),
    ]).then(([w, it, m, tk]) => {
      setWarehouses(w.data.data || [])
      setAllItems(it.data.data || [])
      setMachines(m.data.data || [])
      setTickets(tk.data.data || [])
    }).catch(() => {})
  }, [])

  /* ── Load list ── */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getConsumptions({
        status: filterStatus || undefined,
        consumption_type: filterType || undefined,
      })
      setRecords(r.data.data)
    } catch {} finally { setLoading(false) }
  }, [filterStatus, filterType])

  useEffect(() => { load() }, [load])

  /* ── Computed ── */
  const selectedWarehouse = warehouses.find(w => w.id === parseInt(form.warehouse_id))

  const filteredItems = showOnlyAvail
    ? allItems.filter(it => Number(it.available_stock) > 0)
    : allItems

  const matchedTickets = ticketSearch
    ? tickets.filter(t =>
        t.ticket_number?.toLowerCase().includes(ticketSearch.toLowerCase()) ||
        t.title?.toLowerCase().includes(ticketSearch.toLowerCase())
      ).slice(0, 10)
    : []

  const calcTotals = () => {
    const sub = form.items.reduce(
      (s, it) => s + (parseFloat(it.consumption_qty) || 0) * (parseFloat(it.unit_rate) || 0), 0
    )
    return { sub, total: sub + parseFloat(form.adjustment || 0) }
  }
  const { sub, total } = calcTotals()

  /* ── Row helpers ── */
  const addRow    = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))
  const removeRow = i  => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))

  const selectItem = (rowIdx, it) => {
    setForm(f => {
      const rows = [...f.items]
      rows[rowIdx] = {
        ...rows[rowIdx],
        item_id:    it.id,
        item_label: `${it.part_code} — ${it.part_name}`,
        unit:       it.unit || 'Nos',
        unit_rate:  updatePrice
          ? (it.avg_cost || it.average_cost || it.purchase_price || '')
          : (rows[rowIdx].unit_rate || it.avg_cost || it.average_cost || it.purchase_price || ''),
      }
      rows[rowIdx].amount = recalc(rows[rowIdx])
      return { ...f, items: rows }
    })
  }

  const updateRow = (i, field, val) => {
    setForm(f => {
      const rows = [...f.items]
      rows[i] = { ...rows[i], [field]: val }
      if (field === 'consumption_qty' || field === 'unit_rate')
        rows[i].amount = recalc(rows[i])
      return { ...f, items: rows }
    })
  }

  const recalc = row =>
    ((parseFloat(row.consumption_qty) || 0) * (parseFloat(row.unit_rate) || 0)).toFixed(2)

  /* ── Open create ── */
  const openCreate = () => {
    setForm(emptyForm())
    setError(''); setShowOnlyAvail(false); setUpdatePrice(false); setTicketSearch('')
    setEditId(null)
    setModal('create')
  }

  /* ── Open edit (load data) ── */
  const openEdit = async (id) => {
    try {
      const r = await getConsumption(id)
      const rec = r.data.data
      setForm({
        txn_date:         rec.txn_date?.split('T')[0] || today(),
        warehouse_id:     String(rec.warehouse_id || ''),
        consumption_type: rec.consumption_type || 'general',
        machine_id:       String(rec.machine_id || ''),
        work_order_id:    String(rec.work_order_id || ''),
        project_id:       String(rec.project_id || ''),
        department:       rec.department || '',
        notes:            rec.notes || '',
        adjustment:       rec.adjustment || 0,
        status:           'draft',
        ticket_id:        String(rec.ticket_id || ''),
        items: (rec.items || []).map(it => ({
          item_id:        it.item_id,
          item_label:     `${it.part_code} — ${it.part_name}`,
          demand_qty:     it.demand_qty || '',
          allocated_qty:  it.allocated_qty || '',
          consumption_qty: it.consumption_qty || '',
          unit:           it.unit || it.item_unit || '',
          unit_rate:      it.unit_rate || '',
          remarks:        it.remarks || '',
        })),
      })
      if (rec.ticket_id && rec.ticket_number) {
        setTicketSearch(`${rec.ticket_number} — ${rec.ticket_title || ''}`)
      } else {
        setTicketSearch('')
      }
      setError(''); setShowOnlyAvail(false); setUpdatePrice(false)
      setEditId(id)
      setModal('edit')
    } catch { alert('Failed to load consumption') }
  }

  /* ── Save (create or update) ── */
  const save = async (saveStatus) => {
    if (!form.warehouse_id)    { setError('Warehouse is required'); return }
    if (!form.consumption_type) { setError('Consumption type is required'); return }
    if (!form.items.length || form.items.some(r => !r.item_id || !r.consumption_qty)) {
      setError('All rows need an item and quantity'); return
    }
    setSaving(true); setError('')
    try {
      if (modal === 'edit') {
        await updateConsumption(editId, { ...form, status: saveStatus || form.status })
      } else {
        await createConsumption({ ...form, status: saveStatus || form.status })
      }
      setModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  /* ── Actions ── */
  const doSubmit = async (id) => {
    try { await submitConsumption(id); load() }
    catch (err) { alert(err.response?.data?.error || 'Submit failed') }
    finally { setConfirm(null) }
  }

  const doApprove = async (id) => {
    try { await approveConsumption(id); load() }
    catch (err) { alert(err.response?.data?.error || 'Approve failed') }
    finally { setConfirm(null) }
  }

  const doDelete = async (id) => {
    try { await deleteConsumption(id); load() }
    catch (err) { alert(err.response?.data?.error || 'Cannot delete') }
    finally { setConfirm(null) }
  }

  const openView = async (id) => {
    try { const r = await getConsumption(id); setViewRec(r.data.data) } catch {}
  }

  /* ── Style shorthands ── */
  const inp  = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl  = 'text-xs font-medium text-gray-600 whitespace-nowrap'

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="p-4 max-w-full">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart size={20} />Spare Parts Consumption
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{records.length} records</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {CONSUMPTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={15} /> New Consumption
          </button>
        </div>
      </div>

      {/* ── List Table ── */}
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
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Amount</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Created By</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={10} className="py-10 text-center text-gray-400">
                <RefreshCw size={16} className="inline animate-spin mr-2" />Loading…
              </td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={10} className="py-10 text-center text-gray-400">No consumption records found</td></tr>
            ) : records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{r.consumption_number}</td>
                <td className="px-4 py-3">{fmtDate(r.txn_date)}</td>
                <td className="px-4 py-3 text-gray-700">{r.warehouse_name}</td>
                <td className="px-4 py-3 text-gray-600 text-xs capitalize">{(r.consumption_type || '').replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{r.machine_nickname || r.machine_slno || '—'}</td>
                <td className="px-4 py-3 text-right text-gray-700">{r.item_count}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtMoney(r.total_amount)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.status] || 'bg-gray-100'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.created_by_name}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    {/* View */}
                    <button onClick={() => openView(r.id)}
                      title="View" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Eye size={14} />
                    </button>
                    {/* Edit (draft only) */}
                    {r.status === 'draft' && (
                      <button onClick={() => openEdit(r.id)}
                        title="Edit" className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded">
                        <Pencil size={14} />
                      </button>
                    )}
                    {/* Submit (draft only) */}
                    {r.status === 'draft' && (
                      <button onClick={() => setConfirm({ type: 'submit', id: r.id, num: r.consumption_number })}
                        title="Submit" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded">
                        <CheckCircle size={14} />
                      </button>
                    )}
                    {/* Approve (submitted + admin) */}
                    {r.status === 'submitted' && isAdmin && (
                      <button onClick={() => setConfirm({ type: 'approve', id: r.id, num: r.consumption_number })}
                        title="Approve" className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                        <ThumbsUp size={14} />
                      </button>
                    )}
                    {/* Delete (non-approved + admin) */}
                    {r.status !== 'approved' && isAdmin && (
                      <button onClick={() => setConfirm({ type: 'delete', id: r.id, num: r.consumption_number })}
                        title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ══════════════ Create / Edit Modal ══════════════ */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-6">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="font-semibold text-gray-900 text-base">
                  {modal === 'edit' ? 'Edit Draft Consumption' : 'New Spare Parts Consumption'}
                </h2>
                {modal === 'edit' && <p className="text-xs text-gray-400 mt-0.5">Only draft records can be edited</p>}
              </div>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4">

              {/* ── Transaction Details section ── */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Transaction Details</span>
                </div>
                <div className="p-4 grid grid-cols-2 gap-x-8 gap-y-3">

                  {/* Left */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-[150px_1fr] items-center gap-3">
                      <label className={lbl}>Transaction Date *</label>
                      <input type="date" className={inp} value={form.txn_date}
                        onChange={e => setForm(f => ({ ...f, txn_date: e.target.value }))} />
                    </div>

                    <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                      <label className={`${lbl} pt-2`}>Warehouse *</label>
                      <div>
                        <select className={inp} value={form.warehouse_id}
                          onChange={e => setForm(f => ({ ...f, warehouse_id: e.target.value }))}>
                          <option value="">— Select Warehouse —</option>
                          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                        {selectedWarehouse && (
                          <div className="mt-1.5 text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2 space-y-0.5">
                            {selectedWarehouse.address && <div>📍 {selectedWarehouse.address}</div>}
                            {selectedWarehouse.manager && <div>👤 {selectedWarehouse.manager}</div>}
                            {selectedWarehouse.contact && <div>📞 {selectedWarehouse.contact}</div>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-[150px_1fr] items-center gap-3">
                      <label className={lbl}>Save as</label>
                      <div className="flex gap-2">
                        {['draft','submitted'].map(s => (
                          <button key={s} type="button"
                            onClick={() => setForm(f => ({ ...f, status: s }))}
                            className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              form.status === s
                                ? s === 'draft'
                                  ? 'bg-gray-200 text-gray-800 border-gray-400'
                                  : 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                            }`}>
                            {s === 'draft' ? 'Draft' : 'Submit'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-[150px_1fr] items-center gap-3">
                      <label className={lbl}>Department</label>
                      <input className={inp} value={form.department} placeholder="Department name"
                        onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                    </div>
                  </div>

                  {/* Right */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-[150px_1fr] items-center gap-3">
                      <label className={lbl}>Consumption For *</label>
                      <select className={inp} value={form.consumption_type}
                        onChange={e => setForm(f => ({ ...f, consumption_type: e.target.value, machine_id: '' }))}>
                        {CONSUMPTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>

                    {ASSET_TYPES.includes(form.consumption_type) && (
                      <div className="grid grid-cols-[150px_1fr] items-center gap-3">
                        <label className={lbl}>Asset</label>
                        <select className={inp} value={form.machine_id}
                          onChange={e => setForm(f => ({ ...f, machine_id: e.target.value }))}>
                          <option value="">— Select Asset —</option>
                          {machines.map(m => (
                            <option key={m.id} value={m.id}>{m.nickname || m.slno} ({m.asset_code || m.eq_type})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                      <label className={`${lbl} pt-2`}>Ticket / Ref</label>
                      <div className="relative">
                        <div className="flex gap-2 items-center">
                          <input className={inp} placeholder="Search ticket no. or title…"
                            value={ticketSearch}
                            onChange={e => {
                              setTicketSearch(e.target.value)
                              if (!e.target.value) setForm(f => ({ ...f, ticket_id: '' }))
                            }} />
                          {form.ticket_id && (
                            <button type="button" onClick={() => { setForm(f => ({ ...f, ticket_id: '' })); setTicketSearch('') }}>
                              <X size={14} className="text-gray-400 hover:text-red-500" />
                            </button>
                          )}
                        </div>
                        {ticketSearch && matchedTickets.length > 0 && (
                          <div className="absolute z-50 top-full left-0 mt-0.5 w-full bg-white border border-gray-200 rounded-lg shadow-xl text-sm max-h-44 overflow-y-auto">
                            {matchedTickets.map(t => (
                              <button key={t.id} type="button"
                                onMouseDown={e => {
                                  e.preventDefault()
                                  setForm(f => ({ ...f, ticket_id: t.id }))
                                  setTicketSearch(`${t.ticket_number} — ${t.title || ''}`)
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-0">
                                <div className="font-medium text-gray-800">{t.ticket_number}</div>
                                <div className="text-xs text-gray-500">{t.title}</div>
                              </button>
                            ))}
                          </div>
                        )}
                        {form.ticket_id && (
                          <div className="mt-1 text-xs text-green-600 font-medium">✓ Ticket linked</div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-[150px_1fr] items-center gap-3">
                      <label className={lbl}>Notes</label>
                      <input className={inp} value={form.notes} placeholder="Remarks / notes…"
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Items table section ── */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spare Parts</span>
                  <div className="flex items-center gap-5">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                      <input type="checkbox" className="rounded" checked={showOnlyAvail}
                        onChange={e => setShowOnlyAvail(e.target.checked)} />
                      Show only available items
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                      <input type="checkbox" className="rounded" checked={updatePrice}
                        onChange={e => setUpdatePrice(e.target.checked)} />
                      Update item consumption price
                    </label>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600 w-10">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 min-w-[280px]">Item Details</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-24">Demand</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-24">Allocation</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-24">Quantity *</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 w-16">Unit</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-28">Unit Rate (₹)</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 w-28">Amount (₹)</th>
                        <th className="px-3 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {form.items.map((row, i) => {
                        const amt = (parseFloat(row.consumption_qty) || 0) * (parseFloat(row.unit_rate) || 0)
                        const selIt = allItems.find(it => it.id === parseInt(row.item_id))
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-center text-xs text-gray-400 font-medium">{i + 1}</td>
                            <td className="px-3 py-2">
                              <ItemCombobox
                                label={row.item_label}
                                items={filteredItems}
                                onSelect={it => selectItem(i, it)}
                              />
                              {selIt && (
                                <div className="mt-0.5 text-xs text-gray-400 flex gap-3">
                                  <span>{selIt.part_code}</span>
                                  {selIt.oem_number && <span>MPN: {selIt.oem_number}</span>}
                                  <span className={Number(selIt.available_stock) > 0 ? 'text-green-600' : 'text-red-500'}>
                                    Avail: {Number(selIt.available_stock || 0).toFixed(2)} {selIt.unit}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" min="0" step="0.001" value={row.demand_qty}
                                onChange={e => updateRow(i, 'demand_qty', e.target.value)}
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" min="0" step="0.001" value={row.allocated_qty}
                                onChange={e => updateRow(i, 'allocated_qty', e.target.value)}
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" min="0" step="0.001" value={row.consumption_qty}
                                onChange={e => updateRow(i, 'consumption_qty', e.target.value)}
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            </td>
                            <td className="px-2 py-2">
                              <input value={row.unit}
                                onChange={e => updateRow(i, 'unit', e.target.value)}
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" min="0" step="0.01" value={row.unit_rate}
                                onChange={e => updateRow(i, 'unit_rate', e.target.value)}
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-gray-800 whitespace-nowrap">
                              {amt > 0 ? `₹ ${amt.toFixed(2)}` : '—'}
                            </td>
                            <td className="px-2 py-2">
                              {form.items.length > 1 && (
                                <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600">
                                  <X size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200 text-sm">
                      <tr>
                        <td colSpan={7} className="px-3 py-2 text-right text-gray-500 font-medium">Sub Total</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmtMoney(sub)}</td>
                        <td />
                      </tr>
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-right text-gray-500 font-medium">Adjustment (±)</td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.01" value={form.adjustment}
                            onChange={e => setForm(f => ({ ...f, adjustment: e.target.value }))}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmtMoney(form.adjustment)}</td>
                        <td />
                      </tr>
                      <tr className="border-t-2 border-gray-300">
                        <td colSpan={7} className="px-3 py-2.5 text-right font-bold text-gray-900">Grand Total</td>
                        <td className="px-3 py-2.5 text-right text-base font-bold text-blue-700">{fmtMoney(total)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                  <button type="button" onClick={addRow}
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
                    <Plus size={14} /> Add Row
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
              )}

              {/* Footer buttons */}
              <div className="flex items-center gap-3 pt-1">
                <button onClick={() => save('submitted')} disabled={saving}
                  className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
                  {saving ? 'Saving…' : modal === 'edit' ? 'Update & Submit' : 'Submit'}
                </button>
                <button onClick={() => save('draft')} disabled={saving}
                  className="px-6 border border-gray-400 text-gray-700 hover:bg-gray-50 disabled:opacity-60 font-medium py-2.5 rounded-lg text-sm">
                  Save as Draft
                </button>
                <button onClick={() => setModal(false)}
                  className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg py-2.5 text-sm">
                  Cancel
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ══════════════ View Modal ══════════════ */}
      {viewRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-gray-900 text-base">{viewRec.consumption_number}</h2>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[viewRec.status] || ''}`}>
                    {viewRec.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{fmtDate(viewRec.txn_date)} · {viewRec.warehouse_name}</p>
              </div>
              <button onClick={() => setViewRec(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">

              {/* Info grid */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Type',        (viewRec.consumption_type || '').replace(/_/g, ' ')],
                  ['Asset',       viewRec.machine_nickname || viewRec.machine_slno || '—'],
                  ['Department',  viewRec.department || '—'],
                  ['Project',     viewRec.project_name || '—'],
                  ['WO No.',      viewRec.wo_number || '—'],
                  ['Ticket',      viewRec.ticket_number ? `${viewRec.ticket_number}${viewRec.ticket_title ? ' — ' + viewRec.ticket_title : ''}` : '—'],
                  ['Created By',  viewRec.created_by_name || '—'],
                  ['Approved By', viewRec.approved_by_name || '—'],
                  ['Notes',       viewRec.notes || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400">{k}</p>
                    <p className="font-medium text-gray-800 capitalize truncate" title={v}>{v}</p>
                  </div>
                ))}
              </div>

              {/* Items table */}
              <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Part</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Demand</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Allocated</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Qty</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Unit</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Rate</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(viewRec.items || []).map((it, i) => (
                    <tr key={it.id || i} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800">{it.part_name}</div>
                        <div className="text-gray-400">{it.part_code}{it.oem_number ? ` · ${it.oem_number}` : ''}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmtNum(it.demand_qty) || '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmtNum(it.allocated_qty) || '—'}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtNum(it.consumption_qty)}</td>
                      <td className="px-3 py-2 text-gray-500">{it.unit || it.item_unit || '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmtMoney(it.unit_rate)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmtMoney(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  {viewRec.adjustment != null && Number(viewRec.adjustment) !== 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-1.5 text-right text-gray-500">Sub Total</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{fmtMoney(viewRec.sub_total)}</td>
                    </tr>
                  )}
                  {viewRec.adjustment != null && Number(viewRec.adjustment) !== 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-1.5 text-right text-gray-500">Adjustment</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{fmtMoney(viewRec.adjustment)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-right font-bold text-gray-900">Grand Total</td>
                    <td className="px-3 py-2 text-right font-bold text-blue-700 text-base">{fmtMoney(viewRec.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ Confirm Dialogs ══════════════ */}
      {confirm?.type === 'submit' && (
        <Confirm
          msg={`Submit ${confirm.num}?`}
          sub="Stock will be deducted immediately. This cannot be undone."
          okLabel="Submit"
          okCls="bg-green-600 hover:bg-green-700 text-white"
          onOk={() => doSubmit(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.type === 'approve' && (
        <Confirm
          msg={`Approve ${confirm.num}?`}
          sub="This marks the consumption as fully approved."
          okLabel="Approve"
          okCls="bg-indigo-600 hover:bg-indigo-700 text-white"
          onOk={() => doApprove(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.type === 'delete' && (
        <Confirm
          msg={`Delete ${confirm.num}?`}
          sub="This action is permanent and cannot be undone."
          okLabel="Delete"
          okCls="bg-red-600 hover:bg-red-700 text-white"
          onOk={() => doDelete(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}

    </div>
  )
}
