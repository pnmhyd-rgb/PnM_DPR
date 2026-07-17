import { useState, useEffect, useRef } from 'react'
import { X, Download, Loader2, FileSpreadsheet, FileText, Search, ChevronDown } from 'lucide-react'
import { getProjects, getMachines, getEntries, getFuelRecord, getMeterResets } from '../lib/api'

function SearchableSelect({ options, value, onChange, placeholder, disabled }) {
  const [query,  setQuery]  = useState('')
  const [open,   setOpen]   = useState(false)
  const ref = useRef()

  const selected = options.find(o => String(o.value) === String(value))

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o =>
    !query || o.label.toLowerCase().includes(query.toLowerCase())
  )

  const select = (val) => {
    onChange(val)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center border rounded-lg px-3 py-2 text-sm bg-white transition-colors ${
          disabled ? 'bg-gray-50 cursor-not-allowed border-gray-200' : 'border-gray-300 cursor-pointer hover:border-blue-400'
        } ${open ? 'border-blue-500 ring-2 ring-blue-500/20' : ''}`}
        onClick={() => { if (!disabled) setOpen(v => !v) }}
      >
        <Search size={13} className="text-gray-400 flex-shrink-0 mr-2" />
        {open ? (
          <input
            autoFocus
            value={query}
            onChange={e => { e.stopPropagation(); setQuery(e.target.value) }}
            onClick={e => e.stopPropagation()}
            placeholder="Type to search…"
            className="flex-1 outline-none bg-transparent text-gray-800 text-sm placeholder-gray-400"
          />
        ) : (
          <span className={`flex-1 truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
            {selected ? selected.label : placeholder}
          </span>
        )}
        <ChevronDown size={13} className={`text-gray-400 flex-shrink-0 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-gray-400 text-center">No results</p>
          ) : (
            filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => select(o.value)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-blue-50 ${
                  String(o.value) === String(value) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800'
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const TOGGLE_COLS = [
  { key: 'hsd',          label: 'HSD Issued (L)',  def: true  },
  { key: 'breakdown',    label: 'Breakdown (Reason)',   def: true  },
  { key: 'status',       label: 'Status',          def: true  },
  { key: 'work_done',    label: 'Work Done',       def: true  },
  { key: 'qty',          label: 'Quantity',        def: true  },
  { key: 'remarks',      label: 'Remarks',         def: false },
  { key: 'submitted_by', label: 'Submitted By',    def: true  },
]

const FIXED_COLS = [
  { key: 'sno',       label: 'S.No'         },
  { key: 'date',      label: 'Date'         },
  { key: 'shift',     label: 'Shift'        },
  { key: 'r1_open',   label: 'Opening'      },
  { key: 'r1_close',  label: 'Closing'      },
  { key: 'r1_total',  label: 'Total Hrs/KMs'},
]

// For multi-reading machines: replace r1 fixed cols with per-reading cols
function getMachineCols(machine, activeCols) {
  const configs = machine.reading_configs || []
  let cols
  if (configs.length === 0) {
    cols = activeCols
  } else {
    const baseCols = [
      { key: 'sno', label: 'S.No' },
      { key: 'date', label: 'Date' },
      { key: 'shift', label: 'Shift' },
    ]
    const readingCols = configs.flatMap(rc => [
      { key: `rl_open_${rc.reading_type_id}`,  label: `${rc.code} Open`,  rtId: rc.reading_type_id, field: 'open_value',  unit: rc.unit },
      { key: `rl_close_${rc.reading_type_id}`, label: `${rc.code} Close`, rtId: rc.reading_type_id, field: 'close_value', unit: rc.unit },
      { key: `rl_total_${rc.reading_type_id}`, label: `${rc.code} Total`, rtId: rc.reading_type_id, field: 'total',       unit: rc.unit },
    ])
    const toggleCols = activeCols.filter(c => !['sno','date','shift','r1_open','r1_close','r1_total'].includes(c.key))
    cols = [...baseCols, ...readingCols, ...toggleCols]
  }
  if (!machine.uom) return cols
  return cols.map(c => c.key === 'qty' ? { ...c, label: `Quantity (${machine.uom})`, uom: machine.uom } : c)
}

function cellValForCol(e, col, idx) {
  if (e._placeholder) {
    if (col.key === 'sno')    return idx + 1
    if (col.key === 'date')   return fmtDate(e.entry_date)
    if (col.key === 'shift')  return e.shift || '—'
    if (col.key === 'status') return 'DPR Not Submitted'
    return ''
  }
  if (col.rtId !== undefined) {
    const log = (e.reading_logs || []).find(l => l.reading_type_id === col.rtId)
    if (!log) return ''
    const v = log[col.field]
    if (col.field === 'total') return v != null ? Number(v).toFixed(2) : ''
    return v ?? ''
  }
  if (col.key === 'qty') {
    const v = e.qty ?? ''
    return v !== '' && col.uom ? `${v} ${col.uom}` : v
  }
  return cellVal(e, col.key, idx)
}

const SECTIONS = [
  { key: 'header',      label: 'Machine Header'       },
  { key: 'log',         label: 'Daily Log Table'       },
  { key: 'days',        label: 'Working Day Summary'  },
  { key: 'utilization', label: 'Utilization Summary'  },
  { key: 'fuel',        label: 'Fuel Summary'         },
]

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
}

function generateDateRange(from, to) {
  const dates = []
  const d = new Date(from)
  const end = new Date(to)
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function fillMissingDates(entries, machine, from, to) {
  const isDual = machine.shift_type === 'Dual Shift'
  const result = []
  for (const date of generateDateRange(from, to)) {
    const dayEntries = entries.filter(e => (e.entry_date || '').slice(0, 10) === date)
    if (dayEntries.length > 0) {
      result.push(...dayEntries)
    } else if (isDual) {
      result.push({ entry_date: date, shift: 'Day Shift', _placeholder: true })
      result.push({ entry_date: date, shift: 'Night Shift', _placeholder: true })
    } else {
      result.push({ entry_date: date, shift: '—', _placeholder: true })
    }
  }
  return result
}

function getStatus(e) {
  const wh = parseFloat(e.working_hours) || 0
  const bd = parseFloat(e.breakdown) || 0
  if (wh > 0 && bd > 0) return 'Working + Breakdown'
  if (wh > 0) return 'Working'
  if (bd > 0) return e.remarks ? `Breakdown — ${e.remarks}` : 'Breakdown'
  return e.remarks ? `Idle — ${e.remarks}` : 'Idle'
}

function cellVal(e, key, idx) {
  if (e._placeholder) {
    if (key === 'sno')    return idx + 1
    if (key === 'date')   return fmtDate(e.entry_date)
    if (key === 'shift')  return e.shift || '—'
    if (key === 'status') return 'DPR Not Submitted'
    return ''
  }
  switch (key) {
    case 'sno':          return idx + 1
    case 'date':         return fmtDate(e.entry_date)
    case 'shift':        return e.shift || ''
    case 'r1_open':      return e.r1_open ?? ''
    case 'r1_close':     return e.r1_close ?? ''
    case 'r1_total':     { const v = parseFloat(e.r1_total); return isNaN(v) ? '' : v.toFixed(2) }
    case 'hsd':          { const v = parseFloat(e.hsd); return isNaN(v) ? '' : v.toFixed(2) }
    case 'breakdown': {
      const bkVal = parseFloat(e.breakdown) || 0
      if (bkVal <= 0) return ''
      const bkH = Math.floor(bkVal)
      const bkM = Math.round((bkVal - bkH) * 60)
      const bkStr = bkM > 0 ? `${bkH}h ${String(bkM).padStart(2, '0')}m` : `${bkH}h`
      return e.remarks?.trim() ? `${bkStr} (${e.remarks.trim()})` : bkStr
    }
    case 'status':       return getStatus(e)
    case 'work_done':    return e.work_done || ''
    case 'qty':          return e.qty ?? ''
    case 'remarks':      return e.remarks || ''
    case 'submitted_by': return e.submitted_by_name || ''
    default:             return ''
  }
}

function calcSummary(entries) {
  const plannedTotal = entries.reduce((s, e) => s + (parseFloat(e.planned_hours) || 0), 0)
  const workedTotal  = entries.reduce((s, e) => s + (parseFloat(e.working_hours) || 0), 0)
  const hsdTotal     = entries.reduce((s, e) => s + (parseFloat(e.hsd) || 0), 0)
  const totalR1      = entries.reduce((s, e) => s + (parseFloat(e.r1_total)      || 0), 0)
  const utilPct      = plannedTotal > 0 ? ((workedTotal / plannedTotal) * 100).toFixed(1) : '—'
  return { plannedTotal, workedTotal, hsdTotal, totalR1, utilPct }
}

function calcDaysSummary(entries, machine, from, to) {
  const isDual      = machine.shift_type === 'Dual Shift'
  const totalDays   = generateDateRange(from, to).length
  const brkDivisor  = isDual ? 24 : 12

  const idleEntries    = entries.filter(e => e.is_idle)
  const nonIdleEntries = entries.filter(e => !e.is_idle)

  let idleDays   = 0
  let daysWorked = 0

  if (isDual) {
    // Each shift = 0.5 day
    idleDays = idleEntries.length * 0.5

    const dateMap = {}
    for (const e of nonIdleEntries) {
      const d = (e.entry_date || '').slice(0, 10)
      if (!dateMap[d]) dateMap[d] = new Set()
      dateMap[d].add(e.shift)
    }
    for (const shifts of Object.values(dateMap)) {
      daysWorked += (shifts.has('Day Shift') ? 0.5 : 0) + (shifts.has('Night Shift') ? 0.5 : 0)
    }
  } else {
    idleDays   = idleEntries.length
    daysWorked = new Set(nonIdleEntries.map(e => (e.entry_date || '').slice(0, 10))).size
  }

  const totalBrkHrs = entries.reduce((s, e) => s + (parseFloat(e.breakdown) || 0), 0)
  const brkDays     = totalBrkHrs / brkDivisor
  const netWorkDays = Math.max(0, daysWorked - brkDays)
  const payableDays = idleDays + netWorkDays
  const utilPct     = totalDays > 0 ? ((netWorkDays / totalDays) * 100).toFixed(1) : '0.0'
  const daysWorkedFmt = Number.isInteger(daysWorked) ? String(daysWorked) : daysWorked.toFixed(2)

  return { totalDays, daysWorked, daysWorkedFmt, idleDays, totalBrkHrs, brkDays, netWorkDays, payableDays, utilPct }
}

async function buildExcel(machines, entriesMap, from, to, activeCols, sections, projName, fuelRecordsMap = {}, meterResetsMap = {}, dieselRate = 0) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()

  for (const m of machines) {
    const entries     = entriesMap[m.id] || []
    const allRows     = fillMissingDates(entries, m, from, to)
    const sheetName   = (m.slno || `M${m.id}`).slice(0, 31).replace(/[:\\/?*[\]]/g, '_')
    const machineCols = getMachineCols(m, activeCols)
    const wsData      = []
    const placeholderRowIndices = []

    if (sections.header) {
      const ownerLabel = m.ownership === 'Own' ? 'Own Asset (RVR Projects)' : (m.vendor || '—')
      wsData.push([`Daily Progress Report — RVR Projects Pvt Ltd`])
      // Equipment row
      wsData.push([`Sl#`, m.slno || '—', `Nickname`, m.nickname || '—', `Asset Code`, m.asset_code || '—', `Type`, m.eq_type || '—', `Reg No`, m.reg_no || '—'])
      // Ownership / period row
      wsData.push([`Ownership`, m.ownership || '—', `Owner/Vendor`, ownerLabel, `Project`, projName, `Shift`, m.shift_type || '—', `Period`, `${fmtDate(from)} – ${fmtDate(to)}`])
      wsData.push([])
    }

    const logStartRow = wsData.length

    if (sections.log) {
      wsData.push(machineCols.map(c => c.label))
      allRows.forEach((e, i) => {
        if (e._placeholder) placeholderRowIndices.push(logStartRow + 1 + i)
        wsData.push(machineCols.map(c => cellValForCol(e, c, i)))
      })
      // Total row (only actual entries)
      const totRow = machineCols.map(c => {
        if (c.key === 'sno')       return 'Total'
        if (c.key === 'r1_total')  return entries.reduce((s, e) => s + (parseFloat(e.r1_total) || 0), 0).toFixed(2)
        if (c.key === 'hsd')       return entries.reduce((s, e) => s + (parseFloat(e.hsd) || 0), 0).toFixed(2)
        if (c.key === 'breakdown') return entries.reduce((s, e) => s + (parseFloat(e.breakdown) || 0), 0).toFixed(2)
        if (c.key === 'qty')       return entries.reduce((s, e) => s + (parseFloat(e.qty) || 0), 0).toFixed(2)
        if (c.rtId !== undefined && c.field === 'total') {
          return entries.reduce((s, e) => {
            const log = (e.reading_logs || []).find(l => l.reading_type_id === c.rtId)
            return s + (parseFloat(log?.total) || 0)
          }, 0).toFixed(2)
        }
        return ''
      })
      wsData.push(totRow)
      wsData.push([])
    }

    if (sections.days || sections.utilization || sections.fuel) {
      const d              = calcDaysSummary(entries, m, from, to)
      const s              = calcSummary(entries)
      const isTransitMixer = m.eq_type === 'Transit Mixer'
      const formulaType    = m.fuel_formula_type || (isTransitMixer ? 'transit_mixer' : 'L_per_Hr')
      const isBothFormula  = formulaType === 'both' || formulaType === 'transit_mixer'
      const isKmBasis      = formulaType === 'KM_per_L' || (!isBothFormula && /km/i.test(m.reading1_basis || ''))
      const rangeUnit      = isKmBasis ? 'km/ltr' : 'ltr/hr'
      const approvedRange  = (m.fuel_min && m.fuel_max)
        ? `${m.fuel_min} – ${m.fuel_max} ${rangeUnit}`
        : m.fuel_min ? `≥ ${m.fuel_min} ${rangeUnit}` : '—'
      const fr  = fuelRecordsMap[m.id] || null
      const ob  = fr ? parseFloat(fr.opening_balance) : null
      const cb  = fr ? parseFloat(fr.closing_balance) : null
      // Consumed = Opening + Total Issued (DPR) - Closing
      const consumed  = ob !== null && cb !== null ? ob + s.hsdTotal - cb : null
      const actualAvg = consumed != null && consumed > 0
        ? isKmBasis
          ? `${(s.totalR1 / consumed).toFixed(2)} km/ltr`
          : `${(consumed / s.workedTotal).toFixed(2)} ltr/hr`
        : '—'
      // Both-formula: dual averages — detect reading type IDs from actual entry logs
      const hrsRtId = (() => { for (const e of entries) { const l = (e.reading_logs || []).find(l => l.unit === 'Hrs'); if (l) return l.reading_type_id } return null })()
      const kmRtId  = (() => { for (const e of entries) { const l = (e.reading_logs || []).find(l => l.unit !== 'Hrs' && l.unit != null); if (l) return l.reading_type_id } return null })()
      const tmDrumHrs = isBothFormula && hrsRtId !== null ? entries.reduce((acc, e) => { const l = (e.reading_logs || []).find(rl => rl.reading_type_id === hrsRtId); return acc + (parseFloat(l?.total) || 0) }, 0) : 0
      const tmKm      = isBothFormula && kmRtId  !== null ? entries.reduce((acc, e) => { const l = (e.reading_logs || []).find(rl => rl.reading_type_id === kmRtId);  return acc + (parseFloat(l?.total) || 0) }, 0) : 0
      const tmSplitMode   = m.tm_split_mode  || null
      const tmSplitVal    = parseFloat(m.tm_split_value) || 0
      // Fallback for legacy/single-reading machines (no reading_logs): derive from r1/r2 columns
      const r1Basis = (m.reading1_basis || '').toLowerCase()
      const r2Basis = (m.reading2_basis || '').toLowerCase()
      const totalR2leg = isBothFormula && (tmDrumHrs === 0 || tmKm === 0)
        ? entries.reduce((s, e) => s + (parseFloat(e.r2_total) || 0), 0) : 0
      const legacyHrs = r1Basis.includes('hr') ? s.totalR1 : r2Basis.includes('hr') ? totalR2leg : 0
      const legacyKm  = r1Basis.includes('km') ? s.totalR1 : r2Basis.includes('km') ? totalR2leg : 0
      const effectiveHrs    = tmDrumHrs > 0 ? tmDrumHrs : legacyHrs
      const effectiveKm     = tmKm > 0 ? tmKm : legacyKm
      const effectiveDiesel = consumed !== null ? consumed : s.hsdTotal
      let tmAvgLtrPerHr = null, tmAvgKmPerLtr = null
      if (isBothFormula && effectiveDiesel > 0) {
        if (tmSplitMode === 'drum_rate' && tmSplitVal > 0 && tmDrumHrs > 0) {
          const drumDiesel    = tmDrumHrs * tmSplitVal
          const vehicleDiesel = effectiveDiesel - drumDiesel
          tmAvgLtrPerHr = tmSplitVal.toFixed(3)
          if (vehicleDiesel > 0 && tmKm > 0) tmAvgKmPerLtr = (tmKm / vehicleDiesel).toFixed(2)
        } else if (tmSplitMode === 'vehicle_rate' && tmSplitVal > 0 && tmKm > 0) {
          const vehicleDiesel = tmKm / tmSplitVal
          const drumDiesel    = effectiveDiesel - vehicleDiesel
          tmAvgKmPerLtr = tmSplitVal.toFixed(2)
          if (drumDiesel > 0 && tmDrumHrs > 0) tmAvgLtrPerHr = (drumDiesel / tmDrumHrs).toFixed(2)
        } else {
          if (effectiveHrs > 0) tmAvgLtrPerHr = (effectiveDiesel / effectiveHrs).toFixed(2)
          if (effectiveKm > 0)  tmAvgKmPerLtr = (effectiveKm / effectiveDiesel).toFixed(2)
        }
      }

      // Utilization: planned_hours is per-day; monthly = per-day × calDays; actual = per-day × payableDays
      const plannedPerDay  = parseFloat(m.planned_hours) || 0
      const monthlyPlanned = plannedPerDay * d.totalDays
      const actualPlanned  = plannedPerDay * d.payableDays
      const workedVal      = isKmBasis ? s.totalR1 : s.workedTotal
      const utilPctActual  = actualPlanned > 0 ? ((workedVal / actualPlanned) * 100).toFixed(2) : '—'
      const unitLabel      = isKmBasis ? 'KMs' : 'Hrs'
      // Additional reading totals from reading_configs (multi-reading machines)
      const rcConfigs = m.reading_configs || []
      const perReadingTotals = rcConfigs
        .map(rc => ({
          name:  rc.reading_name || rc.code,
          unit:  rc.unit || '',
          total: entries.reduce((s, e) => {
            const log = (e.reading_logs || []).find(l => l.reading_type_id === rc.reading_type_id)
            return s + (parseFloat(log?.total) || 0)
          }, 0)
        }))
        .filter(r => r.total > 0)
      if (rcConfigs.length === 0 && m.dual_reading && m.reading2_basis) {
        const r2Total = entries.reduce((s, e) => s + (parseFloat(e.r2_total) || 0), 0)
        if (r2Total > 0) perReadingTotals.push({ name: m.reading2_basis, unit: '', total: r2Total })
      }

      // Left column: Working Day Summary
      const leftRows = sections.days ? [
        ['WORKING DAY SUMMARY',          ''],
        ['Report Range days',            `${d.totalDays} Days`],
        ['No of Breakdown days',         `${d.brkDays.toFixed(2)} Days`],
        ['No of Idle days',              `${d.idleDays.toFixed(2)} Days`],
        ['No of Effective Working days', `${d.netWorkDays.toFixed(2)} Days`],
        ['No of Payable days',           `${d.payableDays.toFixed(2)} Days`],
      ] : []

      // Shared cost calculation (used in fuel summary + productivity costing)
      const storedCost = entries.reduce((sum, e) => {
        if (parseFloat(e.diesel_cost) > 0) return sum + parseFloat(e.diesel_cost)
        const h = parseFloat(e.hsd) || 0
        const r = parseFloat(e.diesel_rate) || 0
        return h > 0 && r > 0 ? sum + h * r : sum
      }, 0)
      const dieselQty  = consumed !== null ? consumed : s.hsdTotal
      const dieselCost = storedCost > 0 ? storedCost : (dieselRate > 0 ? dieselQty * dieselRate : null)

      // Productivity costing calculations
      const totalQty      = entries.reduce((sum, e) => sum + (parseFloat(e.qty) || 0), 0)
      const qtyUnit       = m.uom || ''
      const fuelExpenses  = storedCost
      const hireCharges   = m.ownership === 'Hire'
        ? (parseFloat(m.rate_monthly) > 0 ? parseFloat(m.rate_monthly) : parseFloat(m.rate) > 0 ? parseFloat(m.rate) * d.payableDays : 0)
        : 0
      const ctcTotal      = fuelExpenses + hireCharges
      const dieselConsumed = consumed !== null ? consumed : s.hsdTotal
      const costPerUnit   = ctcTotal > 0 && totalQty > 0 ? ctcTotal / totalQty : null
      const fuelPerProd   = dieselConsumed > 0 && totalQty > 0 ? dieselConsumed / totalQty : null
      const unitSuffix    = qtyUnit ? ` ${qtyUnit}` : ''

      // Right column: Utilization then Fuel
      const rightRows = []
      if (sections.utilization) {
        rightRows.push([`Utilization (${unitLabel})`,                       ''])
        rightRows.push([`Planned ${unitLabel} (Monthly)`,                   monthlyPlanned > 0 ? `${monthlyPlanned.toFixed(2)} ${unitLabel}` : '—'])
        rightRows.push([`Actual Planned (${d.payableDays.toFixed(2)} days)`, actualPlanned > 0  ? `${actualPlanned.toFixed(2)} ${unitLabel}`  : '—'])
        if (rcConfigs.length === 0) rightRows.push([`Worked ${unitLabel}`, `${workedVal.toFixed(2)} ${unitLabel}`])
        perReadingTotals.forEach(r => rightRows.push([`Worked ${r.name}`, `${r.total.toFixed(2)}${r.unit ? ' ' + r.unit : ''}`]))
        rightRows.push(['Utilization %',                                    utilPctActual === '—' ? '—' : `${utilPctActual} %`])
        rightRows.push(['', ''])
      }
      if (sections.fuel) {
        rightRows.push(['Fuel Summary',          ''])
        rightRows.push(['Opening Fuel Balance',   ob !== null ? `${ob.toFixed(2)} Ltr` : '—'])
        rightRows.push(['HSD Issued (DPR)',        `${s.hsdTotal.toFixed(2)} Ltr`])
        rightRows.push(['Closing Balance',        cb !== null ? `${cb.toFixed(2)} Ltr` : '—'])
        rightRows.push(['Consumed',               consumed !== null ? `${consumed.toFixed(2)} Ltr` : '—'])
        if (isBothFormula) {
          if (tmAvgLtrPerHr) rightRows.push([isTransitMixer ? 'Actual Avg (Drum Hrs)' : 'Actual Consumption', `${tmAvgLtrPerHr} Ltr/Hr`])
          if (m.fuel_min && m.fuel_max) rightRows.push([isTransitMixer ? 'Approved Range (Drum Hrs)' : 'Approved Consumption', `${m.fuel_min} – ${m.fuel_max} ltr/hr`])
          else if (m.fuel_min)          rightRows.push([isTransitMixer ? 'Approved Range (Drum Hrs)' : 'Approved Consumption', `≥ ${m.fuel_min} ltr/hr`])
          if (tmAvgKmPerLtr) rightRows.push([isTransitMixer ? "Actual Avg (Front km's)" : 'Actual Economy', `${tmAvgKmPerLtr} Km/Ltr`])
          if (m.fuel_min_km) { const kmLo = Math.min(parseFloat(m.fuel_min_km), parseFloat(m.fuel_max_km||m.fuel_min_km)); const kmHi = Math.max(parseFloat(m.fuel_min_km), parseFloat(m.fuel_max_km||m.fuel_min_km)); rightRows.push([isTransitMixer ? "Approved Range (Front km's)" : 'Approved Economy', m.fuel_max_km ? `${kmLo} – ${kmHi} Km/Ltr` : `${kmLo} Km/Ltr`]) }
        } else {
          rightRows.push(['Actual Average', actualAvg])
          rightRows.push(['Approved Range', approvedRange])
        }
      }

      // Third column: Productivity Costing (only if enabled for this asset category)
      const showProductivity = m.report_show_productivity_costing !== false
      const productivityRows = showProductivity ? [
        ['Productivity Costing', '', ''],
        ['Production', totalQty.toFixed(2), qtyUnit],
        ['Fuel Expenses', Math.round(fuelExpenses).toString(), 'Rs.'],
        ['Asset Expenses', '0', 'Rs.'],
        ['Item charges', '0', 'Rs.'],
        ['Hire charges', Math.round(hireCharges).toString(), 'Rs.'],
        ['CTC', Math.round(ctcTotal).toString(), 'Rs.'],
        ['Cost per unit productivity', costPerUnit !== null ? costPerUnit.toFixed(2) : '—', costPerUnit !== null ? `Rs.${unitSuffix ? '/'+qtyUnit : ''}` : ''],
        ['', '', ''],
        ['Fuel vs Productivity', '', ''],
        ['Total Fuel Consumed', dieselConsumed.toFixed(2), 'Ltr'],
        ['Production', totalQty.toFixed(2), qtyUnit],
        ['Avg Fuel / productivity', fuelPerProd !== null ? fuelPerProd.toFixed(4) : '—', fuelPerProd !== null ? `Ltr${unitSuffix ? '/'+qtyUnit : ''}` : ''],
      ] : []

      const maxLen = Math.max(leftRows.length, rightRows.length, productivityRows.length)
      for (let i = 0; i < maxLen; i++) {
        const l = leftRows[i]         || ['', '']
        const r = rightRows[i]        || ['', '']
        const p = productivityRows[i] || ['', '', '']
        wsData.push([l[0], l[1], '', r[0], r[1], '', p[0], p[1], p[2]])
      }
      wsData.push([])
    }

    const resets = meterResetsMap[m.id] || []
    if (resets.length > 0) {
      wsData.push([])
      wsData.push(['METER / COUNTER RESET LOG'])
      wsData.push(['Date', 'Shift', 'Reading Type', 'New Starting Reading', 'Reset At', 'Reset By'])
      resets.forEach(r => {
        wsData.push([
          fmtDate((r.entry_date || '').slice(0, 10)),
          r.shift || '—',
          r.reading_code || '—',
          r.new_reading != null ? Number(r.new_reading).toFixed(2) : '—',
          fmtDateTime(r.reset_at),
          r.reset_by_name || '—',
        ])
      })
      wsData.push([])
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Bold the title and label cells in the compact header rows
    if (sections.header) {
      const titleRef = XLSX.utils.encode_cell({ r: 0, c: 0 })
      if (ws[titleRef]) ws[titleRef].s = { font: { bold: true, sz: 11 } }
      // rows 1 and 2: label cols are 0, 2, 4, 6, 8
      for (let r = 1; r <= 2; r++) {
        [0, 2, 4, 6, 8].forEach(c => {
          const ref = XLSX.utils.encode_cell({ r, c })
          if (ws[ref]) ws[ref].s = { font: { bold: true } }
        })
      }
    }

    if (sections.log) {
      // Bold column header row, no fill
      machineCols.forEach((_, ci) => {
        const ref = XLSX.utils.encode_cell({ r: logStartRow, c: ci })
        if (!ws[ref]) return
        ws[ref].s = { font: { bold: true }, alignment: { horizontal: 'center' } }
      })
      // Italic note for placeholder rows, no color
      placeholderRowIndices.forEach(ri => {
        machineCols.forEach((_, ci) => {
          const ref = XLSX.utils.encode_cell({ r: ri, c: ci })
          if (!ws[ref]) ws[ref] = { t: 's', v: '' }
          ws[ref].s = { font: { italic: true } }
        })
      })
    }

    // Bold summary section label cells (col 0 and col 3) and section headers
    if (sections.days || sections.utilization || sections.fuel) {
      const summaryStart = logStartRow
      const totalRows = wsData.length
      for (let r = summaryStart; r < totalRows; r++) {
        [0, 3].forEach(c => {
          const ref = XLSX.utils.encode_cell({ r, c })
          if (ws[ref] && ws[ref].v) ws[ref].s = { font: { bold: true } }
        })
      }
    }

    // Col widths: [leftLabel, leftValue, gap, rightLabel, rightValue]
    const summaryColWidths = [30, 16, 2, 26, 16]
    const logColWidths = machineCols.map(c => ({ wch: Math.max(c.label.length + 2, 12) }))
    ws['!cols'] = logColWidths.map((lc, i) => ({
      wch: Math.max(lc.wch, summaryColWidths[i] || 0)
    }))
    for (let i = logColWidths.length; i < summaryColWidths.length; i++) {
      ws['!cols'].push({ wch: summaryColWidths[i] })
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `DPR_${projName}_${date}.xlsx`)
}

