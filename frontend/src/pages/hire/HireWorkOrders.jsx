import { useState, useEffect, useRef, Fragment } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getHireVendors, createHireVendor, updateHireVendor, deleteHireVendor,
  getHireWorkOrders, getHireWorkOrder, createHireWorkOrder, updateHireWorkOrder,
  deleteHireWorkOrder, submitHireWorkOrder, approveHireWOL1, approveHireWOFinal,
  rejectHireWorkOrder, renewHireWorkOrder, linkAssetToHireWO, getProjects, getEquipmentTypes,
  getHireIndents, getHireIndent,
  getTermsLibrary, createTermsLibraryItem, updateTermsLibraryItem, deleteTermsLibraryItem,
  getTermsCategories, createTermsCategory, deleteTermsCategory,
  getSignatoryDesignations, createSignatoryDesignation, deleteSignatoryDesignation,
  getSignatories, createSignatory, updateSignatory, deleteSignatory,
  getMachines, getInvoiceRules,
} from '../../lib/api'
import GSTVerifyField from '../../components/GSTVerifyField'
import {
  Plus, Edit2, Trash2, X, Search, Eye, CheckCircle, XCircle,
  FileText, Download, RefreshCw, ChevronDown, ChevronUp, ChevronRight, AlertCircle, Loader2,
  Building2, FileCheck, RotateCcw, ShieldCheck, ShieldX, BadgeCheck,
  ToggleLeft, ToggleRight,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtDate     = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
const fmtDateTime = d => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'
const fmtMoney = v => v != null ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'

// ── COMPANY LETTERHEAD / SIGNATORY (single point to update) ─────────────────

const RVR_COMPANY = {
  name: 'RVR PROJECTS PVT LTD',
  addressLines: ['#9-16-29, C.B.M Compound,', 'Visakhapatnam, Andhra Pradesh - 530003, India'],
  gst: '36AADCR4363H1Z8',
}
const RVR_SIGNATORY = { name: 'R SATYANARAYANA', title: 'DIRECTOR' }

// ── AMOUNT IN WORDS (Indian numbering system) ────────────────────────────────

const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
  'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function twoDigitWords(n) {
  if (n < 20) return ONES[n]
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')
}
function threeDigitWords(n) {
  const h = Math.floor(n / 100), r = n % 100
  return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? twoDigitWords(r) : '')
}
function numberToWordsIndian(num) {
  num = Math.round(Number(num) || 0)
  if (num === 0) return 'Zero'
  const crore = Math.floor(num / 1e7); num %= 1e7
  const lakh  = Math.floor(num / 1e5); num %= 1e5
  const thousand = Math.floor(num / 1e3); num %= 1e3
  const rest  = num
  const parts = []
  if (crore)    parts.push(threeDigitWords(crore) + ' Crore')
  if (lakh)     parts.push(threeDigitWords(lakh) + ' Lakh')
  if (thousand) parts.push(threeDigitWords(thousand) + ' Thousand')
  if (rest)     parts.push(threeDigitWords(rest))
  return parts.join(' ')
}
const amountInWords = v => {
  const n = Number(v)
  if (!n) return ''
  return `Rupees In Words: ${numberToWordsIndian(n)} Rupees Only`
}
const ordinalQty = n => {
  const num = parseInt(n) || 0
  return `${ONES[num] || num} (${String(num).padStart(2, '0')})`
}

// ── ADDITIONAL CONDITIONS: line helpers (shared by picker, editor & document) ─
// Picked library conditions carry their sub-heading (category) encoded as
// "Category::Description" so it can be rendered as a bold heading in the
// generated document and editor. Manually-typed custom lines have no "::"
// and render as plain numbered text (unchanged behaviour).

const conditionLines = text => (text || '').split('\n').map(l => l.trim()).filter(Boolean)
const stripLineNumber = l => l.replace(/^\d+[.)]\s*/, '').trim()
// "\n" is the separator between distinct picked points, so a single condition's
// own text must never contain one — collapse any embedded newlines to spaces.
const singleLine = s => (s || '').replace(/\s*\n\s*/g, ' ').trim()
const encodeConditionLine = (category, description) =>
  category ? `${singleLine(category)}::${singleLine(description)}` : singleLine(description)
const decodeConditionLine = line => {
  const sepIdx = line.indexOf('::')
  return sepIdx >= 0
    ? { category: line.slice(0, sepIdx).trim(), text: line.slice(sepIdx + 2).trim() }
    : { category: null, text: line }
}
const numberedConditions = text => conditionLines(text).map(stripLineNumber).filter(Boolean)
  .map((l, i) => ({ n: i + 1, ...decodeConditionLine(l) }))

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

