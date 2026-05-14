import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getComplianceAll, getComplianceSummary, getComplianceUpcoming,
  getMachineCompliance, getComplianceAttachment, batchUpsertCompliance, deleteCompliance,
  getProjects,
} from '../../lib/api'
import {
  ShieldAlert, Edit2, Download, Search, X, Plus, Trash2, RefreshCw,
  AlertTriangle, Clock, CheckCircle2, Info, Paperclip, Eye, FileText,
} from 'lucide-react'
import * as XLSX from 'xlsx'

/* ─── Constants ──────────────────────────────────────────────── */
const DOC_TYPES = [
  { key: 'insurance',       label: 'Insurance',           short: 'Insur.' },
  { key: 'road_tax',        label: 'Road Tax',            short: 'Tax' },
  { key: 'fitness',         label: 'Fitness Cert.',       short: 'Fitness' },
  { key: 'puc',             label: 'PUC Certificate',     short: 'PUC' },
  { key: 'national_permit', label: 'National Permit',     short: 'Nat.Permit' },
  { key: 'state_permit',    label: 'State Permit',        short: 'St.Permit' },
  { key: 'load_test',       label: 'Load Test Cert.',     short: 'LoadTest' },
]

const STATUS_CFG = {
  expired:  { label: 'Expired',        color: '#dc2626', bg: '#fee2e2', border: '#fca5a5', pill: 'bg-red-100 text-red-700 border-red-200' },
  critical: { label: 'Critical (≤7d)', color: '#ea580c', bg: '#ffedd5', border: '#fdba74', pill: 'bg-orange-100 text-orange-700 border-orange-200' },
  warning:  { label: 'Due Soon (≤30d)',color: '#d97706', bg: '#fef3c7', border: '#fcd34d', pill: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  valid:    { label: 'Valid',          color: '#16a34a', bg: '#dcfce7', border: '#86efac', pill: 'bg-green-100 text-green-700 border-green-200' },
  na:       { label: 'Not Updated',   color: '#9ca3af', bg: '#f3f4f6', border: '#e5e7eb', pill: 'bg-gray-100 text-gray-500 border-gray-200' },
}

const MAX_FILE_BYTES = 5 * 1024 * 1024  // 5 MB

/* ─── Helpers ─────────────────────────────────────────────────── */
function calcStatus(expiryDate) {
  if (!expiryDate) return { status: 'na', days: null }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(expiryDate)
  const days = Math.ceil((exp - today) / 86400000)
  let status = 'valid'
  if (days < 0)       status = 'expired'
  else if (days <= 7)  status = 'critical'
  else if (days <= 30) status = 'warning'
  return { status, days }
}

function fmtDate(d) {
  if (!d) return ''
  const s = typeof d === 'string' ? d : d.toISOString()
  return s.split('T')[0]
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)  // data:mime;base64,...
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function triggerDownload(docId, filename) {
  try {
    const res = await getComplianceAttachment(docId)
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (_) {}
}

/* ─── Status Badge ────────────────────────────────────────────── */
function StatusBadge({ doc }) {
  if (!doc || !doc.expiry_date) return <span className="text-gray-300 text-xs select-none">—</span>
  const { status, days } = calcStatus(doc.expiry_date)
  const cfg = STATUS_CFG[status]
  let text
  if (status === 'expired') text = `${Math.abs(days)}d ago`
  else if (days === 0)      text = 'Today!'
  else                      text = `${days}d`
  return (
    <span
      title={`Expires: ${fmtDate(doc.expiry_date)}`}
      className="inline-block px-1.5 py-0.5 rounded text-xs font-bold whitespace-nowrap border"
      style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}
    >
      {text}
    </span>
  )
}

/* ─── Attachment Cell (inside edit modal row) ─────────────────── */
function AttachmentCell({ doc, onFileSelected, onClear, onDownload }) {
  const fileRef = useRef()

  // doc.new_attachment = { name, data, mime } — user just picked
  // doc.existing_attachment = { name, mime } — from DB
  // doc.clear_attachment = true — user wants to remove

  if (doc.clear_attachment) {
    return (
      <div className="flex items-center gap-1 text-xs text-gray-400">
        <span className="line-through">removed</span>
        <button onClick={onClear} className="text-blue-500 hover:text-blue-700 underline ml-1 text-xs">Undo</button>
      </div>
    )
  }

  const showing = doc.new_attachment || doc.existing_attachment

  return (
    <div className="flex flex-col gap-0.5">
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.tiff,.bmp"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files[0]
          if (!file) return
          e.target.value = ''
          if (file.size > MAX_FILE_BYTES) { alert(`File too large. Maximum 5 MB. (${(file.size/1024/1024).toFixed(1)} MB selected)`); return }
          const data = await readFileAsBase64(file)
          onFileSelected({ name: file.name, data, mime: file.type || 'application/octet-stream' })
        }}
      />
      {showing ? (
        <div className="flex items-center gap-1 max-w-[140px]">
          <FileText size={11} className={doc.new_attachment ? 'text-blue-500' : 'text-gray-400'} />
          <span className="text-xs truncate text-gray-700" title={showing.name}>{showing.name}</span>
          {doc.new_attachment
            ? <span className="text-[9px] bg-blue-100 text-blue-600 rounded px-0.5 font-bold flex-shrink-0">NEW</span>
            : (
              <button onClick={onDownload} title="Download" className="text-gray-400 hover:text-blue-600 flex-shrink-0 ml-0.5">
                <Download size={10} />
              </button>
            )
          }
          <button
            onClick={() => { if (doc.existing_attachment && !doc.new_attachment) { onClear(true) } else { onClear(false) } }}
            title={doc.new_attachment ? 'Cancel new file' : 'Remove attachment'}
            className="text-gray-300 hover:text-red-400 flex-shrink-0"
          >
            <X size={10} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 border border-dashed border-gray-300 hover:border-blue-400 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
        >
          <Paperclip size={10} /> Attach
        </button>
      )}
    </div>
  )
}

