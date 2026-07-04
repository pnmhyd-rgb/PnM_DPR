import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  getHireIndents, getHireIndent, createHireIndent, updateHireIndent, deleteHireIndent,
  submitHireIndent, approveHireIndentL1, approveHireIndentFinal, rejectHireIndent,
  convertIndentToWO, getProjects, getEquipmentTypes,
} from '../../lib/api'
import {
  Plus, Edit2, Trash2, X, Eye, CheckCircle, XCircle, FileText, Download,
  ChevronDown, ChevronRight, AlertCircle, Loader2, RefreshCw, ShieldCheck, ShieldX,
} from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
const fmtDateTime = d => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'

const STATUS_META = {
  draft:       { label: 'Draft',       color: 'bg-gray-100 text-gray-600' },
  submitted:   { label: 'Submitted',   color: 'bg-yellow-100 text-yellow-700' },
  l1_approved: { label: 'L1 Approved', color: 'bg-blue-100 text-blue-700' },
  approved:    { label: 'Approved',    color: 'bg-green-100 text-green-700' },
  rejected:    { label: 'Rejected',    color: 'bg-red-100 text-red-600' },
  converted:   { label: 'WO Created',  color: 'bg-purple-100 text-purple-700' },
}

const PRIORITY_META = {
  normal:   { label: 'Normal',   color: 'bg-gray-100 text-gray-600' },
  urgent:   { label: 'Urgent',   color: 'bg-orange-100 text-orange-700' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700' },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${m.color}`}>{m.label}</span>
}
function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority] || { label: priority, color: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${m.color}`}>{m.label}</span>
}

const inp  = 'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const lbl  = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

// ── TOAST ────────────────────────────────────────────────────────────────────

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium
      ${toast.type === 'success' ? 'bg-green-600 text-white' :
        toast.type === 'warn'    ? 'bg-amber-500 text-white' : 'bg-red-600 text-white'}`}>
      {toast.type === 'success' ? <ShieldCheck size={16}/> : <AlertCircle size={16}/>}
      {toast.message}
    </div>
  )
}
function useToast() {
  const [toast, setToast] = useState(null)
  const show = (message, type = 'success', ms = 3500) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), ms)
  }
  return { toast, show }
}

// ── MODAL WRAPPER ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[94vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

// ── REMARKS MODAL ─────────────────────────────────────────────────────────────

