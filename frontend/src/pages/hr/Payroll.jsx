import { useState, useEffect } from 'react'
import { getProjects, getPayrollRuns, getPayrollItems, generatePayroll, updatePayrollStatus, deletePayrollRun } from '../../lib/api'
import { today, formatNum, exportCSV, monthStart } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { Plus, Trash2, Download, X, Eye, CheckCircle, Clock, IndianRupee } from 'lucide-react'

const STATUS_BADGE = {
  Draft:    'bg-gray-100 text-gray-700',
  Approved: 'bg-blue-100 text-blue-800',
  Paid:     'bg-green-100 text-green-800',
}
const STATUS_ICON = { Draft: Clock, Approved: CheckCircle, Paid: IndianRupee }
const STATUS_FLOW = { Draft: ['Approved'], Approved: ['Paid'], Paid: [] }

export default function Payroll() {
  const { isAdmin } = useAuth()
  const [projects, setProjects]     = useState([])
  const [runs, setRuns]             = useState([])
  const [loading, setLoading]       = useState(false)
  const [filter, setFilter]         = useState({ project_code: '' })

  // Generate modal
  const [showGen, setShowGen]       = useState(false)
  const [genForm, setGenForm]       = useState({ project_id: '', period_from: monthStart(), period_to: today(), notes: '' })
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError]     = useState('')

  // Detail panel
  const [detailRun, setDetailRun]   = useState(null)
  const [detailItems, setDetailItems] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  useEffect(() => { getProjects().then(r => setProjects(r.data.data)) }, [])

  const load = () => {
    setLoading(true)
    const p = {}
    if (filter.project_code) p.project_code = filter.project_code
    getPayrollRuns(p).then(r => setRuns(r.data.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [filter])

  const setGF = k => e => setGenForm(f => ({ ...f, [k]: e.target.value }))

  // Totals
  const totalPaid     = runs.filter(r => r.status === 'Paid').reduce((s, r) => s + parseFloat(r.total_amount || 0), 0)
  const totalDraft    = runs.filter(r => r.status === 'Draft').length
  const totalApproved = runs.filter(r => r.status === 'Approved').length

  // ── Generate ──
  const openGen  = () => { setGenForm({ project_id: '', period_from: monthStart(), period_to: today(), notes: '' }); setGenError(''); setShowGen(true) }
  const closeGen = () => { setShowGen(false); setGenError('') }

  const handleGenerate = async () => {
    if (!genForm.project_id || !genForm.period_from || !genForm.period_to) {
      setGenError('Project and period are required.'); return
    }
    setGenerating(true); setGenError('')
    try {
      const res = await generatePayroll(genForm)
      closeGen()
      load()
      // Auto-open detail for the newly created run
      openDetail(res.data.data.run, res.data.data.items)
    } catch (err) {
      setGenError(err.response?.data?.error || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  // ── Detail panel ──
  const openDetail = async (run, preloadedItems = null) => {
    setDetailRun(run)
    setShowDetail(true)
    if (preloadedItems) {
      setDetailItems(preloadedItems)
    } else {
      setDetailLoading(true)
      getPayrollItems(run.id).then(r => setDetailItems(r.data.data)).finally(() => setDetailLoading(false))
    }
  }
  const closeDetail = () => { setShowDetail(false); setDetailRun(null); setDetailItems([]) }

  // ── Status update ──
  const handleStatusUpdate = async (runId, newStatus) => {
    const labels = { Approved: 'approve', Paid: 'mark as Paid' }
    if (!window.confirm(`Are you sure you want to ${labels[newStatus]} this payroll run?`)) return
    try {
      await updatePayrollStatus(runId, { status: newStatus })
      load()
      if (detailRun?.id === runId) setDetailRun(r => ({ ...r, status: newStatus }))
    } catch (err) {
      alert(err.response?.data?.error || 'Update failed')
    }
  }

  // ── Delete ──
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this payroll run? This cannot be undone.')) return
    try {
      await deletePayrollRun(id)
      load()
      if (detailRun?.id === id) closeDetail()
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed')
    }
  }

  // ── Export detail ──
  const handleExportDetail = () => {
    if (!detailRun || !detailItems.length) return
    exportCSV(
      ['Emp ID', 'Name', 'Designation', 'Daily Wage', 'Present Days', 'Half Days', 'Absent', 'On Leave', 'OT Hrs', 'Basic Pay', 'OT Pay', 'Deductions', 'Net Pay'],
      detailItems.map(i => [
        i.emp_id ?? '', i.operator_name, i.designation ?? '',
        i.daily_wage, i.present_days, i.half_days, i.absent_days, i.on_leave_days,
        i.ot_hours, i.basic_pay, i.ot_pay, i.deductions, i.net_pay
      ]),
      `Payroll_${detailRun.project_code}_${detailRun.period_from}_${detailRun.period_to}.csv`
    )
  }

  const sel = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {runs.length} runs · {totalDraft} draft · {totalApproved} approved
          </p>
        </div>
        {isAdmin && (
          <button onClick={openGen} className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors">
            <Plus size={15} />Generate Payroll
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Runs',    val: runs.length,           color: 'text-gray-900' },
          { label: 'Draft',         val: totalDraft,             color: 'text-gray-600' },
          { label: 'Approved',      val: totalApproved,          color: 'text-blue-700' },
          { label: 'Total Paid Out',val: `₹${formatNum(totalPaid, 0)}`, color: 'text-green-700' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`text-2xl font-bold ${color}`}>{val}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <select value={filter.project_code} onChange={e => setFilter(f => ({ ...f, project_code: e.target.value }))} className={`${sel} w-48`}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
        </select>
      </div>

      {/* Runs table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <IndianRupee size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No payroll runs yet.{isAdmin ? ' Click "Generate Payroll" to create one.' : ''}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Project','Period','Operators','Total Amount','Status','Created','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map(run => {
                  const Icon = STATUS_ICON[run.status]
                  const nextStatuses = STATUS_FLOW[run.status] || []
                  return (
                    <tr key={run.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">{run.project_code}</span>
                        <div className="text-xs text-gray-400 mt-0.5">{run.project_name}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-800">{run.period_from} → {run.period_to}</div>
                        {run.notes && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[140px]">{run.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">{run.operator_count}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">₹{formatNum(run.total_amount, 0)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[run.status]}`}>
                          {Icon && <Icon size={11} />}{run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(run.created_at).toLocaleDateString('en-IN')}<br />
                        <span className="text-gray-400">{run.created_by_name ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex gap-1 items-center">
                          <button onClick={() => openDetail(run)} className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600">
                            <Eye size={12} />View
                          </button>
                          {isAdmin && nextStatuses.map(ns => (
                            <button key={ns} onClick={() => handleStatusUpdate(run.id, ns)}
                              className={`text-xs px-2 py-1 rounded border font-medium transition-colors ${
                                ns === 'Paid' ? 'border-green-500 text-green-700 hover:bg-green-50' : 'border-blue-400 text-blue-700 hover:bg-blue-50'
                              }`}
                            >{ns === 'Approved' ? 'Approve' : 'Mark Paid'}</button>
                          ))}
                          {isAdmin && run.status !== 'Paid' && (
                            <button onClick={() => handleDelete(run.id)} className="text-red-500 hover:text-red-700 p-1 rounded">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── GENERATE MODAL ── */}
      {showGen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mt-16">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">Generate Payroll</h2>
              <button onClick={closeGen} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {genError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{genError}</p>}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                Payroll is computed from <strong>Attendance records</strong> in the selected period.<br />
                OT rate = Daily Wage ÷ 8 hrs · Half Day = 0.5 day · Absent / Leave = 0 pay
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Project *</label>
                  <select value={genForm.project_id} onChange={setGF('project_id')} className={inp}>
                    <option value="">Select project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Period From *</label>
                    <input type="date" value={genForm.period_from} onChange={setGF('period_from')} className={inp} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Period To *</label>
                    <input type="date" value={genForm.period_to} onChange={setGF('period_to')} className={inp} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
                  <input type="text" placeholder="e.g. April 2025 Payroll" value={genForm.notes} onChange={setGF('notes')} className={inp} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button onClick={closeGen} className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50">Cancel</button>
              <button onClick={handleGenerate} disabled={generating} className="px-4 py-2 text-sm rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60">
                {generating ? 'Generating…' : 'Generate & Save Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DETAIL PANEL ── */}
      {showDetail && detailRun && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/40" onClick={closeDetail} />
          {/* Slide-in panel */}
          <div className="w-full max-w-4xl bg-white shadow-2xl flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
              <div>
                <h2 className="font-bold text-gray-900">Payroll Detail</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {detailRun.project_code} · {detailRun.period_from} to {detailRun.period_to}
                  {' · '}
                  <span className={`font-semibold ${STATUS_BADGE[detailRun.status]?.split(' ')[1] ?? ''}`}>{detailRun.status}</span>
                </p>
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={handleExportDetail} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">
                  <Download size={13} />Export CSV
                </button>
                <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
              </div>
            </div>

            {/* Summary bar */}
            <div className="flex gap-6 px-5 py-3 bg-white border-b border-gray-100 text-sm">
              <span><span className="text-gray-500">Operators:</span> <strong>{detailItems.length}</strong></span>
              <span><span className="text-gray-500">Basic Pay:</span> <strong>₹{formatNum(detailItems.reduce((s,i) => s + parseFloat(i.basic_pay||0),0), 0)}</strong></span>
              <span><span className="text-gray-500">OT Pay:</span> <strong>₹{formatNum(detailItems.reduce((s,i) => s + parseFloat(i.ot_pay||0),0), 0)}</strong></span>
              <span><span className="text-gray-500">Total Net:</span> <strong className="text-green-700">₹{formatNum(detailRun.total_amount, 0)}</strong></span>
            </div>

            {/* Items table */}
            <div className="flex-1 overflow-y-auto">
              {detailLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
              ) : detailItems.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No operators found in this payroll run.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      {['Emp ID','Name','Designation','Wage/Day','Present','Half','Absent','Leave','OT Hrs','Basic Pay','OT Pay','Deductions','Net Pay'].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detailItems.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-gray-400 text-xs">{item.emp_id ?? '—'}</td>
                        <td className="px-3 py-3 font-semibold whitespace-nowrap">{item.operator_name}</td>
                        <td className="px-3 py-3 text-gray-600">{item.designation ?? '—'}</td>
                        <td className="px-3 py-3">₹{item.daily_wage}</td>
                        <td className="px-3 py-3 text-green-700 font-semibold">{item.present_days}</td>
                        <td className="px-3 py-3 text-yellow-600">{item.half_days}</td>
                        <td className="px-3 py-3 text-red-600">{item.absent_days}</td>
                        <td className="px-3 py-3 text-gray-500">{item.on_leave_days}</td>
                        <td className="px-3 py-3 text-blue-600">{item.ot_hours > 0 ? item.ot_hours : '—'}</td>
                        <td className="px-3 py-3 font-medium">₹{formatNum(item.basic_pay, 0)}</td>
                        <td className="px-3 py-3 text-blue-700">{parseFloat(item.ot_pay) > 0 ? `₹${formatNum(item.ot_pay,0)}` : '—'}</td>
                        <td className="px-3 py-3 text-red-500">{parseFloat(item.deductions) > 0 ? `₹${formatNum(item.deductions,0)}` : '—'}</td>
                        <td className="px-3 py-3 font-bold text-gray-900">₹{formatNum(item.net_pay, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300 sticky bottom-0">
                    <tr>
                      <td colSpan={9} className="px-3 py-3 text-xs text-gray-500 font-semibold">TOTALS ({detailItems.length} operators)</td>
                      <td className="px-3 py-3 font-bold">₹{formatNum(detailItems.reduce((s,i)=>s+parseFloat(i.basic_pay||0),0),0)}</td>
                      <td className="px-3 py-3 font-bold text-blue-700">₹{formatNum(detailItems.reduce((s,i)=>s+parseFloat(i.ot_pay||0),0),0)}</td>
                      <td className="px-3 py-3 font-bold text-red-500">₹{formatNum(detailItems.reduce((s,i)=>s+parseFloat(i.deductions||0),0),0)}</td>
                      <td className="px-3 py-3 font-bold text-green-700">₹{formatNum(detailItems.reduce((s,i)=>s+parseFloat(i.net_pay||0),0),0)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Panel footer with status actions */}
            {isAdmin && (
              <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500">Status: <strong>{detailRun.status}</strong></span>
                <div className="flex gap-2">
                  {(STATUS_FLOW[detailRun.status] || []).map(ns => (
                    <button key={ns} onClick={() => handleStatusUpdate(detailRun.id, ns)}
                      className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                        ns === 'Paid' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-blue-700 text-white hover:bg-blue-800'
                      }`}
                    >{ns === 'Approved' ? '✓ Approve Payroll' : '₹ Mark as Paid'}</button>
                  ))}
                  {detailRun.status !== 'Paid' && (
                    <button onClick={() => handleDelete(detailRun.id)} className="px-3 py-2 text-sm rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
