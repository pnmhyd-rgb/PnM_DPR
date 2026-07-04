import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getProjects, getMachines, getEntries, createEntry, updateEntry, deleteEntry, getPreviousClosing, getDprStatus,
  getFuelRecord, upsertFuelRecord, createMeterReset,
} from '../lib/api'
import MachineDetailPanel from '../components/MachineDetailPanel'
import { today } from '../lib/utils'
import {
  CheckCircle2, Clock, ChevronLeft, ChevronRight,
  X, CalendarDays, CheckCircle, AlertCircle, Loader2, RefreshCw, Search, Lock, Pencil, Trash2,
  FileSpreadsheet, FileText,
} from 'lucide-react'
import DPRDownloadModal, { downloadDPRForMachine } from './DPRDownloadModal'

const MIN_OPTIONS = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54]

const IDLE_REASONS = [
  'Idle due to Rain',
  'Idle due to Holiday',
  'Idle due to no work front',
  'Idle due to no Fuel',
  'Idle due to Local strikes',
]

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
  n_remarks: '',
  machine_status: null, n_machine_status: null,
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
      n_remarks:       nightEntry?.remarks || '',
      machine_status:   dayEntry?.is_idle ? 'idle' : (parseFloat(dayEntry?.breakdown) > 0 ? 'breakdown' : null),
      n_machine_status: nightEntry?.is_idle ? 'idle' : (parseFloat(nightEntry?.breakdown) > 0 ? 'breakdown' : null),
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
    n_remarks:       nightEntry?.remarks || '',
    machine_status:   dayEntry?.is_idle ? 'idle' : (parseFloat(dayEntry?.breakdown) > 0 ? 'breakdown' : null),
    n_machine_status: nightEntry?.is_idle ? 'idle' : (parseFloat(nightEntry?.breakdown) > 0 ? 'breakdown' : null),
  }
}

// ── Inline shift row ──────────────────────────────────────────────────────────