async function buildPDF(machines, entriesMap, from, to, activeCols, sections, projName, fuelRecordsMap = {}, meterResetsMap = {}, dieselRate = 0) {
  const { jsPDF }             = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc     = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pw      = doc.internal.pageSize.getWidth()
  const ph      = doc.internal.pageSize.getHeight()
  let   isFirst = true

  for (const m of machines) {
    if (!isFirst) doc.addPage()
    isFirst = false

    const entries     = entriesMap[m.id] || []
    const allRows     = fillMissingDates(entries, m, from, to)
    const machineCols = getMachineCols(m, activeCols)
    let y = 10

    if (sections.header) {
      const ownerLabel = m.ownership === 'Own' ? 'Own Asset (RVR Projects)' : (m.vendor || '—')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text('RVR Projects Pvt Ltd — Daily Progress Report', 10, y)
      y += 5

      doc.setFontSize(7.5)
      const sep = '   |   '

      // Equipment line
      const eqLine = [
        `Sl#: ${m.slno || '—'}`,
        `Nickname: ${m.nickname || '—'}`,
        `Asset Code: ${m.asset_code || '—'}`,
        `Type: ${m.eq_type || '—'}`,
        `Reg No: ${m.reg_no || '—'}`,
      ].join(sep)
      doc.setFont('helvetica', 'normal')
      doc.text(eqLine, 10, y)
      y += 4.5

      // Ownership / period line
      const owLine = [
        `Ownership: ${m.ownership || '—'}`,
        `Owner/Vendor: ${ownerLabel}`,
        `Project: ${projName}`,
        `Shift: ${m.shift_type || '—'}`,
        `Period: ${fmtDate(from)} – ${fmtDate(to)}`,
      ].join(sep)
      doc.text(owLine, 10, y)
      y += 6
    }

    if (sections.log) {
      const body    = allRows.map((e, i) => machineCols.map(c => String(cellValForCol(e, c, i))))
      const totFoot = machineCols.map(c => {
        if (c.key === 'sno')       return 'Total'
        if (c.key === 'r1_total')  return entries.reduce((s, e) => s + (parseFloat(e.r1_total) || 0), 0).toFixed(2)
        if (c.key === 'hsd')       return entries.reduce((s, e) => s + (parseFloat(e.hsd) || 0), 0).toFixed(2)
        if (c.key === 'breakdown') return entries.reduce((s, e) => s + (parseFloat(e.breakdown) || 0), 0).toFixed(2)
        if (c.key === 'qty')       return entries.reduce((s, e) => s + (parseFloat(e.qty) || 0), 0).toFixed(2)
        if (c.rtId !== undefined && c.field === 'total') {
          return entries.reduce((s, e) => {
            const log = (e.reading_logs || []).find(l => l.reading_type_id === c.rtId)
            return s + (parseFloat(log?.total) || 0)
          }, 0).toFixed(2)
        }
        return ''
      })

      autoTable(doc, {
        startY: y,
        head: [machineCols.map(c => c.label)],
        body,
        foot: [totFoot],
        showFoot: 'lastPage',
        styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak', textColor: 0, fillColor: false },
        headStyles: { fontStyle: 'bold', textColor: 0, fillColor: false, lineWidth: 0.2, lineColor: 0 },
        bodyStyles: { lineWidth: 0.1, lineColor: 180 },
        footStyles: { fontStyle: 'bold', textColor: 0, fillColor: false, lineWidth: 0.2, lineColor: 0 },
        alternateRowStyles: {},
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 20 }, 2: { cellWidth: 22 } },
        margin: { left: 8, right: 8 },
        didDrawPage: ({ pageNumber }) => {
          doc.setFontSize(6.5)
          doc.setTextColor(0)
          doc.text(`Page ${pageNumber}`, pw - 18, ph - 5)
          doc.text('RVR Projects Pvt Ltd — DPR', 10, ph - 5)
        },
      })
      y = doc.lastAutoTable.finalY + 8
    }

    const addPageIfNeeded = (needed) => {
      if (y + needed > ph - 12) { doc.addPage(); y = 12 }
    }

    if (sections.days || sections.utilization || sections.fuel) {
      const d              = calcDaysSummary(entries, m, from, to)
      const s              = calcSummary(entries)
      const isTransitMixer = m.eq_type === 'Transit Mixer'
      const formulaType    = m.fuel_formula_type || (isTransitMixer ? 'transit_mixer' : 'L_per_Hr')
      const isBothFormula  = formulaType === 'both' || formulaType === 'transit_mixer'
      const isKmBasis      = formulaType === 'KM_per_L' || (!isBothFormula && /km/i.test(m.reading1_basis || ''))
      const rangeUnit      = isKmBasis ? 'km/ltr' : 'ltr/hr'
      const approvedRange  = (m.fuel_min && m.fuel_max)
        ? `${m.fuel_min} - ${m.fuel_max} ${rangeUnit}`
        : m.fuel_min ? `>= ${m.fuel_min} ${rangeUnit}` : '—'
      const fr  = fuelRecordsMap[m.id] || null
      const ob  = fr ? parseFloat(fr.opening_balance) : null
      const cb  = fr ? parseFloat(fr.closing_balance) : null
      // Consumed = Opening Balance + Total Issued (from DPR) - Closing Balance
      const consumed  = ob !== null && cb !== null ? ob + s.hsdTotal - cb : null
      const actualAvg = consumed != null && consumed > 0
        ? isKmBasis
          ? `${(s.totalR1 / consumed).toFixed(2)} km/ltr`
          : `${(consumed / s.workedTotal).toFixed(2)} ltr/hr`
        : '—'
      // Both-formula: dual averages — detect reading type IDs from actual entry logs
      const hrsRtId = (() => { for (const e of entries) { const l = (e.reading_logs || []).find(l => l.unit === 'Hrs'); if (l) return l.reading_type_id } return null })()
      const kmRtId  = (() => { for (const e of entries) { const l = (e.reading_logs || []).find(l => l.unit !== 'Hrs' && l.unit != null); if (l) return l.reading_type_id } return null })()
      const tmDrumHrs = isBothFormula && hrsRtId !== null ? entries.reduce((acc, e) => { const l = (e.reading_logs || []).find(rl => rl.reading_type_id === hrsRtId); return acc + (parseFloat(l?.total) || 0) }, 0) : 0
      const tmKm      = isBothFormula && kmRtId  !== null ? entries.reduce((acc, e) => { const l = (e.reading_logs || []).find(rl => rl.reading_type_id === kmRtId);  return acc + (parseFloat(l?.total) || 0) }, 0) : 0
      const tmSplitMode   = m.tm_split_mode  || null
      const tmSplitVal    = parseFloat(m.tm_split_value) || 0
      // Fallback for legacy/single-reading machines (no reading_logs): derive from r1/r2 columns
      const r1Basis = (m.reading1_basis || '').toLowerCase()
      const r2Basis = (m.reading2_basis || '').toLowerCase()
      const totalR2leg = isBothFormula && (tmDrumHrs === 0 || tmKm === 0)
        ? entries.reduce((s, e) => s + (parseFloat(e.r2_total) || 0), 0) : 0
      const legacyHrs = r1Basis.includes('hr') ? s.totalR1 : r2Basis.includes('hr') ? totalR2leg : 0
      const legacyKm  = r1Basis.includes('km') ? s.totalR1 : r2Basis.includes('km') ? totalR2leg : 0
      const effectiveHrs    = tmDrumHrs > 0 ? tmDrumHrs : legacyHrs
      const effectiveKm     = tmKm > 0 ? tmKm : legacyKm
      const effectiveDiesel = consumed !== null ? consumed : s.hsdTotal
      let tmAvgLtrPerHr = null, tmAvgKmPerLtr = null
      if (isBothFormula && effectiveDiesel > 0) {
        if (tmSplitMode === 'drum_rate' && tmSplitVal > 0 && tmDrumHrs > 0) {
          const drumDiesel    = tmDrumHrs * tmSplitVal
          const vehicleDiesel = effectiveDiesel - drumDiesel
          tmAvgLtrPerHr = tmSplitVal.toFixed(3)
          if (vehicleDiesel > 0 && tmKm > 0) tmAvgKmPerLtr = (tmKm / vehicleDiesel).toFixed(2)
        } else if (tmSplitMode === 'vehicle_rate' && tmSplitVal > 0 && tmKm > 0) {
          const vehicleDiesel = tmKm / tmSplitVal
          const drumDiesel    = effectiveDiesel - vehicleDiesel
          tmAvgKmPerLtr = tmSplitVal.toFixed(2)
          if (drumDiesel > 0 && tmDrumHrs > 0) tmAvgLtrPerHr = (drumDiesel / tmDrumHrs).toFixed(2)
        } else {
          if (effectiveHrs > 0) tmAvgLtrPerHr = (effectiveDiesel / effectiveHrs).toFixed(2)
          if (effectiveKm > 0)  tmAvgKmPerLtr = (effectiveKm / effectiveDiesel).toFixed(2)
        }
      }

      // Utilization: planned_hours is per-day; monthly = per-day × calDays; actual = per-day × payableDays
      const plannedPerDay  = parseFloat(m.planned_hours) || 0
      const monthlyPlanned = plannedPerDay * d.totalDays
      const actualPlanned  = plannedPerDay * d.payableDays
      const workedVal      = isKmBasis ? s.totalR1 : s.workedTotal
      const utilPctActual  = actualPlanned > 0 ? ((workedVal / actualPlanned) * 100).toFixed(2) : '—'
      const unitLabel      = isKmBasis ? 'KMs' : 'Hrs'
      // Additional reading totals from reading_configs (multi-reading machines)
      const rcConfigs = m.reading_configs || []
      const perReadingTotals = rcConfigs
        .map(rc => ({
          name:  rc.reading_name || rc.code,
          unit:  rc.unit || '',
          total: entries.reduce((s, e) => {
            const log = (e.reading_logs || []).find(l => l.reading_type_id === rc.reading_type_id)
            return s + (parseFloat(log?.total) || 0)
          }, 0)
        }))
        .filter(r => r.total > 0)
      if (rcConfigs.length === 0 && m.dual_reading && m.reading2_basis) {
        const r2Total = entries.reduce((s, e) => s + (parseFloat(e.r2_total) || 0), 0)
        if (r2Total > 0) perReadingTotals.push({ name: m.reading2_basis, unit: '', total: r2Total })
      }

      // ── ERP-style bordered table renderer ──
      const rowH   = 5.5    // row height in mm
      const padL   = 2      // left text padding
      const padR   = 2      // right text padding from cell right edge

      // draws one bordered table: header row + data rows, returns bottom y
      const drawTable = (tx, ty, labelW, valueW, header, rows) => {
        const tw = labelW + valueW
        doc.setFontSize(7.5)

        // header row — shaded
        doc.setFillColor(220, 228, 240)
        doc.setDrawColor(140, 140, 160)
        doc.rect(tx, ty, tw, rowH, 'FD')
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(30, 30, 80)
        doc.text(header, tx + padL, ty + rowH - 1.4)

        // data rows
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(0)
        rows.forEach(([label, value], i) => {
          const ry2 = ty + rowH * (i + 1)
          // alternating light fill
          if (i % 2 === 1) {
            doc.setFillColor(248, 249, 252)
            doc.rect(tx, ry2, tw, rowH, 'F')
          }
          doc.setDrawColor(190, 190, 200)
          doc.rect(tx,           ry2, labelW, rowH, 'S')
          doc.rect(tx + labelW,  ry2, valueW, rowH, 'S')
          doc.setFontSize(7.5)
          doc.setTextColor(40, 40, 40)
          doc.text(String(label), tx + padL, ry2 + rowH - 1.4)
          doc.setTextColor(20, 20, 20)
          doc.text(String(value), tx + tw - padR, ry2 + rowH - 1.4, { align: 'right' })
        })

        return ty + rowH * (rows.length + 1)
      }

      const storedCost = entries.reduce((sum, e) => {
        if (parseFloat(e.diesel_cost) > 0) return sum + parseFloat(e.diesel_cost)
        const h = parseFloat(e.hsd) || 0
        const r = parseFloat(e.diesel_rate) || 0
        return h > 0 && r > 0 ? sum + h * r : sum
      }, 0)
      const dieselQty  = consumed !== null ? consumed : s.hsdTotal
      const dieselCost = storedCost > 0
        ? storedCost
        : (dieselRate > 0 ? dieselQty * dieselRate : null)

      // Productivity costing
      const totalQty      = entries.reduce((sum, e) => sum + (parseFloat(e.qty) || 0), 0)
      const qtyUnit       = m.uom || ''
      const fuelExpenses  = storedCost
      const hireCharges   = m.ownership === 'Hire'
        ? (parseFloat(m.rate_monthly) > 0 ? parseFloat(m.rate_monthly) : parseFloat(m.rate) > 0 ? parseFloat(m.rate) * d.payableDays : 0)
        : 0
      const ctcTotal      = fuelExpenses + hireCharges
      const dieselConsumed = consumed !== null ? consumed : s.hsdTotal
      const costPerUnit   = ctcTotal > 0 && totalQty > 0 ? ctcTotal / totalQty : null
      const fuelPerProd   = dieselConsumed > 0 && totalQty > 0 ? dieselConsumed / totalQty : null
      const unitSuffix    = qtyUnit ? `/${qtyUnit}` : ''

      // 3-column layout: Working Day | Utilization+Fuel | Productivity+FuelVsProd
      // Page is A4 landscape (297mm wide); usable ≈ 10→277mm = 267mm across 3 cols
      const showProductivity = m.report_show_productivity_costing !== false
      const lx = 10;   const lLabelW = 62; const lValueW = 25   // col 1 width = 87
      const rx = 102;  const rLabelW = 60; const rValueW = 25   // col 2 width = 85
      const px = 192;  const pLabelW = 55; const pValueW = 25   // col 3 width = 80

      const costRows = [
        ['Production',         `${totalQty.toFixed(2)}${qtyUnit ? ' ' + qtyUnit : ''}`],
        ['Fuel Expenses',      `${Math.round(fuelExpenses).toLocaleString('en-IN')} Rs.`],
        ['Asset Expenses',     '0 Rs.'],
        ['Item charges',       '0 Rs.'],
        ['Hire charges',       `${Math.round(hireCharges).toLocaleString('en-IN')} Rs.`],
        ['CTC (Total Cost)',   `${Math.round(ctcTotal).toLocaleString('en-IN')} Rs.`],
        ...(costPerUnit !== null ? [['Cost per unit productivity', `${costPerUnit.toFixed(2)} Rs.${unitSuffix}`]] : []),
      ]
      const fuelProdRows = [
        ['Total Fuel Consumed', `${dieselConsumed.toFixed(2)} Ltr`],
        ['Production',          `${totalQty.toFixed(2)}${qtyUnit ? ' ' + qtyUnit : ''}`],
        ...(fuelPerProd !== null ? [['Avg Fuel / productivity', `${fuelPerProd.toFixed(4)} Ltr${unitSuffix}`]] : []),
      ]

      // estimate total height needed across all 3 columns
      const leftRowsH  = sections.days ? 5 : 0
      const fuelExtraRows = isBothFormula ? 4 : 0
      const rightRowsH = (sections.utilization ? (rcConfigs.length === 0 ? 6 : 5) + perReadingTotals.length : 0) + (sections.fuel ? 8 + fuelExtraRows : 0)
      const c3RowsH    = showProductivity ? costRows.length + 2 + fuelProdRows.length + 2 : 0
      const neededH    = (Math.max(leftRowsH, rightRowsH, c3RowsH) + 1) * rowH + 8
      addPageIfNeeded(neededH)

      const startY = y
      let leftBottom  = startY
      let rightBottom = startY
      let prodColBottom = startY

      // ── Column 1: Working Day Summary ──
      if (sections.days) {
        leftBottom = drawTable(lx, startY, lLabelW, lValueW, 'Working Day Summary', [
          ['Report Range days',            `${d.totalDays} Days`],
          ['No of Breakdown days',         `${d.brkDays.toFixed(2)} Days`],
          ['No of Idle days',              `${d.idleDays.toFixed(2)} Days`],
          ['No of Effective Working days', `${d.netWorkDays.toFixed(2)} Days`],
          ['No of Payable days',           `${d.payableDays.toFixed(2)} Days`],
        ])
      }

      // ── Column 2: Utilization ──
      if (sections.utilization) {
        rightBottom = drawTable(rx, startY, rLabelW, rValueW, `Utilization (${unitLabel})`, [
          [`Planned ${unitLabel} (Monthly)`,                   monthlyPlanned > 0 ? `${monthlyPlanned.toFixed(2)} ${unitLabel}` : '—'],
          [`Actual Planned (${d.payableDays.toFixed(2)} days)`, actualPlanned > 0  ? `${actualPlanned.toFixed(2)} ${unitLabel}`  : '—'],
          ...(rcConfigs.length === 0 ? [[`Worked ${unitLabel}`, `${workedVal.toFixed(2)} ${unitLabel}`]] : []),
          ...perReadingTotals.map(r => [`Worked ${r.name}`, `${r.total.toFixed(2)}${r.unit ? ' ' + r.unit : ''}`]),
          ['Utilization %',                                    utilPctActual === '—' ? '—' : `${utilPctActual} %`],
        ])
        rightBottom += 2
      }

      // ── Column 2: Fuel Summary ──
      if (sections.fuel) {
        const fuelRows = [
          ['Opening Fuel Balance', ob !== null ? `${ob.toFixed(2)} Ltr` : '—'],
          ['HSD Issued (DPR)',     `${s.hsdTotal.toFixed(2)} Ltr`],
          ['Closing Balance',      cb !== null ? `${cb.toFixed(2)} Ltr` : '—'],
          ['Consumed',             consumed !== null ? `${consumed.toFixed(2)} Ltr` : '—'],
        ]
        if (isTransitMixer) {
          if (tmAvgLtrPerHr) fuelRows.push(['Actual Average (Drum Hrs)', `${tmAvgLtrPerHr} Ltr/Hr`])
          if (m.fuel_min && m.fuel_max) fuelRows.push(['Approved Range (Drum Hrs)', `${m.fuel_min} - ${m.fuel_max} ltr/hr`])
          else if (m.fuel_min)          fuelRows.push(['Approved Range (Drum Hrs)', `>= ${m.fuel_min} ltr/hr`])
          if (tmAvgKmPerLtr) fuelRows.push(["Actual Average (Front km's)", `${tmAvgKmPerLtr} Km/Ltr`])
          if (m.fuel_min_km) { const kmLo = Math.min(parseFloat(m.fuel_min_km), parseFloat(m.fuel_max_km||m.fuel_min_km)); const kmHi = Math.max(parseFloat(m.fuel_min_km), parseFloat(m.fuel_max_km||m.fuel_min_km)); fuelRows.push(["Approved Range (Front km's)", m.fuel_max_km ? `${kmLo} - ${kmHi} Km/Ltr` : `${kmLo} Km/Ltr`]) }
        } else if (isBothFormula) {
          if (tmAvgLtrPerHr) fuelRows.push(['Actual Consumption', `${tmAvgLtrPerHr} Ltr/Hr`])
          if (m.fuel_min && m.fuel_max) fuelRows.push(['Approved Consumption', `${m.fuel_min} - ${m.fuel_max} ltr/hr`])
          else if (m.fuel_min)          fuelRows.push(['Approved Consumption', `>= ${m.fuel_min} ltr/hr`])
          if (tmAvgKmPerLtr) fuelRows.push(['Actual Economy', `${tmAvgKmPerLtr} Km/Ltr`])
          if (m.fuel_min_km) { const kmLo = Math.min(parseFloat(m.fuel_min_km), parseFloat(m.fuel_max_km||m.fuel_min_km)); const kmHi = Math.max(parseFloat(m.fuel_min_km), parseFloat(m.fuel_max_km||m.fuel_min_km)); fuelRows.push(['Approved Economy', m.fuel_max_km ? `${kmLo} - ${kmHi} Km/Ltr` : `${kmLo} Km/Ltr`]) }
        } else {
          fuelRows.push(['Actual Average', actualAvg])
          fuelRows.push(['Approved Range', approvedRange])
        }
        rightBottom = drawTable(rx, rightBottom, rLabelW, rValueW, 'Fuel Summary', fuelRows)
      }

      // ── Column 3: Productivity Costing + Fuel vs Productivity (if enabled) ──
      if (showProductivity) {
        prodColBottom = drawTable(px, startY, pLabelW, pValueW, 'Productivity Costing', costRows)
        prodColBottom += 2
        prodColBottom = drawTable(px, prodColBottom, pLabelW, pValueW, 'Fuel vs Productivity', fuelProdRows)
      }

      y = Math.max(leftBottom, rightBottom, prodColBottom) + 4
    }

    const resets = meterResetsMap[m.id] || []
    if (resets.length > 0) {
      addPageIfNeeded(16 + resets.length * 6)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(180, 80, 0)
      doc.text('Meter / Counter Reset Log', 8, y)
      y += 3
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Shift', 'Reading Type', 'New Starting Reading', 'Reset At (IST)', 'Reset By']],
        body: resets.map(r => [
          fmtDate((r.entry_date || '').slice(0, 10)),
          r.shift || '—',
          r.reading_code || '—',
          r.new_reading != null ? `${Number(r.new_reading).toFixed(2)}` : '—',
          fmtDateTime(r.reset_at),
          r.reset_by_name || '—',
        ]),
        styles: { fontSize: 7, cellPadding: 1.5, textColor: 0, fillColor: false },
        headStyles: { fontStyle: 'bold', textColor: [180, 80, 0], fillColor: [255, 240, 220], lineWidth: 0.2, lineColor: 0 },
        bodyStyles: { lineWidth: 0.1, lineColor: 180 },
        margin: { left: 8, right: 8 },
      })
      y = doc.lastAutoTable.finalY + 6
    }
  }

  const date = new Date().toISOString().slice(0, 10)
  doc.save(`DPR_${projName}_${date}.pdf`)
}

