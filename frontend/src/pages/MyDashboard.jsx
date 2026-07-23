import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProjects, getFleetSummary, getSummary, getComplianceSummary, getComplianceUpcoming, getFleetList, getMachineAgeing, getDailyMachineUtil, getDprTrend } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { today } from '../lib/utils'
import { ChevronDown, RefreshCw, PinOff, ShieldAlert, AlertTriangle, Clock, CheckCircle2, X, Activity, TrendingUp, Truck, Gauge, Users, FileCheck, BarChart2, Zap, PauseCircle, Wrench, MapPin } from 'lucide-react'
import MachineDetailPanel from '../components/MachineDetailPanel'

/* ─── Status config ───────────────────────────────────────────── */
const STATUSES = [
  { key: 'Active',    label: 'Active',    color: '#16A34A' },
  { key: 'Idle',      label: 'Idle',      color: '#D97706' },
  { key: 'Breakdown', label: 'Breakdown', color: '#DC2626' },
  { key: 'Surplus',   label: 'Surplus',   color: '#7C3AED' },
  { key: 'Accident',  label: 'Accident',  color: '#EA580C' },
  { key: 'Scrap',     label: 'Scrap',     color: '#6B7280' },
]

/* ─── Period helpers ─────────────────────────────────────────── */
const PERIODS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'custom',     label: 'Custom Range' },
]

function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${dd}`
}

function computeRange(period, customFrom, customTo) {
  const now = new Date()
  const t = fmtDate(now)
  switch (period) {
    case 'today':      return { from: t, to: t }
    case 'yesterday':  { const d = new Date(now); d.setDate(d.getDate()-1); const s=fmtDate(d); return { from:s, to:s } }
    case 'this_week':  { const dow = now.getDay()||7; const m=new Date(now); m.setDate(now.getDate()-dow+1); return { from:fmtDate(m), to:t } }
    case 'this_month': { return { from: fmtDate(new Date(now.getFullYear(),now.getMonth(),1)), to:t } }
    case 'last_month': { const fm=new Date(now.getFullYear(),now.getMonth()-1,1); const lm=new Date(now.getFullYear(),now.getMonth(),0); return { from:fmtDate(fm), to:fmtDate(lm) } }
    case 'custom':     return { from: customFrom || t, to: customTo || t }
    default:           return { from: t, to: t }
  }
}

function computePrevRange(from, to) {
  const days = Math.round((new Date(to)-new Date(from))/86400000)+1
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate()-1)
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevTo.getDate()-days+1)
  return { from: fmtDate(prevFrom), to: fmtDate(prevTo) }
}

function displayRange(from, to) {
  const f = d => { const [y,m,dd] = d.split('-'); return `${dd}-${m}-${y}` }
  return from === to ? f(from) : `${f(from)} – ${f(to)}`
}

/* ─── Smooth SVG path ────────────────────────────────────────── */
function smoothPath(pts) {
  return pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
    const prev = pts[i-1]
    const cpx = (p.x - prev.x) * 0.35
    return acc + ` C${(prev.x+cpx).toFixed(1)},${prev.y.toFixed(1)} ${(p.x-cpx).toFixed(1)},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }, '')
}

/* ─── Trend Chart (line + optional area fill) ────────────────── */
function TrendChart({ data, yKey, color, fill, unit = '', emptyMsg = 'No data for this period' }) {
  const W = 500, H = 160, PL = 42, PB = 26, PT = 14, PR = 10
  const plotW = W - PL - PR, plotH = H - PT - PB

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-300">{emptyMsg}</div>
    )
  }

  const vals = data.map(d => parseFloat(d[yKey]) || 0)
  const maxV = Math.max(...vals, 1)
  const gridVals = [0, 0.25, 0.5, 0.75, 1]

  const pts = data.map((d, i) => ({
    x: PL + (i / Math.max(data.length - 1, 1)) * plotW,
    y: PT + plotH - (parseFloat(d[yKey]) || 0) / maxV * plotH,
    v: parseFloat(d[yKey]) || 0,
    date: d.date,
  }))

  const linePath = smoothPath(pts)
  const areaPath = fill
    ? `${linePath} L${pts[pts.length-1].x.toFixed(1)},${(PT+plotH).toFixed(1)} L${pts[0].x.toFixed(1)},${(PT+plotH).toFixed(1)} Z`
    : null

  const step = Math.max(1, Math.floor(pts.length / 6))
  const xLabels = pts.filter((_, i) => i % step === 0 || i === pts.length - 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      {gridVals.map((f, i) => {
        const y = PT + (1-f) * plotH
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="#f1f5f9" strokeWidth={i===0?'1.5':'1'} />
            <text x={PL-4} y={y+3.5} textAnchor="end" fontSize="9" fill="#94a3b8">
              {Math.round(f * maxV)}{unit}
            </text>
          </g>
        )
      })}
      {fill && <path d={areaPath} fill={color} opacity="0.1" />}
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {pts.length <= 31 && pts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="2.5" fill={color} />
      ))}
      {xLabels.map((p, i) => (
        <text key={i} x={p.x.toFixed(1)} y={H-3} textAnchor="middle" fontSize="9" fill="#94a3b8">
          {p.date.slice(5)}
        </text>
      ))}
    </svg>
  )
}

