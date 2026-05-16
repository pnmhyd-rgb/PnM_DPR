import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getProjects, getEntries, createEntry, updateEntry, getPreviousClosing, getDprStatus,
} from '../lib/api'
import { today } from '../lib/utils'
import {
  CheckCircle2, Clock, ChevronLeft, ChevronRight,
  X, CalendarDays, CheckCircle, AlertCircle, Loader2, RefreshCw, Search, Lock, Pencil,
} from 'lucide-react'
import DPRDownloadModal from './DPRDownloadModal'

const MIN_OPTIONS = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54]

const emptyForm = {
  shift: '',
  r1_open: '', r1_close: '',
  r2_open: '', r2_close: '',
  hsd: '',
  breakdown_hrs: '', breakdown_min: '0',
  qty: '', work_done: '',
  n_r1_close: '', n_r2_close: '',
  n_hsd: '',
  n_breakdown_hrs: '', n_breakdown_min: '0',
  n_qty: '', n_work_done: '',
  remarks: '',
}

const SHIFT_MAX = 12
const MONTHS    = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December']
const MONTH_ABR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const pad       = n => String(n).padStart(2, '0')

function brkHrsToDecimal(hrs, min) {
  return parseFloat(hrs || 0) + parseInt(min || 0) / 60
}

function decimalToHrsMin(dec) {
  const total = parseFloat(dec || 0)
  const h     = Math.floor(total)
  const rawM  = Math.round((total - h) * 60)
  const m     = Math.min(Math.round(rawM / 6) * 6, 54)
  return { hrs: String(h), min: String(m) }
}

function checkEntryTiming(entryDate, shift) {
  if (!shift) return { allowed: true }
  const [y, m, d]  = entryDate.split('-').map(Number)
  const now         = new Date()
  const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const entryDay    = new Date(y, m - 1, d, 0, 0, 0)
  if (entryDay > todayStart) return { allowed: false, message: 'Cannot enter DPR for a future date.' }
  const earliest = shift === 'Day Shift'
    ? new Date(y, m - 1, d, 20, 0, 0)
    : new Date(y, m - 1, d + 1, 8, 0, 0)
  if (now < earliest) {
    const isPrevDay = entryDay < todayStart
    if (shift === 'Day Shift')
      return { allowed: false, message: 'Day Shift DPR can be entered only after 8:00 PM.', earliest }
    if (isPrevDay)
      return { allowed: false, message: "Previous day's DPR entry is allowed only after 8:00 AM.", earliest }
    return { allowed: false, message: 'Night Shift DPR can be entered only after 8:00 AM (next day).', earliest }
  }
  return { allowed: true }
}

function buildEditForm(machine, dayEntry, nightEntry) {
  const isDual         = machine.shift_type === 'Dual Shift'
  const isMultiReading = machine.reading_configs?.length > 0
  const configs        = machine.reading_configs || []
  const d = decimalToHrsMin(dayEntry?.breakdown)
  const n = nightEntry ? decimalToHrsMin(nightEntry?.breakdown) : { hrs: '', min: '0' }

  if (isMultiReading) {
    return {
      shift:           isDual ? '' : (dayEntry?.shift || ''),
      readings: configs.map(rc => {
        const log = dayEntry?.reading_logs?.find(l => l.reading_type_id === rc.reading_type_id)
        return { reading_type_id: rc.reading_type_id, code: rc.code, reading_name: rc.reading_name, unit: rc.unit, open_value: log?.open_value != null ? String(log.open_value) : '', close_value: log?.close_value != null ? String(log.close_value) : '' }
      }),
      n_readings: configs.map(rc => {
        const log = nightEntry?.reading_logs?.find(l => l.reading_type_id === rc.reading_type_id)
        return { reading_type_id: rc.reading_type_id, close_value: log?.close_value != null ? String(log.close_value) : '' }
      }),
      hsd:             dayEntry?.hsd != null ? String(dayEntry.hsd) : '',
      breakdown_hrs:   d.hrs,
      breakdown_min:   d.min,
      qty:             dayEntry?.qty != null ? String(dayEntry.qty) : '',
      work_done:       dayEntry?.work_done || '',
      n_hsd:           nightEntry?.hsd != null ? String(nightEntry.hsd) : '',
      n_breakdown_hrs: n.hrs,
      n_breakdown_min: n.min,
      n_qty:           nightEntry?.qty != null ? String(nightEntry.qty) : '',
      n_work_done:     nightEntry?.work_done || '',
      remarks:         dayEntry?.remarks || '',
    }
  }

  return {
    shift:           isDual ? '' : (dayEntry?.shift || ''),
    r1_open:         dayEntry?.r1_open  != null ? String(dayEntry.r1_open)  : '',
    r1_close:        dayEntry?.r1_close != null ? String(dayEntry.r1_close) : '',
    r2_open:         dayEntry?.r2_open  != null ? String(dayEntry.r2_open)  : '',
    r2_close:        dayEntry?.r2_close != null ? String(dayEntry.r2_close) : '',
    hsd:             dayEntry?.hsd != null ? String(dayEntry.hsd) : '',
    breakdown_hrs:   d.hrs,
    breakdown_min:   d.min,
    qty:             dayEntry?.qty != null ? String(dayEntry.qty) : '',
    work_done:       dayEntry?.work_done || '',
    n_r1_close:      nightEntry?.r1_close != null ? String(nightEntry.r1_close) : '',
    n_r2_close:      nightEntry?.r2_close != null ? String(nightEntry.r2_close) : '',
    n_hsd:           nightEntry?.hsd != null ? String(nightEntry.hsd) : '',
    n_breakdown_hrs: n.hrs,
    n_breakdown_min: n.min,
    n_qty:           nightEntry?.qty != null ? String(nightEntry.qty) : '',
    n_work_done:     nightEntry?.work_done || '',
    remarks:         dayEntry?.remarks || '',
  }
}

// ── Inline shift row ──────────────────────────────────────────────────────────