export async function downloadDPRForMachine(machine, entries, from, to, projName, format, fuelRecord = null, dieselRate = 0) {
  const activeCols     = [...FIXED_COLS, ...TOGGLE_COLS.filter(c => c.def)]
  const sections       = { header: true, log: true, days: true, utilization: true, fuel: true }
  const shiftOrder     = { 'Day Shift': 0, 'Night Shift': 1, 'Dual Shift': 2 }
  const sorted         = [...entries].sort((a, b) => {
    const dd = new Date(a.entry_date) - new Date(b.entry_date)
    if (dd !== 0) return dd
    return (shiftOrder[a.shift] ?? 9) - (shiftOrder[b.shift] ?? 9)
  })
  const entriesMap     = { [machine.id]: sorted }
  const fuelRecordsMap = fuelRecord ? { [machine.id]: fuelRecord } : {}

  let meterResetsMap = {}
  try {
    const rr = await getMeterResets({ machine_id: machine.id, from, to })
    if (rr.data.data?.length) meterResetsMap = { [machine.id]: rr.data.data }
  } catch {}

  if (format === 'excel') {
    await buildExcel([machine], entriesMap, from, to, activeCols, sections, projName, fuelRecordsMap, meterResetsMap, dieselRate)
  } else {
    await buildPDF([machine], entriesMap, from, to, activeCols, sections, projName, fuelRecordsMap, meterResetsMap, dieselRate)
  }
}

