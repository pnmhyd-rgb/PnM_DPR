import { useState, useEffect, useCallback } from 'react'
import { getStockLedger, getInventoryItems, getWarehouses } from '../../lib/api'
import { RefreshCw, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]
const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
const fmtMoney = v => v != null ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'
const fmtNum   = v => v != null ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'

const TXN_BADGES = {
  GRN:           'bg-green-100 text-green-800',
  CONSUMPTION:   'bg-red-100 text-red-800',
  TRANSFER_IN:   'bg-blue-100 text-blue-800',
  TRANSFER_OUT:  'bg-amber-100 text-amber-800',
  ADJUSTMENT:    'bg-purple-100 text-purple-800',
  RETURN:        'bg-teal-100 text-teal-800',
  OPENING:       'bg-gray-100 text-gray-700',
}

export default function StockLedger() {
  const [records, setRecords]   = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const [items, setItems]       = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [filters, setFilters]   = useState({ item_id: '', warehouse_id: '', txn_type: '', from: today(), to: today() })
  const LIMIT = 100

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getStockLedger({ ...filters, page, limit: LIMIT })
      setRecords(r.data.data); setTotal(r.data.total)
    } catch {} finally { setLoading(false) }
  }, [filters, page])

  useEffect(() => {
    Promise.all([getInventoryItems({ limit: 500 }), getWarehouses()]).then(([it, w]) => {
      setItems(it.data.data); setWarehouses(w.data.data)
    })
  }, [])
  useEffect(() => { setPage(1) }, [filters])
  useEffect(() => { load() }, [load])

  const setF = (key, val) => setFilters(f => ({ ...f, [key]: val }))
  const totalPages = Math.ceil(total / LIMIT)

  const TXN_TYPES = ['GRN', 'CONSUMPTION', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'RETURN', 'OPENING']

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><BookOpen size={20} />Stock Ledger</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} entries</p>
        </div>
        <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 bg-white border border-gray-200 rounded-xl p-3">
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filters.item_id} onChange={e => setF('item_id', e.target.value)}>
          <option value="">All Parts</option>
          {items.map(it => <option key={it.id} value={it.id}>{it.part_code} - {it.part_name}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filters.warehouse_id} onChange={e => setF('warehouse_id', e.target.value)}>
          <option value="">All Warehouses</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filters.txn_type} onChange={e => setF('txn_type', e.target.value)}>
          <option value="">All Types</option>
          {TXN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filters.from} onChange={e => setF('from', e.target.value)} />
        <span className="flex items-center text-gray-400 text-sm">to</span>
        <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filters.to} onChange={e => setF('to', e.target.value)} />
        <button onClick={() => setFilters({ item_id: '', warehouse_id: '', txn_type: '', from: '', to: '' })} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Clear</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Date</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Type</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Reference</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Part</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Warehouse</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Opening</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">In</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Out</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Closing</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Rate</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Amount</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Created By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={12} className="py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={12} className="py-10 text-center text-gray-400">No ledger entries for selected filters</td></tr>
            ) : records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2.5 text-gray-600">{fmtDate(r.txn_date)}</td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TXN_BADGES[r.txn_type] || 'bg-gray-100 text-gray-600'}`}>
                    {r.txn_type}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-blue-700">{r.reference_no || '—'}</td>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-gray-900 max-w-[180px] truncate">{r.part_name}</div>
                  <div className="text-xs text-gray-400">{r.part_code}</div>
                </td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{r.warehouse_name || '—'}</td>
                <td className="px-3 py-2.5 text-right text-gray-500">{fmtNum(r.opening_qty)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-green-700">
                  {parseFloat(r.in_qty) > 0 ? `+${fmtNum(r.in_qty)}` : '—'}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-red-600">
                  {parseFloat(r.out_qty) > 0 ? `-${fmtNum(r.out_qty)}` : '—'}
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-gray-900">{fmtNum(r.closing_qty)}</td>
                <td className="px-3 py-2.5 text-right text-gray-600">{r.rate ? fmtMoney(r.rate) : '—'}</td>
                <td className="px-3 py-2.5 text-right font-medium text-gray-800">{r.amount ? fmtMoney(r.amount) : '—'}</td>
                <td className="px-3 py-2.5 text-gray-500 text-xs">{r.created_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <span>Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 border rounded hover:bg-gray-50 disabled:opacity-40"><ChevronLeft size={15} /></button>
            <span>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 border rounded hover:bg-gray-50 disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
