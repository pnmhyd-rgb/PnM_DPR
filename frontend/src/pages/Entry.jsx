import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getProjects, getEntries, createEntry, getPreviousClosing, getDprStatus,
} from '../lib/api'
import { today } from '../lib/utils'
import {
  CheckCircle2, Clock, ChevronLeft, ChevronRight,
  X, CalendarDays, CheckCircle, AlertCircle, Loader2, RefreshCw, Search, Lock,
} from 'lucide-react'

const emptyForm = {
  shift: '',
  r1_open: '', r1_close: '',
  r2_open: '', r2_close: '',
  hsd: '', breakdown: '', qty: '', work_done: '',
  n_r1_close: '', n_r2_close: '',
  n_hsd: '', n_breakdown: '', n_qty: '', n_work_done: '',
  remarks: '',
}

const SHIFT_MAX  = 12
const MONTHS     = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December']
const MONTH_ABR  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_NAMES  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const pad        = n => String(n).padStart(2, '0')

// ── Asset Card ────────────────────────────────────────────────────────────────

function AssetCard({ machine, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(machine)}
      className={`w-full text-left rounded-xl border-2 p-4 transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0
        ${machine.has_entry
          ? 'border-green-200 bg-green-50 hover:border-green-400'
          : 'border-amber-200 bg-amber-50 hover:border-amber-400'}`}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{machine.slno}</p>
            <p className="text-xs text-gray-500 truncate mt-0.5">{machine.eq_type}{machine.capacity ? ` · ${machine.capacity}` : ''}</p>
          </div>
          {machine.has_entry
            ? <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
            : <Clock size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />}
        </div>

        {machine.reg_no && (
          <p className="text-xs text-gray-400 font-mono truncate">{machine.reg_no}</p>
        )}

        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full
          ${machine.has_entry ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {machine.has_entry ? 'DPR Completed' : 'DPR Pending'}
        </span>

        {machine.has_entry && machine.work_hrs > 0 && (
          <p className="text-xs text-green-600 font-medium">{machine.work_hrs.toFixed(2)} hrs worked</p>
        )}

        <div className="flex items-center gap-1.5 pt-1.5 border-t border-current/10">
          <CalendarDays size={11} className={machine.has_entry ? 'text-green-500' : 'text-amber-500'} />
          <span className={`text-xs ${machine.has_entry ? 'text-green-600' : 'text-amber-600'}`}>
            View monthly log
          </span>
        </div>
      </div>
    </button>
  )
}

// ── Entry Form Modal ──────────────────────────────────────────────────────────