export default function DPRDownloadModal({ onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) })()

  const [projects,   setProjects]  = useState([])
  const [machines,   setMachines]  = useState([])
  const [projectId,  setProjectId] = useState('')
  const [machineId,  setMachineId] = useState('')
  const [from,       setFrom]      = useState(firstOfMonth)
  const [to,         setTo]        = useState(today)
  const [sections,   setSections]  = useState({ header: true, log: true, days: true, utilization: true, fuel: true })
  const [cols,       setCols]      = useState(
    () => Object.fromEntries(TOGGLE_COLS.map(c => [c.key, c.def]))
  )
  const [format,     setFormat]    = useState('excel')
  const [dieselRate, setDieselRate] = useState('')
  const [loading,    setLoading]   = useState(false)
  const [error,      setError]     = useState('')

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!projectId) { setMachines([]); setMachineId(''); return }
    const proj = projects.find(p => String(p.id) === String(projectId))
    if (!proj) return
    getMachines({ project_code: proj.code }).then(r => setMachines(r.data.data)).catch(() => {})
    setMachineId('')
  }, [projectId, projects])

  const toggleSection = k => setSections(s => ({ ...s, [k]: !s[k] }))
  const toggleCol     = k => setCols(c => ({ ...c, [k]: !c[k] }))

  const activeCols = [
    ...FIXED_COLS,
    ...TOGGLE_COLS.filter(c => cols[c.key]),
  ]

  const handleDownload = async () => {
    if (!projectId) { setError('Please select a project.'); return }
    const anySection = Object.values(sections).some(Boolean)
    if (!anySection) { setError('Select at least one section.'); return }
    setError(''); setLoading(true)

    try {
      const proj     = projects.find(p => String(p.id) === String(projectId))
      const projName = proj ? (proj.code || proj.name) : 'Project'

      const entriesRes = await getEntries({ project_code: proj.code, from, to })
      const allEntries = entriesRes.data.data

      const targetMachines = machineId
        ? machines.filter(m => String(m.id) === String(machineId))
        : machines

      const entriesMap = {}
      for (const m of targetMachines) {
        entriesMap[m.id] = allEntries
          .filter(e => e.machine_id === m.id)
          .sort((a, b) => {
            const dd = new Date(a.entry_date) - new Date(b.entry_date)
            if (dd !== 0) return dd
            const order = { 'Day Shift': 0, 'Night Shift': 1, 'Dual Shift': 2 }
            return (order[a.shift] ?? 9) - (order[b.shift] ?? 9)
          })
      }

      const fuelRecordsMap = {}
      const meterResetsMap = {}
      await Promise.all(targetMachines.map(async m => {
        try {
          const fr = await getFuelRecord({ machine_id: m.id, period_from: from, period_to: to })
          if (fr.data.data) fuelRecordsMap[m.id] = fr.data.data
        } catch {}
        try {
          const rr = await getMeterResets({ machine_id: m.id, from, to })
          if (rr.data.data?.length) meterResetsMap[m.id] = rr.data.data
        } catch {}
      }))

      const rate = parseFloat(dieselRate) || 0
      if (format === 'excel') {
        await buildExcel(targetMachines, entriesMap, from, to, activeCols, sections, projName, fuelRecordsMap, meterResetsMap, rate)
      } else {
        await buildPDF(targetMachines, entriesMap, from, to, activeCols, sections, projName, fuelRecordsMap, meterResetsMap, rate)
      }

      onClose()
    } catch (e) {
      console.error(e)
      setError('Failed to generate report. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Download DPR Report</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">

          {/* Filters */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Project <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={projects.map(p => ({ value: p.id, label: p.code + (p.name ? ` — ${p.name}` : '') }))}
                value={projectId}
                onChange={setProjectId}
                placeholder="Search project…"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Machine / Equipment</label>
              <SearchableSelect
                options={[
                  { value: '', label: 'All Machines' },
                  ...machines.map(m => ({ value: m.id, label: `${m.slno}${m.eq_type ? ` · ${m.eq_type}` : ''}${m.reg_no ? ` (${m.reg_no})` : ''}` })),
                ]}
                value={machineId}
                onChange={setMachineId}
                placeholder={projectId ? 'Search machine…' : 'Select project first'}
                disabled={!projectId}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Diesel Rate (₹/Ltr)
              </label>
              <input
                type="number" min="0" step="0.01" value={dieselRate}
                onChange={e => setDieselRate(e.target.value)}
                placeholder="Optional"
                className={inp}
              />
            </div>
          </div>

          {/* Sections + Columns side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sections</label>
              <div className="space-y-1.5">
                {SECTIONS.map(s => (
                  <label key={s.key} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input type="checkbox" checked={sections[s.key]} onChange={() => toggleSection(s.key)}
                      className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                    <span className="text-sm text-gray-800">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Log Columns</label>
              </div>
              <div className="space-y-1.5">
                {/* Fixed columns note */}
                <p className="text-xs text-gray-400 px-1">Always included: S.No, Date, Shift, Opening, Closing, Total</p>
                {TOGGLE_COLS.map(c => (
                  <label key={c.key} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input type="checkbox" checked={cols[c.key]} onChange={() => toggleCol(c.key)}
                      className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                    <span className="text-sm text-gray-800">{c.label}</span>
                  </label>
                ))}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setCols(Object.fromEntries(TOGGLE_COLS.map(c => [c.key, true])))}
                    className="text-xs text-blue-600 hover:underline">All</button>
                  <button onClick={() => setCols(Object.fromEntries(TOGGLE_COLS.map(c => [c.key, false])))}
                    className="text-xs text-gray-400 hover:underline">None</button>
                </div>
              </div>
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Format</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'excel', label: 'Excel (.xlsx)', icon: FileSpreadsheet, color: 'text-green-700 border-green-400 bg-green-50' },
                { key: 'pdf',   label: 'PDF (.pdf)',    icon: FileText,        color: 'text-red-700 border-red-400 bg-red-50'   },
              ].map(f => {
                const Icon = f.icon
                return (
                  <button key={f.key} onClick={() => setFormat(f.key)}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                      format === f.key ? f.color + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    <Icon size={18} />
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex gap-3 flex-shrink-0">
          <button onClick={handleDownload} disabled={loading || !projectId}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {loading ? 'Preparing…' : `Download ${format === 'excel' ? 'Excel' : 'PDF'}`}
          </button>
          <button onClick={onClose}
            className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
            Cancel
          </button>
        </div>

      </div>
    </div>
  )
}