/* ─── Edit Modal ─────────────────────────────────────────────── */
function EditModal({ machine, onClose, onSaved }) {
  const machineId = machine.machine_id

  const [stdDocs,    setStdDocs]    = useState({})
  const [customDocs, setCustomDocs] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    getMachineCompliance(machineId)
      .then(r => {
        const existing = r.data.data
        const sd = {}
        DOC_TYPES.forEach(dt => {
          const f = existing.find(d => d.doc_type === dt.key && (d.doc_label === '' || d.doc_label === null))
          sd[dt.key] = {
            id: f?.id || null,
            doc_no:       f?.doc_no || '',
            issued_by:    f?.issued_by || '',
            issued_date:  fmtDate(f?.issued_date),
            expiry_date:  fmtDate(f?.expiry_date),
            notes:        f?.notes || '',
            // attachment tracking
            existing_attachment: f?.attachment_name ? { name: f.attachment_name, mime: f.attachment_mime } : null,
            new_attachment:  null,
            clear_attachment: false,
          }
        })
        setStdDocs(sd)
        setCustomDocs(
          existing.filter(d => d.doc_type === 'custom').map(d => ({
            tempId: `ex_${d.id}`, id: d.id,
            doc_label:   d.doc_label || '',
            doc_no:      d.doc_no || '',
            issued_by:   d.issued_by || '',
            issued_date: fmtDate(d.issued_date),
            expiry_date: fmtDate(d.expiry_date),
            notes:       d.notes || '',
            existing_attachment: d.attachment_name ? { name: d.attachment_name, mime: d.attachment_mime } : null,
            new_attachment:  null,
            clear_attachment: false,
          }))
        )
      })
      .catch(() => setError('Failed to load compliance data'))
      .finally(() => setLoading(false))
  }, [machineId])

  const setStd = (key, field, val) =>
    setStdDocs(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } }))

  const setStdAttachment = (key, att) =>
    setStdDocs(prev => ({ ...prev, [key]: { ...prev[key], new_attachment: att, clear_attachment: false } }))

  const clearStdAttachment = (key, isExistingRemove) =>
    setStdDocs(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        new_attachment: null,
        clear_attachment: isExistingRemove ? true : prev[key].clear_attachment,
      },
    }))

  const undoClearStd = (key) =>
    setStdDocs(prev => ({ ...prev, [key]: { ...prev[key], clear_attachment: false } }))

  const setCust = (tempId, field, val) =>
    setCustomDocs(prev => prev.map(c => c.tempId === tempId ? { ...c, [field]: val } : c))

  const setCustAttachment = (tempId, att) =>
    setCustomDocs(prev => prev.map(c => c.tempId === tempId ? { ...c, new_attachment: att, clear_attachment: false } : c))

  const clearCustAttachment = (tempId, isExistingRemove) =>
    setCustomDocs(prev => prev.map(c => c.tempId === tempId
      ? { ...c, new_attachment: null, clear_attachment: isExistingRemove ? true : c.clear_attachment }
      : c
    ))

  const removeCustom = async (c) => {
    if (c.id) { try { await deleteCompliance(c.id) } catch (_) {} }
    setCustomDocs(prev => prev.filter(x => x.tempId !== c.tempId))
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const toSave = []
      const toDelete = []

      for (const dt of DOC_TYPES) {
        const d = stdDocs[dt.key]
        if (!d) continue
        if (d.expiry_date) {
          toSave.push({
            doc_type: dt.key, doc_label: '',
            doc_no: d.doc_no, issued_by: d.issued_by, issued_date: d.issued_date,
            expiry_date: d.expiry_date, notes: d.notes,
            attachment_name: d.new_attachment?.name || null,
            attachment_data: d.new_attachment?.data ? d.new_attachment.data.split(',')[1] : null,
            attachment_mime: d.new_attachment?.mime || null,
            clear_attachment: d.clear_attachment,
          })
        } else if (d.id) {
          toDelete.push(d.id)
        }
      }

      for (const c of customDocs) {
        if (c.doc_label && c.expiry_date) {
          toSave.push({
            doc_type: 'custom', doc_label: c.doc_label,
            doc_no: c.doc_no, issued_by: c.issued_by, issued_date: c.issued_date,
            expiry_date: c.expiry_date, notes: c.notes,
            attachment_name: c.new_attachment?.name || null,
            attachment_data: c.new_attachment?.data ? c.new_attachment.data.split(',')[1] : null,
            attachment_mime: c.new_attachment?.mime || null,
            clear_attachment: c.clear_attachment,
          })
        }
      }

      await Promise.all(toDelete.map(id => deleteCompliance(id)))
      if (toSave.length > 0) await batchUpsertCompliance({ machine_id: machineId, docs: toSave })

      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inp = 'border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-full bg-white'
  const lbl = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-0.5'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl mt-4 mb-4">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <ShieldAlert size={16} className="text-blue-600" />
              Update RTA Compliance
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              <span className="font-semibold text-gray-700">{machine.slno}</span>
              {machine.reg_no && <> · <span className="font-medium">{machine.reg_no}</span></>}
              {' · '}{machine.eq_type}
              {' · '}<span className={machine.ownership === 'Own' ? 'text-blue-600 font-medium' : 'text-violet-600 font-medium'}>{machine.ownership}</span>
              {' · '}<span className="bg-blue-50 text-blue-700 font-semibold px-1.5 rounded">{machine.project_code}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {loading ? (
            <p className="text-center text-gray-400 py-8 text-sm">Loading compliance data…</p>
          ) : (
            <>
              {/* ─ Standard RTA Documents ─ */}
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <ShieldAlert size={12} className="text-blue-500" />
                  Standard RTA Documents
                </p>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-semibold text-gray-500 w-36">Document</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-500 w-28">Doc / Policy #</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-500 w-28">Issued By</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-500 w-24">Issue Date</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-500 w-24">
                          Expiry Date <span className="text-red-400">*</span>
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-500 w-32">Notes</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-500 w-40">
                          <span className="flex items-center gap-1"><Paperclip size={10} />Attachment</span>
                        </th>
                        <th className="w-5 py-2 px-1"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {DOC_TYPES.map(dt => {
                        const d = stdDocs[dt.key] || {}
                        const { status } = d.expiry_date ? calcStatus(d.expiry_date) : {}
                        const rowBg = status === 'expired' ? 'bg-red-50/60' : status === 'critical' ? 'bg-orange-50/60' : status === 'warning' ? 'bg-yellow-50/40' : ''
                        return (
                          <tr key={dt.key} className={`${rowBg} transition-colors`}>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-gray-700 leading-tight">{dt.label}</div>
                              {d.expiry_date && <div className="mt-0.5"><StatusBadge doc={{ ...d, doc_type: dt.key }} /></div>}
                            </td>
                            <td className="py-1.5 px-2">
                              <input value={d.doc_no || ''} onChange={e => setStd(dt.key, 'doc_no', e.target.value)} className={inp} placeholder="e.g. POL/12345" />
                            </td>
                            <td className="py-1.5 px-2">
                              <input value={d.issued_by || ''} onChange={e => setStd(dt.key, 'issued_by', e.target.value)} className={inp} placeholder="Authority / Company" />
                            </td>
                            <td className="py-1.5 px-2">
                              <input type="date" value={d.issued_date || ''} onChange={e => setStd(dt.key, 'issued_date', e.target.value)} className={inp} />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="date"
                                value={d.expiry_date || ''}
                                onChange={e => setStd(dt.key, 'expiry_date', e.target.value)}
                                className={inp + (d.expiry_date && calcStatus(d.expiry_date).status === 'expired' ? ' border-red-400' : '')}
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input value={d.notes || ''} onChange={e => setStd(dt.key, 'notes', e.target.value)} className={inp} placeholder="Notes" />
                            </td>
                            <td className="py-1.5 px-2">
                              <AttachmentCell
                                doc={d}
                                onFileSelected={(att) => setStdAttachment(dt.key, att)}
                                onClear={(isExistingRemove) => {
                                  if (d.clear_attachment) undoClearStd(dt.key)
                                  else clearStdAttachment(dt.key, isExistingRemove)
                                }}
                                onDownload={() => d.id && triggerDownload(d.id, d.existing_attachment?.name || 'attachment')}
                              />
                            </td>
                            <td className="py-1.5 px-1">
                              {d.expiry_date && (
                                <button onClick={() => setStd(dt.key, 'expiry_date', '')} title="Clear expiry" className="text-gray-300 hover:text-red-400 transition-colors">
                                  <X size={12} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ─ Custom Documents ─ */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus size={12} className="text-blue-500" />
                    Custom / Additional Documents
                  </p>
                  <button
                    onClick={() => setCustomDocs(prev => [...prev, {
                      tempId: `new_${Date.now()}`, id: null,
                      doc_label: '', doc_no: '', issued_by: '', issued_date: '', expiry_date: '', notes: '',
                      existing_attachment: null, new_attachment: null, clear_attachment: false,
                    }])}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                  >
                    <Plus size={11} /> Add Document
                  </button>
                </div>

                {customDocs.length === 0 && (
                  <p className="text-xs text-gray-400 italic py-2">Add NOC, Mining Permit, RVNL Permit, Overload Certificate, etc.</p>
                )}

                <div className="space-y-2">
                  {customDocs.map(c => (
                    <div key={c.tempId} className="bg-blue-50/30 rounded-lg border border-blue-100 p-3">
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
                        <div className="col-span-2 md:col-span-1">
                          <label className={lbl}>Document Name <span className="text-red-400">*</span></label>
                          <input value={c.doc_label} onChange={e => setCust(c.tempId, 'doc_label', e.target.value)} className={inp} placeholder="e.g. Mining Permit" />
                        </div>
                        <div>
                          <label className={lbl}>Doc / Cert #</label>
                          <input value={c.doc_no} onChange={e => setCust(c.tempId, 'doc_no', e.target.value)} className={inp} placeholder="Number" />
                        </div>
                        <div>
                          <label className={lbl}>Issued By</label>
                          <input value={c.issued_by} onChange={e => setCust(c.tempId, 'issued_by', e.target.value)} className={inp} placeholder="Authority" />
                        </div>
                        <div>
                          <label className={lbl}>Issue Date</label>
                          <input type="date" value={c.issued_date} onChange={e => setCust(c.tempId, 'issued_date', e.target.value)} className={inp} />
                        </div>
                        <div>
                          <label className={lbl}>Expiry Date <span className="text-red-400">*</span></label>
                          <input type="date" value={c.expiry_date} onChange={e => setCust(c.tempId, 'expiry_date', e.target.value)} className={inp} />
                        </div>
                        <div className="flex items-end gap-1.5">
                          <div className="flex-1">
                            <label className={lbl}>Notes</label>
                            <input value={c.notes} onChange={e => setCust(c.tempId, 'notes', e.target.value)} className={inp} placeholder="Notes" />
                          </div>
                          <button onClick={() => removeCustom(c)} title="Remove row" className="text-red-400 hover:text-red-600 p-1 mb-0.5 flex-shrink-0">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {/* Attachment row for custom doc */}
                      <div className="mt-2 pt-2 border-t border-blue-100 flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                          <Paperclip size={10} /> Attachment:
                        </span>
                        <AttachmentCell
                          doc={c}
                          onFileSelected={(att) => setCustAttachment(c.tempId, att)}
                          onClear={(isExistingRemove) => clearCustAttachment(c.tempId, isExistingRemove)}
                          onDownload={() => c.id && triggerDownload(c.id, c.existing_attachment?.name || 'attachment')}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <Info size={13} className="text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  <strong>Expiry Date</strong> is required to track a document.
                  Attach the scanned copy (PDF/image, max 5 MB) per document for reference.
                  Attachments are preserved unless you explicitly remove them.
                </p>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>}

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-6 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Compliance Data'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ───────────────────────────────────────────────── */
export default function Compliance() {
  const { isAdmin } = useAuth()
  const [machines,  setMachines]  = useState([])
  const [summary,   setSummary]   = useState({ expired: 0, critical: 0, warning: 0, valid: 0, na: 0, total: 0 })
  const [upcoming,  setUpcoming]  = useState([])
  const [projects,  setProjects]  = useState([])
  const [loading,   setLoading]   = useState(false)
  const [editMachine, setEditMachine] = useState(null)
  const [tab,     setTab]     = useState('grid')
  const [upDays,  setUpDays]  = useState(30)
  const [tick,    setTick]    = useState(0)
  const [filters, setFilters] = useState({ project_code: '', ownership: '', status: '', search: '' })

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data || [])).catch(() => {})
  }, [])

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = {}
    if (filters.project_code) params.project_code = filters.project_code
    if (filters.ownership)    params.ownership    = filters.ownership
    Promise.all([
      getComplianceAll(params),
      getComplianceSummary(),
      getComplianceUpcoming(upDays),
    ])
      .then(([allR, sumR, upR]) => {
        setMachines(allR.data.data || [])
        setSummary(sumR.data.data || { expired:0, critical:0, warning:0, valid:0, na:0, total:0 })
        setUpcoming(upR.data.data || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters.project_code, filters.ownership, upDays, tick])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    return machines.filter(m => {
      if (filters.status) {
        const docStatuses = Object.values(m.docs).map(d => d.status)
        if (filters.status === 'na') {
          if (Object.keys(m.docs).length > 0 && !docStatuses.includes('na')) return false
        } else {
          if (!docStatuses.includes(filters.status)) return false
        }
      }
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!m.slno?.toLowerCase().includes(q) && !m.reg_no?.toLowerCase().includes(q) && !m.eq_type?.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [machines, filters.status, filters.search])

  const exportExcel = () => {
    const data = []
    for (const m of machines) {
      for (const dt of DOC_TYPES) {
        const d = m.docs[dt.key]
        const { status, days } = d ? calcStatus(d.expiry_date) : { status: 'na', days: null }
        data.push({
          'SL#': m.slno, 'Reg No': m.reg_no || '—', 'Equipment': m.eq_type,
          'Project': m.project_code, 'Ownership': m.ownership,
          'Document Type': dt.label,
          'Doc / Policy #': d?.doc_no || '—',
          'Issued By': d?.issued_by || '—',
          'Issue Date': d?.issued_date ? fmtDate(d.issued_date) : '—',
          'Expiry Date': d?.expiry_date ? fmtDate(d.expiry_date) : 'Not Updated',
          'Days Remaining': days ?? '—',
          'Status': STATUS_CFG[status]?.label || status,
          'Attachment': d?.has_attachment ? (d.attachment_name || 'Yes') : '—',
        })
      }
      Object.values(m.docs).filter(d => d.doc_type === 'custom').forEach(d => {
        const { status, days } = calcStatus(d.expiry_date)
        data.push({
          'SL#': m.slno, 'Reg No': m.reg_no || '—', 'Equipment': m.eq_type,
          'Project': m.project_code, 'Ownership': m.ownership,
          'Document Type': d.doc_label || 'Custom',
          'Doc / Policy #': d.doc_no || '—',
          'Issued By': d.issued_by || '—',
          'Issue Date': d.issued_date ? fmtDate(d.issued_date) : '—',
          'Expiry Date': d.expiry_date ? fmtDate(d.expiry_date) : '—',
          'Days Remaining': days ?? '—',
          'Status': STATUS_CFG[status]?.label || status,
          'Attachment': d.has_attachment ? (d.attachment_name || 'Yes') : '—',
        })
      })
    }
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [8,12,16,10,8,22,16,22,10,10,8,12,20].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'RTA Compliance')
    XLSX.writeFile(wb, `RTA_Compliance_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const sel = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
  const setF = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value }))

  const SUMMARY_CARDS = [
    { key: 'expired',  label: 'Expired',        icon: AlertTriangle, iconColor: 'text-red-500' },
    { key: 'critical', label: 'Critical (≤7d)',  icon: AlertTriangle, iconColor: 'text-orange-500' },
    { key: 'warning',  label: 'Due Soon (≤30d)', icon: Clock,         iconColor: 'text-yellow-500' },
    { key: 'valid',    label: 'Valid',           icon: CheckCircle2,  iconColor: 'text-green-600' },
    { key: 'na',       label: 'Not Updated',     icon: Info,          iconColor: 'text-gray-400' },
  ]

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert size={20} className="text-blue-700" />
            RTA Compliance Tracker
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Insurance · Road Tax · Fitness · PUC · Permits — with document attachments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTick(t => t + 1)} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-500" title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 transition-colors">
            <Download size={15} /> Export Excel
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {SUMMARY_CARDS.map(({ key, label, icon: Icon, iconColor }) => {
          const cfg = STATUS_CFG[key]
          const active = filters.status === key
          return (
            <button
              key={key}
              onClick={() => setFilters(f => ({ ...f, status: f.status === key ? '' : key }))}
              className={`rounded-xl border-2 p-3 text-left transition-all ${active ? 'ring-2 ring-blue-600 ring-offset-1' : 'hover:opacity-90'}`}
              style={{ backgroundColor: cfg.bg, borderColor: active ? '#2563eb' : cfg.border }}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold tracking-wider uppercase" style={{ color: cfg.color }}>{label}</p>
                <Icon size={13} className={iconColor} />
              </div>
              <p className="text-2xl font-extrabold tabular-nums leading-tight" style={{ color: cfg.color }}>
                {loading ? '—' : (summary[key] ?? 0)}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: cfg.color, opacity: 0.7 }}>documents</p>
            </button>
          )
        })}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select value={filters.project_code} onChange={setF('project_code')} className={sel}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
          </select>
          <select value={filters.ownership} onChange={setF('ownership')} className={sel}>
            <option value="">All Ownership</option>
            <option value="Own">Own</option>
            <option value="Hire">Hire</option>
          </select>
          <select value={filters.status} onChange={setF('status')} className={sel}>
            <option value="">All Statuses</option>
            <option value="expired">Expired</option>
            <option value="critical">Critical (≤7d)</option>
            <option value="warning">Due Soon (≤30d)</option>
            <option value="valid">Valid</option>
            <option value="na">Not Updated</option>
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" placeholder="Search SL#, Reg No, Type…"
              value={filters.search} onChange={setF('search')}
              className={sel + ' pl-9 w-full'}
            />
          </div>
        </div>
      </div>

      {/* ── Tab Switch ── */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[{ key: 'grid', label: 'Fleet Grid View' }, { key: 'report', label: 'Expiry Report' }].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── GRID VIEW ── */}
      {tab === 'grid' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-400">{loading ? 'Loading…' : `${filtered.length} machines`}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">SL#</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">Reg No</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">Equipment</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Project</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Own</th>
                  {DOC_TYPES.map(dt => (
                    <th key={dt.key} className="px-2 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">{dt.short}</th>
                  ))}
                  <th className="px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">+Custom</th>
                  {isAdmin && <th className="px-3 py-2.5 font-semibold text-gray-500">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={DOC_TYPES.length + 7} className="px-4 py-10 text-center text-gray-400">
                      No machines match current filters
                    </td>
                  </tr>
                )}
                {filtered.map(m => {
                  const customCount = Object.values(m.docs).filter(d => d.doc_type === 'custom').length
                  return (
                    <tr key={m.machine_id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">{m.slno}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{m.reg_no || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{m.eq_type}</td>
                      <td className="px-3 py-2">
                        <span className="bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded">{m.project_code}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`font-medium ${m.ownership === 'Own' ? 'text-blue-600' : 'text-violet-600'}`}>{m.ownership}</span>
                      </td>
                      {DOC_TYPES.map(dt => {
                        const doc = m.docs[dt.key]
                        return (
                          <td key={dt.key} className="px-2 py-2 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <StatusBadge doc={doc} />
                              {doc?.has_attachment && (
                                <Paperclip size={9} className="text-gray-400" title={doc.attachment_name} />
                              )}
                            </div>
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-center">
                        {customCount > 0
                          ? <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded px-1.5 py-0.5 font-medium">+{customCount}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setEditMachine(m)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors whitespace-nowrap"
                          >
                            <Edit2 size={10} /> Update
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── REPORT VIEW ── */}
      {tab === 'report' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500 font-medium">Expiring within:</span>
            {[7, 15, 30, 60, 90, 180].map(d => (
              <button
                key={d}
                onClick={() => setUpDays(d)}
                className={`px-3 py-1 text-xs rounded-full font-semibold border transition-colors ${
                  upDays === d ? 'bg-blue-700 text-white border-blue-700' : 'text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {d} days
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-xs text-gray-400">
                {loading ? 'Loading…' : `${upcoming.length} documents — expired + expiring within ${upDays} days`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['SL#','Reg No','Equipment','Project','Own','Document','Doc #','Issued By','Expiry Date','Days','Status'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                    {isAdmin && <th className="px-3 py-2.5">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!loading && upcoming.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-gray-400">
                        No expiries in this period
                      </td>
                    </tr>
                  )}
                  {upcoming.map(d => {
                    const { status, days } = calcStatus(d.expiry_date)
                    const cfg = STATUS_CFG[status]
                    const daysText = days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'Today!' : `${days}d`
                    const docLabel = d.doc_type === 'custom' ? (d.doc_label || 'Custom') : (DOC_TYPES.find(x => x.key === d.doc_type)?.label || d.doc_type)
                    const parentMachine = machines.find(m => m.machine_id === d.machine_id)
                    return (
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 font-semibold">{d.slno}</td>
                        <td className="px-3 py-2 text-gray-600">{d.reg_no || '—'}</td>
                        <td className="px-3 py-2">{d.eq_type}</td>
                        <td className="px-3 py-2">
                          <span className="bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded">{d.project_code}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`font-medium ${d.ownership === 'Own' ? 'text-blue-600' : 'text-violet-600'}`}>{d.ownership}</span>
                        </td>
                        <td className="px-3 py-2 font-medium">{docLabel}</td>
                        <td className="px-3 py-2 text-gray-600">{d.doc_no || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{d.issued_by || '—'}</td>
                        <td className="px-3 py-2 font-medium">{fmtDate(d.expiry_date)}</td>
                        <td className="px-3 py-2">
                          <span className="font-bold tabular-nums" style={{ color: cfg.color }}>{daysText}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${cfg.pill}`}>{cfg.label}</span>
                        </td>
                        {isAdmin && (
                          <td className="px-3 py-2">
                            {parentMachine && (
                              <button
                                onClick={() => { setEditMachine(parentMachine); setTab('grid') }}
                                className="text-xs text-blue-600 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50"
                              >
                                <Edit2 size={10} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editMachine && (
        <EditModal
          machine={editMachine}
          onClose={() => setEditMachine(null)}
          onSaved={() => setTick(t => t + 1)}
        />
      )}
    </div>
  )
}
