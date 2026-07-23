import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getProjects, getMachines, getEntries, createEntry, updateEntry, deleteEntry, getPreviousClosing, getLatestReadingBefore, checkDprExistsAfter, getDprStatus,
  getFuelRecord, upsertFuelRecord, getMachineLastEntry,
  getMeterResets, createMeterResetRequest, getMeterResetRequests,
  deleteAllEntriesForMachine, getOperators,
} from '../lib/api'
import MachineDetailPanel from '../components/MachineDetailPanel'
import EditAssetModal from './asset-register/EditAssetModal'
import { today } from '../lib/utils'
import {
  CheckCircle2, Clock, ChevronLeft, ChevronRight, ChevronDown,
  X, CalendarDays, CheckCircle, AlertCircle, Loader2, RefreshCw, Search, Lock, Pencil, Trash2,
  FileSpreadsheet, FileText, Eye, XCircle, RotateCcw, Minimize2, Maximize2, AlertTriangle, Download,
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
  hsd: '', diesel_rate: '',
  breakdown_hrs: '', breakdown_min: '0',
  qty: '', work_done: '',
  n_r1_open: '', n_r2_open: '',
  n_r1_close: '', n_r2_close: '',
  n_hsd: '', n_diesel_rate: '',
  n_breakdown_hrs: '', n_breakdown_min: '0',
  n_qty: '', n_work_done: '',
  remarks: '',
  n_remarks: '',
  machine_status: null, n_machine_status: null,
  operator_id: '',
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
        return { reading_type_id: rc.reading_type_id, open_value: log?.open_value != null ? String(log.open_value) : '', close_value: log?.close_value != null ? String(log.close_value) : '' }
      }),
      hsd:             dayEntry?.hsd != null ? String(dayEntry.hsd) : '',
      diesel_rate:     dayEntry?.diesel_rate != null ? String(dayEntry.diesel_rate) : '',
      breakdown_hrs:   d.hrs,
      breakdown_min:   d.min,
      qty:             dayEntry?.qty != null ? String(dayEntry.qty) : '',
      work_done:       dayEntry?.work_done || '',
      n_hsd:           nightEntry?.hsd != null ? String(nightEntry.hsd) : '',
      n_diesel_rate:   nightEntry?.diesel_rate != null ? String(nightEntry.diesel_rate) : '',
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
    diesel_rate:     dayEntry?.diesel_rate != null ? String(dayEntry.diesel_rate) : '',
    breakdown_hrs:   d.hrs,
    breakdown_min:   d.min,
    qty:             dayEntry?.qty != null ? String(dayEntry.qty) : '',
    work_done:       dayEntry?.work_done || '',
    n_r1_open:       nightEntry?.r1_open  != null ? String(nightEntry.r1_open)  : '',
    n_r2_open:       nightEntry?.r2_open  != null ? String(nightEntry.r2_open)  : '',
    n_r1_close:      nightEntry?.r1_close != null ? String(nightEntry.r1_close) : '',
    n_r2_close:      nightEntry?.r2_close != null ? String(nightEntry.r2_close) : '',
    n_hsd:           nightEntry?.hsd != null ? String(nightEntry.hsd) : '',
    n_diesel_rate:   nightEntry?.diesel_rate != null ? String(nightEntry.diesel_rate) : '',
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

function buildShiftEditForm(machine, entry) {
  const isMultiReading = machine.reading_configs?.length > 0
  const configs        = machine.reading_configs || []
  const { hrs, min }   = decimalToHrsMin(entry?.breakdown)
  if (isMultiReading) {
    return {
      shift:         entry?.shift || '',
      readings:      configs.map(rc => {
        const log = entry?.reading_logs?.find(l => l.reading_type_id === rc.reading_type_id)
        return { reading_type_id: rc.reading_type_id, code: rc.code, reading_name: rc.reading_name, unit: rc.unit,
          open_value:  log?.open_value  != null ? String(log.open_value)  : '',
          close_value: log?.close_value != null ? String(log.close_value) : '' }
      }),
      hsd:           entry?.hsd         != null ? String(entry.hsd)         : '',
      diesel_rate:   entry?.diesel_rate != null ? String(entry.diesel_rate) : '',
      breakdown_hrs: hrs, breakdown_min: min,
      qty:           entry?.qty         != null ? String(entry.qty)         : '',
      work_done:     entry?.work_done   || '',
      remarks:       entry?.remarks     || '',
      machine_status: entry?.is_idle ? 'idle' : (parseFloat(entry?.breakdown) > 0 ? 'breakdown' : null),
    }
  }
  return {
    shift:         entry?.shift       || '',
    r1_open:       entry?.r1_open     != null ? String(entry.r1_open)     : '',
    r1_close:      entry?.r1_close    != null ? String(entry.r1_close)    : '',
    r2_open:       entry?.r2_open     != null ? String(entry.r2_open)     : '',
    r2_close:      entry?.r2_close    != null ? String(entry.r2_close)    : '',
    hsd:           entry?.hsd         != null ? String(entry.hsd)         : '',
    diesel_rate:   entry?.diesel_rate != null ? String(entry.diesel_rate) : '',
    breakdown_hrs: hrs, breakdown_min: min,
    qty:           entry?.qty         != null ? String(entry.qty)         : '',
    work_done:     entry?.work_done   || '',
    remarks:       entry?.remarks     || '',
    machine_status: entry?.is_idle ? 'idle' : (parseFloat(entry?.breakdown) > 0 ? 'breakdown' : null),
  }
}

// ── Inline shift row ──────────────────────────────────────────────────────────