function ItemRow({ item, equipmentTypes, machines, invoiceRules, onChange, onRemove }) {
  const [machineSearch, setMachineSearch] = useState('')
  const [machineOpen,   setMachineOpen]   = useState(false)

  const set = k => e => {
    const updated = { ...item, [k]: e.target.value }
    if (['quantity','rate'].includes(k)) {
      updated.amount = ((parseFloat(updated.quantity)||0) * (parseFloat(updated.rate)||0)).toFixed(2)
    }
    onChange(updated)
  }

  const selectedMachine   = machines.find(m => m.id === item.machine_id)
  const selectedRule      = invoiceRules.find(r => r.id === parseInt(item.invoice_rule_id))
  const filteredMachines  = machineSearch.trim()
    ? machines.filter(m =>
        (m.slno||'').toLowerCase().includes(machineSearch.toLowerCase()) ||
        (m.nickname||'').toLowerCase().includes(machineSearch.toLowerCase()) ||
        (m.eq_type_name||m.eq_type||'').toLowerCase().includes(machineSearch.toLowerCase())
      )
    : machines.slice(0, 50)

  const pickMachine = (m) => {
    onChange({
      ...item,
      machine_id:    m.id,
      reg_no:        m.slno || item.reg_no,
      equipment_desc:item.equipment_desc || m.nickname || m.slno || '',
      eq_type:       m.eq_type_name || m.eq_type || item.eq_type,
    })
    setMachineOpen(false)
    setMachineSearch('')
  }

  const clearMachine = () => onChange({ ...item, machine_id: null })

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/50">
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-11">
          <input className={inp} placeholder="Equipment description *" value={item.equipment_desc} onChange={set('equipment_desc')} />
        </div>
        <div className="col-span-1 pt-1 text-right">
          <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 p-1"><X size={15} /></button>
        </div>
      </div>

      {/* Machine + Invoice Rule row */}
      <div className="grid grid-cols-2 gap-2">
        {/* Machine picker */}
        <div className="relative">
          <label className="text-[10px] text-gray-400 uppercase">Linked Machine (for DPR)</label>
          {selectedMachine ? (
            <div className="flex items-center gap-1 border border-blue-300 bg-blue-50 rounded-lg px-2 py-1.5">
              <span className="flex-1 text-xs font-medium text-blue-800 truncate">
                {selectedMachine.slno} {selectedMachine.nickname ? `— ${selectedMachine.nickname}` : ''}
              </span>
              <button type="button" onClick={clearMachine} className="text-blue-400 hover:text-blue-700 shrink-0"><X size={11} /></button>
            </div>
          ) : (
            <div>
              <input
                className={`${inp} text-xs`}
                placeholder="Search machine reg no / name…"
                value={machineSearch}
                onFocus={() => setMachineOpen(true)}
                onChange={e => { setMachineSearch(e.target.value); setMachineOpen(true) }}
              />
              {machineOpen && (
                <div className="absolute z-30 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-0.5 max-h-44 overflow-y-auto">
                  {filteredMachines.length === 0
                    ? <p className="px-3 py-2 text-xs text-gray-400">No machines found</p>
                    : filteredMachines.map(m => (
                        <button key={m.id} type="button"
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs border-b border-gray-100 last:border-0"
                          onMouseDown={() => pickMachine(m)}>
                          <span className="font-medium text-gray-800">{m.slno}</span>
                          {m.nickname && <span className="text-gray-500 ml-1">— {m.nickname}</span>}
                          <span className="text-gray-400 ml-2 text-[10px]">{m.eq_type_name || m.eq_type}</span>
                        </button>
                      ))
                  }
                </div>
              )}
            </div>
          )}
          {machineOpen && !selectedMachine && (
            <button type="button" className="absolute right-0 -top-0.5 text-[10px] text-gray-400 hover:text-gray-600"
              onMouseDown={() => { setMachineOpen(false); setMachineSearch('') }}>close</button>
          )}
        </div>

        {/* Invoice Rule picker */}
        <div>
          <label className="text-[10px] text-gray-400 uppercase">Invoice Rule</label>
          <select
            className={`${inp} text-xs ${selectedRule ? 'border-green-400 bg-green-50 text-green-900' : ''}`}
            value={item.invoice_rule_id || ''}
            onChange={e => onChange({ ...item, invoice_rule_id: e.target.value ? parseInt(e.target.value) : null })}
          >
            <option value="">— No rule —</option>
            {invoiceRules.map(r => (
              <option key={r.id} value={r.id}>
                {r.rule_number} · {r.rule_name} · ₹{Number(r.basic_rate).toLocaleString('en-IN')}/{r.days}d
              </option>
            ))}
          </select>
          {selectedRule && (
            <p className="text-[10px] text-green-700 mt-0.5">
              Rate/Day: ₹{(parseFloat(selectedRule.basic_rate)/parseInt(selectedRule.days)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 uppercase">Equipment Type</label>
          <select className={inp} value={item.eq_type} onChange={set('eq_type')}>
            <option value="">— select —</option>
            {equipmentTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div><label className="text-[10px] text-gray-400 uppercase">Reg No</label><input className={inp} value={item.reg_no} onChange={set('reg_no')} /></div>
        <div><label className="text-[10px] text-gray-400 uppercase">Make</label><input className={inp} value={item.manufacturer} onChange={set('manufacturer')} placeholder="e.g. ACE" /></div>
        <div><label className="text-[10px] text-gray-400 uppercase">Model</label><input className={inp} value={item.model} onChange={set('model')} /></div>
        <div><label className="text-[10px] text-gray-400 uppercase">YOM</label><input className={inp} value={item.yom} onChange={set('yom')} maxLength={4} placeholder="e.g. 2023" /></div>
      </div>

      <div className="grid grid-cols-6 gap-2">
        <div><label className="text-[10px] text-gray-400 uppercase">Qty</label><input type="number" className={inp} value={item.quantity} onChange={set('quantity')} /></div>
        <div><label className="text-[10px] text-gray-400 uppercase">Unit</label><input className={inp} value={item.unit} onChange={set('unit')} /></div>
        <div><label className="text-[10px] text-gray-400 uppercase">Billing Rate</label><input type="number" className={inp} value={item.rate} onChange={set('rate')} /></div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase">Rate Type</label>
          <select className={inp} value={item.rate_type} onChange={set('rate_type')}>
            <option value="per_month">Per Month</option>
            <option value="per_day">Per Day</option>
            <option value="per_hour">Per Hour</option>
            <option value="lump_sum">Lump Sum</option>
          </select>
        </div>
        <div><label className="text-[10px] text-gray-400 uppercase">Single Shift Rate</label><input type="number" className={inp} value={item.rate_single_shift} onChange={set('rate_single_shift')} placeholder="₹ / month" /></div>
        <div><label className="text-[10px] text-gray-400 uppercase">Double Shift Rate</label><input type="number" className={inp} value={item.rate_double_shift} onChange={set('rate_double_shift')} placeholder="₹ / month" /></div>
      </div>

      <div className="text-right text-xs text-gray-500">Amount: <span className="font-semibold text-gray-800">{fmtMoney(item.amount)}</span></div>
    </div>
  )
}

// ── CREATE / EDIT WO MODAL ────────────────────────────────────────────────────

const DEFAULT_BILLING_RULES = {
  overtime_applicable:      false,
  overtime_threshold_hrs:   8,
  overtime_rate_multiplier: 1.5,
  sunday_applicable:        false,
  sunday_rate_multiplier:   2.0,
  holiday_applicable:       false,
  holiday_rate_multiplier:  2.0,
  prorata_applicable:       true,
}

function BillingRulesSection({ rules, onChange }) {
  const [open, setOpen] = useState(false)
  const set = (k, v) => onChange({ ...rules, [k]: v })
  const Toggle = ({ k, label }) => (
    <button type="button" onClick={() => set(k, !rules[k])}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
        ${rules[k] ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 bg-gray-50'}`}>
      {rules[k] ? <ToggleRight size={15} className="text-blue-600"/> : <ToggleLeft size={15} className="text-gray-400"/>}
      {label}
    </button>
  )
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-semibold text-gray-700">
        <span>Billing Rules <span className="text-xs font-normal text-gray-400">(OT, Sunday, Pro-rata)</span></span>
        {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
      </button>
      {open && (
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Toggle k="overtime_applicable" label="Overtime Applicable"/>
            {rules.overtime_applicable && (
              <div className="ml-4 grid grid-cols-2 gap-3">
                <div><label className={lbl}>Threshold Hrs/Day</label>
                  <input type="number" step="0.5" className={inp} value={rules.overtime_threshold_hrs}
                    onChange={e => set('overtime_threshold_hrs', parseFloat(e.target.value)||8)}/></div>
                <div><label className={lbl}>OT Rate Multiplier</label>
                  <input type="number" step="0.25" className={inp} value={rules.overtime_rate_multiplier}
                    onChange={e => set('overtime_rate_multiplier', parseFloat(e.target.value)||1.5)}/></div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Toggle k="sunday_applicable" label="Sunday Premium"/>
            {rules.sunday_applicable && (
              <div className="ml-4 grid grid-cols-2 gap-3">
                <div><label className={lbl}>Sunday Rate Multiplier</label>
                  <input type="number" step="0.25" className={inp} value={rules.sunday_rate_multiplier}
                    onChange={e => set('sunday_rate_multiplier', parseFloat(e.target.value)||2.0)}/></div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Toggle k="holiday_applicable" label="Holiday Premium"/>
            {rules.holiday_applicable && (
              <div className="ml-4 grid grid-cols-2 gap-3">
                <div><label className={lbl}>Holiday Rate Multiplier</label>
                  <input type="number" step="0.25" className={inp} value={rules.holiday_rate_multiplier}
                    onChange={e => set('holiday_rate_multiplier', parseFloat(e.target.value)||2.0)}/></div>
              </div>
            )}
          </div>
          <Toggle k="prorata_applicable" label="Pro-rata (partial month billing)"/>
          {rules.prorata_applicable && (
            <p className="ml-4 text-xs text-gray-400">Bill calculated as: Rate × (working days ÷ calendar days in period)</p>
          )}
        </div>
      )}
    </div>
  )
}

const blankItem = () => ({
  machine_id: null, equipment_desc: '', eq_type: '', reg_no: '', manufacturer: '', model: '', yom: '',
  quantity: 1, unit: 'No.', rate: '', rate_type: 'per_month',
  rate_single_shift: '', rate_double_shift: '', amount: '0',
  invoice_rule_id: null,
})

// ── MACHINE-SPECIFIC TERMS & CONDITIONS LIBRARY ─────────────────────────────
// Both the conditions (hire_terms_library) and their sub-headings
// (hire_terms_categories) are stored in the DB and fetched at runtime, so they
// can be managed (added/removed) directly from the picker UI.

// ── STANDARD CLAUSE LIBRARY ───────────────────────────────────────────────────
// Fixed legal/operational clauses common to every hire WO (clause 1 = equipment
// particulars, rendered separately as a table). Variable data is substituted in.

// The Additional/Special Conditions clause (the user's picked points) — shown
// in both the draft summary and the full legal document.
function buildAdditionalConditionsClause(wo) {
  if (!wo.terms_conditions?.trim()) return null
  return {
    title: 'Additional / Special Conditions',
    body: numberedConditions(wo.terms_conditions).map(c => c.category
      ? { heading: `${c.n}) ${c.category}`, text: c.text }
      : { heading: null, text: `${c.n}) ${c.text}` }),
  }
}

// The full 35-clause legal document (fuel norms, payment, insurance, jurisdiction,
// etc.) — only used for the final/approved copy sent to the vendor.
function buildStandardClauses(wo) {
  const tenureText = wo.tenure_months
    ? `Minimum ${wo.tenure_months} Month(s) and will be extendable on mutual consent.`
    : 'As mutually agreed and extendable on mutual consent.'
  const vendorBank = wo.vendor_bank_name
    ? `${wo.vendor_bank_name}, A/c No: ${wo.vendor_bank_account || '—'}, IFSC: ${wo.vendor_bank_ifsc || '—'}`
    : 'NA'

  return [
    { title: 'Monsoon Season Terms & Conditions', body: ['In Monsoon Season actual working days will be payable on prorata basis.'] },
    { title: 'Project Site Location', body: [`${wo.project_code || ''}${wo.project_name ? ' — ' + wo.project_name : ''}.`] },
    { title: 'Reporting Date', body: [wo.reporting_date ? fmtDate(wo.reporting_date) : fmtDate(wo.start_date)] },
    { title: 'Mobilization', body: ['One-side transportation charges shall be paid by RVR at actuals along with the 1st RA Bill, subject to valid submission of bills, payment proofs and E-Way Bills.'] },
    { title: 'Fuel Norms', body: [
      '2.5 to 4 Ltrs/Hour. Any consumption exceeding this limit will be recovered based on actual usage, with an additional 5% handling charge.',
      'If any abnormal working hours or kilometers are recorded, RVRPL reserves the right to calculate and compensate for those hours according to standard HSD consumption norms.',
      "Upon the machine's arrival at the site, the fuel tank will be filled completely, and the quantity filled will be debited in the first RA bill. Similarly, at the time of demobilization, the fuel tank will be filled to its full capacity before the machine is released from the site.",
    ] },
    { title: 'Fuel / Lubricants', body: ['HSD is our scope. If any other lubricants are provided by RVR, the recovery will be done at actual cost with 5% handling/surcharge.'] },
    { title: 'Working Hours', body: [
      'Single Shift (12 Hrs). Double Shift (Round the Clock).',
      'If any abnormal working hours are found during the work (i.e. manipulation in hours meter or keeping the engine idle while no work at site), those working hours will be deducted on prorata basis including fuel; idle hours will be calculated as per OEM standard fuel consumption norms.',
      'Operator should submit the shift-wise trip/log sheet to the workshop without fail, capturing start & end hour-meter readings, HSD issued quantity, and nature of work done (chainage/location-wise), signed by the concerned Site Engineer. Operator is also responsible to send photographs of start & end readings to the concerned P&M Engineer daily or as required.',
    ] },
    { title: 'Period of Contract', body: [tenureText] },
    { title: 'Change in Contract Period', body: ['Period and place of hiring can be amended/changed on the same terms and conditions, subject to written confirmation.'] },
    { title: "Tax & Levy's", body: ['CGST @ 9% and SGST @ 9% or IGST @ 18% will be paid extra as applicable. (SAC Code: 9973)'] },
    { title: 'TDS / Income Tax', body: ['TDS/Income Tax at source will be deducted from your bills as per government rules.'] },
    { title: 'Payment of Bills', body: [
      'You shall submit your bills by the 5th of every month and the payment shall be cleared within 15 days after valid certification by the Project Manager / Site In-charge.',
      'The Tax Invoice shall be raised as per Sec. 31 of CGST Act 2017 & Invoice Rules of CGST Rules 2017.',
      `You shall mention our GST Reg. No. ${RVR_COMPANY.gst} in your Invoice.`,
      'You shall pay the GST to the Department by the due date and include the invoices submitted to RVR in the monthly return (GSTR-1 & GSTR-3B) filed by you, on or before the due date defined under the GST Act & Rules. If RVR is unable to claim input tax credit due to reasons attributable to you, the GST amount along with interest @18% will be recovered from the amount due to you.',
      'Invoice will be processed from site only upon submission of the GSTR-1 filed copy of the previous bill. If the vendor fails to deposit GST (3B) of previous bills, RVR reserves the right to hold further bill amounts until clearance of the previous GST paid by RVR.',
    ] },
    { title: 'Operator Clause', body: [
      'One operator should be provided for single shift; two operators for double shift. Double operation with a single operator is not acceptable. The operator should be a minimum of 21 years old, possess proper knowledge of equipment operation, and hold a valid licence. If work is hampered due to lack of knowledge/negligence of the operator, liquidated damages shall be recovered.',
      "If an operator is provided by RVR (in case the vendor is unable to provide one), the operator's salary will be debited on prorata basis from the monthly billing.",
      'No compensation shall be paid against accidental damages, faulty operation, or breakdowns due to lack of maintenance; such breakdown days will not be paid (applicable when machine is operated by RVR operators).',
    ] },
    { title: 'Accommodation & Food', body: ["In RVR's scope at site."] },
    { title: 'Demobilisation', body: [
      "In service provider's scope. In case of non-satisfactory service, RVR reserves the right to terminate this order without assigning any reason and without pre-intimation. No compensation shall be payable for such termination; however, 7 days' advance notice will be given for demobilizing the machine.",
    ] },
    { title: 'Logbook & Hour Meter', body: [
      "The service provider shall maintain RVR's logbook, jointly signed by RVR's representative & the service provider on a day-to-day basis.",
      'Hour meter should be in working condition. If the meter is not working or is tampered with by the operator, the service provider shall ensure repair/replacement within 1-2 working days, failing which RVRPL reserves the right to calculate hours based on OEM standard fuel consumption norms or output certified by the site in-charge.',
    ] },
    { title: 'RTA / Insurance', body: [
      'The Service Provider shall maintain valid comprehensive insurance for the machine/vehicle and ensure all deployed manpower is covered under Group Personal Accident and Workmen Compensation policies. All policies shall be kept valid, renewed on time, and copies submitted to RVR Projects Pvt Ltd. RVR shall not be responsible for insurance lapses, RTA-related issues due to invalid documents, or any accident/loss/damage to machine or manpower; all such liabilities shall be borne by the Service Provider.',
    ] },
    { title: 'Accessories & Attachments', body: ['All tools, tackles and attachments required shall be supplied by the service provider. Maintenance of the machine is in vendor scope; if any maintenance is done by RVR, the cost (including raw material & manpower) will be recovered.'] },
    { title: 'GPS & Fuel Sensor', body: ['It is mandatory to have a GPS and fuel sensor installed. If not installed, RVR Projects will arrange installation and debit the cost in the 2nd RA bill. Any recorded fuel theft will attract a penalty of 10 times the recorded value.'] },
    { title: 'Loading & Unloading', body: ["In service provider's scope."] },
    { title: 'Statutory Compliance', body: ["All statutory compliance related to operation of this machine shall be complied with at the service provider's cost. RVR Projects Pvt Ltd is not responsible for any damage/accident to a third party through the service provider."] },
    { title: 'Repairs & Maintenance', body: [
      "In service provider's scope; one day per month is allowed for routine maintenance. If the machine breaks down for more than four days, maintenance days will not be adjustable against the breakdown.",
      "Any maintenance work done by RVRPL (welding, lubricant top-ups, hydraulic hoses, greasing, etc.) will be recovered at actuals with a 5% handling charge, including manpower.",
    ] },
    { title: 'Safety Operation', body: ['All lifting accessories (hooks, latches, ropes, etc.) shall be in good condition; the Safe Load Indication system (SLI) should be working. The service provider should provide a valid TPI certificate with the machine, renewed at recommended intervals.'] },
    { title: 'Safety Compliance', body: ['The machine must have all safety gadgets installed and operational. Non-compliant machines may be considered unsafe for use. All safety instructions issued by the safety department must be complied with.'] },
    { title: 'Legal Jurisdiction', body: ['This Work Order shall be governed by the laws of the Indian Union. The courts of Visakhapatnam, Andhra Pradesh shall have exclusive jurisdiction over any dispute arising out of this Work Order.'] },
    { title: 'Breakdown of Equipment', body: ['If the machine remains idle due to breakdown and/or absence of operator, the same shall be recovered pro-rata from the monthly bill; such hours will not be adjusted on the maintenance day. In case of breakdown, the service provider must rectify the issue immediately, failing which the machine will be de-hired after one or two notices.'] },
    { title: 'Indemnification', body: ['The Service Provider shall indemnify RVR Projects Pvt Ltd and its representatives from any implications of failure to adhere to statutory laws, or from accidents/injuries/damages arising from the negligence or action of the Service Provider. No director, official or employee of RVR Projects Pvt Ltd shall be personally bound or liable for performance of obligations under this Work Order.'] },
    { title: 'Force Majeure', body: ['Neither party shall be responsible or in default if execution of the Work Order is delayed/interrupted due to causes beyond their control (act of God, natural calamity, war, civil commotion, supply chain disruption, fire, storm, flood, strike, lockout, bandh), provided such cause persists for more than 7 days. Neither party shall be liable to compensate the other for resulting loss.'] },
    { title: 'Site Visit', body: ['We understand that your team has visited the site and understood the nature and scope of work.'] },
    { title: 'Site Address / Contact Person', body: [
      wo.site_address || wo.project_address || '—',
      [wo.site_contact_name, wo.site_contact_phone].filter(Boolean).join(', ') || '—',
    ] },
    { title: 'Mobilization Advance', body: [wo.mobilization_advance || 'NA'] },
    { title: "Bank Details of Service Provider's", body: [vendorBank] },
    { title: 'Acceptance of Work Order', body: ['This Work Order will be automatically deemed accepted if RVR does not receive a signed acceptance copy within 7 days of the date of this WO.'] },
    { title: 'Ownership', body: [`The ownership of the equipment shall remain with ${wo.vendor_name || 'the Service Provider'} during the whole contract period; no work order amendment will be made regarding change of ownership during this contract period.`] },
  ]
}

// Approved/final copy: full legal document. Draft copy: equipment + picked points only.
function buildClauses(wo) {
  const additional = buildAdditionalConditionsClause(wo)
  if (wo.status !== 'approved') return additional ? [additional] : []
  return [...buildStandardClauses(wo), ...(additional ? [additional] : [])]
}

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
    machine_id: wo?.machine_id ? String(wo.machine_id) : '',
    project_id: wo?.project_id || '',
    start_date: wo?.start_date?.slice(0,10) || '',
    end_date: wo?.end_date?.slice(0,10) || '',
    tenure_months: wo?.tenure_months || '',
    description_line: wo?.description_line || '',
    site_address: wo?.site_address || '',
    reporting_date: wo?.reporting_date?.slice(0,10) || '',
    site_contact_name: wo?.site_contact_name || '',
    site_contact_phone: wo?.site_contact_phone || '',
    mobilization_advance: wo?.mobilization_advance || 'NA',
    signatory_id: wo?.signatory_id || '',
  })
  const [customTerms, setCustomTerms] = useState(wo?.terms_conditions || '')
  const [siteAddrTouched, setSiteAddrTouched] = useState(!!wo?.site_address)
  const [items,    setItems]    = useState([])
  const [vendors,  setVendors]  = useState([])
  const [projects, setProjects] = useState([])
  const [equipmentTypes, setEquipmentTypes] = useState([])
  const [machinesList,   setMachinesList]   = useState([])
  const [invoiceRules,   setInvoiceRules]   = useState([])
  const [termsLibrary, setTermsLibrary] = useState([])
  const [termsCategories, setTermsCategories] = useState([])
  const [showTermsPicker, setShowTermsPicker] = useState(false)
  const [signatories, setSignatories] = useState([])
  const [signatoryDesignations, setSignatoryDesignations] = useState([])
  const [showSignatoryManager, setShowSignatoryManager] = useState(false)
  const [approvedIndents,  setApprovedIndents]  = useState([])
  const [selectedIndentId, setSelectedIndentId] = useState('')
  const [indentPicking,    setIndentPicking]    = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [billingRules, setBillingRules] = useState(
    wo?.billing_rules
      ? (typeof wo.billing_rules === 'string' ? JSON.parse(wo.billing_rules) : wo.billing_rules)
      : { ...DEFAULT_BILLING_RULES }
  )

  useEffect(() => {
    getEquipmentTypes().then(r => setEquipmentTypes(r.data.data)).catch(() => {})
    getTermsLibrary().then(r => setTermsLibrary(r.data.data)).catch(() => {})
    getTermsCategories().then(r => setTermsCategories(r.data.data)).catch(() => {})
    getSignatories().then(r => setSignatories(r.data.data)).catch(() => {})
    getSignatoryDesignations().then(r => setSignatoryDesignations(r.data.data)).catch(() => {})
    getMachines().then(r => setMachinesList(r.data.data || [])).catch(() => {})
    getInvoiceRules().then(r => setInvoiceRules(r.data.data || [])).catch(() => {})
    Promise.all([getHireVendors(), getProjects()]).then(([v, p]) => {
      setVendors(v.data.data)
      setProjects(p.data.data)
    })
    if (!wo) getHireIndents({ status: 'approved' }).then(r => setApprovedIndents(r.data.data)).catch(() => {})
    if (wo?.items) setItems(wo.items.map(i => ({ ...i, amount: String(i.amount) })))
    else           setItems([blankItem()])
  }, [])

  useEffect(() => {
    if (!form.project_id) return
    const proj = projects.find(p => String(p.id) === String(form.project_id))
    // Default site address from the project's registered address, unless the user already edited it
    if (proj?.address && !siteAddrTouched) setForm(f => ({ ...f, site_address: proj.address }))
  }, [form.project_id, projects])

  useEffect(() => {
    if (form.start_date && form.end_date) {
      const ms = new Date(form.end_date) - new Date(form.start_date)
      const months = (ms / (1000 * 60 * 60 * 24 * 30.44)).toFixed(1)
      if (months > 0) setForm(f => ({ ...f, tenure_months: months }))
    }
  }, [form.start_date, form.end_date])

  const setF   = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleIndentSelect = async e => {
    const id = e.target.value
    setSelectedIndentId(id)
    if (!id) return
    setIndentPicking(true)
    try {
      const r   = await getHireIndent(id)
      const ind = r.data.data
      setForm(f => ({
        ...f,
        indent_number:      ind.indent_number,
        project_id:         ind.project_id   || f.project_id,
        start_date:         ind.required_from?.slice(0, 10) || f.start_date,
        end_date:           ind.required_to?.slice(0, 10)   || f.end_date,
        tenure_months:      ind.tenure_months  || f.tenure_months,
        description_line:   ind.purpose        || f.description_line,
        site_address:       ind.site_address   || f.site_address,
        site_contact_name:  ind.site_contact_name  || f.site_contact_name,
        site_contact_phone: ind.site_contact_phone || f.site_contact_phone,
      }))
      setSiteAddrTouched(true)
      if (ind.items?.length) {
        setItems(ind.items.map(it => ({
          ...blankItem(),
          equipment_desc:    it.equipment_desc || '',
          eq_type:           it.eq_type        || '',
          quantity:          it.quantity       || 1,
          unit:              it.unit           || 'No.',
          rate_type:         it.rate_type      || 'per_month',
          rate:              it.estimated_rate  || '',
          rate_single_shift: it.shift_type === 'single' ? (it.estimated_rate || '') : '',
          rate_double_shift: it.shift_type === 'double' ? (it.estimated_rate || '') : '',
          amount:            String((Number(it.quantity) || 0) * (Number(it.estimated_rate) || 0)),
        })))
      }
    } catch { /* silently ignore */ }
    finally { setIndentPicking(false) }
  }

  const total  = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const addItem = () => setItems(prev => [...prev, blankItem()])
  const updateItem = (idx, val) => setItems(prev => prev.map((it, i) => i === idx ? val : it))
  const removeItem = idx => setItems(prev => prev.filter((_, i) => i !== idx))

  const save = async () => {
    if (!form.vendor_id)  { setError('Select a vendor'); return }
    if (!form.project_id) { setError('Select a project'); return }
    if (items.every(i => !i.equipment_desc.trim())) { setError('Add at least one equipment item'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, terms_conditions: customTerms.trim(), billing_rules: billingRules, items: items.filter(i => i.equipment_desc.trim()) }
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

        {/* Indent picker — new WO only */}
        {!wo && (
          <section className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileCheck size={15} className="text-blue-600"/>
              <p className="text-sm font-semibold text-blue-800">Pick from Approved Indent</p>
              {indentPicking && <Loader2 size={14} className="animate-spin text-blue-600"/>}
            </div>
            <select
              className={`${inp} border-blue-300 focus:ring-blue-500`}
              value={selectedIndentId}
              onChange={handleIndentSelect}
              disabled={indentPicking}
            >
              <option value="">— select an approved indent to pre-fill this form —</option>
              {approvedIndents.map(ind => (
                <option key={ind.id} value={ind.id}>
                  {ind.indent_number}  ·  {ind.project_code}{ind.project_name ? ' — ' + ind.project_name : ''}  ·  {ind.item_count ?? 0} item(s)
                </option>
              ))}
            </select>
            {!approvedIndents.length && (
              <p className="text-xs text-blue-500 mt-1">No approved indents available. You can also fill the form manually.</p>
            )}
            {selectedIndentId && !indentPicking && (
              <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                <CheckCircle size={11}/> Form pre-filled from indent — review and adjust before saving.
              </p>
            )}
          </section>
        )}

        {/* Basic Info */}
        <section>
          <p className={`${lbl} mb-3`}>Work Order Details</p>
          <div className="grid grid-cols-3 gap-4">
            {wo && <div><label className={lbl}>WO Number</label><input readOnly className={`${inp} bg-gray-50`} value={wo.wo_number} /></div>}
            <div><label className={lbl}>WO Date *</label><input type="date" className={inp} value={form.wo_date} onChange={setF('wo_date')} /></div>
            <div><label className={lbl}>Indent Number</label><input className={`${inp} ${selectedIndentId ? 'bg-gray-50' : ''}`} readOnly={!!selectedIndentId} value={form.indent_number} onChange={setF('indent_number')} placeholder="Optional" /></div>
            <div><label className={lbl}>Vendor Offer No</label><input className={inp} value={form.vendor_offer_no} onChange={setF('vendor_offer_no')} placeholder="Vendor's quotation / offer ref." /></div>
            <div>
              <label className={lbl}>Vendor *</label>
              <select className={inp} value={form.vendor_id} onChange={setF('vendor_id')}>
                <option value="">— select vendor —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Linked Asset</label>
              <select className={inp} value={form.machine_id} onChange={setF('machine_id')}>
                <option value="">— select asset (optional) —</option>
                {machinesList.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.slno}{m.nickname ? ` (${m.nickname})` : ''} · {m.eq_type}{m.reg_no ? ` · ${m.reg_no}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Project *</label>
              <select className={inp} value={form.project_id} onChange={setF('project_id')}>
                <option value="">— select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.code}{p.name ? ` — ${p.name}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Authorized Signatory</label>
              <div className="flex items-center gap-1.5">
                <select className={inp} value={form.signatory_id} onChange={setF('signatory_id')}>
                  <option value="">— select signatory —</option>
                  {signatories.map(s => <option key={s.id} value={s.id}>{s.name} ({s.designation})</option>)}
                </select>
                <button type="button" onClick={() => setShowSignatoryManager(true)}
                  className="p-2 text-gray-400 hover:text-blue-600 flex-shrink-0" title="Manage signatories">
                  <Edit2 size={14}/>
                </button>
              </div>
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

        {/* Billing Rules */}
        <section>
          <p className={`${lbl} mb-3`}>Billing Rules</p>
          <BillingRulesSection rules={billingRules} onChange={setBillingRules} />
        </section>

        {/* Equipment Items */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className={lbl}>Equipment / Machinery</p>
            <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-sm text-blue-700 font-medium hover:text-blue-900">
              <Plus size={14} />Add Row
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <ItemRow key={idx} item={item} equipmentTypes={equipmentTypes}
                machines={machinesList} invoiceRules={invoiceRules}
                onChange={val => updateItem(idx, val)}
                onRemove={() => removeItem(idx)} />
            ))}
          </div>
          <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
            <p className="text-sm font-bold text-gray-800">Total Value: <span className="text-blue-700">{fmtMoney(total)}</span></p>
          </div>
        </section>

        {/* Description line */}
        <section>
          <label className={lbl}>Description Line (shown under the WO title)</label>
          <input className={inp} value={form.description_line} onChange={setF('description_line')}
            placeholder={`e.g. Hire Work Order for Providing Service of ${ordinalQty(items[0]?.quantity||1)} No of ${items[0]?.equipment_desc || '[equipment]'} for our [Project] Project.`} />
        </section>

        {/* Site, Reporting & Mobilization */}
        <section>
          <p className={`${lbl} mb-3`}>Site, Reporting &amp; Mobilization</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={lbl}>Site Address</label>
              <textarea rows={2} className={inp} value={form.site_address}
                onChange={e => { setSiteAddrTouched(true); setF('site_address')(e) }} />
            </div>
            <div><label className={lbl}>Reporting Date</label><input type="date" className={inp} value={form.reporting_date} onChange={setF('reporting_date')} /></div>
            <div><label className={lbl}>Mobilization Advance</label><input className={inp} value={form.mobilization_advance} onChange={setF('mobilization_advance')} placeholder="NA" /></div>
            <div><label className={lbl}>Site Contact Person</label><input className={inp} value={form.site_contact_name} onChange={setF('site_contact_name')} /></div>
            <div><label className={lbl}>Site Contact Phone</label><input className={inp} value={form.site_contact_phone} onChange={setF('site_contact_phone')} /></div>
          </div>
        </section>

        {/* Additional / Special Conditions */}
        <section>
          <p className={`${lbl} mb-3`}>Additional / Special Conditions</p>
          <p className="text-xs text-gray-400 mb-2">
            The standard 30+ clause hire terms (fuel norms, payment, operator clause, insurance, indemnification,
            force majeure, jurisdiction, etc.) are applied automatically on the generated document. Use this field
            only for clauses specific to this WO.
          </p>
          <button type="button" onClick={() => setShowTermsPicker(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 mb-3">
            <Plus size={14} /> Pick Terms &amp; Conditions
          </button>
          <ConditionsEditor value={customTerms} onChange={setCustomTerms} />
        </section>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3 pb-2">
          <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
            {saving ? 'Saving…' : wo ? 'Update Work Order' : 'Create Work Order'}
          </button>
          <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
      {showTermsPicker && (
        <TermsPickerModal
          itemTypes={[...new Set(items.map(i => i.eq_type).filter(Boolean))]}
          equipmentTypes={equipmentTypes}
          library={termsLibrary}
          onLibraryChange={setTermsLibrary}
          categories={termsCategories}
          onCategoriesChange={setTermsCategories}
          customTerms={customTerms}
          onToggle={text => setCustomTerms(toggleConditionLine(customTerms, text))}
          onClose={() => setShowTermsPicker(false)}
        />
      )}
      {showSignatoryManager && (
        <SignatoryManagerModal
          signatories={signatories} onSignatoriesChange={setSignatories}
          designations={signatoryDesignations} onDesignationsChange={setSignatoryDesignations}
          onClose={() => setShowSignatoryManager(false)}
        />
      )}
    </Modal>
  )
}

// ── ADDITIONAL CONDITIONS EDITOR (numbered, removable, reorderable) ──────────

function ConditionsEditor({ value, onChange }) {
  const lines = conditionLines(value).map(stripLineNumber)
  const [customInput, setCustomInput] = useState('')

  const setLines = next => onChange(next.join('\n'))
  const moveLine = (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= lines.length) return
    const next = [...lines]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setLines(next)
  }
  const removeLine = idx => setLines(lines.filter((_, i) => i !== idx))
  const addCustom = () => {
    const t = customInput.trim()
    if (!t) return
    setLines([...lines, t])
    setCustomInput('')
  }

  return (
    <div className="space-y-2">
      {lines.length === 0 && (
        <p className="text-xs text-gray-400 italic">No additional conditions yet — use "Pick Terms &amp; Conditions" above or add a custom one below.</p>
      )}
      {lines.map((line, idx) => {
        const { category, text } = decodeConditionLine(line)
        return (
        <div key={idx} className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-xs font-semibold text-gray-400 mt-0.5 flex-shrink-0">{idx+1})</span>
          <span className="flex-1 text-sm text-gray-700">
            {category && <span className="block font-bold text-gray-900">{category}</span>}
            {text}
          </span>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button type="button" title="Move up" disabled={idx===0} onClick={() => moveLine(idx,-1)}
              className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-gray-400">
              <ChevronUp size={14}/>
            </button>
            <button type="button" title="Move down" disabled={idx===lines.length-1} onClick={() => moveLine(idx,1)}
              className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-gray-400">
              <ChevronDown size={14}/>
            </button>
            <button type="button" title="Remove" onClick={() => removeLine(idx)} className="p-1 text-red-400 hover:text-red-600">
              <X size={14}/>
            </button>
          </div>
        </div>
        )
      })}
      <div className="flex items-center gap-2">
        <input className={inp} value={customInput} onChange={e => setCustomInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
          placeholder="Type a custom condition and press Enter…" />
        <button type="button" onClick={addCustom}
          className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900 px-3 py-2 whitespace-nowrap">
          <Plus size={14}/> Add
        </button>
      </div>
    </div>
  )
}

// ── TERMS & CONDITIONS PICKER ─────────────────────────────────────────────────

function toggleConditionLine(text, line) {
  const lines = conditionLines(text).map(stripLineNumber)
  const idx = lines.indexOf(line)
  if (idx >= 0) { lines.splice(idx, 1); return lines.join('\n') }
  return [...lines, line].join('\n')
}

function TermsPickerModal({ itemTypes, equipmentTypes, library, onLibraryChange, categories, onCategoriesChange, customTerms, onToggle, onClose }) {
  const [tagFilter, setTagFilter] = useState(itemTypes.length === 1 ? itemTypes[0] : 'All')
  const [editingId, setEditingId] = useState(null)
  const [editText,  setEditText]  = useState('')
  const [savingId,  setSavingId]  = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [deletingCategory, setDeletingCategory] = useState(false)
  const [showAdd,   setShowAdd]   = useState(false)
  const categoryNames = categories.map(c => c.name)
  const [newCategory,       setNewCategory]       = useState(categoryNames[0] || '__new__')
  const [newCategoryCustom, setNewCategoryCustom] = useState('')
  const [newDescription,    setNewDescription]    = useState('')
  const [newTags,        setNewTags]        = useState(new Set(itemTypes.length === 1 ? itemTypes : []))
  const [error, setError] = useState('')

  const selectedLines = new Set(conditionLines(customTerms).map(stripLineNumber))
  const isPicked = t => selectedLines.has(encodeConditionLine(t.category, t.description))
  const allTags = [...new Set(['General', ...equipmentTypes.map(t => t.name), ...library.flatMap(t => t.tags)])]

  const rows = library.filter(t => tagFilter === 'All' || t.tags.includes(tagFilter))
  const categoriesPresent = [...new Set(rows.map(r => r.category))]
  const orderedCategories = [
    ...categoryNames.filter(c => categoriesPresent.includes(c)),
    ...categoriesPresent.filter(c => !categoryNames.includes(c)),
  ]

  const startEdit  = row => { setEditingId(row.id); setEditText(row.description); setError('') }
  const cancelEdit = () => { setEditingId(null); setEditText('') }

  const saveEdit = async row => {
    const text = singleLine(editText)
    if (!text) { setError('Description cannot be empty'); return }
    setSavingId(row.id); setError('')
    try {
      const res = await updateTermsLibraryItem(row.id, { category: row.category, description: text, tags: row.tags })
      onLibraryChange(prev => prev.map(t => t.id === row.id ? res.data.data : t))
      const oldLine = encodeConditionLine(row.category, row.description)
      const newLine = encodeConditionLine(row.category, text)
      if (selectedLines.has(oldLine) && text !== row.description) {
        onToggle(oldLine)
        onToggle(newLine)
      }
      cancelEdit()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save')
    } finally { setSavingId(null) }
  }

  const removeRow = async row => {
    if (!confirm(`Remove "${row.description}" from the library? This removes it for everyone, not just this WO.`)) return
    setDeletingId(row.id); setError('')
    try {
      await deleteTermsLibraryItem(row.id)
      onLibraryChange(prev => prev.filter(t => t.id !== row.id))
      const line = encodeConditionLine(row.category, row.description)
      if (selectedLines.has(line)) onToggle(line)
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to remove')
    } finally { setDeletingId(null) }
  }

  const toggleNewTag = t => setNewTags(prev => {
    const next = new Set(prev); next.has(t) ? next.delete(t) : next.add(t); return next
  })

  const submitNew = async () => {
    const category = newCategory === '__new__' ? newCategoryCustom.trim() : newCategory
    const description = singleLine(newDescription)
    if (!category) { setError('Sub-heading is required'); return }
    if (!description) { setError('Description is required'); return }
    setError('')
    try {
      if (newCategory === '__new__' && !categoryNames.includes(category)) {
        const catRes = await createTermsCategory({ name: category })
        onCategoriesChange(prev => [...prev, catRes.data.data])
      }
      const res = await createTermsLibraryItem({ category, description, tags: [...newTags] })
      onLibraryChange(prev => [...prev, res.data.data])
      // Always show the new entry immediately, even if its tags don't match the current filter
      if (tagFilter !== 'All' && !res.data.data.tags.includes(tagFilter)) setTagFilter('All')
      setNewDescription(''); setNewTags(new Set()); setNewCategory(categoryNames[0] || '__new__'); setNewCategoryCustom(''); setShowAdd(false)
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to add')
    }
  }

  const removeCategory = async () => {
    const cat = categories.find(c => c.name === newCategory)
    if (!cat) return
    const count = library.filter(t => t.category === cat.name).length
    const warn = count ? ` This will also remove its ${count} condition(s) from the library.` : ''
    if (!confirm(`Remove the "${cat.name}" sub-heading?${warn}`)) return
    setDeletingCategory(true); setError('')
    try {
      await deleteTermsCategory(cat.id)
      onCategoriesChange(prev => prev.filter(c => c.id !== cat.id))
      onLibraryChange(prev => prev.filter(t => t.category !== cat.name))
      conditionLines(customTerms).map(stripLineNumber).forEach(line => {
        const { category } = decodeConditionLine(line)
        if (category === cat.name) onToggle(line)
      })
      setNewCategory(categories.find(c => c.id !== cat.id)?.name || '__new__')
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to remove sub-heading')
    } finally { setDeletingCategory(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Pick Terms &amp; Conditions</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100 flex justify-end">
          <select className={`${inp} w-48`} value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
            <option value="All">All Tags</option>
            {allTags.map(t => <option key={t} value={t}>{t}{itemTypes.includes(t) ? ' (selected equipment)' : ''}</option>)}
          </select>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-left">Tag</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orderedCategories.map(cat => (
                <Fragment key={cat}>
                  <tr className="bg-gray-100/80">
                    <td colSpan={3} className="px-4 py-1.5 text-xs font-bold text-gray-600 uppercase tracking-wide">{cat}</td>
                  </tr>
                  {rows.filter(r => r.category === cat).map(t => {
                    const picked  = isPicked(t)
                    const editing = editingId === t.id
                    return (
                      <tr key={t.id} className={picked ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-2.5 text-gray-800">
                          {editing ? (
                            <textarea rows={2} className={inp} value={editText} onChange={e => setEditText(e.target.value)} />
                          ) : t.description}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{t.tags.join(', ')}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {editing ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button type="button" disabled={savingId===t.id} onClick={() => saveEdit(t)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
                                {savingId===t.id ? 'Saving…' : 'Save'}
                              </button>
                              <button type="button" onClick={cancelEdit}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button type="button" title="Edit description" onClick={() => startEdit(t)}
                                className="p-1.5 text-gray-400 hover:text-blue-600"><Edit2 size={13}/></button>
                              <button type="button" title="Remove from library" disabled={deletingId===t.id} onClick={() => removeRow(t)}
                                className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-40"><Trash2 size={13}/></button>
                              <button type="button" onClick={() => onToggle(encodeConditionLine(t.category, t.description))}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold ${picked
                                  ? 'bg-green-100 text-green-700 border border-green-300'
                                  : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-700'}`}>
                                {picked ? '✓ Picked' : 'Pick'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
              {rows.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No conditions tagged "{tagFilter}"</td></tr>}
            </tbody>
          </table>

          <div className="px-4 py-3 border-t border-gray-100">
            {!showAdd ? (
              <button type="button" onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900">
                <Plus size={14}/> Add New Condition
              </button>
            ) : (
              <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Sub-heading (Name)</label>
                    <div className="flex items-center gap-1.5">
                      <select className={inp} value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                        {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="__new__">+ Add New Sub-heading…</option>
                      </select>
                      {newCategory !== '__new__' && (
                        <button type="button" title="Remove this sub-heading" disabled={deletingCategory} onClick={removeCategory}
                          className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-40 flex-shrink-0">
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </div>
                    {newCategory === '__new__' && (
                      <input className={`${inp} mt-1.5`} value={newCategoryCustom} onChange={e => setNewCategoryCustom(e.target.value)}
                        placeholder="Type the new sub-heading name…" />
                    )}
                  </div>
                  <div>
                    <label className={lbl}>Applies to (Tags)</label>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                      {allTags.map(t => (
                        <button key={t} type="button" onClick={() => toggleNewTag(t)}
                          className={`px-2 py-0.5 rounded-full text-xs border ${newTags.has(t)
                            ? 'bg-blue-100 border-blue-300 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-500'}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className={lbl}>Description</label>
                  <textarea rows={2} className={inp} value={newDescription} onChange={e => setNewDescription(e.target.value)}
                    placeholder="Enter the full clause text…" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={submitNew}
                    className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg">Save Condition</button>
                  <button type="button" onClick={() => { setShowAdd(false); setNewDescription(''); setNewTags(new Set()); setNewCategory(categoryNames[0] || '__new__'); setNewCategoryCustom('') }}
                    className="px-4 py-1.5 border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs font-semibold rounded-lg">Cancel</button>
                </div>
              </div>
            )}
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg">Done</button>
        </div>
      </div>
    </div>
  )
}

// ── SIGNATORY MANAGER (authorized persons + designations for the signature block) ─

function SignatoryManagerModal({ signatories, onSignatoriesChange, designations, onDesignationsChange, onClose }) {
  const designationNames = designations.map(d => d.name)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDesignation, setEditDesignation] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [deletingDesignation, setDeletingDesignation] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesignation, setNewDesignation] = useState(designationNames[0] || '__new__')
  const [newDesignationCustom, setNewDesignationCustom] = useState('')
  const [error, setError] = useState('')

  const startEdit = s => { setEditingId(s.id); setEditName(s.name); setEditDesignation(s.designation); setError('') }
  const cancelEdit = () => { setEditingId(null); setEditName(''); setEditDesignation('') }

  const saveEdit = async s => {
    if (!editName.trim() || !editDesignation.trim()) { setError('Name and designation are required'); return }
    setSavingId(s.id); setError('')
    try {
      const res = await updateSignatory(s.id, { name: editName.trim(), designation: editDesignation.trim() })
      onSignatoriesChange(prev => prev.map(x => x.id === s.id ? res.data.data : x))
      cancelEdit()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save')
    } finally { setSavingId(null) }
  }

  const removeSignatory = async s => {
    if (!confirm(`Remove "${s.name}" from the signatory list?`)) return
    setDeletingId(s.id); setError('')
    try {
      await deleteSignatory(s.id)
      onSignatoriesChange(prev => prev.filter(x => x.id !== s.id))
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to remove')
    } finally { setDeletingId(null) }
  }

  const submitNew = async () => {
    const designation = newDesignation === '__new__' ? newDesignationCustom.trim() : newDesignation
    if (!newName.trim()) { setError('Name is required'); return }
    if (!designation) { setError('Designation is required'); return }
    setError('')
    try {
      if (newDesignation === '__new__' && !designationNames.includes(designation)) {
        const res = await createSignatoryDesignation({ name: designation })
        onDesignationsChange(prev => [...prev, res.data.data])
      }
      const res = await createSignatory({ name: newName.trim(), designation })
      onSignatoriesChange(prev => [...prev, res.data.data])
      setNewName(''); setNewDesignation(designationNames[0] || '__new__'); setNewDesignationCustom(''); setShowAdd(false)
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to add')
    }
  }

  const removeDesignation = async () => {
    const d = designations.find(x => x.name === newDesignation)
    if (!d) return
    if (!confirm(`Remove the "${d.name}" designation from the list? Existing signatories already using it are unaffected.`)) return
    setDeletingDesignation(true); setError('')
    try {
      await deleteSignatoryDesignation(d.id)
      onDesignationsChange(prev => prev.filter(x => x.id !== d.id))
      setNewDesignation(designations.find(x => x.id !== d.id)?.name || '__new__')
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to remove designation')
    } finally { setDeletingDesignation(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Manage Signatories</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {signatories.map(s => {
            const editing = editingId === s.id
            return (
              <div key={s.id} className="border border-gray-200 rounded-lg p-3">
                {editing ? (
                  <div className="space-y-2">
                    <input className={inp} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
                    <select className={inp} value={editDesignation} onChange={e => setEditDesignation(e.target.value)}>
                      {designationNames.map(d => <option key={d} value={d}>{d}</option>)}
                      {!designationNames.includes(editDesignation) && <option value={editDesignation}>{editDesignation}</option>}
                    </select>
                    <div className="flex gap-2">
                      <button type="button" disabled={savingId===s.id} onClick={() => saveEdit(s)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
                        {savingId===s.id ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" onClick={cancelEdit}
                        className="px-3 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-500">{s.designation}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" title="Edit" onClick={() => startEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600"><Edit2 size={14}/></button>
                      <button type="button" title="Remove" disabled={deletingId===s.id} onClick={() => removeSignatory(s)}
                        className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-40"><Trash2 size={14}/></button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {signatories.length === 0 && <p className="text-sm text-gray-400 italic">No signatories yet.</p>}

          {!showAdd ? (
            <button type="button" onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 pt-1">
              <Plus size={14}/> Add New Signatory
            </button>
          ) : (
            <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div>
                <label className={lbl}>Name</label>
                <input className={inp} value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. R Satyanarayana" />
              </div>
              <div>
                <label className={lbl}>Designation</label>
                <div className="flex items-center gap-1.5">
                  <select className={inp} value={newDesignation} onChange={e => setNewDesignation(e.target.value)}>
                    {designationNames.map(d => <option key={d} value={d}>{d}</option>)}
                    <option value="__new__">+ Add New Designation…</option>
                  </select>
                  {newDesignation !== '__new__' && (
                    <button type="button" title="Remove this designation" disabled={deletingDesignation} onClick={removeDesignation}
                      className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-40 flex-shrink-0"><Trash2 size={14}/></button>
                  )}
                </div>
                {newDesignation === '__new__' && (
                  <input className={`${inp} mt-1.5`} value={newDesignationCustom} onChange={e => setNewDesignationCustom(e.target.value)}
                    placeholder="Type the new designation…" />
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={submitNew}
                  className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg">Save Signatory</button>
                <button type="button" onClick={() => { setShowAdd(false); setNewName(''); setNewDesignation(designationNames[0] || '__new__'); setNewDesignationCustom('') }}
                  className="px-4 py-1.5 border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs font-semibold rounded-lg">Cancel</button>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg">Done</button>
        </div>
      </div>
    </div>
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
  const [wo,             setWo]            = useState(null)
  const [loading,        setLoading]       = useState(true)
  const [remarks,        setRemarks]       = useState('')
  const [actErr,         setActErr]        = useState('')
  const [acting,         setActing]        = useState('')
  const [machinesList,   setMachinesList]  = useState([])
  const [approvalMachineId, setApprovalMachineId] = useState('')
  const [linkMachineId,  setLinkMachineId] = useState('')

  const load = () => {
    setLoading(true)
    getHireWorkOrder(woId).then(r => {
      const w = r.data.data
      setWo(w)
      setApprovalMachineId(w.machine_id ? String(w.machine_id) : '')
      setLoading(false)
    })
  }
  useEffect(load, [woId])
  useEffect(() => { getMachines().then(r => setMachinesList(r.data.data || [])).catch(() => {}) }, [])

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
          <div className="bg-gray-50 rounded-xl p-3 space-y-1 col-span-2">
            <p className="text-xs font-semibold text-gray-400 uppercase">Site &amp; Reporting</p>
            <p className="text-gray-700">{wo.site_address || wo.project_address || '—'}</p>
            <p className="text-gray-500">
              Reporting Date: {fmtDate(wo.reporting_date)}
              {(wo.site_contact_name || wo.site_contact_phone) && <> · Contact: {[wo.site_contact_name, wo.site_contact_phone].filter(Boolean).join(', ')}</>}
              {wo.mobilization_advance && <> · Mobilization Advance: {wo.mobilization_advance}</>}
            </p>
          </div>
          {wo.machine_id && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1 col-span-2">
              <p className="text-xs font-semibold text-blue-400 uppercase">Linked Asset</p>
              <p className="font-semibold text-blue-900">
                {wo.machine_slno}{wo.machine_nickname ? ` (${wo.machine_nickname})` : ''}
              </p>
              <p className="text-blue-700 text-sm">
                {wo.machine_eq_type}{wo.machine_reg_no ? ` · ${wo.machine_reg_no}` : ''}
              </p>
            </div>
          )}
        </div>

        {/* Items table */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Equipment Items</p>
          <div className="rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Equipment</th>
                  <th className="px-3 py-2 text-left">Reg No</th>
                  <th className="px-3 py-2 text-left">Make/Model/YOM</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Single Shift</th>
                  <th className="px-3 py-2 text-right">Double Shift</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it, i) => (
                  <tr key={it.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500">{i+1}</td>
                    <td className="px-3 py-2 text-gray-900">{it.equipment_desc}</td>
                    <td className="px-3 py-2 text-gray-600">{it.reg_no || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{[it.manufacturer, it.model, it.yom].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{it.quantity} {it.unit}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{it.rate_single_shift ? fmtMoney(it.rate_single_shift) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{it.rate_double_shift ? fmtMoney(it.rate_double_shift) : '—'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtMoney(it.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-blue-50 font-bold">
                  <td colSpan={7} className="px-3 py-2 text-right text-gray-700">Total</td>
                  <td className="px-3 py-2 text-right text-blue-700">{fmtMoney(wo.total_value)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Terms */}
        {wo.terms_conditions && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Additional / Special Conditions</p>
            <div className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-1.5">
              {numberedConditions(wo.terms_conditions).map(c => (
                <p key={c.n}>
                  {c.category
                    ? <><span className="font-bold text-gray-900">{c.n}) {c.category}</span><br/>{c.text}</>
                    : <>{c.n}) {c.text}</>}
                </p>
              ))}
            </div>
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

function defaultDescriptionLine(wo) {
  const it = (wo.items || [])[0]
  if (!it) return ''
  const siteSuffix = wo.site_address ? `, ${wo.site_address.split(',').slice(-2).join(',').trim()}` : ''
  return `Hire Work Order for Providing Service of ${ordinalQty(it.quantity)} No of ${it.equipment_desc} for our ${wo.project_name || wo.project_code} Project${siteSuffix}.`
}

function woHtml(wo, logoSrc) {
  const isApproved = wo.status === 'approved'
  const { items = [] } = wo
  const descLine = wo.description_line || defaultDescriptionLine(wo)
  const clauses = buildClauses(wo)

  const PERIOD_LABEL = { per_month:'Per Month', per_day:'Per Day', per_hour:'Per Hour', lump_sum:'Lump Sum' }
  const itemRows = items.flatMap((it, i) => {
    const periodLabel = PERIOD_LABEL[it.rate_type] || it.rate_type || '—'
    const shifts = []
    if (it.rate_single_shift) shifts.push({ label:'Single Shift', rate: it.rate_single_shift })
    if (it.rate_double_shift) shifts.push({ label:'Double Shift', rate: it.rate_double_shift })
    if (!shifts.length)       shifts.push({ label:'—',            rate: it.rate })
    const noteParts = [
      [it.manufacturer, it.model].filter(Boolean).join(' ') ? `Make/Model: ${[it.manufacturer, it.model].filter(Boolean).join(' ')}` : '',
      it.reg_no ? `Reg No: ${it.reg_no}` : '',
      it.yom    ? `YOM: ${it.yom}`       : '',
    ].filter(Boolean).join('  ·  ')
    return shifts.map((sh, si) => {
      const isFirst = si === 0
      const amt = (Number(it.quantity)||0) * (Number(sh.rate)||0)
      return `
    <tr>
      <td>${isFirst ? i+1 : ''}</td>
      <td>${isFirst ? (it.equipment_desc || '') : ''}</td>
      <td style="text-align:center">${isFirst ? `${it.quantity} ${it.unit}` : ''}</td>
      <td style="text-align:center">${isFirst ? periodLabel : ''}</td>
      <td style="text-align:center">${sh.label}</td>
      <td style="text-align:right">₹ ${Number(sh.rate||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
      <td style="text-align:right;font-weight:600">₹ ${amt.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
    </tr>
    ${isFirst && noteParts ? `<tr><td></td><td colspan="6" style="font-size:9.5px;color:#555;border-top:none;font-style:italic">${noteParts}</td></tr>` : ''}`
    })
  }).join('')

  const renderBodyItem = p => {
    if (p && typeof p === 'object') {
      return `${p.heading ? `<p class="clause-body" style="font-weight:700;margin-bottom:1px">${p.heading}</p>` : ''}<p class="clause-body" style="margin-top:0">${p.text}</p>`
    }
    return `<p class="clause-body">${p}</p>`
  }
  const clausesHtml = clauses.length ? `
    <p style="font-weight:700;font-family:Arial,sans-serif;font-size:12px;text-decoration:underline;margin:16px 0 6px">Terms &amp; Conditions</p>
    ${clauses.map((c, i) => `
    <div class="clause">
      <p class="clause-title">${i+2}) ${c.title}</p>
      ${c.body.map(renderBodyItem).join('')}
    </div>`).join('')}` : ''

  return `
  <html><head><meta charset="UTF-8"><style>
    body{font-family:'Times New Roman',Georgia,serif;font-size:12px;color:#1a1a1a;margin:30px;position:relative;line-height:1.5}
    h1{font-size:16px;margin:0;letter-spacing:.03em}
    table{width:100%;border-collapse:collapse;margin:8px 0}
    th,td{border:1px solid #999;padding:5px 7px;font-size:10.5px;vertical-align:top}
    th{background:#f2f2f2;color:#1a1a1a;font-weight:700}
    .header{display:flex;align-items:center;gap:16px;margin:-30px -30px 12px;padding:4px 30px}
    .header-logo{height:65px;width:auto;flex-shrink:0}
    .header-text{flex:1;text-align:center}
    .draft-watermark{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);
      font-size:90px;font-weight:900;color:rgba(200,200,200,0.35);white-space:nowrap;pointer-events:none;z-index:9999;
      font-family:Arial,sans-serif;letter-spacing:8px}
    .badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:10px;font-weight:700;
      background:#d1fae5;color:#065f46;font-family:Arial,sans-serif}
    .draft-badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:10px;font-weight:700;
      background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;font-family:Arial,sans-serif}
    .title-row{text-align:center;margin:6px 0 14px}
    .title-row h2{font-size:14px;text-decoration:underline;margin:4px 0}
    .desc-line{font-style:italic;text-align:center;margin:0 0 14px}
    .party-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:10px 0 16px}
    .party-box p{margin:1px 0}
    .party-label{font-weight:700;font-family:Arial,sans-serif;font-size:10.5px;color:#1e3a5f;text-transform:uppercase}
    .clause{margin:9px 0}
    .clause-title{font-weight:700;margin:0 0 2px;font-family:Arial,sans-serif;font-size:11px}
    .clause-body{margin:0 0 2px 14px;font-size:11px;text-align:justify}
    .sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:36px}
    .footer{margin-top:30px;font-size:9px;color:#888;text-align:center;font-family:Arial,sans-serif}
  </style></head><body>
    ${!isApproved ? '<div class="draft-watermark">DRAFT COPY</div>' : ''}
    <div class="header">
      ${isApproved && logoSrc ? `<img src="${logoSrc}" class="header-logo" alt="RVR" />` : ''}
      <div class="header-text">
        <h1>HIRE WORK ORDER</h1>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;font-family:Arial,sans-serif;font-size:11px">
      <p><b>Ref:</b> ${wo.wo_number}${wo.indent_number ? ` &nbsp;·&nbsp; <b>Indent No:</b> ${wo.indent_number}` : ''}${wo.vendor_offer_no ? ` &nbsp;·&nbsp; <b>Vendor Offer No:</b> ${wo.vendor_offer_no}` : ''}</p>
      <p><b>Date:</b> ${fmtDate(wo.wo_date)}</p>
    </div>
    <div style="text-align:right;margin-bottom:6px"><span class="${isApproved ? 'badge' : 'draft-badge'}">${(STATUS_META[wo.status]||{label:wo.status}).label}</span></div>

    ${!isApproved ? `
    <div style="font-family:Arial,sans-serif;font-size:9px;color:#666;margin-bottom:10px">
      ${wo.created_by_name ? `Created by ${wo.created_by_name} on ${fmtDateTime(wo.created_at)}` : ''}
      ${wo.updated_by_name ? ` &nbsp;·&nbsp; Last edited by ${wo.updated_by_name} on ${fmtDateTime(wo.updated_at)}` : ''}
    </div>` : ''}

    ${descLine ? `<p class="desc-line">${descLine}</p>` : ''}

    <p style="font-weight:700;font-family:Arial,sans-serif;font-size:11px">Between:</p>
    <div class="party-box">
      <p><b>M/s ${RVR_COMPANY.name}</b></p>
      ${RVR_COMPANY.addressLines.map(l => `<p>${l}</p>`).join('')}
      <p>GST No: ${RVR_COMPANY.gst}</p>
    </div>
    <p style="font-weight:700;font-family:Arial,sans-serif;font-size:11px;margin-top:10px">And</p>
    <div class="party-box">
      <p><b>M/s. ${wo.vendor_name || '—'}</b></p>
      ${wo.vendor_address ? `<p>${wo.vendor_address}</p>` : ''}
      ${wo.vendor_gst   ? `<p>GST No: ${wo.vendor_gst}</p>` : ''}
      ${wo.vendor_contact || wo.vendor_phone ? `<p>Contact: ${[wo.vendor_contact, wo.vendor_phone].filter(Boolean).join(', ')}</p>` : ''}
    </div>

    <div class="clause">
      <p class="clause-title">1) Equipment Particulars</p>
      <table>
        <thead><tr>
          <th>#</th><th>Equipment</th><th>Qty</th><th>Period</th><th>Shift</th><th>Rate</th><th>Amount</th>
        </tr></thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
    </div>

    ${clausesHtml}

    <p style="margin-top:18px">Thanking You,</p>

    <div class="sign-grid">
      <div>
        <p>For ${RVR_COMPANY.name},</p>
        <p style="margin-top:34px;font-weight:700">${wo.signatory_name || RVR_SIGNATORY.name}</p>
        <p>${wo.signatory_designation || RVR_SIGNATORY.title}</p>
      </div>
      <div>
        <p>Accepted by</p>
        <p style="margin-top:34px;font-weight:700">M/S. ${wo.vendor_name || ''}</p>
      </div>
    </div>

    <div class="footer">Generated by RVR DPR &amp; Utilization System · ${new Date().toLocaleString('en-IN')}</div>
  </body></html>`
}

async function downloadWOPDF(wo) {
  const { jsPDF }              = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw         = doc.internal.pageSize.getWidth()
  const ph         = doc.internal.pageSize.getHeight()
  const isApproved = wo.status === 'approved'
  const MARGIN     = 12

  const logoData = isApproved ? await fetchLogoBase64() : null

  const ensureSpace = (yPos, needed) => {
    if (yPos + needed > ph - 18) { doc.addPage(); return logoData ? 52 : 12 }
    return yPos
  }

  // page 1 header: logo + HIRE WORK ORDER title
  const LOGO_W = 35, LOGO_H = 50
  let y = 0
  if (logoData) { try { doc.addImage(logoData, 'PNG', MARGIN, y, LOGO_W, LOGO_H) } catch {} }
  doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(0)
  const titleY = y + LOGO_H / 2 + 2
  doc.text('HIRE WORK ORDER', pw/2, titleY, { align:'center' })
  y = y + LOGO_H + 4
  doc.setTextColor(0); doc.setFontSize(8.5); doc.setFont('helvetica','bold')
  const refLine = [`Ref: ${wo.wo_number}`, wo.indent_number && `Indent No: ${wo.indent_number}`, wo.vendor_offer_no && `Vendor Offer No: ${wo.vendor_offer_no}`].filter(Boolean).join('   ·   ')
  doc.text(doc.splitTextToSize(refLine, pw - 2*MARGIN - 30), MARGIN, y)
  doc.text(`Date: ${fmtDate(wo.wo_date)}`, pw-MARGIN, y, { align:'right' })
  y += 6
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(120)
  doc.text(`Status: ${(STATUS_META[wo.status]||{label:wo.status}).label}`, pw-MARGIN, y, { align:'right' })
  y += 6

  if (!isApproved) {
    const auditLine = [
      wo.created_by_name && `Created by ${wo.created_by_name} on ${fmtDateTime(wo.created_at)}`,
      wo.updated_by_name && `Last edited by ${wo.updated_by_name} on ${fmtDateTime(wo.updated_at)}`,
    ].filter(Boolean).join('   ·   ')
    if (auditLine) {
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(130)
      doc.text(auditLine, MARGIN, y)
      y += 5
    }
  }

  // title already drawn in page-1 header

  const descLine = wo.description_line || defaultDescriptionLine(wo)
  if (descLine) {
    doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(40)
    const lines = doc.splitTextToSize(descLine, pw-2*MARGIN)
    doc.text(lines, pw/2, y, { align:'center' })
    y += lines.length * 4 + 4
  }

  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(0)
  doc.text('Between:', MARGIN, y); y += 4.5
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5)
  doc.text(`M/s ${RVR_COMPANY.name}`, MARGIN, y); y += 4
  RVR_COMPANY.addressLines.forEach(l => { doc.text(l, MARGIN, y); y += 4 })
  doc.text(`GST No: ${RVR_COMPANY.gst}`, MARGIN, y); y += 6

  doc.setFont('helvetica','bold'); doc.setFontSize(9)
  doc.text('And', MARGIN, y); y += 4.5
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5)
  doc.text(`M/s. ${wo.vendor_name || '—'}`, MARGIN, y); y += 4
  if (wo.vendor_address) {
    const al = doc.splitTextToSize(wo.vendor_address, pw-2*MARGIN)
    doc.text(al, MARGIN, y); y += al.length * 4
  }
  if (wo.vendor_gst) { doc.text(`GST No: ${wo.vendor_gst}`, MARGIN, y); y += 4 }
  if (wo.vendor_contact || wo.vendor_phone) {
    doc.text(`Contact: ${[wo.vendor_contact, wo.vendor_phone].filter(Boolean).join(', ')}`, MARGIN, y); y += 4
  }
  y += 3

  y = ensureSpace(y, 20)
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(0)
  doc.text('1) Equipment Particulars', MARGIN, y); y += 3

  const PDF_PERIOD = { per_month:'Per Month', per_day:'Per Day', per_hour:'Per Hour', lump_sum:'Lump Sum' }
  const itemBody = []
  ;(wo.items || []).forEach((it, i) => {
    const periodLabel = PDF_PERIOD[it.rate_type] || it.rate_type || '—'
    const shifts = []
    if (it.rate_single_shift) shifts.push({ label:'Single Shift', rate: it.rate_single_shift })
    if (it.rate_double_shift) shifts.push({ label:'Double Shift', rate: it.rate_double_shift })
    if (!shifts.length)       shifts.push({ label:'—',            rate: it.rate })
    const noteParts = [
      [it.manufacturer, it.model].filter(Boolean).join(' ') ? `Make/Model: ${[it.manufacturer, it.model].filter(Boolean).join(' ')}` : '',
      it.reg_no ? `Reg No: ${it.reg_no}` : '',
      it.yom    ? `YOM: ${it.yom}`       : '',
    ].filter(Boolean).join('  ·  ')
    shifts.forEach((sh, si) => {
      const isFirst = si === 0
      const amt = (Number(it.quantity)||0) * (Number(sh.rate)||0)
      itemBody.push([
        isFirst ? i+1 : '',
        isFirst ? it.equipment_desc : '',
        isFirst ? `${it.quantity} ${it.unit}` : '',
        isFirst ? periodLabel : '',
        sh.label,
        `Rs. ${Number(sh.rate||0).toLocaleString('en-IN',{minimumFractionDigits:2})}`,
        `Rs. ${amt.toLocaleString('en-IN',{minimumFractionDigits:2})}`,
      ])
      if (isFirst && noteParts) itemBody.push([{ content: noteParts, colSpan: 7, styles: { fontStyle:'italic', fontSize:6.5, textColor:[90,90,90] } }])
    })
  })

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['#','Equipment','Qty','Period','Shift','Rate','Amount']],
    body: itemBody,
    styles:{ fontSize:7.5, cellPadding:1.8, lineColor:[180,180,180], lineWidth:0.3 },
    headStyles:{ fillColor:[255,255,255], textColor:[0,0,0], fontStyle:'bold', fontSize:7.5 },
    margin:{ left:MARGIN, right:MARGIN },
  })
  y = doc.lastAutoTable.finalY + 6

  // ── Terms & Conditions heading ────────────────────────────────────────────
  const clauses = buildClauses(wo)
  if (clauses.length) {
    y = ensureSpace(y, 10)
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0)
    doc.text('Terms & Conditions', MARGIN, y)
    const tcWidth = doc.getTextWidth('Terms & Conditions')
    doc.setLineWidth(0.35)
    doc.line(MARGIN, y + 1, MARGIN + tcWidth, y + 1)
    y += 7
  }

  // ── Numbered clauses ──────────────────────────────────────────────────────
  doc.setFontSize(8.5)
  clauses.forEach((c, idx) => {
    y = ensureSpace(y, 10)
    doc.setFont('helvetica','bold'); doc.setTextColor(0)
    doc.text(`${idx+2}) ${c.title}`, MARGIN, y); y += 4
    doc.setFont('helvetica','normal'); doc.setTextColor(40)
    c.body.forEach(p => {
      if (p && typeof p === 'object') {
        if (p.heading) {
          doc.setFont('helvetica','bold'); doc.setTextColor(0)
          const hLines = doc.splitTextToSize(p.heading, pw - 2*MARGIN - 4)
          y = ensureSpace(y, hLines.length * 3.6 + 1)
          doc.text(hLines, MARGIN+4, y)
          y += hLines.length * 3.6
        }
        doc.setFont('helvetica','normal'); doc.setTextColor(40)
        const tLines = doc.splitTextToSize(p.text, pw - 2*MARGIN - 4)
        y = ensureSpace(y, tLines.length * 3.6 + 2)
        doc.text(tLines, MARGIN+4, y)
        y += tLines.length * 3.6 + 1.5
        return
      }
      const lines = doc.splitTextToSize(p, pw - 2*MARGIN - 4)
      y = ensureSpace(y, lines.length * 3.6 + 2)
      doc.text(lines, MARGIN+4, y)
      y += lines.length * 3.6 + 1.5
    })
    y += 1
  })

  // Signature block
  y = ensureSpace(y, 30)
  y += 6
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(0)
  doc.text('Thanking You,', MARGIN, y); y += 8

  const colW = (pw - 2*MARGIN) / 2
  doc.text(`For ${RVR_COMPANY.name},`, MARGIN, y)
  doc.text('Accepted by', MARGIN + colW, y)
  y += 14
  doc.setFont('helvetica','bold')
  doc.text(wo.signatory_name || RVR_SIGNATORY.name, MARGIN, y)
  doc.text(`M/S. ${wo.vendor_name || ''}`, MARGIN + colW, y)
  y += 4
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5)
  doc.text(wo.signatory_designation || RVR_SIGNATORY.title, MARGIN, y)

  // per-page: logo + heading on continuation pages, page numbers, DRAFT watermark
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    if (i > 1 && logoData) {
      try { doc.addImage(logoData, 'PNG', MARGIN, 0, 35, 50) } catch {}
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120)
    doc.text(`Page ${i} of ${totalPages}`, pw/2, ph - 8, { align: 'center' })
    if (!isApproved) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(58)
      doc.setTextColor(210, 210, 210)
      doc.text('DRAFT COPY', pw/2, ph/2, { align: 'center', angle: 45 })
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
  const [editLoading, setEditLoading] = useState(false)
  const [viewWOId,    setViewWOId]    = useState(null)
  const [renewWO,     setRenewWO]     = useState(null)

  // The list rows don't include equipment items — fetch the full WO before editing
  // so equipment items, reg no, rates etc. aren't wiped out when the form loads.
  const openEdit = async wo => {
    setEditLoading(true)
    try {
      const r = await getHireWorkOrder(wo.id)
      setEditWO(r.data.data)
      setShowCreate(true)
    } finally { setEditLoading(false) }
  }

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
                        <button type="button" onClick={() => setViewWOId(wo.id)} className="hover:underline">
                          {wo.wo_number}
                        </button>
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
                            <button onClick={() => openEdit(wo)} disabled={editLoading} title="Edit" className="p-1.5 text-gray-500 hover:text-blue-600 disabled:opacity-40"><Edit2 size={15}/></button>
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
