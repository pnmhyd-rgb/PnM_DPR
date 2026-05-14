import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProjects, getFleetSummary, getSummary, getComplianceSummary, getComplianceUpcoming } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { today } from '../lib/utils'
import { ChevronDown, RefreshCw, PinOff, ShieldAlert, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'

/* ─── Status config ───────────────────────────────────────────── */
const STATUSES = [
  { key: 'Active',       label: 'Active',       color: '#27AE60' },
  { key: 'Idle',         label: 'Idle',         color: '#F5A623' },
  { key: 'Breakdown',    label: 'Breakdown',    color: '#E74C3C' },
  { key: 'Not Deployed', label: 'Not Deployed', color: '#95A5A6' },
]
const COL_A = 'Measurable Asset'
const COL_B = 'Non-Measurable Asset'

/* ─── Stat card (matches screenshot style) ───────────────────── */
function StatCard({ label, value, sub, borderColor, valueColor }) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-0.5 min-w-0"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase truncate">
        {label}
      </p>
      <p
        className="text-[28px] font-extrabold tabular-nums leading-tight"
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

/* ─── Main Page ───────────────────────────────────────────────── */
export default function MyDashboard() {
  const navigate       = useNavigate()
  const { user, isAdmin } = useAuth()

  const [projects, setProjects]       = useState([])
  const [rows, setRows]               = useState([])
  const [summaryRows, setSummaryRows] = useState([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [reportDate, setReportDate]   = useState(today())
  const [tick, setTick]               = useState(0)
  const [filters, setFilters]         = useState({ date: today(), project_code: '', asset_type: '' })

  // Compliance widget state
  const [compSummary,  setCompSummary]  = useState({ expired:0, critical:0, warning:0, valid:0, na:0, total:0 })
  const [compUpcoming, setCompUpcoming] = useState([])

  useEffect(() => {
    if (isAdmin) getProjects().then(r => setProjects(r.data?.data || [])).catch(() => {})
  }, [isAdmin])

  // Fetch compliance summary once on mount
  useEffect(() => {
    getComplianceSummary().then(r => setCompSummary(r.data?.data || {})).catch(() => {})
    getComplianceUpcoming(30).then(r => setCompUpcoming(r.data?.data || [])).catch(() => {})
  }, [])

  const fetchData = useCallback(() => {
    setLoading(true); setError('')
    const fleetParams = { date: filters.date }
    if (filters.project_code) fleetParams.project_code = filters.project_code

    Promise.all([
      getFleetSummary(fleetParams),
      getSummary({ date: filters.date }),
    ])
      .then(([fleetRes, sumRes]) => {
        setRows(fleetRes.data?.data || [])
        setReportDate(fleetRes.data?.date || filters.date)
        setSummaryRows(sumRes.data?.data || [])
      })
      .catch(e => {
        setError(e.response?.data?.error || 'Failed to load dashboard data')
        setRows([])
      })
      .finally(() => setLoading(false))
  }, [filters, tick])

  useEffect(() => { fetchData() }, [fetchData])

  /* ── Aggregate summary stat cards ─────────────────────────── */
  /* Admin can filter by site; non-admin backend already scoped their data */
  const filteredSummary = (isAdmin && filters.project_code)
    ? summaryRows.filter(r => r.project_code === filters.project_code)
    : summaryRows

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

  /* Colour thresholds */
  const dprColor  = dprPct  >= 80 ? '#27AE60' : dprPct  >= 50 ? '#F5A623' : '#E74C3C'
  const utilColor = parseFloat(avgUtil) >= 70 ? '#27AE60'
                  : parseFloat(avgUtil) >= 40 ? '#F5A623' : '#2980B9'

  /* ── Machine status counts (from fleet-summary) ─────────────── */
  const statusCounts = { Active: 0, Idle: 0, Breakdown: 0, 'Not Deployed': 0 }
  rows.forEach(r => {
    if (r.status in statusCounts) statusCounts[r.status] += Number(r.count) || 0
  })

  /* ── Scope label for stat card subtitles ────────────────────── */
  const scopeLabel = isAdmin
    ? filters.project_code || 'All projects'
    : user?.project_codes?.length === 1
      ? user.project_codes[0]
      : `${user?.project_codes?.length || 0} projects`

  /* ── Pivot for existing table ────────────────────────────────── */
  const pivot = Object.fromEntries(STATUSES.map(s => [s.key, { [COL_A]: 0, [COL_B]: 0 }]))
  rows.forEach(r => {
    if (!pivot[r.status]) return
    if (r.asset_type === COL_A)      pivot[r.status][COL_A] += Number(r.count) || 0
    else if (r.asset_type === COL_B) pivot[r.status][COL_B] += Number(r.count) || 0
  })

  const measTotal    = STATUSES.reduce((a, s) => a + pivot[s.key][COL_A], 0)
  const nonMeasTotal = STATUSES.reduce((a, s) => a + pivot[s.key][COL_B], 0)

  const pieSlices = STATUSES.map(s => {
    let val = 0
    if (!filters.asset_type || filters.asset_type === COL_A) val += pivot[s.key][COL_A]
    if (!filters.asset_type || filters.asset_type === COL_B) val += pivot[s.key][COL_B]
    return { label: s.label, value: val, color: s.color }
  })
  const pieTotal = pieSlices.reduce((a, s) => a + s.value, 0)

  const reportDateFmt = (() => {
    if (!reportDate) return '—'
    const [y, m, d] = reportDate.split('-')
    return `${d}-${m}-${y}`
  })()
  const reportTime = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).toUpperCase()

  const dash = loading ? '—' : undefined

  return (
    <div className="space-y-3">

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── Date picker (common control for both card rows) ───── */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          Data as of&nbsp;
          <span className="font-semibold text-gray-600">{reportDateFmt}</span>
          &nbsp;·&nbsp;{reportTime}
          {!isAdmin && scopeLabel !== 'All projects' && (
            <span className="ml-2 bg-blue-50 text-blue-600 border border-blue-200
              rounded px-2 py-0.5 font-semibold text-[11px]">
              {scopeLabel}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Dropdown
              value={filters.project_code}
              onChange={v => setFilters(f => ({ ...f, project_code: v }))}
            >
              <option value="">All Sites</option>
              {projects.map(p => (
                <option key={p.id} value={p.code}>{p.code} — {p.name}</option>
              ))}
            </Dropdown>
          )}
          <input
            type="date"
            value={filters.date}
            onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
            className="border border-gray-300 rounded px-2.5 py-1.5 text-sm text-gray-700
              focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-400 bg-white"
          />
          <button
            onClick={() => setTick(t => t + 1)}
            className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded
              text-gray-500 hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── ROW 1 · Fleet composition ─────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Total Own"
          value={dash ?? totals.own.toLocaleString()}
          sub={scopeLabel}
          borderColor="#E67E22"
          valueColor="#E67E22"
        />
        <StatCard
          label="Total Hire"
          value={dash ?? totals.hire.toLocaleString()}
          sub={scopeLabel}
          borderColor="#8E44AD"
          valueColor="#8E44AD"
        />
        <StatCard
          label="Total Fleet"
          value={dash ?? totals.total.toLocaleString()}
          sub="Own + Hire combined"
          borderColor="#2980B9"
          valueColor="#2980B9"
        />
        <StatCard
          label="DPR Updated"
          value={dash ?? `${totals.reported} / ${totals.total}`}
          sub={loading ? '' : `${dprPct}% machines reported today`}
          borderColor={dprColor}
          valueColor={dprColor}
        />
        <StatCard
          label="Avg Utilization"
          value={dash ?? `${avgUtil}%`}
          sub="Average today"
          borderColor={utilColor}
          valueColor={utilColor}
        />
      </div>

      {/* ── ROW 2 · Machine status ────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Active"
          value={dash ?? statusCounts['Active'].toLocaleString()}
          sub="Working today"
          borderColor="#27AE60"
          valueColor="#27AE60"
        />
        <StatCard
          label="Idle"
          value={dash ?? statusCounts['Idle'].toLocaleString()}
          sub="On site, not working"
          borderColor="#F5A623"
          valueColor="#D68910"
        />
        <StatCard
          label="Breakdown"
          value={dash ?? statusCounts['Breakdown'].toLocaleString()}
          sub="Under repair"
          borderColor="#E74C3C"
          valueColor="#E74C3C"
        />
        <StatCard
          label="Not Deployed"
          value={dash ?? statusCounts['Not Deployed'].toLocaleString()}
          sub="Not on site"
          borderColor="#95A5A6"
          valueColor="#7F8C8D"
        />
      </div>

      {/* ── COMPLIANCE summary widget ─────────────────────────── */}
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
          {/* Status counts */}
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

          {/* Upcoming expiries list */}
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

          {/* Mini pie chart */}
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

      {/* ── ASSETS detail card (status table + pie) ──────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">

        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="text-base font-extrabold tracking-widest text-teal-500 uppercase">
            Asset Breakdown
          </span>
          <div className="flex items-center gap-2">
            <Dropdown
              value={filters.asset_type}
              onChange={v => setFilters(f => ({ ...f, asset_type: v }))}
            >
              <option value="">All Asset Types</option>
              <option value={COL_A}>Measurable</option>
              <option value={COL_B}>Non-Measurable</option>
            </Dropdown>
            <ActionMenu
              onRefresh={() => setTick(t => t + 1)}
              onUnpin={() => navigate('/dashboard')}
            />
          </div>
        </div>

        {/* Card body: table + pie */}
        <div className="flex flex-col md:flex-row">

          {/* Status table */}
          <div className="p-4 flex-shrink-0">
            {loading ? (
              <div className="py-14 px-10 text-center text-sm text-gray-400">Loading…</div>
            ) : (
              <>
                <table className="border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: '155px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '90px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="border border-gray-300 bg-gray-100 py-2 px-3" />
                      <th className="border border-gray-300 bg-gray-100 py-2 px-2
                          text-center font-bold text-gray-700 text-xs">
                        Measurable
                      </th>
                      <th className="border border-gray-300 bg-gray-100 py-2 px-2
                          text-center font-bold text-gray-700 text-xs leading-snug">
                        Non<br />Measurable
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {STATUSES.map(s => (
                      <tr key={s.key} className="hover:bg-blue-50/30 transition-colors">
                        <td className="border border-gray-300 py-2 pl-3 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: s.color }} />
                            <span className="font-medium text-gray-800 text-xs">{s.label}</span>
                          </div>
                        </td>
                        <td className="border border-gray-300 py-2 text-center font-semibold
                            text-blue-600 tabular-nums text-xs">
                          {pivot[s.key][COL_A].toLocaleString()}
                        </td>
                        <td className="border border-gray-300 py-2 text-center font-semibold
                            text-blue-600 tabular-nums text-xs">
                          {pivot[s.key][COL_B].toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50">
                      <td className="border border-gray-300 py-2 text-center font-bold
                          text-gray-800 text-xs">Total</td>
                      <td className="border border-gray-300 py-2 text-center font-bold
                          text-blue-700 tabular-nums text-sm">
                        {measTotal.toLocaleString()}
                      </td>
                      <td className="border border-gray-300 py-2 text-center font-bold
                          text-blue-700 tabular-nums text-sm">
                        {nonMeasTotal.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-gray-400 mt-3">
                  Report as of {reportDateFmt} &nbsp;{reportTime}
                </p>
              </>
            )}
          </div>

          {/* Pie chart */}
          <div className="flex-1 border-t md:border-t-0 md:border-l border-gray-100
              flex items-center justify-center">
            <div className="w-full" style={{ height: '290px' }}>
              {!loading
                ? <PieChart slices={pieSlices} total={pieTotal} />
                : (
                  <div className="w-full h-full flex items-center justify-center">
                    <p className="text-sm text-gray-300">Loading…</p>
                  </div>
                )
              }
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}