function EntryFormModal({ machine, date, onSave, onClose }) {
  const [form,        setForm]        = useState(emptyForm)
  const [loading,     setLoading]     = useState(false)
  const [loadingPrev, setLoadingPrev] = useState(false)
  const [toast,       setToast]       = useState(null)

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  useEffect(() => {
    setForm(emptyForm)
    setToast(null)
    if (!machine) return
    if (machine.shift_type === 'Dual Shift') {
      setLoadingPrev(true)
      getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: 'Day Shift' })
        .then(r => {
          const prev = r.data.data
          if (prev) {
            setForm(f => ({
              ...f,
              r1_open: prev.r1_close != null ? String(prev.r1_close) : '',
              ...(machine.dual_reading && prev.r2_close != null ? { r2_open: String(prev.r2_close) } : {}),
            }))
          }
        })
        .catch(() => {})
        .finally(() => setLoadingPrev(false))
    }
  }, [machine?.id, date])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleShiftChange = async e => {
    const newShift = e.target.value
    setForm(f => ({ ...f, shift: newShift, r1_open: '', r2_open: '' }))
    if (!machine || !newShift) return
    try {
      const r    = await getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: newShift })
      const prev = r.data.data
      if (prev) {
        setForm(f => ({
          ...f,
          r1_open: prev.r1_close != null ? String(prev.r1_close) : f.r1_open,
          ...(machine.dual_reading && prev.r2_close != null ? { r2_open: String(prev.r2_close) } : {}),
        }))
      }
    } catch {}
  }

  const isDual = machine?.shift_type === 'Dual Shift'

  const r1Total  = form.r1_open !== '' && form.r1_close !== '' ? parseFloat(form.r1_close) - parseFloat(form.r1_open) : null
  const r2Total  = machine?.dual_reading && form.r2_open !== '' && form.r2_close !== '' ? parseFloat(form.r2_close) - parseFloat(form.r2_open) : null
  const nR1Total = isDual && form.r1_close !== '' && form.n_r1_close !== '' ? parseFloat(form.n_r1_close) - parseFloat(form.r1_close) : null
  const nR2Total = isDual && machine?.dual_reading && form.r2_close !== '' && form.n_r2_close !== '' ? parseFloat(form.n_r2_close) - parseFloat(form.r2_close) : null

  const dayWorkHrs   = (r1Total || 0) + (r2Total || 0)
  const nightWorkHrs = (nR1Total || 0) + (nR2Total || 0)
  const workHrs      = isDual ? dayWorkHrs + nightWorkHrs : dayWorkHrs
  const planned      = parseFloat(machine?.planned_hours) || 10
  const utilPct      = planned > 0 ? Math.round((workHrs / planned) * 100) : 0

  const dayFuelRate   = dayWorkHrs > 0 && form.hsd   ? (parseFloat(form.hsd)   / dayWorkHrs).toFixed(2)   : null
  const nightFuelRate = nightWorkHrs > 0 && form.n_hsd ? (parseFloat(form.n_hsd) / nightWorkHrs).toFixed(2) : null

  const r1Invalid     = r1Total !== null && r1Total < 0
  const r2Invalid     = r2Total !== null && r2Total < 0
  const nR1Invalid    = nR1Total !== null && nR1Total < 0
  const nR2Invalid    = nR2Total !== null && nR2Total < 0
  const dayExceeded   = dayWorkHrs > SHIFT_MAX
  const nightExceeded = isDual && nightWorkHrs > SHIFT_MAX
  const anyError      = r1Invalid || r2Invalid || nR1Invalid || nR2Invalid || dayExceeded || nightExceeded

  const handleSubmit = async e => {
    e.preventDefault()
    if (!isDual && !form.shift)   { setToast({ type: 'error', msg: 'Please select Day Shift or Night Shift.' }); return }
    if (r1Invalid)                { setToast({ type: 'error', msg: 'Day Reading 1: Closing must be ≥ Opening.' }); return }
    if (r2Invalid)                { setToast({ type: 'error', msg: 'Day Reading 2: Closing must be ≥ Opening.' }); return }
    if (isDual && nR1Invalid)     { setToast({ type: 'error', msg: 'Night Reading 1: Closing must be ≥ Day Shift closing.' }); return }
    if (isDual && nR2Invalid)     { setToast({ type: 'error', msg: 'Night Reading 2: Closing must be ≥ Day Shift closing.' }); return }
    if (dayExceeded)              { setToast({ type: 'error', msg: `${isDual ? 'Day Shift' : form.shift}: total hours (${dayWorkHrs.toFixed(2)}) exceed 12-hour limit.` }); return }
    if (isDual && nightExceeded)  { setToast({ type: 'error', msg: `Night Shift: total hours (${nightWorkHrs.toFixed(2)}) exceed 12-hour limit.` }); return }

    setLoading(true); setToast(null)
    try {
      if (isDual) {
        await Promise.all([
          createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: 'Day Shift', r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, hsd: form.hsd || null, breakdown: form.breakdown || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null }),
          createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: 'Night Shift', r1_open: form.r1_close || null, r1_close: form.n_r1_close || null, r2_open: form.r2_close || null, r2_close: form.n_r2_close || null, hsd: form.n_hsd || null, breakdown: form.n_breakdown || 0, qty: form.n_qty || null, work_done: form.n_work_done || null, remarks: form.remarks || null }),
        ])
      } else {
        await createEntry({ machine_id: machine.id, project_id: machine.project_id, entry_date: date, shift: form.shift, r1_open: form.r1_open || null, r1_close: form.r1_close || null, r2_open: form.r2_open || null, r2_close: form.r2_close || null, hsd: form.hsd || null, breakdown: form.breakdown || 0, qty: form.qty || null, work_done: form.work_done || null, remarks: form.remarks || null })
      }
      onSave(machine.id, date)
      onClose()
    } catch (err) {
      const msg = err.response?.status === 409
        ? 'Entry already exists for this machine, date, and shift.'
        : (err.response?.data?.error || 'Failed to save entry')
      setToast({ type: 'error', msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <p className="font-semibold text-gray-900">{machine.slno} · {machine.eq_type}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {date} · {isDual ? 'Dual Shift' : 'Single Shift'}
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

        {/* scrollable form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Shift selector — single shift only */}
          {!isDual && (
            <div>
              <label className={lbl}>Shift <span className="text-red-500">*</span></label>
              <select value={form.shift} onChange={handleShiftChange} className={inp} required>
                <option value="">— select shift —</option>
                <option value="Day Shift">Day Shift (max 12 hrs)</option>
                <option value="Night Shift">Night Shift (max 12 hrs)</option>
              </select>
            </div>
          )}

          {/* ── DUAL: Day Shift ── */}
          {isDual && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded">DAY SHIFT</span>
                {dayWorkHrs > 0 && <span className={`text-xs font-medium ${dayExceeded ? 'text-red-600' : 'text-gray-500'}`}>{dayWorkHrs.toFixed(2)} hrs{dayExceeded ? ' — exceeds 12 h limit' : ''}</span>}
              </div>
              <ReadingRow label={`Reading 1 · ${machine.reading1_basis}`} open={form.r1_open} close={form.r1_close} total={r1Total} basis={machine.reading1_basis} invalid={r1Invalid} onOpen={set('r1_open')} onClose={set('r1_close')} required />
              {machine.dual_reading && <ReadingRow label={`Reading 2 · ${machine.reading2_basis || 'KM'}`} open={form.r2_open} close={form.r2_close} total={r2Total} basis={machine.reading2_basis || 'KM'} invalid={r2Invalid} onOpen={set('r2_open')} onClose={set('r2_close')} />}
              <FuelBreakdown hsd={form.hsd} breakdown={form.breakdown} qty={form.qty} workDone={form.work_done} fuelRate={dayFuelRate} machine={machine} onHsd={set('hsd')} onBreakdown={set('breakdown')} onQty={set('qty')} onWorkDone={set('work_done')} lbl={lbl} inp={inp} />
            </div>
          )}

          {/* ── DUAL: Night Shift ── */}
          {isDual && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded">NIGHT SHIFT</span>
                {nightWorkHrs > 0 && <span className={`text-xs font-medium ${nightExceeded ? 'text-red-600' : 'text-gray-500'}`}>{nightWorkHrs.toFixed(2)} hrs{nightExceeded ? ' — exceeds 12 h limit' : ''}</span>}
              </div>
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
                    <div><label className={lbl}>Opening <span className="text-gray-400 font-normal">(= Day closing)</span></label><input readOnly value={form.r2_close || ''} className={`${inp} bg-gray-50 text-gray-500 cursor-not-allowed`} placeholder="—" /></div>
                    <div><label className={lbl}>Closing</label><input type="number" step="0.01" value={form.n_r2_close} onChange={set('n_r2_close')} className={`${inp} ${nR2Invalid ? 'border-red-500' : ''}`} placeholder="0.00" /></div>
                    <div><label className={lbl}>Total</label><input readOnly value={nR2Total !== null ? nR2Total.toFixed(2) : ''} className={`${inp} ${nR2Invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} /></div>
                  </div>
                  {nR2Invalid && <p className="text-xs text-red-600 mt-1">Night closing must be ≥ Day closing</p>}
                </div>
              )}
              <FuelBreakdown hsd={form.n_hsd} breakdown={form.n_breakdown} qty={form.n_qty} workDone={form.n_work_done} fuelRate={nightFuelRate} machine={machine} onHsd={set('n_hsd')} onBreakdown={set('n_breakdown')} onQty={set('n_qty')} onWorkDone={set('n_work_done')} lbl={lbl} inp={inp} />
            </div>
          )}

          {/* ── SINGLE: readings ── */}
          {!isDual && (
            <>
              <ReadingRow label={`Reading 1 · ${machine.reading1_basis}`} open={form.r1_open} close={form.r1_close} total={r1Total} basis={machine.reading1_basis} invalid={r1Invalid} onOpen={set('r1_open')} onClose={set('r1_close')} required />
              {machine.dual_reading && <ReadingRow label={`Reading 2 · ${machine.reading2_basis || 'KM'}`} open={form.r2_open} close={form.r2_close} total={r2Total} basis={machine.reading2_basis || 'KM'} invalid={r2Invalid} onOpen={set('r2_open')} onClose={set('r2_close')} />}
              <FuelBreakdown hsd={form.hsd} breakdown={form.breakdown} qty={form.qty} workDone={form.work_done} fuelRate={dayFuelRate} machine={machine} onHsd={set('hsd')} onBreakdown={set('breakdown')} onQty={set('qty')} onWorkDone={set('work_done')} lbl={lbl} inp={inp} />
            </>
          )}

          <div>
            <label className={lbl}>Remarks</label>
            <textarea rows={2} value={form.remarks} onChange={set('remarks')} className={inp} placeholder="Optional" />
          </div>

          {toast && (
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {toast.msg}
            </div>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              {loading ? 'Saving…' : isDual ? 'Save Day + Night Entries' : 'Save Entry'}
            </button>
            <button type="button" onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Shared sub-components used by EntryFormModal ──────────────────────────────

function ReadingRow({ label, open, close, total, basis, invalid, onOpen, onClose: onCloseVal, required }) {
  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{label}</p>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={lbl}>Opening</label><input type="number" step="0.01" value={open} onChange={onOpen} className={inp} placeholder="0.00" required={required} /></div>
        <div><label className={lbl}>Closing</label><input type="number" step="0.01" value={close} onChange={onCloseVal} className={`${inp} ${invalid ? 'border-red-500' : ''}`} placeholder="0.00" required={required} /></div>
        <div><label className={lbl}>Total</label><input readOnly value={total !== null ? `${total.toFixed(2)} ${basis}` : ''} className={`${inp} ${invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} /></div>
      </div>
      {invalid && <p className="text-xs text-red-600 mt-1">Closing must be ≥ Opening</p>}
    </div>
  )
}

function FuelBreakdown({ hsd, breakdown, qty, workDone, fuelRate, machine, onHsd, onBreakdown, onQty, onWorkDone, lbl, inp }) {
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
        <div><label className={lbl}>Breakdown Hours</label><input type="number" step="0.01" min="0" value={breakdown} onChange={onBreakdown} className={inp} placeholder="0.00" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className={lbl}>Quantity</label><input type="number" step="0.01" value={qty} onChange={onQty} className={inp} placeholder="Optional" /></div>
        <div><label className={lbl}>Work Done</label><input type="text" value={workDone} onChange={onWorkDone} className={inp} placeholder="Brief description" /></div>
      </div>
    </>
  )
}

// ── Month Grid Panel ──────────────────────────────────────────────────────────

function MonthGridPanel({ machine, onBack, onEntrySaved, isAdmin }) {
  const now = new Date()
  const [year,     setYear]     = useState(now.getFullYear())
  const [month,    setMonth]    = useState(now.getMonth() + 1)
  const [entries,  setEntries]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [formOpen, setFormOpen] = useState(null)   // dateStr | null

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

  // Group entries by date
  const entryMap = {}
  for (const e of entries) {
    const d = e.entry_date.slice(0, 10)
    if (!entryMap[d]) entryMap[d] = []
    entryMap[d].push(e)
  }

  const daysInMonth      = new Date(year, month, 0).getDate()
  const submittedDays    = Object.keys(entryMap).length
  const totalWorkHrsMo   = entries.reduce((s, e) => s + parseFloat(e.working_hours || 0), 0)
  const totalHsdMo       = entries.reduce((s, e) => s + parseFloat(e.hsd || 0), 0)

  const isCurrentMonth   = year === now.getFullYear() && month === (now.getMonth() + 1)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* ── Panel header ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50 flex-wrap gap-y-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0"
        >
          <ChevronLeft size={15} /> Back
        </button>

        <div className="h-4 w-px bg-gray-300 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {machine.slno} · {machine.eq_type}{machine.capacity ? ` · ${machine.capacity}` : ''}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {machine.reg_no || '—'} · {machine.shift_type || 'Single Shift'} · {machine.ownership}
          </p>
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={prevMonth} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[120px] text-center">
            {MONTHS[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>

        <button onClick={load} title="Refresh" className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors text-gray-500 flex-shrink-0">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Month summary strip ── */}
      {!loading && entries.length > 0 && (
        <div className="flex items-center gap-5 px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-800 flex-wrap">
          <span><span className="font-bold">{submittedDays}</span> / {daysInMonth} days logged</span>
          <span><span className="font-bold">{totalWorkHrsMo.toFixed(1)}</span> hrs total</span>
          {totalHsdMo > 0 && <span><span className="font-bold">{totalHsdMo.toFixed(1)}</span> L HSD</span>}
          {totalWorkHrsMo > 0 && totalHsdMo > 0 && (
            <span>Avg <span className="font-bold">{(totalHsdMo / totalWorkHrsMo).toFixed(2)}</span> L/hr</span>
          )}
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Loading month entries…</span>
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
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Bkdn Hrs</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Work Done</th>
                <th className="text-center px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-28">Status</th>
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

                const totalWH   = dayEnts.reduce((s, e) => s + parseFloat(e.working_hours || 0), 0)
                const totalHSD  = dayEnts.reduce((s, e) => s + parseFloat(e.hsd || 0), 0)
                const totalBK   = dayEnts.reduce((s, e) => s + parseFloat(e.breakdown || 0), 0)
                const shifts    = [...new Set(dayEnts.map(e => e.shift))].join(' + ')
                const workDone  = dayEnts.map(e => e.work_done).filter(Boolean).join('; ')

                // Saturday = 6, Sunday = 0 in JS day index
                const jsDay    = new Date(dateStr + 'T00:00:00').getDay()
                const isWeekend = jsDay === 0 || jsDay === 6

                const rowCls = [
                  'border-b border-gray-100 transition-colors',
                  hasEntry  ? 'bg-green-50/30 hover:bg-green-50/60'  :
                  isToday   ? 'bg-amber-50/70 hover:bg-amber-50'     :
                  isFuture  ? 'opacity-40'                           :
                  isWeekend ? 'bg-gray-50/50 hover:bg-gray-50'       :
                              'hover:bg-gray-50/60',
                ].join(' ')

                const textMuted = isFuture ? 'text-gray-300' : 'text-gray-400'
                const textNorm  = isFuture ? 'text-gray-300' : isToday ? 'text-gray-900 font-semibold' : 'text-gray-700'

                return (
                  <tr key={d} className={rowCls}>

                    {/* Day # */}
                    <td className={`px-3 py-2.5 text-xs font-mono tabular-nums ${textMuted}`}>{d}</td>

                    {/* Date */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-xs ${textNorm}`}>
                        <span className={`mr-1 ${textMuted}`}>{dayName}</span>
                        {pad(d)} {MONTH_ABR[month - 1]}
                      </span>
                      {isToday && (
                        <span className="ml-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold tracking-wide">TODAY</span>
                      )}
                    </td>

                    {/* Shift */}
                    <td className={`px-3 py-2.5 text-xs ${hasEntry && !isFuture ? 'text-gray-600' : textMuted}`}>
                      {hasEntry ? shifts : '—'}
                    </td>

                    {/* Work Hrs */}
                    <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-mono ${
                      hasEntry && !isFuture ? 'text-gray-800 font-semibold' : textMuted
                    }`}>
                      {hasEntry ? totalWH.toFixed(2) : '—'}
                    </td>

                    {/* HSD */}
                    <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-mono ${
                      hasEntry && !isFuture && totalHSD > 0 ? 'text-gray-600' : textMuted
                    }`}>
                      {hasEntry && totalHSD > 0 ? totalHSD.toFixed(2) : '—'}
                    </td>

                    {/* Breakdown */}
                    <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-mono ${
                      hasEntry && !isFuture && totalBK > 0 ? 'text-red-600 font-semibold' : textMuted
                    }`}>
                      {hasEntry && totalBK > 0 ? totalBK.toFixed(2) : '—'}
                    </td>

                    {/* Work Done */}
                    <td className={`px-3 py-2.5 text-xs ${hasEntry && !isFuture ? 'text-gray-600' : textMuted}`}>
                      <span className="truncate block max-w-[180px]" title={workDone || ''}>
                        {hasEntry && workDone ? workDone : '—'}
                      </span>
                    </td>

                    {/* Action / Status */}
                    <td className="px-3 py-2.5 text-center">
                      {hasEntry ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                          <CheckCircle2 size={10} /> Submitted
                        </span>
                      ) : isFuture ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : isToday ? (
                        <button
                          onClick={() => setFormOpen(dateStr)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-full transition-colors shadow-sm whitespace-nowrap"
                        >
                          + Add Entry
                        </button>
                      ) : isAdmin ? (
                        <button
                          onClick={() => setFormOpen(dateStr)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full transition-colors whitespace-nowrap"
                        >
                          + Add
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full cursor-default whitespace-nowrap"
                          title="Contact admin to add or edit past entries"
                        >
                          <Lock size={9} /> Locked
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Legend ── */}
      {!loading && isCurrentMonth && (
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300 inline-block" />Submitted</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300 inline-block" />Today</span>
          {!isAdmin && <span className="flex items-center gap-1.5"><Lock size={10} className="text-gray-400" />Past days locked — contact admin to edit</span>}
        </div>
      )}

      {/* ── Entry Form Modal ── */}
      {formOpen && (
        <EntryFormModal
          machine={machine}
          date={formOpen}
          onSave={(machineId, savedDate) => {
            setFormOpen(null)
            load()
            onEntrySaved(machineId, savedDate)
          }}
          onClose={() => setFormOpen(null)}
        />
      )}
    </div>
  )
}

// ── Main Entry Page ───────────────────────────────────────────────────────────

export default function Entry() {
  const { user }  = useAuth()
  const isAdmin   = user?.role === 'admin'

  const [projects,       setProjects]       = useState([])
  const [project,        setProject]        = useState('')
  const [date,           setDate]           = useState(today())
  const [dprStatus,      setDprStatus]      = useState(null)
  const [dprLoading,     setDprLoading]     = useState(false)
  const [selectedMachine, setSelectedMachine] = useState(null)
  const [search,         setSearch]         = useState('')
  const [typeFilter,     setTypeFilter]     = useState('')

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

  useEffect(() => {
    setDprStatus(null)
    setSearch('')
    setTypeFilter('')
    setSelectedMachine(null)
    loadDprStatus(project, date)
  }, [project, date, loadDprStatus])

  const handleEntrySaved = useCallback(() => {
    loadDprStatus(project, date)
  }, [project, date, loadDprStatus])

  const allMachines = dprStatus?.machines || []
  const uniqueTypes = [...new Set(allMachines.map(m => m.eq_type))].sort()
  const filteredMachines = allMachines.filter(m => {
    const q = search.toLowerCase()
    const matchSearch = !q || [m.slno, m.eq_type, m.reg_no, m.capacity]
      .some(v => v && String(v).toLowerCase().includes(q))
    const matchType = !typeFilter || m.eq_type === typeFilter
    return matchSearch && matchType
  })
  const isFiltered = !!(search || typeFilter)

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Log Entry</h1>
        {project && dprStatus && !selectedMachine && (
          <button
            onClick={() => loadDprStatus(project, date)}
            disabled={dprLoading}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <RefreshCw size={13} className={dprLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      </div>

      {/* ── Project + Date + Progress ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
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

        {/* Progress bar */}
        {project && dprStatus && dprStatus.total > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm flex-wrap gap-2">
              <span className="font-medium text-gray-700">
                DPR Progress — <span className="text-gray-900">{dprStatus.completed}/{dprStatus.total}</span> assets
              </span>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 text-green-600 font-semibold">
                  <CheckCircle2 size={14} />
                  {dprStatus.pct_completed}% completed
                </span>
                {dprStatus.pending > 0 && (
                  <span className="flex items-center gap-1 text-amber-600 font-medium">
                    <Clock size={14} />
                    {dprStatus.pending} pending
                  </span>
                )}
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-green-500 h-2.5 rounded-full transition-all duration-700"
                style={{ width: `${dprStatus.pct_completed}%` }}
              />
            </div>
          </div>
        )}

        {project && dprStatus?.total === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">No active assets in this project.</p>
        )}

        {project && dprLoading && !dprStatus && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 size={14} className="animate-spin" /> Loading asset status…
          </div>
        )}

        {!project && (
          <p className="text-sm text-gray-400 text-center py-1">Select a project to view asset DPR status.</p>
        )}
      </section>

      {/* ── Month Grid Panel (when machine selected) ── */}
      {selectedMachine && (
        <MonthGridPanel
          machine={selectedMachine}
          onBack={() => setSelectedMachine(null)}
          onEntrySaved={handleEntrySaved}
          isAdmin={isAdmin}
        />
      )}

      {/* ── Asset list (hidden while machine is selected) ── */}
      {!selectedMachine && project && dprStatus && allMachines.length > 0 && (
        <>
          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search SL#, equipment type, reg no…"
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
                <button
                  type="button"
                  onClick={() => { setSearch(''); setTypeFilter('') }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 px-2 py-2 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                >
                  <X size={13} /> Clear
                </button>
              )}
            </div>
            {isFiltered && (
              <p className="text-xs text-gray-400">
                Showing <span className="font-semibold text-gray-700">{filteredMachines.length}</span> of <span className="font-semibold text-gray-700">{allMachines.length}</span> assets
                {filteredMachines.length > 0 && <>
                  {' · '}
                  <span className="text-green-600 font-medium">{filteredMachines.filter(m => m.has_entry).length} completed</span>
                  {filteredMachines.filter(m => !m.has_entry).length > 0 && <>, <span className="text-amber-600 font-medium">{filteredMachines.filter(m => !m.has_entry).length} pending</span></>}
                </>}
              </p>
            )}
          </div>

          {/* Asset card grid */}
          {filteredMachines.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredMachines.map(m => (
                <AssetCard key={m.id} machine={m} onClick={setSelectedMachine} />
              ))}
            </div>
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
