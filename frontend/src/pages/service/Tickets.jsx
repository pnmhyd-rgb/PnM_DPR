import { useState, useEffect, useCallback } from 'react'
import {
  getServiceTickets, getServiceTicket, createServiceTicket,
  updateServiceTicket, updateTicketStatus, addTicketPart, removeTicketPart,
  getMachines, getProjects, getVendors,
} from '../../lib/api'
import { Plus, X, Eye, RefreshCw, ChevronLeft, ArrowRight, TicketCheck, CircleAlert } from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
const fmtMoney = v => v != null ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 0 })}` : '—'

const TICKET_TYPES = [
  { value: 'breakdown', label: 'Breakdown', color: 'bg-red-100 text-red-800' },
  { value: 'pm', label: 'Preventive Maintenance (PM)', color: 'bg-blue-100 text-blue-800' },
  { value: 'periodic', label: 'Periodic Service', color: 'bg-purple-100 text-purple-800' },
  { value: 'accident', label: 'Accident', color: 'bg-orange-100 text-orange-800' },
]

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'High', color: 'bg-amber-100 text-amber-700' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700' },
]

const STATUSES = [
  { value: 'draft',         label: 'Draft',             color: 'bg-gray-100 text-gray-600' },
  { value: 'open',          label: 'Open',              color: 'bg-blue-100 text-blue-700' },
  { value: 'assigned',      label: 'Assigned',          color: 'bg-indigo-100 text-indigo-700' },
  { value: 'in_progress',   label: 'In Progress',       color: 'bg-yellow-100 text-yellow-800' },
  { value: 'waiting_parts', label: 'Waiting for Parts', color: 'bg-orange-100 text-orange-700' },
  { value: 'completed',     label: 'Completed',         color: 'bg-green-100 text-green-700' },
  { value: 'closed',        label: 'Closed',            color: 'bg-gray-100 text-gray-500' },
  { value: 'cancelled',     label: 'Cancelled',         color: 'bg-red-100 text-red-400' },
]

const STATUS_NEXT = {
  draft:         ['open', 'cancelled'],
  open:          ['assigned', 'in_progress', 'cancelled'],
  assigned:      ['in_progress', 'cancelled'],
  in_progress:   ['waiting_parts', 'completed', 'cancelled'],
  waiting_parts: ['in_progress', 'cancelled'],
  completed:     ['closed', 'in_progress'],
  closed:        [],
  cancelled:     [],
}

const DETAIL_TABS = ['Details', 'Parts & Consumption', 'History']

const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const lbl = 'block text-xs font-medium text-gray-600 mb-1'

function typeBadge(type) {
  const t = TICKET_TYPES.find(x => x.value === type)
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${t?.color || 'bg-gray-100 text-gray-600'}`}>{t?.label || type}</span>
}
function statusBadge(status) {
  const s = STATUSES.find(x => x.value === status)
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s?.color || 'bg-gray-100 text-gray-600'}`}>{s?.label || status}</span>
}
function priorityBadge(priority) {
  const p = PRIORITIES.find(x => x.value === priority)
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p?.color || 'bg-gray-100 text-gray-600'}`}>{p?.label || priority}</span>
}

// ── Create Modal ──────────────────────────────────────────────────────────────

