import { useState, useEffect } from 'react'
import { getProjects, getMachines, createEntry, getPreviousClosing } from '../lib/api'
import { today } from '../lib/utils'
import { CheckCircle, AlertCircle, Search } from 'lucide-react'

const emptyForm = {
  shift: '',
  r1_open: '', r1_close: '',
  r2_open: '', r2_close: '',
  hsd: '', breakdown: '', qty: '', work_done: '',
  n_r1_close: '',
  n_r2_close: '',
  n_hsd: '', n_breakdown: '', n_qty: '', n_work_done: '',
  remarks: ''
}

const SHIFT_MAX = 12

export default function Entry() {
  const [projects, setProjects]   = useState([])
  const [machines, setMachines]   = useState([])
  const [search, setSearch]       = useState('')
  const [project, setProject]     = useState('')
  const [date, setDate]           = useState(today())
  const [machine, setMachine]     = useState(null)
  const [form, setForm]           = useState(emptyForm)
  const [loading, setLoading]     = useState(false)
  const [toast, setToast]         = useState(null)

  useEffect(() => {
    getProjects().then(r => {
      setProjects(r.data.data)
      if (r.data.data.length === 1) setProject(r.data.data[0].code)
    })
  }, [])

  useEffect(() => {
    if (!project) { setMachines([]); return }
    getMachines({ project_code: project }).then(r => setMachines(r.data.data))
    setMachine(null)
  }, [project])

  const filtered = machines.filter(m =>
    !search || `${m.slno} ${m.eq_type} ${m.reg_no || ''}`.toLowerCase().includes(search.toLowerCase())
  )

  const pick = async (m) => {
    setMachine(m)
    setForm(emptyForm)
    setToast(null)
    if (m.shift_type === 'Dual Shift') {
      try {
        const r = await getPreviousClosing({ machine_id: m.id, entry_date: date, shift: 'Day Shift' })
        const prev = r.data.data
        if (prev) {
          setForm(f => ({
            ...f,
            r1_open: prev.r1_close != null ? String(prev.r1_close) : '',
            ...(m.dual_reading && prev.r2_close != null ? { r2_open: String(prev.r2_close) } : {}),
          }))
        }
      } catch { }
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleShiftChange = async (e) => {
    const newShift = e.target.value
    setForm(f => ({ ...f, shift: newShift, r1_open: '', r2_open: '' }))
    if (!machine || !newShift) return
    try {
      const r = await getPreviousClosing({ machine_id: machine.id, entry_date: date, shift: newShift })
      const prev = r.data.data
      if (prev) {
        setForm(f => ({
          ...f,
          r1_open: prev.r1_close != null ? String(prev.r1_close) : f.r1_open,
          ...(machine.dual_reading && prev.r2_close != null ? { r2_open: String(prev.r2_close) } : {}),
        }))
      }
    } catch { }
  }

  const isDual = machine?.shift_type === 'Dual Shift'

  // Day / single shift calculations
  const r1Total = form.r1_open !== '' && form.r1_close !== ''
    ? parseFloat(form.r1_close) - parseFloat(form.r1_open) : null
  const r2Total = machine?.dual_reading && form.r2_open !== '' && form.r2_close !== ''
    ? parseFloat(form.r2_close) - parseFloat(form.r2_open) : null

  // Night shift calculations (dual only — night opens where day closed)
  const nR1Total = isDual && form.r1_close !== '' && form.n_r1_close !== ''
    ? parseFloat(form.n_r1_close) - parseFloat(form.r1_close) : null
  const nR2Total = isDual && machine?.dual_reading && form.r2_close !== '' && form.n_r2_close !== ''
    ? parseFloat(form.n_r2_close) - parseFloat(form.r2_close) : null

  const dayWorkHrs   = (r1Total || 0) + (r2Total || 0)
  const nightWorkHrs = (nR1Total || 0) + (nR2Total || 0)
  const workHrs      = isDual ? dayWorkHrs + nightWorkHrs : dayWorkHrs
  const planned      = parseFloat(machine?.planned_hours) || 10
  const utilPct      = planned > 0 ? Math.round((workHrs / planned) * 100) : 0

  const dayFuelRate   = dayWorkHrs > 0 && form.hsd ? (parseFloat(form.hsd) / dayWorkHrs).toFixed(2) : null
  const nightFuelRate = nightWorkHrs > 0 && form.n_hsd ? (parseFloat(form.n_hsd) / nightWorkHrs).toFixed(2) : null

  const r1Invalid     = r1Total !== null && r1Total < 0
  const r2Invalid     = r2Total !== null && r2Total < 0
  const nR1Invalid    = nR1Total !== null && nR1Total < 0
  const nR2Invalid    = nR2Total !== null && nR2Total < 0
  const dayExceeded   = dayWorkHrs > SHIFT_MAX
  const nightExceeded = isDual && nightWorkHrs > SHIFT_MAX
  const anyError      = r1Invalid || r2Invalid || nR1Invalid || nR2Invalid || dayExceeded || nightExceeded

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!machine) return

    if (!isDual && !form.shift) {
      setToast({ type: 'error', msg: 'Please select Day Shift or Night Shift.' })
      return
    }
    if (r1Invalid) {
      setToast({ type: 'error', msg: 'Day Reading 1: Closing must be ≥ Opening.' })
      return
    }
    if (r2Invalid) {
      setToast({ type: 'error', msg: 'Day Reading 2: Closing must be ≥ Opening.' })
      return
    }
    if (isDual && nR1Invalid) {
      setToast({ type: 'error', msg: 'Night Reading 1: Closing must be ≥ Day Shift closing.' })
      return
    }
    if (isDual && nR2Invalid) {
      setToast({ type: 'error', msg: 'Night Reading 2: Closing must be ≥ Day Shift closing.' })
      return
    }
    if (dayExceeded) {
      setToast({ type: 'error', msg: `${isDual ? 'Day Shift' : form.shift}: total hours (${dayWorkHrs.toFixed(2)}) exceed the 12-hour limit.` })
      return
    }
    if (isDual && nightExceeded) {
      setToast({ type: 'error', msg: `Night Shift: total hours (${nightWorkHrs.toFixed(2)}) exceed the 12-hour limit.` })
      return
    }

    setLoading(true); setToast(null)
    try {
      if (isDual) {
        await Promise.all([
          createEntry({
            machine_id: machine.id, project_id: machine.project_id,
            entry_date: date, shift: 'Day Shift',
            r1_open: form.r1_open || null, r1_close: form.r1_close || null,
            r2_open: form.r2_open || null, r2_close: form.r2_close || null,
            hsd: form.hsd || null, breakdown: form.breakdown || 0,
            qty: form.qty || null, work_done: form.work_done || null,
            remarks: form.remarks || null,
          }),
          createEntry({
            machine_id: machine.id, project_id: machine.project_id,
            entry_date: date, shift: 'Night Shift',
            r1_open: form.r1_close || null, r1_close: form.n_r1_close || null,
            r2_open: form.r2_close || null, r2_close: form.n_r2_close || null,
            hsd: form.n_hsd || null, breakdown: form.n_breakdown || 0,
            qty: form.n_qty || null, work_done: form.n_work_done || null,
            remarks: form.remarks || null,
          }),
        ])
      } else {
        await createEntry({
          machine_id: machine.id, project_id: machine.project_id,
          entry_date: date, shift: form.shift,
          r1_open: form.r1_open || null, r1_close: form.r1_close || null,
          r2_open: form.r2_open || null, r2_close: form.r2_close || null,
          hsd: form.hsd || null, breakdown: form.breakdown || 0,
          qty: form.qty || null, work_done: form.work_done || null,
          remarks: form.remarks || null,
        })
      }
      setToast({ type: 'success', msg: `Entry saved — ${machine.slno} on ${date}` })
      setMachine(null); setSearch('')
    } catch (err) {
      setToast({ type: 'error', msg: err.response?.data?.error || 'Failed to save entry' })
    } finally {
      setLoading(false)
    }
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900">DPR Entry</h1>

      {/* Step 1 */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Step 1 — Project &amp; Date</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Project</label>
            <select value={project} onChange={e => setProject(e.target.value)} className={inp}>
              <option value="">— select project —</option>
              {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
          </div>
        </div>
      </section>

      {/* Step 2: machine list */}
      {project && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Step 2 — Select Machine</p>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search SL#, type, or reg no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-sm text-center text-gray-400">No machines found</p>
            )}
            {filtered.map(m => (
              <button
                key={m.id} type="button" onClick={() => pick(m)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors hover:bg-blue-50 ${machine?.id === m.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`}
              >
                <div>
                  <span className="text-sm font-semibold text-gray-900">{m.slno}</span>
                  <span className="text-sm text-gray-500 ml-2">· {m.eq_type}</span>
                  {m.capacity && <span className="text-xs text-gray-400 ml-1">({m.capacity})</span>}
                </div>
                <div className="text-right flex-shrink-0 ml-4 space-y-1">
                  <p className="text-xs text-gray-500">{m.reg_no || '—'}</p>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    m.shift_type === 'Dual Shift' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                  }`}>{m.shift_type || 'Single Shift'}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 3: readings form */}
      {machine && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Step 3 — Readings</p>
              <p className="text-sm font-semibold text-gray-800 mt-1">{machine.slno} · {machine.eq_type}</p>
              <p className="text-xs text-gray-400">{date}</p>
            </div>
            {workHrs > 0 && (
              <div className={`text-right rounded-xl px-4 py-3 ${anyError ? 'bg-red-50' : 'bg-blue-50'}`}>
                <p className={`text-2xl font-bold ${anyError ? 'text-red-600' : 'text-blue-700'}`}>{workHrs.toFixed(2)}</p>
                <p className="text-xs text-gray-500">Total working hrs</p>
                <p className={`text-xs font-semibold mt-0.5 ${anyError ? 'text-red-600' : 'text-gray-700'}`}>
                  {anyError ? 'Check readings' : `${utilPct}% util`}
                </p>
              </div>
            )}
          </div>

          {/* ── SINGLE SHIFT: shift selector ── */}
          {!isDual && (
            <div>
              <label className={lbl}>Shift <span className="text-red-500">*</span></label>
              <select value={form.shift} onChange={handleShiftChange} className={inp} required>
                <option value="">— select shift —</option>
                <option value="Day Shift">Day Shift (max 12 hrs)</option>
                <option value="Night Shift">Night Shift (max 12 hrs)</option>
              </select>
              {form.shift && (
                <p className="text-xs text-gray-400 mt-1">
                  {form.shift === 'Night Shift'
                    ? "Opening reading auto-filled from today's Day Shift closing (if available)"
                    : "Opening reading auto-filled from previous day's last shift closing (if available)"}
                </p>
              )}
            </div>
          )}

          {/* ── DUAL SHIFT: Day Shift section ── */}
          {isDual && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded">DAY SHIFT</span>
                {dayWorkHrs > 0 && (
                  <span className={`text-xs font-medium ${dayExceeded ? 'text-red-600' : 'text-gray-500'}`}>
                    {dayWorkHrs.toFixed(2)} hrs{dayExceeded ? ' — exceeds 12 h limit' : ''}
                  </span>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Reading 1 · {machine.reading1_basis}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={lbl}>Opening</label>
                    <input type="number" step="0.01" value={form.r1_open} onChange={set('r1_open')} className={inp} placeholder="0.00" required />
                  </div>
                  <div>
                    <label className={lbl}>Closing</label>
                    <input type="number" step="0.01" value={form.r1_close} onChange={set('r1_close')} className={`${inp} ${r1Invalid ? 'border-red-500 focus:ring-red-500' : ''}`} placeholder="0.00" required />
                  </div>
                  <div>
                    <label className={lbl}>Total</label>
                    <input readOnly value={r1Total !== null ? `${r1Total.toFixed(2)} ${machine.reading1_basis}` : ''} className={`${inp} ${r1Invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} />
                  </div>
                </div>
                {r1Invalid && <p className="text-xs text-red-600 mt-1">Closing must be ≥ Opening</p>}
              </div>

              {machine.dual_reading && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Reading 2 · {machine.reading2_basis || 'KM'}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={lbl}>Opening</label><input type="number" step="0.01" value={form.r2_open} onChange={set('r2_open')} className={inp} placeholder="0.00" /></div>
                    <div>
                      <label className={lbl}>Closing</label>
                      <input type="number" step="0.01" value={form.r2_close} onChange={set('r2_close')} className={`${inp} ${r2Invalid ? 'border-red-500 focus:ring-red-500' : ''}`} placeholder="0.00" />
                    </div>
                    <div>
                      <label className={lbl}>Total</label>
                      <input readOnly value={r2Total !== null ? r2Total.toFixed(2) : ''} className={`${inp} ${r2Invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} />
                    </div>
                  </div>
                  {r2Invalid && <p className="text-xs text-red-600 mt-1">Closing must be ≥ Opening</p>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>HSD Consumed (litres)</label>
                  <input type="number" step="0.01" min="0" value={form.hsd} onChange={set('hsd')} className={inp} placeholder="0.00" />
                  {dayFuelRate && (
                    <p className="text-xs text-gray-500 mt-1">
                      <span className="font-medium">{dayFuelRate} L/hr</span>
                      {machine.fuel_min && machine.fuel_max && <span className="text-gray-400"> · norm {machine.fuel_min}–{machine.fuel_max}</span>}
                    </p>
                  )}
                </div>
                <div>
                  <label className={lbl}>Breakdown Hours</label>
                  <input type="number" step="0.01" min="0" value={form.breakdown} onChange={set('breakdown')} className={inp} placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={lbl}>Quantity</label><input type="number" step="0.01" value={form.qty} onChange={set('qty')} className={inp} placeholder="Optional" /></div>
                <div><label className={lbl}>Work Done</label><input type="text" value={form.work_done} onChange={set('work_done')} className={inp} placeholder="Brief description" /></div>
              </div>
            </div>
          )}

          {/* ── DUAL SHIFT: Night Shift section ── */}
          {isDual && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded">NIGHT SHIFT</span>
                {nightWorkHrs > 0 && (
                  <span className={`text-xs font-medium ${nightExceeded ? 'text-red-600' : 'text-gray-500'}`}>
                    {nightWorkHrs.toFixed(2)} hrs{nightExceeded ? ' — exceeds 12 h limit' : ''}
                  </span>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Reading 1 · {machine.reading1_basis}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={lbl}>Opening <span className="text-gray-400 font-normal">(= Day closing)</span></label>
                    <input readOnly value={form.r1_close || ''} className={`${inp} bg-gray-50 text-gray-500 cursor-not-allowed`} placeholder="—" />
                  </div>
                  <div>
                    <label className={lbl}>Closing</label>
                    <input type="number" step="0.01" value={form.n_r1_close} onChange={set('n_r1_close')} className={`${inp} ${nR1Invalid ? 'border-red-500 focus:ring-red-500' : ''}`} placeholder="0.00" required />
                  </div>
                  <div>
                    <label className={lbl}>Total</label>
                    <input readOnly value={nR1Total !== null ? `${nR1Total.toFixed(2)} ${machine.reading1_basis}` : ''} className={`${inp} ${nR1Invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} />
                  </div>
                </div>
                {nR1Invalid && <p className="text-xs text-red-600 mt-1">Night closing must be ≥ Day closing</p>}
              </div>

              {machine.dual_reading && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Reading 2 · {machine.reading2_basis || 'KM'}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={lbl}>Opening <span className="text-gray-400 font-normal">(= Day closing)</span></label>
                      <input readOnly value={form.r2_close || ''} className={`${inp} bg-gray-50 text-gray-500 cursor-not-allowed`} placeholder="—" />
                    </div>
                    <div>
                      <label className={lbl}>Closing</label>
                      <input type="number" step="0.01" value={form.n_r2_close} onChange={set('n_r2_close')} className={`${inp} ${nR2Invalid ? 'border-red-500 focus:ring-red-500' : ''}`} placeholder="0.00" />
                    </div>
                    <div>
                      <label className={lbl}>Total</label>
                      <input readOnly value={nR2Total !== null ? nR2Total.toFixed(2) : ''} className={`${inp} ${nR2Invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} />
                    </div>
                  </div>
                  {nR2Invalid && <p className="text-xs text-red-600 mt-1">Night closing must be ≥ Day closing</p>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>HSD Consumed (litres)</label>
                  <input type="number" step="0.01" min="0" value={form.n_hsd} onChange={set('n_hsd')} className={inp} placeholder="0.00" />
                  {nightFuelRate && (
                    <p className="text-xs text-gray-500 mt-1">
                      <span className="font-medium">{nightFuelRate} L/hr</span>
                      {machine.fuel_min && machine.fuel_max && <span className="text-gray-400"> · norm {machine.fuel_min}–{machine.fuel_max}</span>}
                    </p>
                  )}
                </div>
                <div>
                  <label className={lbl}>Breakdown Hours</label>
                  <input type="number" step="0.01" min="0" value={form.n_breakdown} onChange={set('n_breakdown')} className={inp} placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={lbl}>Quantity</label><input type="number" step="0.01" value={form.n_qty} onChange={set('n_qty')} className={inp} placeholder="Optional" /></div>
                <div><label className={lbl}>Work Done</label><input type="text" value={form.n_work_done} onChange={set('n_work_done')} className={inp} placeholder="Brief description" /></div>
              </div>
            </div>
          )}

          {/* ── SINGLE SHIFT: readings ── */}
          {!isDual && (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Reading 1 · {machine.reading1_basis}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className={lbl}>Opening</label><input type="number" step="0.01" value={form.r1_open} onChange={set('r1_open')} className={inp} placeholder="0.00" required /></div>
                  <div>
                    <label className={lbl}>Closing</label>
                    <input type="number" step="0.01" value={form.r1_close} onChange={set('r1_close')} className={`${inp} ${r1Invalid ? 'border-red-500 focus:ring-red-500' : ''}`} placeholder="0.00" required />
                  </div>
                  <div>
                    <label className={lbl}>Total</label>
                    <input readOnly value={r1Total !== null ? `${r1Total.toFixed(2)} ${machine.reading1_basis}` : ''} className={`${inp} ${r1Invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} />
                  </div>
                </div>
                {r1Invalid && <p className="text-xs text-red-600 mt-1">Closing must be ≥ Opening — total hours cannot be negative</p>}
              </div>

              {machine.dual_reading && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Reading 2 · {machine.reading2_basis || 'KM'}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={lbl}>Opening</label><input type="number" step="0.01" value={form.r2_open} onChange={set('r2_open')} className={inp} placeholder="0.00" /></div>
                    <div>
                      <label className={lbl}>Closing</label>
                      <input type="number" step="0.01" value={form.r2_close} onChange={set('r2_close')} className={`${inp} ${r2Invalid ? 'border-red-500 focus:ring-red-500' : ''}`} placeholder="0.00" />
                    </div>
                    <div>
                      <label className={lbl}>Total</label>
                      <input readOnly value={r2Total !== null ? r2Total.toFixed(2) : ''} className={`${inp} ${r2Invalid ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`} />
                    </div>
                  </div>
                  {r2Invalid && <p className="text-xs text-red-600 mt-1">Closing must be ≥ Opening — total hours cannot be negative</p>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>HSD Consumed (litres)</label>
                  <input type="number" step="0.01" min="0" value={form.hsd} onChange={set('hsd')} className={inp} placeholder="0.00" />
                  {dayFuelRate && (
                    <p className="text-xs text-gray-500 mt-1">
                      <span className="font-medium">{dayFuelRate} L/hr</span>
                      {machine.fuel_min && machine.fuel_max &&
                        <span className="text-gray-400"> · norm {machine.fuel_min}–{machine.fuel_max}</span>}
                    </p>
                  )}
                </div>
                <div>
                  <label className={lbl}>Breakdown Hours</label>
                  <input type="number" step="0.01" min="0" value={form.breakdown} onChange={set('breakdown')} className={inp} placeholder="0.00" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className={lbl}>Quantity</label><input type="number" step="0.01" value={form.qty} onChange={set('qty')} className={inp} placeholder="Optional" /></div>
                <div><label className={lbl}>Work Done</label><input type="text" value={form.work_done} onChange={set('work_done')} className={inp} placeholder="Brief description" /></div>
              </div>
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
              {loading ? 'Saving…' : isDual ? 'Save Day + Night Entries' : 'Save Entry'}
            </button>
            <button type="button" onClick={() => setMachine(null)} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