function ShiftRow({
  machine, date, shift,
  existingEntry, dayR1Close, onR1CloseChange,
  dayReadingsClose, onReadingsCloseChange,
  isFirst, rowSpan, onViewMonth,
  onSaved, isAdmin, canAddDpr,
}) {
  const isDualNight    = shift === 'Night Shift' && machine.shift_type === 'Dual Shift'
  const isDualDay      = shift === 'Day Shift'   && machine.shift_type === 'Dual Shift'
  const configs        = machine.reading_configs || []
  const isMultiReading = configs.length > 0

  const buildReadings = (entry) => configs.map(rc => {
    const log = entry?.reading_logs?.find(l => l.reading_type_id === rc.reading_type_id)
    return {
      reading_type_id: rc.reading_type_id,
      code:         rc.code,
      reading_name: rc.reading_name,
      unit:         rc.unit,
      open_value:   log?.open_value  != null ? String(log.open_value)  : '',
      close_value:  log?.close_value != null ? String(log.close_value) : '',
    }
  })

  const initForm = useCallback(() => {
    if (isMultiReading) {
      const { hrs, min } = existingEntry ? decimalToHrsMin(existingEntry.breakdown) : { hrs: '0', min: '0' }
      return {
        shift:         existingEntry?.shift || shift || '',
        readings:      buildReadings(existingEntry),
        hsd:           existingEntry?.hsd != null ? String(existingEntry.hsd) : '',
        breakdown_hrs: hrs, breakdown_min: min,
        qty:           existingEntry?.qty != null ? String(existingEntry.qty) : '',
        work_done:     existingEntry?.work_done || '',
        remarks:       existingEntry?.remarks || '',
      }
    }
    if (existingEntry) {
      const { hrs, min } = decimalToHrsMin(existingEntry.breakdown)
      return {
        shift:         existingEntry.shift || shift || '',
        r1_open:       existingEntry.r1_open  != null ? String(existingEntry.r1_open)  : '',
        r1_close:      existingEntry.r1_close != null ? String(existingEntry.r1_close) : '',
        hsd:           existingEntry.hsd != null ? String(existingEntry.hsd) : '',
        breakdown_hrs: hrs, breakdown_min: min,
        qty:           existingEntry.qty != null ? String(existingEntry.qty) : '',
        work_done:     existingEntry.work_done || '',
        remarks:       existingEntry.remarks || '',
      }
    }
    if (isMultiReading) return { shift: shift || '', readings: buildReadings(null), hsd: '', breakdown_hrs: '0', breakdown_min: '0', qty: '', work_done: '', remarks: '' }
    return { shift: shift || '', r1_open: '', r1_close: '', hsd: '', breakdown_hrs: '0', breakdown_min: '0', qty: '', work_done: '', remarks: '' }
  }, [existingEntry, shift, isMultiReading])

  const [form,          setForm]          = useState(initForm)
  const [saving,        setSaving]        = useState(false)
  const [isSaved,       setIsSaved]       = useState(!!existingEntry)
  const [isEditing,     setIsEditing]     = useState(!existingEntry)
  const [errorMsg,      setErrorMsg]      = useState('')
  const [openingLocked, setOpeningLocked] = useState(false)

  const readOnly = isSaved && !isEditing

  const set = k => e => { if (!readOnly) setForm(f => ({ ...f, [k]: e.target.value })) }
  const setReadingValue = (rtId, field, value) => {
    if (readOnly) return
    setForm(f => ({ ...f, readings: f.readings.map(r => r.reading_type_id === rtId ? { ...r, [field]: value } : r) }))
  }

  // Notify parent of close changes (for Night Shift sync)
  useEffect(() => {
    if (!isDualDay) return
    if (onR1CloseChange) onR1CloseChange(isMultiReading ? '' : form.r1_close)
    if (onReadingsCloseChange && isMultiReading) {
      onReadingsCloseChange(form.readings?.map(r => ({ reading_type_id: r.reading_type_id, close_value: r.close_value })))
    }
  }, [isDualDay, form.r1_close, form.readings, isMultiReading])

  const applyPrevClosing = (prev) => {
    if (isMultiReading && prev?.readings?.length > 0) {
      setForm(f => ({
        ...f,
        readings: f.readings.map(r => {
          const p = prev.readings.find(pr => pr.reading_type_id === r.reading_type_id)
          return p?.close_value != null ? { ...r, open_value: String(p.close_value) } : r
        }),
      }))
      setOpeningLocked(true)
    } else if (!isMultiReading && prev?.r1_close != null) {
      setForm(f => ({ ...f, r1_open: String(prev.r1_close) }))
      setOpeningLocked(true)
    }
  }

  // Auto-fetch for Dual Day Shift (create mode)
  useEffect(() => {
    if (isDualDay && !existingEntry) {
      const timing = checkEntryTiming(date, 'Day Shift')
      if (!timing.allowed) return
      getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: 'Day Shift' })
        .then(r => applyPrevClosing(r.data.data)).catch(() => {})
    }
  }, [machine.id, date, isDualDay, existingEntry])

  const handleShiftChange = async (newShift) => {
    const resetReadings = isMultiReading
      ? buildReadings(null)
      : undefined
    setForm(f => ({ ...f, shift: newShift, r1_open: '', r1_close: '', ...(isMultiReading ? { readings: resetReadings } : {}) }))
    setOpeningLocked(false); setErrorMsg('')
    if (!newShift) return
    const timing = checkEntryTiming(date, newShift)
    if (!timing.allowed) { setErrorMsg(timing.message); return }
    try {
      const r = await getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: newShift })
      applyPrevClosing(r.data.data)
    } catch {}
  }

  const handleCancel = () => { setForm(initForm()); setIsEditing(false); setErrorMsg('') }

  const effectiveShift = shift || form.shift

  // Single-reading totals / validation
  const effectiveOpen  = isDualNight ? (dayR1Close || '') : (form.r1_open || '')
  const r1Total        = effectiveOpen !== '' && form.r1_close !== ''
    ? parseFloat(form.r1_close) - parseFloat(effectiveOpen) : null
  const totalInvalid   = !isMultiReading && r1Total !== null && r1Total < 0
  const totalExceeded  = !isMultiReading && r1Total !== null && r1Total > SHIFT_MAX

  // Multi-reading computed values
  const computedReadings = isMultiReading ? (form.readings || []).map(r => {
    const effOpen = isDualNight
      ? (dayReadingsClose?.find(d => d.reading_type_id === r.reading_type_id)?.close_value || '')
      : r.open_value
    const total = effOpen !== '' && r.close_value !== ''
      ? parseFloat(r.close_value) - parseFloat(effOpen) : null
    return { ...r, effective_open: effOpen, total, invalid: total !== null && total < 0 }
  }) : []
  const anyReadingInvalid = computedReadings.some(r => r.invalid)
  const primaryTotal = computedReadings.find(r => r.unit === 'Hrs')?.total ?? computedReadings[0]?.total ?? null

  const timing  = effectiveShift ? checkEntryTiming(date, effectiveShift) : { allowed: true }
  const isLocked = !existingEntry && !isAdmin && (!canAddDpr || !timing.allowed)

  const handleSave = async () => {
    if (!effectiveShift && !isDualNight) { setErrorMsg('Select a shift'); return }
    if (!existingEntry) {
      const t = checkEntryTiming(date, effectiveShift)
      if (!t.allowed) { setErrorMsg(t.message); return }
    }
    if (!isMultiReading) {
      if (totalInvalid)  { setErrorMsg('Closing HMR must be ≥ Opening HMR'); return }
      if (totalExceeded) { setErrorMsg('Total exceeds 12-hour shift limit'); return }
    } else if (anyReadingInvalid) {
      setErrorMsg('One or more readings have closing < opening value'); return
    }

    const breakdown = brkHrsToDecimal(form.breakdown_hrs, form.breakdown_min)
    const payload = {
      machine_id: machine.id,
      project_id: machine.project_id,
      entry_date: date,
      shift:      effectiveShift,
      ...(isMultiReading ? {
        readings: computedReadings.map(r => ({
          reading_type_id: r.reading_type_id,
          open_value:  r.effective_open || null,
          close_value: r.close_value    || null,
        })),
      } : {
        r1_open:  effectiveOpen || null,
        r1_close: form.r1_close || null,
      }),
      hsd:       form.hsd || null,
      breakdown: breakdown || 0,
      qty:       form.qty || null,
      work_done: form.work_done || null,
      remarks:   form.remarks   || null,
    }

    setSaving(true); setErrorMsg('')
    try {
      if (existingEntry) await updateEntry(existingEntry.id, payload)
      else               await createEntry(payload)
      setIsSaved(true); setIsEditing(false); onSaved()
    } catch (err) {
      setErrorMsg(err.response?.status === 409 ? 'Entry already exists for this shift.' : (err.response?.data?.error || 'Failed to save'))
    } finally { setSaving(false) }
  }

  const thCls   = 'border-b border-r border-gray-100 px-1.5 py-1.5 align-middle'
  const inp     = `border rounded px-1.5 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400`
  const roInp   = `${inp} bg-gray-50 text-gray-600 border-gray-100 cursor-default select-none`
  const editInp = (extra = '') => readOnly ? roInp : `${inp} ${extra}`
  const rowBg   = readOnly ? 'bg-green-50/40' : isSaved ? 'bg-blue-50/30' : isDualNight ? 'bg-indigo-50/20' : 'bg-white'

  return (
    <tr className={`${rowBg} transition-colors`}>
      {isFirst && (
        <td className={`${thCls} text-center w-12`} rowSpan={rowSpan} style={{ background: readOnly ? '#f0fdf4' : '#f9fafb' }}>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-bold text-gray-700">{machine.slno}</span>
            <button onClick={onViewMonth} title="View monthly log"
              className="text-blue-400 hover:text-blue-600 transition-colors p-0.5 rounded hover:bg-blue-100">
              <CalendarDays size={12} />
            </button>
          </div>
        </td>
      )}
      {isFirst && (
        <td className={`${thCls} w-36`} rowSpan={rowSpan} style={{ background: readOnly ? '#f0fdf4' : '#f9fafb' }}>
          <p className="text-xs font-semibold text-gray-800 leading-tight">{machine.eq_type}</p>
          {machine.capacity && <p className="text-[10px] text-gray-400 mt-0.5">{machine.capacity}</p>}
          {machine.reg_no   && <p className="text-[10px] text-gray-400 font-mono">{machine.reg_no}</p>}
          <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${machine.ownership === 'Hire' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
            {machine.ownership}
          </span>
        </td>
      )}

      {/* Shift */}
      <td className={`${thCls} w-24`}>
        {shift ? (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${shift === 'Day Shift' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
            {shift === 'Day Shift' ? 'Day' : 'Night'}
          </span>
        ) : (
          <select value={form.shift} onChange={e => handleShiftChange(e.target.value)}
            className={`${inp} border-gray-200`} disabled={!!existingEntry || readOnly}>
            <option value="">— Shift —</option>
            <option value="Day Shift">Day Shift</option>
            <option value="Night Shift">Night Shift</option>
          </select>
        )}
      </td>

      {/* Readings — multi or single */}
      {isMultiReading ? (
        <td colSpan={3} className={`${thCls} p-0`} style={{ minWidth: 220 }}>
          <div className="divide-y divide-gray-50">
            {computedReadings.map((r, idx) => (
              <div key={r.reading_type_id} className="flex items-center gap-1 px-1.5 py-1">
                <span className="text-[9px] font-mono font-bold text-blue-600 w-14 flex-shrink-0 leading-tight">{r.code}</span>
                <input type="number" step="0.01" placeholder="Open"
                  value={isDualNight ? r.effective_open : r.open_value}
                  readOnly={isDualNight || readOnly || (idx === 0 && openingLocked && !isAdmin)}
                  onChange={!isDualNight && !readOnly ? e => setReadingValue(r.reading_type_id, 'open_value', e.target.value) : undefined}
                  style={{ width: 68 }}
                  className={`border rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 ${
                    isDualNight || readOnly ? 'bg-gray-50 text-gray-500 border-gray-100' :
                    idx === 0 && openingLocked && !isAdmin ? 'bg-amber-50 border-amber-200' : 'border-gray-200'
                  }`}
                />
                <input type="number" step="0.01" placeholder="Close"
                  value={r.close_value}
                  readOnly={readOnly}
                  onChange={!readOnly ? e => setReadingValue(r.reading_type_id, 'close_value', e.target.value) : undefined}
                  style={{ width: 68 }}
                  className={`border rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 ${
                    readOnly ? 'bg-gray-50 text-gray-500 border-gray-100' :
                    r.invalid ? 'border-red-400 bg-red-50' : 'border-gray-200'
                  }`}
                />
                <span className={`text-[10px] font-mono font-bold w-10 text-right flex-shrink-0 ${r.invalid ? 'text-red-600' : r.total !== null && r.total > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
                  {r.total !== null ? r.total.toFixed(1) : '—'}
                </span>
              </div>
            ))}
          </div>
        </td>
      ) : (
        <>
          {/* Start HMR */}
          <td className={`${thCls} w-20`}>
            <input type="number" step="0.01" placeholder="0.00"
              value={isDualNight ? effectiveOpen : form.r1_open}
              onChange={isDualNight || readOnly ? undefined : set('r1_open')}
              readOnly={isDualNight || readOnly || (openingLocked && !isAdmin)}
              className={
                isDualNight || readOnly ? roInp :
                openingLocked && !isAdmin ? `${inp} bg-amber-50 border-amber-200` : `${inp} border-gray-200`
              }
            />
          </td>
          {/* Close HMR */}
          <td className={`${thCls} w-20`}>
            <input type="number" step="0.01" placeholder="0.00"
              value={form.r1_close} onChange={readOnly ? undefined : set('r1_close')}
              readOnly={readOnly}
              className={readOnly ? roInp : `${inp} ${totalInvalid ? 'border-red-400 bg-red-50' : totalExceeded ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}
            />
          </td>
          {/* Total */}
          <td className={`${thCls} w-14 text-center`}>
            <span className={`text-xs font-mono font-bold ${totalInvalid ? 'text-red-600' : totalExceeded ? 'text-amber-600' : r1Total !== null && r1Total > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
              {r1Total !== null ? r1Total.toFixed(2) : '—'}
            </span>
          </td>
        </>
      )}

      {/* HSD */}
      <td className={`${thCls} w-16`}>
        <input type="number" step="0.01" min="0" placeholder="0"
          value={form.hsd} onChange={readOnly ? undefined : set('hsd')}
          readOnly={readOnly} className={editInp('border-gray-200')} />
      </td>

      {/* Bkdn Hrs */}
      <td className={`${thCls} w-14`}>
        <input type="number" min="0" step="1" placeholder="0"
          value={form.breakdown_hrs} onChange={readOnly ? undefined : set('breakdown_hrs')}
          readOnly={readOnly} className={editInp('border-gray-200')} />
      </td>

      {/* Bkdn Min */}
      <td className={`${thCls} w-16`}>
        <select value={form.breakdown_min} onChange={set('breakdown_min')}
          disabled={readOnly} className={editInp('border-gray-200')}>
          {MIN_OPTIONS.map(m => <option key={m} value={m}>{pad(m)}</option>)}
        </select>
      </td>

      {/* Qty */}
      <td className={`${thCls} w-16`}>
        <input type="number" step="0.01" placeholder="—"
          value={form.qty} onChange={readOnly ? undefined : set('qty')}
          readOnly={readOnly} className={editInp('border-gray-200')} />
      </td>

      {/* Work Done */}
      <td className={`${thCls} w-44`}>
        <input type="text" placeholder="Work done…"
          value={form.work_done} onChange={readOnly ? undefined : set('work_done')}
          readOnly={readOnly} className={editInp('border-gray-200')} />
      </td>

      {/* Remarks */}
      <td className={`${thCls} w-28`}>
        <input type="text" placeholder="Remarks"
          value={form.remarks} onChange={readOnly ? undefined : set('remarks')}
          readOnly={readOnly} className={editInp('border-gray-200')} />
      </td>

      {/* Action */}
      <td className={`${thCls} w-28 text-center`}>
        {errorMsg && (
          <p className="text-[10px] text-red-600 mb-1 leading-tight text-left">{errorMsg}</p>
        )}
        {isLocked ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
            {!canAddDpr ? <><Lock size={9} /> Prev pending</> : <><Clock size={9} /> {effectiveShift === 'Day Shift' ? 'After 8 PM' : 'After 8 AM'}</>}
          </span>
        ) : readOnly ? (
          <button onClick={() => setIsEditing(true)}
            className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg w-full bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700 border border-gray-200 hover:border-amber-300 transition-colors">
            <Pencil size={10} /> Edit
          </button>
        ) : (
          <div className="flex flex-col gap-1">
            <button onClick={handleSave} disabled={saving}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg w-full transition-colors disabled:opacity-50 ${
                isSaved ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}>
              {saving ? <Loader2 size={11} className="animate-spin mx-auto" /> : isSaved ? '✓ Update' : 'Save'}
            </button>
            {isSaved && (
              <button onClick={handleCancel}
                className="text-[10px] text-gray-400 hover:text-red-500 w-full py-0.5 transition-colors">
                Cancel
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Machine rows (1 row for single-shift, 2 for dual) ────────────────────────

function MachineRows({ machine, date, entries, isAdmin, canAddDpr, onSaved, onViewMonth }) {
  const isDual      = machine.shift_type === 'Dual Shift'
  const dayEntry    = entries.find(e => e.shift === 'Day Shift') || null
  const nightEntry  = entries.find(e => e.shift === 'Night Shift') || null
  const singleEntry = !isDual ? (entries[0] || null) : null

  const [dayR1Close,      setDayR1Close]      = useState(dayEntry?.r1_close != null ? String(dayEntry.r1_close) : '')
  const [dayReadingsClose, setDayReadingsClose] = useState(
    dayEntry?.reading_logs?.map(l => ({ reading_type_id: l.reading_type_id, close_value: l.close_value != null ? String(l.close_value) : '' })) || []
  )

  if (!isDual) {
    return (
      <ShiftRow
        machine={machine} date={date} shift={null}
        existingEntry={singleEntry}
        isFirst rowSpan={1}
        onViewMonth={onViewMonth} onSaved={onSaved}
        isAdmin={isAdmin} canAddDpr={canAddDpr}
      />
    )
  }

  return (
    <>
      <ShiftRow
        machine={machine} date={date} shift="Day Shift"
        existingEntry={dayEntry}
        onR1CloseChange={setDayR1Close}
        onReadingsCloseChange={setDayReadingsClose}
        isFirst rowSpan={2}
        onViewMonth={onViewMonth} onSaved={onSaved}
        isAdmin={isAdmin} canAddDpr={canAddDpr}
      />
      <ShiftRow
        machine={machine} date={date} shift="Night Shift"
        existingEntry={nightEntry}
        dayR1Close={dayR1Close}
        dayReadingsClose={dayReadingsClose}
        onSaved={onSaved}
        isAdmin={isAdmin} canAddDpr={canAddDpr}
      />
    </>
  )
}

// ── DPR entry table ───────────────────────────────────────────────────────────

function DprEntryTable({ machines, allEntries, date, isAdmin, canAddDpr, onSaved, onViewMonth }) {
  const entryMap = {}
  for (const e of allEntries) {
    if (!entryMap[e.machine_id]) entryMap[e.machine_id] = []
    entryMap[e.machine_id].push(e)
  }

  const thCls = 'px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-white text-left whitespace-nowrap'

  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e5e7eb', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#1e3a8a', position: 'sticky', top: 0, zIndex: 2 }}>
            <th className={thCls} style={{ width: 48 }}>Sl#</th>
            <th className={thCls} style={{ width: 144 }}>Equipment</th>
            <th className={thCls} style={{ width: 90 }}>Shift</th>
            <th className={thCls} style={{ width: 80 }}>Open</th>
            <th className={thCls} style={{ width: 80 }}>Close</th>
            <th className={thCls} style={{ width: 56, textAlign: 'center' }}>Total</th>
            <th className={thCls} style={{ width: 64 }}>HSD (L)</th>
            <th className={thCls} style={{ width: 56 }}>Bkdn Hrs</th>
            <th className={thCls} style={{ width: 64 }}>Bkdn Min</th>
            <th className={thCls} style={{ width: 64 }}>Qty</th>
            <th className={thCls} style={{ width: 176 }}>Work Done</th>
            <th className={thCls} style={{ width: 112 }}>Remarks</th>
            <th className={thCls} style={{ width: 112, textAlign: 'center' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {machines.map((m, idx) => (
            <MachineRows
              key={`${m.id}_${(entryMap[m.id] || []).length}`}
              machine={m}
              date={date}
              entries={entryMap[m.id] || []}
              isAdmin={isAdmin}
              canAddDpr={canAddDpr}
              onSaved={onSaved}
              onViewMonth={() => onViewMonth(m)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Entry Form Modal (used inside MonthGridPanel) ─────────────────────────────

function EntryFormModal({ machine, date, onSave, onClose, isAdmin, editData, editIds }) {
  const isEditMode     = !!editData
  const isMultiReading = machine?.reading_configs?.length > 0
  const configs        = machine?.reading_configs || []
  const isDual         = machine?.shift_type === 'Dual Shift'

  const mkReadings  = () => configs.map(rc => ({ reading_type_id: rc.reading_type_id, code: rc.code, reading_name: rc.reading_name, unit: rc.unit, open_value: '', close_value: '' }))
  const mkNReadings = () => configs.map(rc => ({ reading_type_id: rc.reading_type_id, close_value: '' }))
  const mrEmpty     = { shift: '', readings: mkReadings(), n_readings: mkNReadings(), hsd: '', breakdown_hrs: '0', breakdown_min: '0', qty: '', work_done: '', n_hsd: '', n_breakdown_hrs: '0', n_breakdown_min: '0', n_qty: '', n_work_done: '', remarks: '' }

  const [form,          setForm]          = useState(editData || (isMultiReading ? mrEmpty : emptyForm))
  const [loading,       setLoading]       = useState(false)
  const [loadingPrev,   setLoadingPrev]   = useState(false)
  const [toast,         setToast]         = useState(null)
  const [openingLocked, setOpeningLocked] = useState(false)

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  useEffect(() => {
    setToast(null)
    if (isEditMode) { setForm(editData); setOpeningLocked(false); return }
    setForm(isMultiReading ? { ...mrEmpty, readings: mkReadings(), n_readings: mkNReadings() } : emptyForm)
    setOpeningLocked(false)
    if (!machine || !isDual) return
    setLoadingPrev(true)
    getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: 'Day Shift' })
      .then(r => {
        const prev = r.data.data
        if (!prev) return
        if (isMultiReading && prev.readings?.length > 0) {
          setForm(f => ({ ...f, readings: f.readings.map(r => { const p = prev.readings.find(pr => pr.reading_type_id === r.reading_type_id); return p?.close_value != null ? { ...r, open_value: String(p.close_value) } : r }) }))
        } else if (!isMultiReading && prev.r1_close != null) {
          setForm(f => ({ ...f, r1_open: String(prev.r1_close), ...(machine.dual_reading && prev.r2_close != null ? { r2_open: String(prev.r2_close) } : {}) }))
        }
        setOpeningLocked(true)
      }).catch(() => {}).finally(() => setLoadingPrev(false))
  }, [machine?.id, date, isEditMode])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setReadingOpen   = (rtId, val) => setForm(f => ({ ...f, readings:   f.readings.map(r   => r.reading_type_id === rtId ? { ...r, open_value:  val } : r) }))
  const setReadingClose  = (rtId, val) => setForm(f => ({ ...f, readings:   f.readings.map(r   => r.reading_type_id === rtId ? { ...r, close_value: val } : r) }))
  const setNReadingClose = (rtId, val) => setForm(f => ({ ...f, n_readings: f.n_readings.map(r => r.reading_type_id === rtId ? { ...r, close_value: val } : r) }))

  const handleShiftChange = async e => {
    if (isEditMode) return
    const newShift = e.target.value
    setForm(f => ({ ...f, shift: newShift, r1_open: '', r2_open: '', ...(isMultiReading ? { readings: mkReadings() } : {}) }))
    setOpeningLocked(false); setToast(null)
    if (!machine || !newShift) return
    const timing = checkEntryTiming(date, newShift)
    if (!timing.allowed) { setToast({ type: 'error', msg: timing.message }); return }
    try {
      const r    = await getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: newShift })
      const prev = r.data.data
      if (!prev) return
      if (isMultiReading && prev.readings?.length > 0) {
        setForm(f => ({ ...f, readings: f.readings.map(r => { const p = prev.readings.find(pr => pr.reading_type_id === r.reading_type_id); return p?.close_value != null ? { ...r, open_value: String(p.close_value) } : r }) }))
      } else if (!isMultiReading && prev.r1_close != null) {
        setForm(f => ({ ...f, r1_open: String(prev.r1_close), ...(machine.dual_reading && prev.r2_close != null ? { r2_open: String(prev.r2_close) } : {}) }))
      }
      setOpeningLocked(true)
    } catch {}
  }

  // Multi-reading computed values
  const computedReadings = isMultiReading ? (form.readings || []).map(r => {
    const total = r.open_value !== '' && r.close_value !== '' ? parseFloat(r.close_value) - parseFloat(r.open_value) : null
    return { ...r, total, invalid: total !== null && total < 0, exceeded: total !== null && total > SHIFT_MAX }
  }) : []
  const nComputedReadings = isMultiReading && isDual ? (form.n_readings || []).map(nr => {
    const cfg      = configs.find(c => c.reading_type_id === nr.reading_type_id)
    const dayClose = (form.readings || []).find(r => r.reading_type_id === nr.reading_type_id)?.close_value || ''
    const total    = dayClose !== '' && nr.close_value !== '' ? parseFloat(nr.close_value) - parseFloat(dayClose) : null
    return { ...nr, code: cfg?.code, reading_name: cfg?.reading_name, unit: cfg?.unit, day_close: dayClose, total, invalid: total !== null && total < 0 }
  }) : []

  // Legacy r1/r2 computed values
  const r1Total  = !isMultiReading && form.r1_open  !== '' && form.r1_close  !== '' ? parseFloat(form.r1_close)   - parseFloat(form.r1_open)  : null
  const r2Total  = !isMultiReading && machine?.dual_reading && form.r2_open !== '' && form.r2_close !== '' ? parseFloat(form.r2_close) - parseFloat(form.r2_open) : null
  const nR1Total = !isMultiReading && isDual && form.r1_close !== '' && form.n_r1_close !== '' ? parseFloat(form.n_r1_close) - parseFloat(form.r1_close) : null
  const nR2Total = !isMultiReading && isDual && machine?.dual_reading && form.r2_close !== '' && form.n_r2_close !== '' ? parseFloat(form.n_r2_close) - parseFloat(form.r2_close) : null

  const dayWorkHrs = isMultiReading
    ? (computedReadings.find(r => r.unit === 'Hrs')?.total || computedReadings[0]?.total || 0)
    : ((r1Total || 0) + (r2Total || 0))
  const nightWorkHrs = isMultiReading
    ? (nComputedReadings.find(r => r.unit === 'Hrs')?.total || nComputedReadings[0]?.total || 0)
    : ((nR1Total || 0) + (nR2Total || 0))
  const workHrs      = isDual ? dayWorkHrs + nightWorkHrs : dayWorkHrs
  const planned      = parseFloat(machine?.planned_hours) || 10
  const utilPct      = planned > 0 ? Math.round((workHrs / planned) * 100) : 0
  const dayFuelRate   = dayWorkHrs > 0 && form.hsd     ? (parseFloat(form.hsd)   / dayWorkHrs).toFixed(2)   : null
  const nightFuelRate = nightWorkHrs > 0 && form.n_hsd ? (parseFloat(form.n_hsd) / nightWorkHrs).toFixed(2) : null
  const r1Invalid  = !isMultiReading && r1Total  !== null && r1Total  < 0
  const r2Invalid  = !isMultiReading && r2Total  !== null && r2Total  < 0
  const nR1Invalid = !isMultiReading && nR1Total !== null && nR1Total < 0
  const nR2Invalid = !isMultiReading && nR2Total !== null && nR2Total < 0
  const dayExceeded   = isMultiReading ? computedReadings.some(r => r.exceeded) : dayWorkHrs > SHIFT_MAX
  const nightExceeded = isDual && (isMultiReading ? nComputedReadings.some(r => r.total !== null && r.total > SHIFT_MAX) : nightWorkHrs > SHIFT_MAX)
  const anyError      = isMultiReading
    ? (computedReadings.some(r => r.invalid) || nComputedReadings.some(r => r.invalid) || dayExceeded || nightExceeded)
    : (r1Invalid || r2Invalid || nR1Invalid || nR2Invalid || dayExceeded || nightExceeded)

  const handleSubmit = async e => {
    e.preventDefault()
    if (!isEditMode) {
      const shift = isDual ? 'Dual Shift' : form.shift
      if (shift) { const t = checkEntryTiming(date, shift); if (!t.allowed) { setToast({ type: 'error', msg: t.message }); return } }
    }
    if (isMultiReading) {
      if (!isDual && !form.shift) { setToast({ type: 'error', msg: 'Please select a shift.' }); return }
      if (computedReadings.some(r => r.invalid)) { setToast({ type: 'error', msg: 'One or more readings: closing must be ≥ opening.' }); return }
      if (dayExceeded) { setToast({ type: 'error', msg: `Day readings exceed ${SHIFT_MAX}-hour shift limit.` }); return }
      if (isDual && nComputedReadings.some(r => r.invalid)) { setToast({ type: 'error', msg: 'Night readings: closing must be ≥ day closing.' }); return }
      if (isDual && nightExceeded) { setToast({ type: 'error', msg: `Night readings exceed ${SHIFT_MAX}-hour shift limit.` }); return }
    } else {
      if (!isDual && !form.shift) { setToast({ type: 'error', msg: 'Please select Day Shift or Night Shift.' }); return }
      if (r1Invalid)               { setToast({ type: 'error', msg: 'Day Reading 1: Closing must be ≥ Opening.' }); return }
      if (r2Invalid)               { setToast({ type: 'error', msg: 'Day Reading 2: Closing must be ≥ Opening.' }); return }
      if (isDual && nR1Invalid)    { setToast({ type: 'error', msg: 'Night Reading 1: Closing must be ≥ Day Shift closing.' }); return }
      if (isDual && nR2Invalid)    { setToast({ type: 'error', msg: 'Night Reading 2: Closing must be ≥ Day Shift closing.' }); return }
      if (dayExceeded)             { setToast({ type: 'error', msg: `${isDual ? 'Day Shift' : form.shift}: total hours (${dayWorkHrs.toFixed(2)}) exceed 12-hour limit.` }); return }
      if (isDual && nightExceeded) { setToast({ type: 'error', msg: `Night Shift: total hours (${nightWorkHrs.toFixed(2)}) exceed 12-hour limit.` }); return }
    }

    const breakdownVal  = brkHrsToDecimal(form.breakdown_hrs,   form.breakdown_min)
    const nBreakdownVal = brkHrsToDecimal(form.n_breakdown_hrs, form.n_breakdown_min)
    setLoading(true); setToast(null)
    try {
      if (isMultiReading) {
        const dayPayload   = { readings: computedReadings.map(r => ({ reading_type_id: r.reading_type_id, open_value: r.open_value || null, close_value: r.close_value || null })), hsd: form.hsd || null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null }
        const nightPayload = { readings: nComputedReadings.map(r => ({ reading_type_id: r.reading_type_id, open_value: r.day_close || null, close_value: r.close_value || null })), hsd: form.n_hsd || null, breakdown: nBreakdownVal || 0, qty: form.n_qty || null, work_done: form.n_work_done || null, remarks: form.remarks || null }
        if (isEditMode) {
          if (isDual && editIds.length >= 2) {
            await Promise.all([updateEntry(editIds[0], dayPayload), updateEntry(editIds[1], nightPayload)])
          } else {
            await updateEntry(editIds[0], { ...dayPayload, shift: form.shift })
          }
        } else if (isDual) {
          await Promise.all([
            createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: 'Day Shift',   ...dayPayload }),
            createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: 'Night Shift', ...nightPayload }),
          ])
        } else {
          await createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: form.shift, ...dayPayload })
        }
      } else {
        if (isEditMode) {
          if (isDual && editIds.length >= 2) {
            await Promise.all([
              updateEntry(editIds[0], { r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, hsd: form.hsd || null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null }),
              updateEntry(editIds[1], { r1_open: form.r1_close || null, r1_close: form.n_r1_close || null, r2_open: form.r2_close || null, r2_close: form.n_r2_close || null, hsd: form.n_hsd || null, breakdown: nBreakdownVal || 0, qty: form.n_qty || null, work_done: form.n_work_done || null, remarks: form.remarks || null }),
            ])
          } else {
            await updateEntry(editIds[0], { shift: form.shift, r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, hsd: form.hsd || null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null })
          }
        } else if (isDual) {
          await Promise.all([
            createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: 'Day Shift',   r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, hsd: form.hsd || null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null }),
            createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: 'Night Shift',  r1_open: form.r1_close || null, r1_close: form.n_r1_close || null, r2_open: form.r2_close || null, r2_close: form.n_r2_close || null, hsd: form.n_hsd || null, breakdown: nBreakdownVal || 0, qty: form.n_qty || null, work_done: form.n_work_done || null, remarks: form.remarks || null }),
          ])
        } else {
          await createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: form.shift, r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, hsd: form.hsd || null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null })
        }
      }
      onSave(); onClose()
    } catch (err) {
      const msg = err.response?.status === 409
        ? 'Entry already exists for this machine, date, and shift.'
        : (err.response?.data?.error || 'Failed to save entry')
      setToast({ type: 'error', msg })
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <p className="font-semibold text-gray-900">{machine.slno} · {machine.eq_type}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {date} · {isDual ? 'Dual Shift' : 'Single Shift'}
              {isEditMode && <span className="ml-2 text-amber-600 font-medium">· Editing</span>}
              {loadingPrev && <span className="ml-2 text-blue-500 animate-pulse">Loading previous reading…</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {workHrs > 0 && (
              <div className={`text-center rounded-xl px-3 py-2 ${anyError ? 'bg-red-50' : 'bg-blue-50'}`}>
                <p className={`text-xl font-bold leading-none ${anyError ? 'text-red-600' : 'text-blue-700'}`}>{workHrs.toFixed(2)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{anyError ? 'Error' : `${utilPct}% util`}</p>
              </div>
            )}
            <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-5">
          {!isDual && (
            <div>
              <label className={lbl}>Shift <span className="text-red-500">*</span></label>
              {isEditMode ? (
                <div className={`${inp} bg-gray-50 text-gray-700`}>{form.shift}</div>
              ) : (
                <select value={form.shift} onChange={handleShiftChange} className={inp} required>
                  <option value="">— select shift —</option>
                  <option value="Day Shift">Day Shift (max 12 hrs)</option>
                  <option value="Night Shift">Night Shift (max 12 hrs)</option>
                </select>
              )}
            </div>
          )}
          {isDual && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded">DAY SHIFT</span>
                {dayWorkHrs > 0 && <span className={`text-xs font-medium ${dayExceeded ? 'text-red-600' : 'text-gray-500'}`}>{dayWorkHrs.toFixed(2)} hrs{dayExceeded ? ' — exceeds 12 h limit' : ''}</span>}
              </div>
              {isMultiReading ? (
                <MultiReadingGrid readings={computedReadings} isNight={false} onChangeOpen={setReadingOpen} onChangeClose={setReadingClose} openLocked={!isEditMode && openingLocked} isAdmin={isAdmin} lbl={lbl} inp={inp} />
              ) : (
                <>
                  <ReadingRow label={`Reading 1 · ${machine.reading1_basis}`} open={form.r1_open} close={form.r1_close} total={r1Total} basis={machine.reading1_basis} invalid={r1Invalid} onOpen={set('r1_open')} onClose={set('r1_close')} required openLocked={!isEditMode && openingLocked} isAdmin={isAdmin} />
                  {machine.dual_reading && <ReadingRow label={`Reading 2 · ${machine.reading2_basis || 'KM'}`} open={form.r2_open} close={form.r2_close} total={r2Total} basis={machine.reading2_basis || 'KM'} invalid={r2Invalid} onOpen={set('r2_open')} onClose={set('r2_close')} openLocked={!isEditMode && openingLocked} isAdmin={isAdmin} />}
                </>
              )}
              <FuelBreakdown hsd={form.hsd} breakdownHrs={form.breakdown_hrs} breakdownMin={form.breakdown_min} qty={form.qty} workDone={form.work_done} fuelRate={dayFuelRate} machine={machine} onHsd={set('hsd')} onBreakdownHrs={set('breakdown_hrs')} onBreakdownMin={set('breakdown_min')} onQty={set('qty')} onWorkDone={set('work_done')} lbl={lbl} inp={inp} />
            </div>
          )}
          {isDual && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded">NIGHT SHIFT</span>
                {nightWorkHrs > 0 && <span className={`text-xs font-medium ${nightExceeded ? 'text-red-600' : 'text-gray-500'}`}>{nightWorkHrs.toFixed(2)} hrs{nightExceeded ? ' — exceeds 12 h limit' : ''}</span>}
              </div>
              {isMultiReading ? (
                <MultiReadingGrid readings={nComputedReadings} isNight={true} onChangeOpen={null} onChangeClose={setNReadingClose} openLocked={false} isAdmin={isAdmin} lbl={lbl} inp={inp} />
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Reading 1 · {machine.reading1_basis}</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className={lbl}>Opening <span className="text-gray-400 font-normal">(= Day closing)</span></label><input readOnly value={form.r1_close || ''} className={`${inp} bg-gray-50 text-gray-500 cursor-not-allowed`} placeholder="—" /></div>
                      <div><label className={lbl}>Closing</label><input type="number" step="0.01" value={form.n_r1_close} onChange={set('n_r1_close')} className={`${inp} ${nR1Invalid ? 'border-red-500' : ''}`} placeholder="0.00" required /></div>
                      <div><label className={lbl}>Total</label><input readOnly value={nR1Total !== null ? `${nR1Total.toFixed(2)} ${machine.reading1_basis}` : ''} className={`${inp} ${nR1Invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} /></div>
                    </div>
                    {nR1Invalid && <p className="text-xs text-red-600 mt-1">Night closing must be ≥ Day closing</p>}
                  </div>
                  {machine.dual_reading && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Reading 2 · {machine.reading2_basis || 'KM'}</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div><label className={lbl}>Opening</label><input readOnly value={form.r2_close || ''} className={`${inp} bg-gray-50 text-gray-500 cursor-not-allowed`} placeholder="—" /></div>
                        <div><label className={lbl}>Closing</label><input type="number" step="0.01" value={form.n_r2_close} onChange={set('n_r2_close')} className={`${inp} ${nR2Invalid ? 'border-red-500' : ''}`} placeholder="0.00" /></div>
                        <div><label className={lbl}>Total</label><input readOnly value={nR2Total !== null ? nR2Total.toFixed(2) : ''} className={`${inp} ${nR2Invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} /></div>
                      </div>
                      {nR2Invalid && <p className="text-xs text-red-600 mt-1">Night closing must be ≥ Day closing</p>}
                    </div>
                  )}
                </>
              )}
              <FuelBreakdown hsd={form.n_hsd} breakdownHrs={form.n_breakdown_hrs} breakdownMin={form.n_breakdown_min} qty={form.n_qty} workDone={form.n_work_done} fuelRate={nightFuelRate} machine={machine} onHsd={set('n_hsd')} onBreakdownHrs={set('n_breakdown_hrs')} onBreakdownMin={set('n_breakdown_min')} onQty={set('n_qty')} onWorkDone={set('n_work_done')} lbl={lbl} inp={inp} />
            </div>
          )}
          {!isDual && (
            <>
              {isMultiReading ? (
                <MultiReadingGrid readings={computedReadings} isNight={false} onChangeOpen={setReadingOpen} onChangeClose={setReadingClose} openLocked={!isEditMode && openingLocked} isAdmin={isAdmin} lbl={lbl} inp={inp} />
              ) : (
                <>
                  <ReadingRow label={`Reading 1 · ${machine.reading1_basis}`} open={form.r1_open} close={form.r1_close} total={r1Total} basis={machine.reading1_basis} invalid={r1Invalid} onOpen={set('r1_open')} onClose={set('r1_close')} required openLocked={!isEditMode && openingLocked} isAdmin={isAdmin} />
                  {machine.dual_reading && <ReadingRow label={`Reading 2 · ${machine.reading2_basis || 'KM'}`} open={form.r2_open} close={form.r2_close} total={r2Total} basis={machine.reading2_basis || 'KM'} invalid={r2Invalid} onOpen={set('r2_open')} onClose={set('r2_close')} openLocked={!isEditMode && openingLocked} isAdmin={isAdmin} />}
                </>
              )}
              <FuelBreakdown hsd={form.hsd} breakdownHrs={form.breakdown_hrs} breakdownMin={form.breakdown_min} qty={form.qty} workDone={form.work_done} fuelRate={dayFuelRate} machine={machine} onHsd={set('hsd')} onBreakdownHrs={set('breakdown_hrs')} onBreakdownMin={set('breakdown_min')} onQty={set('qty')} onWorkDone={set('work_done')} lbl={lbl} inp={inp} />
            </>
          )}
          <div><label className={lbl}>Remarks</label><textarea rows={2} value={form.remarks} onChange={set('remarks')} className={inp} placeholder="Optional" /></div>
          {toast && (
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {toast.msg}
            </div>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              {loading ? 'Saving…' : isEditMode ? 'Update Entry' : isDual ? 'Save Day + Night Entries' : 'Save Entry'}
            </button>
            <button type="button" onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Multi-Reading Grid (modal) ────────────────────────────────────────────────

function MultiReadingGrid({ readings, isNight, onChangeOpen, onChangeClose, openLocked, isAdmin, lbl, inp }) {
  return (
    <div className="space-y-3">
      {readings.map(r => (
        <div key={r.reading_type_id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/30">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
            <span className="font-mono text-blue-600 mr-2">{r.code}</span>
            <span className="text-gray-400 font-normal normal-case">{r.reading_name}</span>
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>
                Opening
                {isNight && <span className="text-gray-400 font-normal ml-1">(= Day close)</span>}
                {!isNight && openLocked && !isAdmin && <Lock size={10} className="inline ml-1 text-amber-500" />}
              </label>
              <input type="number" step="0.01" placeholder="0.00"
                value={isNight ? (r.day_close || '') : r.open_value}
                readOnly={isNight || (!isAdmin && openLocked)}
                onChange={(!isNight && (isAdmin || !openLocked)) ? e => onChangeOpen(r.reading_type_id, e.target.value) : undefined}
                className={`${inp} ${isNight ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : !isAdmin && openLocked ? 'bg-amber-50 border-amber-200' : ''}`}
              />
              {!isNight && openLocked && !isAdmin && <p className="text-[10px] text-amber-600 mt-0.5">Carried from previous shift</p>}
              {!isNight && openLocked && isAdmin && <p className="text-[10px] text-blue-600 mt-0.5">Admin: editable</p>}
            </div>
            <div>
              <label className={lbl}>Closing</label>
              <input type="number" step="0.01" placeholder="0.00"
                value={r.close_value}
                onChange={e => onChangeClose(r.reading_type_id, e.target.value)}
                className={`${inp} ${r.invalid ? 'border-red-500' : ''}`}
              />
            </div>
            <div>
              <label className={lbl}>Total</label>
              <input readOnly
                value={r.total !== null ? `${r.total.toFixed(2)} ${r.unit}` : ''}
                className={`${inp} ${r.invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`}
              />
            </div>
          </div>
          {r.invalid && <p className="text-xs text-red-600 mt-1">Closing must be ≥ Opening</p>}
        </div>
      ))}
    </div>
  )
}

// ── Reading Row ───────────────────────────────────────────────────────────────

function ReadingRow({ label, open, close, total, basis, invalid, onOpen, onClose: onCloseVal, required, openLocked, isAdmin }) {
  const inp     = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl     = 'block text-xs font-medium text-gray-500 mb-1'
  const isLocked = openLocked && !isAdmin
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{label}</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={lbl}>Opening{isLocked && <Lock size={10} className="inline ml-1 text-amber-500" />}</label>
          <input type="number" step="0.01" value={open} onChange={isLocked ? undefined : onOpen} readOnly={isLocked}
            className={`${inp} ${isLocked ? 'bg-amber-50 text-gray-600 cursor-not-allowed border-amber-200' : ''}`} placeholder="0.00" required={required} />
          {isLocked && <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1"><Lock size={8} /> Carried from previous shift</p>}
          {openLocked && isAdmin && <p className="text-[10px] text-blue-600 mt-0.5">Admin: editable</p>}
        </div>
        <div>
          <label className={lbl}>Closing</label>
          <input type="number" step="0.01" value={close} onChange={onCloseVal} className={`${inp} ${invalid ? 'border-red-500' : ''}`} placeholder="0.00" required={required} />
        </div>
        <div>
          <label className={lbl}>Total</label>
          <input readOnly value={total !== null ? `${total.toFixed(2)} ${basis}` : ''} className={`${inp} ${invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} />
        </div>
      </div>
      {invalid && <p className="text-xs text-red-600 mt-1">Closing must be ≥ Opening</p>}
    </div>
  )
}

// ── Fuel & Breakdown ──────────────────────────────────────────────────────────

function FuelBreakdown({ hsd, breakdownHrs, breakdownMin, qty, workDone, fuelRate, machine, onHsd, onBreakdownHrs, onBreakdownMin, onQty, onWorkDone, lbl, inp }) {
  const breakdownTotal = brkHrsToDecimal(breakdownHrs, breakdownMin)
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>HSD Consumed (litres)</label>
          <input type="number" step="0.01" min="0" value={hsd} onChange={onHsd} className={inp} placeholder="0.00" />
          {fuelRate && (
            <p className="text-xs text-gray-500 mt-1">
              <span className="font-medium">{fuelRate} L/hr</span>
              {machine.fuel_min && machine.fuel_max && <span className="text-gray-400"> · norm {machine.fuel_min}–{machine.fuel_max}</span>}
            </p>
          )}
        </div>
        <div>
          <label className={lbl}>Breakdown</label>
          <div className="flex gap-2">
            <div className="flex-1"><input type="number" min="0" step="1" value={breakdownHrs} onChange={onBreakdownHrs} className={inp} placeholder="0" /><p className="text-[10px] text-gray-400 mt-0.5 text-center">hrs</p></div>
            <div className="flex-1"><select value={breakdownMin} onChange={onBreakdownMin} className={inp}>{MIN_OPTIONS.map(m => <option key={m} value={m}>{pad(m)} min</option>)}</select><p className="text-[10px] text-gray-400 mt-0.5 text-center">min</p></div>
          </div>
          {breakdownTotal > 0 && <p className="text-xs text-blue-600 mt-1 font-medium">= {breakdownTotal.toFixed(2)} hrs</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className={lbl}>Quantity</label><input type="number" step="0.01" value={qty} onChange={onQty} className={inp} placeholder="Optional" /></div>
        <div><label className={lbl}>Work Done</label><input type="text" value={workDone} onChange={onWorkDone} className={inp} placeholder="Brief description" /></div>
      </div>
    </>
  )
}

// ── Month Grid Panel ──────────────────────────────────────────────────────────

function MonthGridPanel({ machine, onBack, onEntrySaved, isAdmin, canAddDpr, prevDayDate, prevDayCompleted, prevDayTotal }) {
  const now = new Date()
  const [year,     setYear]     = useState(now.getFullYear())
  const [month,    setMonth]    = useState(now.getMonth() + 1)
  const [entries,  setEntries]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [formOpen, setFormOpen] = useState(null)
  const [editOpen, setEditOpen] = useState(null)

  const todayStr = today()

  const load = useCallback(() => {
    setLoading(true)
    const dim  = new Date(year, month, 0).getDate()
    const from = `${year}-${pad(month)}-01`
    const to   = `${year}-${pad(month)}-${pad(dim)}`
    getEntries({ machine_id: machine.id, from, to })
      .then(r => setEntries(r.data.data || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [machine.id, year, month])

  useEffect(() => { load() }, [load])

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  const handleSaved = () => { load(); onEntrySaved() }

  const entryMap = {}
  for (const e of entries) {
    const d = String(e.entry_date).slice(0, 10)
    if (!entryMap[d]) entryMap[d] = []
    entryMap[d].push(e)
  }

  const daysInMonth    = new Date(year, month, 0).getDate()
  const submittedDays  = Object.keys(entryMap).length
  const totalWorkHrsMo = entries.reduce((s, e) => s + parseFloat(e.working_hours || 0), 0)
  const totalHsdMo     = entries.reduce((s, e) => s + parseFloat(e.hsd || 0), 0)
  const isCurrentMonth = year === now.getFullYear() && month === (now.getMonth() + 1)
  const isDualMachine    = machine.shift_type === 'Dual Shift'
  const todayTimingCheck = isDualMachine ? checkEntryTiming(todayStr, 'Dual Shift') : { allowed: true }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50 flex-wrap gap-y-2">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0">
          <ChevronLeft size={15} /> Back to Entry
        </button>
        <div className="h-4 w-px bg-gray-300 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{machine.slno} · {machine.eq_type}{machine.capacity ? ` · ${machine.capacity}` : ''}</p>
          <p className="text-xs text-gray-400 truncate">{machine.reg_no || '—'} · {machine.shift_type || 'Single Shift'} · {machine.ownership}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={prevMonth} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"><ChevronLeft size={14} /></button>
          <span className="text-sm font-semibold text-gray-700 min-w-[120px] text-center">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"><ChevronRight size={14} /></button>
        </div>
        <button onClick={load} title="Refresh" className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors text-gray-500 flex-shrink-0">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {!loading && entries.length > 0 && (
        <div className="flex items-center gap-5 px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-800 flex-wrap">
          <span><span className="font-bold">{submittedDays}</span> / {daysInMonth} days logged</span>
          <span><span className="font-bold">{totalWorkHrsMo.toFixed(1)}</span> hrs total</span>
          {totalHsdMo > 0 && <span><span className="font-bold">{totalHsdMo.toFixed(1)}</span> L HSD</span>}
          {totalWorkHrsMo > 0 && totalHsdMo > 0 && <span>Avg <span className="font-bold">{(totalHsdMo / totalWorkHrsMo).toFixed(2)}</span> L/hr</span>}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /><span className="text-sm">Loading month entries…</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-8">#</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Shift</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Work Hrs</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">HSD (L)</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Bkdn</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Work Done</th>
                <th className="text-center px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-36">Status / Action</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                const dateStr  = `${year}-${pad(month)}-${pad(d)}`
                const dayEnts  = entryMap[dateStr] || []
                const hasEntry = dayEnts.length > 0
                const isFuture = dateStr > todayStr
                const isToday  = dateStr === todayStr
                const dayName  = DAY_NAMES[new Date(dateStr + 'T00:00:00').getDay()]
                const totalWH  = dayEnts.reduce((s, e) => s + parseFloat(e.working_hours || 0), 0)
                const totalHSD = dayEnts.reduce((s, e) => s + parseFloat(e.hsd || 0), 0)
                const totalBK  = dayEnts.reduce((s, e) => s + parseFloat(e.breakdown || 0), 0)
                const shifts   = [...new Set(dayEnts.map(e => e.shift))].join(' + ')
                const workDone = dayEnts.map(e => e.work_done).filter(Boolean).join('; ')
                const entryIds = dayEnts.map(e => e.id)
                const bkdnDisplay = totalBK > 0 ? (() => { const h = Math.floor(totalBK); const m = Math.round((totalBK - h) * 60); return m > 0 ? `${h}h ${pad(m)}m` : `${h}h` })() : null
                const jsDay    = new Date(dateStr + 'T00:00:00').getDay()
                const isWeekend = jsDay === 0 || jsDay === 6
                const rowCls = ['border-b border-gray-100 transition-colors', hasEntry ? 'bg-green-50/30 hover:bg-green-50/60' : isToday ? 'bg-amber-50/70 hover:bg-amber-50' : isFuture ? 'opacity-40' : isWeekend ? 'bg-gray-50/50 hover:bg-gray-50' : 'hover:bg-gray-50/60'].join(' ')
                const textMuted = isFuture ? 'text-gray-300' : 'text-gray-400'
                const textNorm  = isFuture ? 'text-gray-300' : isToday ? 'text-gray-900 font-semibold' : 'text-gray-700'
                const handleEdit = () => {
                  const isDual    = machine.shift_type === 'Dual Shift'
                  const dayEntry  = isDual ? dayEnts.find(e => e.shift === 'Day Shift') || dayEnts[0] : dayEnts[0]
                  const nightEntry = isDual ? dayEnts.find(e => e.shift === 'Night Shift') : null
                  const ids = isDual && nightEntry ? [dayEntry.id, nightEntry.id] : [dayEntry.id]
                  setEditOpen({ date: dateStr, editData: buildEditForm(machine, dayEntry, nightEntry), editIds: ids })
                }
                return (
                  <tr key={d} className={rowCls}>
                    <td className={`px-3 py-2.5 text-xs font-mono tabular-nums ${textMuted}`}>{d}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-xs ${textNorm}`}><span className={`mr-1 ${textMuted}`}>{dayName}</span>{pad(d)} {MONTH_ABR[month - 1]}</span>
                      {isToday && <span className="ml-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold tracking-wide">TODAY</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-xs ${hasEntry && !isFuture ? 'text-gray-600' : textMuted}`}>{hasEntry ? shifts : '—'}</td>
                    <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-mono ${hasEntry && !isFuture ? 'text-gray-800 font-semibold' : textMuted}`}>{hasEntry ? totalWH.toFixed(2) : '—'}</td>
                    <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-mono ${hasEntry && !isFuture && totalHSD > 0 ? 'text-gray-600' : textMuted}`}>{hasEntry && totalHSD > 0 ? totalHSD.toFixed(2) : '—'}</td>
                    <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-mono ${hasEntry && !isFuture && totalBK > 0 ? 'text-red-600 font-semibold' : textMuted}`}>{bkdnDisplay || '—'}</td>
                    <td className={`px-3 py-2.5 text-xs ${hasEntry && !isFuture ? 'text-gray-600' : textMuted}`}><span className="truncate block max-w-[180px]" title={workDone || ''}>{hasEntry && workDone ? workDone : '—'}</span></td>
                    <td className="px-3 py-2.5 text-center">
                      {hasEntry ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap"><CheckCircle2 size={10} /> Submitted</span>
                          {!isFuture && <button onClick={handleEdit} className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-blue-700 hover:bg-blue-50 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap" title="Edit this DPR entry"><Pencil size={10} /> Edit</button>}
                        </div>
                      ) : isFuture ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : isToday ? (
                        canAddDpr ? (
                          isDualMachine && !todayTimingCheck.allowed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title={todayTimingCheck.message}><Clock size={9} /> After 8 AM ↑</span>
                          ) : (
                            <button onClick={() => setFormOpen(dateStr)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-full transition-colors shadow-sm whitespace-nowrap">+ Add Entry</button>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title={prevDayDate ? `${prevDayDate} DPR incomplete` : 'Previous day DPR not submitted'}><Lock size={9} /> Prev Day Pending</span>
                        )
                      ) : isAdmin ? (
                        <button onClick={() => setFormOpen(dateStr)} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full transition-colors whitespace-nowrap">+ Add</button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title="Contact admin to add past entries"><Lock size={9} /> Locked</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && isCurrentMonth && (
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300 inline-block" />Submitted</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300 inline-block" />Today</span>
          {!isAdmin && <span className="flex items-center gap-1.5"><Lock size={10} />Past days locked — contact admin</span>}
        </div>
      )}

      {formOpen && <EntryFormModal machine={machine} date={formOpen} onSave={handleSaved} onClose={() => setFormOpen(null)} isAdmin={isAdmin} />}
      {editOpen && <EntryFormModal machine={machine} date={editOpen.date} onSave={handleSaved} onClose={() => setEditOpen(null)} isAdmin={isAdmin} editData={editOpen.editData} editIds={editOpen.editIds} />}
    </div>
  )
}

// ── Main Entry Page ───────────────────────────────────────────────────────────

export default function Entry() {
  const { user }  = useAuth()
  const isAdmin   = user?.role === 'admin'

  const [projects,        setProjects]        = useState([])
  const [project,         setProject]         = useState('')
  const [date,            setDate]            = useState(today())
  const [dprStatus,       setDprStatus]       = useState(null)
  const [dprLoading,      setDprLoading]      = useState(false)
  const [allEntries,      setAllEntries]      = useState([])
  const [entriesLoading,  setEntriesLoading]  = useState(false)
  const [selectedMachine, setSelectedMachine] = useState(null)
  const [search,          setSearch]          = useState('')
  const [typeFilter,      setTypeFilter]      = useState('')

  useEffect(() => {
    getProjects().then(r => {
      const ps = r.data.data
      setProjects(ps)
      if (ps.length === 1) setProject(ps[0].code)
    })
  }, [])

  const loadDprStatus = useCallback((pc, d) => {
    if (!pc || !d) return
    setDprLoading(true)
    getDprStatus({ project_code: pc, date: d })
      .then(r => setDprStatus(r.data))
      .catch(() => setDprStatus(null))
      .finally(() => setDprLoading(false))
  }, [])

  const loadAllEntries = useCallback((pc, d) => {
    if (!pc || !d) return
    setEntriesLoading(true)
    getEntries({ project_code: pc, date: d })
      .then(r => setAllEntries(r.data.data || []))
      .catch(() => setAllEntries([]))
      .finally(() => setEntriesLoading(false))
  }, [])

  useEffect(() => {
    setDprStatus(null)
    setAllEntries([])
    setSearch('')
    setTypeFilter('')
    setSelectedMachine(null)
    loadDprStatus(project, date)
    loadAllEntries(project, date)
  }, [project, date, loadDprStatus, loadAllEntries])

  const handleEntrySaved = useCallback(() => {
    loadDprStatus(project, date)
    loadAllEntries(project, date)
  }, [project, date, loadDprStatus, loadAllEntries])

  const allMachines    = dprStatus?.machines || []
  const uniqueTypes    = [...new Set(allMachines.map(m => m.eq_type))].sort()
  const filteredMachines = allMachines.filter(m => {
    const q = search.toLowerCase()
    const matchSearch = !q || [m.slno, m.eq_type, m.reg_no, m.capacity].some(v => v && String(v).toLowerCase().includes(q))
    const matchType   = !typeFilter || m.eq_type === typeFilter
    return matchSearch && matchType
  })
  const isFiltered     = !!(search || typeFilter)
  const canAddDpr      = isAdmin || (dprStatus?.prev_day_complete !== false)

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Log Entry</h1>
        {project && dprStatus && (
          <button
            onClick={() => { loadDprStatus(project, date); loadAllEntries(project, date) }}
            disabled={dprLoading || entriesLoading}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <RefreshCw size={13} className={(dprLoading || entriesLoading) ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      </div>

      {/* ── Project + Date ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
            <select value={project} onChange={e => setProject(e.target.value)} className={`${inp} w-full`}>
              <option value="">— select project —</option>
              {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${inp} w-full`} />
          </div>
        </div>

        {project && dprStatus && dprStatus.total > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm flex-wrap gap-2">
              <span className="font-medium text-gray-700">
                DPR Progress — <span className="text-gray-900">{dprStatus.completed}/{dprStatus.total}</span> assets
              </span>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 text-green-600 font-semibold"><CheckCircle2 size={14} /> {dprStatus.pct_completed}% completed</span>
                {dprStatus.pending > 0 && <span className="flex items-center gap-1 text-amber-600 font-medium"><Clock size={14} /> {dprStatus.pending} pending</span>}
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="bg-green-500 h-2 rounded-full transition-all duration-700" style={{ width: `${dprStatus.pct_completed}%` }} />
            </div>
          </div>
        )}

        {project && dprStatus?.total === 0 && <p className="text-sm text-gray-400 text-center py-1">No active assets in this project.</p>}
        {project && dprLoading && !dprStatus && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> Loading asset status…</div>}
        {!project && <p className="text-sm text-gray-400 text-center py-1">Select a project to view and enter DPR data.</p>}
      </section>

      {/* ── Previous day incomplete banner ── */}
      {!isAdmin && project && dprStatus && dprStatus.prev_day_complete === false && !selectedMachine && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Previous Day DPR Incomplete</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {dprStatus.prev_day_date} has {dprStatus.prev_day_completed} of {dprStatus.total} machines submitted. Complete that day's DPR before entering new entries.
            </p>
          </div>
        </div>
      )}

      {/* ── Month Grid Panel ── */}
      {selectedMachine && (
        <MonthGridPanel
          machine={selectedMachine}
          onBack={() => setSelectedMachine(null)}
          onEntrySaved={handleEntrySaved}
          isAdmin={isAdmin}
          canAddDpr={canAddDpr}
          prevDayDate={dprStatus?.prev_day_date}
          prevDayCompleted={dprStatus?.prev_day_completed}
          prevDayTotal={dprStatus?.total}
        />
      )}

      {/* ── DPR Entry Table ── */}
      {!selectedMachine && project && dprStatus && allMachines.length > 0 && (
        <>
          {/* Search + filter bar */}
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search Sl#, equipment type, reg no…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0 max-w-[200px]"
              >
                <option value="">All Equipment Types</option>
                {uniqueTypes.map(t => {
                  const cnt  = allMachines.filter(m => m.eq_type === t).length
                  const done = allMachines.filter(m => m.eq_type === t && m.has_entry).length
                  return <option key={t} value={t}>{t} ({done}/{cnt})</option>
                })}
              </select>
              {isFiltered && (
                <button type="button" onClick={() => { setSearch(''); setTypeFilter('') }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 px-2 py-2 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap">
                  <X size={13} /> Clear
                </button>
              )}
            </div>
            {isFiltered && (
              <p className="text-xs text-gray-400">
                Showing <span className="font-semibold text-gray-700">{filteredMachines.length}</span> of <span className="font-semibold text-gray-700">{allMachines.length}</span> assets
                {filteredMachines.length > 0 && <> · <span className="text-green-600 font-medium">{filteredMachines.filter(m => m.has_entry).length} completed</span>{filteredMachines.filter(m => !m.has_entry).length > 0 && <>, <span className="text-amber-600 font-medium">{filteredMachines.filter(m => !m.has_entry).length} pending</span></>}</>}
              </p>
            )}
          </div>

          {entriesLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2 bg-white rounded-xl border border-gray-200">
              <Loader2 size={20} className="animate-spin" /><span className="text-sm">Loading entries…</span>
            </div>
          ) : filteredMachines.length > 0 ? (
            <DprEntryTable
              machines={filteredMachines}
              allEntries={allEntries}
              date={date}
              isAdmin={isAdmin}
              canAddDpr={canAddDpr}
              onSaved={handleEntrySaved}
              onViewMonth={setSelectedMachine}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
              No assets match your filter.{' '}
              <button onClick={() => { setSearch(''); setTypeFilter('') }} className="text-blue-600 hover:underline">Clear filters</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
