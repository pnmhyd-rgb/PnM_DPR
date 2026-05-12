import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getHireVendors, createHireVendor, updateHireVendor, deleteHireVendor,
  getHireWorkOrders, getHireWorkOrder, createHireWorkOrder, updateHireWorkOrder,
  deleteHireWorkOrder, submitHireWorkOrder, approveHireWOL1, approveHireWOFinal,
  rejectHireWorkOrder, renewHireWorkOrder, getProjects, getMachines,
} from '../../lib/api'
import GSTVerifyField from '../../components/GSTVerifyField'
import {
  Plus, Edit2, Trash2, X, Search, Eye, CheckCircle, XCircle,
  FileText, Download, RefreshCw, ChevronDown, AlertCircle, Loader2,
  Building2, FileCheck, RotateCcw, ShieldCheck, ShieldX, BadgeCheck,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
const fmtMoney = v => v != null ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'

const STATUS_META = {
  draft:       { label: 'Draft',       color: 'bg-gray-100 text-gray-600'   },
  submitted:   { label: 'Submitted',   color: 'bg-yellow-100 text-yellow-700' },
  l1_approved: { label: 'L1 Approved', color: 'bg-blue-100 text-blue-700'   },
  approved:    { label: 'Approved',    color: 'bg-green-100 text-green-700'  },
  rejected:    { label: 'Rejected',    color: 'bg-red-100 text-red-600'     },
  expired:     { label: 'Expired',     color: 'bg-orange-100 text-orange-600'},
  renewed:     { label: 'Renewed',     color: 'bg-purple-100 text-purple-700'},
}

function Badge({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${m.color}`}>{m.label}</span>
}

const inp  = 'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const lbl  = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[94vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

// ── TOAST ─────────────────────────────────────────────────────────────────────

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium
      transition-all duration-300 animate-in slide-in-from-bottom-4
      ${toast.type === 'success' ? 'bg-green-600 text-white' :
        toast.type === 'warn'    ? 'bg-amber-500 text-white' : 'bg-red-600 text-white'}`}>
      {toast.type === 'success' ? <ShieldCheck size={16}/> :
       toast.type === 'warn'    ? <AlertCircle size={16}/> : <ShieldX size={16}/>}
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

// ── VENDOR MODAL ─────────────────────────────────────────────────────────────

const blankVendor = {
  name: '', contact_person: '', phone: '', email: '',
  address: '', gst_no: '', pan_no: '',
  bank_name: '', bank_account: '', bank_ifsc: '',
  // GST-enriched fields
  legal_name: '', trade_name: '', state: '', district: '', pincode: '',
  gst_status: '', business_type: '', gst_reg_date: '',
  gst_verified: false, gst_verified_at: null, gst_api_response: null,
}

function VendorModal({ vendor, onClose, onSaved }) {
  const [form,       setForm]       = useState(vendor ? { ...blankVendor, ...vendor } : { ...blankVendor })
  const [gstCard,    setGstCard]    = useState(null)   // verified GST data card
  const [autoFilled, setAutoFilled] = useState(new Set())
  const [dupWarning, setDupWarning] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const { toast, show: showToast }  = useToast()

  const set  = k => e  => setForm(f => ({ ...f, [k]: e.target.value }))
  const setV = k => val => setForm(f => ({ ...f, [k]: val }))

  // Initialise gstCard from existing vendor data
  useEffect(() => {
    if (vendor?.gst_no && vendor?.gst_status) {
      setGstCard({
        legal_name:        vendor.legal_name || vendor.name,
        trade_name:        vendor.trade_name || '',
        gst_status:        vendor.gst_status,
        business_type:     vendor.business_type || '',
        registration_date: vendor.gst_reg_date,
        pan:               vendor.pan_no || '',
        state:             vendor.state || '',
        verified_at:       vendor.gst_verified_at,
      })
    }
  }, [])

  const handleGSTVerified = (data, warning) => {
    setDupWarning('')
    setGstCard(warning ? null : data)  // only show card for full verification

    const fill   = {}
    const filled = new Set()
    const tryFill = (key, val) => { if (val) { fill[key] = val; filled.add(key) } }

    tryFill('legal_name',    data.legal_name)
    tryFill('trade_name',    data.trade_name)
    tryFill('address',       data.address)
    tryFill('state',         data.state)
    tryFill('district',      data.district)
    tryFill('pincode',       data.pincode)
    tryFill('gst_status',    data.gst_status)
    tryFill('business_type', data.business_type)
    tryFill('gst_reg_date',  data.registration_date)
    tryFill('pan_no',        data.pan)
    fill.gst_verified     = !warning
    fill.gst_verified_at  = data.verified_at
    fill.gst_api_response = data.raw

    if (!form.name.trim() && data.legal_name) {
      fill.name = data.legal_name
      filled.add('name')
    }

    setForm(f => ({ ...f, ...fill }))
    setAutoFilled(filled)

    if (warning) {
      showToast(`State: ${data.state || '—'} · PAN: ${data.pan || '—'} auto-filled — enter company details manually`, 'warn')
    } else {
      const isActive = (data.gst_status || '').toLowerCase().includes('active')
      showToast(
        isActive
          ? `GST Verified ✓ — ${data.legal_name || data.gstin}`
          : `GST ${data.gst_status} — ${data.legal_name || data.gstin}`,
        isActive ? 'success' : 'warn'
      )
    }

    setTimeout(() => setAutoFilled(new Set()), 2500)
  }

  const handleGSTDuplicate = (msg) => {
    setDupWarning(msg)
    showToast(msg, 'warn')
  }

  const inpAuto = (key) =>
    `${inp} ${autoFilled.has(key) ? 'bg-green-50 border-green-400 transition-colors duration-700' : ''}`

  const save = async () => {
    if (!form.name.trim()) { setError('Company name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form }
      if (vendor?.id) await updateHireVendor(vendor.id, payload)
      else            await createHireVendor(payload)
      onSaved()
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to save'
      if (e.response?.status === 409) setError(msg)
      else setError(msg)
    } finally { setSaving(false) }
  }

  const isActive    = (form.gst_status || '').toLowerCase().includes('active')
  const isCancelled = (form.gst_status || '').toLowerCase().includes('cancel')

  return (
    <>
      <Modal title={vendor ? `Edit Vendor — ${vendor.name}` : 'New Vendor'} onClose={onClose} wide>
        <div className="p-5 space-y-6">

          {/* ── Section 1: GST Verification ─────────────────────────────── */}
          <section>
            <p className={`${lbl} mb-3`}>GST Verification</p>

            <GSTVerifyField
              value={form.gst_no}
              onChange={setV('gst_no')}
              onVerified={handleGSTVerified}
              onDuplicate={handleGSTDuplicate}
              existingId={vendor?.id || null}
              disabled={saving}
            />

            {dupWarning && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                {dupWarning}
              </p>
            )}

            {/* GST info card — shown after verification */}
            {gstCard && (
              <div className={`mt-3 rounded-xl border p-4 flex items-start gap-4 transition-all
                ${isActive    ? 'bg-green-50 border-green-200' :
                  isCancelled ? 'bg-red-50 border-red-200'     : 'bg-amber-50 border-amber-200'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                  ${isActive ? 'bg-green-100' : isCancelled ? 'bg-red-100' : 'bg-amber-100'}`}>
                  {isActive
                    ? <ShieldCheck size={20} className="text-green-600" />
                    : <ShieldX     size={20} className={isCancelled ? 'text-red-500' : 'text-amber-500'} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm text-gray-900 truncate">
                      {gstCard.legal_name || '—'}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border
                      ${isActive    ? 'bg-green-100 text-green-700 border-green-300' :
                        isCancelled ? 'bg-red-100 text-red-700 border-red-300'       : 'bg-amber-100 text-amber-700 border-amber-300'}`}>
                      {gstCard.gst_status || 'Unknown'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600">
                    {gstCard.trade_name    && <span>Trade Name: <strong>{gstCard.trade_name}</strong></span>}
                    {gstCard.business_type && <span>Type: <strong>{gstCard.business_type}</strong></span>}
                    {gstCard.pan           && <span>PAN: <strong className="font-mono">{gstCard.pan}</strong></span>}
                    {gstCard.registration_date && (
                      <span>Registered: <strong>{new Date(gstCard.registration_date).toLocaleDateString('en-IN')}</strong></span>
                    )}
                    {gstCard.state         && <span>State: <strong>{gstCard.state}</strong></span>}
                    {gstCard.verified_at   && (
                      <span className={isCancelled ? 'text-red-500' : 'text-green-600'}>
                        Verified: {new Date(gstCard.verified_at).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── Section 2: Company Details ───────────────────────────────── */}
          <section>
            <p className={`${lbl} mb-3`}>Company Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Legal / Company Name *</label>
                <input className={inpAuto('name')} value={form.name} onChange={set('name')} placeholder="As per GST registration" />
              </div>
              <div>
                <label className={lbl}>Trade Name</label>
                <input className={inpAuto('trade_name')} value={form.trade_name} onChange={set('trade_name')} placeholder="Brand / trade name" />
              </div>
              <div>
                <label className={lbl}>Contact Person</label>
                <input className={inp} value={form.contact_person} onChange={set('contact_person')} />
              </div>
              <div>
                <label className={lbl}>Phone</label>
                <input className={inp} value={form.phone} onChange={set('phone')} />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Email</label>
                <input type="email" className={inp} value={form.email} onChange={set('email')} />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Address</label>
                <textarea rows={2} className={inpAuto('address')} value={form.address} onChange={set('address')} />
              </div>
              <div>
                <label className={lbl}>State</label>
                <input className={inpAuto('state')} value={form.state} onChange={set('state')} />
              </div>
              <div>
                <label className={lbl}>District</label>
                <input className={inpAuto('district')} value={form.district} onChange={set('district')} />
              </div>
              <div>
                <label className={lbl}>Pincode</label>
                <input className={inpAuto('pincode')} value={form.pincode} onChange={set('pincode')} maxLength={6} />
              </div>
              <div>
                <label className={lbl}>PAN Number</label>
                <input className={`${inpAuto('pan_no')} font-mono`} value={form.pan_no} onChange={set('pan_no')}
                  placeholder="Auto-extracted from GSTIN" />
              </div>
              <div>
                <label className={lbl}>Business Constitution</label>
                <input className={inpAuto('business_type')} value={form.business_type} onChange={set('business_type')}
                  placeholder="Pvt Ltd / Partnership…" />
              </div>
              <div>
                <label className={lbl}>GST Registration Date</label>
                <input type="date" className={inpAuto('gst_reg_date')} value={form.gst_reg_date || ''} onChange={set('gst_reg_date')} />
              </div>
            </div>
          </section>

          {/* ── Section 3: Bank Details ──────────────────────────────────── */}
          <section>
            <p className={`${lbl} mb-3`}>Bank Details</p>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={lbl}>Bank Name</label><input className={inp} value={form.bank_name} onChange={set('bank_name')} /></div>
              <div><label className={lbl}>Account No</label><input className={inp} value={form.bank_account} onChange={set('bank_account')} /></div>
              <div><label className={lbl}>IFSC Code</label><input className={`${inp} font-mono`} value={form.bank_ifsc} onChange={set('bank_ifsc')} /></div>
            </div>
          </section>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2"><AlertCircle size={14}/>{error}</p>}

          <div className="flex gap-3 pb-2">
            <button onClick={save} disabled={saving}
              className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
              {saving ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin"/>Saving…</span> : 'Save Vendor'}
            </button>
            <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
          </div>

        </div>
      </Modal>
      <Toast toast={toast} />
    </>
  )
}

// ── WO ITEM ROW ───────────────────────────────────────────────────────────────

function ItemRow({ item, machines, onChange, onRemove }) {
  const set = k => e => {
    const updated = { ...item, [k]: e.target.value }
    if (['quantity','rate'].includes(k)) {
      updated.amount = ((parseFloat(updated.quantity)||0) * (parseFloat(updated.rate)||0)).toFixed(2)
    }
    onChange(updated)
  }
  return (
    <div className="grid grid-cols-12 gap-2 items-start">
      <div className="col-span-4">
        <select className={inp} value={item.machine_id || ''} onChange={e => {
          const m = machines.find(m => String(m.id) === e.target.value)
          onChange({ ...item, machine_id: e.target.value || null,
            equipment_desc: m ? `${m.eq_type}${m.capacity ? ` (${m.capacity})` : ''} — ${m.slno}` : item.equipment_desc })
        }}>
          <option value="">— select machine or type below —</option>
          {machines.map(m => <option key={m.id} value={m.id}>{m.slno} · {m.eq_type}{m.reg_no ? ` (${m.reg_no})` : ''}</option>)}
        </select>
        <input className={`${inp} mt-1`} placeholder="Equipment description *" value={item.equipment_desc} onChange={set('equipment_desc')} />
      </div>
      <div className="col-span-1"><input type="number" className={inp} placeholder="Qty" value={item.quantity} onChange={set('quantity')} /></div>
      <div className="col-span-1"><input className={inp} placeholder="Unit" value={item.unit} onChange={set('unit')} /></div>
      <div className="col-span-2"><input type="number" className={inp} placeholder="Rate" value={item.rate} onChange={set('rate')} /></div>
      <div className="col-span-2">
        <select className={inp} value={item.rate_type} onChange={set('rate_type')}>
          <option value="per_month">Per Month</option>
          <option value="per_day">Per Day</option>
          <option value="per_hour">Per Hour</option>
          <option value="lump_sum">Lump Sum</option>
        </select>
      </div>
      <div className="col-span-1"><input readOnly className={`${inp} bg-gray-50 text-gray-600`} value={item.amount} /></div>
      <div className="col-span-1 pt-2">
        <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 p-1"><X size={15} /></button>
      </div>
    </div>
  )
}

// ── CREATE / EDIT WO MODAL ────────────────────────────────────────────────────

const blankItem = () => ({ machine_id: null, equipment_desc: '', quantity: 1, unit: 'No.', rate: '', rate_type: 'per_month', amount: '0' })

const PRESET_TERMS = [
  { id: 1,  text: 'Hire charges shall be paid monthly on submission of bills duly certified by the Site Engineer.' },
  { id: 2,  text: 'The equipment shall be maintained by the vendor in good working condition at all times.' },
  { id: 3,  text: 'Fuel and lubricants shall be supplied by RVR Projects Pvt Ltd.' },
  { id: 4,  text: 'Operator / Driver charges are to be borne by the vendor unless otherwise agreed in writing.' },
  { id: 5,  text: 'The work order is valid for the tenure specified and subject to site conditions and availability of work.' },
  { id: 6,  text: 'Either party may terminate this work order with 15 days written notice.' },
  { id: 7,  text: 'The vendor shall not sublet or transfer this work order to any third party without prior written consent.' },
  { id: 8,  text: 'Disputes arising out of this work order shall be resolved as per the Indian Arbitration and Conciliation Act.' },
  { id: 9,  text: 'The equipment shall be deployed only at the project site mentioned herein and for the work specified.' },
  { id: 10, text: 'Idle charges shall not be payable unless specifically agreed in writing.' },
  { id: 11, text: 'The vendor shall ensure all statutory compliances including insurance, fitness certificate, and PUC for the equipment.' },
  { id: 12, text: 'Hours / measurements shall be as certified by the authorised Site Engineer of RVR Projects Pvt Ltd.' },
  { id: 13, text: 'RVR Projects Pvt Ltd reserves the right to reduce or terminate the work order without any compensation if site work is stalled.' },
  { id: 14, text: 'Any damage to equipment due to negligence of RVR Projects Pvt Ltd staff shall be compensated as mutually agreed.' },
  { id: 15, text: 'The vendor shall submit invoices within 7 days of the end of each billing cycle.' },
]

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

function WOModal({ wo, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    wo_date: wo?.wo_date?.slice(0,10) || today,
    indent_number: wo?.indent_number || '',
    vendor_offer_no: wo?.vendor_offer_no || '',
    vendor_id: wo?.vendor_id || '',
    project_id: wo?.project_id || '',
    start_date: wo?.start_date?.slice(0,10) || '',
    end_date: wo?.end_date?.slice(0,10) || '',
    tenure_months: wo?.tenure_months || '',
  })
  const [selectedTermIds, setSelectedTermIds] = useState(new Set())
  const [customTerms,     setCustomTerms]     = useState(wo?.terms_conditions || '')
  const [items,    setItems]    = useState([])
  const [vendors,  setVendors]  = useState([])
  const [projects, setProjects] = useState([])
  const [machines, setMachines] = useState([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const toggleTerm = id => setSelectedTermIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  useEffect(() => {
    Promise.all([getHireVendors(), getProjects()]).then(([v, p]) => {
      setVendors(v.data.data)
      setProjects(p.data.data)
    })
    if (wo?.items) setItems(wo.items.map(i => ({ ...i, amount: String(i.amount) })))
    else           setItems([blankItem()])
  }, [])

  useEffect(() => {
    if (!form.project_id) { setMachines([]); return }
    const proj = projects.find(p => String(p.id) === String(form.project_id))
    if (proj) getMachines({ project_code: proj.code }).then(r => setMachines(r.data.data))
  }, [form.project_id, projects])

  useEffect(() => {
    if (form.start_date && form.end_date) {
      const ms = new Date(form.end_date) - new Date(form.start_date)
      const months = (ms / (1000 * 60 * 60 * 24 * 30.44)).toFixed(1)
      if (months > 0) setForm(f => ({ ...f, tenure_months: months }))
    }
  }, [form.start_date, form.end_date])

  const setF   = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const total  = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const addItem = () => setItems(prev => [...prev, blankItem()])
  const updateItem = (idx, val) => setItems(prev => prev.map((it, i) => i === idx ? val : it))
  const removeItem = idx => setItems(prev => prev.filter((_, i) => i !== idx))

  const buildTerms = () => {
    const presetLines = PRESET_TERMS.filter(t => selectedTermIds.has(t.id)).map(t => t.text)
    const customLines = customTerms.trim().split('\n').map(l => l.trim()).filter(Boolean).map(l => l.replace(/^\d+\.\s*/,''))
    const all = [...presetLines, ...customLines]
    return all.map((t, i) => `${i+1}. ${t}`).join('\n')
  }

  const previewTerms = buildTerms()

  const save = async () => {
    if (!form.vendor_id)  { setError('Select a vendor'); return }
    if (!form.project_id) { setError('Select a project'); return }
    if (items.every(i => !i.equipment_desc.trim())) { setError('Add at least one equipment item'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, terms_conditions: buildTerms(), items: items.filter(i => i.equipment_desc.trim()) }
      if (wo?.id) await updateHireWorkOrder(wo.id, payload)
      else        await createHireWorkOrder(payload)
      onSaved()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={wo ? `Edit WO — ${wo.wo_number}` : 'New Hire Work Order'} onClose={onClose} wide>
      <div className="p-5 space-y-6">

        {/* Basic Info */}
        <section>
          <p className={`${lbl} mb-3`}>Work Order Details</p>
          <div className="grid grid-cols-3 gap-4">
            {wo && <div><label className={lbl}>WO Number</label><input readOnly className={`${inp} bg-gray-50`} value={wo.wo_number} /></div>}
            <div><label className={lbl}>WO Date *</label><input type="date" className={inp} value={form.wo_date} onChange={setF('wo_date')} /></div>
            <div><label className={lbl}>Indent Number</label><input className={inp} value={form.indent_number} onChange={setF('indent_number')} placeholder="Optional" /></div>
            <div><label className={lbl}>Vendor Offer No</label><input className={inp} value={form.vendor_offer_no} onChange={setF('vendor_offer_no')} placeholder="Vendor's quotation / offer ref." /></div>
            <div>
              <label className={lbl}>Vendor *</label>
              <select className={inp} value={form.vendor_id} onChange={setF('vendor_id')}>
                <option value="">— select vendor —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Project *</label>
              <select className={inp} value={form.project_id} onChange={setF('project_id')}>
                <option value="">— select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.code}{p.name ? ` — ${p.name}` : ''}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Tenure */}
        <section>
          <p className={`${lbl} mb-3`}>Tenure</p>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={lbl}>Start Date</label><input type="date" className={inp} value={form.start_date} onChange={setF('start_date')} /></div>
            <div><label className={lbl}>End Date</label><input type="date" className={inp} value={form.end_date} onChange={setF('end_date')} /></div>
            <div><label className={lbl}>Tenure (Months)</label><input type="number" step="0.5" className={inp} value={form.tenure_months} onChange={setF('tenure_months')} placeholder="Auto-calculated" /></div>
          </div>
        </section>

        {/* Equipment Items */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className={lbl}>Equipment / Machinery</p>
            <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-sm text-blue-700 font-medium hover:text-blue-900">
              <Plus size={14} />Add Row
            </button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
              <div className="col-span-4">Equipment</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-1">Unit</div>
              <div className="col-span-2">Rate</div>
              <div className="col-span-2">Rate Type</div>
              <div className="col-span-1">Amount</div>
              <div className="col-span-1"></div>
            </div>
            {items.map((item, idx) => (
              <ItemRow key={idx} item={item} machines={machines}
                onChange={val => updateItem(idx, val)}
                onRemove={() => removeItem(idx)} />
            ))}
          </div>
          <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
            <p className="text-sm font-bold text-gray-800">Total Value: <span className="text-blue-700">{fmtMoney(total)}</span></p>
          </div>
        </section>

        {/* Terms & Conditions */}
        <section>
          <p className={`${lbl} mb-3`}>Terms &amp; Conditions</p>
          <div className="grid grid-cols-2 gap-4">

            {/* Left: preset checkboxes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">Select standard clauses:</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setSelectedTermIds(new Set(PRESET_TERMS.map(t => t.id)))}
                    className="text-xs text-blue-600 hover:underline">All</button>
                  <button type="button" onClick={() => setSelectedTermIds(new Set())}
                    className="text-xs text-gray-400 hover:underline">None</button>
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {PRESET_TERMS.map(t => (
                  <label key={t.id} className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-colors hover:bg-blue-50 ${selectedTermIds.has(t.id) ? 'bg-blue-50' : ''}`}>
                    <input type="checkbox" checked={selectedTermIds.has(t.id)} onChange={() => toggleTerm(t.id)}
                      className="mt-0.5 w-4 h-4 accent-blue-600 flex-shrink-0" />
                    <span className="text-xs text-gray-700 leading-relaxed">{t.text}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Right: custom / additional terms + preview */}
            <div className="flex flex-col gap-3">
              <div className="flex-1">
                <p className="text-xs text-gray-500 font-medium mb-2">Additional / custom terms:</p>
                <textarea rows={6} className={inp}
                  value={customTerms} onChange={e => setCustomTerms(e.target.value)}
                  placeholder="Enter any additional clauses here…&#10;(existing WO terms are pre-loaded above)" />
              </div>

              {/* Live preview */}
              {previewTerms && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Preview ({previewTerms.split('\n').length} clause{previewTerms.split('\n').length !== 1 ? 's' : ''})
                  </p>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {previewTerms.split('\n').map((line, i) => (
                      <p key={i} className="text-xs text-gray-600">{line}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3 pb-2">
          <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
            {saving ? 'Saving…' : wo ? 'Update Work Order' : 'Create Work Order'}
          </button>
          <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}

// ── APPROVAL / DETAIL MODAL ───────────────────────────────────────────────────

function ApprovalRow({ level, approvedBy, approvedAt, remarks, status }) {
  const colors = { approved: 'text-green-600', rejected: 'text-red-600', pending: 'text-gray-400' }
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
        ${status === 'approved' ? 'bg-green-100 text-green-700' : status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-400'}`}>
        {level}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">Level {level} Approval</p>
        {approvedBy && <p className="text-xs text-gray-500">{approvedBy} · {fmtDate(approvedAt)}</p>}
        {remarks    && <p className="text-xs text-gray-500 mt-0.5 italic">"{remarks}"</p>}
        {!approvedBy && <p className="text-xs text-gray-400">Pending</p>}
      </div>
      <span className={`text-xs font-semibold capitalize ${colors[status] || colors.pending}`}>{status}</span>
    </div>
  )
}

function WODetailModal({ woId, onClose, onAction }) {
  const { isAdmin } = useAuth()
  const [wo,       setWo]      = useState(null)
  const [loading,  setLoading] = useState(true)
  const [remarks,  setRemarks] = useState('')
  const [actErr,   setActErr]  = useState('')
  const [acting,   setActing]  = useState('')

  const load = () => {
    setLoading(true)
    getHireWorkOrder(woId).then(r => { setWo(r.data.data); setLoading(false) })
  }
  useEffect(load, [woId])

  const action = async (fn, label) => {
    setActing(label); setActErr('')
    try {
      await fn()
      load()
      onAction && onAction()
    } catch (e) {
      setActErr(e.response?.data?.error || 'Action failed')
    } finally { setActing('') }
  }

  if (loading) return (
    <Modal title="Work Order Detail" onClose={onClose} wide>
      <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-blue-600" /></div>
    </Modal>
  )

  const { items = [] } = wo

  const l1Status  = wo.l1_approved_by ? 'approved' : wo.status === 'rejected' && !wo.approved_by ? 'rejected' : 'pending'
  const l2Status  = wo.approved_by ? 'approved' : wo.status === 'rejected' && wo.l1_approved_by ? 'rejected' : 'pending'

  return (
    <Modal title={`Work Order — ${wo.wo_number}`} onClose={onClose} wide>
      <div className="p-5 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-lg font-bold text-gray-900">{wo.wo_number}</span>
              <Badge status={wo.status} />
              {wo.renewal_count > 0 && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Renewal #{wo.renewal_count}</span>}
            </div>
            <p className="text-sm text-gray-500">
              Date: {fmtDate(wo.wo_date)}
              {wo.indent_number    && <> · Indent: {wo.indent_number}</>}
              {wo.vendor_offer_no  && <> · Vendor Offer: <span className="font-medium text-gray-700">{wo.vendor_offer_no}</span></>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-blue-700">{fmtMoney(wo.total_value)}</p>
            <p className="text-xs text-gray-400">Total Value</p>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase">Vendor</p>
            <p className="font-semibold text-gray-900">{wo.vendor_name}</p>
            {wo.vendor_contact && <p className="text-gray-500">{wo.vendor_contact}</p>}
            {wo.vendor_phone   && <p className="text-gray-500">{wo.vendor_phone}</p>}
            {wo.vendor_gst     && <p className="text-gray-500">GST: {wo.vendor_gst}</p>}
          </div>
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase">Project &amp; Tenure</p>
            <p className="font-semibold text-gray-900">{wo.project_code} {wo.project_name ? `— ${wo.project_name}` : ''}</p>
            <p className="text-gray-500">Start: {fmtDate(wo.start_date)}</p>
            <p className="text-gray-500">End: {fmtDate(wo.end_date)}</p>
            {wo.tenure_months && <p className="text-gray-500">Tenure: {wo.tenure_months} months</p>}
          </div>
        </div>

        {/* Items table */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Equipment Items</p>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Equipment</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it, i) => (
                  <tr key={it.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500">{i+1}</td>
                    <td className="px-3 py-2 text-gray-900">{it.equipment_desc}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{it.quantity} {it.unit}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmtMoney(it.rate)}</td>
                    <td className="px-3 py-2 text-gray-500 capitalize">{it.rate_type?.replace('_',' ')}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtMoney(it.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-blue-50 font-bold">
                  <td colSpan={5} className="px-3 py-2 text-right text-gray-700">Total</td>
                  <td className="px-3 py-2 text-right text-blue-700">{fmtMoney(wo.total_value)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Terms */}
        {wo.terms_conditions && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Terms &amp; Conditions</p>
            <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 whitespace-pre-wrap border border-gray-100">{wo.terms_conditions}</pre>
          </div>
        )}

        {/* Approval Trail */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Approval Trail</p>
          <div className="space-y-2">
            <ApprovalRow level={1} approvedBy={wo.l1_approved_by_name} approvedAt={wo.l1_approved_at} remarks={wo.l1_remarks} status={l1Status} />
            <ApprovalRow level={2} approvedBy={wo.approved_by_name}    approvedAt={wo.approved_at}    remarks={wo.approved_remarks} status={l2Status} />
          </div>
          {wo.rejected_remarks && (
            <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <span className="font-semibold">Rejection: </span>{wo.rejected_remarks}
            </div>
          )}
        </div>

        {/* Admin action remarks */}
        {isAdmin && ['submitted', 'l1_approved'].includes(wo.status) && (
          <div>
            <label className={lbl}>Remarks (optional for approval / required for rejection)</label>
            <textarea rows={2} className={inp} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Enter remarks…" />
          </div>
        )}

        {actErr && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{actErr}</p>}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          {/* Submit */}
          {['draft','rejected'].includes(wo.status) && (
            <button onClick={() => action(() => submitHireWorkOrder(wo.id), 'submit')} disabled={acting === 'submit'}
              className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {acting==='submit' ? <Loader2 size={14} className="animate-spin"/> : <FileCheck size={14}/>} Submit for Approval
            </button>
          )}
          {/* L1 Approve */}
          {isAdmin && wo.status === 'submitted' && (
            <button onClick={() => action(() => approveHireWOL1(wo.id, { remarks }), 'l1')} disabled={acting === 'l1'}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {acting==='l1' ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>} L1 Approve
            </button>
          )}
          {/* Final Approve */}
          {isAdmin && wo.status === 'l1_approved' && (
            <button onClick={() => action(() => approveHireWOFinal(wo.id, { remarks }), 'final')} disabled={acting === 'final'}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {acting==='final' ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>} Final Approve
            </button>
          )}
          {/* Reject */}
          {isAdmin && ['submitted','l1_approved'].includes(wo.status) && (
            <button onClick={() => action(() => rejectHireWorkOrder(wo.id, { remarks }), 'reject')} disabled={acting === 'reject'}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {acting==='reject' ? <Loader2 size={14} className="animate-spin"/> : <XCircle size={14}/>} Reject
            </button>
          )}
          {/* Download */}
          <button onClick={() => downloadWOPDF(wo)} className="flex items-center gap-1.5 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg">
            <FileText size={14} /> PDF
          </button>
          <button onClick={() => downloadWOWord(wo)} className="flex items-center gap-1.5 border border-blue-300 text-blue-700 hover:bg-blue-50 text-sm font-medium px-4 py-2 rounded-lg">
            <Download size={14} /> Word
          </button>
        </div>

      </div>
    </Modal>
  )
}

// ── DOWNLOAD FUNCTIONS ────────────────────────────────────────────────────────

function woHtml(wo, logoSrc) {
  const isApproved = wo.status === 'approved'
  const { items = [] } = wo
  const rows = items.map((it, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${it.equipment_desc || ''}</td>
      <td style="text-align:right">${it.quantity} ${it.unit}</td>
      <td style="text-align:right">₹ ${Number(it.rate).toLocaleString('en-IN')}</td>
      <td>${(it.rate_type||'').replace('_',' ')}</td>
      <td style="text-align:right;font-weight:600">₹ ${Number(it.amount).toLocaleString('en-IN')}</td>
    </tr>`).join('')

  const terms = (wo.terms_conditions || '').split('\n').map(l => `<p style="margin:2px 0;font-size:11px">${l}</p>`).join('')

  return `
  <html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#222;margin:30px;position:relative}
    h1{font-size:16px;margin:0}
    h2{font-size:13px;margin:0 0 4px}
    table{width:100%;border-collapse:collapse;margin:8px 0}
    th,td{border:1px solid #ccc;padding:5px 8px;font-size:11px}
    th{background:#1e3a5f;color:#fff;font-weight:600}
    .header{background:#1e3a5f;color:#fff;padding:16px;margin:-30px -30px 20px;display:flex;align-items:center;gap:16px}
    .header-logo{height:40px;width:auto;flex-shrink:0}
    .header-text{flex:1;text-align:center}
    .draft-watermark{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);
      font-size:90px;font-weight:900;color:rgba(200,200,200,0.35);white-space:nowrap;pointer-events:none;z-index:9999;
      font-family:Arial,sans-serif;letter-spacing:8px}
    .badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:10px;font-weight:700;
      background:#d1fae5;color:#065f46}
    .draft-badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:10px;font-weight:700;
      background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
    .section{margin:16px 0}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 0}
    .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px}
    .label{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
    .total-row td{background:#eff6ff;font-weight:700;font-size:12px}
    .approval{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
    .ap-box{border:1px solid #e2e8f0;border-radius:6px;padding:10px;text-align:center}
    .footer{margin-top:40px;font-size:10px;color:#888;text-align:center}
  </style></head><body>
    ${!isApproved ? '<div class="draft-watermark">DRAFT COPY</div>' : ''}
    <div class="header">
      ${isApproved && logoSrc ? `<img src="${logoSrc}" class="header-logo" alt="RVR" />` : ''}
      <div class="header-text">
        <h1>RVR PROJECTS PVT LTD</h1>
        <p style="margin:4px 0;font-size:12px">HIRE WORK ORDER</p>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <p><b>WO Number:</b> ${wo.wo_number}</p>
        <p><b>WO Date:</b> ${fmtDate(wo.wo_date)}</p>
        ${wo.indent_number   ? `<p><b>Indent No:</b> ${wo.indent_number}</p>` : ''}
        ${wo.vendor_offer_no ? `<p><b>Vendor Offer No:</b> ${wo.vendor_offer_no}</p>` : ''}
      </div>
      <span class="${isApproved ? 'badge' : 'draft-badge'}">${(STATUS_META[wo.status]||{label:wo.status}).label}</span>
    </div>

    <div class="grid">
      <div class="box">
        <p class="label">Vendor</p>
        <p><b>${wo.vendor_name || '—'}</b></p>
        ${wo.vendor_contact ? `<p>${wo.vendor_contact}</p>` : ''}
        ${wo.vendor_phone   ? `<p>${wo.vendor_phone}</p>` : ''}
        ${wo.vendor_gst     ? `<p>GST: ${wo.vendor_gst}</p>` : ''}
      </div>
      <div class="box">
        <p class="label">Project &amp; Tenure</p>
        <p><b>${wo.project_code || ''}${wo.project_name ? ' — '+wo.project_name : ''}</b></p>
        <p>Start: ${fmtDate(wo.start_date)}</p>
        <p>End: ${fmtDate(wo.end_date)}</p>
        ${wo.tenure_months ? `<p>Tenure: ${wo.tenure_months} months</p>` : ''}
      </div>
    </div>

    <div class="section">
      <h2>Equipment / Machinery</h2>
      <table>
        <thead><tr>
          <th>#</th><th>Equipment</th><th>Qty</th><th>Rate</th><th>Rate Type</th><th>Amount</th>
        </tr></thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="5" style="text-align:right">TOTAL VALUE</td>
            <td style="text-align:right">₹ ${Number(wo.total_value).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${wo.terms_conditions ? `
    <div class="section">
      <h2>Terms &amp; Conditions</h2>
      ${terms}
    </div>` : ''}

    <div class="approval">
      <div class="ap-box">
        <p class="label">Prepared By</p>
        <p style="margin-top:30px;border-top:1px solid #ccc;padding-top:4px">${wo.created_by_name || ''}</p>
      </div>
      <div class="ap-box">
        <p class="label">L1 Approved By</p>
        <p style="margin-top:30px;border-top:1px solid #ccc;padding-top:4px">${wo.l1_approved_by_name || ''}</p>
      </div>
      <div class="ap-box">
        <p class="label">Final Approved By</p>
        <p style="margin-top:30px;border-top:1px solid #ccc;padding-top:4px">${wo.approved_by_name || ''}</p>
      </div>
      <div class="ap-box">
        <p class="label">Vendor Signature</p>
        <p style="margin-top:30px;border-top:1px solid #ccc;padding-top:4px">&nbsp;</p>
      </div>
    </div>

    <div class="footer">Generated by RVR DPR &amp; Utilization System · ${new Date().toLocaleString('en-IN')}</div>
  </body></html>`
}

async function downloadWOPDF(wo) {
  const { jsPDF }             = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw         = doc.internal.pageSize.getWidth()
  const ph         = doc.internal.pageSize.getHeight()
  const isApproved = wo.status === 'approved'

  const logoData = isApproved ? await fetchLogoBase64() : null

  // header bar
  doc.setFillColor(30, 58, 95)
  doc.rect(0, 0, pw, 22, 'F')
  if (logoData) {
    try { doc.addImage(logoData, 'PNG', 6, 3, 36, 16) } catch {}
  }
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(255,255,255)
  doc.text('RVR PROJECTS PVT LTD', pw/2, 9, { align:'center' })
  doc.setFontSize(9); doc.setFont('helvetica','normal')
  doc.text('HIRE WORK ORDER', pw/2, 15, { align:'center' })

  let y = 28
  doc.setTextColor(0); doc.setFontSize(9)
  doc.setFont('helvetica','bold')
  doc.text(`WO No: ${wo.wo_number}`, 14, y)
  doc.text(`Date: ${fmtDate(wo.wo_date)}`, pw-14, y, { align:'right' })
  y += 5
  doc.setFont('helvetica','normal')
  const infoLine = [
    wo.indent_number   ? `Indent: ${wo.indent_number}` : null,
    wo.vendor_offer_no ? `Vendor Offer: ${wo.vendor_offer_no}` : null,
    `Status: ${(STATUS_META[wo.status]||{label:wo.status}).label}`,
  ].filter(Boolean).join('   |   ')
  doc.text(infoLine, 14, y)
  y += 8

  doc.setFillColor(248,250,252); doc.rect(10, y-2, (pw-20)/2-2, 22, 'F')
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,116,139)
  doc.text('VENDOR', 14, y+2)
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30); doc.setFontSize(8.5)
  doc.text(wo.vendor_name || '—', 14, y+7)
  if (wo.vendor_phone) doc.text(wo.vendor_phone, 14, y+12)
  if (wo.vendor_gst)   doc.text(`GST: ${wo.vendor_gst}`, 14, y+17)

  const col2 = pw/2 + 4
  doc.setFillColor(248,250,252); doc.rect(col2-4, y-2, (pw-20)/2, 22, 'F')
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,116,139)
  doc.text('PROJECT & TENURE', col2, y+2)
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30); doc.setFontSize(8.5)
  doc.text(`${wo.project_code || ''}`, col2, y+7)
  doc.text(`${fmtDate(wo.start_date)} — ${fmtDate(wo.end_date)}`, col2, y+12)
  if (wo.tenure_months) doc.text(`${wo.tenure_months} months`, col2, y+17)
  y += 28

  autoTable(doc, {
    startY: y,
    head: [['#','Equipment','Qty','Rate','Rate Type','Amount']],
    body: [
      ...(wo.items||[]).map((it,i) => [
        i+1, it.equipment_desc, `${it.quantity} ${it.unit}`,
        `₹ ${Number(it.rate).toLocaleString('en-IN')}`,
        (it.rate_type||'').replace('_',' '),
        `₹ ${Number(it.amount).toLocaleString('en-IN',{minimumFractionDigits:2})}`,
      ]),
      [{ content:'TOTAL', colSpan:5, styles:{ fontStyle:'bold', halign:'right', fillColor:[239,246,255] } },
       { content:`₹ ${Number(wo.total_value).toLocaleString('en-IN',{minimumFractionDigits:2})}`, styles:{ fontStyle:'bold', fillColor:[239,246,255], textColor:[30,82,212] } }],
    ],
    styles:{ fontSize:8, cellPadding:2 },
    headStyles:{ fillColor:[30,58,95], textColor:255, fontStyle:'bold', fontSize:8 },
    alternateRowStyles:{ fillColor:[248,250,252] },
    margin:{ left:10, right:10 },
  })

  y = doc.lastAutoTable.finalY + 8
  if (wo.terms_conditions && y < 220) {
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(0)
    doc.text('Terms & Conditions', 14, y); y += 5
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(60)
    const lines = doc.splitTextToSize(wo.terms_conditions, pw-28)
    doc.text(lines, 14, y)
    y += lines.length * 3.5 + 6
  }

  // Signature boxes
  if (y > 250) { doc.addPage(); y = 20 }
  const boxW = (pw-20)/4, sigY = y + 16
  const sigNames = ['Prepared By','L1 Approved By','Final Approved By','Vendor Signature']
  const sigVals  = [wo.created_by_name||'', wo.l1_approved_by_name||'', wo.approved_by_name||'', '']
  sigNames.forEach((name, i) => {
    const x = 10 + i * boxW
    doc.setDrawColor(200); doc.rect(x, y, boxW-2, 22)
    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(100,116,139)
    doc.text(name, x + (boxW-2)/2, y+5, { align:'center' })
    doc.setDrawColor(180); doc.line(x+4, sigY, x+boxW-6, sigY)
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(30)
    doc.text(sigVals[i], x + (boxW-2)/2, y+20, { align:'center' })
  })

  // DRAFT watermark on every page for non-approved copies
  if (!isApproved) {
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(58)
      doc.setTextColor(210, 210, 210)
      doc.text('DRAFT COPY', pw / 2, ph / 2, { align: 'center', angle: 45 })
    }
  }

  doc.save(`WO_${wo.wo_number.replace(/\//g,'-')}.pdf`)
}

async function downloadWOWord(wo) {
  const isApproved = wo.status === 'approved'
  const logoData   = isApproved ? await fetchLogoBase64() : null
  const html = woHtml(wo, logoData)
  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `WO_${wo.wo_number.replace(/\//g,'-')}.doc`; a.click()
  URL.revokeObjectURL(url)
}

// ── VENDORS TAB ───────────────────────────────────────────────────────────────

function VendorsTab() {
  const [vendors,      setVendors]      = useState([])
  const [search,       setSearch]       = useState('')
  const [showModal,    setShowModal]    = useState(false)
  const [editVendor,   setEditVendor]   = useState(null)
  const [loading,      setLoading]      = useState(true)

  const load = () => { setLoading(true); getHireVendors().then(r => { setVendors(r.data.data); setLoading(false) }) }
  useEffect(load, [])

  const filtered = vendors.filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()) || (v.phone||'').includes(search))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…"
            className="border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => { setEditVendor(null); setShowModal(true) }}
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={15} /> New Vendor
        </button>
      </div>

      {loading ? <div className="py-12 text-center text-sm text-gray-400">Loading…</div> : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Vendor Name</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">GSTIN</th>
                <th className="px-4 py-3 text-left">GST Status</th>
                <th className="px-4 py-3 text-left">State</th>
                <th className="px-4 py-3 text-left">Bank</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(v => {
                const gstActive    = (v.gst_status||'').toLowerCase().includes('active')
                const gstCancelled = (v.gst_status||'').toLowerCase().includes('cancel')
                return (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{v.name}</p>
                    {v.trade_name && v.trade_name !== v.name && (
                      <p className="text-xs text-gray-400">{v.trade_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{v.contact_person || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{v.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-700">{v.gst_no || '—'}</span>
                    {v.gst_verified && (
                      <BadgeCheck size={13} className="inline ml-1 text-green-500" title="GST Verified" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {v.gst_status ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border
                        ${gstActive    ? 'bg-green-50 text-green-700 border-green-200' :
                          gstCancelled ? 'bg-red-50 text-red-600 border-red-200'       : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {gstActive ? <ShieldCheck size={10}/> : <ShieldX size={10}/>}
                        {v.gst_status}
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-sm">{v.state || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{v.bank_name ? `${v.bank_name} · ${v.bank_ifsc||''}` : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditVendor(v); setShowModal(true) }}
                      className="text-blue-600 hover:text-blue-800 p-1 mr-1"><Edit2 size={14}/></button>
                  </td>
                </tr>
              )})}

              {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No vendors found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <VendorModal vendor={editVendor} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load() }} />}
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function HireWorkOrders({ defaultTab = 'wo' }) {
  const { isAdmin } = useAuth()
  const [workOrders,  setWorkOrders]  = useState([])
  const [projects,    setProjects]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [filterProj,  setFilterProj]  = useState('')
  const [filterStatus,setFilterStatus]= useState('')
  const [showCreate,  setShowCreate]  = useState(false)
  const [editWO,      setEditWO]      = useState(null)
  const [viewWOId,    setViewWOId]    = useState(null)
  const [renewWO,     setRenewWO]     = useState(null)

  const loadWOs = () => {
    setLoading(true)
    const params = {}
    if (filterProj)   params.project_id = filterProj
    if (filterStatus) params.status     = filterStatus
    getHireWorkOrders(params).then(r => { setWorkOrders(r.data.data); setLoading(false) })
  }

  useEffect(() => { getProjects().then(r => setProjects(r.data.data)) }, [])
  useEffect(loadWOs, [filterProj, filterStatus])

  const filtered = workOrders.filter(w =>
    !search || w.wo_number.toLowerCase().includes(search.toLowerCase()) ||
    (w.vendor_name||'').toLowerCase().includes(search.toLowerCase()) ||
    (w.project_code||'').toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async (wo) => {
    if (!confirm(`Delete WO ${wo.wo_number}?`)) return
    await deleteHireWorkOrder(wo.id); loadWOs()
  }

  // Vendors page — no WO UI
  if (defaultTab === 'vendors') {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-gray-900">Hire Vendors</h1>
        <VendorsTab />
      </div>
    )
  }

  // Work Orders page — no Vendors tab
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">Hire Work Orders</h1>
        <button onClick={() => { setEditWO(null); setShowCreate(true) }}
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={15} /> New Work Order
        </button>
      </div>

      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search WO No, vendor, project…"
              className="border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select value={filterProj} onChange={e => setFilterProj(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Status</option>
            {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={loadWOs} className="p-2 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"><RefreshCw size={15}/></button>
        </div>

          {/* Table */}
          {loading ? <div className="py-16 text-center text-sm text-gray-400">Loading…</div> : (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">WO No</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Vendor</th>
                    <th className="px-4 py-3 text-left">Project</th>
                    <th className="px-4 py-3 text-left">Tenure</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(wo => (
                    <tr key={wo.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-semibold text-blue-700 whitespace-nowrap">
                        {wo.wo_number}
                        {wo.renewal_count > 0 && <span className="ml-1 text-xs text-purple-600">(R{wo.renewal_count})</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(wo.wo_date)}</td>
                      <td className="px-4 py-3 text-gray-900">{wo.vendor_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{wo.project_code || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {fmtDate(wo.start_date)} – {fmtDate(wo.end_date)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{fmtMoney(wo.total_value)}</td>
                      <td className="px-4 py-3"><Badge status={wo.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewWOId(wo.id)} title="View" className="p-1.5 text-gray-500 hover:text-blue-600"><Eye size={15}/></button>
                          {['draft','rejected'].includes(wo.status) && (
                            <button onClick={() => { setEditWO(wo); setShowCreate(true) }} title="Edit" className="p-1.5 text-gray-500 hover:text-blue-600"><Edit2 size={15}/></button>
                          )}
                          {wo.status === 'approved' && (
                            <button onClick={() => setRenewWO(wo)} title="Renew" className="p-1.5 text-gray-500 hover:text-green-600"><RotateCcw size={15}/></button>
                          )}
                          {['draft','rejected'].includes(wo.status) && isAdmin && (
                            <button onClick={() => handleDelete(wo)} title="Delete" className="p-1.5 text-gray-500 hover:text-red-600"><Trash2 size={15}/></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No work orders found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {/* Modals */}
      {showCreate && (
        <WOModal
          wo={editWO ? editWO : null}
          onClose={() => { setShowCreate(false); setEditWO(null) }}
          onSaved={() => { setShowCreate(false); setEditWO(null); loadWOs() }}
        />
      )}
      {viewWOId && (
        <WODetailModal woId={viewWOId} onClose={() => setViewWOId(null)} onAction={loadWOs} />
      )}
      {renewWO && (
        <RenewModal wo={renewWO} onClose={() => setRenewWO(null)} onSaved={() => { setRenewWO(null); loadWOs() }} />
      )}
    </div>
  )
}

// ── RENEW MODAL ───────────────────────────────────────────────────────────────

function RenewModal({ wo, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form,  setForm]  = useState({ start_date: wo.end_date?.slice(0,10) || today, end_date: '', tenure_months: wo.tenure_months || '' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (form.start_date && form.end_date) {
      const months = ((new Date(form.end_date) - new Date(form.start_date)) / (1000*60*60*24*30.44)).toFixed(1)
      if (months > 0) setForm(f => ({ ...f, tenure_months: months }))
    }
  }, [form.start_date, form.end_date])

  const save = async () => {
    if (!form.start_date || !form.end_date) { setError('Start and End dates required'); return }
    setSaving(true); setError('')
    try { await renewHireWorkOrder(wo.id, form); onSaved() }
    catch (e) { setError(e.response?.data?.error || 'Failed'); setSaving(false) }
  }

  return (
    <Modal title={`Renew WO — ${wo.wo_number}`} onClose={onClose}>
      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-600">Creating a renewal work order. Equipment items and terms will be carried forward.</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={lbl}>New Start Date</label><input type="date" className={inp} value={form.start_date} onChange={setF('start_date')} /></div>
          <div><label className={lbl}>New End Date</label><input type="date" className={inp} value={form.end_date} onChange={setF('end_date')} /></div>
          <div><label className={lbl}>Tenure (Months)</label><input type="number" step="0.5" className={inp} value={form.tenure_months} onChange={setF('tenure_months')} /></div>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-3">
          <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
            {saving ? 'Creating…' : 'Create Renewal WO'}
          </button>
          <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}