function ShiftRow({
  machine, date, shift,
  existingEntry, dayR1Close, onR1CloseChange,
  dayReadingsClose, onReadingsCloseChange,
  isFirst, rowSpan, onViewMonth, onViewAsset,
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
  const [meterReset,    setMeterReset]    = useState(false)
  const initMachineStatus = () => existingEntry?.is_idle ? 'idle' : (parseFloat(existingEntry?.breakdown) > 0 ? 'breakdown' : null)
  const [machineStatus,  setMachineStatus] = useState(initMachineStatus)

  const readOnly           = isSaved && !isEditing
  const effectiveOpenLocked = (!!existingEntry || openingLocked) && !meterReset

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
      const r = await getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: newShift, machine_shift_type: machine.shift_type })
      applyPrevClosing(r.data.data)
    } catch {}
  }

  const handleCancel = () => { setForm(initForm()); setIsEditing(false); setErrorMsg(''); setMeterReset(false); setMachineStatus(initMachineStatus()) }

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
    return { ...r, effective_open: effOpen, total,
      invalid:  total !== null && total < 0,
      exceeded: total !== null && r.unit === 'Hrs' && total > SHIFT_MAX }
  }) : []
  const anyReadingInvalid  = computedReadings.some(r => r.invalid)
  const anyReadingExceeded = computedReadings.some(r => r.exceeded)
  const primaryTotal = computedReadings.find(r => r.unit === 'Hrs')?.total ?? computedReadings[0]?.total ?? null

  const shiftWorkHrs = isMultiReading ? (primaryTotal ?? 0) : (r1Total ?? 0)
  const maxBreakdown = Math.max(0, SHIFT_MAX - shiftWorkHrs)
  const isZeroWork   = isMultiReading ? primaryTotal === 0 : r1Total === 0

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
    } else if (anyReadingExceeded) {
      setErrorMsg('Total hours must not exceed 12 hrs per shift'); return
    }

    if (isZeroWork && !machineStatus) {
      setErrorMsg('Readings are same — select Idle or Breakdown')
      return
    }
    if (isZeroWork && machineStatus === 'breakdown' && !form.remarks?.trim()) {
      setErrorMsg('Breakdown reason is required')
      return
    }
    if (isZeroWork && machineStatus === 'idle' && !form.remarks) {
      setErrorMsg('Please select an idle reason')
      return
    }

    const breakdown = machineStatus === 'idle' ? 0 : brkHrsToDecimal(form.breakdown_hrs, form.breakdown_min)
    if (!isZeroWork && breakdown > maxBreakdown + 0.01) {
      setErrorMsg(`Breakdown (${breakdown.toFixed(2)} hrs) cannot exceed remaining shift time (${maxBreakdown.toFixed(2)} hrs).`)
      return
    }

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
      is_idle:   isZeroWork && machineStatus === 'idle',
    }

    setSaving(true); setErrorMsg('')
    try {
      if (existingEntry) await updateEntry(existingEntry.id, payload)
      else               await createEntry(payload)
      if (meterReset) {
        const primaryReading = isMultiReading
          ? (computedReadings.find(r => r.unit === 'Hrs') || computedReadings[0])
          : null
        await createMeterReset({
          machine_id:       machine.id,
          entry_date:       date,
          shift:            effectiveShift,
          reading_code:     primaryReading?.code || machine.reading1_basis || null,
          new_reading:      primaryReading ? primaryReading.effective_open : (isDualNight ? dayR1Close : form.r1_open) || null,
        }).catch(() => {})
        setMeterReset(false)
      }
      setIsSaved(true); setIsEditing(false); onSaved()
    } catch (err) {
      setErrorMsg(err.response?.status === 409 ? 'Entry already exists for this shift.' : (err.response?.data?.error || 'Failed to save'))
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!existingEntry) return
    if (!window.confirm('Delete this entry permanently?')) return
    setSaving(true); setErrorMsg('')
    try {
      await deleteEntry(existingEntry.id)
      onSaved()
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to delete')
      setSaving(false)
    }
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
            <button onClick={onViewAsset}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline leading-tight text-center break-words max-w-[72px]">
              {machine.nickname || machine.slno}
            </button>
            <span className="text-[9px] text-gray-400 leading-tight">{machine.slno}</span>
            <button onClick={onViewMonth} title="View monthly log"
              className="text-blue-400 hover:text-blue-600 transition-colors p-0.5 rounded hover:bg-blue-100">
              <CalendarDays size={12} />
            </button>
          </div>
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
                  readOnly={isDualNight || readOnly || effectiveOpenLocked}
                  onChange={!isDualNight && !readOnly && !effectiveOpenLocked ? e => setReadingValue(r.reading_type_id, 'open_value', e.target.value) : undefined}
                  style={{ width: 68 }}
                  className={`border rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 ${
                    isDualNight || readOnly || effectiveOpenLocked ? 'bg-gray-50 text-gray-500 border-gray-100' : 'border-gray-200'
                  }`}
                />
                <input type="number" step="0.01" placeholder="Close"
                  value={r.close_value}
                  readOnly={readOnly}
                  onChange={!readOnly ? e => setReadingValue(r.reading_type_id, 'close_value', e.target.value) : undefined}
                  style={{ width: 68 }}
                  className={`border rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 ${
                    readOnly ? 'bg-gray-50 text-gray-500 border-gray-100' :
                    r.invalid ? 'border-red-400 bg-red-50' :
                    r.exceeded ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                  }`}
                />
                <span className={`text-[10px] font-mono font-bold w-10 text-right flex-shrink-0 ${r.invalid ? 'text-red-600' : r.exceeded ? 'text-amber-600' : r.total !== null && r.total > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
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
              onChange={isDualNight || readOnly || effectiveOpenLocked ? undefined : set('r1_open')}
              readOnly={isDualNight || readOnly || effectiveOpenLocked}
              className={isDualNight || readOnly || effectiveOpenLocked ? roInp : `${inp} border-gray-200`}
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
        {isZeroWork && machineStatus === 'idle' ? (
          <span className="text-[11px] text-gray-400">—</span>
        ) : isZeroWork && machineStatus === 'breakdown' ? (
          <input type="number" readOnly value={SHIFT_MAX} className={roInp} title="Full shift breakdown" />
        ) : (
          <input type="number" min="0" step="1" max={Math.floor(maxBreakdown)} placeholder="0"
            value={form.breakdown_hrs} onChange={readOnly ? undefined : set('breakdown_hrs')}
            readOnly={readOnly} className={editInp('border-gray-200')} />
        )}
      </td>

      {/* Bkdn Min */}
      <td className={`${thCls} w-16`}>
        {isZeroWork && machineStatus === 'idle' ? (
          <span className="text-[11px] text-gray-400">—</span>
        ) : isZeroWork && machineStatus === 'breakdown' ? (
          <input type="number" readOnly value={0} className={roInp} title="Full shift breakdown" />
        ) : (
          <select value={form.breakdown_min} onChange={set('breakdown_min')}
            disabled={readOnly} className={editInp('border-gray-200')}>
            {MIN_OPTIONS.map(m => <option key={m} value={m}>{pad(m)}</option>)}
          </select>
        )}
      </td>

      {/* Qty */}
      <td className={`${thCls} w-16`}>
        <input type="number" step="0.01" placeholder="—"
          value={form.qty} onChange={readOnly ? undefined : set('qty')}
          readOnly={readOnly} className={editInp('border-gray-200')} />
      </td>

      {/* Work Done / Idle-Breakdown toggle */}
      <td className={`${thCls} w-44`}>
        {isZeroWork && !readOnly ? (
          <div className="flex gap-1">
            <button type="button" onClick={() => { setMachineStatus('idle'); setForm(f => ({ ...f, breakdown_hrs: '0', breakdown_min: '0', remarks: '' })) }}
              className={`flex-1 text-[10px] font-semibold px-1.5 py-1 rounded border transition-colors ${machineStatus === 'idle' ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'}`}>
              Idle
            </button>
            <button type="button" onClick={() => { setMachineStatus('breakdown'); setForm(f => ({ ...f, breakdown_hrs: String(SHIFT_MAX), breakdown_min: '0', remarks: '' })) }}
              className={`flex-1 text-[10px] font-semibold px-1.5 py-1 rounded border transition-colors ${machineStatus === 'breakdown' ? 'bg-red-100 border-red-400 text-red-800' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-300 hover:text-red-700'}`}>
              Bkdn
            </button>
          </div>
        ) : isZeroWork && readOnly && existingEntry?.is_idle ? (
          <span className="inline-flex items-center text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">IDLE</span>
        ) : (
          <input type="text" placeholder="Work done…"
            value={form.work_done} onChange={readOnly ? undefined : set('work_done')}
            readOnly={readOnly} className={editInp('border-gray-200')} />
        )}
      </td>

      {/* Remarks / Idle Reason / Breakdown Reason */}
      <td className={`${thCls} w-28`}>
        {!readOnly && isZeroWork && machineStatus === 'idle' ? (
          <select value={form.remarks} onChange={set('remarks')}
            className={`${inp} border-amber-300 bg-amber-50 text-amber-900`}>
            <option value="">— Select reason —</option>
            {IDLE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        ) : (
          <input type="text"
            placeholder={isZeroWork && machineStatus === 'breakdown' ? 'Breakdown reason *' : 'Remarks'}
            value={form.remarks} onChange={readOnly ? undefined : set('remarks')}
            readOnly={readOnly}
            className={editInp(isZeroWork && machineStatus === 'breakdown' ? 'border-red-300' : 'border-gray-200')} />
        )}
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
          <div className="flex gap-1">
            <button onClick={() => setIsEditing(true)}
              className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg flex-1 bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700 border border-gray-200 hover:border-amber-300 transition-colors">
              <Pencil size={10} /> Edit
            </button>
            {isAdmin && (
              <button onClick={handleDelete} disabled={saving} title="Delete entry"
                className="inline-flex items-center justify-center px-2 py-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600 border border-gray-200 hover:border-red-300 transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {(!!existingEntry || openingLocked) && (
              <label className="flex items-center gap-1 cursor-pointer select-none py-0.5" title="Enable if meter was replaced — allows editing opening reading">
                <input type="checkbox" checked={meterReset} onChange={e => setMeterReset(e.target.checked)} className="w-3 h-3 cursor-pointer accent-amber-600" />
                <RefreshCw size={9} className="text-amber-600 flex-shrink-0" />
                <span className="text-[10px] text-amber-700 leading-tight">Counter Reset</span>
              </label>
            )}
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

function MachineRows({ machine, date, entries, isAdmin, canAddDpr, onSaved, onViewMonth, onViewAsset }) {
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
        onViewMonth={onViewMonth} onViewAsset={onViewAsset} onSaved={onSaved}
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
        onViewMonth={onViewMonth} onViewAsset={onViewAsset} onSaved={onSaved}
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

function DprEntryTable({ machines, allEntries, date, isAdmin, canAddDpr, onSaved, onViewMonth, onViewAsset }) {
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
            <th className={thCls} style={{ width: 80 }}>Nickname</th>
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
              onViewAsset={() => onViewAsset(m)}
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
  const mrEmpty     = { shift: '', readings: mkReadings(), n_readings: mkNReadings(), hsd: '', breakdown_hrs: '0', breakdown_min: '0', qty: '', work_done: '', n_hsd: '', n_breakdown_hrs: '0', n_breakdown_min: '0', n_qty: '', n_work_done: '', remarks: '', n_remarks: '', machine_status: null, n_machine_status: null }

  const [form,          setForm]          = useState(editData || (isMultiReading ? mrEmpty : emptyForm))
  const [loading,       setLoading]       = useState(false)
  const [loadingPrev,   setLoadingPrev]   = useState(false)
  const [toast,         setToast]         = useState(null)
  const [openingLocked, setOpeningLocked] = useState(false)
  const [meterReset,    setMeterReset]    = useState(false)

  const effectiveOpenLocked = (isEditMode || openingLocked) && !meterReset

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  useEffect(() => {
    setToast(null)
    setMeterReset(false)
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
      const r    = await getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: newShift, machine_shift_type: machine.shift_type })
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
    return { ...r, total, invalid: total !== null && total < 0,
      exceeded: total !== null && r.unit === 'Hrs' && total > SHIFT_MAX }
  }) : []
  const nComputedReadings = isMultiReading && isDual ? (form.n_readings || []).map(nr => {
    const cfg      = configs.find(c => c.reading_type_id === nr.reading_type_id)
    const dayClose = (form.readings || []).find(r => r.reading_type_id === nr.reading_type_id)?.close_value || ''
    const total    = dayClose !== '' && nr.close_value !== '' ? parseFloat(nr.close_value) - parseFloat(dayClose) : null
    return { ...nr, code: cfg?.code, reading_name: cfg?.reading_name, unit: cfg?.unit, day_close: dayClose, total,
      invalid:  total !== null && total < 0,
      exceeded: total !== null && cfg?.unit === 'Hrs' && total > SHIFT_MAX }
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
  const nightExceeded = isDual && (isMultiReading ? nComputedReadings.some(r => r.exceeded) : nightWorkHrs > SHIFT_MAX)
  const maxDayBreakdown   = Math.max(0, SHIFT_MAX - (dayWorkHrs   || 0))
  const maxNightBreakdown = Math.max(0, SHIFT_MAX - (nightWorkHrs || 0))
  const isDayZeroWork   = dayWorkHrs === 0 && (isMultiReading ? computedReadings.some(r => r.total !== null) : r1Total !== null)
  const isNightZeroWork = isDual && nightWorkHrs === 0 && (isMultiReading ? nComputedReadings.some(r => r.total !== null) : nR1Total !== null)
  const anyError      = isMultiReading
    ? (computedReadings.some(r => r.invalid) || nComputedReadings.some(r => r.invalid) || dayExceeded || nightExceeded)
    : (r1Invalid || r2Invalid || nR1Invalid || nR2Invalid || dayExceeded || nightExceeded)

  const handleDelete = async () => {
    if (!editIds?.length) return
    if (!window.confirm('Delete this DPR entry permanently?')) return
    setLoading(true); setToast(null)
    try {
      await Promise.all(editIds.map(id => deleteEntry(id)))
      onSave(); onClose()
    } catch (err) {
      setToast({ type: 'error', msg: err.response?.data?.error || 'Failed to delete' })
      setLoading(false)
    }
  }

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

    if (isDayZeroWork && !form.machine_status) {
      setToast({ type: 'error', msg: `${isDual ? 'Day Shift' : 'Shift'}: readings are same — select Idle or Breakdown.` }); return
    }
    if (isDayZeroWork && form.machine_status === 'breakdown' && !form.remarks?.trim()) {
      setToast({ type: 'error', msg: `${isDual ? 'Day Shift' : 'Shift'}: Breakdown reason is required.` }); return
    }
    if (isDayZeroWork && form.machine_status === 'idle' && !form.remarks) {
      setToast({ type: 'error', msg: `${isDual ? 'Day Shift' : 'Shift'}: Please select an idle reason.` }); return
    }
    if (isNightZeroWork && !form.n_machine_status) {
      setToast({ type: 'error', msg: 'Night Shift: readings are same — select Idle or Breakdown.' }); return
    }
    if (isNightZeroWork && form.n_machine_status === 'breakdown' && !form.n_remarks?.trim()) {
      setToast({ type: 'error', msg: 'Night Shift: Breakdown reason is required.' }); return
    }
    if (isNightZeroWork && form.n_machine_status === 'idle' && !form.n_remarks) {
      setToast({ type: 'error', msg: 'Night Shift: Please select an idle reason.' }); return
    }

    const breakdownVal  = form.machine_status   === 'idle' ? 0 : brkHrsToDecimal(form.breakdown_hrs,   form.breakdown_min)
    const nBreakdownVal = form.n_machine_status === 'idle' ? 0 : brkHrsToDecimal(form.n_breakdown_hrs, form.n_breakdown_min)
    if (!isDayZeroWork && breakdownVal > maxDayBreakdown + 0.01) {
      setToast({ type: 'error', msg: `${isDual ? 'Day Shift' : 'Shift'} breakdown (${breakdownVal.toFixed(2)} hrs) cannot exceed remaining shift time (${maxDayBreakdown.toFixed(2)} hrs).` })
      return
    }
    if (isDual && !isNightZeroWork && nBreakdownVal > maxNightBreakdown + 0.01) {
      setToast({ type: 'error', msg: `Night Shift breakdown (${nBreakdownVal.toFixed(2)} hrs) cannot exceed remaining shift time (${maxNightBreakdown.toFixed(2)} hrs).` })
      return
    }
    setLoading(true); setToast(null)
    try {
      if (isMultiReading) {
        const dayPayload   = { readings: computedReadings.map(r => ({ reading_type_id: r.reading_type_id, open_value: r.open_value || null, close_value: r.close_value || null })), hsd: form.hsd || null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null, is_idle: isDayZeroWork && form.machine_status === 'idle' }
        const nightPayload = { readings: nComputedReadings.map(r => ({ reading_type_id: r.reading_type_id, open_value: r.day_close || null, close_value: r.close_value || null })), hsd: form.n_hsd || null, breakdown: nBreakdownVal || 0, qty: form.n_qty || null, work_done: form.n_work_done || null, remarks: form.n_remarks || null, is_idle: isNightZeroWork && form.n_machine_status === 'idle' }
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
              updateEntry(editIds[0], { r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, hsd: form.hsd || null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null, is_idle: isDayZeroWork && form.machine_status === 'idle' }),
              updateEntry(editIds[1], { r1_open: form.r1_close || null, r1_close: form.n_r1_close || null, r2_open: form.r2_close || null, r2_close: form.n_r2_close || null, hsd: form.n_hsd || null, breakdown: nBreakdownVal || 0, qty: form.n_qty || null, work_done: form.n_work_done || null, remarks: form.n_remarks || null, is_idle: isNightZeroWork && form.n_machine_status === 'idle' }),
            ])
          } else {
            await updateEntry(editIds[0], { shift: form.shift, r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, hsd: form.hsd || null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null, is_idle: isDayZeroWork && form.machine_status === 'idle' })
          }
        } else if (isDual) {
          await Promise.all([
            createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: 'Day Shift',   r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, hsd: form.hsd || null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null, is_idle: isDayZeroWork && form.machine_status === 'idle' }),
            createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: 'Night Shift',  r1_open: form.r1_close || null, r1_close: form.n_r1_close || null, r2_open: form.r2_close || null, r2_close: form.n_r2_close || null, hsd: form.n_hsd || null, breakdown: nBreakdownVal || 0, qty: form.n_qty || null, work_done: form.n_work_done || null, remarks: form.n_remarks || null, is_idle: isNightZeroWork && form.n_machine_status === 'idle' }),
          ])
        } else {
          await createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: form.shift, r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, hsd: form.hsd || null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null, is_idle: isDayZeroWork && form.machine_status === 'idle' })
        }
      }
      if (meterReset) {
        const primaryReading = isMultiReading
          ? (computedReadings.find(r => r.unit === 'Hrs') || computedReadings[0])
          : null
        const newOpenReading = isMultiReading
          ? (primaryReading?.open_value || null)
          : (form.r1_open || null)
        await createMeterReset({
          machine_id:   machine.id,
          entry_date:   date,
          shift:        isDual ? 'Day Shift' : form.shift,
          reading_code: primaryReading?.code || machine.reading1_basis || null,
          new_reading:  newOpenReading,
        }).catch(() => {})
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
                <MultiReadingGrid readings={computedReadings} isNight={false} onChangeOpen={setReadingOpen} onChangeClose={setReadingClose} openLocked={effectiveOpenLocked} isAdmin={isAdmin} lbl={lbl} inp={inp} />
              ) : (
                <>
                  <ReadingRow label={`Reading 1 · ${machine.reading1_basis}`} open={form.r1_open} close={form.r1_close} total={r1Total} basis={machine.reading1_basis} invalid={r1Invalid} onOpen={set('r1_open')} onClose={set('r1_close')} required openLocked={effectiveOpenLocked} isAdmin={isAdmin} />
                  {machine.dual_reading && <ReadingRow label={`Reading 2 · ${machine.reading2_basis || 'KM'}`} open={form.r2_open} close={form.r2_close} total={r2Total} basis={machine.reading2_basis || 'KM'} invalid={r2Invalid} onOpen={set('r2_open')} onClose={set('r2_close')} openLocked={effectiveOpenLocked} isAdmin={isAdmin} />}
                </>
              )}
              {(isEditMode || openingLocked) && (
                <label className="flex items-center gap-2 cursor-pointer select-none py-1">
                  <input type="checkbox" checked={meterReset} onChange={e => setMeterReset(e.target.checked)} className="w-3.5 h-3.5 cursor-pointer accent-amber-600" />
                  <RefreshCw size={11} className="text-amber-600 flex-shrink-0" />
                  <span className="text-xs text-amber-700 font-medium">Counter / Meter Reset</span>
                  <span className="text-xs text-gray-400">(new meter installed — enter new starting reading)</span>
                </label>
              )}
              {isDayZeroWork && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-2">Day Shift: readings are same — no working hours. Select machine status:</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm(f => ({ ...f, machine_status: 'idle', breakdown_hrs: '0', breakdown_min: '0', remarks: '' }))}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-colors ${form.machine_status === 'idle' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'}`}>
                      Machine was Idle
                    </button>
                    <button type="button" onClick={() => setForm(f => ({ ...f, machine_status: 'breakdown', breakdown_hrs: String(SHIFT_MAX), breakdown_min: '0', remarks: '' }))}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-colors ${form.machine_status === 'breakdown' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-700 border-red-300 hover:bg-red-50'}`}>
                      Breakdown
                    </button>
                  </div>
                  {form.machine_status === 'idle' && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-amber-800 mb-1">Idle Reason <span className="text-red-500">*</span></label>
                      <select value={form.remarks} onChange={set('remarks')}
                        className="border border-amber-300 rounded-md px-2 py-1.5 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                        <option value="">— Select reason —</option>
                        {IDLE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  )}
                  {form.machine_status === 'breakdown' && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-red-700 mb-1">Breakdown Reason <span className="text-red-500">*</span></label>
                      <textarea rows={2} value={form.remarks} onChange={set('remarks')}
                        className="border border-red-300 rounded-md px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-red-400"
                        placeholder="Enter breakdown reason…" />
                    </div>
                  )}
                </div>
              )}
              <FuelBreakdown hsd={form.hsd} breakdownHrs={form.breakdown_hrs} breakdownMin={form.breakdown_min} qty={form.qty} workDone={form.work_done} fuelRate={dayFuelRate} machine={machine} onHsd={set('hsd')} onBreakdownHrs={set('breakdown_hrs')} onBreakdownMin={set('breakdown_min')} onQty={set('qty')} onWorkDone={set('work_done')} lbl={lbl} inp={inp} maxBreakdown={maxDayBreakdown} isIdle={isDayZeroWork && form.machine_status === 'idle'} breakdownLocked={isDayZeroWork && form.machine_status === 'breakdown'} />
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
              {isNightZeroWork && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-2">Night Shift: readings are same — no working hours. Select machine status:</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm(f => ({ ...f, n_machine_status: 'idle', n_breakdown_hrs: '0', n_breakdown_min: '0', n_remarks: '' }))}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-colors ${form.n_machine_status === 'idle' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'}`}>
                      Machine was Idle
                    </button>
                    <button type="button" onClick={() => setForm(f => ({ ...f, n_machine_status: 'breakdown', n_breakdown_hrs: String(SHIFT_MAX), n_breakdown_min: '0', n_remarks: '' }))}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-colors ${form.n_machine_status === 'breakdown' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-700 border-red-300 hover:bg-red-50'}`}>
                      Breakdown
                    </button>
                  </div>
                  {form.n_machine_status === 'idle' && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-amber-800 mb-1">Idle Reason <span className="text-red-500">*</span></label>
                      <select value={form.n_remarks} onChange={set('n_remarks')}
                        className="border border-amber-300 rounded-md px-2 py-1.5 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                        <option value="">— Select reason —</option>
                        {IDLE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  )}
                  {form.n_machine_status === 'breakdown' && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-red-700 mb-1">Breakdown Reason <span className="text-red-500">*</span></label>
                      <textarea rows={2} value={form.n_remarks} onChange={set('n_remarks')}
                        className="border border-red-300 rounded-md px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-red-400"
                        placeholder="Enter breakdown reason…" />
                    </div>
                  )}
                </div>
              )}
              <FuelBreakdown hsd={form.n_hsd} breakdownHrs={form.n_breakdown_hrs} breakdownMin={form.n_breakdown_min} qty={form.n_qty} workDone={form.n_work_done} fuelRate={nightFuelRate} machine={machine} onHsd={set('n_hsd')} onBreakdownHrs={set('n_breakdown_hrs')} onBreakdownMin={set('n_breakdown_min')} onQty={set('n_qty')} onWorkDone={set('n_work_done')} lbl={lbl} inp={inp} maxBreakdown={maxNightBreakdown} isIdle={isNightZeroWork && form.n_machine_status === 'idle'} breakdownLocked={isNightZeroWork && form.n_machine_status === 'breakdown'} />
            </div>
          )}
          {!isDual && (
            <>
              {isMultiReading ? (
                <MultiReadingGrid readings={computedReadings} isNight={false} onChangeOpen={setReadingOpen} onChangeClose={setReadingClose} openLocked={effectiveOpenLocked} isAdmin={isAdmin} lbl={lbl} inp={inp} />
              ) : (
                <>
                  <ReadingRow label={`Reading 1 · ${machine.reading1_basis}`} open={form.r1_open} close={form.r1_close} total={r1Total} basis={machine.reading1_basis} invalid={r1Invalid} onOpen={set('r1_open')} onClose={set('r1_close')} required openLocked={effectiveOpenLocked} isAdmin={isAdmin} />
                  {machine.dual_reading && <ReadingRow label={`Reading 2 · ${machine.reading2_basis || 'KM'}`} open={form.r2_open} close={form.r2_close} total={r2Total} basis={machine.reading2_basis || 'KM'} invalid={r2Invalid} onOpen={set('r2_open')} onClose={set('r2_close')} openLocked={effectiveOpenLocked} isAdmin={isAdmin} />}
                </>
              )}
              {(isEditMode || openingLocked) && (
                <label className="flex items-center gap-2 cursor-pointer select-none py-1">
                  <input type="checkbox" checked={meterReset} onChange={e => setMeterReset(e.target.checked)} className="w-3.5 h-3.5 cursor-pointer accent-amber-600" />
                  <RefreshCw size={11} className="text-amber-600 flex-shrink-0" />
                  <span className="text-xs text-amber-700 font-medium">Counter / Meter Reset</span>
                  <span className="text-xs text-gray-400">(new meter installed — enter new starting reading)</span>
                </label>
              )}
              {isDayZeroWork && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-2">Readings are same — no working hours recorded. Select machine status:</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm(f => ({ ...f, machine_status: 'idle', breakdown_hrs: '0', breakdown_min: '0', remarks: '' }))}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-colors ${form.machine_status === 'idle' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'}`}>
                      Machine was Idle
                    </button>
                    <button type="button" onClick={() => setForm(f => ({ ...f, machine_status: 'breakdown', breakdown_hrs: String(SHIFT_MAX), breakdown_min: '0', remarks: '' }))}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-colors ${form.machine_status === 'breakdown' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-700 border-red-300 hover:bg-red-50'}`}>
                      Breakdown
                    </button>
                  </div>
                  {form.machine_status === 'idle' && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-amber-800 mb-1">Idle Reason <span className="text-red-500">*</span></label>
                      <select value={form.remarks} onChange={set('remarks')}
                        className="border border-amber-300 rounded-md px-2 py-1.5 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                        <option value="">— Select reason —</option>
                        {IDLE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  )}
                  {form.machine_status === 'breakdown' && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-red-700 mb-1">Breakdown Reason <span className="text-red-500">*</span></label>
                      <textarea rows={2} value={form.remarks} onChange={set('remarks')}
                        className="border border-red-300 rounded-md px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-red-400"
                        placeholder="Enter breakdown reason…" />
                    </div>
                  )}
                </div>
              )}
              <FuelBreakdown hsd={form.hsd} breakdownHrs={form.breakdown_hrs} breakdownMin={form.breakdown_min} qty={form.qty} workDone={form.work_done} fuelRate={dayFuelRate} machine={machine} onHsd={set('hsd')} onBreakdownHrs={set('breakdown_hrs')} onBreakdownMin={set('breakdown_min')} onQty={set('qty')} onWorkDone={set('work_done')} lbl={lbl} inp={inp} maxBreakdown={maxDayBreakdown} isIdle={isDayZeroWork && form.machine_status === 'idle'} breakdownLocked={isDayZeroWork && form.machine_status === 'breakdown'} />
            </>
          )}
          {!((isDayZeroWork && form.machine_status) || (isNightZeroWork && form.n_machine_status)) && (
            <div>
              <label className={lbl}>Remarks</label>
              <textarea rows={2} value={form.remarks} onChange={set('remarks')} className={inp} placeholder="Optional" />
            </div>
          )}
          {toast && (
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {toast.msg}
            </div>
          )}
          <div className="flex gap-3">
            {isEditMode && isAdmin && (
              <button type="button" onClick={handleDelete} disabled={loading} title="Delete this entry permanently"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 text-sm font-medium transition-colors disabled:opacity-50">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            )}
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
                {!isNight && openLocked && <Lock size={10} className="inline ml-1 text-gray-400" />}
              </label>
              <input type="number" step="0.01" placeholder="0.00"
                value={isNight ? (r.day_close || '') : r.open_value}
                readOnly={isNight || openLocked}
                onChange={(!isNight && !openLocked) ? e => onChangeOpen(r.reading_type_id, e.target.value) : undefined}
                className={`${inp} ${isNight || openLocked ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
              />
              {!isNight && openLocked && <p className="text-[10px] text-gray-500 mt-0.5">Carried from previous shift</p>}
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
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{label}</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={lbl}>Opening{openLocked && <Lock size={10} className="inline ml-1 text-gray-400" />}</label>
          <input type="number" step="0.01" value={open} onChange={openLocked ? undefined : onOpen} readOnly={openLocked}
            className={`${inp} ${openLocked ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`} placeholder="0.00" required={required} />
          {openLocked && <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1"><Lock size={8} /> Carried from previous shift</p>}
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

function FuelBreakdown({ hsd, breakdownHrs, breakdownMin, qty, workDone, fuelRate, machine, onHsd, onBreakdownHrs, onBreakdownMin, onQty, onWorkDone, lbl, inp, maxBreakdown, isIdle, breakdownLocked }) {
  const breakdownTotal = brkHrsToDecimal(breakdownHrs, breakdownMin)
  const brkOver = !breakdownLocked && maxBreakdown != null && breakdownTotal > maxBreakdown + 0.01
  const roInp = `${inp} bg-gray-50 text-gray-600 cursor-not-allowed`
  return (
    <>
      <div className={`grid gap-4 ${isIdle ? '' : 'grid-cols-2'}`}>
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
        {!isIdle && (
          <div>
            <label className={lbl}>Breakdown{!breakdownLocked && maxBreakdown != null && <span className="font-normal text-gray-400 ml-1">(max {maxBreakdown.toFixed(2)} hrs)</span>}</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <input type="number" readOnly={breakdownLocked} min="0" step="1" max={maxBreakdown != null ? Math.floor(maxBreakdown) : undefined} value={breakdownHrs} onChange={breakdownLocked ? undefined : onBreakdownHrs} className={`${breakdownLocked ? roInp : inp} ${brkOver ? 'border-red-500' : ''}`} placeholder="0" />
                <p className="text-[10px] text-gray-400 mt-0.5 text-center">hrs</p>
              </div>
              <div className="flex-1">
                <select disabled={breakdownLocked} value={breakdownMin} onChange={breakdownLocked ? undefined : onBreakdownMin} className={breakdownLocked ? roInp : inp}>{MIN_OPTIONS.map(m => <option key={m} value={m}>{pad(m)} min</option>)}</select>
                <p className="text-[10px] text-gray-400 mt-0.5 text-center">min</p>
              </div>
            </div>
            {breakdownLocked
              ? <p className="text-xs text-red-600 mt-1 font-medium">Full shift breakdown — {SHIFT_MAX} hrs (locked)</p>
              : brkOver
                ? <p className="text-xs text-red-600 mt-1 font-medium">Exceeds remaining shift time ({maxBreakdown.toFixed(2)} hrs)</p>
                : breakdownTotal > 0 && <p className="text-xs text-blue-600 mt-1 font-medium">= {breakdownTotal.toFixed(2)} hrs</p>
            }
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className={lbl}>Quantity</label><input type="number" step="0.01" value={qty} onChange={onQty} className={inp} placeholder="Optional" /></div>
        {!isIdle && <div><label className={lbl}>Work Done</label><input type="text" value={workDone} onChange={onWorkDone} className={inp} placeholder="Brief description" /></div>}
      </div>
    </>
  )
}

// ── Month Grid Panel ──────────────────────────────────────────────────────────

function MonthGridPanel({ machine, onBack, onEntrySaved, isAdmin, canAddDpr, prevDayDate, prevDayCompleted, prevDayTotal, projectCode }) {
  const now = new Date()
  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth() + 1)
  const [entries,   setEntries]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [formOpen,  setFormOpen]  = useState(null)
  const [editOpen,  setEditOpen]  = useState(null)
  const [dlLoading, setDlLoading] = useState(null)
  const [dlFrom,    setDlFrom]    = useState(() => { const m = now.getMonth() + 1; return `${now.getFullYear()}-${pad(m)}-01` })
  const [dlTo,      setDlTo]      = useState(() => { const m = now.getMonth() + 1; const d = new Date(now.getFullYear(), m, 0).getDate(); return `${now.getFullYear()}-${pad(m)}-${pad(d)}` })

  // Fuel record state
  const [fuelForm,    setFuelForm]    = useState({ opening_balance: '', closing_balance: '' })
  const [fuelSaving,  setFuelSaving]  = useState(false)
  const [fuelMsg,     setFuelMsg]     = useState(null)
  const [fuelRecord,  setFuelRecord]  = useState(null)

  const todayStr = today()

  const dim  = new Date(year, month, 0).getDate()
  const from = `${year}-${pad(month)}-01`
  const to   = `${year}-${pad(month)}-${pad(dim)}`

  // (dlFrom/dlTo are set via prevMonth/nextMonth and the dlFrom date picker — not synced via effect)

  // Load fuel record whenever machine or month changes.
  // Opening balance is always derived from previous month's closing — never from saved DB value.
  useEffect(() => {
    setFuelRecord(null)
    setFuelMsg(null)
    setFuelForm({ opening_balance: '', closing_balance: '' })

    const prevM   = month === 1 ? 12 : month - 1
    const prevY   = month === 1 ? year - 1 : year
    const prevDim = new Date(prevY, prevM, 0).getDate()
    const prevFrom = `${prevY}-${pad(prevM)}-01`
    const prevTo   = `${prevY}-${pad(prevM)}-${pad(prevDim)}`

    Promise.all([
      getFuelRecord({ machine_id: machine.id, period_from: from,    period_to: to }),
      getFuelRecord({ machine_id: machine.id, period_from: prevFrom, period_to: prevTo }),
    ]).then(([currRes, prevRes]) => {
      const rec     = currRes.data.data
      const prevRec = prevRes.data.data
      const openingBalance = prevRec?.closing_balance ?? ''

      if (rec) setFuelRecord(rec)
      setFuelForm({
        opening_balance: openingBalance,
        closing_balance: rec?.closing_balance ?? '',
      })
    }).catch(() => {})
  }, [machine.id, from, to, month, year])

  const load = useCallback(() => {
    setLoading(true)
    getEntries({ machine_id: machine.id, from, to })
      .then(r => setEntries(r.data.data || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [machine.id, year, month])

  useEffect(() => { load() }, [load])

  const handleFuelSave = async () => {
    setFuelSaving(true); setFuelMsg(null)
    try {
      const res = await upsertFuelRecord({
        machine_id:      machine.id,
        period_from:     from,
        period_to:       to,
        opening_balance: parseFloat(fuelForm.opening_balance) || 0,
        closing_balance: parseFloat(fuelForm.closing_balance) || 0,
      })
      setFuelRecord(res.data.data)
      setFuelMsg({ type: 'ok', text: 'Saved' })
      setTimeout(() => setFuelMsg(null), 2500)
    } catch (err) {
      setFuelMsg({ type: 'err', text: err.response?.data?.error || 'Save failed' })
    } finally {
      setFuelSaving(false)
    }
  }

  const handleDownload = async (format) => {
    if (!dlFrom || !dlTo) return
    setDlLoading(format)
    try {
      const res = await getEntries({ machine_id: machine.id, from: dlFrom, to: dlTo })
      // fuelRecord in state is always for the currently displayed month (loaded by useEffect on machine/month change)
      await downloadDPRForMachine(machine, res.data.data || [], dlFrom, dlTo, projectCode || 'Project', format, fuelRecord)
    } catch (e) {
      alert('Download failed: ' + (e.message || 'Unknown error'))
    } finally {
      setDlLoading(null)
    }
  }

  const prevMonth = () => {
    const newM = month === 1 ? 12 : month - 1
    const newY = month === 1 ? year - 1 : year
    const newDim = new Date(newY, newM, 0).getDate()
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
    setDlFrom(`${newY}-${pad(newM)}-01`)
    setDlTo(`${newY}-${pad(newM)}-${pad(newDim)}`)
  }
  const nextMonth = () => {
    const newM = month === 12 ? 1 : month + 1
    const newY = month === 12 ? year + 1 : year
    const newDim = new Date(newY, newM, 0).getDate()
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
    setDlFrom(`${newY}-${pad(newM)}-01`)
    setDlTo(`${newY}-${pad(newM)}-${pad(newDim)}`)
  }

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
  const totalHsdMo     = entries.reduce((s, e) => s + (parseFloat(e.hsd) || 0), 0)
  const isCurrentMonth = year === now.getFullYear() && month === (now.getMonth() + 1)

  // Clamp dlFrom/dlTo to current month for in-app filtering
  const effectiveViewFrom = dlFrom && dlFrom > from ? dlFrom : from
  const effectiveViewTo   = dlTo   && dlTo   < to   ? dlTo   : to
  const isRangeFiltered   = effectiveViewFrom !== from || effectiveViewTo !== to
  const rangeOutsideMonth = effectiveViewFrom > effectiveViewTo

  const viewEntries       = (isRangeFiltered && !rangeOutsideMonth)
    ? entries.filter(e => { const d = (e.entry_date || '').slice(0, 10); return d >= effectiveViewFrom && d <= effectiveViewTo })
    : entries
  const viewSubmittedDays = new Set(viewEntries.map(e => (e.entry_date || '').slice(0, 10))).size
  const viewWorkHrsMo     = viewEntries.reduce((s, e) => s + parseFloat(e.working_hours || 0), 0)
  const viewHsdMo         = viewEntries.reduce((s, e) => s + (parseFloat(e.hsd) || 0), 0)
  const viewDaysCount     = rangeOutsideMonth ? 0
    : isRangeFiltered
      ? Array.from({ length: daysInMonth }, (_, i) => { const ds = `${year}-${pad(month)}-${pad(i + 1)}`; return ds >= effectiveViewFrom && ds <= effectiveViewTo ? 1 : 0 }).reduce((s, v) => s + v, 0)
      : daysInMonth
  const isDualMachine    = machine.shift_type === 'Dual Shift'
  const todayTimingCheck = isDualMachine ? checkEntryTiming(todayStr, 'Dual Shift') : { allowed: true }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50 flex-wrap gap-y-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{machine.nickname || machine.slno} · {machine.eq_type}{machine.capacity ? ` · ${machine.capacity}` : ''}</p>
          <p className="text-xs text-gray-400 truncate">{machine.slno} · {machine.reg_no || '—'} · {machine.shift_type || 'Single Shift'} · {machine.ownership}</p>
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

      {/* Download bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/60 flex-wrap">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex-shrink-0">Download DPR</span>
        <div className="h-3 w-px bg-gray-300 flex-shrink-0" />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <label className="text-[11px] text-gray-500">From</label>
          <input type="date" value={dlFrom} onChange={e => {
            const val = e.target.value
            setDlFrom(val)
            if (val) {
              const [y, m] = val.split('-').map(Number)
              setYear(y)
              setMonth(m)
              // If dlTo is in a different month, reset it to end of the new month
              const toY = dlTo ? parseInt(dlTo.split('-')[0]) : 0
              const toM = dlTo ? parseInt(dlTo.split('-')[1]) : 0
              if (toY !== y || toM !== m) {
                const dim = new Date(y, m, 0).getDate()
                setDlTo(`${y}-${pad(m)}-${pad(dim)}`)
              }
            }
          }}
            className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <label className="text-[11px] text-gray-500">To</label>
          <input type="date" value={dlTo} onChange={e => setDlTo(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <button onClick={() => handleDownload('excel')} disabled={!!dlLoading || !dlFrom || !dlTo}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50 flex-shrink-0">
          {dlLoading === 'excel' ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
          Excel
        </button>
        <button onClick={() => handleDownload('pdf')} disabled={!!dlLoading || !dlFrom || !dlTo}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50 flex-shrink-0">
          {dlLoading === 'pdf' ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
          PDF
        </button>
      </div>

      {/* Fuel Record bar */}
      {(() => {
        const ob       = parseFloat(fuelForm.opening_balance) || 0
        const cb       = parseFloat(fuelForm.closing_balance) || 0
        const issued   = totalHsdMo                              // auto from DPR entries
        const consumed = ob + issued - cb
        return (
          <div className="px-4 py-2 border-b border-gray-100 bg-amber-50/60">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide flex-shrink-0">Fuel Record</span>
              <div className="h-3 w-px bg-amber-300 flex-shrink-0" />

              {/* Opening Balance — carried from previous month's closing (read-only) */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <label className="text-[11px] text-amber-700 flex items-center gap-0.5">
                  <Lock size={9} /> Opening Balance
                </label>
                <span className="w-20 border border-amber-100 rounded-md px-2 py-1 text-xs font-semibold text-amber-900 bg-amber-100/70 text-right select-none">
                  {fuelForm.opening_balance !== '' ? Number(fuelForm.opening_balance).toFixed(2) : '—'}
                </span>
                <span className="text-[10px] text-amber-600">L</span>
              </div>

              {/* Total Issued — auto from DPR */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <label className="text-[11px] text-amber-700">Total Issued (DPR)</label>
                <span className="w-20 border border-amber-100 rounded-md px-2 py-1 text-xs font-semibold text-amber-900 bg-amber-100 text-right">{issued.toFixed(2)}</span>
                <span className="text-[10px] text-amber-600">L</span>
              </div>

              {/* Closing Balance — manual */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <label className="text-[11px] text-amber-700">Closing Balance</label>
                <input
                  type="number" min="0" step="0.01"
                  value={fuelForm.closing_balance}
                  onChange={e => setFuelForm(f => ({ ...f, closing_balance: e.target.value }))}
                  className="w-20 border border-amber-200 rounded-md px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                  placeholder="0"
                />
                <span className="text-[10px] text-amber-600">L</span>
              </div>

              <div className="h-3 w-px bg-amber-300 flex-shrink-0" />

              {/* Consumed — auto formula */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[11px] text-amber-700 font-medium">Consumed:</span>
                <span className="text-[12px] font-bold text-amber-900">{consumed.toFixed(2)} L</span>
                <span className="text-[10px] text-amber-500">= {ob} + {issued.toFixed(2)} − {cb}</span>
              </div>

              <button onClick={handleFuelSave} disabled={fuelSaving}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors disabled:opacity-50 flex-shrink-0">
                {fuelSaving ? <Loader2 size={11} className="animate-spin" /> : null}
                Save
              </button>
              {fuelMsg && (
                <span className={`text-[11px] flex-shrink-0 ${fuelMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                  {fuelMsg.text}
                </span>
              )}
              {fuelRecord && (
                <span className="text-[10px] text-amber-500 flex-shrink-0 ml-auto">Saved ✓</span>
              )}
            </div>
          </div>
        )
      })()}

      {!loading && viewEntries.length > 0 && (
        <div className="flex items-center gap-5 px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-800 flex-wrap">
          <span><span className="font-bold">{viewSubmittedDays}</span> / {viewDaysCount} days {isRangeFiltered ? 'in range' : 'logged'}</span>
          <span><span className="font-bold">{viewWorkHrsMo.toFixed(1)}</span> hrs total</span>
          {viewHsdMo > 0 && <span><span className="font-bold">{viewHsdMo.toFixed(1)}</span> L HSD</span>}
          {viewWorkHrsMo > 0 && viewHsdMo > 0 && <span>Avg <span className="font-bold">{(viewHsdMo / viewWorkHrsMo).toFixed(2)}</span> L/hr</span>}
          {isRangeFiltered && <span className="ml-auto text-blue-600 font-medium">Filtered: {effectiveViewFrom} – {effectiveViewTo}</span>}
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
              {Array.from({ length: daysInMonth }, (_, i) => i + 1)
                .filter(d => {
                  if (rangeOutsideMonth) return false
                  const ds = `${year}-${pad(month)}-${pad(d)}`
                  return !isRangeFiltered || (ds >= effectiveViewFrom && ds <= effectiveViewTo)
                })
                .map(d => {
                const dateStr  = `${year}-${pad(month)}-${pad(d)}`
                const dayEnts  = entryMap[dateStr] || []
                const hasEntry = dayEnts.length > 0
                const isFuture = dateStr > todayStr
                const isToday  = dateStr === todayStr
                const dayName  = DAY_NAMES[new Date(dateStr + 'T00:00:00').getDay()]
                const totalWH  = dayEnts.reduce((s, e) => s + parseFloat(e.working_hours || 0), 0)
                const totalHSD = dayEnts.reduce((s, e) => s + (parseFloat(e.hsd) || 0), 0)
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
                const shiftSortOrder = { 'Day Shift': 0, 'Night Shift': 1 }
                const sortedEnts = (isDualMachine && dayEnts.length >= 2)
                  ? [...dayEnts].sort((a, b) => (shiftSortOrder[a.shift] ?? 9) - (shiftSortOrder[b.shift] ?? 9))
                  : null
                return (
                  <React.Fragment key={d}>
                    {sortedEnts ? (
                      sortedEnts.map((ent, ei) => {
                        const entWH     = parseFloat(ent.working_hours || 0)
                        const entHSD    = parseFloat(ent.hsd) || 0
                        const entBK     = parseFloat(ent.breakdown || 0)
                        const entBkDisp = entBK > 0 ? (() => { const h = Math.floor(entBK); const m = Math.round((entBK - h) * 60); return m > 0 ? `${h}h ${pad(m)}m` : `${h}h` })() : null
                        const isFirst   = ei === 0
                        const trCls = isFirst
                          ? rowCls
                          : `border-b border-gray-100 transition-colors ${isFuture ? 'opacity-40' : 'bg-green-50/20 hover:bg-green-50/50'}`
                        return (
                          <tr key={ei} className={trCls}>
                            {isFirst && <td rowSpan={2} className={`px-3 py-2.5 text-xs font-mono tabular-nums align-top pt-3 ${textMuted}`}>{d}</td>}
                            {isFirst && <td rowSpan={2} className="px-3 py-2.5 whitespace-nowrap align-top pt-3">
                              <span className={`text-xs ${textNorm}`}><span className={`mr-1 ${textMuted}`}>{dayName}</span>{pad(d)} {MONTH_ABR[month - 1]}</span>
                              {isToday && <span className="ml-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold tracking-wide">TODAY</span>}
                            </td>}
                            <td className={`px-3 py-2 text-xs font-medium ${!isFuture ? (ent.shift === 'Day Shift' ? 'text-blue-700' : 'text-indigo-700') : textMuted}`}>
                              {ent.shift}
                            </td>
                            <td className={`px-3 py-2 text-right text-xs tabular-nums font-mono ${!isFuture ? 'text-gray-800 font-semibold' : textMuted}`}>
                              {ent.is_idle ? <span className="inline-flex items-center text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">IDLE</span> : entWH > 0 ? entWH.toFixed(2) : '—'}
                            </td>
                            <td className={`px-3 py-2 text-right text-xs tabular-nums font-mono ${!isFuture && entHSD > 0 ? 'text-gray-600' : textMuted}`}>
                              {entHSD > 0 ? entHSD.toFixed(2) : '—'}
                            </td>
                            <td className={`px-3 py-2 text-right text-xs tabular-nums font-mono ${!isFuture && entBK > 0 ? 'text-red-600 font-semibold' : textMuted}`}>
                              {entBkDisp || '—'}
                            </td>
                            <td className={`px-3 py-2 text-xs ${!isFuture ? 'text-gray-600' : textMuted}`}>
                              <span className="truncate block max-w-[180px]" title={ent.work_done || ''}>{ent.work_done || '—'}</span>
                            </td>
                            {isFirst && <td rowSpan={2} className="px-3 py-2.5 text-center align-top pt-3">
                              <div className="flex items-center justify-center gap-2">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap"><CheckCircle2 size={10} /> Submitted</span>
                                {!isFuture && <button onClick={handleEdit} className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-blue-700 hover:bg-blue-50 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap" title="Edit this DPR entry"><Pencil size={10} /> Edit</button>}
                              </div>
                            </td>}
                          </tr>
                        )
                      })
                    ) : (
                      <tr className={rowCls}>
                        <td className={`px-3 py-2.5 text-xs font-mono tabular-nums ${textMuted}`}>{d}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`text-xs ${textNorm}`}><span className={`mr-1 ${textMuted}`}>{dayName}</span>{pad(d)} {MONTH_ABR[month - 1]}</span>
                          {isToday && <span className="ml-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold tracking-wide">TODAY</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-xs ${hasEntry && !isFuture ? 'text-gray-600' : textMuted}`}>{hasEntry ? shifts : '—'}</td>
                        <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-mono ${hasEntry && !isFuture ? 'text-gray-800 font-semibold' : textMuted}`}>{hasEntry ? (dayEnts.every(e => e.is_idle) ? <span className="inline-flex items-center text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">IDLE</span> : totalWH.toFixed(2)) : '—'}</td>
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
                    )}
                  </React.Fragment>
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
  const { user }    = useAuth()
  const isAdmin     = user?.role === 'admin'
  const location    = useLocation()
  const navigate    = useNavigate()
  const pendingMachineId  = useRef(null)
  const machineCache      = useRef({})
  const fetchingMachines  = useRef(false)

  const [projects,        setProjects]        = useState([])
  const [project,         setProject]         = useState('')
  const [date,            setDate]            = useState(today())
  const [dprStatus,       setDprStatus]       = useState(null)
  const [dprLoading,      setDprLoading]      = useState(false)
  const [allEntries,      setAllEntries]      = useState([])
  const [entriesLoading,  setEntriesLoading]  = useState(false)
  const [selectedMachine, setSelectedMachine] = useState(null)
  const [detailMachine,   setDetailMachine]   = useState(null)
  const [search,          setSearch]          = useState('')
  const [typeFilter,      setTypeFilter]      = useState('')

  // Handle incoming router state from MachineDetailPanel "Log Entry" tab.
  // Runs on mount AND on every same-route navigation (when already on /entry).
  useEffect(() => {
    const s = location.state
    if (!s?.machine_id || !s?.project_code) return

    // Clear the state immediately so a refresh doesn't re-trigger.
    navigate(location.pathname, { replace: true, state: null })
    pendingMachineId.current = s.machine_id

    if (s.project_code === project && dprStatus?.machines?.length > 0) {
      // Already on the right project with data loaded — select immediately.
      const machine = dprStatus.machines.find(m => m.id === s.machine_id)
      if (machine) {
        setSelectedMachine(machine)
        pendingMachineId.current = null
        return
      }
    }

    // Project differs or data not loaded yet — set project to trigger a fresh load.
    // The dprStatus effect below will pick up pendingMachineId once data arrives.
    if (s.project_code !== project) setProject(s.project_code)
  }, [location.state]) // eslint-disable-line react-hooks/exhaustive-deps

  // After dprStatus loads, auto-select the pending machine (deferred path).
  useEffect(() => {
    if (pendingMachineId.current && dprStatus?.machines?.length > 0) {
      const machine = dprStatus.machines.find(m => m.id === pendingMachineId.current)
      if (machine) {
        setSelectedMachine(machine)
        pendingMachineId.current = null
      }
    }
  }, [dprStatus])

  useEffect(() => {
    getProjects().then(r => {
      const ps = r.data.data
      setProjects(ps)
      // Don't auto-set project if we already have one (from panel navigation or prior state).
      if (ps.length === 1 && !project && !pendingMachineId.current) setProject(ps[0].code)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const openAssetDetail = useCallback(async (partialMachine) => {
    if (machineCache.current[partialMachine.id]) {
      setDetailMachine(machineCache.current[partialMachine.id])
      return
    }
    if (fetchingMachines.current) return  // already fetching — ignore duplicate click
    fetchingMachines.current = true
    try {
      const r = await getMachines({ project_code: project })
      for (const m of r.data.data) machineCache.current[m.id] = m
      const full = machineCache.current[partialMachine.id]
      if (full) setDetailMachine(full)
    } catch (_) {}
    fetchingMachines.current = false
  }, [project])

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

  if (selectedMachine) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
        <div className="p-4 md:p-6 space-y-3">
          <button
            onClick={() => setSelectedMachine(null)}
            className="inline-flex items-center justify-center w-9 h-9 text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
            title="Back to Log Entry"
          >
            <ChevronLeft size={20} />
          </button>
          <MonthGridPanel
            machine={selectedMachine}
            onBack={() => setSelectedMachine(null)}
            onEntrySaved={handleEntrySaved}
            isAdmin={isAdmin}
            canAddDpr={canAddDpr}
            prevDayDate={dprStatus?.prev_day_date}
            prevDayCompleted={dprStatus?.prev_day_completed}
            prevDayTotal={dprStatus?.total}
            projectCode={project}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center justify-center w-9 h-9 text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex-shrink-0"
          title="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Log Entry</h1>
        {project && dprStatus && (
          <button
            onClick={() => { loadDprStatus(project, date); loadAllEntries(project, date) }}
            disabled={dprLoading || entriesLoading}
            className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
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

      {/* ── DPR Entry Table ── */}
      {project && dprStatus && allMachines.length > 0 && (
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
              onViewAsset={openAssetDetail}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
              No assets match your filter.{' '}
              <button onClick={() => { setSearch(''); setTypeFilter('') }} className="text-blue-600 hover:underline">Clear filters</button>
            </div>
          )}
        </>
      )}

      {detailMachine && (
        <MachineDetailPanel
          machine={detailMachine}
          onClose={() => setDetailMachine(null)}
        />
      )}
    </div>
    </div>
  )
}
