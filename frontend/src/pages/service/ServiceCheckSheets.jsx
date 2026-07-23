import { useState, useEffect, useCallback } from 'react'
import {
  Search, X, Loader2, ClipboardCheck, CheckCircle, Download,
} from 'lucide-react'
import {
  getMachines, getMachineScs, getLatestReadingBefore,
  getScsTransactions, createScsTransaction,
} from '../../lib/api'

const todayStr = () => new Date().toISOString().slice(0, 10)

const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Download helpers ──────────────────────────────────────────────────────────

function scsHtml(tx) {
  const n  = (v, dec = 1) => v != null ? parseFloat(v).toFixed(dec) : '—'
  const d  = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const dt = (v) => v ? new Date(v).toLocaleString('en-IN') : '—'
  const val = (v) => v || '—'

  const execH   = tx.execution_hours != null ? parseFloat(tx.execution_hours) : null
  const prevH   = tx.prev_hours      != null ? parseFloat(tx.prev_hours)      : null
  const recH    = tx.recommended_hours ? parseInt(tx.recommended_hours) : null
  const execKm  = tx.execution_km    != null ? parseFloat(tx.execution_km)    : null
  const prevKm  = tx.prev_km         != null ? parseFloat(tx.prev_km)         : null
  const recKm   = tx.recommended_km  ? parseInt(tx.recommended_km) : null
  const recDays = tx.recommended_days ? parseInt(tx.recommended_days) : null

  const intH    = execH  != null && prevH  != null ? Math.round((execH  - prevH)  * 10) / 10 : null
  const devH    = intH   != null && recH   != null ? Math.round((intH   - recH)   * 10) / 10 : null
  const pctH    = intH   != null && recH   != null ? (intH / recH * 100).toFixed(1) : null
  const intKm   = execKm != null && prevKm != null ? Math.round(execKm - prevKm)              : null
  const devKm   = intKm  != null && recKm  != null ? Math.round(intKm  - recKm)               : null
  const pctKm   = intKm  != null && recKm  != null ? (intKm / recKm * 100).toFixed(1)         : null
  const intDays = tx.prev_date && tx.execution_date
    ? Math.ceil((new Date(tx.execution_date) - new Date(tx.prev_date)) / 86400000) : null
  const devDays = intDays != null && recDays != null ? intDays - recDays   : null
  const pctDays = intDays != null && recDays != null ? (intDays / recDays * 100).toFixed(1) : null

  const showH    = recH    != null || execH   != null || prevH   != null
  const showKm   = recKm   != null || execKm  != null || prevKm  != null
  const showDays = recDays != null || intDays != null

  const devLabel = (v, suffix = '') => v != null ? (v > 0 ? '+' : '') + v + suffix : '—'
  const pctLabel = (v) => v != null ? v + '%' : '—'

  const intRow = (label, prev, curr, interval, recommended, deviation, pct) => `
    <tr>
      <td style="font-weight:600;background:#f8f9fa;padding:6px 10px">${label}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${prev ?? '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${curr ?? '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;font-weight:600">${interval ?? '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:#555">${recommended ?? '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;font-weight:600;color:${deviation != null && parseFloat(deviation) > 0 ? '#dc2626' : '#16a34a'}">${deviation ?? '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;font-weight:600;color:${pct != null && parseFloat(pct) >= 100 ? '#dc2626' : pct != null && parseFloat(pct) >= 80 ? '#d97706' : '#16a34a'}">${pct ?? '—'}</td>
    </tr>`

  const row = (label, value) => `
    <tr>
      <td style="padding:6px 10px;color:#6b7280;font-size:12px;width:200px">${label}</td>
      <td style="padding:6px 10px;font-size:12px;font-weight:500">${value}</td>
    </tr>`

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>SCS – ${tx.transaction_no || tx.scs_name}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; margin: 0; padding: 24px; color: #111; }
  h1   { font-size: 18px; margin: 0 0 2px; }
  h2   { font-size: 12px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 1px;
         border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 20px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  tr:nth-child(even) td { background: #fafafa; }
  th   { background: #1f2937; color: #fff; padding: 7px 10px; font-size: 11px;
         text-transform: uppercase; letter-spacing: .5px; text-align: left; }
  th.r { text-align: right; }
  .header { display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 2px solid #1f2937; padding-bottom: 12px; margin-bottom: 16px; }
  .badge  { background: #dcfce7; color: #166534; font-size: 11px; font-weight: 700;
            padding: 3px 10px; border-radius: 20px; }
  .mono   { font-family: monospace; font-size: 13px; }
</style></head><body>

<div class="header">
  <div>
    <p style="font-size:11px;color:#6b7280;margin:0 0 4px">SERVICE CHECKSHEET EXECUTION RECORD</p>
    <h1>${val(tx.scs_name)}</h1>
    <p style="margin:4px 0 0;font-size:12px;color:#555">
      ${val(tx.nickname || tx.machine_slno)} &nbsp;|&nbsp; ${val(tx.eq_type)}
      ${tx.project_code ? ' &nbsp;|&nbsp; ' + tx.project_code : ''}
    </p>
  </div>
  <div style="text-align:right">
    <p class="mono" style="color:#1d4ed8;font-weight:700;margin:0">${tx.transaction_no || '(Legacy)'}</p>
    <p style="margin:4px 0 0;font-size:12px;color:#555">Executed: ${d(tx.execution_date)}</p>
    <span class="badge">Done</span>
  </div>
</div>

<h2>A. Service CheckSheet Details</h2>
<table>
  ${row('SCS Name',            val(tx.scs_name))}
  ${row('Description',         val(tx.scs_description))}
  ${row('Section',             val(tx.scs_section))}
  ${row('Sub-Section',         val(tx.scs_sub_section))}
  ${row('Asset',               val(tx.nickname || tx.machine_slno))}
  ${row('Asset Type',          val(tx.eq_type))}
  ${row('Project',             tx.project_code ? tx.project_code + (tx.project_name ? ' — ' + tx.project_name : '') : '—')}
  ${row('Ticket / WO Ref.',    val(tx.ticket_ref))}
  ${row('Remark',              val(tx.remark))}
  ${row('Parameter',           val(tx.parameter))}
  ${row('Executed Parameter',  val(tx.executed_parameter))}
  ${row('Execution Site',      val(tx.execution_site))}
  ${execH  != null ? row('Counter — Hours', n(execH, 1) + ' Hr') : ''}
  ${execKm != null ? row('Counter — KM',    n(execKm, 0) + ' KM') : ''}
</table>

${showH || showKm || showDays ? `
<h2>B. Execution Interval Analysis</h2>
<table>
  <thead><tr>
    <th>Type</th><th class="r">Previous</th><th class="r">Current</th>
    <th class="r">Exec. Interval</th><th class="r">Recommended</th>
    <th class="r">Deviation</th><th class="r">Exec. %</th>
  </tr></thead>
  <tbody>
    ${showH    ? intRow('Hours',
        prevH  != null ? n(prevH,  1) + ' Hr'  : null,
        execH  != null ? n(execH,  1) + ' Hr'  : null,
        intH   != null ? n(intH,   1) + ' Hr'  : null,
        recH   ? recH + ' Hr'  : null,
        devH != null ? devLabel(n(devH, 1), ' Hr') : null, pctLabel(pctH)) : ''}
    ${showKm   ? intRow('KM',
        prevKm  != null ? n(prevKm, 0) + ' KM' : null,
        execKm  != null ? n(execKm, 0) + ' KM' : null,
        intKm   != null ? intKm + ' KM'        : null,
        recKm   ? recKm + ' KM'  : null,
        devKm != null ? devLabel(devKm, ' KM') : null, pctLabel(pctKm)) : ''}
    ${showDays ? intRow('Days',
        d(tx.prev_date), d(tx.execution_date),
        intDays != null ? intDays + ' days'    : null,
        recDays ? recDays + ' days' : null,
        devDays != null ? devLabel(devDays, ' days') : null, pctLabel(pctDays)) : ''}
  </tbody>
</table>` : ''}

<h2>C. Transaction Details</h2>
<table>
  ${tx.transaction_no ? row('Transaction No.', `<span class="mono" style="color:#1d4ed8">${tx.transaction_no}</span>`) : ''}
  ${row('Execution Date', d(tx.execution_date))}
  ${row('Executed By',    val(tx.executed_by_name))}
  ${row('Entered By',     val(tx.created_by_name))}
  ${tx.created_at ? row('Date of Entry', dt(tx.created_at)) : ''}
  ${tx.updated_by_name ? row('Updated By', tx.updated_by_name) : ''}
  ${tx.updated_at      ? row('Updated At', dt(tx.updated_at))  : ''}
</table>

<p style="margin-top:32px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px">
  Generated ${new Date().toLocaleString('en-IN')} &nbsp;|&nbsp; PnM DPR
</p>
</body></html>`
}

function downloadScs(tx) {
  const html = scsHtml(tx)
  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const name = tx.transaction_no
    ? `SCS_${tx.transaction_no.replace(/\//g, '-')}.doc`
    : `SCS_${(tx.scs_name || 'record').replace(/\s+/g, '_')}_${tx.execution_date || ''}.doc`
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionTitle({ label }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">{label}</span>
      <div className="flex-1 border-t border-gray-200" />
    </div>
  )
}

function InfoRow({ label, value, mono, highlight }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="w-48 flex-shrink-0 text-xs text-gray-400 font-medium pt-0.5">{label}</span>
      <span className={`text-xs flex-1 font-medium ${highlight ? 'text-blue-700 font-mono' : mono ? 'font-mono text-gray-700' : 'text-gray-800'}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}

// ── Interval table row ────────────────────────────────────────────────────────

function IntRow({ label, prev, curr, interval, recommended, deviation, pct }) {
  const dv = parseFloat(deviation)
  const pc = parseFloat(pct)
  const devColor = isNaN(dv) ? '' : dv > 0 ? 'text-red-600' : 'text-green-600'
  const pctColor = isNaN(pc) ? '' : pc >= 100 ? 'text-red-600' : pc >= 80 ? 'text-amber-600' : 'text-green-600'
  const devLabel = !isNaN(dv) ? (dv > 0 ? '+' : '') + deviation : 'N/A'
  const pctLabel = !isNaN(pc) ? pc.toFixed(1) + '%' : 'N/A'

  return (
    <tr className="text-xs border-b border-gray-100 last:border-0">
      <td className="py-2.5 px-3 font-semibold text-gray-600 bg-gray-50 w-16">{label}</td>
      <td className="py-2.5 px-3 text-gray-700 font-mono text-right">{prev ?? 'N/A'}</td>
      <td className="py-2.5 px-3 text-gray-700 font-mono text-right">{curr ?? 'N/A'}</td>
      <td className="py-2.5 px-3 text-gray-700 font-mono text-right font-semibold">{interval ?? 'N/A'}</td>
      <td className="py-2.5 px-3 text-gray-500 font-mono text-right">{recommended ?? 'N/A'}</td>
      <td className={`py-2.5 px-3 font-mono text-right font-semibold ${devColor}`}>{devLabel}</td>
      <td className={`py-2.5 px-3 font-mono text-right font-semibold ${pctColor}`}>{pctLabel}</td>
    </tr>
  )
}

// ── Left-panel list item ──────────────────────────────────────────────────────

function TxListItem({ tx, selected, onClick }) {
  const isLegacy = !tx.transaction_no
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors
        ${selected ? 'bg-blue-50 border-l-2 border-l-blue-600' : 'border-l-2 border-l-transparent'}`}>
      {isLegacy
        ? <p className="text-[11px] text-gray-400 italic">Legacy record</p>
        : <p className="text-[11px] font-mono text-blue-700 font-bold">{tx.transaction_no}</p>}
      <p className="text-xs font-semibold text-gray-800 mt-0.5 truncate">{tx.scs_name || '—'}</p>
      <p className="text-[10px] text-gray-400 mt-0.5 truncate">
        {tx.nickname || tx.machine_slno} • {fmtDate(tx.execution_date)}
      </p>
    </button>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function TransactionDetail({ tx }) {
  const execH   = tx.execution_hours != null ? parseFloat(tx.execution_hours) : null
  const prevH   = tx.prev_hours      != null ? parseFloat(tx.prev_hours)      : null
  const recH    = tx.recommended_hours ? parseInt(tx.recommended_hours) : null
  const execKm  = tx.execution_km    != null ? parseFloat(tx.execution_km)    : null
  const prevKm  = tx.prev_km         != null ? parseFloat(tx.prev_km)         : null
  const recKm   = tx.recommended_km  ? parseInt(tx.recommended_km) : null
  const recDays = tx.recommended_days ? parseInt(tx.recommended_days) : null

  const intH    = execH   != null && prevH   != null ? Math.round((execH  - prevH)  * 10) / 10 : null
  const devH    = intH    != null && recH    != null ? Math.round((intH   - recH)   * 10) / 10 : null
  const pctH    = intH    != null && recH    != null ? (intH / recH * 100)                      : null

  const intKm   = execKm  != null && prevKm  != null ? Math.round(execKm - prevKm)              : null
  const devKm   = intKm   != null && recKm   != null ? Math.round(intKm  - recKm)               : null
  const pctKm   = intKm   != null && recKm   != null ? (intKm / recKm * 100)                    : null

  const intDays = tx.prev_date && tx.execution_date
    ? Math.ceil((new Date(tx.execution_date) - new Date(tx.prev_date)) / 86400000)
    : null
  const devDays = intDays != null && recDays != null ? intDays - recDays   : null
  const pctDays = intDays != null && recDays != null ? (intDays / recDays * 100) : null

  const showH    = recH    != null || execH   != null || prevH   != null
  const showKm   = recKm   != null || execKm  != null || prevKm  != null
  const showDays = recDays != null || intDays != null

  return (
    <div className="p-5 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {tx.transaction_no
            ? <p className="font-mono text-blue-700 text-xs font-bold">{tx.transaction_no}</p>
            : <p className="text-[11px] text-gray-400 italic">Legacy record — no transaction number</p>}
          <h3 className="text-base font-bold text-gray-900 mt-1">{tx.scs_name || '—'}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {tx.nickname || tx.machine_slno}{tx.eq_type ? ` — ${tx.eq_type}` : ''}
            {tx.project_code ? ` | ${tx.project_code}` : ''}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-800 text-xs font-semibold rounded-full flex-shrink-0">
          <CheckCircle size={11} /> Done
        </span>
      </div>

      {/* Section A */}
      <div>
        <SectionTitle label="A. Service CheckSheet Details" />
        <div className="bg-white rounded-xl border border-gray-200 px-4 divide-y divide-gray-50">
          <InfoRow label="SCS Name"            value={tx.scs_name} />
          <InfoRow label="Description"         value={tx.scs_description} />
          <InfoRow label="Section"             value={tx.scs_section} />
          <InfoRow label="Sub-Section"         value={tx.scs_sub_section} />
          <InfoRow label="Asset"               value={tx.nickname || tx.machine_slno} />
          <InfoRow label="Asset Type"          value={tx.eq_type} />
          <InfoRow label="Project"             value={tx.project_code ? `${tx.project_code}${tx.project_name ? ' — ' + tx.project_name : ''}` : null} />
          <InfoRow label="Ticket / WO Ref."    value={tx.ticket_ref} />
          <InfoRow label="Remark"              value={tx.remark} />
          <InfoRow label="Parameter"           value={tx.parameter} />
          <InfoRow label="Executed Parameter"  value={tx.executed_parameter} />
          <InfoRow label="Execution Site"      value={tx.execution_site} />
          {execH  != null && <InfoRow label="Counter — Hours" value={`${execH.toFixed(1)} Hr`}  mono />}
          {execKm != null && <InfoRow label="Counter — KM"    value={`${execKm.toFixed(0)} KM`} mono />}
        </div>
      </div>

      {/* Section B */}
      {(showH || showKm || showDays) && (
        <div>
          <SectionTitle label="B. Execution Interval Analysis" />
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-max">
              <thead>
                <tr className="bg-gray-50 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left w-16">Type</th>
                  <th className="px-3 py-2.5 text-right">Previous</th>
                  <th className="px-3 py-2.5 text-right">Current</th>
                  <th className="px-3 py-2.5 text-right">Exec. Interval</th>
                  <th className="px-3 py-2.5 text-right">Recommended</th>
                  <th className="px-3 py-2.5 text-right">Deviation</th>
                  <th className="px-3 py-2.5 text-right">Exec. %</th>
                </tr>
              </thead>
              <tbody>
                {showH && (
                  <IntRow label="Hours"
                    prev={prevH  != null ? prevH.toFixed(1)  + ' Hr'   : null}
                    curr={execH  != null ? execH.toFixed(1)  + ' Hr'   : null}
                    interval={intH  != null ? intH.toFixed(1)  + ' Hr' : null}
                    recommended={recH    ? recH    + ' Hr'   : null}
                    deviation={devH} pct={pctH} />
                )}
                {showKm && (
                  <IntRow label="KM"
                    prev={prevKm  != null ? prevKm.toFixed(0)  + ' KM' : null}
                    curr={execKm  != null ? execKm.toFixed(0)  + ' KM' : null}
                    interval={intKm   != null ? intKm + ' KM'          : null}
                    recommended={recKm     ? recKm    + ' KM'          : null}
                    deviation={devKm} pct={pctKm} />
                )}
                {showDays && (
                  <IntRow label="Days"
                    prev={fmtDate(tx.prev_date)}
                    curr={fmtDate(tx.execution_date)}
                    interval={intDays  != null ? intDays + ' days'     : null}
                    recommended={recDays  ? recDays + ' days'          : null}
                    deviation={devDays} pct={pctDays} />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section C */}
      <div>
        <SectionTitle label="C. Transaction Details" />
        <div className="bg-white rounded-xl border border-gray-200 px-4 divide-y divide-gray-50">
          {tx.transaction_no && <InfoRow label="Transaction No."  value={tx.transaction_no} highlight />}
          <InfoRow label="Execution Date"   value={fmtDate(tx.execution_date)} />
          <InfoRow label="Executed By"      value={tx.executed_by_name} />
          <InfoRow label="Entered By"       value={tx.created_by_name} />
          {tx.created_at && <InfoRow label="Date of Entry" value={new Date(tx.created_at).toLocaleString('en-IN')} />}
          {tx.updated_by_name && <InfoRow label="Updated By"   value={tx.updated_by_name} />}
          {tx.updated_at      && <InfoRow label="Updated At"   value={new Date(tx.updated_at).toLocaleString('en-IN')} />}
        </div>
      </div>
    </div>
  )
}

// ── New Transaction Modal ─────────────────────────────────────────────────────

function NewTxModal({ onClose, onSaved }) {
  const [machines,     setMachines]     = useState([])
  const [scsList,      setScsList]      = useState([])
  const [machineId,    setMachineId]    = useState('')
  const [machineScsId, setMachineScsId] = useState('')
  const [selectedScs,  setSelectedScs]  = useState(null)
  const [currentHours, setCurrentHours] = useState(null)
  const [currentKm,    setCurrentKm]    = useState(null)
  const [fetchingR,    setFetchingR]    = useState(false)
  const [form, setForm] = useState({
    execution_date:     todayStr(),
    ticket_ref:         '',
    remark:             '',
    parameter:          '',
    executed_parameter: '',
    execution_site:     '',
  })
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')
  const [machinesLoading, setMachinesLoading] = useState(true)

  useEffect(() => {
    setMachinesLoading(true)
    getMachines()
      .then(r => setMachines(r.data.data || r.data || []))
      .catch(() => {})
      .finally(() => setMachinesLoading(false))
  }, [])

  useEffect(() => {
    if (!machineId) { setScsList([]); setMachineScsId(''); setSelectedScs(null); return }
    getMachineScs({ machine_id: machineId })
      .then(r => {
        setScsList(r.data.data || [])
        setCurrentHours(r.data.current_hours ?? null)
        setCurrentKm(r.data.current_km ?? null)
      })
      .catch(() => {})
  }, [machineId])

  useEffect(() => {
    setSelectedScs(scsList.find(s => String(s.id) === String(machineScsId)) || null)
  }, [machineScsId, scsList])

  useEffect(() => {
    if (!machineId || !form.execution_date) return
    setFetchingR(true)
    getLatestReadingBefore({ machine_id: machineId, before_date: form.execution_date })
      .then(r => {
        const entry = r.data?.data
        setCurrentHours(entry?.r1_close ?? null)
        setCurrentKm(entry?.r2_close ?? null)
      })
      .catch(() => {})
      .finally(() => setFetchingR(false))
  }, [machineId, form.execution_date])

  useEffect(() => {
    if (!machineId) return
    const m = machines.find(m => String(m.id) === String(machineId))
    if (m?.project_code) {
      setForm(f => ({
        ...f,
        execution_site: m.project_code + (m.project_name ? ` (${m.project_name})` : ''),
      }))
    }
  }, [machineId, machines])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Live calculations
  const prevH   = selectedScs?.last_done_hours != null ? parseFloat(selectedScs.last_done_hours) : null
  const prevKm  = selectedScs?.last_done_km    != null ? parseFloat(selectedScs.last_done_km)    : null
  const prevDate = selectedScs?.last_done_date ?? null
  const execH   = currentHours != null ? parseFloat(currentHours) : null
  const execKm  = currentKm    != null ? parseFloat(currentKm)    : null
  const recH    = selectedScs?.interval_hours ? parseInt(selectedScs.interval_hours) : null
  const recKm   = selectedScs?.interval_km    ? parseInt(selectedScs.interval_km)    : null
  const recDays = selectedScs?.interval_days  ? parseInt(selectedScs.interval_days)  : null

  const intH    = execH  != null && prevH  != null ? Math.round((execH  - prevH)  * 10) / 10 : null
  const intKm   = execKm != null && prevKm != null ? Math.round(execKm - prevKm)              : null
  const intDays = prevDate && form.execution_date
    ? Math.ceil((new Date(form.execution_date) - new Date(prevDate)) / 86400000) : null

  const devH    = intH    != null && recH    != null ? Math.round((intH    - recH)    * 10) / 10 : null
  const devKm   = intKm   != null && recKm   != null ? Math.round(intKm   - recKm)               : null
  const devDays = intDays != null && recDays != null ? intDays - recDays                          : null

  const pctH    = intH    != null && recH    != null ? (intH    / recH    * 100) : null
  const pctKm   = intKm   != null && recKm   != null ? (intKm   / recKm   * 100) : null
  const pctDays = intDays != null && recDays != null ? (intDays / recDays * 100) : null

  const showCalc = selectedScs && (recH || recKm || recDays || execH || execKm)
  const showH    = !!(recH    || execH   || prevH)
  const showKmC  = !!(recKm   || execKm  || prevKm)
  const showDC   = !!(recDays || intDays)

  const devLabel = (d) => d != null ? (d > 0 ? '+' : '') + d : '—'
  const pctLabel = (p) => p != null ? p.toFixed(1) + '%' : '—'
  const pctCls   = (p) => p == null ? '' : p >= 100 ? 'text-red-600' : p >= 80 ? 'text-amber-600' : 'text-green-600'
  const devCls   = (d) => d == null ? '' : d > 0 ? 'text-red-600' : 'text-green-600'

  const save = async () => {
    if (!machineId || !machineScsId || !form.execution_date) {
      setError('Please select asset, SCS and execution date.')
      return
    }
    setSaving(true); setError('')
    try {
      await createScsTransaction({
        machine_scs_id:     parseInt(machineScsId),
        execution_date:     form.execution_date,
        execution_hours:    execH,
        execution_km:       execKm,
        ticket_ref:         form.ticket_ref         || null,
        remark:             form.remark             || null,
        parameter:          form.parameter          || null,
        executed_parameter: form.executed_parameter || null,
        execution_site:     form.execution_site     || null,
      })
      onSaved()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save transaction')
    } finally {
      setSaving(false)
    }
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-green-700 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={15} className="text-green-200" />
            <h2 className="text-sm font-bold text-white">New SCS Transaction</h2>
          </div>
          <button onClick={onClose} className="text-green-200 hover:text-white"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Asset + SCS */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1">Asset *</label>
              <select value={machineId} onChange={e => setMachineId(e.target.value)} className={inp}>
                <option value="">{machinesLoading ? 'Loading…' : '— Select Asset —'}</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.nickname || m.slno}{m.project_code ? ` [${m.project_code}]` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1">Service CheckSheet *</label>
              <select value={machineScsId} onChange={e => setMachineScsId(e.target.value)} className={inp} disabled={!machineId}>
                <option value="">— Select SCS —</option>
                {scsList.map(s => (
                  <option key={s.id} value={s.id}>{s.custom_name || s.check_sheet_name || `SCS #${s.id}`}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Execution Date *</label>
            <input type="date" value={form.execution_date} max={todayStr()}
              onChange={e => set('execution_date', e.target.value)}
              className={inp} />
          </div>

          {/* Auto-fetched readings */}
          {machineId && (
            <div className={`rounded-xl border p-4 ${fetchingR ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600">Meter Readings (from DPR Log)</p>
                {fetchingR && <Loader2 size={12} className="animate-spin text-blue-500" />}
              </div>
              {fetchingR ? (
                <p className="text-xs text-blue-500">Fetching DPR reading…</p>
              ) : execH == null && execKm == null ? (
                <p className="text-xs text-amber-600">No DPR entry found for or before this date.</p>
              ) : (
                <div className="flex gap-6">
                  {execH  != null && <p className="text-sm font-bold text-blue-700"><span className="text-xs font-normal text-gray-500 mr-1">Hours:</span>{execH.toFixed(1)} Hr</p>}
                  {execKm != null && <p className="text-sm font-bold text-green-700"><span className="text-xs font-normal text-gray-500 mr-1">KM:</span>{execKm.toFixed(0)}</p>}
                </div>
              )}
            </div>
          )}

          {/* Live interval preview */}
          {showCalc && (
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
              <p className="text-xs font-semibold text-purple-700 mb-2.5">Interval Preview</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-400 text-[9px] uppercase tracking-wider">
                      <th className="text-left pr-3 py-1 w-16">Type</th>
                      <th className="text-right pr-3">Prev</th>
                      <th className="text-right pr-3">Current</th>
                      <th className="text-right pr-3">Interval</th>
                      <th className="text-right pr-3">Recommended</th>
                      <th className="text-right pr-3">Deviation</th>
                      <th className="text-right">Exec %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showH && (
                      <tr className="border-t border-purple-100">
                        <td className="py-1.5 pr-3 font-semibold text-purple-700">Hours</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{prevH  != null ? prevH.toFixed(1)  : '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{execH  != null ? execH.toFixed(1)  : '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono font-semibold">{intH   != null ? intH.toFixed(1)   : '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-gray-500">{recH   ?? '—'}</td>
                        <td className={`py-1.5 pr-3 text-right font-mono font-semibold ${devCls(devH)}`}>{devLabel(devH != null ? devH.toFixed(1) : null)}</td>
                        <td className={`py-1.5 text-right font-mono font-semibold ${pctCls(pctH)}`}>{pctLabel(pctH)}</td>
                      </tr>
                    )}
                    {showKmC && (
                      <tr className="border-t border-purple-100">
                        <td className="py-1.5 pr-3 font-semibold text-purple-700">KM</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{prevKm  != null ? prevKm.toFixed(0)  : '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{execKm  != null ? execKm.toFixed(0)  : '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono font-semibold">{intKm   != null ? intKm   : '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-gray-500">{recKm   ?? '—'}</td>
                        <td className={`py-1.5 pr-3 text-right font-mono font-semibold ${devCls(devKm)}`}>{devLabel(devKm)}</td>
                        <td className={`py-1.5 text-right font-mono font-semibold ${pctCls(pctKm)}`}>{pctLabel(pctKm)}</td>
                      </tr>
                    )}
                    {showDC && (
                      <tr className="border-t border-purple-100">
                        <td className="py-1.5 pr-3 font-semibold text-purple-700">Days</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{fmtDate(prevDate)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{fmtDate(form.execution_date)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono font-semibold">{intDays != null ? intDays + 'd' : '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-gray-500">{recDays ? recDays + 'd' : '—'}</td>
                        <td className={`py-1.5 pr-3 text-right font-mono font-semibold ${devCls(devDays)}`}>{devLabel(devDays != null ? devDays + 'd' : null)}</td>
                        <td className={`py-1.5 text-right font-mono font-semibold ${pctCls(pctDays)}`}>{pctLabel(pctDays)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Additional fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1">Ticket / WO Ref.</label>
              <input value={form.ticket_ref} onChange={e => set('ticket_ref', e.target.value)}
                className={inp} placeholder="e.g. WO-2026-00123" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1">Execution Site</label>
              <input value={form.execution_site} onChange={e => set('execution_site', e.target.value)}
                className={inp} placeholder="Project / Site" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1">Parameter</label>
              <input value={form.parameter} onChange={e => set('parameter', e.target.value)}
                className={inp} placeholder="Expected value" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1">Executed Parameter</label>
              <input value={form.executed_parameter} onChange={e => set('executed_parameter', e.target.value)}
                className={inp} placeholder="Actual value" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Remark</label>
            <textarea rows={2} value={form.remark} onChange={e => set('remark', e.target.value)}
              placeholder="Notes about this execution…"
              className={inp + ' resize-none'} />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl flex-shrink-0">
          <button onClick={save}
            disabled={saving || !machineId || !machineScsId || !form.execution_date}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white font-semibold rounded-lg text-sm">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
            {saving ? 'Saving…' : 'Save Transaction'}
          </button>
          <button onClick={onClose}
            className="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ServiceCheckSheets() {
  const [transactions, setTransactions] = useState([])
  const [selected,     setSelected]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [showNew,      setShowNew]      = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getScsTransactions()
      .then(r => setTransactions(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = transactions.filter(tx => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (tx.transaction_no || '').toLowerCase().includes(q) ||
      (tx.scs_name       || '').toLowerCase().includes(q) ||
      (tx.nickname       || '').toLowerCase().includes(q) ||
      (tx.machine_slno   || '').toLowerCase().includes(q) ||
      (tx.eq_type        || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      {/* Left panel */}
      <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        {/* Panel header */}
        <div className="px-3 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-1.5 mb-2.5">
            <ClipboardCheck size={13} className="text-green-700" />
            <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide">SCS Transactions</h2>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name / asset…"
              className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Transaction list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={18} className="animate-spin text-gray-300" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardCheck size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">{search ? 'No results found' : 'No transactions yet'}</p>
            </div>
          ) : (
            filtered.map(tx => (
              <TxListItem key={tx.id} tx={tx}
                selected={selected?.id === tx.id}
                onClick={() => setSelected(tx)} />
            ))
          )}
        </div>

        <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] text-gray-400">
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => selected && downloadScs(selected)}
            disabled={!selected}
            title={selected ? `Download ${selected.transaction_no || selected.scs_name}` : 'Select a record to download'}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors
              disabled:opacity-30 disabled:cursor-not-allowed
              enabled:bg-gray-100 enabled:hover:bg-blue-50 enabled:hover:text-blue-700 text-gray-600">
            <Download size={12} /> Download
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <TransactionDetail key={selected.id} tx={selected} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-300">
            <ClipboardCheck size={48} className="mb-3" />
            <p className="text-sm font-medium text-gray-400">Select a transaction to view details</p>
            <p className="text-xs mt-1 text-gray-400">
              or click <span className="font-semibold text-green-600">+ New</span> to record an execution
            </p>
          </div>
        )}
      </div>

      {showNew && (
        <NewTxModal
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load() }}
        />
      )}
    </div>
  )
}