/* ─── Horizontal Bar Chart ───────────────────────────────────── */
function HBarChart({ rows, valueKey, labelKey, color, maxV = 100, unit = '%' }) {
  if (!rows || rows.length === 0) {
    return <div className="flex items-center justify-center h-20 text-xs text-gray-300">No data</div>
  }
  const top8 = rows.slice(0, 8)
  return (
    <div className="space-y-2.5">
      {top8.map((row, i) => {
        const val = parseFloat(row[valueKey]) || 0
        const pct = Math.min((val / maxV) * 100, 100)
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-20 text-gray-600 text-right truncate flex-shrink-0">{row[labelKey]}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full" style={{ width: `${pct}%`, backgroundColor: color, transition: 'width .6s ease' }} />
            </div>
            <span className="w-10 font-semibold tabular-nums text-right" style={{ color }}>
              {val.toFixed(1)}{unit}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ─── KPI Card ───────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color, bg, Icon, delta, onClick }) {
  const isPos = delta > 0, isNeg = delta < 0
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1 relative overflow-hidden
        ${onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-200 transition-all duration-200' : ''}`}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase leading-tight">{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <p className="text-[26px] font-extrabold tabular-nums leading-tight" style={{ color }}>{value}</p>
      <p className="text-[10px] text-gray-400 leading-tight truncate">{sub}</p>
      {delta !== undefined && delta !== null && (
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[10px] font-semibold ${isPos ? 'text-green-600' : isNeg ? 'text-red-500' : 'text-gray-400'}`}>
            {isPos ? '▲' : isNeg ? '▼' : '—'} {delta !== 0 ? `${Math.abs(delta).toFixed(1)}%` : 'No change'}
          </span>
          <span className="text-[10px] text-gray-300">vs prev period</span>
        </div>
      )}
    </div>
  )
}

/* ─── Clickable stat card ─────────────────────────────────────── */
function StatCard({ label, value, sub, borderColor, valueColor, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-0.5 min-w-0 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-300 transition-all' : ''}`}
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase truncate">
        {label}
      </p>
      <p
        className={`text-[28px] font-extrabold tabular-nums leading-tight ${onClick ? 'underline decoration-dotted underline-offset-2' : ''}`}
        style={{ color: valueColor }}
      >
        {value}
      </p>
      <p className="text-[11px] text-gray-400 leading-snug truncate">{sub}</p>
    </div>
  )
}

/* ─── Three-dot action menu ───────────────────────────────────── */
function ActionMenu({ onRefresh, onUnpin }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded
          text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <span className="text-xl leading-none tracking-tighter font-bold">⋮</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-52 bg-white border border-gray-200
          rounded-lg shadow-xl overflow-hidden">
          <button
            onClick={() => { onRefresh(); setOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700
              hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} className="text-gray-500" /> Refresh
          </button>
          <button
            onClick={() => { onUnpin(); setOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700
              hover:bg-gray-50 transition-colors border-t border-gray-100"
          >
            <PinOff size={14} className="text-gray-500" /> Unpin from My Dashboard
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Pie chart with leader-line callout labels ───────────────── */
function PieChart({ slices, total }) {
  if (!total) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center px-6">
        <p className="text-gray-400 text-sm font-medium">No fleet data for this date</p>
        <p className="text-gray-300 text-xs mt-1">
          Machines show here once daily entries are submitted.
        </p>
      </div>
    )
  }

  const cx = 200, cy = 195, r = 150
  let angle = -Math.PI / 2
  const arcs = []

  for (const s of slices) {
    if (!s.value) continue
    const sweep = (s.value / total) * 2 * Math.PI
    const sa = angle
    angle += sweep
    const ea = angle
    const midA = sa + sweep / 2
    const pct = ((s.value / total) * 100).toFixed(1)

    let d
    if (Math.abs(sweep - 2 * Math.PI) < 0.0001) {
      const ox = cx + r, oy = cy
      const ax = cx - r, ay = cy
      d = `M${ox} ${oy} A${r} ${r} 0 1 1 ${ax} ${ay} A${r} ${r} 0 1 1 ${ox} ${oy} Z`
    } else {
      const x1 = (cx + r * Math.cos(sa)).toFixed(2)
      const y1 = (cy + r * Math.sin(sa)).toFixed(2)
      const x2 = (cx + r * Math.cos(ea)).toFixed(2)
      const y2 = (cy + r * Math.sin(ea)).toFixed(2)
      d = `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`
    }

    const elbowR = r + 25
    const ex = cx + elbowR * Math.cos(midA)
    const ey = cy + elbowR * Math.sin(midA)
    const isRight = Math.cos(midA) > 0
    const hLen = sweep < 0.18 ? 68 : 52
    const tx = isRight ? ex + hLen : ex - hLen
    const ty = ey

    arcs.push({
      d, color: s.color, label: s.label, value: s.value, pct,
      ex: ex.toFixed(1), ey: ey.toFixed(1),
      tx: tx.toFixed(1), ty: ty.toFixed(1),
      isRight,
      showLabel: sweep > 0.055,
    })
  }

  return (
    <svg viewBox="-60 -10 560 400" className="w-full h-full">
      {arcs.map((a, i) => (
        <path key={`s${i}`} d={a.d} fill={a.color} stroke="white" strokeWidth="1.5" />
      ))}
      {arcs.filter(a => a.showLabel).map((a, i) => {
        const lx = parseFloat(a.tx) + (a.isRight ? 4 : -4)
        const anchor = a.isRight ? 'start' : 'end'
        return (
          <g key={`lb${i}`}>
            <line x1={a.ex} y1={a.ey} x2={a.tx} y2={a.ty} stroke="#bbb" strokeWidth="0.8" />
            <circle cx={a.ex} cy={a.ey} r="2" fill="#bbb" />
            <text x={lx} y={parseFloat(a.ty) - 4} textAnchor={anchor} fontSize="11"
              fill="#333" fontWeight="600">{a.label}</text>
            <text x={lx} y={parseFloat(a.ty) + 10} textAnchor={anchor} fontSize="10"
              fill="#888">{a.value.toLocaleString()} ({a.pct}%)</text>
          </g>
        )
      })}
    </svg>
  )
}

/* ─── Dropdown ────────────────────────────────────────────────── */
function Dropdown({ value, onChange, children, className = '' }) {
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm
          text-gray-700 bg-white focus:outline-none focus:border-blue-500 focus:ring-1
          focus:ring-blue-400 cursor-pointer min-w-[140px]"
      >
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 pointer-events-none text-gray-500" />
    </div>
  )
}

/* ─── Compliance status helpers ──────────────────────────────── */
const COMP_STATUS = [
  { key: 'expired',  label: 'Expired',        color: '#dc2626', bg: '#fee2e2', icon: AlertTriangle },
  { key: 'critical', label: 'Critical (≤7d)', color: '#ea580c', bg: '#ffedd5', icon: AlertTriangle },
  { key: 'warning',  label: 'Due Soon (≤30d)',color: '#d97706', bg: '#fef3c7', icon: Clock },
  { key: 'valid',    label: 'Valid',          color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
]

function compCalcStatus(expiryDate) {
  if (!expiryDate) return 'na'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(expiryDate)
  const days = Math.ceil((exp - today) / 86400000)
  if (days < 0) return 'expired'
  if (days <= 7)  return 'critical'
  if (days <= 30) return 'warning'
  return 'valid'
}

/* ─── Fleet drill-down drawer ─────────────────────────────────── */
function FleetDrilldownPanel({ drilldown, date, projectCode, onClose }) {
  const [machines, setMachines] = useState([])
  const [loading, setLoading]   = useState(true)
  const [detailPanel, setDetailPanel] = useState(null)

  useEffect(() => {
    if (!drilldown) return
    setLoading(true)
    const params = { date }
    if (projectCode) params.project_code = projectCode
    if (drilldown.ownership) params.ownership = drilldown.ownership
    if (drilldown.fleet_status) params.fleet_status = drilldown.fleet_status
    if (drilldown.asset_type) params.asset_type = drilldown.asset_type
    getFleetList(params)
      .then(r => setMachines(r.data.data))
      .catch(() => setMachines([]))
      .finally(() => setLoading(false))
  }, [drilldown, date, projectCode])

  const statusBadge = (m) => {
    const colors = {
      'Active':       'bg-green-100 text-green-700',
      'Idle':         'bg-amber-100 text-amber-700',
      'Breakdown':    'bg-red-100 text-red-700',
      'Surplus':      'bg-violet-100 text-violet-700',
      'Accident':     'bg-orange-100 text-orange-700',
      'Scrap':        'bg-gray-100 text-gray-600',
      'Not Deployed': 'bg-gray-100 text-gray-500',
    }
    return (
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colors[m.fleet_status] || 'bg-gray-100 text-gray-600'}`}>
        {m.fleet_status}
      </span>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col border-l border-gray-200"
        style={{ width: 'min(900px, 95vw)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 rounded-full" style={{ backgroundColor: drilldown.color || '#2980B9' }} />
            <div>
              <h2 className="text-base font-bold text-gray-900">{drilldown.label}</h2>
              <p className="text-xs text-gray-400">{loading ? '…' : `${machines.length} asset${machines.length !== 1 ? 's' : ''}`}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading…</div>
          ) : machines.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">No assets found</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['#', 'Project', 'SL No', 'Asset Group', 'Asset Category', 'Asset Name',
                    'Manufacturer', 'Model', 'Capacity / UOM', 'Reg No', 'Fuel Type', 'Shift',
                    drilldown.fleet_status ? '' : 'Status',
                  ].filter(Boolean).map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {machines.map((m, i) => (
                  <tr key={m.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className={`font-semibold px-1.5 py-0.5 rounded text-xs ${m.ownership === 'Hire' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                        {m.project_code}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => setDetailPanel(m)}
                        className="text-blue-600 hover:text-blue-800 hover:underline font-semibold text-left">
                        {m.slno}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{m.asset_group || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{m.asset_cat   || '—'}</td>
                    <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap">{m.eq_type}</td>
                    <td className="px-3 py-2 text-gray-600">{m.manufacturer || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{m.model || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{m.capacity ? `${m.capacity} ${m.uom || ''}`.trim() : '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{m.reg_no || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{m.fuel_type || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${m.shift_type === 'Dual Shift' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                        {m.shift_type || '—'}
                      </span>
                    </td>
                    {!drilldown.fleet_status && (
                      <td className="px-3 py-2">{statusBadge(m)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 bg-white border-t border-gray-100 text-xs text-gray-400">
          {machines.length} asset{machines.length !== 1 ? 's' : ''} · Click SL No for full details
        </div>
      </div>

      {detailPanel && (
        <MachineDetailPanel machine={detailPanel} onClose={() => setDetailPanel(null)} />
      )}
    </>
  )
}

/* ─── Ageing drill-down drawer ───────────────────────────────── */
function AgeingDrilldownPanel({ bucket, onClose }) {
  const machines = bucket.machines || []
  const [search, setSearch] = useState('')
  const fmt = (d) => {
    if (!d) return '—'
    const [y, mo, day] = d.split('-')
    return `${day}-${mo}-${y}`
  }
  const filtered = search.trim()
    ? machines.filter(m =>
        (m.slno || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.nickname || m.eq_type || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.project_code || '').toLowerCase().includes(search.toLowerCase())
      )
    : machines

  const statusColors = {
    submitted: 'bg-green-100 text-green-700',
    closed:    'bg-blue-100 text-blue-700',
    open:      'bg-amber-100 text-amber-700',
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col border-l border-gray-200"
        style={{ width: 'min(980px, 96vw)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: bucket.color }} />
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Counter Log Delay — <span style={{ color: bucket.color }}>{bucket.label}</span>
              </h2>
              <p className="text-xs text-gray-400">{machines.length} asset{machines.length !== 1 ? 's' : ''} · {bucket.key === 'no-log' ? 'no counter log recorded yet' : 'DPR entry overdue'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search SL No / Asset…"
              className="border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-700
                focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200 bg-white w-44"
            />
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Summary bar */}
        <div className="flex-shrink-0 flex items-center gap-6 px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
          <span>Showing <strong className="text-gray-800">{filtered.length}</strong> of {machines.length} assets</span>
          <span style={{ color: bucket.color }} className="font-semibold">
            {bucket.label} delay
          </span>
          {machines.filter(m => m.last_entry_date === null).length > 0 && (
            <span className="text-red-500 font-medium">
              {machines.filter(m => m.last_entry_date === null).length} never reported
            </span>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">
              {search ? 'No assets match search' : 'No assets in this range'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['#', 'Project', 'SL No', 'Asset Name', 'Type', 'Ownership', 'Shift', 'Last Entry Date', 'Last Shift', 'Last Hrs', 'Entry Status', 'Delay'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((m, i) => {
                  const delay = m.days_since == null ? 9999 : m.days_since
                  const delayBg = delay > 30 ? '#fef2f2' : delay >= 15 ? '#fff7ed' : delay >= 8 ? '#fffbeb' : 'transparent'
                  return (
                    <tr key={m.id} className="hover:bg-blue-50/30 transition-colors" style={{ backgroundColor: delayBg }}>
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${m.ownership === 'Hire' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                          {m.project_code}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-bold text-gray-800">{m.slno}</td>
                      <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap">{m.nickname || m.eq_type}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{m.eq_type}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${m.ownership === 'Hire' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                          {m.ownership}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.shift_type === 'Dual Shift' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                          {m.shift_type || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 tabular-nums">{fmt(m.last_entry_date)}</td>
                      <td className="px-3 py-2 text-gray-500">{m.last_shift || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 tabular-nums">
                        {m.last_working_hours != null ? `${parseFloat(m.last_working_hours).toFixed(1)}h` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {m.last_entry_status ? (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${statusColors[m.last_entry_status] || 'bg-gray-100 text-gray-500'}`}>
                            {m.last_entry_status}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-extrabold tabular-nums text-sm" style={{ color: bucket.color }}>
                          {m.days_since == null ? 'Never' : `${m.days_since}d`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex-shrink-0 px-5 py-2.5 bg-white border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">{filtered.length} asset{filtered.length !== 1 ? 's' : ''} shown · Row color = delay severity</span>
          <span className="text-xs text-gray-400">Sorted by most overdue first</span>
        </div>
      </div>
    </>
  )
}

/* ─── Utilization drill-down drawer ──────────────────────────── */
function UtilizationDrilldownPanel({ projectCode, projectName, date, onClose }) {
  const [machines, setMachines] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')

  useEffect(() => {
    setLoading(true)
    getDailyMachineUtil({ date, project_code: projectCode })
      .then(r => setMachines(r.data?.data || []))
      .catch(() => setMachines([]))
      .finally(() => setLoading(false))
  }, [projectCode, date])

  const fmt = d => {
    if (!d) return '—'
    const [y, m, day] = d.split('-')
    return `${day}-${m}-${y}`
  }

  const filtered = search.trim()
    ? machines.filter(m =>
        (m.slno      || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.nickname  || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.eq_type   || '').toLowerCase().includes(search.toLowerCase())
      )
    : machines

  const reported  = machines.filter(m => Number(m.entry_count) > 0).length
  const avgUtil   = machines.length
    ? (machines.reduce((s, m) => s + (parseFloat(m.util_pct) || 0), 0) / machines.length).toFixed(1)
    : '0.0'

  const utilColor = v => parseFloat(v) >= 70 ? '#16a34a' : parseFloat(v) >= 40 ? '#d97706' : parseFloat(v) > 0 ? '#2563eb' : '#9ca3af'
  const statusBg  = s => ({ submitted: 'bg-green-100 text-green-700', closed: 'bg-blue-100 text-blue-700', open: 'bg-amber-100 text-amber-700' }[s] || 'bg-gray-100 text-gray-500')

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col border-l border-gray-200"
        style={{ width: 'min(1060px, 96vw)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full bg-green-500" />
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Utilization — <span className="text-green-600">{projectCode}</span>
                {projectName && <span className="ml-1.5 text-gray-400 text-sm font-normal">{projectName}</span>}
              </h2>
              <p className="text-xs text-gray-400">{fmt(date)} · {machines.length} assets · {reported} reported</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search SL No / Nickname…"
              className="border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-700
                focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-200 bg-white w-48"
            />
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex-shrink-0 flex items-center gap-6 px-5 py-2 bg-green-50/60 border-b border-green-100 text-xs">
          <span className="text-gray-500">Total <strong className="text-gray-800">{machines.length}</strong> assets</span>
          <span className="text-gray-500">Reported <strong className="text-green-700">{reported}</strong> / {machines.length}</span>
          <span className="text-gray-500">Avg Utilization <strong style={{ color: utilColor(avgUtil) }}>{avgUtil}%</strong></span>
          {search && <span className="text-gray-400">Showing {filtered.length} of {machines.length}</span>}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">
              {search ? 'No assets match search' : 'No assets found'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['#','SL No','Nickname','Asset Type','Capacity','Ownership','Shift Config','Shifts Reported','Working Hrs','Util %','HSD (L)','Breakdown','Status'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((m, i) => {
                  const util    = parseFloat(m.util_pct) || 0
                  const hasEntry = Number(m.entry_count) > 0
                  return (
                    <tr key={m.id}
                      className={`transition-colors ${hasEntry ? 'hover:bg-green-50/30' : 'bg-gray-50/50 hover:bg-gray-50'}`}
                    >
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 font-bold text-gray-800">{m.slno}</td>
                      <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">
                        {m.nickname || <span className="text-gray-400 italic">{m.eq_type}</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{m.eq_type}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {m.capacity ? `${m.capacity}${m.uom ? ' ' + m.uom : ''}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${m.ownership === 'Hire' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                          {m.ownership}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.shift_type === 'Dual Shift' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                          {m.shift_type || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {hasEntry ? m.shifts || '—' : <span className="text-gray-300 italic">Not submitted</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-medium text-gray-700">
                        {hasEntry ? `${parseFloat(m.working_hours || 0).toFixed(1)}h` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {hasEntry ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 bg-gray-100 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full" style={{ width: `${Math.min(util, 100)}%`, backgroundColor: utilColor(util) }} />
                            </div>
                            <span className="font-bold tabular-nums text-xs" style={{ color: utilColor(util) }}>
                              {util.toFixed(1)}%
                            </span>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">
                        {hasEntry ? parseFloat(m.hsd || 0).toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {parseFloat(m.breakdown || 0) > 0
                          ? <span className="text-red-600 font-semibold">{parseFloat(m.breakdown).toFixed(1)}h</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {hasEntry && m.status
                          ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${statusBg(m.status)}`}>{m.status}</span>
                          : <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Pending</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex-shrink-0 px-5 py-2.5 bg-white border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>{filtered.length} asset{filtered.length !== 1 ? 's' : ''} · Green rows = DPR submitted · Gray rows = pending</span>
          <span>Sorted by Utilization % descending</span>
        </div>
      </div>
    </>
  )
}

/* ─── Main Page ───────────────────────────────────────────────── */
export default function MyDashboard() {
  const navigate          = useNavigate()
  const { user, isAdmin } = useAuth()

  // Period / filter state
  const [period,      setPeriod]      = useState('today')
  const [customFrom,  setCustomFrom]  = useState(today())
  const [customTo,    setCustomTo]    = useState(today())
  const [projectCode, setProjectCode] = useState('')
  const [assetType,   setAssetType]   = useState('Measurable Asset')
  const [tick,        setTick]        = useState(0)

  const range     = computeRange(period, customFrom, customTo)
  const prevRange = computePrevRange(range.from, range.to)

  // Core data
  const [projects,     setProjects]     = useState([])
  const [rows,         setRows]         = useState([])           // fleet-summary (status counts)
  const [summaryRows,  setSummaryRows]  = useState([])           // per-site summary
  const [prevSumRows,  setPrevSumRows]  = useState([])           // previous period summary
  const [reportDate,   setReportDate]   = useState(today())
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  // Trend charts
  const [trendData,    setTrendData]    = useState([])
  const [trendLoading, setTrendLoading] = useState(false)

  // Ageing
  const [ageingData,      setAgeingData]      = useState({ buckets: [], total: 0 })
  const [ageingLoading,   setAgeingLoading]   = useState(false)
  const [ageingDrilldown, setAgeingDrilldown] = useState(null)
  const [ageingProject,   setAgeingProject]   = useState('')

  // Compliance
  const [compSummary,  setCompSummary]  = useState({ expired:0, critical:0, warning:0, valid:0, na:0, total:0 })
  const [compUpcoming, setCompUpcoming] = useState([])

  // Drill-downs
  const [drilldown,    setDrilldown]    = useState(null)
  const [utilDrilldown,setUtilDrilldown]= useState(null)

  useEffect(() => {
    if (isAdmin) getProjects().then(r => setProjects(r.data?.data || [])).catch(() => {})
  }, [isAdmin])

  useEffect(() => {
    getComplianceSummary().then(r => setCompSummary(r.data?.data || {})).catch(() => {})
    getComplianceUpcoming(30).then(r => setCompUpcoming(r.data?.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setAgeingLoading(true)
    const params = {}
    if (ageingProject) params.project_code = ageingProject
    getMachineAgeing(params)
      .then(r => setAgeingData(r.data?.data || { buckets: [], total: 0 }))
      .catch(() => setAgeingData({ buckets: [], total: 0 }))
      .finally(() => setAgeingLoading(false))
  }, [ageingProject, tick])

  const fetchData = useCallback(() => {
    setLoading(true); setError('')
    const fleetParams = { date: range.to, asset_type: assetType }
    if (projectCode) fleetParams.project_code = projectCode
    const sumParams = { date: range.to, asset_type: assetType, ...(projectCode ? { project_code: projectCode } : {}) }
    const prevSumParams = { date: prevRange.to, asset_type: assetType, ...(projectCode ? { project_code: projectCode } : {}) }

    Promise.all([
      getFleetSummary(fleetParams),
      getSummary(sumParams),
      getSummary(prevSumParams),
    ])
      .then(([fleetRes, sumRes, prevRes]) => {
        setRows(fleetRes.data?.data || [])
        setReportDate(fleetRes.data?.date || range.to)
        setSummaryRows(sumRes.data?.data || [])
        setPrevSumRows(prevRes.data?.data || [])
      })
      .catch(e => { setError(e.response?.data?.error || 'Failed to load dashboard data'); setRows([]) })
      .finally(() => setLoading(false))
  }, [range.to, prevRange.to, projectCode, assetType, tick])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    setTrendLoading(true)
    const params = { from: range.from, to: range.to }
    if (projectCode) params.project_code = projectCode
    getDprTrend(params)
      .then(r => setTrendData(r.data?.data || []))
      .catch(() => setTrendData([]))
      .finally(() => setTrendLoading(false))
  }, [range.from, range.to, projectCode, assetType, tick])

  /* ── Aggregate summary stat cards ─────────────────────────── */
  const filteredSummary = summaryRows

  const totals = filteredSummary.reduce(
    (acc, r) => {
      const rep = parseInt(r.reported_machines || 0)
      return {
        own:      acc.own      + parseInt(r.own_machines    || 0),
        hire:     acc.hire     + parseInt(r.hire_machines   || 0),
        total:    acc.total    + parseInt(r.total_machines  || 0),
        reported: acc.reported + rep,
        util_sum: acc.util_sum + parseFloat(r.avg_utilization || 0) * rep,
        util_den: acc.util_den + rep,
      }
    },
    { own: 0, hire: 0, total: 0, reported: 0, util_sum: 0, util_den: 0 }
  )

  const avgUtil  = totals.util_den > 0
    ? (totals.util_sum / totals.util_den).toFixed(1)
    : '0.0'
  const dprPct   = totals.total > 0
    ? Math.round((totals.reported / totals.total) * 100)
    : 0

  const dprColor  = dprPct  >= 80 ? '#27AE60' : dprPct  >= 50 ? '#F5A623' : '#E74C3C'
  const utilColor = parseFloat(avgUtil) >= 70 ? '#27AE60'
                  : parseFloat(avgUtil) >= 40 ? '#F5A623' : '#2980B9'

  /* ── Machine status counts (from fleet-summary) ─────────────── */
  const statusCounts = { Active: 0, Idle: 0, Breakdown: 0, Surplus: 0, Accident: 0, Scrap: 0 }
  rows.forEach(r => {
    if (r.status in statusCounts) statusCounts[r.status] += Number(r.count) || 0
  })

  /* ── Previous period totals for delta ───────────────────────── */
  const prevTotals = prevSumRows.reduce(
    (acc, r) => {
      const rep = parseInt(r.reported_machines || 0)
      return {
        total:    acc.total    + parseInt(r.total_machines || 0),
        reported: acc.reported + rep,
        util_sum: acc.util_sum + parseFloat(r.avg_utilization || 0) * rep,
        util_den: acc.util_den + rep,
      }
    },
    { total: 0, reported: 0, util_sum: 0, util_den: 0 }
  )
  const prevAvgUtil = prevTotals.util_den > 0 ? prevTotals.util_sum / prevTotals.util_den : null
  const prevDprPct  = prevTotals.total > 0 ? (prevTotals.reported / prevTotals.total) * 100 : null

  const delta = (cur, prev) => prev == null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100

  const pieSlices = STATUSES.map(s => ({
    label: s.label,
    value: statusCounts[s.key] || 0,
    color: s.color,
  })).filter(s => s.value > 0)
  const pieTotal = pieSlices.reduce((a, s) => a + s.value, 0)

  const reportDateFmt = (() => {
    if (!reportDate) return '—'
    const [y, m, d] = reportDate.split('-')
    return `${d}-${m}-${y}`
  })()
  const reportTime = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).toUpperCase()

  /* ── Open drill-down helper ─────────────────────────────────── */
  const openDrill = (config) => { if (loading) return; setDrilldown(config) }

  return (
    <div className="space-y-3">

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">{error}</div>
      )}

      {/* ── Executive Filter Bar ────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* Site */}
            {isAdmin && (
              <Dropdown value={projectCode} onChange={v => { setProjectCode(v); setAgeingProject(v) }}>
                <option value="">All Sites</option>
                {projects.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
              </Dropdown>
            )}
            {/* Period */}
            <Dropdown value={period} onChange={v => setPeriod(v)}>
              {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Dropdown>
            {/* Custom date range pickers */}
            {period === 'custom' ? (
              <div className="flex items-center gap-1">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
                <span className="text-gray-400 text-xs">–</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white" />
              </div>
            ) : (
              <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 font-medium">
                {displayRange(range.from, range.to)}
              </span>
            )}
            <button onClick={() => setTick(t => t + 1)}
              className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded text-gray-500 hover:bg-gray-100 transition-colors" title="Refresh">
              <RefreshCw size={13} />
            </button>
            {/* Asset Type */}
            <Dropdown value={assetType} onChange={v => setAssetType(v)}>
              <option value="Measurable Asset">Measurable Assets</option>
              <option value="Non-Measurable Asset">Non-Measurable Assets</option>
            </Dropdown>
          </div>
          <span className="text-xs text-gray-400">
            Data as of <span className="font-semibold text-gray-600">{reportDateFmt}</span> · {reportTime}
          </span>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <KpiCard label="Total Fleet"      value={loading ? '—' : totals.total}
          sub="Own + Hire combined"   color="#2563EB" bg="#EFF6FF" Icon={Truck}
          delta={delta(totals.total, prevTotals.total)}
          onClick={!loading && totals.total > 0 ? () => openDrill({ label:'All Fleet Assets', color:'#2563EB' }) : undefined} />
        <KpiCard label="Own Fleet"        value={loading ? '—' : totals.own}
          sub="Company-owned assets"  color="#D97706" bg="#FFFBEB" Icon={Gauge}
          delta={delta(totals.own, prevTotals.total > 0 ? prevTotals.total : null)}
          onClick={!loading && totals.own > 0 ? () => openDrill({ label:'Own Assets', color:'#D97706', ownership:'Own' }) : undefined} />
        <KpiCard label="Hire Fleet"       value={loading ? '—' : totals.hire}
          sub="Hired / leased assets" color="#7C3AED" bg="#F5F3FF" Icon={FileCheck}
          delta={null}
          onClick={!loading && totals.hire > 0 ? () => openDrill({ label:'Hire Assets', color:'#7C3AED', ownership:'Hire' }) : undefined} />
        <KpiCard label="DPR Updated"      value={loading ? '—' : `${totals.reported}/${totals.total}`}
          sub={`${dprPct}% compliance`} color={dprPct>=80?'#16a34a':dprPct>=50?'#D97706':'#DC2626'} bg={dprPct>=80?'#F0FDF4':dprPct>=50?'#FFFBEB':'#FEF2F2'} Icon={BarChart2}
          delta={delta(dprPct, prevDprPct)} />
        <KpiCard label="Avg Utilization"  value={loading ? '—' : `${avgUtil}%`}
          sub="Fleet working efficiency" color="#0891B2" bg="#ECFEFF" Icon={TrendingUp}
          delta={delta(parseFloat(avgUtil), prevAvgUtil)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Active"    value={loading ? '—' : statusCounts['Active']}
          sub="Working / entered"  color="#16A34A" bg="#F0FDF4" Icon={Zap}
          delta={null}
          onClick={!loading && statusCounts['Active'] > 0 ? () => openDrill({ label:'Active Assets', color:'#16A34A', fleet_status:'Active' }) : undefined} />
        <KpiCard label="Idle"      value={loading ? '—' : statusCounts['Idle']}
          sub="On site, available" color="#D97706" bg="#FFFBEB" Icon={PauseCircle}
          delta={null}
          onClick={!loading && statusCounts['Idle'] > 0 ? () => openDrill({ label:'Idle Assets', color:'#D97706', fleet_status:'Idle' }) : undefined} />
        <KpiCard label="Breakdown" value={loading ? '—' : statusCounts['Breakdown']}
          sub="Under repair"       color="#DC2626" bg="#FEF2F2" Icon={Wrench}
          delta={null}
          onClick={!loading && statusCounts['Breakdown'] > 0 ? () => openDrill({ label:'Breakdown Assets', color:'#DC2626', fleet_status:'Breakdown' }) : undefined} />
        <KpiCard label="Surplus"   value={loading ? '—' : statusCounts['Surplus']}
          sub="Not required / standby" color="#7C3AED" bg="#F5F3FF" Icon={PauseCircle}
          delta={null}
          onClick={!loading && statusCounts['Surplus'] > 0 ? () => openDrill({ label:'Surplus Assets', color:'#7C3AED', fleet_status:'Surplus' }) : undefined} />
        <KpiCard label="Accident"  value={loading ? '—' : statusCounts['Accident']}
          sub="Accident / damaged"  color="#EA580C" bg="#FFF7ED" Icon={Wrench}
          delta={null}
          onClick={!loading && statusCounts['Accident'] > 0 ? () => openDrill({ label:'Accident Assets', color:'#EA580C', fleet_status:'Accident' }) : undefined} />
        <KpiCard label="Scrap"     value={loading ? '—' : statusCounts['Scrap']}
          sub="Written off"         color="#6B7280" bg="#F9FAFB" Icon={MapPin}
          delta={null}
          onClick={!loading && statusCounts['Scrap'] > 0 ? () => openDrill({ label:'Scrap Assets', color:'#6B7280', fleet_status:'Scrap' }) : undefined} />
      </div>

      {/* ── Charts Row 1: Trend + Trend + Status Donut ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* DPR Submission Trend */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">DPR Submission Trend</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{displayRange(range.from, range.to)}</p>
          </div>
          <div className="p-3" style={{ height: 190 }}>
            {trendLoading
              ? <div className="flex items-center justify-center h-full text-xs text-gray-300">Loading…</div>
              : <TrendChart data={trendData} yKey="submitted" color="#2563EB" />}
          </div>
        </div>

        {/* Utilization Trend */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">Utilization Trend</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Avg utilization % · {displayRange(range.from, range.to)}</p>
          </div>
          <div className="p-3" style={{ height: 190 }}>
            {trendLoading
              ? <div className="flex items-center justify-center h-full text-xs text-gray-300">Loading…</div>
              : <TrendChart data={trendData} yKey="avg_util" color="#16A34A" fill unit="%" />}
          </div>
        </div>

        {/* Machine Status Distribution */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">Status Distribution</p>
            <p className="text-[10px] text-gray-400 mt-0.5">As of {reportDateFmt}</p>
          </div>
          <div style={{ height: 190 }}>
            <PieChart slices={pieSlices} total={pieTotal} />
          </div>
        </div>
      </div>

      {/* ── Charts Row 2: Site Bars + Compliance Bars + Table ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Site Wise Utilization */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <div>
              <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">Site Utilization</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Avg utilization by site</p>
            </div>
          </div>
          <div className="p-4">
            {loading
              ? <div className="text-xs text-gray-300 text-center py-8">Loading…</div>
              : <HBarChart
                  rows={[...summaryRows].sort((a,b) => parseFloat(b.avg_utilization||0)-parseFloat(a.avg_utilization||0))}
                  valueKey="avg_utilization" labelKey="project_code" color="#2563EB" maxV={100} unit="%" />}
          </div>
        </div>

        {/* DPR Compliance by Site */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <div>
              <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">DPR Compliance by Site</p>
              <p className="text-[10px] text-gray-400 mt-0.5">% machines reported</p>
            </div>
          </div>
          <div className="p-4">
            {loading
              ? <div className="text-xs text-gray-300 text-center py-8">Loading…</div>
              : <HBarChart
                  rows={summaryRows.map(r => ({
                    ...r,
                    dpr_pct: parseInt(r.total_machines||0) > 0
                      ? Math.round((parseInt(r.reported_machines||0)/parseInt(r.total_machines||0))*100)
                      : 0,
                  })).sort((a,b) => b.dpr_pct - a.dpr_pct)}
                  valueKey="dpr_pct" labelKey="project_code" color="#16A34A" maxV={100} unit="%" />}
          </div>
        </div>

        {/* Utilization vs Last Month */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">Utilization vs Prev Period</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Current vs {displayRange(prevRange.from, prevRange.to)}</p>
          </div>
          <div className="overflow-auto" style={{ maxHeight: 220 }}>
            {loading
              ? <div className="text-xs text-gray-300 text-center py-8">Loading…</div>
              : summaryRows.length === 0
                ? <div className="text-xs text-gray-300 text-center py-8">No data</div>
                : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        {['Site', 'This Period', 'Prev Period', 'Change'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {summaryRows.map(r => {
                        const cur  = parseFloat(r.avg_utilization || 0)
                        const prev = prevSumRows.find(p => p.project_code === r.project_code)
                        const prevV = parseFloat(prev?.avg_utilization || 0)
                        const chg  = prevV > 0 ? cur - prevV : null
                        return (
                          <tr key={r.project_code} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2 font-semibold text-gray-800">{r.project_code}</td>
                            <td className="px-3 py-2 tabular-nums font-bold text-blue-600">{cur.toFixed(1)}%</td>
                            <td className="px-3 py-2 tabular-nums text-gray-500">{prevV > 0 ? `${prevV.toFixed(1)}%` : '—'}</td>
                            <td className="px-3 py-2 tabular-nums font-semibold">
                              {chg === null ? <span className="text-gray-300">—</span>
                                : <span style={{ color: chg >= 0 ? '#16a34a' : '#dc2626' }}>
                                    {chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%
                                  </span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
          </div>
        </div>
      </div>

      {/* COMPLIANCE summary widget */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="text-base font-extrabold tracking-widest text-blue-600 uppercase flex items-center gap-2">
            <ShieldAlert size={16} className="text-blue-500" />
            RTA Compliance
          </span>
          <button
            onClick={() => navigate('/compliance')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2.5 py-1 hover:bg-blue-50 transition-colors"
          >
            View All →
          </button>
        </div>

        <div className="flex flex-col md:flex-row">
          <div className="p-4 flex-shrink-0">
            <div className="grid grid-cols-2 gap-2" style={{ minWidth: 260 }}>
              {COMP_STATUS.map(({ key, label, color, bg, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => navigate('/compliance')}
                  className="rounded-lg border p-2.5 text-left hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: bg, borderColor: color + '40' }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon size={11} style={{ color }} />
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</span>
                  </div>
                  <p className="text-xl font-extrabold tabular-nums" style={{ color }}>
                    {compSummary[key] ?? 0}
                  </p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">{compSummary.total ?? 0} total document records</p>
          </div>

          <div className="flex-1 border-t md:border-t-0 md:border-l border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">Expiring within 30 days</p>
            {compUpcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle2 size={24} className="text-green-400 mb-1" />
                <p className="text-sm text-gray-400 font-medium">All clear!</p>
                <p className="text-xs text-gray-300">No documents expiring in the next 30 days</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {compUpcoming.slice(0, 8).map(d => {
                  const status = compCalcStatus(d.expiry_date)
                  const statusColors = {
                    expired: 'text-red-600 bg-red-50',
                    critical: 'text-orange-600 bg-orange-50',
                    warning: 'text-yellow-700 bg-yellow-50',
                    valid: 'text-green-700 bg-green-50',
                  }
                  const days = d.days_remaining
                  const daysText = days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'Today' : `${days}d`
                  const docLabel = d.doc_type === 'custom' ? (d.doc_label || 'Custom') : ({
                    insurance: 'Insurance', road_tax: 'Road Tax', fitness: 'Fitness',
                    puc: 'PUC', national_permit: 'Nat.Permit', state_permit: 'St.Permit', load_test: 'Load Test',
                  }[d.doc_type] || d.doc_type)
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-2 py-1 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <span className="font-semibold text-gray-800 text-xs">{d.slno}</span>
                        <span className="text-gray-400 text-xs ml-1">· {docLabel}</span>
                        {d.reg_no && <span className="text-gray-400 text-xs ml-1 hidden sm:inline">· {d.reg_no}</span>}
                      </div>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${statusColors[status] || 'text-gray-500'}`}>
                        {daysText}
                      </span>
                    </div>
                  )
                })}
                {compUpcoming.length > 8 && (
                  <button onClick={() => navigate('/compliance')} className="text-xs text-blue-500 hover:underline w-full text-center pt-1">
                    +{compUpcoming.length - 8} more — view all
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 border-t md:border-t-0 md:border-l border-gray-100 flex items-center justify-center p-4">
            <div style={{ width: 200, height: 200 }}>
              <PieChart
                slices={COMP_STATUS.map(s => ({ label: s.label, value: compSummary[s.key] || 0, color: s.color }))}
                total={['expired','critical','warning','valid'].reduce((a, k) => a + (compSummary[k] || 0), 0)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ASSET AVAILABILITY */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <span className="text-base font-extrabold tracking-widest text-blue-600 uppercase flex items-center gap-2">
              <Activity size={16} />Asset Availability
            </span>
            <span className="text-xs text-gray-400">{reportDateFmt}</span>
          </div>
          <div className="flex flex-col sm:flex-row">
            <div className="p-4 flex-shrink-0">
              {loading ? (
                <div className="py-10 px-8 text-center text-sm text-gray-400">Loading…</div>
              ) : (
                <table className="border-collapse text-sm" style={{ minWidth: 220 }}>
                  <thead>
                    <tr>
                      <th className="border border-gray-300 bg-gray-100 py-2 px-3 text-left font-bold text-gray-700 text-xs">Status</th>
                      <th className="border border-gray-300 bg-gray-100 py-2 px-3 text-center font-bold text-gray-700 text-xs">Asset Count</th>
                      <th className="border border-gray-300 bg-gray-100 py-2 px-3 text-center font-bold text-gray-700 text-xs">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STATUSES.map(s => {
                      const cnt = statusCounts[s.key] || 0
                      const pct = pieTotal > 0 ? ((cnt / pieTotal) * 100).toFixed(1) : '0.0'
                      return (
                        <tr key={s.key} className="hover:bg-blue-50/30 transition-colors">
                          <td className="border border-gray-300 py-2 px-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="font-semibold text-xs text-gray-800">{s.label}</span>
                            </div>
                          </td>
                          <td className="border border-gray-300 py-2 px-3 text-center">
                            <button
                              onClick={() => cnt > 0 && openDrill({ label: `${s.label} Assets`, color: s.color, fleet_status: s.key })}
                              className={`font-bold tabular-nums text-sm ${cnt > 0 ? 'text-blue-600 hover:underline cursor-pointer' : 'text-gray-400 cursor-default'}`}
                            >
                              {cnt}
                            </button>
                          </td>
                          <td className="border border-gray-300 py-2 px-3 text-center text-xs text-gray-500 tabular-nums">{pct}%</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-gray-50">
                      <td className="border border-gray-300 py-2 px-3 font-bold text-xs text-gray-700">Total</td>
                      <td className="border border-gray-300 py-2 px-3 text-center font-bold text-sm text-gray-800 tabular-nums">{pieTotal}</td>
                      <td className="border border-gray-300 py-2 px-3 text-center font-bold text-xs text-gray-700">100%</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex-1 border-t sm:border-t-0 sm:border-l border-gray-100 flex items-center justify-center" style={{ minHeight: 200 }}>
              <div className="w-full" style={{ height: 240 }}>
                {!loading
                  ? <PieChart slices={pieSlices} total={pieTotal} />
                  : <div className="w-full h-full flex items-center justify-center text-sm text-gray-300">Loading…</div>
                }
              </div>
            </div>
          </div>
        </div>

      {/* COUNTER LOG AGEING */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <span className="text-base font-extrabold tracking-widest text-teal-500 uppercase flex items-center gap-2">
              <Clock size={16} />Counter Log Ageing
            </span>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Dropdown value={ageingProject} onChange={v => { setAgeingProject(v); setAgeingDrilldown(null) }}>
                  <option value="">All Sites</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.code}>{p.code} — {p.name}</option>
                  ))}
                </Dropdown>
              )}
              <ActionMenu
                onRefresh={() => setTick(t => t + 1)}
                onUnpin={() => navigate('/dashboard')}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch">
            {/* Left — ageing table */}
            <div className="p-5 flex-shrink-0 flex flex-col justify-between" style={{ minWidth: 280 }}>
              {ageingLoading ? (
                <div className="py-10 px-12 text-center text-sm text-gray-400">Loading…</div>
              ) : (ageingData.buckets || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Clock size={32} className="text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400 font-medium">No ageing data</p>
                  <p className="text-xs text-gray-300 mt-0.5">No active assets found for this site</p>
                </div>
              ) : (
                <>
                  <table className="border-collapse w-full">
                    <thead>
                      <tr>
                        <th className="border border-gray-200 bg-gray-50 py-2.5 px-5 text-left font-bold text-gray-600 text-xs">
                          Ageing in Days
                        </th>
                        <th className="border border-gray-200 bg-gray-50 py-2.5 px-5 text-center font-bold text-gray-600 text-xs">
                          Asset Count
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ageingData.buckets || []).map(b => (
                        <tr key={b.key} className="hover:bg-gray-50/60 transition-colors">
                          <td className="border border-gray-200 py-3 px-5">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                              <span className="font-semibold text-sm" style={{ color: b.color }}>{b.label}</span>
                            </div>
                          </td>
                          <td className="border border-gray-200 py-3 px-5 text-center">
                            <button
                              onClick={() => b.count > 0 && setAgeingDrilldown(b)}
                              className={`font-bold tabular-nums text-xl leading-none ${b.count > 0 ? 'hover:underline cursor-pointer' : 'text-gray-300 cursor-default'}`}
                              style={b.count > 0 ? { color: b.color } : undefined}
                            >
                              {b.count.toLocaleString()}
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50">
                        <td className="border border-gray-200 py-2.5 px-5 font-bold text-xs text-gray-700">Total</td>
                        <td className="border border-gray-200 py-2.5 px-5 text-center font-bold text-sm text-gray-800 tabular-nums">
                          {(ageingData.total || 0).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-3 space-y-0.5">
                    <p className="text-[10px] text-gray-400">
                      Report as of {reportDateFmt} · {reportTime}
                    </p>
                    <p className="text-[10px] text-gray-300">
                      Excludes assets with status "Not Deployed"
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Right — pie chart */}
            <div className="flex-1 border-t sm:border-t-0 sm:border-l border-gray-100 flex items-center justify-center" style={{ minHeight: 240 }}>
              <div className="w-full" style={{ height: 280 }}>
                {ageingLoading ? (
                  <div className="w-full h-full flex items-center justify-center text-sm text-gray-300">Loading…</div>
                ) : (
                  <PieChart
                    slices={(ageingData.buckets || []).map(b => ({ label: b.label, value: b.count, color: b.color }))}
                    total={ageingData.total || 0}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

      {/* UTILIZATION SUMMARY */}
      {summaryRows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <span className="text-base font-extrabold tracking-widest text-green-600 uppercase flex items-center gap-2">
              <TrendingUp size={16} />Utilization Summary
            </span>
            <span className="text-xs text-gray-400">{reportDateFmt} · Click a project to view assets</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Project', 'Total Assets', 'Own', 'Hire', 'Reported', 'Avg Utilization', 'DPR %'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summaryRows.map(r => {
                  const util  = parseFloat(r.avg_utilization || 0).toFixed(1)
                  const total = parseInt(r.total_machines || 0)
                  const rep   = parseInt(r.reported_machines || 0)
                  const dpr   = total > 0 ? Math.round((rep / total) * 100) : 0
                  const utilColor = parseFloat(util) >= 70 ? '#16a34a' : parseFloat(util) >= 40 ? '#d97706' : '#2563eb'
                  const dprColor2 = dpr >= 80 ? '#16a34a' : dpr >= 50 ? '#d97706' : '#dc2626'
                  return (
                    <tr key={r.project_code} className="hover:bg-green-50/20 transition-colors cursor-pointer"
                      onClick={() => setUtilDrilldown({ project_code: r.project_code, project_name: r.project_name })}>
                      <td className="px-4 py-2.5">
                        <span className="font-bold text-green-700 hover:underline">{r.project_code}</span>
                        {r.project_name && <span className="ml-1.5 text-gray-400 text-[10px]">{r.project_name}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold text-blue-600 tabular-nums hover:underline">{total}</td>
                      <td className="px-4 py-2.5 text-center text-gray-600 tabular-nums">{r.own_machines || 0}</td>
                      <td className="px-4 py-2.5 text-center text-gray-600 tabular-nums">{r.hire_machines || 0}</td>
                      <td className="px-4 py-2.5 text-center text-gray-600 tabular-nums">{rep} / {total}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5" style={{ minWidth: 60 }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(parseFloat(util), 100)}%`, backgroundColor: utilColor }} />
                          </div>
                          <span className="font-bold tabular-nums text-xs" style={{ color: utilColor }}>{util}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5" style={{ minWidth: 60 }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${dpr}%`, backgroundColor: dprColor2 }} />
                          </div>
                          <span className="font-bold tabular-nums text-xs" style={{ color: dprColor2 }}>{dpr}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drill-down drawer */}
      {drilldown && (
        <FleetDrilldownPanel
          drilldown={drilldown}
          date={range.to}
          projectCode={projectCode}
          onClose={() => setDrilldown(null)}
        />
      )}

      {/* Ageing drill-down drawer */}
      {ageingDrilldown && (
        <AgeingDrilldownPanel
          bucket={ageingDrilldown}
          onClose={() => setAgeingDrilldown(null)}
        />
      )}

      {/* Utilization drill-down drawer */}
      {utilDrilldown && (
        <UtilizationDrilldownPanel
          projectCode={utilDrilldown.project_code}
          projectName={utilDrilldown.project_name}
          date={range.to}
          onClose={() => setUtilDrilldown(null)}
        />
      )}

    </div>
  )
}
