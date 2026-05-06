import { useState, useEffect } from 'react'
import {
  getProjects, getMachines,
  getSpareTransactions, getSpareStockSummary,
  createSpareTransaction, deleteSpareTransaction
} from '../../lib/api'
import { today, formatNum, exportCSV } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { Plus, Trash2, Download, X, Package, ArrowDownToLine, ArrowUpFromLine, RotateCcw } from 'lucide-react'

const TXN_TYPES = ['Receipt', 'Issue', 'Return']
const UNITS     = ['Nos', 'Litres', 'Kg', 'Sets', 'Metres', 'Pairs']

const TXN_BADGE = {
  Receipt: 'bg-green-100 text-green-800',
  Issue:   'bg-red-100 text-red-800',
  Return:  'bg-yellow-100 text-yellow-800',
}

const TXN_ICON = {
  Receipt: ArrowDownToLine,
  Issue:   ArrowUpFromLine,
  Return:  RotateCcw,
}

const emptyForm = () => ({
  project_id: '', machine_id: '', entry_date: today(),
  txn_type: 'Issue', item_name: '', item_code: '',
  unit: 'Nos', qty: '', unit_cost: '', remarks: ''
})

export default function SpareParts() {
  const { isAdmin } = useAuth()
  const [projects, setProjects]   = useState([])
  const [machines, setMachines]   = useState([])
  const [txns, setTxns]           = useState([])
  const [stock, setStock]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [tab, setTab]             = useState('transactions') // 'transactions' | 'stock'
  const [filters, setFilters]     = useState({ project_code: '', txn_type: '', from: today(), to: today() })
  const [stockFilter, setStockFilter] = useState({ project_code: '' })
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => { getProjects().then(r => setProjects(r.data.data)) }, [])

  useEffect(() => {
    if (form.project_id) {
      getMachines({ project_id: form.project_id }).then(r => setMachines(r.data.data))
    } else {
      setMachines([])
    }
  }, [form.project_id])

  const loadTxns = () => {
    setLoading(true)
    const p = {}
    if (filters.project_code) p.project_code = filters.project_code
    if (filters.txn_type)     p.txn_type      = filters.txn_type
    if (filters.from) p.from = filters.from
    if (filters.to)   p.to   = filters.to
    getSpareTransactions(p).then(r => setTxns(r.data.data)).finally(() => setLoading(false))
  }

  const loadStock = () => {
    setLoading(true)
    const p = {}
    if (stockFilter.project_code) p.project_code = stockFilter.project_code
    getSpareStockSummary(p).then(r => setStock(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { if (tab === 'transactions') loadTxns() }, [filters, tab])
  useEffect(() => { if (tab === 'stock') loadStock() }, [stockFilter, tab])

  const setF  = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))
  const setSF = k => e => setStockFilter(f => ({ ...f, [k]: e.target.value }))
  const setFm = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const computedTotal = form.qty && form.unit_cost
    ? (parseFloat(form.qty) * parseFloat(form.unit_cost)).toFixed(2) : ''

  const openModal  = () => { setForm(emptyForm()); setError(''); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setError('') }

  const handleSave = async () => {
    if (!form.project_id || !form.entry_date || !form.item_name.trim() || !form.qty) {
      setError('Project, date, item name, and quantity are required.')
      return
    }
    setSaving(true); setError('')
    try {
      await createSpareTransaction(form)
      closeModal()
      if (tab === 'transactions') loadTxns()
      else loadStock()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transaction? Stock balance will update.')) return
    await deleteSpareTransaction(id)
    loadTxns()
  }

  const handleExportTxns = () => {
    exportCSV(
      ['Date', 'Project', 'Type', 'Item Name', 'Code', 'Unit', 'Machine SL#', 'Eq Type', 'Qty', 'Unit Cost (₹)', 'Total (₹)', 'Remarks'],
      txns.map(t => [
        t.entry_date, t.project_code, t.txn_type,
        t.item_name, t.item_code ?? '', t.unit,
        t.slno ?? '', t.eq_type ?? '',
        t.qty, t.unit_cost ?? '', t.total ?? '', t.remarks ?? ''
      ]),
      `Spare_Parts_${filters.from}_${filters.to}.csv`
    )
  }

  const handleExportStock = () => {
    exportCSV(
      ['Item Name', 'Code', 'Unit', 'Total Received', 'Total Issued', 'Total Returned', 'Current Stock'],
      stock.map(s => [s.item_name, s.item_code ?? '', s.unit, s.total_received, s.total_issued, s.total_returned, s.current_stock]),
      `Spare_Stock_Summary.csv`
    )
  }

  const sel = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Spare Parts Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {tab === 'transactions'
              ? `${txns.length} transactions`
              : `${stock.length} unique items`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={tab === 'transactions' ? handleExportTxns : handleExportStock}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Download size={15} />Export
          </button>
          <button onClick={openModal} className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors">
            <Plus size={15} />New Transaction
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {[
          { key: 'transactions', label: 'Transaction Log' },
          { key: 'stock',        label: 'Stock Summary' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TRANSACTIONS TAB ── */}
      {tab === 'transactions' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <select value={filters.project_code} onChange={setF('project_code')} className={sel}>
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
              </select>
              <select value={filters.txn_type} onChange={setF('txn_type')} className={sel}>
                <option value="">All Types</option>
                {TXN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="date" value={filters.from} onChange={setF('from')} className={sel} />
              <input type="date" value={filters.to}   onChange={setF('to')}   className={sel} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : txns.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Package size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No transactions found. Click "+ New Transaction" to start.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Date','Project','Type','Item Name','Code','Unit','Machine SL#','Eq Type','Qty','Unit Cost','Total','Remarks',''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {txns.map(t => {
                      const Icon = TXN_ICON[t.txn_type]
                      return (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap font-medium">{t.entry_date}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">{t.project_code}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${TXN_BADGE[t.txn_type]}`}>
                              {Icon && <Icon size={11} />}{t.txn_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium whitespace-nowrap">{t.item_name}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{t.item_code ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{t.unit}</td>
                          <td className="px-4 py-3 text-gray-600">{t.slno ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{t.eq_type ?? '—'}</td>
                          <td className="px-4 py-3 font-semibold">{t.qty}</td>
                          <td className="px-4 py-3 text-gray-600">{t.unit_cost ? `₹${t.unit_cost}` : '—'}</td>
                          <td className="px-4 py-3 font-medium">{t.total ? `₹${formatNum(t.total, 0)}` : '—'}</td>
                          <td className="px-4 py-3 text-gray-500 max-w-[100px] truncate">{t.remarks ?? '—'}</td>
                          <td className="px-4 py-3">
                            {isAdmin && (
                              <button onClick={() => handleDelete(t.id)} className="text-red-500 hover:text-red-700 p-1 rounded">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={13} className="px-4 py-2 text-xs text-gray-400">{txns.length} records</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── STOCK SUMMARY TAB ── */}
      {tab === 'stock' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <select value={stockFilter.project_code} onChange={setSF('project_code')} className={sel}>
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : stock.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Package size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No stock data. Add some Receipt transactions first.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Item Name','Code','Unit','Received','Issued','Returned','Current Stock'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stock.map((s, i) => {
                      const cur = parseFloat(s.current_stock)
                      const stockClass = cur <= 0 ? 'text-red-600 font-bold' : cur < 5 ? 'text-yellow-600 font-semibold' : 'text-green-700 font-semibold'
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{s.item_name}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{s.item_code ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{s.unit}</td>
                          <td className="px-4 py-3 text-green-700">{formatNum(s.total_received, 2)}</td>
                          <td className="px-4 py-3 text-red-600">{formatNum(s.total_issued, 2)}</td>
                          <td className="px-4 py-3 text-yellow-700">{formatNum(s.total_returned, 2)}</td>
                          <td className={`px-4 py-3 ${stockClass}`}>{formatNum(s.current_stock, 2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={7} className="px-4 py-2 text-xs text-gray-400">
                        {stock.length} unique items · Stock in red = at or below zero
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mt-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">New Spare Parts Transaction</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date *</label>
                  <input type="date" value={form.entry_date} onChange={setFm('entry_date')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Transaction Type *</label>
                  <select value={form.txn_type} onChange={setFm('txn_type')} className={inp}>
                    {TXN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Project *</label>
                  <select value={form.project_id} onChange={setFm('project_id')} className={inp}>
                    <option value="">Select project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Machine (optional)</label>
                  <select value={form.machine_id} onChange={setFm('machine_id')} className={inp}>
                    <option value="">Not linked</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.slno} – {m.eq_type}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item Name *</label>
                  <input type="text" placeholder="e.g. Air Filter" value={form.item_name} onChange={setFm('item_name')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Part No. / Code</label>
                  <input type="text" placeholder="e.g. AF-1234" value={form.item_code} onChange={setFm('item_code')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantity *</label>
                  <input type="number" min="0" step="0.01" placeholder="e.g. 2" value={form.qty} onChange={setFm('qty')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</label>
                  <select value={form.unit} onChange={setFm('unit')} className={inp}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Cost (₹)</label>
                  <input type="number" min="0" step="0.01" placeholder="e.g. 450" value={form.unit_cost} onChange={setFm('unit_cost')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total (₹)</label>
                  <input readOnly value={computedTotal ? `₹ ${computedTotal}` : ''} placeholder="Auto" className={`${inp} bg-gray-50 text-gray-500`} />
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Remarks</label>
                  <textarea rows={2} placeholder="Notes…" value={form.remarks} onChange={setFm('remarks')} className={`${inp} resize-none`} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button onClick={closeModal} className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