function ShiftRow({
  machine, date, shift,
  existingEntry, dayR1Close, onR1CloseChange,
  dayReadingsClose, onReadingsCloseChange,
  isFirst, rowSpan, onViewMonth, onViewAsset,
  onSaved, isAdmin, canAddDpr,
  sequentialBlock,
  editLocked,
  operators,
  allEntries,
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
        operator_id:   existingEntry?.operator_id ? String(existingEntry.operator_id) : '',
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
        operator_id:   existingEntry.operator_id ? String(existingEntry.operator_id) : '',
      }
    }
    if (isMultiReading) return { shift: shift || '', readings: buildReadings(null), hsd: '', breakdown_hrs: '0', breakdown_min: '0', qty: '', work_done: '', remarks: '', operator_id: '' }
    return { shift: shift || '', r1_open: '', r1_close: '', hsd: '', breakdown_hrs: '0', breakdown_min: '0', qty: '', work_done: '', remarks: '', operator_id: '' }
  }, [existingEntry, shift, isMultiReading])

  const [form,          setForm]          = useState(initForm)
  const [saving,        setSaving]        = useState(false)
  const [isSaved,       setIsSaved]       = useState(!!existingEntry)
  const [isEditing,     setIsEditing]     = useState(!existingEntry)
  const [errorMsg,      setErrorMsg]      = useState('')
  const [openingLocked, setOpeningLocked] = useState(false)
  const [midShiftReset, setMidShiftReset] = useState(() =>
    existingEntry?.reset_old_reading != null && existingEntry?.reset_new_reading != null
      ? { old_reading: existingEntry.reset_old_reading, new_reading: existingEntry.reset_new_reading }
      : null
  )
  const [openingMismatch, setOpeningMismatch] = useState(null)
  const initMachineStatus = () => existingEntry?.is_idle ? 'idle' : (parseFloat(existingEntry?.breakdown) > 0 ? 'breakdown' : null)
  const [machineStatus,  setMachineStatus] = useState(initMachineStatus)

  const readOnly           = isSaved && !isEditing
  const effectiveOpenLocked = !!existingEntry || openingLocked

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
    setMidShiftReset(prev?.mid_shift_reset
      ? { old_reading: prev.mid_shift_reset.old_reading, new_reading: prev.mid_shift_reset.new_reading }
      : null
    )
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
    setOpeningLocked(false); setMidShiftReset(null); setErrorMsg('')
    if (!newShift) return
    const timing = checkEntryTiming(date, newShift)
    if (!timing.allowed) { setErrorMsg(timing.message); return }
    try {
      const r = await getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: newShift, machine_shift_type: machine.shift_type })
      applyPrevClosing(r.data.data)
    } catch {}
  }

  const handleCancel = () => { setForm(initForm()); setIsEditing(false); setErrorMsg(''); setMachineStatus(initMachineStatus()) }

  const effectiveShift = shift || form.shift

  // Single-reading totals / validation
  const effectiveOpen = isDualNight ? (dayR1Close || '') : (form.r1_open || '')
  const r1Total = (() => {
    if (effectiveOpen === '' || form.r1_close === '') return null
    if (midShiftReset?.old_reading != null && midShiftReset?.new_reading != null) {
      return (parseFloat(midShiftReset.old_reading) - parseFloat(effectiveOpen)) +
             (parseFloat(form.r1_close) - parseFloat(midShiftReset.new_reading))
    }
    return parseFloat(form.r1_close) - parseFloat(effectiveOpen)
  })()
  const totalInvalid = !isMultiReading && r1Total !== null && (
    midShiftReset?.old_reading != null && midShiftReset?.new_reading != null
      ? (parseFloat(midShiftReset.old_reading) - parseFloat(effectiveOpen) < 0 ||
         parseFloat(form.r1_close) - parseFloat(midShiftReset.new_reading) < 0)
      : r1Total < 0
  )
  const isKmMachine   = !isMultiReading && machine?.reading1_basis === 'KM'
  const totalExceeded = !isMultiReading && !isKmMachine && r1Total !== null && r1Total > SHIFT_MAX

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
  const isTransitMixer = machine?.eq_type === 'Transit Mixer'
  const anyWork = isMultiReading
    ? computedReadings.some(r => (r.total ?? 0) > 0)
    : (r1Total ?? 0) > 0
  const anyKmWork  = isMultiReading ? computedReadings.some(r => r.unit !== 'Hrs' && (r.total ?? 0) > 0) : false
  const anyHrsWork = isMultiReading ? computedReadings.some(r => r.unit === 'Hrs' && (r.total ?? 0) > 0) : (r1Total ?? 0) > 0
  const qtyRequired = ((machine?.qty_mandatory_if_km && anyKmWork) || (machine?.qty_mandatory_if_hrs && anyHrsWork))

  const timing  = effectiveShift ? checkEntryTiming(date, effectiveShift) : { allowed: true }
  const sequentiallyBlocked = !!sequentialBlock
  const isLocked = !existingEntry && (
    sequentiallyBlocked ||
    (!isAdmin && (!canAddDpr || !timing.allowed))
  )

  const closeReqEnabled = machine?.closing_reading_mandatory !== false

  const handleSave = async () => {
    if (!effectiveShift && !isDualNight) { setErrorMsg('Select a shift'); return }
    if (!existingEntry) {
      const t = checkEntryTiming(date, effectiveShift)
      if (!t.allowed) { setErrorMsg(t.message); return }
    }
    const CLOSE_REQ = 'Closing Reading is mandatory when Opening Reading is entered. Please enter Closing Reading for all applicable reading types before saving the DPR.'
    if (!isMultiReading) {
      if (closeReqEnabled && effectiveOpen !== '' && form.r1_close === '') { setErrorMsg(CLOSE_REQ); return }
      if (totalInvalid)  { setErrorMsg('Closing HMR must be ≥ Opening HMR'); return }
      if (totalExceeded) { setErrorMsg('Total exceeds 12-hour shift limit'); return }
    } else {
      if (closeReqEnabled && computedReadings.some(r => r.effective_open !== '' && (r.close_value ?? '') === '')) { setErrorMsg(CLOSE_REQ); return }
      if (anyReadingInvalid)  { setErrorMsg('One or more readings have closing < opening value'); return }
      if (anyReadingExceeded) { setErrorMsg('Total hours must not exceed 12 hrs per shift'); return }
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

    if (machine?.fuel_entry_enabled !== false) {
      if (parseFloat(form.hsd) > 0 && !form.diesel_rate) {
        setErrorMsg('Diesel Rate (₹/Ltr) is required when HSD Consumed is entered.')
        return
      }
      const tankCap = machine?.fuel_tank_l ? parseFloat(machine.fuel_tank_l) : null
      if (tankCap != null && form.hsd !== '' && parseFloat(form.hsd) > tankCap) {
        setErrorMsg(`HSD (${form.hsd} L) exceeds fuel tank capacity (${tankCap} L).`)
        return
      }
    }
    if (qtyRequired && !form.qty) {
      setErrorMsg('Quantity is required when Working KM or Hours is entered.')
      return
    }
    if (machine?.mandatory_operator && !form.operator_id) {
      setErrorMsg('Operator selection is mandatory to save the DPR.')
      return
    }
    if (form.operator_id) {
      const dup = (allEntries || []).find(e =>
        e.machine_id !== machine.id &&
        e.shift === effectiveShift &&
        e.operator_id != null &&
        String(e.operator_id) === String(form.operator_id)
      )
      if (dup) {
        setErrorMsg('Duplicate operator allocation is not allowed. An operator can be assigned to only one machine per shift.')
        return
      }
    }

    const payload = {
      machine_id:  machine.id,
      project_id:  machine.project_id,
      entry_date:  date,
      shift:       effectiveShift,
      operator_id: form.operator_id || null,
      ...(isMultiReading ? {
        readings: computedReadings.map(r => ({
          reading_type_id: r.reading_type_id,
          open_value:  r.effective_open || null,
          close_value: r.close_value    || null,
        })),
      } : {
        r1_open:  effectiveOpen || null,
        r1_close: form.r1_close || null,
        ...(midShiftReset ? { reset_old_reading: midShiftReset.old_reading, reset_new_reading: midShiftReset.new_reading } : {}),
      }),
      hsd:         form.hsd || null,
      diesel_rate: form.diesel_rate ? parseFloat(form.diesel_rate) : null,
      breakdown:   breakdown || 0,
      qty:         form.qty || null,
      work_done:   form.work_done || null,
      remarks:     form.remarks   || null,
      is_idle:     isZeroWork && machineStatus === 'idle',
    }

    setSaving(true); setErrorMsg('')
    try {
      if (existingEntry) await updateEntry(existingEntry.id, payload)
      else               await createEntry(payload)
      setIsSaved(true); setIsEditing(false); onSaved()
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to save')
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
              className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline leading-tight text-center break-words max-w-[72px]">
              {machine.nickname || machine.slno}
            </button>
            <span className="text-[10px] text-gray-400 leading-tight">{machine.slno}</span>
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
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${shift === 'Day Shift' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
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
                <span className="text-xs font-mono font-bold text-blue-600 w-14 flex-shrink-0">{r.code}</span>
                <input type="number" step="0.01" placeholder="Open"
                  value={r.effective_open}
                  readOnly={isDualNight || readOnly || effectiveOpenLocked}
                  onChange={!isDualNight && !readOnly && !effectiveOpenLocked ? e => setReadingValue(r.reading_type_id, 'open_value', e.target.value) : undefined}
                  onWheel={e => e.target.blur()}
                  style={{ width: 68 }}
                  className={`border rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 ${
                    isDualNight || readOnly || effectiveOpenLocked ? 'bg-gray-50 text-gray-500 border-gray-100' : 'border-gray-200'
                  }`}
                />
                <input type="number" step="0.01" placeholder="Close"
                  value={r.close_value}
                  readOnly={readOnly}
                  onChange={!readOnly ? e => setReadingValue(r.reading_type_id, 'close_value', e.target.value) : undefined}
                  onWheel={e => e.target.blur()}
                  style={{ width: 68 }}
                  className={`border rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 ${
                    readOnly ? 'bg-gray-50 text-gray-500 border-gray-100' :
                    r.invalid ? 'border-red-400 bg-red-50' :
                    r.exceeded ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                  }`}
                />
                <span title="Worked total = Closing − Opening" className={`text-xs font-mono font-bold w-12 text-right flex-shrink-0 ${r.invalid ? 'text-red-600' : r.exceeded ? 'text-amber-600' : r.total !== null && r.total > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
                  {r.total !== null ? r.total.toFixed(2) : '—'}
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
              value={effectiveOpen}
              onChange={isDualNight || readOnly || effectiveOpenLocked ? undefined : set('r1_open')}
              readOnly={isDualNight || readOnly || effectiveOpenLocked}
              onWheel={e => e.target.blur()}
              className={`${isDualNight || readOnly || effectiveOpenLocked ? roInp : `${inp} border-gray-200`} ${openingMismatch ? 'border-amber-400 bg-amber-50' : ''}`}
            />
            {openingMismatch && (
              <div className="text-[9px] text-amber-600 mt-0.5 leading-tight whitespace-nowrap">↺ reset→{openingMismatch.expected}</div>
            )}
          </td>
          {/* Close HMR */}
          <td className={`${thCls} w-20`}>
            <input type="number" step="0.01" placeholder="0.00"
              value={form.r1_close} onChange={readOnly ? undefined : set('r1_close')}
              readOnly={readOnly}
              onWheel={e => e.target.blur()}
              className={readOnly ? roInp : `${inp} ${totalInvalid ? 'border-red-400 bg-red-50' : totalExceeded ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}
            />
            {midShiftReset && (
              <div className="text-[9px] text-orange-600 mt-0.5 leading-tight whitespace-nowrap">
                ↺ {midShiftReset.old_reading ?? '?'}→{midShiftReset.new_reading}
              </div>
            )}
          </td>
          {/* Total */}
          <td className={`${thCls} w-14 text-center`}>
            {midShiftReset && r1Total !== null ? (
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-mono font-bold text-blue-700">{r1Total.toFixed(2)}</span>
                <span className="text-[8px] text-orange-500 leading-tight">split</span>
              </div>
            ) : (
              <span className={`text-xs font-mono font-bold ${totalInvalid ? 'text-red-600' : totalExceeded ? 'text-amber-600' : r1Total !== null && r1Total > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
                {r1Total !== null ? r1Total.toFixed(2) : '—'}
              </span>
            )}
          </td>
        </>
      )}

      {/* HSD */}
      <td className={`${thCls} w-16`}>
        <input type="number" step="0.01" min="0" placeholder="0"
          max={machine?.fuel_tank_l || undefined}
          title={machine?.fuel_tank_l ? `Tank capacity: ${machine.fuel_tank_l} L` : undefined}
          value={form.hsd} onChange={readOnly ? undefined : set('hsd')}
          readOnly={readOnly}
          onWheel={e => e.target.blur()}
          className={editInp(machine?.fuel_tank_l && form.hsd !== '' && parseFloat(form.hsd) > parseFloat(machine.fuel_tank_l) ? 'border-red-400 bg-red-50' : 'border-gray-200')} />
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
            readOnly={readOnly} onWheel={e => e.target.blur()} className={editInp('border-gray-200')} />
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
          readOnly={readOnly} onWheel={e => e.target.blur()} className={editInp('border-gray-200')} />
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

      {/* Operator */}
      <td className={`${thCls} w-32`}>
        {readOnly ? (
          <span className="text-xs text-gray-700">
            {existingEntry?.operator_name || (existingEntry?.operator_id ? '#' + existingEntry.operator_id : '—')}
          </span>
        ) : (() => {
          const curShift = shift || form.shift
          const isDupOp = form.operator_id
            ? (allEntries || []).some(e =>
                e.machine_id !== machine.id &&
                e.shift === curShift &&
                e.operator_id != null &&
                String(e.operator_id) === String(form.operator_id)
              )
            : false
          const opBorder = isDupOp
            ? 'border-red-400 bg-red-50'
            : machine?.mandatory_operator && !form.operator_id
              ? 'border-amber-400 bg-amber-50'
              : 'border-gray-200'
          return (
            <>
              <select
                value={form.operator_id}
                onChange={e => setForm(f => ({ ...f, operator_id: e.target.value }))}
                className={`${inp} ${opBorder}`}
              >
                <option value="">{machine?.mandatory_operator ? '— Required —' : '— Operator —'}</option>
                {(operators || []).map(op => (
                  <option key={op.id} value={op.id}>{op.name}{op.emp_id ? ` (${op.emp_id})` : ''}</option>
                ))}
              </select>
              {isDupOp && (
                <p className="text-[10px] text-red-600 mt-0.5 leading-tight">Already assigned to another machine</p>
              )}
            </>
          )
        })()}
      </td>

      {/* Action */}
      <td className={`${thCls} w-28 text-center`}>
        {errorMsg && (
          <p className="text-[10px] text-red-600 mb-1 leading-tight text-left">{errorMsg}</p>
        )}
        {isLocked ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 leading-tight text-left">
            {sequentiallyBlocked
              ? <><AlertTriangle size={9} className="flex-shrink-0" /> {sequentialBlock.msg}</>
              : !canAddDpr
                ? <><Lock size={9} className="flex-shrink-0 text-gray-400" /><span className="text-gray-400">Prev pending</span></>
                : <><Clock size={9} className="flex-shrink-0 text-gray-400" /><span className="text-gray-400">{effectiveShift === 'Day Shift' ? 'After 8 PM' : 'After 8 AM'}</span></>
            }
          </span>
        ) : readOnly ? (
          editLocked ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 leading-tight text-left">
              <AlertTriangle size={9} className="flex-shrink-0" /> Night Shift pending
            </span>
          ) : (
          <div className="flex flex-col gap-1">
            {openingMismatch && (
              <button onClick={() => {
                if (openingMismatch.readingTypeId) {
                  setForm(f => ({
                    ...f,
                    readings: f.readings.map(r =>
                      r.reading_type_id === openingMismatch.readingTypeId
                        ? { ...r, open_value: openingMismatch.expected, ...(openingMismatch.fromReset ? { close_value: '' } : {}) }
                        : r
                    ),
                  }))
                } else {
                  setForm(f => ({ ...f, r1_open: openingMismatch.expected, ...(openingMismatch.fromReset ? { r1_close: '' } : {}) }))
                }
                setOpeningMismatch(null)
                setIsEditing(true)
              }} title={`Meter reset: sync opening to ${openingMismatch.expected}`}
                className="inline-flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg w-full bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 transition-colors">
                <RefreshCw size={9} /> Sync {openingMismatch.expected}
              </button>
            )}
            <div className="flex gap-1">
            <button onClick={async () => {
              if (existingEntry && machine?.id) {
                const sh = shift || existingEntry.shift
                if (sh) try {
                  const r = await getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: sh, machine_shift_type: machine.shift_type })
                  const prev = r.data.data
                  // r1_close mismatch (single-reading machines)
                  if (prev?.r1_close != null) {
                    const saved = parseFloat(existingEntry.r1_open)
                    if (!isNaN(saved) && Math.abs(parseFloat(prev.r1_close) - saved) > 0.001) {
                      setOpeningMismatch({ expected: String(prev.r1_close), fromReset: !!(prev.reset_applied || prev.mid_shift_reset) })
                      return  // stay in readOnly so Sync button is visible
                    }
                  }
                  // reading-code mismatch (multi-reading machines)
                  if (isMultiReading && prev?.reset_applied && prev?.readings?.length > 0) {
                    const bad = prev.readings.find(pr => {
                      if (pr.close_value == null) return false
                      const cur = form.readings?.find(r => r.reading_type_id === pr.reading_type_id)
                      return cur && cur.open_value !== '' && Math.abs(parseFloat(pr.close_value) - parseFloat(cur.open_value)) > 0.001
                    })
                    if (bad) {
                      setOpeningMismatch({ expected: String(bad.close_value), fromReset: true, readingTypeId: bad.reading_type_id })
                      return  // stay in readOnly so Sync button is visible
                    }
                  }
                } catch {}
              }
              setIsEditing(true)
            }}
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
          </div>
          )
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

function MachineRows({ machine, date, entries, isAdmin, canAddDpr, onSaved, onViewMonth, onViewAsset, prevDayDate, operators, allEntries }) {
  const isDual      = machine.shift_type === 'Dual Shift'
  const dayEntry    = entries.find(e => e.shift === 'Day Shift') || null
  const nightEntry  = entries.find(e => e.shift === 'Night Shift') || null
  const singleEntry = !isDual ? (entries[0] || null) : null

  const [dayR1Close,      setDayR1Close]      = useState(dayEntry?.r1_close != null ? String(dayEntry.r1_close) : '')
  const [dayReadingsClose, setDayReadingsClose] = useState(
    dayEntry?.reading_logs?.map(l => ({ reading_type_id: l.reading_type_id, close_value: l.close_value != null ? String(l.close_value) : '' })) || []
  )

  // Sequential block messages (dual-shift only, non-admin)
  const fmtDate = d => {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return `${parseInt(day)} ${MONTH_ABR[parseInt(m) - 1]} ${y}`
  }
  const dayShiftBlock = isDual && !machine.prev_night_done
    ? { msg: `Complete Night Shift for ${fmtDate(prevDayDate)} first` }
    : null
  const nightShiftBlock = isDual && !dayEntry
    ? { msg: `Complete Day Shift for ${fmtDate(date)} first` }
    : null

  if (!isDual) {
    return (
      <ShiftRow
        machine={machine} date={date} shift={null}
        existingEntry={singleEntry}
        isFirst rowSpan={1}
        onViewMonth={onViewMonth} onViewAsset={onViewAsset} onSaved={onSaved}
        isAdmin={isAdmin} canAddDpr={canAddDpr}
        operators={operators}
        allEntries={allEntries}
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
        sequentialBlock={dayShiftBlock}
        editLocked={!!dayEntry && !nightEntry}
        operators={operators}
        allEntries={allEntries}
      />
      <ShiftRow
        machine={machine} date={date} shift="Night Shift"
        existingEntry={nightEntry}
        dayR1Close={dayR1Close}
        dayReadingsClose={dayReadingsClose}
        onSaved={onSaved}
        isAdmin={isAdmin} canAddDpr={canAddDpr}
        sequentialBlock={nightShiftBlock}
        operators={operators}
        allEntries={allEntries}
      />
    </>
  )
}

// ── DPR entry table ───────────────────────────────────────────────────────────

function DprEntryTable({ machines, allEntries, date, isAdmin, canAddDpr, onSaved, onViewMonth, onViewAsset, prevDayDate, operators, }) {
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
            <th className={thCls} style={{ width: 120 }}>Operator</th>
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
              prevDayDate={prevDayDate}
              operators={operators}
              allEntries={allEntries}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Entry Form Modal (used inside MonthGridPanel) ─────────────────────────────

function EntryFormModal({ machine, date, onSave, onClose, isAdmin, editData, editIds, isLastEntry = true, targetShift = null, operators = [] }) {
  const isEditMode     = !!editData
  const isMultiReading = machine?.reading_configs?.length > 0
  const configs        = machine?.reading_configs || []
  const isDual         = machine?.shift_type === 'Dual Shift' && !targetShift

  const mkReadings  = () => configs.map(rc => ({ reading_type_id: rc.reading_type_id, code: rc.code, reading_name: rc.reading_name, unit: rc.unit, open_value: '', close_value: '' }))
  const mkNReadings = () => configs.map(rc => ({ reading_type_id: rc.reading_type_id, open_value: '', close_value: '' }))
  const mrEmpty     = { shift: targetShift || '', readings: mkReadings(), n_readings: mkNReadings(), hsd: '', breakdown_hrs: '0', breakdown_min: '0', qty: '', work_done: '', n_hsd: '', n_breakdown_hrs: '0', n_breakdown_min: '0', n_qty: '', n_work_done: '', n_r1_open: '', n_r2_open: '', remarks: '', n_remarks: '', machine_status: null, n_machine_status: null, operator_id: '' }

  const [form,          setForm]          = useState(editData || (isMultiReading ? mrEmpty : { ...emptyForm, shift: targetShift || '' }))
  const [loading,       setLoading]       = useState(false)
  const [loadingPrev,   setLoadingPrev]   = useState(false)
  const [toast,         setToast]         = useState(null)
  const [openingLocked,    setOpeningLocked]    = useState(false)
  const [openingMismatch,  setOpeningMismatch]  = useState(null)
  const [midShiftReset,    setMidShiftReset]    = useState(() =>
    editData?.reset_old_reading != null && editData?.reset_new_reading != null
      ? { old_reading: editData.reset_old_reading, new_reading: editData.reset_new_reading }
      : null
  )

  const effectiveOpenLocked = isEditMode || openingLocked
  const readingsLocked = false

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  useEffect(() => {
    setToast(null)
    setOpeningMismatch(null)
    if (isEditMode) {
      setForm(editData)
      setOpeningLocked(false)
      // Fetch previous closing to detect stale openings in stored data
      if (machine) {
        const editShift = editData.shift || 'Day Shift'
        getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: editShift, machine_shift_type: machine.shift_type })
          .then(r => {
            const prev = r.data.data
            if (!prev) return
            if (isMultiReading && prev.readings?.length > 0) {
              const bad = prev.readings.find(pr => {
                const formR = (editData.readings || []).find(x => x.reading_type_id === pr.reading_type_id)
                return pr.close_value != null && formR?.open_value != null &&
                  Math.abs(parseFloat(pr.close_value) - parseFloat(formR.open_value)) > 0.001
              })
              if (bad) {
                const formR = (editData.readings || []).find(x => x.reading_type_id === bad.reading_type_id)
                setOpeningMismatch({ prevData: prev, stored: formR?.open_value, expected: bad.close_value, label: bad.code || 'Reading', fromReset: !!(prev.reset_applied || prev.mid_shift_reset) })
              }
            } else if (!isMultiReading && prev.r1_close != null && editData.r1_open != null) {
              if (Math.abs(parseFloat(prev.r1_close) - parseFloat(editData.r1_open)) > 0.001) {
                setOpeningMismatch({ prevData: prev, stored: editData.r1_open, expected: prev.r1_close, label: 'Opening', fromReset: !!(prev.reset_applied || prev.mid_shift_reset) })
              }
            }
          }).catch(() => {})
      }
      return
    }
    setForm(isMultiReading ? { ...mrEmpty, readings: mkReadings(), n_readings: mkNReadings() } : { ...emptyForm, shift: targetShift || '' })
    setOpeningLocked(false); setMidShiftReset(null)
    if (!machine || !isDual) {
      // For targetShift (per-shift add on a dual machine), auto-fetch previous closing
      if (targetShift && machine) {
        const timing = checkEntryTiming(date, targetShift)
        if (!timing.allowed) return
        setLoadingPrev(true)
        getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: targetShift, machine_shift_type: machine.shift_type })
          .then(r => {
            const prev = r.data.data
            if (!prev) return
            if (prev.mid_shift_reset) setMidShiftReset({ old_reading: prev.mid_shift_reset.old_reading, new_reading: prev.mid_shift_reset.new_reading })
            if (isMultiReading && prev.readings?.length > 0) {
              setForm(f => ({ ...f, readings: f.readings.map(r => { const p = prev.readings.find(pr => pr.reading_type_id === r.reading_type_id); return p?.close_value != null ? { ...r, open_value: String(p.close_value) } : r }) }))
            } else if (!isMultiReading && prev.r1_close != null) {
              setForm(f => ({ ...f, r1_open: String(prev.r1_close), ...(machine.dual_reading && prev.r2_close != null ? { r2_open: String(prev.r2_close) } : {}) }))
            }
            setOpeningLocked(true)
          }).catch(() => {}).finally(() => setLoadingPrev(false))
      }
      return
    }
    setLoadingPrev(true)
    getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: 'Day Shift' })
      .then(r => {
        const prev = r.data.data
        if (!prev) return
        if (prev.mid_shift_reset) setMidShiftReset({ old_reading: prev.mid_shift_reset.old_reading, new_reading: prev.mid_shift_reset.new_reading })
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
  const setNReadingOpen  = (rtId, val) => setForm(f => ({ ...f, n_readings: f.n_readings.map(r => r.reading_type_id === rtId ? { ...r, open_value:  val } : r) }))

  const handleShiftChange = async e => {
    if (isEditMode) return
    const newShift = e.target.value
    setForm(f => ({ ...f, shift: newShift, r1_open: '', r2_open: '', ...(isMultiReading ? { readings: mkReadings() } : {}) }))
    setOpeningLocked(false); setMidShiftReset(null); setToast(null)
    if (!machine || !newShift) return
    const timing = checkEntryTiming(date, newShift)
    if (!timing.allowed) { setToast({ type: 'error', msg: timing.message }); return }
    try {
      const r    = await getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: newShift, machine_shift_type: machine.shift_type })
      const prev = r.data.data
      if (!prev) return
      if (prev.mid_shift_reset) setMidShiftReset({ old_reading: prev.mid_shift_reset.old_reading, new_reading: prev.mid_shift_reset.new_reading })
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
    const openBase = dayClose
    const total    = openBase !== '' && nr.close_value !== '' ? parseFloat(nr.close_value) - parseFloat(openBase) : null
    return { ...nr, code: cfg?.code, reading_name: cfg?.reading_name, unit: cfg?.unit, day_close: dayClose, total,
      invalid:  total !== null && total < 0,
      exceeded: total !== null && cfg?.unit === 'Hrs' && total > SHIFT_MAX }
  }) : []

  // Legacy r1/r2 computed values — use split formula when a mid-shift meter reset is present
  const r1Total = (() => {
    if (isMultiReading || form.r1_open === '' || form.r1_close === '') return null
    if (midShiftReset?.old_reading != null && midShiftReset?.new_reading != null) {
      return (parseFloat(midShiftReset.old_reading) - parseFloat(form.r1_open)) +
             (parseFloat(form.r1_close) - parseFloat(midShiftReset.new_reading))
    }
    return parseFloat(form.r1_close) - parseFloat(form.r1_open)
  })()
  const r2Total  = !isMultiReading && machine?.dual_reading && form.r2_open !== '' && form.r2_close !== '' ? parseFloat(form.r2_close) - parseFloat(form.r2_open) : null
  const nR1OpenBase = form.r1_close
  const nR2OpenBase = form.r2_close
  const nR1Total = !isMultiReading && isDual && nR1OpenBase !== '' && form.n_r1_close !== '' ? parseFloat(form.n_r1_close) - parseFloat(nR1OpenBase) : null
  const nR2Total = !isMultiReading && isDual && machine?.dual_reading && nR2OpenBase !== '' && form.n_r2_close !== '' ? parseFloat(form.n_r2_close) - parseFloat(nR2OpenBase) : null

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
  // KM/L fuel economy for assets with both KM and Hour readings (e.g. Transit Mixer)
  const dayKmReading   = isMultiReading ? (computedReadings.find(r => r.unit !== 'Hrs')?.total  ?? null) : null
  const nightKmReading = isMultiReading && isDual ? (nComputedReadings.find(r => r.unit !== 'Hrs')?.total ?? null) : null
  const dayKmFuelRate   = dayKmReading   != null && dayKmReading   > 0 && parseFloat(form.hsd)   > 0 ? (dayKmReading   / parseFloat(form.hsd)).toFixed(2)   : null
  const nightKmFuelRate = nightKmReading != null && nightKmReading > 0 && parseFloat(form.n_hsd) > 0 ? (nightKmReading / parseFloat(form.n_hsd)).toFixed(2) : null
  const r1Invalid = !isMultiReading && r1Total !== null && (
    midShiftReset?.old_reading != null && midShiftReset?.new_reading != null
      ? (parseFloat(midShiftReset.old_reading) - parseFloat(form.r1_open || 0) < 0 ||
         parseFloat(form.r1_close || 0)        - parseFloat(midShiftReset.new_reading) < 0)
      : r1Total < 0
  )
  const r2Invalid  = !isMultiReading && r2Total  !== null && r2Total  < 0
  const nR1Invalid = !isMultiReading && nR1Total !== null && nR1Total < 0
  const nR2Invalid = !isMultiReading && nR2Total !== null && nR2Total < 0
  const isKmOnly      = !isMultiReading && machine?.reading1_basis === 'KM'
  const dayExceeded   = isMultiReading ? computedReadings.some(r => r.exceeded) : (!isKmOnly && dayWorkHrs > SHIFT_MAX)
  const nightExceeded = isDual && (isMultiReading ? nComputedReadings.some(r => r.exceeded) : (!isKmOnly && nightWorkHrs > SHIFT_MAX))
  const maxDayBreakdown   = Math.max(0, SHIFT_MAX - (dayWorkHrs   || 0))
  const maxNightBreakdown = Math.max(0, SHIFT_MAX - (nightWorkHrs || 0))
  const isDayZeroWork   = dayWorkHrs === 0 && (isMultiReading ? computedReadings.some(r => r.total !== null) : r1Total !== null)
  const isNightZeroWork = isDual && nightWorkHrs === 0 && (isMultiReading ? nComputedReadings.some(r => r.total !== null) : nR1Total !== null)
  const isTransitMixer = machine?.eq_type === 'Transit Mixer'
  const dayAnyWork = isMultiReading
    ? computedReadings.some(r => (r.total ?? 0) > 0)
    : (r1Total ?? 0) > 0 || (r2Total ?? 0) > 0
  const nightAnyWork = isDual && (isMultiReading
    ? nComputedReadings.some(r => (r.total ?? 0) > 0)
    : (nR1Total ?? 0) > 0 || (nR2Total ?? 0) > 0)
  const dayAnyKmWork   = isMultiReading ? computedReadings.some(r => r.unit !== 'Hrs' && (r.total ?? 0) > 0)  : false
  const nightAnyKmWork = isMultiReading ? nComputedReadings.some(r => r.unit !== 'Hrs' && (r.total ?? 0) > 0) : false
  const dayAnyHrsWork   = isMultiReading ? computedReadings.some(r => r.unit === 'Hrs' && (r.total ?? 0) > 0)  : ((r1Total ?? 0) > 0 || (r2Total ?? 0) > 0)
  const nightAnyHrsWork = isMultiReading ? nComputedReadings.some(r => r.unit === 'Hrs' && (r.total ?? 0) > 0) : ((nR1Total ?? 0) > 0 || (nR2Total ?? 0) > 0)
  const dayQtyRequired   = (machine?.qty_mandatory_if_km && dayAnyKmWork)   || (machine?.qty_mandatory_if_hrs && dayAnyHrsWork)
  const nightQtyRequired = (machine?.qty_mandatory_if_km && nightAnyKmWork) || (machine?.qty_mandatory_if_hrs && nightAnyHrsWork)
  const closeReqEnabled = machine?.closing_reading_mandatory !== false
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
      const shift = isDual ? 'Dual Shift' : (targetShift || form.shift)
      if (shift) { const t = checkEntryTiming(date, shift); if (!t.allowed) { setToast({ type: 'error', msg: t.message }); return } }
    }
    const CLOSE_REQ_MSG = 'Closing Reading is mandatory when Opening Reading is entered. Please enter Closing Reading for all applicable reading types before saving the DPR.'
    if (isMultiReading) {
      if (!isDual && !(form.shift || targetShift)) { setToast({ type: 'error', msg: 'Please select a shift.' }); return }
      if (closeReqEnabled && computedReadings.some(r => r.open_value !== '' && (r.close_value ?? '') === '')) { setToast({ type: 'error', msg: `${isDual ? 'Day Shift: ' : ''}${CLOSE_REQ_MSG}` }); return }
      if (computedReadings.some(r => r.invalid)) { setToast({ type: 'error', msg: 'One or more readings: closing must be ≥ opening.' }); return }
      if (dayExceeded) { setToast({ type: 'error', msg: `Day readings exceed ${SHIFT_MAX}-hour shift limit.` }); return }
      if (isDual && closeReqEnabled && nComputedReadings.some(nr => nr.day_close !== '' && (nr.close_value ?? '') === '')) { setToast({ type: 'error', msg: `Night Shift: ${CLOSE_REQ_MSG}` }); return }
      if (isDual && nComputedReadings.some(r => r.invalid)) { setToast({ type: 'error', msg: 'Night readings: closing must be ≥ day closing.' }); return }
      if (isDual && nightExceeded) { setToast({ type: 'error', msg: `Night readings exceed ${SHIFT_MAX}-hour shift limit.` }); return }
    } else {
      if (!isDual && !(form.shift || targetShift)) { setToast({ type: 'error', msg: 'Please select Day Shift or Night Shift.' }); return }
      if (closeReqEnabled && form.r1_open !== '' && form.r1_close === '') { setToast({ type: 'error', msg: `${isDual ? 'Day Shift: ' : ''}${CLOSE_REQ_MSG}` }); return }
      if (closeReqEnabled && machine?.dual_reading && form.r2_open !== '' && form.r2_close === '') { setToast({ type: 'error', msg: `${isDual ? 'Day Shift: ' : ''}${CLOSE_REQ_MSG}` }); return }
      if (closeReqEnabled && isDual && nR1OpenBase !== '' && (form.n_r1_close ?? '') === '') { setToast({ type: 'error', msg: `Night Shift: ${CLOSE_REQ_MSG}` }); return }
      if (closeReqEnabled && isDual && machine?.dual_reading && nR2OpenBase !== '' && (form.n_r2_close ?? '') === '') { setToast({ type: 'error', msg: `Night Shift: ${CLOSE_REQ_MSG}` }); return }
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
    if (machine?.fuel_entry_enabled !== false) {
      if (parseFloat(form.hsd) > 0 && !form.diesel_rate) {
        setToast({ type: 'error', msg: `${isDual ? 'Day Shift: ' : ''}Diesel Rate (₹/Ltr) is required when HSD Consumed is entered.` }); return
      }
      if (isDual && parseFloat(form.n_hsd) > 0 && !form.n_diesel_rate) {
        setToast({ type: 'error', msg: 'Night Shift: Diesel Rate (₹/Ltr) is required when HSD Consumed is entered.' }); return
      }
      const tankCap = machine?.fuel_tank_l ? parseFloat(machine.fuel_tank_l) : null
      if (tankCap != null && form.hsd !== '' && parseFloat(form.hsd) > tankCap) {
        setToast({ type: 'error', msg: `${isDual ? 'Day Shift' : ''} HSD (${form.hsd} L) exceeds tank capacity (${tankCap} L). Please correct the value.` })
        return
      }
      if (isDual && tankCap != null && form.n_hsd !== '' && parseFloat(form.n_hsd) > tankCap) {
        setToast({ type: 'error', msg: `Night Shift HSD (${form.n_hsd} L) exceeds tank capacity (${tankCap} L). Please correct the value.` })
        return
      }
    }
    if (dayQtyRequired && !form.qty) {
      setToast({ type: 'error', msg: `${isDual ? 'Day Shift: ' : ''}Quantity is required when Working KM or Hours is entered.` }); return
    }
    if (isDual && nightQtyRequired && !form.n_qty) {
      setToast({ type: 'error', msg: 'Night Shift: Quantity is required when Working KM or Hours is entered.' }); return
    }
    if (machine?.mandatory_operator && !form.operator_id) {
      setToast({ type: 'error', msg: 'Operator selection is mandatory to save the DPR.' }); return
    }
    setLoading(true); setToast(null)
    try {
      if (isMultiReading) {
        const dayReadings  = readingsLocked ? {} : { readings: computedReadings.map(r => ({ reading_type_id: r.reading_type_id, open_value: r.open_value || null, close_value: r.close_value || null })) }
        const nightReadings = readingsLocked ? {} : { readings: nComputedReadings.map(r => ({ reading_type_id: r.reading_type_id, open_value: r.day_close || null, close_value: r.close_value || null })) }
        const opId = form.operator_id ? parseInt(form.operator_id) : null
        const dayPayload   = { ...dayReadings,   hsd: form.hsd   || null, diesel_rate: form.diesel_rate   ? parseFloat(form.diesel_rate)   : null, breakdown: breakdownVal  || 0, qty: form.qty   || null, work_done: form.work_done   || null, remarks: form.remarks   || null, is_idle: isDayZeroWork   && form.machine_status   === 'idle', operator_id: opId }
        const nightPayload = { ...nightReadings, hsd: form.n_hsd || null, diesel_rate: form.n_diesel_rate ? parseFloat(form.n_diesel_rate) : null, breakdown: nBreakdownVal || 0, qty: form.n_qty || null, work_done: form.n_work_done || null, remarks: form.n_remarks || null, is_idle: isNightZeroWork && form.n_machine_status === 'idle', operator_id: opId }
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
          await createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: targetShift || form.shift, ...dayPayload })
        }
      } else {
        const resetFields = midShiftReset ? { reset_old_reading: midShiftReset.old_reading, reset_new_reading: midShiftReset.new_reading } : {}
        const opId = form.operator_id ? parseInt(form.operator_id) : null
        if (isEditMode) {
          const rdDay   = readingsLocked ? {} : { r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, ...resetFields }
          const rdNight = readingsLocked ? {} : { r1_open: form.r1_close || null, r1_close: form.n_r1_close || null, r2_open: form.r2_close || null, r2_close: form.n_r2_close || null }
          if (isDual && editIds.length >= 2) {
            await Promise.all([
              updateEntry(editIds[0], { ...rdDay,   hsd: form.hsd   || null, diesel_rate: form.diesel_rate   ? parseFloat(form.diesel_rate)   : null, breakdown: breakdownVal  || 0, qty: form.qty   || null, work_done: form.work_done   || null, remarks: form.remarks   || null, is_idle: isDayZeroWork   && form.machine_status   === 'idle', operator_id: opId }),
              updateEntry(editIds[1], { ...rdNight, hsd: form.n_hsd || null, diesel_rate: form.n_diesel_rate ? parseFloat(form.n_diesel_rate) : null, breakdown: nBreakdownVal || 0, qty: form.n_qty || null, work_done: form.n_work_done || null, remarks: form.n_remarks || null, is_idle: isNightZeroWork && form.n_machine_status === 'idle', operator_id: opId }),
            ])
          } else {
            await updateEntry(editIds[0], { shift: form.shift, ...rdDay, hsd: form.hsd || null, diesel_rate: form.diesel_rate ? parseFloat(form.diesel_rate) : null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null, is_idle: isDayZeroWork && form.machine_status === 'idle', operator_id: opId })
          }
        } else if (isDual) {
          await Promise.all([
            createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: 'Day Shift',   r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, ...resetFields, hsd: form.hsd || null, diesel_rate: form.diesel_rate ? parseFloat(form.diesel_rate) : null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null, is_idle: isDayZeroWork && form.machine_status === 'idle', operator_id: opId }),
            createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: 'Night Shift', r1_open: form.r1_close || null, r1_close: form.n_r1_close || null, r2_open: form.r2_close || null, r2_close: form.n_r2_close || null, hsd: form.n_hsd || null, diesel_rate: form.n_diesel_rate ? parseFloat(form.n_diesel_rate) : null, breakdown: nBreakdownVal || 0, qty: form.n_qty || null, work_done: form.n_work_done || null, remarks: form.n_remarks || null, is_idle: isNightZeroWork && form.n_machine_status === 'idle', operator_id: opId }),
          ])
        } else {
          await createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: targetShift || form.shift, r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, ...resetFields, hsd: form.hsd || null, diesel_rate: form.diesel_rate ? parseFloat(form.diesel_rate) : null, breakdown: breakdownVal || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null, is_idle: isDayZeroWork && form.machine_status === 'idle', operator_id: opId })
        }
      }
      onSave(); onClose()
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to save entry'
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
              {date} · {isDual ? 'Dual Shift' : targetShift ? targetShift : 'Single Shift'}
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
          {/* Stale opening warning — shown when stored opening != previous day's closing */}
          {isEditMode && openingMismatch && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-600" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-900">Opening reading mismatch</p>
                <p className="text-xs mt-0.5">
                  {openingMismatch.fromReset
                    ? <>A meter reset was approved for this period. Opening should be <span className="font-mono font-bold">{openingMismatch.expected}</span>. Sync to apply the reset and re-enter the closing with new meter values.</>
                    : <>Stored opening <span className="font-mono font-bold">{openingMismatch.stored}</span> doesn't match previous entry's closing <span className="font-mono font-bold">{openingMismatch.expected}</span>. The previous entry may have been edited after this one was saved.</>
                  }
                </p>
              </div>
              <button type="button" onClick={() => {
                if (isMultiReading && openingMismatch.prevData?.readings?.length > 0) {
                  setForm(f => ({
                    ...f,
                    readings: f.readings.map(r => {
                      const p = openingMismatch.prevData.readings.find(pr => pr.reading_type_id === r.reading_type_id)
                      return p?.close_value != null ? { ...r, open_value: String(p.close_value), ...(openingMismatch.fromReset ? { close_value: '' } : {}) } : r
                    }),
                    ...(openingMismatch.fromReset ? { n_readings: f.n_readings?.map(r => ({ ...r, close_value: '' })) } : {}),
                  }))
                } else {
                  setForm(f => ({
                    ...f,
                    r1_open: String(openingMismatch.expected),
                    ...(openingMismatch.fromReset ? { r1_close: '', r2_close: '', n_r1_close: '', n_r2_close: '' } : {}),
                  }))
                }
                setOpeningMismatch(null)
              }}
                className="flex-shrink-0 px-2.5 py-1 text-xs font-semibold bg-amber-700 text-white rounded-md hover:bg-amber-800 transition-colors whitespace-nowrap">
                Sync to {openingMismatch.expected}
              </button>
            </div>
          )}
          {!isDual && (
            <div>
              <label className={lbl}>Shift <span className="text-red-500">*</span></label>
              {isEditMode || targetShift ? (
                <div className={`${inp} bg-gray-50 text-gray-700`}>{form.shift || targetShift}</div>
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
              <div className={readingsLocked ? 'pointer-events-none opacity-50 select-none' : ''}>
                {isMultiReading ? (
                  <MultiReadingGrid readings={computedReadings} isNight={false} onChangeOpen={setReadingOpen} onChangeClose={setReadingClose} openLocked={effectiveOpenLocked || readingsLocked} isAdmin={isAdmin} lbl={lbl} inp={inp} />
                ) : (
                  <>
                    <ReadingRow label={`Reading 1 · ${machine.reading1_basis}`} open={form.r1_open} close={form.r1_close} total={r1Total} basis={machine.reading1_basis} invalid={r1Invalid} onOpen={set('r1_open')} onClose={set('r1_close')} required openLocked={effectiveOpenLocked || readingsLocked} isAdmin={isAdmin} />
                    {machine.dual_reading && <ReadingRow label={`Reading 2 · ${machine.reading2_basis || 'KM'}`} open={form.r2_open} close={form.r2_close} total={r2Total} basis={machine.reading2_basis || 'KM'} invalid={r2Invalid} onOpen={set('r2_open')} onClose={set('r2_close')} openLocked={effectiveOpenLocked || readingsLocked} isAdmin={isAdmin} />}
                  </>
                )}
              </div>
              {midShiftReset?.new_reading != null && !isMultiReading && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 flex items-start gap-3">
                  <RotateCcw size={14} className="text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-orange-800">Meter replaced during this shift</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 text-xs">
                      <div>
                        <span className="text-gray-500">Old meter at breakdown</span>
                        <p className="font-mono font-bold text-gray-800">{midShiftReset.old_reading ?? '—'} {machine.reading1_basis}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">New meter start reading</span>
                        <p className="font-mono font-bold text-gray-800">{midShiftReset.new_reading} {machine.reading1_basis}</p>
                      </div>
                      {form.r1_open !== '' && midShiftReset.old_reading != null && form.r1_close !== '' && (
                        <>
                          <div>
                            <span className="text-gray-500">Pre-replacement hrs</span>
                            <p className="font-mono font-bold text-blue-700">
                              {(parseFloat(midShiftReset.old_reading) - parseFloat(form.r1_open)).toFixed(2)} {machine.reading1_basis}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Post-replacement hrs</span>
                            <p className="font-mono font-bold text-blue-700">
                              {(parseFloat(form.r1_close) - parseFloat(midShiftReset.new_reading)).toFixed(2)} {machine.reading1_basis}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    {r1Total !== null && (
                      <p className="text-xs font-semibold text-orange-700 mt-2 border-t border-orange-200 pt-1.5">
                        Total = {r1Total.toFixed(2)} {machine.reading1_basis}
                      </p>
                    )}
                  </div>
                </div>
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
              <FuelBreakdown hsd={form.hsd} dieselRate={form.diesel_rate} breakdownHrs={form.breakdown_hrs} breakdownMin={form.breakdown_min} qty={form.qty} workDone={form.work_done} fuelRate={dayFuelRate} kmFuelRate={dayKmFuelRate} machine={machine} onHsd={set('hsd')} onDieselRate={set('diesel_rate')} onBreakdownHrs={set('breakdown_hrs')} onBreakdownMin={set('breakdown_min')} onQty={set('qty')} onWorkDone={set('work_done')} lbl={lbl} inp={inp} maxBreakdown={maxDayBreakdown} isIdle={isDayZeroWork && form.machine_status === 'idle'} breakdownLocked={isDayZeroWork && form.machine_status === 'breakdown'} qtyRequired={dayQtyRequired} fuelEnabled={machine?.fuel_entry_enabled !== false} />
              {parseFloat(form.breakdown_hrs) > 0 && !(isDayZeroWork && form.machine_status === 'breakdown') && (
                <div>
                  <label className="block text-xs font-medium text-red-700 mb-1">Day Shift — Breakdown Reason <span className="text-red-500">*</span></label>
                  <textarea rows={2} value={form.remarks} onChange={set('remarks')}
                    className="border border-red-300 rounded-md px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder="e.g. Tyre puncture, engine failure…" />
                </div>
              )}
            </div>
          )}
          {isDual && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded">NIGHT SHIFT</span>
                {nightWorkHrs > 0 && <span className={`text-xs font-medium ${nightExceeded ? 'text-red-600' : 'text-gray-500'}`}>{nightWorkHrs.toFixed(2)} hrs{nightExceeded ? ' — exceeds 12 h limit' : ''}</span>}
              </div>
              <div className={readingsLocked ? 'pointer-events-none opacity-50 select-none' : ''}>
              {isMultiReading ? (
                <MultiReadingGrid readings={nComputedReadings} isNight={true} onChangeOpen={null} onChangeClose={readingsLocked ? null : setNReadingClose} openLocked={true} isAdmin={isAdmin} lbl={lbl} inp={inp} />
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Reading 1 · {machine.reading1_basis}</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={lbl}>Opening <span className="text-gray-400 font-normal">(= Day closing)</span></label>
                        <input type="number" step="0.01" placeholder="—"
                          value={form.r1_close || ''}
                          readOnly
                          className={`${inp} bg-gray-50 text-gray-500 cursor-not-allowed`}
                        />
                      </div>
                      <div><label className={lbl}>Closing</label><input type="number" step="0.01" value={form.n_r1_close} readOnly={readingsLocked} onChange={readingsLocked ? undefined : set('n_r1_close')} onWheel={e => e.target.blur()} className={`${inp} ${readingsLocked ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : nR1Invalid ? 'border-red-500' : ''}`} placeholder="0.00" required /></div>
                      <div><label className={lbl}>Total</label><input readOnly value={nR1Total !== null ? `${nR1Total.toFixed(2)} ${machine.reading1_basis}` : ''} className={`${inp} ${nR1Invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} /></div>
                    </div>
                    {nR1Invalid && <p className="text-xs text-red-600 mt-1">Night closing must be ≥ opening</p>}
                  </div>
                  {machine.dual_reading && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Reading 2 · {machine.reading2_basis || 'KM'}</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className={lbl}>Opening</label>
                          <input type="number" step="0.01" placeholder="—"
                            value={form.r2_close || ''}
                            readOnly
                            className={`${inp} bg-gray-50 text-gray-500 cursor-not-allowed`}
                          />
                        </div>
                        <div><label className={lbl}>Closing</label><input type="number" step="0.01" value={form.n_r2_close} readOnly={readingsLocked} onChange={readingsLocked ? undefined : set('n_r2_close')} onWheel={e => e.target.blur()} className={`${inp} ${readingsLocked ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : nR2Invalid ? 'border-red-500' : ''}`} placeholder="0.00" /></div>
                        <div><label className={lbl}>Total</label><input readOnly value={nR2Total !== null ? nR2Total.toFixed(2) : ''} className={`${inp} ${nR2Invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} /></div>
                      </div>
                      {nR2Invalid && <p className="text-xs text-red-600 mt-1">Night closing must be ≥ opening</p>}
                    </div>
                  )}
                </>
              )}
              </div>
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
              <FuelBreakdown hsd={form.n_hsd} dieselRate={form.n_diesel_rate} breakdownHrs={form.n_breakdown_hrs} breakdownMin={form.n_breakdown_min} qty={form.n_qty} workDone={form.n_work_done} fuelRate={nightFuelRate} kmFuelRate={nightKmFuelRate} machine={machine} onHsd={set('n_hsd')} onDieselRate={set('n_diesel_rate')} onBreakdownHrs={set('n_breakdown_hrs')} onBreakdownMin={set('n_breakdown_min')} onQty={set('n_qty')} onWorkDone={set('n_work_done')} lbl={lbl} inp={inp} maxBreakdown={maxNightBreakdown} isIdle={isNightZeroWork && form.n_machine_status === 'idle'} breakdownLocked={isNightZeroWork && form.n_machine_status === 'breakdown'} qtyRequired={nightQtyRequired} fuelEnabled={machine?.fuel_entry_enabled !== false} />
              {parseFloat(form.n_breakdown_hrs) > 0 && !(isNightZeroWork && form.n_machine_status === 'breakdown') && (
                <div>
                  <label className="block text-xs font-medium text-red-700 mb-1">Night Shift — Breakdown Reason <span className="text-red-500">*</span></label>
                  <textarea rows={2} value={form.n_remarks} onChange={set('n_remarks')}
                    className="border border-red-300 rounded-md px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder="e.g. Tyre puncture, engine failure…" />
                </div>
              )}
            </div>
          )}
          {!isDual && (
            <>
              <div className={readingsLocked ? 'pointer-events-none opacity-50 select-none' : ''}>
                {isMultiReading ? (
                  <MultiReadingGrid readings={computedReadings} isNight={false} onChangeOpen={setReadingOpen} onChangeClose={setReadingClose} openLocked={effectiveOpenLocked || readingsLocked} isAdmin={isAdmin} lbl={lbl} inp={inp} />
                ) : (
                  <>
                    <ReadingRow label={`Reading 1 · ${machine.reading1_basis}`} open={form.r1_open} close={form.r1_close} total={r1Total} basis={machine.reading1_basis} invalid={r1Invalid} onOpen={set('r1_open')} onClose={set('r1_close')} required openLocked={effectiveOpenLocked || readingsLocked} isAdmin={isAdmin} />
                    {machine.dual_reading && <ReadingRow label={`Reading 2 · ${machine.reading2_basis || 'KM'}`} open={form.r2_open} close={form.r2_close} total={r2Total} basis={machine.reading2_basis || 'KM'} invalid={r2Invalid} onOpen={set('r2_open')} onClose={set('r2_close')} openLocked={effectiveOpenLocked || readingsLocked} isAdmin={isAdmin} />}
                  </>
                )}
              </div>
              {midShiftReset?.new_reading != null && !isMultiReading && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 flex items-start gap-3">
                  <RotateCcw size={14} className="text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-orange-800">Meter replaced during this shift</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 text-xs">
                      <div>
                        <span className="text-gray-500">Old meter at breakdown</span>
                        <p className="font-mono font-bold text-gray-800">{midShiftReset.old_reading ?? '—'} {machine.reading1_basis}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">New meter start reading</span>
                        <p className="font-mono font-bold text-gray-800">{midShiftReset.new_reading} {machine.reading1_basis}</p>
                      </div>
                      {form.r1_open !== '' && midShiftReset.old_reading != null && form.r1_close !== '' && (
                        <>
                          <div>
                            <span className="text-gray-500">Pre-replacement hrs</span>
                            <p className="font-mono font-bold text-blue-700">
                              {(parseFloat(midShiftReset.old_reading) - parseFloat(form.r1_open)).toFixed(2)} {machine.reading1_basis}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Post-replacement hrs</span>
                            <p className="font-mono font-bold text-blue-700">
                              {(parseFloat(form.r1_close) - parseFloat(midShiftReset.new_reading)).toFixed(2)} {machine.reading1_basis}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    {r1Total !== null && (
                      <p className="text-xs font-semibold text-orange-700 mt-2 border-t border-orange-200 pt-1.5">
                        Total = {r1Total.toFixed(2)} {machine.reading1_basis}
                      </p>
                    )}
                  </div>
                </div>
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
              <FuelBreakdown hsd={form.hsd} dieselRate={form.diesel_rate} breakdownHrs={form.breakdown_hrs} breakdownMin={form.breakdown_min} qty={form.qty} workDone={form.work_done} fuelRate={dayFuelRate} kmFuelRate={dayKmFuelRate} machine={machine} onHsd={set('hsd')} onDieselRate={set('diesel_rate')} onBreakdownHrs={set('breakdown_hrs')} onBreakdownMin={set('breakdown_min')} onQty={set('qty')} onWorkDone={set('work_done')} lbl={lbl} inp={inp} maxBreakdown={maxDayBreakdown} isIdle={isDayZeroWork && form.machine_status === 'idle'} breakdownLocked={isDayZeroWork && form.machine_status === 'breakdown'} qtyRequired={dayQtyRequired} fuelEnabled={machine?.fuel_entry_enabled !== false} />
              {parseFloat(form.breakdown_hrs) > 0 && !(isDayZeroWork && form.machine_status === 'breakdown') && (
                <div>
                  <label className="block text-xs font-medium text-red-700 mb-1">Breakdown Reason <span className="text-red-500">*</span></label>
                  <textarea rows={2} value={form.remarks} onChange={set('remarks')}
                    className="border border-red-300 rounded-md px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder="e.g. Tyre puncture, engine failure…" />
                </div>
              )}
            </>
          )}
          {(operators.length > 0 || machine?.mandatory_operator) && (
            <div>
              <label className={lbl}>
                Operator{machine?.mandatory_operator && <span className="text-red-500"> *</span>}
              </label>
              <select
                value={form.operator_id || ''}
                onChange={e => setForm(f => ({ ...f, operator_id: e.target.value }))}
                className={`${inp} ${machine?.mandatory_operator && !form.operator_id ? 'border-red-400 bg-red-50' : ''}`}
              >
                <option value="">{machine?.mandatory_operator ? '— Select Operator (Required) —' : '— Select Operator —'}</option>
                {operators.map(op => (
                  <option key={op.id} value={op.id}>{op.name}{op.emp_id ? ` (${op.emp_id})` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {toast && (
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {toast.msg}
            </div>
          )}
          <div className="flex gap-3">
            {isEditMode && isAdmin && isLastEntry && (
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
                onWheel={e => e.target.blur()}
                className={`${inp} ${isNight || openLocked ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
              />
              {!isNight && openLocked && <p className="text-[10px] text-gray-500 mt-0.5">Carried from previous shift</p>}
            </div>
            <div>
              <label className={lbl}>Closing</label>
              <input type="number" step="0.01" placeholder="0.00"
                value={r.close_value}
                onChange={e => onChangeClose(r.reading_type_id, e.target.value)}
                onWheel={e => e.target.blur()}
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
            onWheel={e => e.target.blur()}
            className={`${inp} ${openLocked ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`} placeholder="0.00" required={required} />
          {openLocked && <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1"><Lock size={8} /> Carried from previous shift</p>}
        </div>
        <div>
          <label className={lbl}>Closing</label>
          <input type="number" step="0.01" value={close} onChange={onCloseVal} onWheel={e => e.target.blur()} className={`${inp} ${invalid ? 'border-red-500' : ''}`} placeholder="0.00" required={required} />
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

function FuelBreakdown({ hsd, dieselRate, breakdownHrs, breakdownMin, qty, workDone, fuelRate, kmFuelRate, machine, onHsd, onDieselRate, onBreakdownHrs, onBreakdownMin, onQty, onWorkDone, lbl, inp, maxBreakdown, isIdle, breakdownLocked, qtyRequired, fuelEnabled = true }) {
  const breakdownTotal = brkHrsToDecimal(breakdownHrs, breakdownMin)
  const brkOver = !breakdownLocked && maxBreakdown != null && breakdownTotal > maxBreakdown + 0.01
  const tankCap = machine?.fuel_tank_l ? parseFloat(machine.fuel_tank_l) : null
  const tankOver = tankCap != null && hsd !== '' && parseFloat(hsd) > tankCap
  const roInp = `${inp} bg-gray-50 text-gray-600 cursor-not-allowed`
  const hsdVal  = parseFloat(hsd) || 0
  const rateVal = parseFloat(dieselRate) || 0
  const dieselCost = hsdVal > 0 && rateVal > 0 ? hsdVal * rateVal : null
  return (
    <>
      <div className={`grid gap-4 ${!isIdle && fuelEnabled ? 'grid-cols-2' : ''}`}>
        {fuelEnabled && (
          <div>
            <label className={lbl}>
              HSD Issued (litres)
              {tankCap != null && <span className="font-normal text-gray-400 ml-1">(tank: {tankCap} L)</span>}
            </label>
            <input type="number" step="0.01" min="0" value={hsd} onChange={onHsd} onWheel={e => e.target.blur()} className={`${inp} ${tankOver ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : ''}`} placeholder="0.00" />
            {tankOver
              ? <p className="text-xs text-red-600 mt-1 font-medium">Exceeds tank capacity ({tankCap} L) — check the value</p>
              : (fuelRate || kmFuelRate) && (
                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                  {fuelRate && (
                    <p>
                      <span className="font-medium">{fuelRate} L/hr</span>
                      {machine.fuel_min && machine.fuel_max && <span className="text-gray-400"> · norm {machine.fuel_min}–{machine.fuel_max} L/hr</span>}
                    </p>
                  )}
                  {kmFuelRate && (
                    <p>
                      <span className="font-medium">{kmFuelRate} KM/L</span>
                      {machine.fuel_min_km && machine.fuel_max_km && <span className="text-gray-400"> · norm {machine.fuel_min_km}–{machine.fuel_max_km} KM/L</span>}
                    </p>
                  )}
                </div>
              )
            }
          </div>
        )}
        {!isIdle && (
          <div>
            <label className={lbl}>Breakdown{!breakdownLocked && maxBreakdown != null && <span className="font-normal text-gray-400 ml-1">(max {maxBreakdown.toFixed(2)} hrs)</span>}</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <input type="number" readOnly={breakdownLocked} min="0" step="1" max={maxBreakdown != null ? Math.floor(maxBreakdown) : undefined} value={breakdownHrs} onChange={breakdownLocked ? undefined : onBreakdownHrs} onWheel={e => e.target.blur()} className={`${breakdownLocked ? roInp : inp} ${brkOver ? 'border-red-500' : ''}`} placeholder="0" />
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
      {/* Diesel Rate + Cost */}
      <div className={`grid gap-4 ${fuelEnabled ? 'grid-cols-2' : ''}`}>
        {fuelEnabled && (
          <div>
            <label className={lbl}>
              Diesel Rate (₹/Ltr)
              {hsdVal > 0 && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input type="number" step="0.01" min="0" value={dieselRate} onChange={onDieselRate} onWheel={e => e.target.blur()} className={`${inp} ${hsdVal > 0 && !dieselRate ? 'border-amber-400 focus:ring-amber-300' : ''}`} placeholder={hsdVal > 0 ? 'Required' : 'Optional'} />
            {dieselCost !== null && (
              <p className="text-xs text-green-700 mt-1 font-medium">
                Cost: ₹ {dieselCost.toFixed(2)}
              </p>
            )}
          </div>
        )}
        <div>
          <label className={lbl}>
            Quantity{machine?.uom ? <span className="text-gray-400 font-normal ml-1">({machine.uom})</span> : ''}
            {qtyRequired && <span className="text-red-500 ml-1">*</span>}
          </label>
          <div className="relative">
            <input type="number" step="0.01" value={qty} onChange={onQty} onWheel={e => e.target.blur()}
              className={`${inp} ${machine?.uom ? 'pr-28' : ''} ${qtyRequired && !qty ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-200' : ''}`}
              placeholder={qtyRequired ? 'Required' : 'Optional'} />
            {machine?.uom && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none select-none">
                {machine.uom}
              </span>
            )}
          </div>
          {qtyRequired && !qty && <p className="text-xs text-amber-600 mt-1 font-medium">Required when Working KM or Hours is entered</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {!isIdle && <div><label className={lbl}>Work Done</label><input type="text" value={workDone} onChange={onWorkDone} className={inp} placeholder="Brief description" /></div>}
      </div>
    </>
  )
}

// ── Date Range Picker ─────────────────────────────────────────────────────────

function DateRangePicker({ from, to, onChange, onNavigate }) {
  const now                 = new Date()
  const [open, setOpen]     = useState(false)
  const [step, setStep]     = useState(0)   // 0 = picking start, 1 = picking end
  const [hover, setHover]   = useState(null)
  const [vy, setVy]         = useState(() => from ? parseInt(from.slice(0, 4)) : now.getFullYear())
  const [vm, setVm]         = useState(() => from ? parseInt(from.slice(5, 7)) : now.getMonth() + 1)
  const ref                 = React.useRef()

  React.useEffect(() => {
    if (!open) return
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setStep(0); setHover(null) } }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const goPrev = () => {
    const ny = vm === 1  ? vy - 1 : vy
    const nm = vm === 1  ? 12 : vm - 1
    setVy(ny); setVm(nm)
    onNavigate && onNavigate(ny, nm)
  }
  const goNext = () => {
    const ny = vm === 12 ? vy + 1 : vy
    const nm = vm === 12 ? 1 : vm + 1
    setVy(ny); setVm(nm)
    onNavigate && onNavigate(ny, nm)
  }

  const ds = d => `${vy}-${pad(vm)}-${pad(d)}`

  const getDays = () => {
    const first = new Date(vy, vm - 1, 1).getDay()
    const total = new Date(vy, vm, 0).getDate()
    const cells = Array(first).fill(null)
    for (let d = 1; d <= total; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }

  const handleDay = d => {
    if (!d) return
    const date = ds(d)
    if (step === 0) {
      onChange(date, null)
      setStep(1)
    } else {
      const [f, t] = date < from ? [date, from] : [from, date]
      onChange(f, t)
      setOpen(false); setStep(0); setHover(null)
    }
  }

  const todayStr = now.toISOString().slice(0, 10)
  const endRef   = step === 1 && hover ? hover : to

  const fmtLabel = s => s
    ? `${s.slice(8)} ${MONTH_ABR[parseInt(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`
    : '—'

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => { setOpen(o => !o); setStep(0) }}
        title="Select date range"
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <CalendarDays size={13} />
        <span className="tracking-wide">{fmtLabel(from)}</span>
        <span className="opacity-40 text-[10px]">→</span>
        <span className="tracking-wide">{fmtLabel(to)}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-64 select-none">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <button onClick={goPrev} className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-bold text-gray-800">{MONTHS[vm - 1]} {vy}</span>
            <button onClick={goNext} className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Instruction hint */}
          <p className="text-center text-[10px] mb-2 font-medium" style={{ color: step === 0 ? '#6b7280' : '#2563eb' }}>
            {step === 0 ? 'Click to set start date' : 'Click to set end date'}
          </p>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-0.5">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {getDays().map((d, i) => {
              if (!d) return <div key={i} />
              const date  = ds(d)
              const isStart = date === from
              const isEnd   = endRef && date === endRef
              const inRange = from && endRef && date > (from < endRef ? from : endRef) && date < (from < endRef ? endRef : from)
              const isToday = date === todayStr
              return (
                <button
                  key={i}
                  onClick={() => handleDay(d)}
                  onMouseEnter={() => step === 1 && setHover(date)}
                  onMouseLeave={() => step === 1 && setHover(null)}
                  className={`text-xs py-1.5 rounded-lg transition-colors font-medium ${
                    isStart || isEnd ? 'bg-blue-600 text-white' :
                    inRange          ? 'bg-blue-100 text-blue-700' :
                    isToday          ? 'text-blue-600 bg-blue-50 font-bold' :
                    'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {d}
                </button>
              )
            })}
          </div>

          {/* Selected range display */}
          {(from || to) && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
              <span>{from ? fmtLabel(from) : '—'}</span>
              <span className="text-gray-300">→</span>
              <span>{to ? fmtLabel(to) : '—'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Month Grid Panel ──────────────────────────────────────────────────────────

function MonthGridPanel({ machine, onBack, onMinimize, onEntrySaved, isAdmin, canAddDpr, prevDayDate, prevDayCompleted, prevDayTotal, projectCode, onViewAsset, operators = [] }) {
  const now = new Date()
  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth() + 1)
  const [entries,   setEntries]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [formOpen,  setFormOpen]  = useState(null)
  const [editOpen,  setEditOpen]  = useState(null)
  const [machineLastEntry,      setMachineLastEntry]      = useState(undefined) // undefined = loading
  const [machineLastEntryShift, setMachineLastEntryShift] = useState(null)
  const [dlLoading,     setDlLoading]     = useState(null)
  const [dlDropOpen,    setDlDropOpen]    = useState(false)
  const dlDropRef = useRef()
  const [dlFrom,        setDlFrom]        = useState(() => { const m = now.getMonth() + 1; return `${now.getFullYear()}-${pad(m)}-01` })
  const [dlTo,          setDlTo]          = useState(() => { const m = now.getMonth() + 1; const d = new Date(now.getFullYear(), m, 0).getDate(); return `${now.getFullYear()}-${pad(m)}-${pad(d)}` })
  const [rangeEntries,       setRangeEntries]       = useState(null)
  const [rangeSpan,          setRangeSpan]          = useState(null)
  const [rangeLoading,       setRangeLoading]       = useState(false)
  const [resetReqOpen,       setResetReqOpen]       = useState(false)
  const [latestReading,      setLatestReading]      = useState(null)
  const [pendingResetDate,   setPendingResetDate]   = useState(null) // earliest pending reset date for this machine
  const [clearAllConfirm,    setClearAllConfirm]    = useState(false)
  const [clearAllLoading,    setClearAllLoading]    = useState(false)
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

  // Fetch machine's globally last entry date (and shift) for cross-month sequential enforcement
  useEffect(() => {
    setMachineLastEntry(undefined)
    setMachineLastEntryShift(null)
    getMachineLastEntry(machine.id)
      .then(r => {
        setMachineLastEntry(r.data.last_entry_date || null)
        setMachineLastEntryShift(r.data.last_entry_shift || null)
      })
      .catch(() => setMachineLastEntry(null))
  }, [machine.id])

  // Close download dropdown on outside click (not when clicking inside it)
  useEffect(() => {
    if (!dlDropOpen) return
    const fn = e => {
      if (dlDropRef.current && !dlDropRef.current.contains(e.target)) setDlDropOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [dlDropOpen])

  // Load earliest pending counter reset request date for this machine
  const refreshPendingReset = () => {
    getMeterResetRequests({ machine_id: machine.id, status: 'pending' })
      .then(r => {
        const requests = r.data?.data || []
        if (requests.length === 0) { setPendingResetDate(null); return }
        const earliest = requests
          .map(req => req.reset_date?.slice(0, 10))
          .filter(Boolean)
          .sort()[0]
        setPendingResetDate(earliest || null)
      })
      .catch(() => setPendingResetDate(null))
  }
  useEffect(() => { refreshPendingReset() }, [machine.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleRangeView = async () => {
    if (!dlFrom || !dlTo) return
    setRangeLoading(true)
    try {
      const res = await getEntries({ machine_id: machine.id, from: dlFrom, to: dlTo })
      const sorted = (res.data.data || []).sort((a, b) => {
        if (a.entry_date < b.entry_date) return -1
        if (a.entry_date > b.entry_date) return 1
        if (a.shift === 'Day Shift' && b.shift === 'Night Shift') return -1
        if (a.shift === 'Night Shift' && b.shift === 'Day Shift') return 1
        return 0
      })
      setRangeSpan({ from: dlFrom, to: dlTo })
      setRangeEntries(sorted)
    } catch {
      setRangeSpan({ from: dlFrom, to: dlTo })
      setRangeEntries([])
    } finally {
      setRangeLoading(false)
    }
  }

  const prevMonth = () => {
    const newM = month === 1 ? 12 : month - 1
    const newY = month === 1 ? year - 1 : year
    const newDim = new Date(newY, newM, 0).getDate()
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
    setDlFrom(`${newY}-${pad(newM)}-01`)
    setDlTo(`${newY}-${pad(newM)}-${pad(newDim)}`)
    setRangeEntries(null)
  }
  const nextMonth = () => {
    const newM = month === 12 ? 1 : month + 1
    const newY = month === 12 ? year + 1 : year
    const newDim = new Date(newY, newM, 0).getDate()
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
    setDlFrom(`${newY}-${pad(newM)}-01`)
    setDlTo(`${newY}-${pad(newM)}-${pad(newDim)}`)
    setRangeEntries(null)
  }

  const refreshLastEntry = () => {
    getMachineLastEntry(machine.id)
      .then(r => {
        setMachineLastEntry(r.data.last_entry_date || null)
        setMachineLastEntryShift(r.data.last_entry_shift || null)
      })
      .catch(() => {})
  }

  const handleRangeRefresh = async (span) => {
    if (!span) return
    try {
      const res = await getEntries({ machine_id: machine.id, from: span.from, to: span.to })
      const sorted = (res.data.data || []).sort((a, b) => {
        if (a.entry_date < b.entry_date) return -1
        if (a.entry_date > b.entry_date) return 1
        if (a.shift === 'Day Shift' && b.shift === 'Night Shift') return -1
        if (a.shift === 'Night Shift' && b.shift === 'Day Shift') return 1
        return 0
      })
      setRangeEntries(sorted)
    } catch { /* leave stale */ }
  }
  const handleSaved = () => {
    load()
    refreshLastEntry()
    refreshPendingReset()
    onEntrySaved()
    window.dispatchEvent(new CustomEvent('resetRequestReviewed'))
    if (rangeEntries !== null) handleRangeRefresh(rangeSpan)
  }

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
  const readingConfigs = machine.reading_configs || []
  const isMultiReadingMachine = readingConfigs.length > 0
  const kmConfig = readingConfigs.find(rc => rc.unit !== 'Hrs') || null
  const getEntryKm = ent => {
    if (!kmConfig || !ent) return null
    const log = (ent.reading_logs || []).find(l => l.reading_type_id === kmConfig.reading_type_id)
    if (!log || log.close_value == null || log.open_value == null) return null
    const v = parseFloat(log.close_value) - parseFloat(log.open_value)
    return v >= 0 ? v : null
  }
  const getReadingLog = (ent, rc) => {
    if (!ent) return null
    const log = (ent.reading_logs || []).find(l => l.reading_type_id === rc.reading_type_id)
    if (!log) return null
    const open  = log.open_value  != null ? parseFloat(log.open_value)  : null
    const close = log.close_value != null ? parseFloat(log.close_value) : null
    const total = log.total != null ? parseFloat(log.total) : (open != null && close != null ? close - open : null)
    return { open, close, total }
  }
  const viewKmMo = kmConfig
    ? viewEntries.reduce((s, e) => { const k = getEntryKm(e); return k != null ? s + k : s }, 0)
    : 0

  // Lock logic: any date ≤ machineLastEntry is freely backfillable.
  // Only dates beyond machineLastEntry+1 are blocked ("Fill previous date first").
  // globalNextAllowed = the one unlocked future slot: the day after the latest entry.
  let globalNextAllowed = null
  if (machineLastEntry) {
    const d = new Date(machineLastEntry)
    d.setDate(d.getDate() + 1)
    const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    if (ds <= todayStr) globalNextAllowed = ds
  }

  // For dual-shift machines: compute per-date Night-pending state.
  // prevNightPendingDate = the earliest date whose Night Shift is missing but Day is done.
  // Any Day Shift on a date after prevNightPendingDate is blocked for non-admin users.
  let prevNightPendingDate = null // date string where Night Shift is pending
  if (isDualMachine && machineLastEntry !== undefined) {
    // Check cross-month: if machineLastEntry is before current month and was a Day Shift
    if (machineLastEntry && machineLastEntryShift === 'Day Shift') {
      const lastInMonth = `${year}-${pad(month)}-01`
      if (machineLastEntry < lastInMonth) {
        // Last entry in a previous month was Day Shift — Night Shift of that date is pending
        // For current month, Day Shift of first date would be blocked
        prevNightPendingDate = machineLastEntry
      }
    }
    // Scan current month entries for the first date with Day done but Night missing
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${pad(month)}-${pad(d)}`
      if (ds > todayStr) break
      const dayEnts = entryMap[ds] || []
      const dayDone   = dayEnts.some(e => e.shift === 'Day Shift')
      const nightDone = dayEnts.some(e => e.shift === 'Night Shift')
      if (dayDone && !nightDone) { prevNightPendingDate = ds; break }
      if (!dayDone && !nightDone && ds > (machineLastEntry || '')) break // gap in entries
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* ── Header: machine info + nav ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex-wrap gap-y-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {onViewAsset && machine.nickname ? (
              <button onClick={() => onViewAsset(machine)} className="text-blue-700 hover:text-blue-900 hover:underline font-semibold">
                {machine.nickname}
              </button>
            ) : (
              <span>{machine.nickname || machine.slno}</span>
            )}
            <span className="text-gray-500 font-normal"> · {machine.eq_type}{machine.capacity ? ` · ${machine.capacity}` : ''}</span>
          </p>
          <p className="text-[11px] text-gray-400 truncate">{machine.slno} · {machine.reg_no || '—'} · {machine.shift_type || 'Single Shift'} · {machine.ownership}</p>
        </div>
        <span className="text-xs font-semibold text-gray-700 px-1 flex-shrink-0">{MONTHS[month - 1]} {year}</span>
        <button onClick={() => { load(); refreshLastEntry(); refreshPendingReset() }} title="Refresh"
          className="p-1.5 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 transition-colors flex-shrink-0">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        {onMinimize && (
          <button onClick={onMinimize} title="Minimize"
            className="p-1.5 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 transition-colors flex-shrink-0">
            <Minimize2 size={13} />
          </button>
        )}
      </div>

      {/* ── Action toolbar ── */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 bg-white">
        {/* Prev / calendar / Next */}
        <button onClick={prevMonth} title="Previous month"
          className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-lg text-xs font-medium border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0">
          <ChevronLeft size={13} /> Prev
        </button>
        <DateRangePicker
          from={dlFrom}
          to={dlTo}
          onChange={(f, t) => {
            setDlFrom(f)
            if (t !== null) { setDlTo(t) }
            if (f) { const [y, m] = f.split('-').map(Number); setYear(y); setMonth(m) }
          }}
          onNavigate={(y, m) => { setYear(y); setMonth(m) }}
        />
        <button onClick={nextMonth} title="Next month"
          className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-lg text-xs font-medium border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0">
          Next <ChevronRight size={13} />
        </button>

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        <button onClick={handleRangeView} disabled={rangeLoading || !dlFrom || !dlTo} title="View date range entries"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-blue-400 bg-white text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40 flex-shrink-0">
          {rangeLoading ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
          View Range
        </button>
        {rangeEntries !== null && (
          <button onClick={() => setRangeEntries(null)} title="Close range view"
            className="p-1.5 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 transition-colors flex-shrink-0">
            <X size={13} />
          </button>
        )}

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        {/* Counter reset */}
        {pendingResetDate ? (
          <span title="Counter Reset pending — waiting for Admin approval"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed select-none flex-shrink-0">
            <Lock size={13} /> Reset Pending
          </span>
        ) : (
          <button title="Request counter log reset"
            onClick={async () => {
              try {
                const res = await getMeterResets({ machine_id: machine.id })
                const resets = res.data || []
                const last   = resets.length > 0 ? resets[resets.length - 1] : null
                const entRes = await getMachineLastEntry(machine.id)
                setLatestReading({ meterReset: last, lastEntryDate: entRes.data.last_entry_date || null })
              } catch { setLatestReading(null) }
              setResetReqOpen(true)
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-orange-400 bg-white text-orange-600 hover:bg-orange-50 transition-colors flex-shrink-0">
            <RotateCcw size={13} /> Request Counter Log Reset
          </button>
        )}

        {/* Admin-only */}
        {isAdmin && (
          <>
            <div className="w-px h-5 bg-gray-200 flex-shrink-0" />
            <button onClick={() => setClearAllConfirm(true)} title="Clear all log entries"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-400 bg-white text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
              <Trash2 size={13} /> Clear All
            </button>
          </>
        )}

        {/* Spacer — pushes download to right */}
        <div className="flex-1" />

        {/* Download — right corner */}
        <div className="relative flex-shrink-0" ref={dlDropRef}>
          <button
            disabled={!!dlLoading || !dlFrom || !dlTo}
            onClick={() => setDlDropOpen(o => !o)}
            title="Download DPR"
            className="p-1.5 rounded-lg border border-gray-400 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40">
            {dlLoading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          </button>
          {dlDropOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-36">
              <button
                onClick={() => { setDlDropOpen(false); handleDownload('excel') }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                <FileSpreadsheet size={14} className="text-emerald-600" /> Excel (.xlsx)
              </button>
              <button
                onClick={() => { setDlDropOpen(false); handleDownload('pdf') }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                <FileText size={14} className="text-red-500" /> PDF
              </button>
            </div>
          )}
        </div>
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

      {/* Range view: every date in the selected range (blank rows for days with no DPR) */}
      {rangeEntries !== null && (() => {
        const span = rangeSpan || { from: dlFrom, to: dlTo }
        const MAX_RANGE_DAYS = 100
        const allDates = []
        if (span.from && span.to) {
          let cur = new Date(span.from + 'T00:00:00')
          const end = new Date(span.to + 'T00:00:00')
          let guard = 0
          while (cur <= end && guard < 800) {
            allDates.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`)
            cur.setDate(cur.getDate() + 1)
            guard++
          }
        }
        const truncated = allDates.length > MAX_RANGE_DAYS
        const dates = truncated ? allDates.slice(0, MAX_RANGE_DAYS) : allDates
        const byDate = {}
        for (const e of rangeEntries) {
          const d = String(e.entry_date).slice(0, 10)
          ;(byDate[d] = byDate[d] || []).push(e)
        }
        const emptyColSpan = isMultiReadingMachine ? 7 + readingConfigs.length : machine.dual_reading ? 10 : 9
        return (
        <>
          <div className="flex items-center gap-5 px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-800 flex-wrap">
            <span className="font-medium">Range: {span.from} – {span.to}</span>
            <span><span className="font-bold">{allDates.length}</span> days</span>
            <span><span className="font-bold">{rangeEntries.length}</span> entries</span>
            <span><span className="font-bold">{rangeEntries.reduce((s, e) => s + parseFloat(e.working_hours || 0), 0).toFixed(1)}</span> hrs total</span>
            {rangeEntries.some(e => parseFloat(e.hsd) > 0) && (
              <span><span className="font-bold">{rangeEntries.reduce((s, e) => s + (parseFloat(e.hsd) || 0), 0).toFixed(1)}</span> L HSD</span>
            )}
            {truncated && (
              <span className="ml-auto text-amber-700 font-medium">Showing first {MAX_RANGE_DAYS} days — narrow the range to see all</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-8">#</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Shift</th>
                  {isMultiReadingMachine ? readingConfigs.map(rc => (
                    <th key={rc.reading_type_id} className="text-center px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      <div>{rc.code}</div>
                      <div className="text-[9px] font-normal normal-case text-gray-300">Opn / Cls / Total</div>
                    </th>
                  )) : (
                    <>
                      <th className="text-center px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        <div>{machine.reading1_basis || 'R1'}</div>
                        <div className="text-[9px] font-normal normal-case text-gray-300">Opn / Cls / Total</div>
                      </th>
                      {machine.dual_reading && (
                        <th className="text-center px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          <div>{machine.reading2_basis || 'R2'}</div>
                          <div className="text-[9px] font-normal normal-case text-gray-300">Opn / Cls / Total</div>
                        </th>
                      )}
                    </>
                  )}
                  <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">HSD (L)</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Bkdn</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Work Done</th>
                  <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Qty</th>
                  <th className="text-center px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-28">Status</th>
                </tr>
              </thead>
              <tbody>
                {dates.length === 0 ? (
                  <tr><td colSpan={emptyColSpan} className="px-4 py-10 text-center text-sm text-gray-400">Select a valid date range</td></tr>
                ) : (() => {
                  const rows = []
                  let n = 0
                  for (const ds of dates) {
                    const dayEnts = byDate[ds] || []
                    const dObj    = new Date(ds + 'T00:00:00')
                    const dayName = DAY_NAMES[dObj.getDay()]
                    const dNum    = ds.slice(8)
                    const mon     = MONTH_ABR[dObj.getMonth()]
                    const yr      = dObj.getFullYear()
                    if (dayEnts.length === 0) {
                      n++
                      const isFutureDs = ds > todayStr
                      const isTodayDs  = ds === todayStr
                      const dsTiming   = isDualMachine ? checkEntryTiming(ds, 'Dual Shift') : { allowed: true }
                      const rangeAddAction = isFutureDs ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : (pendingResetDate && ds >= pendingResetDate) ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title="Counter Reset Request is pending Admin approval. DPR entry is disabled until the reset is approved.">
                          <Lock size={9} /> Reset Pending
                        </span>
                      ) : isTodayDs ? (
                        canAddDpr ? (
                          isDualMachine && !dsTiming.allowed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title={dsTiming.message}><Clock size={9} /> After 8 AM ↑</span>
                          ) : (
                            <button onClick={() => setFormOpen({ date: ds, shift: null })} className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-full transition-colors shadow-sm whitespace-nowrap">+</button>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap"><Lock size={9} /> Prev Day Pending</span>
                        )
                      ) : isAdmin ? (
                        <button onClick={() => setFormOpen({ date: ds, shift: null })} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full transition-colors whitespace-nowrap">+</button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title="Contact admin to add past entries"><Lock size={9} /> Locked</span>
                      )
                      rows.push(
                        <tr key={ds} className="border-b border-gray-100 hover:bg-gray-50/60">
                          <td className="px-3 py-2 text-xs font-mono tabular-nums text-gray-300">{n}</td>
                          <td className="px-3 py-2 whitespace-nowrap"><span className={`text-xs ${isFutureDs ? 'text-gray-300' : 'text-gray-500'}`}><span className="mr-1 text-gray-300">{dayName}</span>{dNum} {mon} {yr}</span></td>
                          <td className="px-3 py-2 text-xs text-gray-300">—</td>
                          {isMultiReadingMachine
                            ? readingConfigs.map(rc => <td key={rc.reading_type_id} className="px-2 py-2 text-center text-xs text-gray-300">—</td>)
                            : (<><td className="px-2 py-2 text-center text-xs text-gray-300">—</td>{machine.dual_reading && <td className="px-2 py-2 text-center text-xs text-gray-300">—</td>}</>)}
                          <td className="px-3 py-2 text-right text-xs text-gray-300">—</td>
                          <td className="px-3 py-2 text-xs text-gray-300">—</td>
                          <td className="px-3 py-2 text-xs text-gray-300">—</td>
                          <td className="px-3 py-2 text-right text-xs text-gray-300">—</td>
                          <td className="px-3 py-2 text-center">{rangeAddAction}</td>
                        </tr>
                      )
                      continue
                    }
                    for (const ent of dayEnts) {
                      n++
                      const wh      = parseFloat(ent.working_hours || 0)
                      const hsd     = parseFloat(ent.hsd) || 0
                      const bk      = parseFloat(ent.breakdown || 0)
                      const bkDisp  = bk > 0 ? (() => { const h = Math.floor(bk); const m = Math.round((bk - h) * 60); return m > 0 ? `${h}h ${pad(m)}m` : `${h}h` })() : null
                      const qty     = parseFloat(ent.qty) || 0
                      const canEditRangeDate = ds <= todayStr
                      const handleRangeEdit = () => {
                        setEditOpen({ date: ds, targetShift: ent.shift || null, editData: buildShiftEditForm(machine, ent), editIds: [ent.id], isLastEntry: canEditRangeDate })
                      }
                      rows.push(
                    <tr key={ent.id || `${ds}-${n}`} className="border-b border-gray-100 hover:bg-green-50/50 bg-green-50/20">
                      <td className="px-3 py-2 text-xs font-mono tabular-nums text-gray-400">{n}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-xs text-gray-700"><span className="mr-1 text-gray-400">{dayName}</span>{dNum} {mon} {yr}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">{ent.shift || '—'}</td>
                      {isMultiReadingMachine ? readingConfigs.map(rc => {
                        const rl = getReadingLog(ent, rc)
                        return (
                          <td key={rc.reading_type_id} className="px-2 py-2 text-xs tabular-nums font-mono">
                            {rl ? (
                              <div className="leading-tight">
                                <div className="text-[10px] text-gray-500">{rl.open != null ? rl.open.toFixed(2) : '—'} <span className="text-gray-300">→</span> {rl.close != null ? rl.close.toFixed(2) : '—'}</div>
                                <div className="text-[11px] font-semibold text-gray-700">{rl.total != null ? `${rl.total.toFixed(2)} ${rc.unit}` : '—'}</div>
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        )
                      }) : (
                        <>
                          <td className="px-2 py-2 text-xs tabular-nums font-mono">
                            {ent.r1_open != null ? (
                              <div className="leading-tight">
                                <div className="text-[10px] text-gray-500">{parseFloat(ent.r1_open).toFixed(2)} <span className="text-gray-300">→</span> {ent.r1_close != null ? parseFloat(ent.r1_close).toFixed(2) : '—'}</div>
                                <div className="text-[11px] font-semibold text-gray-700">{wh > 0 ? `${wh.toFixed(2)} ${machine.reading1_basis || 'Hrs'}` : '—'}</div>
                              </div>
                            ) : wh > 0 ? <span className="text-gray-800 font-semibold">{wh.toFixed(2)}</span> : '—'}
                          </td>
                          {machine.dual_reading && (
                            <td className="px-2 py-2 text-xs tabular-nums font-mono">
                              {ent.r2_open != null ? (
                                <div className="leading-tight">
                                  <div className="text-[10px] text-gray-500">{parseFloat(ent.r2_open).toFixed(2)} <span className="text-gray-300">→</span> {ent.r2_close != null ? parseFloat(ent.r2_close).toFixed(2) : '—'}</div>
                                  <div className="text-[11px] font-semibold text-gray-700">{ent.r2_close != null && ent.r2_open != null ? `${(parseFloat(ent.r2_close) - parseFloat(ent.r2_open)).toFixed(2)} ${machine.reading2_basis || 'KM'}` : '—'}</div>
                                </div>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          )}
                        </>
                      )}
                      <td className="px-3 py-2 text-right text-xs tabular-nums font-mono text-gray-600">{hsd > 0 ? hsd.toFixed(2) : '—'}</td>
                      <td className={`px-3 py-2 text-xs tabular-nums font-mono ${bk > 0 ? 'text-red-600 font-semibold' : 'text-gray-300'}`}>
                        {bkDisp ? (
                          <div className="leading-tight">
                            <div>{bkDisp}</div>
                            {ent.remarks && <div className="text-[10px] font-normal text-red-400 whitespace-normal" title={ent.remarks}>({ent.remarks})</div>}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600"><span className="truncate block max-w-[180px]" title={ent.work_done || ''}>{ent.work_done || '—'}</span></td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums font-mono text-gray-700">{qty > 0 ? qty.toFixed(2) : '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap"><CheckCircle2 size={10} /> Submitted</span>
                          {canEditRangeDate && !(pendingResetDate && ds >= pendingResetDate) && <button onClick={handleRangeEdit} className="inline-flex items-center justify-center text-gray-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors" title="Edit entry"><Pencil size={12} /></button>}
                          {pendingResetDate && ds >= pendingResetDate && <span className="inline-flex items-center gap-1 text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title="Counter Reset pending — editing locked"><Lock size={9} /> Reset Pending</span>}
                        </div>
                      </td>
                    </tr>
                      )
                    }
                  }
                  return rows
                })()}
              </tbody>
            </table>
          </div>
        </>
        )
      })()}

      {rangeEntries === null && !loading && viewEntries.length > 0 && (
        <div className="flex items-center gap-5 px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-800 flex-wrap">
          <span><span className="font-bold">{viewSubmittedDays}</span> / {viewDaysCount} days {isRangeFiltered ? 'in range' : 'logged'}</span>
          <span><span className="font-bold">{viewWorkHrsMo.toFixed(1)}</span> hrs total</span>
          {kmConfig && viewKmMo > 0 && <span><span className="font-bold">{viewKmMo.toFixed(1)}</span> {kmConfig.unit} total</span>}
          {viewHsdMo > 0 && <span><span className="font-bold">{viewHsdMo.toFixed(1)}</span> L HSD</span>}
          {viewWorkHrsMo > 0 && viewHsdMo > 0 && <span>Avg <span className="font-bold">{(viewHsdMo / viewWorkHrsMo).toFixed(2)}</span> L/hr</span>}
          {isRangeFiltered && <span className="ml-auto text-blue-600 font-medium">Filtered: {effectiveViewFrom} – {effectiveViewTo}</span>}
        </div>
      )}

      {rangeEntries === null && loading && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /><span className="text-sm">Loading month entries…</span>
        </div>
      )}
      {rangeEntries === null && !loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-8">#</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Shift</th>
                {isMultiReadingMachine ? readingConfigs.map(rc => (
                  <th key={rc.reading_type_id} className="text-center px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    <div>{rc.code}</div>
                    <div className="text-[9px] font-normal normal-case text-gray-300">Opn / Cls / Total</div>
                  </th>
                )) : (
                  <>
                    <th className="text-center px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      <div>{machine.reading1_basis || 'R1'}</div>
                      <div className="text-[9px] font-normal normal-case text-gray-300">Opn / Cls / Total</div>
                    </th>
                    {machine.dual_reading && (
                      <th className="text-center px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        <div>{machine.reading2_basis || 'R2'}</div>
                        <div className="text-[9px] font-normal normal-case text-gray-300">Opn / Cls / Total</div>
                      </th>
                    )}
                  </>
                )}
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">HSD (L)</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Bkdn</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Work Done</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Qty</th>
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
                // Past submitted dates are fully editable; only future dates are locked
                const canEditDate = !!(entryMap[dateStr]?.length) && dateStr <= todayStr
                const dayEnts  = entryMap[dateStr] || []
                const hasEntry = dayEnts.length > 0
                const isFuture = dateStr > todayStr
                const isToday  = dateStr === todayStr
                const dayName  = DAY_NAMES[new Date(dateStr + 'T00:00:00').getDay()]
                const totalWH  = dayEnts.reduce((s, e) => s + parseFloat(e.working_hours || 0), 0)
                const totalHSD = dayEnts.reduce((s, e) => s + (parseFloat(e.hsd) || 0), 0)
                const totalBK  = dayEnts.reduce((s, e) => s + parseFloat(e.breakdown || 0), 0)
                const totalQty = dayEnts.reduce((s, e) => s + (parseFloat(e.qty) || 0), 0)
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
                  setEditOpen({ date: dateStr, editData: buildEditForm(machine, dayEntry, nightEntry), editIds: ids, isLastEntry: canEditDate })
                }
                const handleShiftEdit = (ent) => {
                  setEditOpen({ date: dateStr, targetShift: ent.shift || null, editData: buildShiftEditForm(machine, ent), editIds: [ent.id], isLastEntry: canEditDate })
                }
                const dayShiftEnt   = isDualMachine ? (dayEnts.find(e => e.shift === 'Day Shift')   || null) : null
                const nightShiftEnt = isDualMachine ? (dayEnts.find(e => e.shift === 'Night Shift') || null) : null
                // For dual machines with any entry: always show Day row then Night row
                const sortedEnts = (isDualMachine && hasEntry)
                  ? [dayShiftEnt, nightShiftEnt]
                  : null
                const DUAL_LABELS = ['Day Shift', 'Night Shift']
                return (
                  <React.Fragment key={d}>
                    {sortedEnts ? (
                      sortedEnts.map((ent, ei) => {
                        const shiftLabel = DUAL_LABELS[ei]
                        const entWH     = ent ? parseFloat(ent.working_hours || 0) : 0
                        const entHSD    = ent ? parseFloat(ent.hsd) || 0 : 0
                        const entBK     = ent ? parseFloat(ent.breakdown || 0) : 0
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
                            <td className={`px-3 py-2 text-xs font-medium ${!isFuture ? (ei === 0 ? 'text-blue-700' : 'text-indigo-700') : textMuted}`}>
                              {shiftLabel}
                            </td>
                            {isMultiReadingMachine ? readingConfigs.map(rc => {
                              const rl = getReadingLog(ent, rc)
                              return (
                                <td key={rc.reading_type_id} className={`px-2 py-2 text-xs tabular-nums font-mono ${!isFuture && ent ? '' : textMuted}`}>
                                  {ent && rl ? (
                                    <div className="leading-tight">
                                      <div className="text-[10px] text-gray-500">{rl.open != null ? rl.open.toFixed(2) : '—'} <span className="text-gray-300">→</span> {rl.close != null ? rl.close.toFixed(2) : '—'}</div>
                                      <div className="text-[11px] font-semibold text-gray-700">{rl.total != null ? `${rl.total.toFixed(2)} ${rc.unit}` : '—'}</div>
                                    </div>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                              )
                            }) : (
                              <>
                                <td className={`px-2 py-2 text-xs tabular-nums font-mono ${!isFuture && ent ? '' : textMuted}`}>
                                  {ent ? (
                                    ent.r1_open != null ? (
                                      <div className="leading-tight">
                                        <div className="text-[10px] text-gray-500">{parseFloat(ent.r1_open).toFixed(2)} <span className="text-gray-300">→</span> {ent.r1_close != null ? parseFloat(ent.r1_close).toFixed(2) : '—'}</div>
                                        <div className="text-[11px] font-semibold text-gray-700">{entWH > 0 ? `${entWH.toFixed(2)} ${machine.reading1_basis || 'Hrs'}` : ent.is_idle ? <span className="text-[10px] font-bold text-amber-700">IDLE</span> : '—'}</div>
                                      </div>
                                    ) : ent.is_idle ? <span className="inline-flex items-center text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">IDLE</span> : entWH > 0 ? entWH.toFixed(2) : '—'
                                  ) : '—'}
                                </td>
                                {machine.dual_reading && (
                                  <td className={`px-2 py-2 text-xs tabular-nums font-mono ${!isFuture && ent ? '' : textMuted}`}>
                                    {ent && ent.r2_open != null ? (
                                      <div className="leading-tight">
                                        <div className="text-[10px] text-gray-500">{parseFloat(ent.r2_open).toFixed(2)} <span className="text-gray-300">→</span> {ent.r2_close != null ? parseFloat(ent.r2_close).toFixed(2) : '—'}</div>
                                        <div className="text-[11px] font-semibold text-gray-700">{ent.r2_close != null && ent.r2_open != null ? `${(parseFloat(ent.r2_close) - parseFloat(ent.r2_open)).toFixed(2)} ${machine.reading2_basis || 'KM'}` : '—'}</div>
                                      </div>
                                    ) : <span className="text-gray-300">—</span>}
                                  </td>
                                )}
                              </>
                            )}
                            <td className={`px-3 py-2 text-right text-xs tabular-nums font-mono ${!isFuture && entHSD > 0 ? 'text-gray-600' : textMuted}`}>
                              {entHSD > 0 ? entHSD.toFixed(2) : '—'}
                            </td>
                            <td className={`px-3 py-2 text-xs tabular-nums font-mono ${!isFuture && entBK > 0 ? 'text-red-600 font-semibold' : textMuted}`}>
                              {entBkDisp ? (
                                <div className="leading-tight">
                                  <div>{entBkDisp}</div>
                                  {ent?.remarks && <div className="text-[10px] font-normal text-red-400 whitespace-normal" title={ent.remarks}>({ent.remarks})</div>}
                                </div>
                              ) : '—'}
                            </td>
                            <td className={`px-3 py-2 text-xs ${!isFuture && ent ? 'text-gray-600' : textMuted}`}>
                              <span className="truncate block max-w-[180px]" title={ent?.work_done || ''}>{ent?.work_done || '—'}</span>
                            </td>
                            <td className={`px-3 py-2 text-right text-xs tabular-nums font-mono ${!isFuture && ent && parseFloat(ent.qty) > 0 ? 'text-gray-700' : textMuted}`}>
                              {ent && parseFloat(ent.qty) > 0 ? parseFloat(ent.qty).toFixed(2) : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {ent ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap"><CheckCircle2 size={10} /> Done</span>
                                  {isDualMachine && ei === 0 && nightShiftEnt === null ? (
                                    !isFuture && <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded cursor-default whitespace-nowrap"><AlertTriangle size={9} /> Night pending</span>
                                  ) : (
                                    <>
                                      {!isFuture && canEditDate && !(pendingResetDate && dateStr >= pendingResetDate) && <button onClick={() => handleShiftEdit(ent)} className="inline-flex items-center justify-center text-gray-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors" title="Edit entry"><Pencil size={12} /></button>}
                                      {pendingResetDate && dateStr >= pendingResetDate && <span className="inline-flex items-center gap-1 text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title="Counter Reset pending — editing locked"><Lock size={9} /> Reset Pending</span>}
                                    </>
                                  )}
                                </div>
                              ) : isFuture ? (
                                <span className={`text-xs ${textMuted}`}>—</span>
                              ) : isAdmin ? (
                                <button onClick={() => setFormOpen({ date: dateStr, shift: shiftLabel })} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full transition-colors whitespace-nowrap">+</button>
                              ) : canAddDpr && canEditDate ? (
                                (() => { const tc = checkEntryTiming(dateStr, shiftLabel); return !tc.allowed
                                  ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap"><Clock size={9}/> {shiftLabel === 'Day Shift' ? 'After 8 PM' : 'After 8 AM'}</span>
                                  : <button onClick={() => setFormOpen({ date: dateStr, shift: shiftLabel })} className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-full transition-colors shadow-sm whitespace-nowrap">+</button>
                                })()
                              ) : (
                                <span className={`text-xs ${textMuted}`}>—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    ) : isDualMachine ? (
                      // Dual Shift, no entries: separate rows for Day and Night with independent "+" buttons
                      ['Day Shift', 'Night Shift'].map((dualShift, ei) => {
                        const isFirstDual = ei === 0
                        const shiftTc = checkEntryTiming(dateStr, dualShift)

                        // Cross-date block: any date after a pending Night Shift is locked
                        const fullDateBlocked = !!prevNightPendingDate && dateStr > prevNightPendingDate
                        // Same-date block: Night requires Day first — only for dates AFTER last entry (forward progression)
                        // Dates BEFORE last entry are backfill and unlock both shifts freely
                        const nightSeqBlocked = !fullDateBlocked && dualShift === 'Night Shift' && !!machineLastEntry && dateStr > machineLastEntry

                        const dualAction = isFuture ? (
                          <span className={`text-xs ${textMuted}`}>—</span>
                        ) : (pendingResetDate && dateStr >= pendingResetDate) ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title="Counter Reset Request is pending Admin approval."><Lock size={9} /> Reset Pending</span>
                        ) : fullDateBlocked ? (
                          // Entire date blocked: prev Night Shift pending
                          <span className="inline-flex items-center gap-1 text-[11px] text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap"><Lock size={9} /> Fill previous first</span>
                        ) : nightSeqBlocked ? (
                          // Night Shift: Day Shift for this same date not done yet
                          <span className="inline-flex items-center gap-1 text-[11px] text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap"><Lock size={9} /> Fill previous first</span>
                        ) : (!machineLastEntry || dateStr <= machineLastEntry) ? (
                          isToday ? (
                            canAddDpr ? (
                              !shiftTc.allowed ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap"><Clock size={9} /> {dualShift === 'Day Shift' ? 'After 8 PM' : 'After 8 AM ↑'}</span>
                              ) : (
                                <button onClick={() => setFormOpen({ date: dateStr, shift: dualShift })} className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-full transition-colors shadow-sm whitespace-nowrap">+</button>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap"><Lock size={9} /> Prev Day Pending</span>
                            )
                          ) : isAdmin ? (
                            <button onClick={() => setFormOpen({ date: dateStr, shift: dualShift })} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full transition-colors whitespace-nowrap">+</button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap"><Lock size={9} /> Locked</span>
                          )
                        ) : dateStr === globalNextAllowed ? (
                          isToday ? (
                            !shiftTc.allowed ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap"><Clock size={9} /> {dualShift === 'Day Shift' ? 'After 8 PM' : 'After 8 AM ↑'}</span>
                            ) : (
                              <button onClick={() => setFormOpen({ date: dateStr, shift: dualShift })} className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-full transition-colors shadow-sm whitespace-nowrap">+</button>
                            )
                          ) : isAdmin ? (
                            <button onClick={() => setFormOpen({ date: dateStr, shift: dualShift })} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full transition-colors whitespace-nowrap">+</button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap"><Lock size={9} /> Locked</span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap"><Lock size={9} /> Fill previous first</span>
                        )
                        return (
                          <tr key={ei} className={isFirstDual ? rowCls : `border-b border-gray-100 ${isFuture ? 'opacity-40' : ''}`}>
                            {isFirstDual && <td rowSpan={2} className={`px-3 py-2.5 text-xs font-mono tabular-nums ${textMuted}`}>{d}</td>}
                            {isFirstDual && <td rowSpan={2} className="px-3 py-2.5 whitespace-nowrap">
                              <span className={`text-xs ${textNorm}`}><span className={`mr-1 ${textMuted}`}>{dayName}</span>{pad(d)} {MONTH_ABR[month - 1]}</span>
                              {isToday && <span className="ml-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold tracking-wide">TODAY</span>}
                            </td>}
                            <td className={`px-3 py-2 text-xs font-medium ${!isFuture ? (ei === 0 ? 'text-blue-700' : 'text-indigo-700') : textMuted}`}>{dualShift}</td>
                            {isMultiReadingMachine
                              ? readingConfigs.map(rc => <td key={rc.reading_type_id} className={`px-2 py-2 text-xs ${textMuted}`}>—</td>)
                              : (<><td className={`px-2 py-2 text-xs ${textMuted}`}>—</td>{machine.dual_reading && <td className={`px-2 py-2 text-xs ${textMuted}`}>—</td>}</>)}
                            <td className={`px-3 py-2 text-right text-xs ${textMuted}`}>—</td>
                            <td className={`px-3 py-2 text-xs ${textMuted}`}>—</td>
                            <td className={`px-3 py-2 text-xs ${textMuted}`}>—</td>
                            <td className={`px-3 py-2 text-right text-xs ${textMuted}`}>—</td>
                            <td className="px-3 py-2.5 text-center">{dualAction}</td>
                          </tr>
                        )
                      })
                    ) : (
                      // Single Shift machine
                      <tr className={rowCls}>
                        <td className={`px-3 py-2.5 text-xs font-mono tabular-nums ${textMuted}`}>{d}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`text-xs ${textNorm}`}><span className={`mr-1 ${textMuted}`}>{dayName}</span>{pad(d)} {MONTH_ABR[month - 1]}</span>
                          {isToday && <span className="ml-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold tracking-wide">TODAY</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-xs ${hasEntry && !isFuture ? 'text-gray-600' : textMuted}`}>{hasEntry ? shifts : '—'}</td>
                        {isMultiReadingMachine ? readingConfigs.map(rc => {
                          const rl = getReadingLog(dayEnts[0] || null, rc)
                          return (
                            <td key={rc.reading_type_id} className={`px-2 py-2.5 text-xs tabular-nums font-mono ${hasEntry && !isFuture ? '' : textMuted}`}>
                              {hasEntry && rl ? (
                                <div className="leading-tight">
                                  <div className="text-[10px] text-gray-500">{rl.open != null ? rl.open.toFixed(2) : '—'} <span className="text-gray-300">→</span> {rl.close != null ? rl.close.toFixed(2) : '—'}</div>
                                  <div className="text-[11px] font-semibold text-gray-700">{rl.total != null ? `${rl.total.toFixed(2)} ${rc.unit}` : '—'}</div>
                                </div>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          )
                        }) : (
                          <>
                            <td className={`px-2 py-2.5 text-xs tabular-nums font-mono ${hasEntry && !isFuture ? '' : textMuted}`}>
                              {hasEntry ? (() => {
                                const e0 = dayEnts[0]
                                if (e0?.r1_open != null) return (
                                  <div className="leading-tight">
                                    <div className="text-[10px] text-gray-500">{parseFloat(e0.r1_open).toFixed(2)} <span className="text-gray-300">→</span> {e0.r1_close != null ? parseFloat(e0.r1_close).toFixed(2) : '—'}</div>
                                    <div className="text-[11px] font-semibold text-gray-700">{totalWH > 0 ? `${totalWH.toFixed(2)} ${machine.reading1_basis || 'Hrs'}` : dayEnts.every(e => e.is_idle) ? <span className="text-[10px] font-bold text-amber-700">IDLE</span> : '—'}</div>
                                  </div>
                                )
                                return dayEnts.every(e => e.is_idle)
                                  ? <span className="inline-flex items-center text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">IDLE</span>
                                  : totalWH > 0 ? <span className="font-semibold text-gray-800">{totalWH.toFixed(2)}</span> : '—'
                              })() : '—'}
                            </td>
                            {machine.dual_reading && (
                              <td className={`px-2 py-2.5 text-xs tabular-nums font-mono ${hasEntry && !isFuture ? '' : textMuted}`}>
                                {hasEntry && dayEnts[0]?.r2_open != null ? (() => {
                                  const e0 = dayEnts[0]
                                  return (
                                    <div className="leading-tight">
                                      <div className="text-[10px] text-gray-500">{parseFloat(e0.r2_open).toFixed(2)} <span className="text-gray-300">→</span> {e0.r2_close != null ? parseFloat(e0.r2_close).toFixed(2) : '—'}</div>
                                      <div className="text-[11px] font-semibold text-gray-700">{e0.r2_close != null ? `${(parseFloat(e0.r2_close) - parseFloat(e0.r2_open)).toFixed(2)} ${machine.reading2_basis || 'KM'}` : '—'}</div>
                                    </div>
                                  )
                                })() : <span className="text-gray-300">—</span>}
                              </td>
                            )}
                          </>
                        )}
                        <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-mono ${hasEntry && !isFuture && totalHSD > 0 ? 'text-gray-600' : textMuted}`}>{hasEntry && totalHSD > 0 ? totalHSD.toFixed(2) : '—'}</td>
                        <td className={`px-3 py-2.5 text-xs tabular-nums font-mono ${hasEntry && !isFuture && totalBK > 0 ? 'text-red-600 font-semibold' : textMuted}`}>
                          {bkdnDisplay ? (
                            <div className="leading-tight">
                              <div>{bkdnDisplay}</div>
                              {dayEnts[0]?.remarks && <div className="text-[10px] font-normal text-red-400 whitespace-normal" title={dayEnts[0].remarks}>({dayEnts[0].remarks})</div>}
                            </div>
                          ) : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-xs ${hasEntry && !isFuture ? 'text-gray-600' : textMuted}`}><span className="truncate block max-w-[180px]" title={workDone || ''}>{hasEntry && workDone ? workDone : '—'}</span></td>
                        <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-mono ${hasEntry && !isFuture && totalQty > 0 ? 'text-gray-700' : textMuted}`}>{hasEntry && totalQty > 0 ? totalQty.toFixed(2) : '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          {hasEntry ? (
                            <div className="flex items-center justify-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap"><CheckCircle2 size={10} /> Submitted</span>
                              {!isFuture && canEditDate && !(pendingResetDate && dateStr >= pendingResetDate) && <button onClick={handleEdit} className="inline-flex items-center justify-center text-gray-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors" title="Edit entry"><Pencil size={12} /></button>}
                              {pendingResetDate && dateStr >= pendingResetDate && <span className="inline-flex items-center gap-1 text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title="Counter Reset pending — editing locked"><Lock size={9} /> Reset Pending</span>}
                            </div>
                          ) : isFuture ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (pendingResetDate && dateStr >= pendingResetDate) ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title="Counter Reset Request is pending Admin approval. DPR entry is disabled until the reset is approved.">
                              <Lock size={9} /> Reset Pending
                            </span>
                          ) : (!machineLastEntry || dateStr <= machineLastEntry) ? (
                            isToday ? (
                              canAddDpr ? (
                                <button onClick={() => setFormOpen({ date: dateStr, shift: null })} className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-full transition-colors shadow-sm whitespace-nowrap">+</button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title={prevDayDate ? `${prevDayDate} DPR incomplete` : 'Previous day DPR not submitted'}><Lock size={9} /> Prev Day Pending</span>
                              )
                            ) : isAdmin ? (
                              <button onClick={() => setFormOpen({ date: dateStr, shift: null })} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full transition-colors whitespace-nowrap">+</button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title="Contact admin to add past entries"><Lock size={9} /> Locked</span>
                            )
                          ) : dateStr === globalNextAllowed ? (
                            isToday ? (
                              <button onClick={() => setFormOpen({ date: dateStr, shift: null })} className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-full transition-colors shadow-sm whitespace-nowrap">+</button>
                            ) : isAdmin ? (
                              <button onClick={() => setFormOpen({ date: dateStr, shift: null })} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full transition-colors whitespace-nowrap">+</button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title="Contact admin to add past entries"><Lock size={9} /> Locked</span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap" title={`Fill ${globalNextAllowed} first`}><Lock size={9} /> Fill previous date first</span>
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

      {rangeEntries === null && !loading && isCurrentMonth && (
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300 inline-block" />Submitted</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300 inline-block" />Today</span>
          {!isAdmin && <span className="flex items-center gap-1.5"><Lock size={10} />Past days locked — contact admin</span>}
        </div>
      )}

      {formOpen && <EntryFormModal machine={machine} date={formOpen.date} onSave={handleSaved} onClose={() => setFormOpen(null)} isAdmin={isAdmin} targetShift={formOpen.shift} operators={operators} />}
      {editOpen && <EntryFormModal machine={machine} date={editOpen.date} onSave={handleSaved} onClose={() => setEditOpen(null)} isAdmin={isAdmin} editData={editOpen.editData} editIds={editOpen.editIds} isLastEntry={editOpen.isLastEntry ?? true} targetShift={editOpen.targetShift || null} operators={operators} />}
      {resetReqOpen && <MeterResetRequestModal machine={machine} latestReading={latestReading} onClose={() => { setResetReqOpen(false); refreshPendingReset() }} />}
{clearAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={16} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Clear All Log Entries</h3>
                <p className="text-xs text-gray-500 mt-0.5">{machine.nickname || machine.slno}</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-700">
                This will permanently delete <strong>all DPR log entries and counter reset logs</strong> for this machine.
                This action cannot be undone.
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                All reading history, fuel records (DPR), working hours data, and meter reset records will be lost.
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                disabled={clearAllLoading}
                onClick={async () => {
                  setClearAllLoading(true)
                  try {
                    await deleteAllEntriesForMachine(machine.id)
                    setClearAllConfirm(false)
                    load()
                    refreshLastEntry()
                    refreshPendingReset()
                    window.dispatchEvent(new CustomEvent('resetRequestReviewed'))
                  } catch (err) {
                    alert(err.response?.data?.error || 'Failed to clear entries')
                  } finally {
                    setClearAllLoading(false)
                  }
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {clearAllLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {clearAllLoading ? 'Clearing…' : 'Yes, Clear All'}
              </button>
              <button
                disabled={clearAllLoading}
                onClick={() => setClearAllConfirm(false)}
                className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Meter Reset Request Modal ──────────────────────────────────────────────────

function MeterResetRequestModal({ machine, latestReading, onClose }) {
  const now = new Date()
  const pad2 = n => String(n).padStart(2, '0')
  const todayDate = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`
  const isDual = machine.shift_type === 'Dual Shift'

  // Build reading configs — fall back to legacy single-reading structure
  const cfgs = machine.reading_configs?.length > 0
    ? machine.reading_configs
    : [{ code: machine.reading1_basis || 'Hours', reading_name: machine.reading1_basis || 'Reading 1', unit: 'Hrs', sort_order: 1 }]

  const initReadings = () => cfgs.map(rc => ({
    code:          rc.code,
    name:          rc.reading_name || rc.code,
    unit:          rc.unit || 'Hrs',
    actual_before: '',
    old_reading:   '',
    new_reading:   '',
    entry_date:    null,
  }))

  const [resetDate,      setResetDate]     = useState(todayDate)
  const [resetShift,     setResetShift]    = useState(isDual ? 'Day Shift' : '')
  const [remark,         setRemark]        = useState('')
  const [readings,       setReadings]      = useState(initReadings)
  const [saving,         setSaving]        = useState(false)
  const [done,           setDone]          = useState(false)
  const [err,            setErr]           = useState('')
  const [fetchingOld,    setFetchingOld]   = useState(false)
  const [laterEntryDate, setLaterEntryDate]= useState(null)
  const [checkingLater,  setCheckingLater] = useState(false)

  const setField = (code, key, val) =>
    setReadings(rs => rs.map(r => r.code === code ? { ...r, [key]: val } : r))

  // Auto-fetch previous readings + check for later DPR entries
  useEffect(() => {
    if (!resetDate) return
    const date = resetDate.slice(0, 10)
    let cancelled = false

    setFetchingOld(true)
    getLatestReadingBefore({ machine_id: machine.id, before_date: date })
      .then(res => {
        if (cancelled) return
        const data = res.data.data
        setReadings(rs => rs.map(r => {
          if (!data) return { ...r, actual_before: '', entry_date: null }
          const matched = data.readings?.find(l => l.code === r.code)
          const val = matched ? matched.close_value : (rs.length === 1 ? data.r1_close : null)
          const valStr = val != null ? String(val) : ''
          return { ...r, actual_before: valStr, old_reading: r.old_reading === '' ? valStr : r.old_reading, entry_date: data.entry_date || null }
        }))
      })
      .catch(() => { if (!cancelled) setReadings(rs => rs.map(r => ({ ...r, actual_before: '', entry_date: null }))) })
      .finally(() => { if (!cancelled) setFetchingOld(false) })

    setCheckingLater(true)
    checkDprExistsAfter({ machine_id: machine.id, date, shift: isDual ? (resetShift || null) : null })
      .then(res => { if (!cancelled) setLaterEntryDate(res.data.data?.first_date || null) })
      .catch(() => { if (!cancelled) setLaterEntryDate(null) })
      .finally(() => { if (!cancelled) setCheckingLater(false) })

    return () => { cancelled = true }
  }, [resetDate, machine.id, resetShift])

  const anyCalcNegative = readings.some(r => {
    const actual = r.actual_before !== '' ? parseFloat(r.actual_before) : null
    const old    = r.old_reading   !== '' ? parseFloat(r.old_reading)   : null
    return actual != null && old != null && (old - actual) < 0
  })

  const handleSubmit = async () => {
    if (laterEntryDate) { setErr(`Cannot request reset: DPR entries exist from ${laterEntryDate} onwards.`); return }
    if (!resetDate)     { setErr('Reset date is required'); return }
    if (!remark?.trim()) { setErr('Reason / Remark is required'); return }
    const toSubmit = readings.filter(r => r.old_reading !== '' && r.new_reading !== '')
    if (toSubmit.length === 0) { setErr('Please enter Old Meter and New Meter readings for at least one reading type.'); return }
    for (const r of toSubmit) {
      const actual = r.actual_before !== '' ? parseFloat(r.actual_before) : null
      const old    = parseFloat(r.old_reading)
      if (actual != null && old - actual < 0) {
        setErr(`${r.name}: Old Meter Final Reading cannot be less than the Previous DPR Closing.`); return
      }
    }
    setSaving(true); setErr('')
    try {
      for (const r of toSubmit) {
        await createMeterResetRequest({
          machine_id:                  machine.id,
          reading_code:                r.code || null,
          actual_reading_before_reset: r.actual_before !== '' ? parseFloat(r.actual_before) : null,
          old_reading:                 parseFloat(r.old_reading),
          new_reading:                 parseFloat(r.new_reading),
          reset_date:                  resetDate,
          reset_shift:                 resetShift || null,
          remark,
        })
      }
      window.dispatchEvent(new CustomEvent('resetRequestReviewed'))
      setDone(true)
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Failed to submit request')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <RotateCcw size={16} className="text-orange-600" />
            <span className="font-semibold text-gray-900">Request Counter Log Reset</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={16} /></button>
        </div>

        {done ? (
          <div className="px-6 py-10 text-center space-y-3">
            <CheckCircle size={36} className="text-green-500 mx-auto" />
            <p className="font-semibold text-gray-800">Request Submitted</p>
            <p className="text-sm text-gray-500">Your counter log reset request has been sent to the admin for approval.</p>
            <button onClick={onClose} className="mt-4 px-5 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900 transition-colors">Close</button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Asset info */}
            <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1.5 text-sm">
              <div className="flex gap-4">
                <span className="text-gray-400 w-32 flex-shrink-0">Asset Name</span>
                <span className="font-medium text-gray-800">{machine.nickname || machine.slno} ({machine.asset_code || machine.slno})</span>
              </div>
              <div className="flex gap-4">
                <span className="text-gray-400 w-32 flex-shrink-0">Asset Type</span>
                <span className="font-medium text-gray-800">{machine.eq_type}</span>
              </div>
            </div>

            {/* Reset date */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reset Counter Log Date <span className="text-red-500">*</span></label>
              <input type="date" value={resetDate} onChange={e => setResetDate(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>

            {/* Shift selector — dual shift machines only */}
            {isDual && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Reset Shift <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {['Day Shift', 'Night Shift'].map(s => (
                    <button key={s} type="button" onClick={() => setResetShift(s)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                        resetShift === s ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Blocking warning */}
            {checkingLater && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 size={12} className="animate-spin" /> Checking for existing DPR entries…
              </div>
            )}
            {!checkingLater && laterEntryDate && (
              <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3">
                <div className="flex items-start gap-2">
                  <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Counter Reset Not Allowed</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      A DPR entry already exists from <strong>{laterEntryDate}</strong>{isDual && resetShift ? ` (${resetShift})` : ''} for this machine.
                      Please delete the DPR {isDual && resetShift ? `for the selected shift and all subsequent entries` : 'entries on and after the reset date'}, then try again.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Per-reading-type cards */}
            {cfgs.length > 1 && (
              <p className="text-xs text-gray-500">Enter readings for each counter type. Leave blank to skip a counter.</p>
            )}
            {readings.map(r => {
              const actualVal = r.actual_before !== '' ? parseFloat(r.actual_before) : null
              const oldVal    = r.old_reading   !== '' ? parseFloat(r.old_reading)   : null
              const newVal    = r.new_reading   !== '' ? parseFloat(r.new_reading)   : null
              const showCalc  = oldVal != null && actualVal != null
              const effectiveTotal = showCalc ? oldVal - actualVal : null
              return (
                <div key={r.code} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  {/* Card header */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-md">
                      {r.name}
                    </span>
                    <span className="text-xs text-gray-400">{r.unit}</span>
                  </div>

                  {/* Previous DPR Closing — auto-fetched */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Previous DPR Closing <span className="text-gray-400 font-normal">(auto-fetched)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input type="text" readOnly
                          value={fetchingOld ? 'Fetching…' : (r.actual_before !== '' ? r.actual_before : '—')}
                          className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600 cursor-not-allowed" />
                        {fetchingOld && <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
                      </div>
                      <span className="text-xs text-gray-400 w-8 flex-shrink-0">{r.unit}</span>
                    </div>
                    {r.entry_date && !fetchingOld && (
                      <p className="text-[10px] text-gray-400 mt-1">From entry on {r.entry_date}</p>
                    )}
                    {!fetchingOld && r.actual_before === '' && (
                      <p className="text-[10px] text-amber-500 mt-1">No DPR entry found before selected date</p>
                    )}
                  </div>

                  {/* Old Meter Final Reading */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Old Meter Final Reading
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" value={r.old_reading}
                        onChange={e => setField(r.code, 'old_reading', e.target.value)}
                        placeholder="e.g. 138"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                      <span className="text-xs text-gray-400 w-8 flex-shrink-0">{r.unit}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Reading on the old meter at the moment it was removed.</p>
                  </div>

                  {/* New Meter Starting Reading */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      New Meter Starting Reading
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" value={r.new_reading}
                        onChange={e => setField(r.code, 'new_reading', e.target.value)}
                        placeholder="e.g. 0 or 1"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                      <span className="text-xs text-gray-400 w-8 flex-shrink-0">{r.unit}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Reading shown on the newly installed meter when it started.</p>
                  </div>

                  {/* Calculation breakdown */}
                  {showCalc && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-1.5 text-sm">
                      <p className="text-xs font-semibold text-blue-800 mb-2">Reading Breakdown</p>
                      <div className="flex justify-between text-gray-600">
                        <span>Previous DPR Closing</span>
                        <span className="font-mono tabular-nums">{actualVal.toFixed(2)} {r.unit}</span>
                      </div>
                      <div className="flex justify-between text-gray-700 font-medium">
                        <span>Old Meter Final Reading</span>
                        <span className="font-mono tabular-nums">{oldVal.toFixed(2)} {r.unit}</span>
                      </div>
                      <div className={`flex justify-between text-xs font-semibold border-t border-blue-200 pt-1.5 mt-0.5 ${effectiveTotal < 0 ? 'text-red-600' : 'text-blue-800'}`}>
                        <span>Units Run Before Reset</span>
                        <span className="font-mono tabular-nums">{effectiveTotal >= 0 ? '+' : ''}{effectiveTotal.toFixed(2)} {r.unit}</span>
                      </div>
                      {newVal != null && (
                        <div className="flex justify-between text-gray-500 text-xs pt-1 border-t border-blue-100">
                          <span>New Meter Starting <span className="text-gray-400">(initial display only)</span></span>
                          <span className="font-mono tabular-nums">{newVal.toFixed(2)} {r.unit}</span>
                        </div>
                      )}
                      {effectiveTotal < 0 && (
                        <p className="text-[10px] text-red-600 mt-1">⚠ Old Meter Final is less than Previous DPR Closing — please check.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Remark — mandatory */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reason / Remark <span className="text-red-500">*</span></label>
              <textarea rows={3} value={remark} onChange={e => setRemark(e.target.value)}
                placeholder="Please enter reason for reset (mandatory)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}

            <div className="flex items-center justify-end gap-3 pt-1 border-t border-gray-100">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                Close
              </button>
              <button type="button" onClick={handleSubmit}
                disabled={saving || !!laterEntryDate || checkingLater || anyCalcNegative}
                className="px-5 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 size={13} className="animate-spin" />}
                Submit Request
              </button>
            </div>
          </div>
        )}
      </div>
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
  const [isMinimized,     setIsMinimized]     = useState(false)
  const [detailMachine,   setDetailMachine]   = useState(null)
  const [editAsset,       setEditAsset]       = useState(null)
  const [search,          setSearch]          = useState('')
  const [typeFilter,      setTypeFilter]      = useState('')
  const [operators,       setOperators]       = useState([])
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

  useEffect(() => {
    if (!project) { setOperators([]); return }
    getOperators({ project_code: project, status: 'Active' })
      .then(r => setOperators(r.data.data || []))
      .catch(() => setOperators([]))
  }, [project])

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

  // MonthGridPanel is kept mounted when minimized so its state (month, entries, scroll) is preserved

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">

      {/* ── MonthGridPanel overlay — hidden (not unmounted) when minimized ── */}
      {selectedMachine && (
        <div className={isMinimized ? 'hidden' : ''}>
          <div className="p-4 md:p-6 space-y-3">
            <button
              onClick={() => { setSelectedMachine(null); setIsMinimized(false) }}
              className="inline-flex items-center justify-center w-9 h-9 text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
              title="Back to Log Entry"
            >
              <ChevronLeft size={20} />
            </button>
            <MonthGridPanel
              machine={selectedMachine}
              onBack={() => { setSelectedMachine(null); setIsMinimized(false) }}
              onMinimize={() => setIsMinimized(true)}
              onEntrySaved={handleEntrySaved}
              isAdmin={isAdmin}
              canAddDpr={canAddDpr}
              prevDayDate={dprStatus?.prev_day_date}
              prevDayCompleted={dprStatus?.prev_day_completed}
              prevDayTotal={dprStatus?.total}
              projectCode={project}
              onViewAsset={openAssetDetail}
              operators={operators}
            />
          </div>
        </div>
      )}

      {/* ── Floating restore pill — shown when minimized ── */}
      {selectedMachine && isMinimized && (
        <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 bg-white border border-yellow-300 shadow-lg rounded-2xl px-4 py-2.5">
          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate max-w-[180px]">
              {selectedMachine.nickname || selectedMachine.slno}
            </p>
            <p className="text-[10px] text-gray-400">Log Entry — minimized</p>
          </div>
          <button
            onClick={() => setIsMinimized(false)}
            title="Restore"
            className="ml-1 flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg transition-colors flex-shrink-0"
          >
            <Maximize2 size={11} /> Restore
          </button>
          <button
            onClick={() => { setSelectedMachine(null); setIsMinimized(false) }}
            title="Close"
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 flex-shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Main entry view — only shown when no machine selected OR minimized ── */}
      {(!selectedMachine || isMinimized) && (
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
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { loadDprStatus(project, date); loadAllEntries(project, date) }}
              disabled={dprLoading || entriesLoading}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <RefreshCw size={13} className={(dprLoading || entriesLoading) ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
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
              prevDayDate={dprStatus?.prev_day_date}
              operators={operators}
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
    )}

    {detailMachine && (
      <MachineDetailPanel
        machine={detailMachine}
        onClose={() => setDetailMachine(null)}
        onEdit={isAdmin ? () => { setEditAsset(detailMachine); setDetailMachine(null) } : undefined}
      />
    )}
    {editAsset && (
      <EditAssetModal
        machine={editAsset}
        onClose={() => setEditAsset(null)}
        onSaved={updated => { setEditAsset(null); setDetailMachine(updated) }}
      />
    )}

    </div>
  )
}
