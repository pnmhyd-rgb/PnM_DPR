import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Edit2, X, Plus, Upload, Download, Eye, Trash2, RotateCcw,
  MoreVertical, Tag, Wrench, Calendar, IndianRupee, Clock, Info, MapPin,
  ClipboardList, ExternalLink, CheckCircle, XCircle, Loader2,
} from 'lucide-react'
import {
  getMachineCompliance, batchUpsertCompliance, deleteCompliance,
  getMachineDocuments, createMachineDocument, deleteMachineDocument, getMachineDocumentUrl,
  getMeterResetRequests, reviewMeterResetRequest,
} from '../lib/api'

export function fmt(val) { return val ?? '—' }
export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
export function fmtMoney(v) {
  if (!v) return '—'
  return '₹ ' + Number(v).toLocaleString('en-IN')
}

export function DetailRow({ label, value, mono }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="w-44 flex-shrink-0 text-xs text-gray-400 font-medium pt-0.5">{label}</span>
      <span className={`text-xs text-gray-800 font-medium flex-1 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  )
}

export function DetailSection({ icon: Icon, title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        {Icon && <Icon size={13} className="text-gray-400" />}
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
      </div>
      <div className="px-4 divide-y divide-gray-50">{children}</div>
    </div>
  )
}

export const COMP_TYPES = [
  { key: 'insurance',       label: 'Insurance Renewal' },
  { key: 'road_tax',        label: 'Road Tax Renewal' },
  { key: 'fitness',         label: 'Fitness Renewal' },
  { key: 'green_tax',       label: 'Green Tax' },
  { key: 'puc',             label: 'Pollution (PUC)' },
  { key: 'national_permit', label: 'National Permit' },
  { key: 'state_permit',    label: 'State Permit' },
  { key: 'load_test',       label: 'Load Test Cert.' },
]

export function calcCompStatus(expiryDate) {
  if (!expiryDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(expiryDate)
  const days = Math.ceil((exp - today) / 86400000)
  if (days < 0)   return 'expired'
  if (days <= 7)  return 'critical'
  if (days <= 30) return 'warning'
  return 'valid'
}

export const STATUS_DOT = {
  valid:    'bg-green-500',
  warning:  'bg-yellow-400',
  critical: 'bg-orange-500',
  expired:  'bg-red-500',
}

export function fmtCompDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function MachineDetailPanel({ machine: m, onClose, onEdit, initialRightTab }) {
  const [compDocs,     setCompDocs]     = useState([])
  const [compLoading,  setCompLoading]  = useState(true)
  const [editingKey,   setEditingKey]   = useState(null)
  const [editForm,     setEditForm]     = useState({})
  const [compSaving,   setCompSaving]   = useState(false)
  const [addingNew,    setAddingNew]    = useState(false)
  const [newLabel,     setNewLabel]     = useState('')
  const [menuOpen,     setMenuOpen]     = useState(null)
  const [deleting,     setDeleting]     = useState(null)

  const [rightTab,     setRightTab]     = useState(initialRightTab || 'compliance')

  const [resetReqs,       setResetReqs]       = useState([])
  const [resetReqsLoading, setResetReqsLoading] = useState(false)
  const [reviewingId,     setReviewingId]     = useState(null)
  const [reviewNote,      setReviewNote]      = useState('')
  const [reviewNoteOpen,  setReviewNoteOpen]  = useState(null) // { id, action }
  const [reviewErr,       setReviewErr]       = useState(null) // { id, msg }
  const [reviewSuccess,   setReviewSuccess]   = useState(null) // { id, action }

  const [docs,         setDocs]         = useState([])
  const [docsLoading,  setDocsLoading]  = useState(true)
  const [addingDoc,    setAddingDoc]    = useState(false)
  const [docForm,      setDocForm]      = useState({ doc_name: '', doc_number: '' })
  const [docFile,      setDocFile]      = useState(null)
  const [docSaving,    setDocSaving]    = useState(false)
  const [docMenuOpen,  setDocMenuOpen]  = useState(null)
  const [docDeleting,  setDocDeleting]  = useState(null)
  const docFileRef = useRef()

  useEffect(() => {
    setCompLoading(true)
    getMachineCompliance(m.id)
      .then(r => setCompDocs(r.data.data))
      .catch(() => {})
      .finally(() => setCompLoading(false))
    setDocsLoading(true)
    getMachineDocuments(m.id)
      .then(r => setDocs(r.data.data))
      .catch(() => {})
      .finally(() => setDocsLoading(false))
  }, [m.id])

  const loadResetReqs = () => {
    setResetReqsLoading(true)
    getMeterResetRequests({ machine_id: m.id })
      .then(r => setResetReqs(r.data.data || []))
      .catch(() => setResetReqs([]))
      .finally(() => setResetReqsLoading(false))
  }
  useEffect(() => { if (rightTab === 'counter-reset') loadResetReqs() }, [rightTab, m.id])

  const handleReview = async (id, action) => {
    setReviewingId(id)
    setReviewErr(null)
    setReviewSuccess(null)
    try {
      await reviewMeterResetRequest(id, { action, review_note: reviewNote || undefined })
      setReviewNoteOpen(null); setReviewNote('')
      setReviewSuccess({ id, action })
      loadResetReqs()
      window.dispatchEvent(new CustomEvent('resetRequestReviewed'))
      setTimeout(() => setReviewSuccess(null), 4000)
    } catch (e) {
      setReviewErr({ id, msg: e.response?.data?.error || 'Failed to process request' })
    } finally { setReviewingId(null) }
  }

  const handleDocFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setDocFile({ file, name: file.name, mime: file.type, dataUrl: ev.target.result })
    reader.readAsDataURL(file)
  }

  const saveDoc = async () => {
    if (!docForm.doc_name.trim()) return
    setDocSaving(true)
    try {
      await createMachineDocument({
        machine_id: m.id,
        doc_name:   docForm.doc_name.trim(),
        doc_number: docForm.doc_number.trim() || null,
        file_data:  docFile?.dataUrl || null,
        file_name:  docFile?.name    || null,
        file_mime:  docFile?.mime    || null,
      })
      const r = await getMachineDocuments(m.id)
      setDocs(r.data.data)
      setAddingDoc(false)
      setDocForm({ doc_name: '', doc_number: '' })
      setDocFile(null)
      if (docFileRef.current) docFileRef.current.value = ''
    } catch (_) {}
    setDocSaving(false)
  }

  const openDocUrl = async (doc, forceDownload = false) => {
    try {
      const res = await getMachineDocumentUrl(doc.id)
      const { url, file_name } = res.data
      if (forceDownload) {
        const a = document.createElement('a')
        a.href = url; a.download = file_name || doc.doc_name
        a.target = '_blank'; a.rel = 'noopener noreferrer'
        a.click()
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (_) {}
  }

  const handleDocDelete = async (id) => {
    setDocDeleting(id); setDocMenuOpen(null)
    try {
      await deleteMachineDocument(id)
      setDocs(prev => prev.filter(d => d.id !== id))
    } catch (_) {}
    setDocDeleting(null)
  }

  const docMap = useMemo(() => {
    const map = {}
    for (const d of compDocs) {
      const key = d.doc_type === 'custom' ? `custom__${d.doc_label}` : d.doc_type
      map[key] = d
    }
    return map
  }, [compDocs])

  const compRows = useMemo(() => {
    const standard = COMP_TYPES
      .filter(t => !docMap[t.key]?.hidden)
      .map(t => ({ key: t.key, label: t.label, doc: docMap[t.key] || null, isCustom: false }))
    const custom = compDocs
      .filter(d => d.doc_type === 'custom' && !d.hidden)
      .map(d => ({ key: `custom__${d.doc_label}`, label: d.doc_label, doc: d, isCustom: true }))
    return [...standard, ...custom]
  }, [docMap, compDocs])

  const startEdit = (key, doc) => {
    setEditingKey(key)
    setEditForm({
      expiry_date:  doc?.expiry_date  ? doc.expiry_date.slice(0, 10)  : '',
      issued_date:  doc?.issued_date  ? doc.issued_date.slice(0, 10)  : '',
      doc_no:       doc?.doc_no       || '',
      notes:        doc?.notes        || '',
    })
    setMenuOpen(null)
  }

  const saveCompDoc = async (key, label) => {
    setCompSaving(true)
    const isCustom = key.startsWith('custom__')
    try {
      await batchUpsertCompliance({
        machine_id: m.id,
        docs: [{
          doc_type:    isCustom ? 'custom' : key,
          doc_label:   isCustom ? label : '',
          expiry_date: editForm.expiry_date || null,
          issued_date: editForm.issued_date || null,
          doc_no:      editForm.doc_no      || null,
          notes:       editForm.notes       || null,
        }]
      })
      const r = await getMachineCompliance(m.id)
      setCompDocs(r.data.data)
      setEditingKey(null)
    } catch (_) {}
    setCompSaving(false)
  }

  const deleteDoc = async (id) => {
    setDeleting(id)
    try {
      await deleteCompliance(id)
      setCompDocs(prev => prev.filter(d => d.id !== id))
    } catch (_) {}
    setDeleting(null)
    setMenuOpen(null)
  }

  const removeFromList = async (key, label, doc) => {
    setMenuOpen(null)
    const isCustom = key.startsWith('custom__')
    if (isCustom && doc?.id) {
      await deleteDoc(doc.id)
      return
    }
    setCompSaving(true)
    try {
      await batchUpsertCompliance({
        machine_id: m.id,
        docs: [{ doc_type: key, doc_label: '', hidden: true,
                 expiry_date: null, issued_date: null, doc_no: null, notes: null }]
      })
      const r = await getMachineCompliance(m.id)
      setCompDocs(r.data.data)
    } catch (_) {}
    setCompSaving(false)
  }

  const addCustom = async () => {
    if (!newLabel.trim()) return
    setCompSaving(true)
    try {
      await batchUpsertCompliance({
        machine_id: m.id,
        docs: [{ doc_type: 'custom', doc_label: newLabel.trim(), expiry_date: null, notes: null }]
      })
      const r = await getMachineCompliance(m.id)
      setCompDocs(r.data.data)
      setNewLabel(''); setAddingNew(false)
    } catch (_) {}
    setCompSaving(false)
  }

  const navigate = useNavigate()

  const goToLogEntry = () => {
    onClose()
    navigate('/entry', { state: { project_code: m.project_code, machine_id: m.id } })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 bg-gray-50 shadow-2xl flex flex-col overflow-hidden border-l border-gray-200"
        style={{ width: 'min(980px, 95vw)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded text-xs flex-shrink-0">{m.project_code}</span>
            <div className="min-w-0">
              {m.nickname
                ? <>
                    <h2 className="text-base font-bold text-gray-900 truncate leading-tight">{m.nickname}</h2>
                    <p className="text-[11px] text-gray-400 font-mono leading-tight truncate">{m.slno}</p>
                  </>
                : <h2 className="text-base font-bold text-gray-900 truncate">{m.slno}</h2>
              }
            </div>
            <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              m.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
            }`}>{m.active ? 'Active' : 'Inactive'}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {onEdit && (
              <button onClick={onEdit} title="Edit"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <Edit2 size={14} />
              </button>
            )}
            <button onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Quick strip */}
        <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex-1 px-4 py-2 border-r border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Asset Name</p>
            <p className="text-xs font-semibold text-gray-800 mt-0.5 truncate">{m.eq_type || '—'}</p>
          </div>
          <div className="flex-1 px-4 py-2 border-r border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Owner</p>
            <p className={`text-xs font-semibold mt-0.5 ${m.ownership === 'Own' ? 'text-blue-600' : 'text-violet-600'}`}>
              {m.ownership === 'Own' ? 'RVR Projects Pvt Ltd' : (m.vendor || m.ownership)}
            </p>
          </div>
          <div className="flex-1 px-4 py-2">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Shift</p>
            <p className={`text-xs font-semibold mt-0.5 ${m.shift_type === 'Dual Shift' ? 'text-amber-600' : 'text-green-600'}`}>{m.shift_type || '—'}</p>
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT: Asset details */}
          <div className="w-[380px] flex-shrink-0 overflow-y-auto border-r border-gray-200 p-4 space-y-3">

            <DetailSection icon={Tag} title="Asset Identification">
              {m.nickname && <DetailRow label="Nickname"        value={m.nickname} />}
              <DetailRow label="Asset Code"      value={m.asset_code} mono />
              <DetailRow label="Asset Group"     value={m.asset_group} />
              <DetailRow label="Asset Category"  value={m.asset_cat} />
              <DetailRow label="Measurability"   value={m.asset_type
                ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    m.asset_type === 'Measurable Asset' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                  }`}>{m.asset_type}</span>
                : '—'} />
              <DetailRow label="Registration No" value={m.reg_no} mono />
              <DetailRow label="Chassis No"      value={m.chassis_no} mono />
              <DetailRow label="Engine No"       value={m.engine_no} mono />
            </DetailSection>

            <DetailSection icon={Wrench} title="Machine Specifications">
              <DetailRow label="Manufacturer" value={m.manufacturer} />
              <DetailRow label="Model"        value={m.model} />
              <DetailRow label="Year of Mfg." value={m.yom} />
              <DetailRow label="Capacity"     value={m.capacity ? `${m.capacity}${m.uom ? ' ' + m.uom : ''}` : '—'} />
              <DetailRow label="Fuel Type"    value={m.fuel_type
                ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{m.fuel_type}</span>
                : '—'} />
            </DetailSection>

            <DetailSection icon={IndianRupee} title={m.ownership === 'Hire' ? 'Hire Details' : 'Purchase Details'}>
              {m.ownership === 'Hire' ? (
                <>
                  <DetailRow label="Vendor"       value={m.vendor} />
                  <DetailRow label="Rate / Day"   value={fmtMoney(m.rate)} />
                  <DetailRow label="Rate / Month" value={fmtMoney(m.rate_monthly)} />
                </>
              ) : (
                <>
                  <DetailRow label="Date of Purchase" value={fmtDate(m.date_of_purchase)} />
                  <DetailRow label="PO Number"        value={m.po_number} mono />
                  <DetailRow label="Purchase Price"   value={fmtMoney(m.price)} />
                </>
              )}
            </DetailSection>

            <DetailSection icon={Clock} title="Operational Settings">
              <DetailRow label="Reading Basis" value={
                m.dual_reading ? `${m.reading1_basis} + ${m.reading2_basis || 'Dual'}` : (m.reading1_basis || '—')
              } />
              <DetailRow label="Fuel Min (L/hr)"  value={fmt(m.fuel_min)} />
              <DetailRow label="Fuel Max (L/hr)"  value={fmt(m.fuel_max)} />
              {(m.fuel_min_km || m.fuel_max_km) && <>
                <DetailRow label="Fuel Min (km/l)" value={fmt(m.fuel_min_km)} />
                <DetailRow label="Fuel Max (km/l)" value={fmt(m.fuel_max_km)} />
              </>}
              <DetailRow label="Planned Hrs/Day" value={m.planned_hours ? `${m.planned_hours} hrs` : '—'} />
            </DetailSection>

            <DetailSection icon={Info} title="Asset Status">
              <DetailRow label="Status" value={
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  m.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                }`}>{m.active ? 'Active' : 'Inactive'}</span>
              } />
              {!m.active && <DetailRow label="Reason" value={m.deactivation_reason} />}
              <DetailRow label="Added On"     value={fmtDate(m.created_at)} />
              <DetailRow label="Last Updated" value={fmtDate(m.updated_at)} />
            </DetailSection>

            <DetailSection icon={Calendar} title="Shift">
              <DetailRow label="Roster"        value={m.shift_type || '—'} />
              <DetailRow label="No. of Shifts" value={m.shift_type === 'Dual Shift' ? '2' : '1'} />
              <DetailRow label="Shift 1"       value="Day Shift" />
              {m.shift_type === 'Dual Shift' && <DetailRow label="Shift 2" value="Night Shift" />}
              <DetailRow label="Planned Hrs / Shift" value={m.planned_hours ? `${m.planned_hours} hrs` : '—'} />
            </DetailSection>

            <DetailSection icon={MapPin} title="Site">
              <DetailRow label="Current Site"  value={m.project_name ? `${m.project_code} — ${m.project_name}` : m.project_code} />
              <DetailRow label="Date of Receipt"
                value={m.transferred_date ? fmtDate(m.transferred_date) : m.date_of_purchase ? fmtDate(m.date_of_purchase) : 'Inception'} />
              {m.transferred_date && (
                <DetailRow label="Transferred From" value={m.transferred_from_project_id ? `Project ID ${m.transferred_from_project_id}` : '—'} />
              )}
            </DetailSection>

          </div>

          {/* RIGHT: Tabbed panel (Compliance | Documents) */}
          <div className="flex-1 overflow-hidden flex flex-col">

            {/* Tab bar */}
            <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
              <button
                onClick={() => setRightTab('compliance')}
                className={`px-5 py-3 text-xs font-semibold border-b-2 transition-colors ${
                  rightTab === 'compliance'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                Compliance
              </button>
              <button
                onClick={() => setRightTab('documents')}
                className={`px-5 py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  rightTab === 'documents'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                Documents
                {docs.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{docs.length}</span>
                )}
              </button>
              <button
                onClick={() => setRightTab('counter-reset')}
                className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  rightTab === 'counter-reset'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                <RotateCcw size={12} />Counter Reset
                {resetReqs.filter(r => r.status === 'pending').length > 0 && (
                  <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {resetReqs.filter(r => r.status === 'pending').length}
                  </span>
                )}
              </button>
              <button
                onClick={goToLogEntry}
                className="px-5 py-3 text-xs font-semibold border-b-2 border-transparent text-gray-500 hover:text-blue-700 transition-colors flex items-center gap-1.5">
                <ClipboardList size={12} />Log Entry
                <ExternalLink size={10} className="opacity-60" />
              </button>
            </div>

            {/* COMPLIANCE TAB */}
            {rightTab === 'compliance' && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-blue-700 rounded-full" />
                    <h3 className="text-sm font-semibold text-gray-800">Asset Compliances</h3>
                  </div>
                  <button onClick={() => { setAddingNew(true); setNewLabel('') }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors">
                    <Plus size={12} />Add Compliance
                  </button>
                </div>

                {addingNew && (
                  <div className="flex items-center gap-2 px-5 py-2.5 bg-blue-50 border-b border-blue-100">
                    <input autoFocus type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCustom(); if (e.key === 'Escape') setAddingNew(false) }}
                      placeholder="Compliance name…"
                      className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={addCustom} disabled={!newLabel.trim() || compSaving}
                      className="px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg disabled:opacity-60">
                      {compSaving ? 'Adding…' : 'Add'}
                    </button>
                    <button onClick={() => setAddingNew(false)} className="px-3 py-1.5 text-gray-500 text-xs hover:bg-gray-100 rounded-lg">Cancel</button>
                  </div>
                )}

                {compLoading ? (
                  <div className="flex items-center justify-center flex-1 text-sm text-gray-400">Loading…</div>
                ) : (
                  <div className="flex-1">
                    <div className="grid grid-cols-[2fr_1.4fr_1.6fr_36px] gap-2 px-5 py-2 bg-gray-100 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      <span>Compliance Name</span><span>Due Date</span><span>Remarks</span><span />
                    </div>
                    <div className="divide-y divide-gray-100">
                      {compRows.map(({ key, label, doc, isCustom }) => {
                        const isEditing = editingKey === key
                        const status    = calcCompStatus(doc?.expiry_date)
                        const dotColor  = status ? STATUS_DOT[status] : null
                        return (
                          <div key={key} className={`${isEditing ? 'bg-blue-50 border-l-2 border-blue-400' : 'bg-white hover:bg-gray-50'} transition-colors`}>
                            {!isEditing && (
                              <div className="grid grid-cols-[2fr_1.4fr_1.6fr_36px] gap-2 px-5 py-3 items-center">
                                <span className="text-xs font-medium text-gray-800">{label}</span>
                                <span className="flex items-center gap-1.5 text-xs text-gray-700">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor || 'bg-gray-200'}`} />
                                  {doc?.expiry_date ? fmtCompDate(doc.expiry_date) : <span className="text-gray-300">—</span>}
                                </span>
                                <span className="text-xs text-gray-500 truncate">{doc?.notes || <span className="text-gray-300">—</span>}</span>
                                <div className="relative">
                                  <button onClick={() => setMenuOpen(menuOpen === key ? null : key)}
                                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                                    <MoreVertical size={13} />
                                  </button>
                                  {menuOpen === key && (
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                                      <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-40 text-xs">
                                        <button onClick={() => startEdit(key, doc)}
                                          className="flex items-center gap-2 w-full px-3 py-2 hover:bg-blue-50 text-gray-700">
                                          <Edit2 size={11} className="text-blue-500" />Edit
                                        </button>
                                        {doc?.id && !isCustom && (
                                          <button onClick={() => deleteDoc(doc.id)} disabled={deleting === doc.id}
                                            className="flex items-center gap-2 w-full px-3 py-2 hover:bg-amber-50 text-amber-700">
                                            <Trash2 size={11} />{deleting === doc.id ? 'Clearing…' : 'Clear Data'}
                                          </button>
                                        )}
                                        <div className="border-t border-gray-100 my-1" />
                                        <button onClick={() => removeFromList(key, label, doc)} disabled={compSaving}
                                          className="flex items-center gap-2 w-full px-3 py-2 hover:bg-red-50 text-red-600">
                                          <X size={11} />Remove from List
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                            {isEditing && (
                              <div className="px-5 py-3 space-y-2.5">
                                <p className="text-xs font-semibold text-blue-700">{label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] text-gray-500 font-medium mb-1">Due / Expiry Date</label>
                                    <input type="date" value={editForm.expiry_date}
                                      onChange={e => setEditForm(f => ({ ...f, expiry_date: e.target.value }))}
                                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-gray-500 font-medium mb-1">Issue Date</label>
                                    <input type="date" value={editForm.issued_date}
                                      onChange={e => setEditForm(f => ({ ...f, issued_date: e.target.value }))}
                                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] text-gray-500 font-medium mb-1">Doc / Certificate No</label>
                                    <input type="text" value={editForm.doc_no}
                                      onChange={e => setEditForm(f => ({ ...f, doc_no: e.target.value }))}
                                      placeholder="e.g. TS01234"
                                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-gray-500 font-medium mb-1">Remarks</label>
                                    <input type="text" value={editForm.notes}
                                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                                      placeholder="Optional notes"
                                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                </div>
                                <div className="flex gap-2 pt-0.5">
                                  <button onClick={() => saveCompDoc(key, label)} disabled={compSaving}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
                                    {compSaving ? 'Saving…' : 'Save'}
                                  </button>
                                  <button onClick={() => setEditingKey(null)}
                                    className="px-3 py-1.5 text-gray-500 text-xs hover:bg-gray-200 rounded-lg transition-colors">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DOCUMENTS TAB */}
            {rightTab === 'documents' && (
              <div className="flex-1 overflow-y-auto flex flex-col">

                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-blue-700 rounded-full" />
                    <h3 className="text-sm font-semibold text-gray-800">Asset Documents</h3>
                  </div>
                  <button onClick={() => setAddingDoc(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors">
                    <Plus size={12} />Add Document
                  </button>
                </div>

                {addingDoc && (
                  <div className="px-5 py-4 bg-blue-50 border-b border-blue-100 space-y-3">
                    <p className="text-xs font-semibold text-blue-700">New Document</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-500 font-medium mb-1">Document Name *</label>
                        <input autoFocus type="text" value={docForm.doc_name}
                          onChange={e => setDocForm(f => ({ ...f, doc_name: e.target.value }))}
                          placeholder="e.g. Insurance, RC, Fitness…"
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 font-medium mb-1">Document Number</label>
                        <input type="text" value={docForm.doc_number}
                          onChange={e => setDocForm(f => ({ ...f, doc_number: e.target.value }))}
                          placeholder="Optional ref. number"
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 font-medium mb-1">Attach File (PDF, image, etc.)</label>
                      <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-blue-300 bg-white rounded-lg cursor-pointer hover:bg-blue-50 text-xs text-gray-600 w-fit">
                        <Upload size={13} className="text-blue-600" />
                        {docFile ? docFile.name : 'Choose file…'}
                        <input ref={docFileRef} type="file" className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.doc,.docx"
                          onChange={handleDocFileChange} />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveDoc} disabled={!docForm.doc_name.trim() || docSaving}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
                        {docSaving ? 'Saving…' : 'Save Document'}
                      </button>
                      <button onClick={() => { setAddingDoc(false); setDocForm({ doc_name: '', doc_number: '' }); setDocFile(null) }}
                        className="px-3 py-1.5 text-gray-500 text-xs hover:bg-gray-200 rounded-lg transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {docsLoading ? (
                  <div className="flex items-center justify-center flex-1 text-sm text-gray-400">Loading…</div>
                ) : (
                  <div className="flex-1">
                    <div className="grid grid-cols-[36px_2fr_1.4fr_auto] gap-2 px-5 py-2 bg-gray-100 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      <span>S.No</span><span>Document Name</span><span>Document Number</span><span className="text-right pr-2">Actions</span>
                    </div>

                    {docs.length === 0 ? (
                      <div className="px-5 py-12 text-center text-sm text-gray-400">No documents uploaded yet.</div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {docs.map((doc, idx) => (
                          <div key={doc.id} className="grid grid-cols-[36px_2fr_1.4fr_auto] gap-2 px-5 py-3 items-center bg-white hover:bg-gray-50 transition-colors">
                            <span className="text-xs text-gray-400 font-medium">{idx + 1}</span>
                            <span className="text-xs font-medium text-gray-800 truncate">{doc.doc_name}</span>
                            <span className="text-xs text-gray-500 truncate">{doc.doc_number || <span className="text-gray-300">—</span>}</span>
                            <div className="flex items-center gap-1 justify-end">
                              {doc.has_file && (
                                <>
                                  <button onClick={() => openDocUrl(doc, false)} title="View"
                                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors">
                                    <Eye size={13} />
                                  </button>
                                  <button onClick={() => openDocUrl(doc, true)} title="Download"
                                    className="p-1.5 text-blue-700 hover:bg-blue-50 rounded transition-colors">
                                    <Download size={13} />
                                  </button>
                                </>
                              )}
                              <button onClick={() => handleDocDelete(doc.id)} disabled={docDeleting === doc.id}
                                title="Delete"
                                className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded transition-colors disabled:opacity-50">
                                {docDeleting === doc.id ? <RotateCcw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* COUNTER RESET TAB */}
            {rightTab === 'counter-reset' && (
              <div className="flex-1 overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-orange-600 rounded-full" />
                    <h3 className="text-sm font-semibold text-gray-800">Counter Log Reset Requests</h3>
                  </div>
                  <button onClick={loadResetReqs} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400" title="Refresh">
                    <RotateCcw size={13} className={resetReqsLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                {resetReqsLoading ? (
                  <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                    <Loader2 size={18} className="animate-spin" /><span className="text-sm">Loading…</span>
                  </div>
                ) : resetReqs.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-gray-400">No reset requests for this machine</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {resetReqs.map(req => (
                      <div key={req.id} className={`px-5 py-4 ${req.status === 'pending' ? 'bg-orange-50/50' : ''}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                req.status === 'pending'  ? 'bg-amber-100 text-amber-700' :
                                req.status === 'approved' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-600'
                              }`}>
                                {req.status === 'approved' && <CheckCircle size={10} />}
                                {req.status === 'rejected' && <XCircle size={10} />}
                                {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                              </span>
                              <span className="text-xs text-gray-500">{req.reading_code || 'Hours'}</span>
                            </div>
                            <div className="text-xs text-gray-700 space-y-0.5">
                              {req.actual_reading_before_reset != null && (
                                <div>Actual Prev: <span className="font-mono font-medium">{req.actual_reading_before_reset}</span>
                                  {req.old_reading != null && req.actual_reading_before_reset != null && (
                                    <span className="text-[10px] text-amber-600 ml-1.5">(adj {parseFloat(req.old_reading) - parseFloat(req.actual_reading_before_reset) >= 0 ? '+' : ''}{(parseFloat(req.old_reading) - parseFloat(req.actual_reading_before_reset)).toFixed(2)})</span>
                                  )}
                                </div>
                              )}
                              <div>Reset Reading: <span className="font-mono font-medium">{req.old_reading ?? '—'}</span>
                                <span className="mx-2 text-gray-300">→</span>
                                New: <span className="font-mono font-medium text-orange-700">{req.new_reading ?? '—'}</span>
                              </div>
                              {req.old_reading != null && req.new_reading != null && (
                                <div className="text-[11px] text-blue-700">Effective: <span className="font-mono font-semibold">{(parseFloat(req.old_reading) + parseFloat(req.new_reading)).toFixed(2)}</span> {req.reading_code || 'Hr'}</div>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              Reset Date: {new Date(req.reset_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                              {req.reset_shift && <span className="ml-2 text-orange-500 font-medium">({req.reset_shift})</span>}
                            </div>
                            {req.remark && <div className="text-xs text-gray-500 italic">"{req.remark}"</div>}
                            <div className="text-[11px] text-gray-400">
                              Requested by <span className="font-medium text-gray-600">{req.requested_by_name || 'Unknown'}</span>
                              {' · '}{new Date(req.requested_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                            </div>
                            {req.status !== 'pending' && req.reviewed_by_name && (
                              <div className="text-[11px] text-gray-400">
                                {req.status === 'approved' ? 'Approved' : 'Rejected'} by <span className="font-medium text-gray-600">{req.reviewed_by_name}</span>
                                {req.review_note && <span className="italic"> — "{req.review_note}"</span>}
                              </div>
                            )}
                          </div>

                          {req.status === 'pending' && (
                            <div className="flex flex-col gap-1.5 flex-shrink-0">
                              {reviewNoteOpen?.id === req.id ? (
                                <div className="space-y-1.5">
                                  <textarea rows={2} value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                                    placeholder="Note (optional)"
                                    className="w-40 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none" />
                                  <div className="flex gap-1.5">
                                    <button
                                      disabled={reviewingId === req.id}
                                      onClick={() => handleReview(req.id, reviewNoteOpen.action)}
                                      className={`flex-1 text-[11px] font-semibold py-1 rounded-lg transition-colors disabled:opacity-50 ${
                                        reviewNoteOpen.action === 'approve'
                                          ? 'bg-green-600 hover:bg-green-700 text-white'
                                          : 'bg-red-600 hover:bg-red-700 text-white'
                                      }`}>
                                      {reviewingId === req.id ? '…' : reviewNoteOpen.action === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
                                    </button>
                                    <button onClick={() => { setReviewNoteOpen(null); setReviewNote(''); setReviewErr(null) }}
                                      className="px-2 py-1 text-[11px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">✕</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => { setReviewNoteOpen({ id: req.id, action: 'approve' }); setReviewNote(''); setReviewErr(null) }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                                    <CheckCircle size={11} /> Approve
                                  </button>
                                  <button
                                    onClick={() => { setReviewNoteOpen({ id: req.id, action: 'reject' }); setReviewNote(''); setReviewErr(null) }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition-colors">
                                    <XCircle size={11} /> Reject
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Inline error for this request */}
                        {reviewErr?.id === req.id && (
                          <div className="mt-2 px-3 py-2 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2">
                            <XCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[11px] font-semibold text-red-700">Cannot process request</p>
                              <p className="text-[11px] text-red-600 mt-0.5">{reviewErr.msg}</p>
                            </div>
                            <button onClick={() => setReviewErr(null)} className="ml-auto text-red-400 hover:text-red-600 flex-shrink-0">
                              <XCircle size={11} />
                            </button>
                          </div>
                        )}

                        {/* Success flash for this request */}
                        {reviewSuccess?.id === req.id && (
                          <div className="mt-2 px-3 py-2 bg-green-50 border border-green-300 rounded-lg flex items-center gap-2">
                            <CheckCircle size={13} className="text-green-600 flex-shrink-0" />
                            <p className="text-[11px] font-semibold text-green-700">
                              {reviewSuccess.action === 'approve' ? 'Approved successfully' : 'Rejected successfully'} — bell will update
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* LOG ENTRY TAB — navigates to Entry page */}
            {false && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white flex-shrink-0 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button onClick={() => shiftMonth(-1)} disabled={logLoading}
                      className="flex items-center gap-0.5 px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      <ChevronLeft size={11} />Prev
                    </button>
                    <input type="date" value={logFrom} onChange={e => setLogFrom(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <span className="text-xs text-gray-400">—</span>
                    <input type="date" value={logTo} onChange={e => setLogTo(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <button onClick={() => shiftMonth(1)} disabled={logLoading}
                      className="flex items-center gap-0.5 px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      Next<ChevronRight size={11} />
                    </button>
                    <button onClick={applyLogFilter} disabled={logLoading}
                      className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium rounded-lg disabled:opacity-60 transition-colors">
                      {logLoading ? 'Loading…' : 'Apply'}
                    </button>
                    <button onClick={() => openDprFor()}
                      className="flex items-center gap-1 px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors">
                      <Plus size={11} />Add DPR Entry
                    </button>
                  </div>
                </div>

                {/* Logsheet table */}
                {logLoading ? (
                  <div className="flex items-center justify-center flex-1 text-sm text-gray-400">Loading…</div>
                ) : !logFetched ? (
                  <div className="flex items-center justify-center flex-1 text-sm text-gray-400">Click Apply to load the logsheet</div>
                ) : (
                  <div className="flex-1 overflow-y-auto overflow-x-auto">
                    <table className="w-full text-xs min-w-[820px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">Date</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">Shift</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">Counterlog</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap">Fuel FeedIn (L)</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap">Downtime (Hrs)</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap">Productivity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {logRows.map(({ date, shift, entry }) => {
                          const isNight = shift === 'Night Shift'
                          return (
                            <tr key={`${date}_${shift}`}
                              className={`hover:bg-gray-50 transition-colors border-b border-gray-100 ${isNight ? 'bg-indigo-50/30' : ''}`}>
                              <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{fmtEntryDate(date)}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  isNight ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                                }`}>{isNight ? 'Night' : 'Day'}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {entry ? (
                                  <span className="tabular-nums text-gray-700">
                                    {entry.r1_open != null ? Number(entry.r1_open).toFixed(1) : '—'}
                                    {' → '}
                                    {entry.r1_close != null ? Number(entry.r1_close).toFixed(1) : '—'}
                                  </span>
                                ) : (
                                  <button onClick={() => openDprFor(date, shift)}
                                    className="text-blue-500 hover:text-blue-700 hover:underline font-medium">
                                    No Record
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                                {entry?.hsd != null ? Number(entry.hsd).toFixed(1) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {entry?.breakdown != null && entry.breakdown > 0
                                  ? <span className="text-red-500 font-semibold">{Number(entry.breakdown).toFixed(1)}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                                {entry?.qty != null ? Number(entry.qty).toFixed(2) : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 bg-white border-t border-gray-200 flex gap-2">
          {onEdit && (
            <button onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors">
              <Edit2 size={13} />Edit Machine
            </button>
          )}
          <button onClick={onClose}
            className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
            Close
          </button>
        </div>
      </div>

    </>
  )
}
