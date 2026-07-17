import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getInventoryDashboard } from '../../lib/api'
import {
  Package, Warehouse, TrendingDown, TrendingUp, AlertTriangle, XCircle,
  ShoppingCart, RefreshCw, BarChart2, DollarSign, ArrowRightLeft, FileCheck
} from 'lucide-react'

const fmtMoney = v => `₹ ${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const fmtNum   = v => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

function StatCard({ icon: Icon, label, value, sub, color = 'blue', onClick }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-700 border-blue-200',
    green:  'bg-green-50 text-green-700 border-green-200',
    amber:  'bg-amber-50 text-amber-700 border-amber-200',
    red:    'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    gray:   'bg-gray-50 text-gray-700 border-gray-200',
  }
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 flex items-start gap-3 ${colors[color]} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <div className="mt-0.5"><Icon size={20} /></div>
      <div className="min-w-0">
        <p className="text-xs font-medium opacity-70 truncate">{label}</p>
        <p className="text-xl font-bold leading-tight">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SimpleBarChart({ data, valueKey, labelKey, color = '#3b82f6', formatValue }) {
  if (!data?.length) return <p className="text-sm text-gray-400 text-center py-4">No data</p>
  const max = Math.max(...data.map(d => d[valueKey] || 0)) || 1
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-20 flex-shrink-0 truncate">{d[labelKey]}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
            <div
              className="h-full rounded-full flex items-center justify-end pr-1.5"
              style={{ width: `${Math.max((d[valueKey] / max) * 100, 2)}%`, background: color }}
            >
              <span className="text-xs text-white font-medium">
                {formatValue ? formatValue(d[valueKey]) : fmtNum(d[valueKey])}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function InventoryDashboard() {
  const navigate = useNavigate()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const r = await getInventoryDashboard()
      setData(r.data.data)
    } catch { setError('Failed to load dashboard data') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={20} className="animate-spin text-blue-600 mr-2" />
      <span className="text-gray-500">Loading dashboard…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 text-center text-red-600 bg-red-50 rounded-xl m-4">{error}</div>
  )

  const s = data?.summary || {}
  const c = data?.charts  || {}

  return (
    <div className="p-4 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time stock overview</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Package}     label="Total Spare Parts"    value={fmtNum(s.total_items)}          color="blue"   onClick={() => navigate('/inventory/items')} />
        <StatCard icon={DollarSign}  label="Inventory Value"      value={fmtMoney(s.total_inventory_value)} color="green" />
        <StatCard icon={Warehouse}   label="Total Warehouses"     value={fmtNum(s.total_warehouses)}     color="purple" onClick={() => navigate('/inventory/warehouses')} />
        <StatCard icon={Package}     label="Available Stock"      value={fmtNum(s.total_available_qty)}  sub="units"    color="blue" />
      </div>

      {/* KPI Cards Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={AlertTriangle} label="Low Stock Items"    value={fmtNum(s.low_stock_count)}      color="amber"  onClick={() => navigate('/inventory/items?low_stock=true')} />
        <StatCard icon={XCircle}       label="Out of Stock"       value={fmtNum(s.out_of_stock_count)}   color="red"    onClick={() => navigate('/inventory/items')} />
        <StatCard icon={TrendingDown}  label="Today Consumption"  value={fmtMoney(s.today_consumption_amount)} sub={`${fmtNum(s.today_consumption_qty)} units`} color="amber" />
        <StatCard icon={TrendingUp}    label="Monthly Purchase"   value={fmtMoney(s.monthly_purchase)}   color="green"  onClick={() => navigate('/inventory/grn')} />
      </div>

      {/* KPI Cards Row 3 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={TrendingDown}  label="Monthly Consumption" value={fmtMoney(s.monthly_consumption)} color="blue" onClick={() => navigate('/inventory/consumption')} />
        <StatCard icon={Package}       label="Reserved Stock"      value={fmtNum(s.total_reserved_qty)}  sub="units"   color="gray" />
        <StatCard icon={FileCheck}     label="Pending GRN"         value={fmtNum(s.pending_grn)}         color={s.pending_grn > 0 ? 'amber' : 'green'} onClick={() => navigate('/inventory/grn')} />
        <StatCard icon={ArrowRightLeft} label="Pending Transfers"  value={fmtNum(s.pending_transfers)}   color={s.pending_transfers > 0 ? 'amber' : 'green'} onClick={() => navigate('/inventory/transfers')} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monthly Consumption Trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <TrendingDown size={16} className="text-red-500" /> Monthly Consumption (6 months)
          </h3>
          <SimpleBarChart
            data={c.monthly_consumption_trend}
            valueKey="amount" labelKey="month"
            color="#ef4444"
            formatValue={fmtMoney}
          />
        </div>

        {/* Monthly Purchase Trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-500" /> Monthly Purchase (6 months)
          </h3>
          <SimpleBarChart
            data={c.monthly_grn_trend}
            valueKey="amount" labelKey="month"
            color="#22c55e"
            formatValue={fmtMoney}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top Consumed Items */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <BarChart2 size={16} className="text-amber-500" /> Top Consumed (This Month)
          </h3>
          <SimpleBarChart
            data={c.top_consumed}
            valueKey="total_qty" labelKey="part_name"
            color="#f59e0b"
          />
        </div>

        {/* Warehouse-wise Stock */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Warehouse size={16} className="text-blue-500" /> Warehouse-wise Stock Value
          </h3>
          <SimpleBarChart
            data={c.warehouse_stock}
            valueKey="stock_value" labelKey="warehouse_name"
            color="#3b82f6"
            formatValue={fmtMoney}
          />
        </div>

        {/* Category-wise Value */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <DollarSign size={16} className="text-purple-500" /> Category-wise Value
          </h3>
          <SimpleBarChart
            data={c.category_value}
            valueKey="value" labelKey="category_name"
            color="#8b5cf6"
            formatValue={fmtMoney}
          />
        </div>
      </div>
    </div>
  )
}