function CreateModal({ machines, projects, vendors, onClose, onSaved }) {
  const [form, setForm] = useState({
    ticket_type: '', title: '', description: '', machine_id: '', project_id: '',
    reported_date: today(), vendor_id: '', priority: 'medium', meter_reading: '', estimated_hours: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!form.ticket_type || !form.title || !form.reported_date) {
      setError('Ticket type, title, and date are required'); return
    }
    setSaving(true); setError('')
    try { await createServiceTicket(form); onSaved() }
    catch (err) { setError(err.response?.data?.error || 'Failed to create ticket') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="font-semibold text-gray-900">New Service Ticket</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={lbl}>Ticket Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {TICKET_TYPES.map(t => (
                <button key={t.value} type="button"
                  onClick={() => setForm(f => ({...f, ticket_type: t.value}))}
                  className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${form.ticket_type === t.value ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-200' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={lbl}>Title / Subject *</label>
            <input className={inp} value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Brief description of the issue" />
          </div>

          <div>
            <label className={lbl}>Description</label>
            <textarea className={inp + ' resize-none'} rows={3} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Detailed description…" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Asset / Machine</label>
              <select className={inp} value={form.machine_id} onChange={e => setForm(f => ({...f, machine_id: e.target.value}))}>
                <option value="">— Select —</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.nickname || m.slno} — {m.eq_type}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Project</label>
              <select className={inp} value={form.project_id} onChange={e => setForm(f => ({...f, project_id: e.target.value}))}>
                <option value="">— None —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Reported Date *</label>
              <input type="date" className={inp} value={form.reported_date} onChange={e => setForm(f => ({...f, reported_date: e.target.value}))} />
            </div>
            <div>
              <label className={lbl}>Priority</label>
              <select className={inp} value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Meter Reading</label>
              <input type="number" className={inp} value={form.meter_reading} onChange={e => setForm(f => ({...f, meter_reading: e.target.value}))} />
            </div>
            <div>
              <label className={lbl}>Est. Hours</label>
              <input type="number" className={inp} value={form.estimated_hours} onChange={e => setForm(f => ({...f, estimated_hours: e.target.value}))} step="0.5" />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-3">
            <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
              {saving ? 'Creating…' : 'Create Ticket'}
            </button>
            <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Ticket Detail ─────────────────────────────────────────────────────────────

function TicketDetail({ ticketId, onBack, onRefreshList }) {
  const [ticket, setTicket]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [statusModal, setStatusModal] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [statusRemark, setStatusRemark] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [editMode, setEditMode]   = useState(false)
  const [editForm, setEditForm]   = useState({})
  const [saving, setSaving]       = useState(false)
  const [partForm, setPartForm]   = useState({ part_name: '', part_code: '', qty_required: '', qty_consumed: '', unit: '', unit_cost: '' })
  const [partSaving, setPartSaving] = useState(false)
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getServiceTicket(ticketId)
      setTicket(r.data.data)
      const t = r.data.data
      setEditForm({
        title: t.title, description: t.description || '', assigned_to: t.assigned_to || '',
        vendor_id: t.vendor_id || '', priority: t.priority, meter_reading: t.meter_reading || '',
        estimated_hours: t.estimated_hours || '', actual_hours: t.actual_hours || '',
        root_cause: t.root_cause || '', resolution: t.resolution || '',
        total_labour_cost: t.total_labour_cost || 0,
      })
    } catch {} finally { setLoading(false) }
  }, [ticketId])

  useEffect(() => { load() }, [load])

  const handleStatusChange = async () => {
    if (!newStatus) return
    setStatusSaving(true)
    try {
      await updateTicketStatus(ticketId, { status: newStatus, remarks: statusRemark })
      setStatusModal(false); setNewStatus(''); setStatusRemark('')
      load(); onRefreshList()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update status')
    } finally { setStatusSaving(false) }
  }

  const saveEdit = async () => {
    setSaving(true); setError('')
    try { await updateServiceTicket(ticketId, editForm); setEditMode(false); load() }
    catch (err) { setError(err.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  const handleAddPart = async () => {
    if (!partForm.part_name) { setError('Part name is required'); return }
    setPartSaving(true); setError('')
    try { await addTicketPart(ticketId, partForm); setPartForm({ part_name: '', part_code: '', qty_required: '', qty_consumed: '', unit: '', unit_cost: '' }); load() }
    catch (err) { setError(err.response?.data?.error || 'Failed to add part') }
    finally { setPartSaving(false) }
  }

  const handleRemovePart = async (partId) => {
    try { await removeTicketPart(ticketId, partId); load() } catch {}
  }

  if (loading || !ticket) return (
    <div className="p-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mb-4"><ChevronLeft size={15} /> Back</button>
      <div className="py-16 text-center text-gray-400"><RefreshCw size={20} className="inline animate-spin mr-2" />Loading…</div>
    </div>
  )

  const nextStatuses = STATUS_NEXT[ticket.status] || []

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600"><ChevronLeft size={15} /> Back</button>
        <div className="flex items-center gap-2 flex-1">
          <span className="font-mono text-sm font-bold text-blue-700">{ticket.ticket_number}</span>
          {typeBadge(ticket.ticket_type)}
          {statusBadge(ticket.status)}
          {priorityBadge(ticket.priority)}
        </div>
        {nextStatuses.length > 0 && (
          <button onClick={() => setStatusModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <ArrowRight size={15} /> Update Status
          </button>
        )}
      </div>

      <h1 className="text-lg font-bold text-gray-900 mb-1">{ticket.title}</h1>
      <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
        {ticket.machine_name && <span>Asset: <strong className="text-gray-700">{ticket.machine_name}</strong></span>}
        {ticket.project_code && <span>Project: <strong className="text-gray-700">{ticket.project_code}</strong></span>}
        <span>Reported: <strong className="text-gray-700">{fmtDate(ticket.reported_date)}</strong></span>
        {ticket.reported_by_name && <span>By: <strong className="text-gray-700">{ticket.reported_by_name}</strong></span>}
        {ticket.assigned_to_name && <span>Assigned to: <strong className="text-gray-700">{ticket.assigned_to_name}</strong></span>}
      </div>

      {/* Detail Tabs */}
      <div className="flex border-b border-gray-200 mb-4 gap-1">
        {DETAIL_TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === i ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>}

      {/* ── Details Tab ── */}
      {activeTab === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex justify-end">
            {!editMode
              ? <button onClick={() => setEditMode(true)} className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Edit</button>
              : (
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={saving} className="px-4 py-1.5 bg-blue-700 text-white rounded-lg text-sm disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => setEditMode(false)} className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                </div>
              )
            }
          </div>

          {!editMode ? (
            <div className="grid grid-cols-3 gap-3">
              {[
                ['Type', TICKET_TYPES.find(x => x.value === ticket.ticket_type)?.label || ticket.ticket_type],
                ['Status', STATUSES.find(x => x.value === ticket.status)?.label || ticket.status],
                ['Priority', PRIORITIES.find(x => x.value === ticket.priority)?.label || ticket.priority],
                ['Asset', ticket.machine_name || '—'],
                ['Project', ticket.project_code || '—'],
                ['Vendor', ticket.vendor_name || '—'],
                ['Reported Date', fmtDate(ticket.reported_date)],
                ['Start Date', fmtDate(ticket.start_date)],
                ['Completed Date', fmtDate(ticket.completed_date)],
                ['Meter Reading', ticket.meter_reading || '—'],
                ['Est. Hours', ticket.estimated_hours || '—'],
                ['Actual Hours', ticket.actual_hours || '—'],
                ['Parts Cost', fmtMoney(ticket.total_parts_cost)],
                ['Labour Cost', fmtMoney(ticket.total_labour_cost)],
                ['Total Cost', fmtMoney(parseFloat(ticket.total_parts_cost || 0) + parseFloat(ticket.total_labour_cost || 0))],
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400">{k}</p>
                  <p className="font-medium text-gray-900 truncate">{v}</p>
                </div>
              ))}
              {ticket.description && (
                <div className="col-span-3 bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
                </div>
              )}
              {ticket.root_cause && (
                <div className="col-span-3 bg-amber-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-500">Root Cause</p>
                  <p className="text-sm text-gray-700">{ticket.root_cause}</p>
                </div>
              )}
              {ticket.resolution && (
                <div className="col-span-3 bg-green-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-green-500">Resolution</p>
                  <p className="text-sm text-gray-700">{ticket.resolution}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={lbl}>Title *</label>
                <input className={inp} value={editForm.title} onChange={e => setEditForm(f => ({...f, title: e.target.value}))} />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Description</label>
                <textarea className={inp + ' resize-none'} rows={3} value={editForm.description} onChange={e => setEditForm(f => ({...f, description: e.target.value}))} />
              </div>
              <div>
                <label className={lbl}>Priority</label>
                <select className={inp} value={editForm.priority} onChange={e => setEditForm(f => ({...f, priority: e.target.value}))}>
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Actual Hours</label>
                <input type="number" className={inp} value={editForm.actual_hours} onChange={e => setEditForm(f => ({...f, actual_hours: e.target.value}))} step="0.5" />
              </div>
              <div>
                <label className={lbl}>Labour Cost (₹)</label>
                <input type="number" className={inp} value={editForm.total_labour_cost} onChange={e => setEditForm(f => ({...f, total_labour_cost: e.target.value}))} />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Root Cause</label>
                <textarea className={inp + ' resize-none'} rows={2} value={editForm.root_cause} onChange={e => setEditForm(f => ({...f, root_cause: e.target.value}))} />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Resolution</label>
                <textarea className={inp + ' resize-none'} rows={2} value={editForm.resolution} onChange={e => setEditForm(f => ({...f, resolution: e.target.value}))} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Parts Tab ── */}
      {activeTab === 1 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Parts Used</p>
              <span className="text-sm text-gray-500">Total: {fmtMoney(ticket.total_parts_cost)}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-600">Part Name</th>
                  <th className="px-3 py-2 text-left text-gray-600 w-20">Code</th>
                  <th className="px-3 py-2 text-right text-gray-600 w-24">Req Qty</th>
                  <th className="px-3 py-2 text-right text-gray-600 w-24">Used Qty</th>
                  <th className="px-3 py-2 text-left text-gray-600 w-16">Unit</th>
                  <th className="px-3 py-2 text-right text-gray-600 w-24">Rate</th>
                  <th className="px-3 py-2 text-right text-gray-600 w-28">Amount</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(!ticket.parts || ticket.parts.length === 0) ? (
                  <tr><td colSpan={8} className="py-8 text-center text-gray-400 text-sm">No parts added yet</td></tr>
                ) : ticket.parts.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{p.part_name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.part_code || '—'}</td>
                    <td className="px-3 py-2 text-right">{p.qty_required}</td>
                    <td className="px-3 py-2 text-right">{p.qty_consumed}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{p.unit || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{p.unit_cost ? fmtMoney(p.unit_cost) : '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{p.amount ? fmtMoney(p.amount) : '—'}</td>
                    <td className="px-3 py-2"><button onClick={() => handleRemovePart(p.id)} className="text-red-400 hover:text-red-600"><X size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Add Part</p>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-2">
                <label className={lbl}>Part Name *</label>
                <input className={inp} value={partForm.part_name} onChange={e => setPartForm(f => ({...f, part_name: e.target.value}))} />
              </div>
              <div>
                <label className={lbl}>Code</label>
                <input className={inp} value={partForm.part_code} onChange={e => setPartForm(f => ({...f, part_code: e.target.value}))} />
              </div>
              <div>
                <label className={lbl}>Req Qty</label>
                <input type="number" className={inp} value={partForm.qty_required} onChange={e => setPartForm(f => ({...f, qty_required: e.target.value}))} min="0" step="0.001" />
              </div>
              <div>
                <label className={lbl}>Used Qty</label>
                <input type="number" className={inp} value={partForm.qty_consumed} onChange={e => setPartForm(f => ({...f, qty_consumed: e.target.value}))} min="0" step="0.001" />
              </div>
              <div>
                <label className={lbl}>Unit</label>
                <input className={inp} value={partForm.unit} onChange={e => setPartForm(f => ({...f, unit: e.target.value}))} />
              </div>
              <div>
                <label className={lbl}>Rate (₹)</label>
                <input type="number" className={inp} value={partForm.unit_cost} onChange={e => setPartForm(f => ({...f, unit_cost: e.target.value}))} min="0" step="0.01" />
              </div>
            </div>
            <button onClick={handleAddPart} disabled={partSaving} className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60">
              <Plus size={15} /> {partSaving ? 'Adding…' : 'Add Part'}
            </button>
          </div>
        </div>
      )}

      {/* ── History Tab ── */}
      {activeTab === 2 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {(!ticket.history || ticket.history.length === 0) ? (
            <div className="py-10 text-center text-gray-400">No history</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {ticket.history.map(h => (
                <div key={h.id} className="px-4 py-3 flex items-start gap-4">
                  <div className="mt-1 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      {h.from_status && <>{statusBadge(h.from_status)} <ArrowRight size={12} className="text-gray-400" /></>}
                      {statusBadge(h.to_status)}
                      <span className="text-xs text-gray-400 ml-auto">{h.changed_by_name} · {new Date(h.changed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {h.remarks && <p className="text-xs text-gray-500 mt-1 italic">"{h.remarks}"</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status Change Modal */}
      {statusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Update Status</h2>
              <button onClick={() => setStatusModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-2">Current: {statusBadge(ticket.status)}</p>
                <p className="text-xs font-semibold text-gray-600 mb-2">Move to:</p>
                <div className="space-y-2">
                  {nextStatuses.map(s => {
                    const st = STATUSES.find(x => x.value === s)
                    return (
                      <button key={s} onClick={() => setNewStatus(s)}
                        className={`w-full px-4 py-2.5 text-left rounded-lg border text-sm font-medium ${newStatus === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'}`}>
                        {st?.label || s}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className={lbl}>Remarks</label>
                <textarea className={inp + ' resize-none'} rows={2} value={statusRemark} onChange={e => setStatusRemark(e.target.value)} placeholder="Optional notes…" />
              </div>
              <div className="flex gap-3">
                <button onClick={handleStatusChange} disabled={!newStatus || statusSaving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                  {statusSaving ? 'Updating…' : 'Update'}
                </button>
                <button onClick={() => setStatusModal(false)} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── List View ─────────────────────────────────────────────────────────────────

export default function Tickets() {
  const [tickets, setTickets]   = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const [machines, setMachines] = useState([])
  const [projects, setProjects] = useState([])
  const [vendors, setVendors]   = useState([])
  const [createModal, setCreateModal] = useState(false)
  const [selectedId, setSelectedId]   = useState(null)
  const [filters, setFilters]   = useState({ ticket_type: '', status: '', machine_id: '', from: '', to: '', search: '' })
  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getServiceTickets({ ...filters, page, limit: LIMIT })
      setTickets(r.data.data); setTotal(r.data.total)
    } catch {} finally { setLoading(false) }
  }, [filters, page])

  useEffect(() => {
    Promise.all([getMachines(), getProjects(), getVendors()]).then(([m, p, v]) => {
      setMachines(m.data.data || m.data || [])
      setProjects(p.data.data || [])
      setVendors(v.data.data || v.data || [])
    })
  }, [])

  useEffect(() => { setPage(1) }, [filters])
  useEffect(() => { load() }, [load])

  const setF = (k, v) => setFilters(f => ({...f, [k]: v}))
  const totalPages = Math.ceil(total / LIMIT)

  if (selectedId) {
    return <TicketDetail ticketId={selectedId} onBack={() => setSelectedId(null)} onRefreshList={load} />
  }

  // Summary counts
  const openCount    = tickets.filter(t => !['closed','cancelled','draft'].includes(t.status)).length
  const criticalCount = tickets.filter(t => t.priority === 'critical' && !['closed','cancelled'].includes(t.status)).length

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><TicketCheck size={20} />Service Tickets</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500">{total} tickets</span>
            {criticalCount > 0 && <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1"><CircleAlert size={11} />{criticalCount} Critical</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
          <button onClick={() => setCreateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={15} /> New Ticket
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 bg-white border border-gray-200 rounded-xl p-3">
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filters.ticket_type} onChange={e => setF('ticket_type', e.target.value)}>
          <option value="">All Types</option>
          {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filters.status} onChange={e => setF('status', e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filters.machine_id} onChange={e => setF('machine_id', e.target.value)}>
          <option value="">All Assets</option>
          {machines.map(m => <option key={m.id} value={m.id}>{m.nickname || m.slno}</option>)}
        </select>
        <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filters.from} onChange={e => setF('from', e.target.value)} />
        <span className="flex items-center text-gray-400 text-sm">to</span>
        <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filters.to} onChange={e => setF('to', e.target.value)} />
        <input type="search" placeholder="Search ticket no, title…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-40" value={filters.search} onChange={e => setF('search', e.target.value)} />
        <button onClick={() => setFilters({ ticket_type: '', status: '', machine_id: '', from: '', to: '', search: '' })} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Clear</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Ticket No.</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Title</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Asset</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Priority</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Cost</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : tickets.length === 0 ? (
              <tr><td colSpan={9} className="py-10 text-center text-gray-400">No tickets found</td></tr>
            ) : tickets.map(t => (
              <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedId(t.id)}>
                <td className="px-4 py-3 font-mono text-xs text-blue-700 font-bold">{t.ticket_number}</td>
                <td className="px-4 py-3">{typeBadge(t.ticket_type)}</td>
                <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{t.title}</td>
                <td className="px-4 py-3">
                  <div className="text-gray-700">{t.machine_name || '—'}</div>
                  {t.project_code && <div className="text-xs text-gray-400">{t.project_code}</div>}
                </td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(t.reported_date)}</td>
                <td className="px-4 py-3 text-center">{priorityBadge(t.priority)}</td>
                <td className="px-4 py-3 text-center">{statusBadge(t.status)}</td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {parseFloat(t.total_parts_cost || 0) + parseFloat(t.total_labour_cost || 0) > 0
                    ? fmtMoney(parseFloat(t.total_parts_cost || 0) + parseFloat(t.total_labour_cost || 0))
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <Eye size={14} className="text-gray-400 hover:text-blue-600" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <span>Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50 disabled:opacity-40">Prev</button>
            <span>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {createModal && (
        <CreateModal
          machines={machines} projects={projects} vendors={vendors}
          onClose={() => setCreateModal(false)}
          onSaved={() => { setCreateModal(false); load() }}
        />
      )}
    </div>
  )
}