function RemarksModal({ title, onConfirm, onClose, required = false }) {
  const [remarks, setRemarks] = useState('')
  const [error,   setError]   = useState('')
  const submit = () => {
    if (required && !remarks.trim()) { setError('Remarks are required'); return }
    onConfirm(remarks.trim())
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-3">
          <textarea rows={3} className={inp} placeholder={required ? 'Remarks required…' : 'Remarks (optional)…'}
            value={remarks} onChange={e => setRemarks(e.target.value)} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button onClick={submit} className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-medium py-2 rounded-lg text-sm">Confirm</button>
            <button onClick={onClose} className="px-4 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ITEM ROW ──────────────────────────────────────────────────────────────────

function IndentItemRow({ item, equipmentTypes, onChange, onRemove }) {
  const set = k => e => onChange({ ...item, [k]: e.target.value })
  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/50">
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-11">
          <input className={inp} placeholder="Equipment description *" value={item.equipment_desc} onChange={set('equipment_desc')} />
        </div>
        <div className="col-span-1 pt-1 text-right">
          <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 p-1"><X size={15}/></button>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 uppercase">Equipment Type</label>
          <select className={inp} value={item.eq_type} onChange={set('eq_type')}>
            <option value="">— select —</option>
            {equipmentTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div><label className="text-[10px] text-gray-400 uppercase">Qty</label>
          <input type="number" className={inp} value={item.quantity} onChange={set('quantity')} /></div>
        <div><label className="text-[10px] text-gray-400 uppercase">Unit</label>
          <input className={inp} value={item.unit} onChange={set('unit')} /></div>
        <div><label className="text-[10px] text-gray-400 uppercase">Est. Rate</label>
          <input type="number" className={inp} value={item.estimated_rate} onChange={set('estimated_rate')} placeholder="₹" /></div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase">Rate Type</label>
          <select className={inp} value={item.rate_type} onChange={set('rate_type')}>
            <option value="per_month">Per Month</option>
            <option value="per_day">Per Day</option>
            <option value="per_hour">Per Hour</option>
            <option value="lump_sum">Lump Sum</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase">Shift</label>
          <select className={inp} value={item.shift_type} onChange={set('shift_type')}>
            <option value="single">Single Shift</option>
            <option value="double">Double Shift</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-400 uppercase">Purpose / Remarks</label>
        <input className={inp} value={item.purpose} onChange={set('purpose')} placeholder="Specific purpose for this equipment…" />
      </div>
    </div>
  )
}

const blankItem = () => ({
  equipment_desc: '', eq_type: '', quantity: 1, unit: 'No.',
  estimated_rate: '', rate_type: 'per_month', shift_type: 'single', purpose: '',
})

// ── CREATE / EDIT MODAL ───────────────────────────────────────────────────────

function IndentModal({ indent, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    indent_date:        indent?.indent_date?.slice(0,10) || today,
    project_id:         indent?.project_id || '',
    purpose:            indent?.purpose || '',
    required_from:      indent?.required_from?.slice(0,10) || '',
    required_to:        indent?.required_to?.slice(0,10) || '',
    tenure_months:      indent?.tenure_months || '',
    shift_type:         indent?.shift_type || 'single',
    priority:           indent?.priority || 'normal',
    site_address:       indent?.site_address || '',
    site_contact_name:  indent?.site_contact_name || '',
    site_contact_phone: indent?.site_contact_phone || '',
    remarks:            indent?.remarks || '',
  })
  const [items,          setItems]          = useState(indent?.items?.length ? indent.items.map(i => ({...i})) : [blankItem()])
  const [projects,       setProjects]       = useState([])
  const [equipmentTypes, setEquipmentTypes] = useState([])
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  useEffect(() => {
    Promise.all([getProjects(), getEquipmentTypes()]).then(([p, e]) => {
      setProjects(p.data.data)
      setEquipmentTypes(e.data.data)
    })
  }, [])

  useEffect(() => {
    if (form.required_from && form.required_to) {
      const ms = new Date(form.required_to) - new Date(form.required_from)
      const months = (ms / (1000 * 60 * 60 * 24 * 30.44)).toFixed(1)
      if (months > 0) setForm(f => ({ ...f, tenure_months: months }))
    }
  }, [form.required_from, form.required_to])

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const addItem = () => setItems(prev => [...prev, blankItem()])
  const updateItem = (idx, val) => setItems(prev => prev.map((it, i) => i === idx ? val : it))
  const removeItem = idx => setItems(prev => prev.filter((_, i) => i !== idx))

  const save = async () => {
    if (!form.project_id)  { setError('Select a project'); return }
    if (items.every(i => !i.equipment_desc.trim())) { setError('Add at least one equipment item'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, items: items.filter(i => i.equipment_desc.trim()) }
      if (indent?.id) await updateHireIndent(indent.id, payload)
      else            await createHireIndent(payload)
      onSaved()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={indent ? `Edit Indent — ${indent.indent_number}` : 'New Hire Indent'} onClose={onClose} wide>
      <div className="p-5 space-y-6">

        <section>
          <p className={`${lbl} mb-3`}>Indent Details</p>
          <div className="grid grid-cols-3 gap-4">
            {indent && <div><label className={lbl}>Indent No.</label><input readOnly className={`${inp} bg-gray-50`} value={indent.indent_number}/></div>}
            <div><label className={lbl}>Indent Date</label><input type="date" className={inp} value={form.indent_date} onChange={setF('indent_date')}/></div>
            <div>
              <label className={lbl}>Project *</label>
              <select className={inp} value={form.project_id} onChange={setF('project_id')}>
                <option value="">— select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.code}{p.name ? ` — ${p.name}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Priority</label>
              <select className={inp} value={form.priority} onChange={setF('priority')}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Shift Type</label>
              <select className={inp} value={form.shift_type} onChange={setF('shift_type')}>
                <option value="single">Single Shift</option>
                <option value="double">Double Shift</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <p className={`${lbl} mb-3`}>Required Period</p>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={lbl}>Required From</label><input type="date" className={inp} value={form.required_from} onChange={setF('required_from')}/></div>
            <div><label className={lbl}>Required To</label><input type="date" className={inp} value={form.required_to} onChange={setF('required_to')}/></div>
            <div><label className={lbl}>Tenure (Months)</label><input type="number" step="0.5" className={inp} value={form.tenure_months} onChange={setF('tenure_months')} placeholder="Auto-calculated"/></div>
          </div>
        </section>

        <section>
          <p className={`${lbl} mb-3`}>Purpose &amp; Site</p>
          <div className="space-y-3">
            <div><label className={lbl}>Purpose / Scope of Work</label>
              <textarea rows={2} className={inp} value={form.purpose} onChange={setF('purpose')} placeholder="Describe the work for which equipment is required…"/>
            </div>
            <div><label className={lbl}>Site Address</label>
              <textarea rows={2} className={inp} value={form.site_address} onChange={setF('site_address')}/>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={lbl}>Site Contact Person</label><input className={inp} value={form.site_contact_name} onChange={setF('site_contact_name')}/></div>
              <div><label className={lbl}>Site Contact Phone</label><input className={inp} value={form.site_contact_phone} onChange={setF('site_contact_phone')}/></div>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <p className={lbl}>Equipment Required</p>
            <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-sm text-blue-700 font-medium hover:text-blue-900">
              <Plus size={14}/> Add Row
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <IndentItemRow key={idx} item={item} equipmentTypes={equipmentTypes}
                onChange={val => updateItem(idx, val)} onRemove={() => removeItem(idx)}/>
            ))}
          </div>
        </section>

        <section>
          <label className={lbl}>Additional Remarks</label>
          <textarea rows={2} className={inp} value={form.remarks} onChange={setF('remarks')} placeholder="Any other information…"/>
        </section>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2"><AlertCircle size={14}/>{error}</p>}

        <div className="flex gap-3 pb-2">
          <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
            {saving ? 'Saving…' : indent ? 'Update Indent' : 'Create Indent'}
          </button>
          <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}

// ── DOCUMENT HELPERS ─────────────────────────────────────────────────────────

async function fetchLogoBase64() {
  try {
    const res  = await fetch('/rvr-logo.png')
    const blob = await res.blob()
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

const RATE_LBL = { per_month:'Per Month', per_day:'Per Day', per_hour:'Per Hour', lump_sum:'Lump Sum' }
const STATUS_LBL = { draft:'Draft', submitted:'Submitted', l1_approved:'L1 Approved', approved:'Approved', rejected:'Rejected', converted:'WO Created' }
const PRIORITY_LBL = { normal:'Normal', urgent:'Urgent', critical:'Critical' }

async function downloadIndentPDF(indent) {
  const { jsPDF }              = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw     = doc.internal.pageSize.getWidth()
  const ph     = doc.internal.pageSize.getHeight()
  const MARGIN = 12
  const LOGO_W = 35, LOGO_H = 50

  const logoData = await fetchLogoBase64()

  const ensureSpace = (yPos, needed) => {
    if (yPos + needed > ph - 18) { doc.addPage(); return logoData ? LOGO_H + 4 : 12 }
    return yPos
  }

  const fD  = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
  const fDT = d => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'

  // ── First-page header ──────────────────────────────────────────────────────
  let y = 0
  if (logoData) { try { doc.addImage(logoData, 'PNG', MARGIN, y, LOGO_W, LOGO_H) } catch {} }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(0)
  doc.text('HIRE INDENT', pw / 2, LOGO_H / 2 - 1, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(80)
  doc.text('RVR PROJECTS PVT LTD  |  #9-16-29, C.B.M Compound, Visakhapatnam, AP - 530003', pw / 2, LOGO_H / 2 + 5, { align: 'center' })
  y = LOGO_H + 4

  // ── Info grid ──────────────────────────────────────────────────────────────
  const half = (pw - MARGIN * 2) / 2
  autoTable(doc, {
    startY: y,
    body: [
      ['Indent No.',  indent.indent_number,  'Date',      fD(indent.indent_date)],
      ['Project',     `${indent.project_code || ''}${indent.project_name ? ' — ' + indent.project_name : ''}`, 'Status', STATUS_LBL[indent.status] || indent.status],
      ['Shift Type',  (indent.shift_type || '').replace('_', ' '), 'Priority', PRIORITY_LBL[indent.priority] || indent.priority],
      ['Req. From',   fD(indent.required_from), 'Req. To', fD(indent.required_to)],
      ['Tenure',      indent.tenure_months ? `${indent.tenure_months} months` : '—', 'Raised By', indent.created_by_name || '—'],
      ...(indent.site_address       ? [['Site Address',  indent.site_address,       '',       '']] : []),
      ...(indent.site_contact_name  ? [['Site Contact',  indent.site_contact_name,  'Phone',  indent.site_contact_phone || '—']] : []),
    ],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.8, lineColor: [200, 200, 200], lineWidth: 0.25 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 28 },
      1: { cellWidth: half - 28 },
      2: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 28 },
      3: { cellWidth: half - 28 },
    },
    margin: { left: MARGIN, right: MARGIN },
  })
  y = doc.lastAutoTable.finalY + 5

  // ── Purpose ────────────────────────────────────────────────────────────────
  if (indent.purpose) {
    y = ensureSpace(y, 14)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(0)
    doc.text('Purpose / Scope of Work', MARGIN, y); y += 4
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(50)
    const lines = doc.splitTextToSize(indent.purpose, pw - MARGIN * 2)
    doc.text(lines, MARGIN, y); y += lines.length * 3.8 + 4
  }

  // ── Equipment table ────────────────────────────────────────────────────────
  y = ensureSpace(y, 22)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(0)
  doc.text('Equipment Required', MARGIN, y); y += 5

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['#', 'Equipment', 'Type', 'Qty', 'Shift', 'Est. Rate', 'Rate Type', 'Purpose']],
    body: (indent.items || []).map((it, i) => [
      i + 1,
      it.equipment_desc,
      it.eq_type || '—',
      `${it.quantity} ${it.unit}`,
      it.shift_type === 'double' ? 'Double Shift' : 'Single Shift',
      it.estimated_rate ? `Rs. ${Number(it.estimated_rate).toLocaleString('en-IN')}` : '—',
      RATE_LBL[it.rate_type] || it.rate_type || '—',
      it.purpose || '',
    ]),
    styles: { fontSize: 7, cellPadding: 1.8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      2: { cellWidth: 22 },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 20, halign: 'center' },
    },
    margin: { left: MARGIN, right: MARGIN },
  })
  y = doc.lastAutoTable.finalY + 8

  // ── Approval trail ─────────────────────────────────────────────────────────
  const trailLines = [
    indent.submitted_by_name    && `Submitted by: ${indent.submitted_by_name}  (${fDT(indent.submitted_at)})`,
    indent.l1_approved_by_name  && `L1 Approved by: ${indent.l1_approved_by_name}  (${fDT(indent.l1_approved_at)})${indent.l1_remarks ? '  — ' + indent.l1_remarks : ''}`,
    indent.approved_by_name     && `Approved by: ${indent.approved_by_name}  (${fDT(indent.approved_at)})`,
    indent.rejected_by_name     && `Rejected by: ${indent.rejected_by_name}  (${fDT(indent.rejected_at)})${indent.rejected_remarks ? '  — ' + indent.rejected_remarks : ''}`,
  ].filter(Boolean)
  if (trailLines.length) {
    y = ensureSpace(y, trailLines.length * 4 + 10)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(0)
    doc.text('Approval Trail', MARGIN, y); y += 4
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(70)
    trailLines.forEach(l => { doc.text(l, MARGIN, y); y += 4 })
    y += 2
  }

  // ── Signature block ────────────────────────────────────────────────────────
  y = ensureSpace(y, 30); y += 10
  const sigW = (pw - MARGIN * 2) / 2 - 4
  const sigX = [MARGIN, MARGIN + sigW + 8]
  doc.setDrawColor(150); doc.setLineWidth(0.3)
  sigX.forEach(x => doc.line(x, y, x + sigW, y))
  y += 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0)
  doc.text('Requested By', sigX[0], y)
  doc.text('Authorised By', sigX[1], y)
  y += 3.5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(60)
  doc.text(indent.created_by_name || '(Site Team)', sigX[0], y)
  doc.text('R SATYANARAYANA / DIRECTOR', sigX[1], y)

  // ── Per-page: continuation logo + page number + draft watermark ────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    if (i > 1 && logoData) { try { doc.addImage(logoData, 'PNG', MARGIN, 0, LOGO_W, LOGO_H) } catch {} }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120)
    doc.text(`Page ${i} of ${totalPages}`, pw / 2, ph - 8, { align: 'center' })
    if (indent.status === 'draft') {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(58); doc.setTextColor(210, 210, 210)
      doc.text('DRAFT COPY', pw / 2, ph / 2, { align: 'center', angle: 45 })
    }
  }

  doc.save(`Indent_${indent.indent_number.replace(/\//g, '-')}.pdf`)
}

async function downloadIndentWord(indent) {
  const logoData = await fetchLogoBase64()
  const fD  = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
  const fDT = d => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'

  const itemsHtml = (indent.items || []).map((it, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${it.equipment_desc || ''}</td>
      <td>${it.eq_type || '—'}</td>
      <td style="text-align:center">${it.quantity} ${it.unit}</td>
      <td style="text-align:center">${it.shift_type === 'double' ? 'Double Shift' : 'Single Shift'}</td>
      <td style="text-align:right">${it.estimated_rate ? '&#8377; ' + Number(it.estimated_rate).toLocaleString('en-IN') : '—'}</td>
      <td style="text-align:center">${RATE_LBL[it.rate_type] || it.rate_type || '—'}</td>
      <td>${it.purpose || ''}</td>
    </tr>`).join('')

  const trailHtml = [
    indent.submitted_by_name   ? `<p>Submitted by <strong>${indent.submitted_by_name}</strong> on ${fDT(indent.submitted_at)}</p>` : '',
    indent.l1_approved_by_name ? `<p>L1 Approved by <strong>${indent.l1_approved_by_name}</strong> on ${fDT(indent.l1_approved_at)}${indent.l1_remarks ? ` — "${indent.l1_remarks}"` : ''}</p>` : '',
    indent.approved_by_name    ? `<p>Approved by <strong>${indent.approved_by_name}</strong> on ${fDT(indent.approved_at)}</p>` : '',
    indent.rejected_by_name    ? `<p style="color:#b00">Rejected by <strong>${indent.rejected_by_name}</strong> on ${fDT(indent.rejected_at)}${indent.rejected_remarks ? ` — "${indent.rejected_remarks}"` : ''}</p>` : '',
  ].filter(Boolean).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:30px}
  .header{display:flex;align-items:center;gap:16px;margin:-30px -30px 14px;padding:8px 30px;border-bottom:2px solid #333}
  .header-logo{height:65px;width:auto;flex-shrink:0}
  h1{font-size:18px;margin:0 0 2px}
  .sub{font-size:10px;color:#555;margin:0}
  .info{width:100%;border-collapse:collapse;margin-bottom:12px}
  .info td{border:1px solid #ccc;padding:4px 8px;font-size:10.5px}
  .info td.lbl{font-weight:bold;background:#f5f5f5;width:90px}
  .section{font-weight:bold;font-size:12px;margin:14px 0 5px}
  table.eq{width:100%;border-collapse:collapse;margin-bottom:12px}
  table.eq th{background:#f2f2f2;font-weight:bold;border:1px solid #ccc;padding:5px 7px;font-size:10px}
  table.eq td{border:1px solid #ccc;padding:4px 7px;font-size:10px}
  .sig{width:100%;border-collapse:collapse;margin-top:28px}
  .sig td{width:50%;padding:8px 8px 0;border-top:1px solid #888;font-size:10px;vertical-align:top}
  .trail{font-size:10px;color:#444}
  .trail p{margin:2px 0}
</style>
</head><body>
<div class="header">
  ${logoData ? `<img src="${logoData}" class="header-logo" alt="RVR"/>` : ''}
  <div>
    <h1>HIRE INDENT</h1>
    <p class="sub">RVR PROJECTS PVT LTD &nbsp;|&nbsp; #9-16-29, C.B.M Compound, Visakhapatnam, AP &minus; 530003</p>
  </div>
</div>

<table class="info">
  <tr><td class="lbl">Indent No.</td><td>${indent.indent_number}</td><td class="lbl">Date</td><td>${fD(indent.indent_date)}</td></tr>
  <tr><td class="lbl">Project</td><td>${indent.project_code || ''}${indent.project_name ? ' &mdash; ' + indent.project_name : ''}</td><td class="lbl">Status</td><td>${STATUS_LBL[indent.status] || indent.status}</td></tr>
  <tr><td class="lbl">Shift Type</td><td style="text-transform:capitalize">${indent.shift_type || '—'}</td><td class="lbl">Priority</td><td style="text-transform:capitalize">${indent.priority || '—'}</td></tr>
  <tr><td class="lbl">Req. From</td><td>${fD(indent.required_from)}</td><td class="lbl">Req. To</td><td>${fD(indent.required_to)}</td></tr>
  <tr><td class="lbl">Tenure</td><td>${indent.tenure_months ? indent.tenure_months + ' months' : '—'}</td><td class="lbl">Raised By</td><td>${indent.created_by_name || '—'}</td></tr>
  ${indent.site_address ? `<tr><td class="lbl">Site Address</td><td colspan="3">${indent.site_address}</td></tr>` : ''}
  ${indent.site_contact_name ? `<tr><td class="lbl">Site Contact</td><td>${indent.site_contact_name}</td><td class="lbl">Phone</td><td>${indent.site_contact_phone || '—'}</td></tr>` : ''}
</table>

${indent.purpose ? `<p class="section">Purpose / Scope of Work</p><p style="font-size:10.5px;margin:0 0 12px;white-space:pre-wrap">${indent.purpose}</p>` : ''}

<p class="section">Equipment Required</p>
<table class="eq">
  <thead><tr><th>#</th><th>Equipment</th><th>Type</th><th>Qty</th><th>Shift</th><th>Est. Rate</th><th>Rate Type</th><th>Purpose</th></tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>

${trailHtml ? `<p class="section">Approval Trail</p><div class="trail">${trailHtml}</div>` : ''}

<table class="sig">
  <tr>
    <td>Requested By<br><br><strong>${indent.created_by_name || '(Site Team)'}</strong></td>
    <td>Authorised By<br><br><strong>R SATYANARAYANA / DIRECTOR</strong></td>
  </tr>
</table>
</body></html>`

  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `Indent_${indent.indent_number.replace(/\//g, '-')}.doc`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ── VIEW MODAL ────────────────────────────────────────────────────────────────

function IndentViewModal({ indentId, onClose, onRefresh }) {
  const { isAdmin } = useAuth()
  const navigate    = useNavigate()
  const [indent,    setIndent]  = useState(null)
  const [loading,   setLoading] = useState(true)
  const [acting,      setActing]      = useState('')
  const [remarksFor,  setRemarksFor]  = useState(null)
  const [converting,  setConverting]  = useState(false)
  const [downloading, setDownloading] = useState('')
  const { toast, show: showToast } = useToast()

  const load = () => {
    setLoading(true)
    getHireIndent(indentId).then(r => { setIndent(r.data.data); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(load, [indentId])

  const act = async (action, payload = {}) => {
    setActing(action)
    try {
      const map = {
        submit:    () => submitHireIndent(indentId),
        approve_l1:() => approveHireIndentL1(indentId, payload),
        approve:   () => approveHireIndentFinal(indentId, payload),
        reject:    () => rejectHireIndent(indentId, payload),
      }
      await map[action]()
      showToast('Done', 'success')
      load(); onRefresh()
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed', 'error')
    } finally { setActing('') }
  }

  const handleConvert = async () => {
    if (!confirm('Create a draft Work Order from this indent?')) return
    setConverting(true)
    try {
      const res = await convertIndentToWO(indentId)
      showToast(`WO ${res.data.data.wo_number} created`, 'success')
      load(); onRefresh()
      setTimeout(() => navigate('/hire/work-orders'), 1500)
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed', 'error')
    } finally { setConverting(false) }
  }

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl p-10"><Loader2 size={24} className="animate-spin text-blue-600"/></div>
    </div>
  )
  if (!indent) return null

  const { status } = indent
  const canSubmit   = ['draft','rejected'].includes(status)
  const canL1       = isAdmin && status === 'submitted'
  const canApprove  = isAdmin && status === 'l1_approved'
  const canReject   = isAdmin && ['submitted','l1_approved'].includes(status)
  const canConvert  = status === 'approved'

  const handleDownload = async fmt => {
    setDownloading(fmt)
    try {
      if (fmt === 'pdf')  await downloadIndentPDF(indent)
      else                await downloadIndentWord(indent)
    } catch { showToast('Download failed', 'error') }
    finally { setDownloading('') }
  }

  return (
    <>
      <Modal title={`Indent — ${indent.indent_number}`} onClose={onClose} wide>
        <div className="p-5 space-y-5">

          {/* Status row */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={status}/>
            <PriorityBadge priority={indent.priority}/>
            <span className="text-sm text-gray-500">{indent.project_code} {indent.project_name ? `— ${indent.project_name}` : ''}</span>
            <span className="text-xs text-gray-400 ml-auto">Date: {fmtDate(indent.indent_date)}</span>
          </div>

          {/* Key details */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div><span className="text-gray-500">Required Period:</span> <span className="font-medium">{fmtDate(indent.required_from)} — {fmtDate(indent.required_to)}</span></div>
            <div><span className="text-gray-500">Tenure:</span> <span className="font-medium">{indent.tenure_months ? `${indent.tenure_months} months` : '—'}</span></div>
            <div><span className="text-gray-500">Shift Type:</span> <span className="font-medium capitalize">{indent.shift_type || '—'}</span></div>
            <div><span className="text-gray-500">Raised by:</span> <span className="font-medium">{indent.created_by_name || '—'}</span></div>
            {indent.site_contact_name && <div><span className="text-gray-500">Site Contact:</span> <span className="font-medium">{indent.site_contact_name} {indent.site_contact_phone}</span></div>}
            {indent.wo_number && <div><span className="text-gray-500">Work Order:</span> <span className="font-medium text-purple-700">{indent.wo_number}</span></div>}
          </div>

          {indent.purpose && (
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <p className="font-semibold text-gray-700 mb-1">Purpose / Scope</p>
              <p className="text-gray-600 whitespace-pre-line">{indent.purpose}</p>
            </div>
          )}

          {/* Equipment items */}
          <div>
            <p className="font-semibold text-gray-800 mb-2 text-sm">Equipment Required</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="border border-gray-200 px-3 py-2 text-left">#</th>
                  <th className="border border-gray-200 px-3 py-2 text-left">Equipment</th>
                  <th className="border border-gray-200 px-3 py-2 text-left">Type</th>
                  <th className="border border-gray-200 px-3 py-2 text-center">Qty</th>
                  <th className="border border-gray-200 px-3 py-2 text-center">Shift</th>
                  <th className="border border-gray-200 px-3 py-2 text-right">Est. Rate</th>
                  <th className="border border-gray-200 px-3 py-2 text-center">Rate Type</th>
                </tr>
              </thead>
              <tbody>
                {(indent.items || []).map((it, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="border border-gray-200 px-3 py-2">{i+1}</td>
                    <td className="border border-gray-200 px-3 py-2">{it.equipment_desc}</td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-500">{it.eq_type || '—'}</td>
                    <td className="border border-gray-200 px-3 py-2 text-center">{it.quantity} {it.unit}</td>
                    <td className="border border-gray-200 px-3 py-2 text-center capitalize">{it.shift_type}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{it.estimated_rate ? `₹ ${Number(it.estimated_rate).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="border border-gray-200 px-3 py-2 text-center capitalize">{it.rate_type?.replace('_',' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Approval trail */}
          <div className="space-y-2 text-xs text-gray-500">
            {indent.submitted_by_name && <p>Submitted by <strong>{indent.submitted_by_name}</strong> on {fmtDateTime(indent.submitted_at)}</p>}
            {indent.l1_approved_by_name && <p>L1 Approved by <strong>{indent.l1_approved_by_name}</strong> on {fmtDateTime(indent.l1_approved_at)}{indent.l1_remarks ? ` — "${indent.l1_remarks}"` : ''}</p>}
            {indent.approved_by_name && <p>Approved by <strong>{indent.approved_by_name}</strong> on {fmtDateTime(indent.approved_at)}{indent.approved_remarks ? ` — "${indent.approved_remarks}"` : ''}</p>}
            {indent.rejected_by_name && <p className="text-red-600">Rejected by <strong>{indent.rejected_by_name}</strong> on {fmtDateTime(indent.rejected_at)}{indent.rejected_remarks ? ` — "${indent.rejected_remarks}"` : ''}</p>}
            {indent.converted_by_name && <p className="text-purple-600">Converted to WO by <strong>{indent.converted_by_name}</strong> on {fmtDateTime(indent.converted_at)}</p>}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {/* Download buttons — always available */}
            <button onClick={() => handleDownload('pdf')} disabled={!!downloading}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50">
              {downloading === 'pdf' ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>} PDF
            </button>
            <button onClick={() => handleDownload('word')} disabled={!!downloading}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50">
              {downloading === 'word' ? <Loader2 size={14} className="animate-spin"/> : <FileText size={14}/>} Word
            </button>
            <div className="flex-1"/>
            {canSubmit && (
              <button onClick={() => act('submit')} disabled={!!acting}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                {acting === 'submit' ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>} Submit
              </button>
            )}
            {canL1 && (
              <button onClick={() => setRemarksFor('approve_l1')} disabled={!!acting}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                <CheckCircle size={14}/> L1 Approve
              </button>
            )}
            {canApprove && (
              <button onClick={() => setRemarksFor('approve')} disabled={!!acting}
                className="flex items-center gap-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                <ShieldCheck size={14}/> Final Approve
              </button>
            )}
            {canReject && (
              <button onClick={() => setRemarksFor('reject')} disabled={!!acting}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                <XCircle size={14}/> Reject
              </button>
            )}
            {canConvert && (
              <button onClick={handleConvert} disabled={converting}
                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                {converting ? <Loader2 size={14} className="animate-spin"/> : <FileText size={14}/>} Create Work Order
              </button>
            )}
          </div>
        </div>
      </Modal>

      {remarksFor && (
        <RemarksModal
          title={remarksFor === 'reject' ? 'Reject Indent' : remarksFor === 'approve_l1' ? 'L1 Approve Indent' : 'Final Approve Indent'}
          required={remarksFor === 'reject'}
          onConfirm={r => { setRemarksFor(null); act(remarksFor, { remarks: r }) }}
          onClose={() => setRemarksFor(null)}
        />
      )}
      <Toast toast={toast}/>
    </>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function HireIndents() {
  const { isAdmin } = useAuth()
  const [indents,      setIndents]      = useState([])
  const [projects,     setProjects]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterProj,   setFilterProj]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showCreate,   setShowCreate]   = useState(false)
  const [editIndent,   setEditIndent]   = useState(null)
  const [viewId,       setViewId]       = useState(null)
  const { toast, show: showToast } = useToast()

  const load = () => {
    setLoading(true)
    const params = {}
    if (filterProj)   params.project_id = filterProj
    if (filterStatus) params.status     = filterStatus
    getHireIndents(params)
      .then(r => { setIndents(r.data.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { getProjects().then(r => setProjects(r.data.data)) }, [])
  useEffect(load, [filterProj, filterStatus])

  const filtered = indents.filter(ind =>
    !search ||
    ind.indent_number?.toLowerCase().includes(search.toLowerCase()) ||
    (ind.project_code||'').toLowerCase().includes(search.toLowerCase()) ||
    (ind.project_name||'').toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async ind => {
    if (!confirm(`Delete indent ${ind.indent_number}?`)) return
    try {
      await deleteHireIndent(ind.id)
      showToast('Deleted', 'success')
      load()
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed to delete', 'error')
    }
  }

  const openEdit = async ind => {
    const r = await getHireIndent(ind.id)
    setEditIndent(r.data.data)
    setShowCreate(true)
  }

  const [dlRow, setDlRow] = useState(null)
  const handleRowDownload = async (ind, fmt) => {
    setDlRow(ind.id + fmt)
    try {
      const r    = await getHireIndent(ind.id)
      const full = r.data.data
      if (fmt === 'pdf') await downloadIndentPDF(full)
      else               await downloadIndentWord(full)
    } catch { showToast('Download failed', 'error') }
    finally { setDlRow(null) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">Hire Indents</h1>
        <button onClick={() => { setEditIndent(null); setShowCreate(true) }}
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={15}/> New Indent
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <input
            className="border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search indent no, project…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <span className="absolute left-2.5 top-2.5 text-gray-400"><RefreshCw size={14}/></span>
        </div>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          value={filterProj} onChange={e => setFilterProj(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code}{p.name ? ` — ${p.name}` : ''}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-blue-600"/></div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-gray-400">No indents found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left">Indent No.</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Project</th>
                <th className="px-4 py-3 text-left">Shift</th>
                <th className="px-4 py-3 text-left">Period</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Items</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(ind => (
                <tr key={ind.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-blue-700 whitespace-nowrap">{ind.indent_number}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(ind.indent_date)}</td>
                  <td className="px-4 py-3 text-gray-800">{ind.project_code}{ind.project_name ? ` — ${ind.project_name}` : ''}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{ind.shift_type}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {ind.required_from ? `${fmtDate(ind.required_from)} → ${fmtDate(ind.required_to)}` : '—'}
                  </td>
                  <td className="px-4 py-3"><PriorityBadge priority={ind.priority}/></td>
                  <td className="px-4 py-3"><StatusBadge status={ind.status}/></td>
                  <td className="px-4 py-3 text-gray-500">{ind.item_count ?? '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setViewId(ind.id)} title="View" className="p-1.5 text-gray-500 hover:text-blue-600"><Eye size={15}/></button>
                    <button onClick={() => handleRowDownload(ind, 'pdf')} disabled={dlRow === ind.id + 'pdf'} title="Download PDF" className="p-1.5 text-gray-500 hover:text-red-600 disabled:opacity-40">
                      {dlRow === ind.id + 'pdf' ? <Loader2 size={15} className="animate-spin"/> : <Download size={15}/>}
                    </button>
                    <button onClick={() => handleRowDownload(ind, 'word')} disabled={dlRow === ind.id + 'word'} title="Download Word" className="p-1.5 text-gray-500 hover:text-blue-600 disabled:opacity-40">
                      {dlRow === ind.id + 'word' ? <Loader2 size={15} className="animate-spin"/> : <FileText size={15}/>}
                    </button>
                    {ind.status === 'draft' && (
                      <>
                        <button onClick={() => openEdit(ind)} title="Edit" className="p-1.5 text-gray-500 hover:text-blue-600"><Edit2 size={15}/></button>
                        <button onClick={() => handleDelete(ind)} title="Delete" className="p-1.5 text-gray-500 hover:text-red-600"><Trash2 size={15}/></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <IndentModal
          indent={editIndent}
          onClose={() => { setShowCreate(false); setEditIndent(null) }}
          onSaved={() => { setShowCreate(false); setEditIndent(null); load() }}
        />
      )}
      {viewId && (
        <IndentViewModal
          indentId={viewId}
          onClose={() => setViewId(null)}
          onRefresh={load}
        />
      )}
      <Toast toast={toast}/>
    </div>
  )
}
