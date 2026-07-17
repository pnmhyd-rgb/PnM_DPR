import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getProjects, getMonthlyUtilization } from '../lib/api'
import { FileDown, SlidersHorizontal } from 'lucide-react'
import MachineDetailPanel from '../components/MachineDetailPanel'

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(v, dec = 2) {
  if (v == null || v === '') return ''
  const n = parseFloat(v)
  return isNaN(n) ? '' : n.toFixed(dec)
}

function fmtDateLabel(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)}-${SHORT_MONTHS[parseInt(m) - 1]}-${y}`
}

function utilColor(pct) {
  if (pct >= 90) return 'text-green-700 bg-green-50'
  if (pct >= 70) return 'text-blue-700 bg-blue-50'
  if (pct >= 50) return 'text-yellow-700 bg-yellow-50'
  return 'text-red-700 bg-red-50'
}

function dieselValues(r) {
  const ft  = r.fuel_formula_type || 'L_per_Hr'
  const lhr = r.diesel_avg    != null ? fmt(r.diesel_avg, 2)    : null
  const kml = r.diesel_avg_km != null ? fmt(r.diesel_avg_km, 2) : null
  if (ft === 'KM_per_L') return ['—', kml ?? '—']
  if (ft === 'both' || ft === 'transit_mixer') return [lhr ?? '—', kml ?? '—']
  return [lhr ?? '—', '—']
}

const UTIL_STATUS_OPTS = [
  { value: 'High',   label: 'High (≥ 80%)',    min: 80, max: Infinity },
  { value: 'Medium', label: 'Medium (50–79%)',  min: 50, max: 80 },
  { value: 'Low',    label: 'Low (< 50%)',      min: -Infinity, max: 50 },
]

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function monthStartStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function Utilization() {
  const [projects, setProjects]       = useState([])
  const [data, setData]               = useState([])
  const [loading, setLoading]         = useState(false)
  const [detailMachine, setDetailMachine] = useState(null)
  const [filters, setFilters]   = useState({
    project_code: '',
    from:         monthStartStr(),
    to:           todayStr(),
    ownership:    '',
  })
  const [clientFilters, setClientFilters] = useState({
    asset_group:  '',
    eq_type:      '',
    asset_cat:    '',
    manufacturer: '',
    model:        '',
    asset_name:   '',
    owner_name_f: '',
    util_status:  '',
  })

  useEffect(() => { getProjects().then(r => setProjects(r.data.data)) }, [])

  useEffect(() => {
    if (!filters.from || !filters.to || filters.from > filters.to) return
    setLoading(true)
    const p = { from: filters.from, to: filters.to }
    if (filters.project_code) p.project_code = filters.project_code
    if (filters.ownership)    p.ownership    = filters.ownership
    getMonthlyUtilization(p)
      .then(r => setData(r.data.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [filters])

  const setF = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))
  const setC = k => e => setClientFilters(f => ({ ...f, [k]: e.target.value }))

  const hasClientFilters = useMemo(() => Object.values(clientFilters).some(Boolean), [clientFilters])
  const clearClientFilters = () => setClientFilters({ asset_group: '', eq_type: '', asset_cat: '', manufacturer: '', model: '', asset_name: '', owner_name_f: '', util_status: '' })

  const uniqueGroups        = useMemo(() => [...new Set(data.map(r => r.asset_group).filter(Boolean))].sort(), [data])
  const uniqueEqTypes       = useMemo(() => [...new Set(data.map(r => r.eq_type).filter(Boolean))].sort(), [data])
  const uniqueAssetCats     = useMemo(() => [...new Set(data.map(r => r.asset_cat).filter(Boolean))].sort(), [data])
  const uniqueManufacturers = useMemo(() => [...new Set(data.map(r => r.manufacturer).filter(Boolean))].sort(), [data])
  const uniqueModels        = useMemo(() => [...new Set(data.map(r => r.model).filter(Boolean))].sort(), [data])
  const uniqueOwnerNames    = useMemo(() => [...new Set(data.map(r => r.owner_name).filter(v => v && v !== '—'))].sort(), [data])

  const filteredData = useMemo(() => {
    if (!hasClientFilters) return data
    return data.filter(r => {
      if (clientFilters.asset_group  && r.asset_group  !== clientFilters.asset_group)  return false
      if (clientFilters.eq_type      && r.eq_type      !== clientFilters.eq_type)       return false
      if (clientFilters.asset_cat    && r.asset_cat    !== clientFilters.asset_cat)     return false
      if (clientFilters.manufacturer && r.manufacturer !== clientFilters.manufacturer)  return false
      if (clientFilters.model        && r.model        !== clientFilters.model)         return false
      if (clientFilters.asset_name) {
        const q = clientFilters.asset_name.toLowerCase()
        if (!((r.nick_name || '').toLowerCase().includes(q) || (r.reg_no || '').toLowerCase().includes(q))) return false
      }
      if (clientFilters.owner_name_f && r.owner_name !== clientFilters.owner_name_f) return false
      if (clientFilters.util_status) {
        const pct = r.util_pct || 0
        const opt = UTIL_STATUS_OPTS.find(o => o.value === clientFilters.util_status)
        if (opt && (pct < opt.min || pct >= opt.max)) return false
      }
      return true
    })
  }, [data, clientFilters, hasClientFilters])

  const periodFrom  = fmtDateLabel(filters.from)
  const periodTo    = fmtDateLabel(filters.to)
  const periodRange = `${periodFrom} to ${periodTo}`
  const fileTag     = filters.from && filters.to
    ? `${filters.from.replace(/-/g,'')}_${filters.to.replace(/-/g,'')}`
    : 'Report'
  const generatedOn = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  const projectLabel = filters.project_code
    ? (projects.find(p => p.code === filters.project_code)?.name || filters.project_code)
    : 'All Projects'
  const ownerLabel  = filters.ownership || 'Own & Hire'

  function computeTotals(rows) {
    return {
      totWorkDays: rows.reduce((s, r) => s + (r.working_days      || 0), 0),
      totPlanned:  rows.reduce((s, r) => s + (r.planned_hrs_actual || 0), 0),
      totWorked:   rows.reduce((s, r) => s + (r.worked_hrs         || 0), 0),
      totIdle:     rows.reduce((s, r) => s + (r.idle_hrs           || 0), 0),
      totBd:       rows.reduce((s, r) => s + (r.bd_hrs             || 0), 0),
      totHsd:      rows.reduce((s, r) => s + (r.hsd_consumed       || 0), 0),
      avgAvail:    rows.length ? rows.reduce((s, r) => s + r.avail_pct, 0) / rows.length : 0,
      avgUtil:     rows.length ? rows.reduce((s, r) => s + r.util_pct,  0) / rows.length : 0,
    }
  }

  // ── Excel download ──────────────────────────────────────────────────────────
  const handleDownloadExcel = () => {
    const wb  = XLSX.utils.book_new()
    const TOT = computeTotals(filteredData)

    const headerRow = [
      'S.No.','Nick Name','Asset Type','Make / Model','Reg.No / M.Sr.No',
      'Owner / Name','Shift','Work Done','Fixed Hrs (Period)','Working Days',
      'Planned Hrs (actual days)','Starting Reading','Closing Reading',
      'Worked Hrs','Idle Hrs','B/D Hrs','% Availability','% Utilisation',
      'Fuel — Opening Bal.','Fuel — HSD Issued','Fuel — Closing Bal.','Fuel — HSD Consumed',
      'Total Qty','Diesel Avg (L/Hr)','Fuel Economy (KM/L)','Remarks'
    ]

    const dataRows = filteredData.map((r, i) => {
      const [lhr, kml] = dieselValues(r)
      return [
        i + 1,
        r.nick_name  || '',
        r.asset_type || r.eq_type || '',
        r.make_model || '',
        r.reg_no     || '',
        r.owner_name || '',
        r.shift_type || '',
        r.work_done  || '',
        r.fixed_hrs_per_month != null ? Number(r.fixed_hrs_per_month) : '',
        r.working_days || 0,
        r.planned_hrs_actual != null ? Number(r.planned_hrs_actual) : '',
        r.starting_reading != null ? Number(r.starting_reading) : '',
        r.closing_reading  != null ? Number(r.closing_reading)  : '',
        r.worked_hrs != null ? Number(r.worked_hrs) : '',
        r.idle_hrs   != null ? Number(r.idle_hrs)   : '',
        r.bd_hrs     != null ? Number(r.bd_hrs)     : '',
        `${fmt(r.avail_pct, 2)}%`,
        `${fmt(r.util_pct, 2)}%`,
        '',
        r.hsd_consumed != null ? Number(r.hsd_consumed) : '',
        '',
        r.hsd_consumed != null ? Number(r.hsd_consumed) : '',
        r.hsd_consumed != null ? Number(r.hsd_consumed) : '',
        lhr !== '—' ? lhr : '',
        kml !== '—' ? kml : '',
        r.remarks_agg || '',
      ]
    })

    const totRow = [
      'Total','','','','','','','','',
      TOT.totWorkDays,
      Number(TOT.totPlanned.toFixed(2)), '', '',
      Number(TOT.totWorked.toFixed(2)),
      Number(TOT.totIdle.toFixed(2)),
      Number(TOT.totBd.toFixed(2)),
      `${fmt(TOT.avgAvail, 2)}%`,
      `${fmt(TOT.avgUtil, 2)}%`,
      0, 0, 0,
      Number(TOT.totHsd.toFixed(2)),
      Number(TOT.totHsd.toFixed(2)),
      '','','',
    ]

    const NCOLS = headerRow.length
    const titleRows = [
      [`RVR Projects Pvt Ltd — Machinery Performance Report`],
      [`Period: ${periodRange}   |   Project: ${projectLabel}   |   Ownership: ${ownerLabel}   |   Generated: ${generatedOn}`],
      [],
    ]

    const ws = XLSX.utils.aoa_to_sheet([...titleRows, headerRow, ...dataRows, totRow])

    ws['!merges'] = [
      { s:{r:0,c:0}, e:{r:0,c:NCOLS-1} },
      { s:{r:1,c:0}, e:{r:1,c:NCOLS-1} },
    ]
    ws['!cols'] = [
      {wch:6},{wch:20},{wch:18},{wch:20},{wch:18},{wch:24},{wch:14},{wch:20},
      {wch:14},{wch:12},{wch:18},{wch:14},{wch:14},{wch:12},{wch:10},{wch:10},
      {wch:14},{wch:12},{wch:14},{wch:12},{wch:14},{wch:14},{wch:12},{wch:14},{wch:14},{wch:24},
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Utilization')
    XLSX.writeFile(wb, `Utilization_${fileTag}.xlsx`)
  }

  // ── PDF download ────────────────────────────────────────────────────────────
  const handleDownloadPDF = () => {
    const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const TOT   = computeTotals(filteredData)

    const ML = 5, MR = 5
    const availW = pageW - ML - MR

    // Base proportional widths — scaled to fill exact available width
    const BASE = [7,19,17,17,17,20,13,17,13,11,15,13,13,13,11,11,12,12,12,12,12,12,12,13,13,20]
    const baseTotal = BASE.reduce((s, v) => s + v, 0)
    const CW = BASE.map(w => parseFloat((w * availW / baseTotal).toFixed(2)))
    // Absorb rounding residual into last column
    const cwTotal = CW.reduce((s, v) => s + v, 0)
    CW[CW.length - 1] = parseFloat((CW[CW.length - 1] + (availW - cwTotal)).toFixed(2))

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    doc.text('RVR Projects Pvt Ltd — Machinery Performance Report', pageW / 2, 10, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(`Period: ${periodRange}   |   Project: ${projectLabel}   |   Ownership: ${ownerLabel}`, pageW / 2, 15, { align: 'center' })

    const head = [
      [
        { content: 'S.No.',                       rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Nick Name',                    rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Asset Type',                   rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Make / Model',                 rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Reg.No / M.Sr.No',             rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Owner / Name',                 rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Shift',                        rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Work Done',                    rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Fixed Hrs (Period)',            rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Working Days',                 rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Planned Hrs (Actual Days)',     rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Starting Reading',             rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Closing Reading',              rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Worked Hrs',                   rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Idle Hrs',                     rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'B/D Hrs',                      rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: '% Avail.',                     rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: '% Util.',                      rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [255, 230, 153], textColor: [0,0,0] } },
        { content: 'Fuel',                         colSpan: 4, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Total Qty',                    rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Diesel Avg (L/Hr)',            rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Fuel Economy (KM/L)',          rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Remarks',                      rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      ],
      [
        { content: 'Opening Bal.', styles: { halign: 'center' } },
        { content: 'HSD Issued',   styles: { halign: 'center' } },
        { content: 'Closing Bal.', styles: { halign: 'center' } },
        { content: 'HSD Consumed', styles: { halign: 'center' } },
      ],
    ]

    const body = filteredData.map((r, i) => {
      const [lhr, kml] = dieselValues(r)
      return [
        i + 1,
        r.nick_name  || '',
        r.asset_type || r.eq_type || '',
        r.make_model || '',
        r.reg_no     || '',
        r.owner_name || '',
        r.shift_type || '',
        r.work_done  || '',
        fmt(r.fixed_hrs_per_month, 0),
        r.working_days || 0,
        fmt(r.planned_hrs_actual, 2),
        fmt(r.starting_reading, 2),
        fmt(r.closing_reading, 2),
        fmt(r.worked_hrs, 2),
        fmt(r.idle_hrs, 2),
        fmt(r.bd_hrs, 2),
        `${fmt(r.avail_pct, 2)}%`,
        { content: `${fmt(r.util_pct, 2)}%`, styles: { fillColor: [255, 230, 153], fontStyle: 'bold', textColor: [0,0,0] } },
        '',
        fmt(r.hsd_consumed, 2),
        '',
        fmt(r.hsd_consumed, 2),
        fmt(r.hsd_consumed, 2),
        lhr,
        kml,
        r.remarks_agg || '',
      ]
    })

    body.push([
      { content: 'TOTAL', colSpan: 9, styles: { fontStyle: 'bold', halign: 'right', fillColor: [220,230,241] } },
      { content: TOT.totWorkDays, styles: { fontStyle: 'bold', fillColor: [220,230,241] } },
      { content: fmt(TOT.totPlanned, 2), styles: { fontStyle: 'bold', halign: 'right', fillColor: [220,230,241] } },
      { content: '', styles: { fillColor: [220,230,241] } },
      { content: '', styles: { fillColor: [220,230,241] } },
      { content: fmt(TOT.totWorked, 2), styles: { fontStyle: 'bold', halign: 'right', fillColor: [220,230,241] } },
      { content: fmt(TOT.totIdle, 2),   styles: { fontStyle: 'bold', halign: 'right', fillColor: [220,230,241] } },
      { content: fmt(TOT.totBd, 2),     styles: { fontStyle: 'bold', halign: 'right', fillColor: [220,230,241] } },
      { content: `${fmt(TOT.avgAvail, 2)}%`, styles: { fontStyle: 'bold', halign: 'center', fillColor: [220,230,241] } },
      { content: `${fmt(TOT.avgUtil, 2)}%`,  styles: { fontStyle: 'bold', halign: 'center', fillColor: [255, 230, 153], textColor: [0,0,0] } },
      { content: 0, styles: { fillColor: [220,230,241] } },
      { content: 0, styles: { fillColor: [220,230,241] } },
      { content: 0, styles: { fillColor: [220,230,241] } },
      { content: fmt(TOT.totHsd, 2), styles: { fontStyle: 'bold', halign: 'right', fillColor: [220,230,241] } },
      { content: fmt(TOT.totHsd, 2), styles: { fontStyle: 'bold', halign: 'right', fillColor: [220,230,241] } },
      { content: '', styles: { fillColor: [220,230,241] } },
      { content: '', styles: { fillColor: [220,230,241] } },
      { content: '', styles: { fillColor: [220,230,241] } },
    ])

    autoTable(doc, {
      startY: 20,
      head,
      body,
      theme: 'grid',
      styles:     { fontSize: 6, cellPadding: 1.2, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [28, 78, 144], textColor: 255, fontStyle: 'bold', fontSize: 5.5, halign: 'center', valign: 'middle' },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      columnStyles: {
        0:  { cellWidth: CW[0],  halign: 'center' },
        1:  { cellWidth: CW[1] },
        2:  { cellWidth: CW[2] },
        3:  { cellWidth: CW[3] },
        4:  { cellWidth: CW[4] },
        5:  { cellWidth: CW[5] },
        6:  { cellWidth: CW[6] },
        7:  { cellWidth: CW[7] },
        8:  { cellWidth: CW[8],  halign: 'right' },
        9:  { cellWidth: CW[9],  halign: 'center' },
        10: { cellWidth: CW[10], halign: 'right' },
        11: { cellWidth: CW[11], halign: 'right' },
        12: { cellWidth: CW[12], halign: 'right' },
        13: { cellWidth: CW[13], halign: 'right' },
        14: { cellWidth: CW[14], halign: 'right' },
        15: { cellWidth: CW[15], halign: 'right' },
        16: { cellWidth: CW[16], halign: 'center' },
        17: { cellWidth: CW[17], halign: 'center' },
        18: { cellWidth: CW[18], halign: 'right' },
        19: { cellWidth: CW[19], halign: 'right' },
        20: { cellWidth: CW[20], halign: 'right' },
        21: { cellWidth: CW[21], halign: 'right' },
        22: { cellWidth: CW[22], halign: 'right' },
        23: { cellWidth: CW[23], halign: 'right' },
        24: { cellWidth: CW[24], halign: 'right' },
        25: { cellWidth: CW[25] },
      },
      margin: { left: ML, right: MR, bottom: 12 },
      didDrawPage: () => {},
    })

    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.setTextColor(120)
      doc.text(
        `Generated: ${generatedOn}   |   RVR Projects Pvt Ltd   |   Page ${i} of ${pageCount}`,
        pageW / 2, pageH - 4, { align: 'center' }
      )
      doc.setTextColor(0)
    }

    doc.save(`Utilization_${fileTag}.pdf`)
  }

  const sel = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full'
  const TOT = computeTotals(filteredData)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">Utilization Report</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadExcel}
            disabled={loading || filteredData.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <FileDown size={15} />Download Excel
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={loading || filteredData.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <FileDown size={15} />Download PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <SlidersHorizontal size={12} />Filters
          </div>
          {hasClientFilters && (
            <button onClick={clearClientFilters} className="text-xs text-blue-600 hover:text-blue-800 underline">
              Clear filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
          {/* Date range — spans full width on small screens, 2 cols on md */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">From Date</label>
            <input type="date" value={filters.from} onChange={setF('from')} className={sel} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">To Date</label>
            <input type="date" value={filters.to} onChange={setF('to')} min={filters.from || undefined} className={sel} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Site Name</label>
            <select value={filters.project_code} onChange={setF('project_code')} className={sel}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.code}>{p.code} – {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Ownership Category</label>
            <select value={filters.ownership} onChange={setF('ownership')} className={sel}>
              <option value="">Own &amp; Hire</option>
              <option value="Own">Own</option>
              <option value="Hire">Hire</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Asset Type Group</label>
            <select value={clientFilters.asset_group} onChange={setC('asset_group')} className={sel}>
              <option value="">All Groups</option>
              {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Asset Type</label>
            <select value={clientFilters.eq_type} onChange={setC('eq_type')} className={sel}>
              <option value="">All Types</option>
              {uniqueEqTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Asset Matrix</label>
            <select value={clientFilters.asset_cat} onChange={setC('asset_cat')} className={sel}>
              <option value="">All</option>
              {uniqueAssetCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Manufacturer</label>
            <select value={clientFilters.manufacturer} onChange={setC('manufacturer')} className={sel}>
              <option value="">All Manufacturers</option>
              {uniqueManufacturers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Model</label>
            <select value={clientFilters.model} onChange={setC('model')} className={sel}>
              <option value="">All Models</option>
              {uniqueModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Asset Name</label>
            <input type="text" value={clientFilters.asset_name}
              onChange={setC('asset_name')} placeholder="Search name / Reg.No…"
              className={sel} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Asset Owner</label>
            <select value={clientFilters.owner_name_f} onChange={setC('owner_name_f')} className={sel}>
              <option value="">All Owners</option>
              {uniqueOwnerNames.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Utilization Status</label>
            <select value={clientFilters.util_status} onChange={setC('util_status')} className={sel}>
              <option value="">All Status</option>
              {UTIL_STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {filters.from && filters.to && filters.from > filters.to && (
          <p className="text-xs text-red-600 mt-2">"From" date must be on or before "To" date.</p>
        )}
      </div>

      {/* Report Header — ERP info bar */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-col min-w-[180px]">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Period</span>
          <span className="text-xs font-semibold text-gray-800 mt-0.5">{periodRange}</span>
        </div>
        <div className="w-px h-7 bg-gray-200 hidden sm:block" />
        <div className="flex flex-col min-w-[120px]">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Project</span>
          <span className="text-xs font-semibold text-gray-800 mt-0.5">{projectLabel}</span>
        </div>
        <div className="w-px h-7 bg-gray-200 hidden sm:block" />
        <div className="flex flex-col min-w-[100px]">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Ownership</span>
          <span className="text-xs font-semibold text-gray-800 mt-0.5">{ownerLabel}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-400">
          {loading ? 'Loading…' : `${filteredData.length}${hasClientFilters && filteredData.length !== data.length ? ` of ${data.length}` : ''} machine${filteredData.length !== 1 ? 's' : ''}`}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-800 text-white">
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-center whitespace-nowrap">S.No.</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-left whitespace-nowrap">Nick Name</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-left whitespace-nowrap">Asset Type</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-left whitespace-nowrap">Make/Model</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-left whitespace-nowrap">Reg.No</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-left whitespace-nowrap">Owner / Name</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-center whitespace-nowrap">Shift</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-left whitespace-nowrap">Work Done</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">Fixed Hrs (Period)</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">Working Days</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">Planned Hrs (actual days)</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">Starting Reading</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">Closing Reading</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">Worked Hrs</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">Idle Hrs</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">B/D Hrs</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">% Avail.</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap bg-yellow-400 text-gray-900">% Util.</th>
                <th colSpan={4} className="border border-blue-700 px-2 py-1 text-center">Fuel</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">Total Qty</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">Diesel Avg (L/Hr)</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-right whitespace-nowrap">Fuel Economy (KM/L)</th>
                <th rowSpan={2} className="border border-blue-700 px-2 py-2 text-left whitespace-nowrap">Remarks</th>
              </tr>
              <tr className="bg-blue-700 text-white">
                <th className="border border-blue-600 px-2 py-1 text-right whitespace-nowrap">Opening Bal.</th>
                <th className="border border-blue-600 px-2 py-1 text-right whitespace-nowrap">HSD Issued</th>
                <th className="border border-blue-600 px-2 py-1 text-right whitespace-nowrap">Closing Bal.</th>
                <th className="border border-blue-600 px-2 py-1 text-right whitespace-nowrap">HSD Consumed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!loading && filteredData.length === 0 && (
                <tr>
                  <td colSpan={25} className="px-4 py-10 text-center text-gray-400">
                    {data.length === 0
                      ? (filters.from && filters.to ? `No data for ${periodFrom} to ${periodTo}` : 'Select a date range to load data')
                      : 'No machines match the selected filters'}
                  </td>
                </tr>
              )}
              {filteredData.map((r, i) => {
                const [lhr, kml] = dieselValues(r)
                return (
                  <tr key={r.machine_id} className={i % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-slate-50 hover:bg-blue-50'}>
                    <td className="border border-gray-200 px-2 py-1.5 text-center">{i + 1}</td>
                    <td className="border border-gray-200 px-2 py-1.5 font-medium">
                      <button
                        onClick={() => setDetailMachine({
                          id: r.machine_id, slno: r.slno, nickname: r.nick_name,
                          eq_type: r.eq_type, reg_no: r.reg_no, ownership: r.ownership,
                          shift_type: r.shift_type, capacity: r.capacity,
                          manufacturer: r.manufacturer, model: r.model,
                          project_code: r.project_code,
                        })}
                        className="text-blue-600 hover:text-blue-800 hover:underline text-left font-medium"
                      >
                        {r.nick_name}
                      </button>
                    </td>
                    <td className="border border-gray-200 px-2 py-1.5">{r.asset_type || r.eq_type}</td>
                    <td className="border border-gray-200 px-2 py-1.5">{r.make_model || '—'}</td>
                    <td className="border border-gray-200 px-2 py-1.5">{r.reg_no || '—'}</td>
                    <td className="border border-gray-200 px-2 py-1.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${r.ownership === 'Own' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {r.ownership}
                      </span>
                      <span className="ml-1">{r.owner_name || '—'}</span>
                    </td>
                    <td className="border border-gray-200 px-2 py-1.5 text-center">{r.shift_type}</td>
                    <td className="border border-gray-200 px-2 py-1.5 max-w-[120px] truncate">{r.work_done || '—'}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums">{fmt(r.fixed_hrs_per_month, 0)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums">{r.working_days}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums">{fmt(r.planned_hrs_actual, 2)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums">{fmt(r.starting_reading, 2)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums">{fmt(r.closing_reading, 2)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums font-semibold">{fmt(r.worked_hrs, 2)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums">{fmt(r.idle_hrs, 2)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums">{fmt(r.bd_hrs, 2)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums">{fmt(r.avail_pct, 2)}%</td>
                    <td className={`border border-gray-200 px-2 py-1.5 text-right tabular-nums font-bold ${utilColor(r.util_pct)}`}>
                      {fmt(r.util_pct, 2)}%
                    </td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums text-gray-400">—</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums">{fmt(r.hsd_consumed, 2)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums text-gray-400">—</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums">{fmt(r.hsd_consumed, 2)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums">{fmt(r.hsd_consumed, 2)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums font-medium text-blue-700">
                      {lhr !== '—' ? lhr : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums font-medium text-green-700">
                      {kml !== '—' ? kml : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="border border-gray-200 px-2 py-1.5 text-gray-500 max-w-[160px] truncate">{r.remarks_agg || ''}</td>
                  </tr>
                )
              })}
              {filteredData.length > 0 && (
                <tr className="bg-blue-50 font-bold border-t-2 border-blue-300 text-blue-900">
                  <td colSpan={9} className="border border-blue-200 px-2 py-1.5 text-right">TOTAL</td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right">{TOT.totWorkDays}</td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right">{fmt(TOT.totPlanned, 2)}</td>
                  <td className="border border-blue-200 px-2 py-1.5"></td>
                  <td className="border border-blue-200 px-2 py-1.5"></td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right">{fmt(TOT.totWorked, 2)}</td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right">{fmt(TOT.totIdle, 2)}</td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right">{fmt(TOT.totBd, 2)}</td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right">{fmt(TOT.avgAvail, 2)}%</td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right bg-yellow-100 text-yellow-800">{fmt(TOT.avgUtil, 2)}%</td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right">0</td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right">0</td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right">0</td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right">{fmt(TOT.totHsd, 2)}</td>
                  <td className="border border-blue-200 px-2 py-1.5 text-right">{fmt(TOT.totHsd, 2)}</td>
                  <td className="border border-blue-200 px-2 py-1.5"></td>
                  <td className="border border-blue-200 px-2 py-1.5"></td>
                  <td className="border border-blue-200 px-2 py-1.5"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {detailMachine && (
        <MachineDetailPanel machine={detailMachine} onClose={() => setDetailMachine(null)} />
      )}
    </div>
  )
}
