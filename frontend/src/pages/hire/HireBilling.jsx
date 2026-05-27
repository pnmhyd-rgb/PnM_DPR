import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getHireBills, getHireBill, getHireWorkOrders, fetchHireDprData,
  createHireBill, updateHireBill, deleteHireBill,
  submitHireBill, approveHireBill, rejectHireBill, markHireBillPaid,
  updateWoBillingRules,
} from '../../lib/api'
import {
  Plus, Eye, Edit2, Trash2, X, Search, RefreshCw, Loader2,
  AlertCircle, CheckCircle, XCircle, FileText, Download,
  ShieldCheck, ShieldX, CreditCard, ChevronDown, ChevronRight,
  Database, ToggleLeft, ToggleRight,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-IN') : '—'
const fmtMoney = v => v != null ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'

const STATUS_META = {
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-600' },
  submitted: { label: 'Submitted', color: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: 'Approved',  color: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Rejected',  color: 'bg-red-100 text-red-600' },
  paid:      { label: 'Paid',      color: 'bg-blue-100 text-blue-700' },
}

function Badge({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${m.color}`}>{m.label}</span>
}

const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const lbl = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

// ── toast ────────────────────────────────────────────────────────────────────

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium
      ${toast.type === 'success' ? 'bg-green-600 text-white' :
        toast.type === 'warn'    ? 'bg-amber-500 text-white' : 'bg-red-600 text-white'}`}>
      {toast.type === 'success' ? <ShieldCheck size={16}/> : toast.type === 'warn' ? <AlertCircle size={16}/> : <ShieldX size={16}/>}
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

// ── modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} max-h-[94vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

// ── default billing rules ─────────────────────────────────────────────────────

const DEFAULT_RULES = {
  overtime_applicable:     false,
  overtime_threshold_hrs:  8,
  overtime_rate_multiplier:1.5,
  sunday_applicable:       false,
  sunday_rate_multiplier:  2.0,
  holiday_applicable:      false,
  holiday_rate_multiplier: 2.0,
  prorata_applicable:      true,
}

// ── item amount calculator ────────────────────────────────────────────────────

function calcItemAmounts(item, rules, calDays) {
  const rate         = parseFloat(item.rate)        || 0
  const qty          = parseFloat(item.quantity)    || 1
  const workDays     = parseFloat(item.working_days) || 0
  const workHrs      = parseFloat(item.working_hours)|| 0
  const sunDays      = parseInt(item.sunday_days)   || 0
  const otHrs        = parseFloat(item.overtime_hrs) || 0
  const cal          = calDays || 30

  let base = 0, otAmt = 0, sunAmt = 0

  if (item.rate_type === 'per_month') {
    base   = rules?.prorata_applicable ? rate * qty * (workDays / cal) : rate * qty
    const hrRate = rate / (cal * (rules?.overtime_threshold_hrs || 8))
    if (rules?.overtime_applicable)
      otAmt  = otHrs * hrRate * qty * (rules?.overtime_rate_multiplier || 1.5)
    if (rules?.sunday_applicable)
      sunAmt = sunDays * (rate / cal) * qty * ((rules?.sunday_rate_multiplier || 2.0) - 1)
  } else if (item.rate_type === 'per_day') {
    base   = rate * workDays * qty
    if (rules?.overtime_applicable)
      otAmt  = otHrs * (rate / (rules?.overtime_threshold_hrs || 8)) * qty * (rules?.overtime_rate_multiplier || 1.5)
    if (rules?.sunday_applicable)
      sunAmt = sunDays * rate * qty * ((rules?.sunday_rate_multiplier || 2.0) - 1)
  } else if (item.rate_type === 'per_hour') {
    base   = rate * workHrs * qty
    if (rules?.overtime_applicable)
      otAmt  = otHrs * rate * qty * (rules?.overtime_rate_multiplier || 1.5)
  } else {
    // lump_sum
    base = rate * qty
  }

  return {
    base_amount:     Math.round(base * 100) / 100,
    overtime_amount: Math.round(otAmt * 100) / 100,
    sunday_amount:   Math.round(sunAmt * 100) / 100,
    total_amount:    Math.round((base + otAmt + sunAmt) * 100) / 100,
  }
}

// ── billing rules panel ───────────────────────────────────────────────────────

function BillingRulesPanel({ rules, onChange }) {
  const [open, setOpen] = useState(false)
  const set = (key, val) => onChange({ ...rules, [key]: val })

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
        <span className="flex items-center gap-2">Billing Rules
          <span className="text-xs font-normal text-gray-400">(OT, Sunday, Pro-rata)</span>
        </span>
        {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
      </button>
      {open && (
        <div className="p-4 space-y-4">
          {/* Overtime */}
          <div className="space-y-2">
            <Toggle k="overtime_applicable" label="Overtime Applicable" />
            {rules.overtime_applicable && (
              <div className="ml-4 grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Threshold Hrs/Day</label>
                  <input type="number" step="0.5" className={inp} value={rules.overtime_threshold_hrs}
                    onChange={e => set('overtime_threshold_hrs', parseFloat(e.target.value) || 8)} />
                </div>
                <div>
                  <label className={lbl}>OT Rate Multiplier</label>
                  <input type="number" step="0.25" className={inp} value={rules.overtime_rate_multiplier}
                    onChange={e => set('overtime_rate_multiplier', parseFloat(e.target.value) || 1.5)}
                    placeholder="1.5 = 150% of rate" />
                </div>
              </div>
            )}
          </div>
          {/* Sunday */}
          <div className="space-y-2">
            <Toggle k="sunday_applicable" label="Sunday Premium" />
            {rules.sunday_applicable && (
              <div className="ml-4 grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Sunday Rate Multiplier</label>
                  <input type="number" step="0.25" className={inp} value={rules.sunday_rate_multiplier}
                    onChange={e => set('sunday_rate_multiplier', parseFloat(e.target.value) || 2.0)}
                    placeholder="2.0 = double rate" />
                </div>
              </div>
            )}
          </div>
          {/* Holiday */}
          <div className="space-y-2">
            <Toggle k="holiday_applicable" label="Holiday Premium" />
            {rules.holiday_applicable && (
              <div className="ml-4 grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Holiday Rate Multiplier</label>
                  <input type="number" step="0.25" className={inp} value={rules.holiday_rate_multiplier}
                    onChange={e => set('holiday_rate_multiplier', parseFloat(e.target.value) || 2.0)} />
                </div>
              </div>
            )}
          </div>
          {/* Pro-rata */}
          <Toggle k="prorata_applicable" label="Pro-rata (partial month)" />
          {rules.prorata_applicable && (
            <p className="ml-4 text-xs text-gray-400">Bill is calculated proportional to working days ÷ calendar days in period.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── bill item row ─────────────────────────────────────────────────────────────

function BillItemRow({ item, rules, calDays, onChange }) {
  const amts = calcItemAmounts(item, rules, calDays)
  const set  = k => e => {
    const updated = { ...item, [k]: e.target.value }
    const a = calcItemAmounts(updated, rules, calDays)
    onChange({ ...updated, ...a })
  }
  const setNum = k => e => {
    const updated = { ...item, [k]: parseFloat(e.target.value) || 0 }
    const a = calcItemAmounts(updated, rules, calDays)
    onChange({ ...updated, ...a })
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-start gap-2">
        <p className="text-sm font-medium text-gray-800 flex-1 truncate">{item.equipment_desc}</p>
        <span className="text-xs text-gray-400 capitalize whitespace-nowrap">{item.rate_type?.replace('_',' ')}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div>
          <label className="block text-gray-400 mb-0.5">Rate (₹)</label>
          <input type="number" className={`${inp} text-xs py-1.5`} value={item.rate} onChange={set('rate')} />
        </div>
        <div>
          <label className="block text-gray-400 mb-0.5">Working Days</label>
          <input type="number" step="0.5" className={`${inp} text-xs py-1.5`} value={item.working_days} onChange={setNum('working_days')} />
        </div>
        <div>
          <label className="block text-gray-400 mb-0.5">Working Hrs</label>
          <input type="number" step="0.5" className={`${inp} text-xs py-1.5`} value={item.working_hours} onChange={setNum('working_hours')} />
        </div>
        <div>
          <label className="block text-gray-400 mb-0.5">Qty</label>
          <input type="number" step="0.5" className={`${inp} text-xs py-1.5`} value={item.quantity} onChange={setNum('quantity')} />
        </div>
        {(rules?.overtime_applicable || rules?.sunday_applicable) && (
          <>
            <div>
              <label className="block text-gray-400 mb-0.5">Sunday Days</label>
              <input type="number" className={`${inp} text-xs py-1.5`} value={item.sunday_days} onChange={setNum('sunday_days')} />
            </div>
            <div>
              <label className="block text-gray-400 mb-0.5">OT Hrs</label>
              <input type="number" step="0.5" className={`${inp} text-xs py-1.5`} value={item.overtime_hrs} onChange={setNum('overtime_hrs')} />
            </div>
          </>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-800">
        <div><span className="text-gray-400">Base:</span> {fmtMoney(amts.base_amount)}</div>
        {rules?.overtime_applicable && <div><span className="text-gray-400">OT:</span> {fmtMoney(amts.overtime_amount)}</div>}
        {rules?.sunday_applicable   && <div><span className="text-gray-400">Sun:</span> {fmtMoney(amts.sunday_amount)}</div>}
        <div className="font-bold"><span className="text-gray-400">Total:</span> {fmtMoney(amts.total_amount)}</div>
      </div>
    </div>
  )
}

// ── CREATE / EDIT BILL MODAL ──────────────────────────────────────────────────

function BillModal({ bill, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [workOrders,  setWorkOrders]  = useState([])
  const [selectedWO,  setSelectedWO]  = useState(null)
  const [fetching,    setFetching]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const [form, setForm] = useState({
    wo_id:              bill?.wo_id || '',
    billing_period_from:bill?.billing_period_from?.slice(0,10) || '',
    billing_period_to:  bill?.billing_period_to?.slice(0,10)   || '',
    total_calendar_days:bill?.total_calendar_days  || 0,
    total_working_days: bill?.total_working_days   || 0,
    total_working_hours:bill?.total_working_hours  || 0,
    sunday_days_worked: bill?.sunday_days_worked   || 0,
    overtime_hours:     bill?.overtime_hours       || 0,
    other_additions:    bill?.other_additions      || 0,
    deductions:         bill?.deductions           || 0,
    gst_percent:        bill?.gst_percent          ?? 18,
    vendor_bill_no:     bill?.vendor_bill_no       || '',
    vendor_bill_date:   bill?.vendor_bill_date?.slice(0,10) || '',
    remarks:            bill?.remarks              || '',
  })

  const [rules, setRules] = useState(
    bill?.billing_rules ? (typeof bill.billing_rules === 'string' ? JSON.parse(bill.billing_rules) : bill.billing_rules)
    : { ...DEFAULT_RULES }
  )
  const [items,  setItems]  = useState([])

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setFN = k => e => setForm(f => ({ ...f, [k]: parseFloat(e.target.value) || 0 }))

  // Load approved WOs
  useEffect(() => {
    getHireWorkOrders({ status: 'approved' }).then(r => setWorkOrders(r.data.data))
    if (bill?.wo_id) {
      const wo = workOrders.find(w => String(w.id) === String(bill.wo_id))
      if (wo) setSelectedWO(wo)
    }
  }, [])

  // Load existing bill items on edit
  useEffect(() => {
    if (bill?.id) {
      getHireBill(bill.id).then(r => {
        const b = r.data.data
        if (b.billing_rules) {
          setRules(typeof b.billing_rules === 'string' ? JSON.parse(b.billing_rules) : b.billing_rules)
        }
        setItems((b.items || []).map(it => ({ ...it })))
      })
    }
  }, [])

  // Auto-calc calendar days
  useEffect(() => {
    if (form.billing_period_from && form.billing_period_to) {
      const cal = Math.round((new Date(form.billing_period_to) - new Date(form.billing_period_from)) / (1000*60*60*24)) + 1
      setForm(f => ({ ...f, total_calendar_days: cal }))
    }
  }, [form.billing_period_from, form.billing_period_to])

  // When WO changes, load its billing rules
  useEffect(() => {
    const wo = workOrders.find(w => String(w.id) === String(form.wo_id))
    setSelectedWO(wo || null)
    if (wo?.billing_rules) {
      setRules(typeof wo.billing_rules === 'string' ? JSON.parse(wo.billing_rules) : wo.billing_rules)
    }
  }, [form.wo_id, workOrders])

  const fetchDpr = async () => {
    if (!form.wo_id || !form.billing_period_from || !form.billing_period_to) {
      setError('Select Work Order and billing period first'); return
    }
    setFetching(true); setError('')
    try {
      const r = await fetchHireDprData({
        wo_id: form.wo_id,
        from:  form.billing_period_from,
        to:    form.billing_period_to,
      })
      const data = r.data.data
      const calDays = r.data.calendar_days
      setForm(f => ({
        ...f,
        total_calendar_days: calDays,
        total_working_days:  data.reduce((s, i) => s + (i.working_days || 0), 0),
        total_working_hours: data.reduce((s, i) => s + (i.working_hours || 0), 0),
        sunday_days_worked:  data.reduce((s, i) => s + (i.sunday_days || 0), 0),
      }))
      setItems(data.map(it => {
        const base = calcItemAmounts({ ...it, rate: it.rate || 0 }, rules, calDays)
        return { ...it, ...base }
      }))
    } catch {
      setError('Failed to fetch DPR data')
    } finally { setFetching(false) }
  }

  const updateItem = (idx, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? val : it))
  }

  // Recalculate on rules change
  useEffect(() => {
    setItems(prev => prev.map(it => {
      const a = calcItemAmounts(it, rules, form.total_calendar_days || 30)
      return { ...it, ...a }
    }))
  }, [rules, form.total_calendar_days])

  // Derived totals
  const baseTotal = items.reduce((s, i) => s + (parseFloat(i.base_amount) || 0), 0)
  const otTotal   = items.reduce((s, i) => s + (parseFloat(i.overtime_amount) || 0), 0)
  const sunTotal  = items.reduce((s, i) => s + (parseFloat(i.sunday_amount) || 0), 0)
  const itemsTotal = items.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0)
  const additions  = parseFloat(form.other_additions) || 0
  const deductions = parseFloat(form.deductions) || 0
  const net        = itemsTotal + additions - deductions
  const gstAmt     = Math.round(net * (parseFloat(form.gst_percent) || 0) / 100 * 100) / 100
  const total      = net + gstAmt

  const save = async () => {
    if (!form.wo_id) { setError('Select a work order'); return }
    if (!form.billing_period_from || !form.billing_period_to) { setError('Set billing period'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        base_amount:    baseTotal,
        overtime_amount:otTotal,
        sunday_amount:  sunTotal,
        net_amount:     net,
        gst_amount:     gstAmt,
        total_amount:   total,
        items,
        billing_rules:  rules,
      }
      if (bill?.id) await updateHireBill(bill.id, payload)
      else          await createHireBill(payload)
      onSaved()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={bill ? `Edit Bill — ${bill.bill_number}` : 'New Hire Bill'} onClose={onClose} wide>
      <div className="p-5 space-y-6">

        {/* Section 1: WO & Period */}
        <section>
          <p className={`${lbl} mb-3`}>Work Order &amp; Billing Period</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3 md:col-span-1">
              <label className={lbl}>Work Order * (Approved only)</label>
              <select className={inp} value={form.wo_id} onChange={setF('wo_id')}>
                <option value="">— select WO —</option>
                {workOrders.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.wo_number} · {w.vendor_name} · {w.project_code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Period From *</label>
              <input type="date" className={inp} value={form.billing_period_from} onChange={setF('billing_period_from')} />
            </div>
            <div>
              <label className={lbl}>Period To *</label>
              <input type="date" className={inp} value={form.billing_period_to} onChange={setF('billing_period_to')} />
            </div>
            {form.total_calendar_days > 0 && (
              <div className="col-span-3 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                <span>Period: <strong>{form.total_calendar_days} calendar days</strong></span>
              </div>
            )}
          </div>

          {/* DPR fetch button */}
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={fetchDpr} disabled={fetching || !form.wo_id}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {fetching ? <Loader2 size={14} className="animate-spin"/> : <Database size={14}/>}
              {fetching ? 'Fetching…' : 'Load from DPR Log'}
            </button>
            <span className="text-xs text-gray-400">Auto-fills working days &amp; hours from DPR entries</span>
          </div>
        </section>

        {/* Section 2: Billing Rules */}
        <section>
          <p className={`${lbl} mb-3`}>Billing Rules</p>
          <BillingRulesPanel rules={rules} onChange={setRules} />
        </section>

        {/* Section 3: Equipment Items */}
        {items.length > 0 && (
          <section>
            <p className={`${lbl} mb-3`}>Equipment / Working Details</p>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <BillItemRow key={idx} item={item} rules={rules}
                  calDays={form.total_calendar_days || 30}
                  onChange={val => updateItem(idx, val)} />
              ))}
            </div>
          </section>
        )}

        {/* Section 4: Bill Summary */}
        <section>
          <p className={`${lbl} mb-3`}>Bill Summary</p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Equipment Base Total</span><span className="font-medium">{fmtMoney(baseTotal)}</span></div>
            {otTotal > 0  && <div className="flex justify-between"><span className="text-gray-500">Overtime Amount</span><span className="font-medium">{fmtMoney(otTotal)}</span></div>}
            {sunTotal > 0 && <div className="flex justify-between"><span className="text-gray-500">Sunday Premium</span><span className="font-medium">{fmtMoney(sunTotal)}</span></div>}
            <div className="border-t border-gray-200 pt-2 flex justify-between"><span className="text-gray-500">Items Sub-total</span><span className="font-medium">{fmtMoney(itemsTotal)}</span></div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className={lbl}>Other Additions (₹)</label>
                <input type="number" step="0.01" className={inp} value={form.other_additions} onChange={setFN('other_additions')} placeholder="0" />
              </div>
              <div>
                <label className={lbl}>Deductions (₹)</label>
                <input type="number" step="0.01" className={inp} value={form.deductions} onChange={setFN('deductions')} placeholder="0" />
              </div>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2"><span className="font-semibold text-gray-700">Net Amount</span><span className="font-semibold text-gray-900">{fmtMoney(net)}</span></div>
            <div className="flex items-center gap-2">
              <label className={lbl + ' mb-0 whitespace-nowrap'}>GST %</label>
              <input type="number" step="0.5" className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.gst_percent} onChange={setFN('gst_percent')} />
              <span className="flex-1 text-right text-sm text-gray-600">GST: {fmtMoney(gstAmt)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-200 bg-blue-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
              <span className="font-bold text-gray-900 text-base">TOTAL BILL AMOUNT</span>
              <span className="font-bold text-blue-700 text-base">{fmtMoney(total)}</span>
            </div>
          </div>
        </section>

        {/* Section 5: Vendor Bill Reference */}
        <section>
          <p className={`${lbl} mb-3`}>Vendor Bill Reference</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Vendor Bill No</label>
              <input className={inp} value={form.vendor_bill_no} onChange={setF('vendor_bill_no')} placeholder="Vendor's invoice number" />
            </div>
            <div>
              <label className={lbl}>Vendor Bill Date</label>
              <input type="date" className={inp} value={form.vendor_bill_date} onChange={setF('vendor_bill_date')} />
            </div>
            <div className="col-span-1">
              <label className={lbl}>Remarks</label>
              <input className={inp} value={form.remarks} onChange={setF('remarks')} placeholder="Optional notes" />
            </div>
          </div>
        </section>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2"><AlertCircle size={14}/>{error}</p>}

        <div className="flex gap-3 pb-2">
          <button onClick={save} disabled={saving}
            className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
            {saving ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin"/>Saving…</span> : bill ? 'Update Bill' : 'Create Bill'}
          </button>
          <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}

// ── BILL DETAIL MODAL ─────────────────────────────────────────────────────────

function BillDetailModal({ billId, onClose, onAction }) {
  const { isAdmin } = useAuth()
  const [bill,    setBill]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [remarks, setRemarks] = useState('')
  const [payForm, setPayForm] = useState({ payment_date: '', payment_reference: '', payment_mode: 'NEFT' })
  const [acting,  setActing]  = useState('')
  const [actErr,  setActErr]  = useState('')
  const [showPay, setShowPay] = useState(false)
  const { toast, show: showToast } = useToast()

  const load = () => {
    setLoading(true)
    getHireBill(billId).then(r => { setBill(r.data.data); setLoading(false) })
  }
  useEffect(load, [billId])

  const action = async (fn, label) => {
    setActing(label); setActErr('')
    try { await fn(); load(); onAction?.() }
    catch (e) { setActErr(e.response?.data?.error || 'Action failed') }
    finally { setActing('') }
  }

  if (loading) return (
    <Modal title="Bill Detail" onClose={onClose} wide>
      <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-blue-600"/></div>
    </Modal>
  )

  const rules = bill.billing_rules ? (typeof bill.billing_rules === 'string' ? JSON.parse(bill.billing_rules) : bill.billing_rules) : {}

  return (
    <>
      <Modal title={`Hire Bill — ${bill.bill_number}`} onClose={onClose} wide>
        <div className="p-5 space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-lg font-bold text-gray-900">{bill.bill_number}</span>
                <Badge status={bill.status} />
              </div>
              <p className="text-sm text-gray-500">
                Period: {fmtDate(bill.billing_period_from)} — {fmtDate(bill.billing_period_to)}
                {bill.wo_number && <> · WO: <span className="font-medium text-blue-700">{bill.wo_number}</span></>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-blue-700">{fmtMoney(bill.total_amount)}</p>
              <p className="text-xs text-gray-400">Total Bill Amount</p>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase">Vendor</p>
              <p className="font-semibold text-gray-900">{bill.vendor_name}</p>
              {bill.vendor_phone && <p className="text-gray-500">{bill.vendor_phone}</p>}
              {bill.vendor_gst   && <p className="text-gray-500">GST: {bill.vendor_gst}</p>}
              {bill.bank_name    && <p className="text-gray-500">{bill.bank_name} · {bill.bank_ifsc}</p>}
            </div>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase">Project</p>
              <p className="font-semibold text-gray-900">{bill.project_code} {bill.project_name ? `— ${bill.project_name}` : ''}</p>
              <p className="text-gray-500">Calendar Days: {bill.total_calendar_days}</p>
              <p className="text-gray-500">Working Days: {bill.total_working_days}</p>
              {bill.total_working_hours > 0 && <p className="text-gray-500">Working Hrs: {bill.total_working_hours}</p>}
              {bill.sunday_days_worked > 0  && <p className="text-gray-500">Sundays Worked: {bill.sunday_days_worked}</p>}
              {bill.overtime_hours > 0      && <p className="text-gray-500">OT Hrs: {bill.overtime_hours}</p>}
            </div>
          </div>

          {/* Items */}
          {bill.items?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Equipment Items</p>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Equipment</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Days</th>
                      <th className="px-3 py-2 text-right">Hrs</th>
                      <th className="px-3 py-2 text-right">Base</th>
                      {rules.overtime_applicable && <th className="px-3 py-2 text-right">OT</th>}
                      {rules.sunday_applicable   && <th className="px-3 py-2 text-right">Sun</th>}
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bill.items.map((it, i) => (
                      <tr key={it.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-900">{it.equipment_desc}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmtMoney(it.rate)} <span className="text-xs text-gray-400">/{it.rate_type?.replace('per_','')}</span></td>
                        <td className="px-3 py-2 text-right text-gray-600">{it.working_days}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{it.working_hours}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(it.base_amount)}</td>
                        {rules.overtime_applicable && <td className="px-3 py-2 text-right">{fmtMoney(it.overtime_amount)}</td>}
                        {rules.sunday_applicable   && <td className="px-3 py-2 text-right">{fmtMoney(it.sunday_amount)}</td>}
                        <td className="px-3 py-2 text-right font-medium">{fmtMoney(it.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Amount summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Base Amount</span><span>{fmtMoney(bill.base_amount)}</span></div>
            {parseFloat(bill.overtime_amount) > 0 && <div className="flex justify-between"><span className="text-gray-500">Overtime</span><span>{fmtMoney(bill.overtime_amount)}</span></div>}
            {parseFloat(bill.sunday_amount) > 0   && <div className="flex justify-between"><span className="text-gray-500">Sunday Premium</span><span>{fmtMoney(bill.sunday_amount)}</span></div>}
            {parseFloat(bill.other_additions) > 0 && <div className="flex justify-between"><span className="text-gray-500">Other Additions</span><span>{fmtMoney(bill.other_additions)}</span></div>}
            {parseFloat(bill.deductions) > 0       && <div className="flex justify-between"><span className="text-gray-500">Deductions</span><span className="text-red-600">— {fmtMoney(bill.deductions)}</span></div>}
            <div className="flex justify-between border-t border-gray-200 pt-2"><span className="font-semibold">Net Amount</span><span className="font-semibold">{fmtMoney(bill.net_amount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">GST ({bill.gst_percent}%)</span><span>{fmtMoney(bill.gst_amount)}</span></div>
            <div className="flex justify-between text-base font-bold text-blue-700 border-t border-gray-200 pt-2"><span>TOTAL</span><span>{fmtMoney(bill.total_amount)}</span></div>
          </div>

          {/* Vendor bill ref */}
          {(bill.vendor_bill_no || bill.vendor_bill_date) && (
            <div className="text-sm text-gray-600">
              {bill.vendor_bill_no && <span>Vendor Bill: <strong>{bill.vendor_bill_no}</strong></span>}
              {bill.vendor_bill_date && <span className="ml-3">Date: {fmtDate(bill.vendor_bill_date)}</span>}
            </div>
          )}

          {/* Payment info */}
          {bill.status === 'paid' && (
            <div className="bg-blue-50 rounded-xl p-3 text-sm space-y-1">
              <p className="font-semibold text-blue-800 flex items-center gap-2"><CreditCard size={14}/>Payment</p>
              {bill.payment_date      && <p className="text-gray-600">Date: {fmtDate(bill.payment_date)}</p>}
              {bill.payment_reference && <p className="text-gray-600">Ref: {bill.payment_reference}</p>}
              {bill.payment_mode      && <p className="text-gray-600">Mode: {bill.payment_mode}</p>}
              {bill.paid_by_name      && <p className="text-gray-500 text-xs">Marked by: {bill.paid_by_name}</p>}
            </div>
          )}

          {/* Remarks / approval info */}
          {bill.approval_remarks && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
              <p className="font-semibold mb-0.5">Remarks:</p>
              <p>{bill.approval_remarks}</p>
            </div>
          )}

          {/* Admin action area */}
          {isAdmin && bill.status === 'submitted' && (
            <div className="space-y-2">
              <label className={lbl}>Remarks (for approval / rejection)</label>
              <textarea rows={2} className={inp} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Enter remarks…"/>
            </div>
          )}

          {/* Payment form */}
          {showPay && bill.status === 'approved' && isAdmin && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <p className={lbl}>Mark as Paid — Payment Details</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={lbl}>Payment Date</label><input type="date" className={inp} value={payForm.payment_date} onChange={e => setPayForm(f => ({...f, payment_date: e.target.value}))} /></div>
                <div><label className={lbl}>Reference / UTR / Cheque</label><input className={inp} value={payForm.payment_reference} onChange={e => setPayForm(f => ({...f, payment_reference: e.target.value}))} placeholder="UTR / cheque no" /></div>
                <div>
                  <label className={lbl}>Payment Mode</label>
                  <select className={inp} value={payForm.payment_mode} onChange={e => setPayForm(f => ({...f, payment_mode: e.target.value}))}>
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="IMPS">IMPS</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                  </select>
                </div>
              </div>
              <button onClick={() => action(() => markHireBillPaid(bill.id, payForm), 'pay')} disabled={acting === 'pay'}
                className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg">
                {acting === 'pay' ? <Loader2 size={14} className="animate-spin"/> : <CreditCard size={14}/>} Confirm Payment
              </button>
            </div>
          )}

          {actErr && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{actErr}</p>}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {bill.status === 'draft' && (
              <button onClick={() => action(() => submitHireBill(bill.id), 'submit')} disabled={acting === 'submit'}
                className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
                {acting === 'submit' ? <Loader2 size={14} className="animate-spin"/> : <FileText size={14}/>} Submit for Approval
              </button>
            )}
            {isAdmin && bill.status === 'submitted' && (
              <>
                <button onClick={() => action(() => approveHireBill(bill.id, { remarks }), 'approve')} disabled={acting === 'approve'}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
                  {acting === 'approve' ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>} Approve
                </button>
                <button onClick={() => action(() => rejectHireBill(bill.id, { remarks }), 'reject')} disabled={acting === 'reject'}
                  className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
                  {acting === 'reject' ? <Loader2 size={14} className="animate-spin"/> : <XCircle size={14}/>} Reject
                </button>
              </>
            )}
            {isAdmin && bill.status === 'approved' && (
              <button onClick={() => setShowPay(v => !v)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
                <CreditCard size={14}/> {showPay ? 'Cancel' : 'Mark Paid'}
              </button>
            )}
            <button onClick={() => downloadBillPDF(bill)}
              className="flex items-center gap-1.5 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg">
              <FileText size={14}/> PDF
            </button>
            <button onClick={() => downloadBillWord(bill)}
              className="flex items-center gap-1.5 border border-blue-300 text-blue-700 hover:bg-blue-50 text-sm font-medium px-4 py-2 rounded-lg">
              <Download size={14}/> Word
            </button>
            <button onClick={() => downloadBillExcel(bill)}
              className="flex items-center gap-1.5 border border-green-300 text-green-700 hover:bg-green-50 text-sm font-medium px-4 py-2 rounded-lg">
              <Download size={14}/> Excel
            </button>
          </div>
        </div>
      </Modal>
      <Toast toast={toast}/>
    </>
  )
}

// ── PDF DOWNLOAD ──────────────────────────────────────────────────────────────

async function downloadBillPDF(bill) {
  const { jsPDF }              = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw   = doc.internal.pageSize.getWidth()
  const rules = bill.billing_rules ? (typeof bill.billing_rules === 'string' ? JSON.parse(bill.billing_rules) : bill.billing_rules) : {}

  // Header bar
  doc.setFillColor(30, 58, 95)
  doc.rect(0, 0, pw, 22, 'F')
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(255,255,255)
  doc.text('RVR PROJECTS PVT LTD', pw/2, 9, { align:'center' })
  doc.setFontSize(9); doc.setFont('helvetica','normal')
  doc.text('HIRE BILLING', pw/2, 15, { align:'center' })

  let y = 28
  doc.setTextColor(0); doc.setFontSize(9)
  doc.setFont('helvetica','bold')
  doc.text(`Bill No: ${bill.bill_number}`, 14, y)
  doc.text(`WO: ${bill.wo_number}`, pw/2, y, { align:'center' })
  doc.text(`Status: ${(STATUS_META[bill.status]||{label:bill.status}).label}`, pw-14, y, { align:'right' })
  y += 6
  doc.setFont('helvetica','normal')
  doc.text(`Period: ${fmtDate(bill.billing_period_from)} — ${fmtDate(bill.billing_period_to)}`, 14, y)
  y += 10

  // Vendor & Project boxes
  doc.setFillColor(248,250,252); doc.rect(10, y-2, (pw-20)/2-2, 22, 'F')
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,116,139)
  doc.text('VENDOR', 14, y+2)
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30); doc.setFontSize(8.5)
  doc.text(bill.vendor_name || '—', 14, y+7)
  if (bill.vendor_gst) doc.text(`GST: ${bill.vendor_gst}`, 14, y+12)
  if (bill.bank_name)  doc.text(`Bank: ${bill.bank_name} · ${bill.bank_ifsc||''}`, 14, y+17)

  const col2 = pw/2 + 4
  doc.setFillColor(248,250,252); doc.rect(col2-4, y-2, (pw-20)/2, 22, 'F')
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,116,139)
  doc.text('PROJECT & WORKING', col2, y+2)
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30); doc.setFontSize(8.5)
  doc.text(`${bill.project_code||''}`, col2, y+7)
  doc.text(`Working Days: ${bill.total_working_days}  Calendar: ${bill.total_calendar_days}`, col2, y+12)
  if (bill.total_working_hours > 0) doc.text(`Working Hrs: ${bill.total_working_hours}  OT Hrs: ${bill.overtime_hours}`, col2, y+17)
  y += 28

  // Items table
  const itemCols = ['Equipment', 'Rate Type', 'Rate', 'Days', 'Hrs', 'Base']
  const itemBody = (bill.items||[]).map(it => [
    it.equipment_desc,
    (it.rate_type||'').replace('_',' '),
    fmtMoney(it.rate),
    it.working_days,
    it.working_hours,
    fmtMoney(it.base_amount),
  ])
  if (rules.overtime_applicable) { itemCols.push('OT'); itemBody.forEach((r,i) => r.push(fmtMoney(bill.items?.[i]?.overtime_amount))) }
  if (rules.sunday_applicable)   { itemCols.push('Sun'); itemBody.forEach((r,i) => r.push(fmtMoney(bill.items?.[i]?.sunday_amount))) }
  itemCols.push('Total')
  itemBody.forEach((r, i) => r.push(fmtMoney(bill.items?.[i]?.total_amount)))

  autoTable(doc, {
    startY: y,
    head: [itemCols],
    body: itemBody,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10 },
  })

  y = doc.lastAutoTable.finalY + 8

  // Amount summary
  const summaryData = [
    ['Base Amount', fmtMoney(bill.base_amount)],
  ]
  if (parseFloat(bill.overtime_amount) > 0) summaryData.push(['Overtime', fmtMoney(bill.overtime_amount)])
  if (parseFloat(bill.sunday_amount) > 0)   summaryData.push(['Sunday Premium', fmtMoney(bill.sunday_amount)])
  if (parseFloat(bill.other_additions) > 0) summaryData.push(['Other Additions', fmtMoney(bill.other_additions)])
  if (parseFloat(bill.deductions) > 0)       summaryData.push(['Deductions', `− ${fmtMoney(bill.deductions)}`])
  summaryData.push(['Net Amount', fmtMoney(bill.net_amount)])
  summaryData.push([`GST (${bill.gst_percent}%)`, fmtMoney(bill.gst_amount)])
  summaryData.push(['TOTAL BILL', fmtMoney(bill.total_amount)])

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Amount']],
    body: summaryData,
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95], textColor: 255 },
    columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.row.index === summaryData.length - 1 && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [239, 246, 255]
        data.cell.styles.textColor = [30, 82, 212]
      }
    },
    margin: { left: pw / 2 - 10, right: 10 },
  })

  // Vendor bill ref & payment
  let fy = doc.lastAutoTable.finalY + 8
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(100)
  if (bill.vendor_bill_no)  doc.text(`Vendor Bill No: ${bill.vendor_bill_no}`, 14, fy); fy += 4
  if (bill.vendor_bill_date) doc.text(`Vendor Bill Date: ${fmtDate(bill.vendor_bill_date)}`, 14, fy); fy += 4
  if (bill.payment_reference) doc.text(`Payment Ref: ${bill.payment_reference} (${bill.payment_mode||''}) ${fmtDate(bill.payment_date)}`, 14, fy)

  // Watermark for non-approved/non-paid
  if (!['approved','paid'].includes(bill.status)) {
    const ph = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica','bold'); doc.setFontSize(58); doc.setTextColor(210,210,210)
    doc.text(bill.status.toUpperCase(), pw/2, ph/2, { align:'center', angle: 45 })
  }

  doc.save(`Bill_${bill.bill_number.replace(/\//g,'-')}.pdf`)
}

// ── WORD DOWNLOAD ─────────────────────────────────────────────────────────────

async function downloadBillWord(bill) {
  const rules   = bill.billing_rules
    ? (typeof bill.billing_rules === 'string' ? JSON.parse(bill.billing_rules) : bill.billing_rules)
    : {}
  const isApproved = ['approved', 'paid'].includes(bill.status)

  const itemRows = (bill.items || []).map((it, i) => {
    const otCol  = rules.overtime_applicable ? `<td style="text-align:right">₹ ${Number(it.overtime_amount||0).toLocaleString('en-IN')}</td>` : ''
    const sunCol = rules.sunday_applicable   ? `<td style="text-align:right">₹ ${Number(it.sunday_amount||0).toLocaleString('en-IN')}</td>`   : ''
    return `<tr>
      <td>${i+1}</td>
      <td>${it.equipment_desc||''}</td>
      <td>${(it.rate_type||'').replace('_',' ')}</td>
      <td style="text-align:right">₹ ${Number(it.rate||0).toLocaleString('en-IN')}</td>
      <td style="text-align:right">${it.working_days}</td>
      <td style="text-align:right">${it.working_hours}</td>
      <td style="text-align:right">${it.sunday_days}</td>
      <td style="text-align:right">${it.overtime_hrs}</td>
      <td style="text-align:right;font-weight:600">₹ ${Number(it.base_amount||0).toLocaleString('en-IN')}</td>
      ${otCol}${sunCol}
      <td style="text-align:right;font-weight:600">₹ ${Number(it.total_amount||0).toLocaleString('en-IN')}</td>
    </tr>`
  }).join('')

  const extraTh = [
    rules.overtime_applicable ? '<th>OT Amount</th>' : '',
    rules.sunday_applicable   ? '<th>Sunday Amt</th>' : '',
  ].join('')

  const html = `<html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#222;margin:30px}
    h1{font-size:16px;margin:0}
    table{width:100%;border-collapse:collapse;margin:8px 0}
    th,td{border:1px solid #ccc;padding:5px 8px;font-size:11px}
    th{background:#1e3a5f;color:#fff;font-weight:600}
    .header{background:#1e3a5f;color:#fff;padding:16px;margin:-30px -30px 20px;text-align:center}
    .draft-watermark{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);
      font-size:90px;font-weight:900;color:rgba(200,200,200,0.35);white-space:nowrap;pointer-events:none;z-index:9999}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 0}
    .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px}
    .label{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase}
    .summary td{padding:4px 8px;border:none}
    .total-row td{background:#eff6ff;font-weight:700}
    .footer{margin-top:40px;font-size:10px;color:#888;text-align:center}
  </style></head><body>
  ${!isApproved ? '<div class="draft-watermark">'+bill.status.toUpperCase()+'</div>' : ''}
  <div class="header">
    <h1>RVR PROJECTS PVT LTD</h1>
    <p style="margin:4px 0;font-size:12px">HIRE BILL</p>
  </div>
  <div style="display:flex;justify-content:space-between;margin-bottom:16px">
    <div>
      <p><b>Bill No:</b> ${bill.bill_number}</p>
      <p><b>WO No:</b> ${bill.wo_number||'—'}</p>
      <p><b>Period:</b> ${fmtDate(bill.billing_period_from)} — ${fmtDate(bill.billing_period_to)}</p>
      ${bill.vendor_bill_no ? `<p><b>Vendor Bill No:</b> ${bill.vendor_bill_no}</p>` : ''}
    </div>
    <div style="text-align:right">
      <p><b>Status:</b> ${(STATUS_META[bill.status]||{label:bill.status}).label}</p>
      <p style="font-size:18px;font-weight:700;color:#1e40af">₹ ${Number(bill.total_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</p>
    </div>
  </div>
  <div class="grid">
    <div class="box">
      <p class="label">Vendor</p>
      <p><b>${bill.vendor_name||'—'}</b></p>
      ${bill.vendor_phone ? `<p>${bill.vendor_phone}</p>` : ''}
      ${bill.vendor_gst   ? `<p>GST: ${bill.vendor_gst}</p>` : ''}
      ${bill.bank_name    ? `<p>${bill.bank_name} · ${bill.bank_account||''} · IFSC: ${bill.bank_ifsc||''}</p>` : ''}
    </div>
    <div class="box">
      <p class="label">Project &amp; Working</p>
      <p><b>${bill.project_code||''}${bill.project_name ? ' — '+bill.project_name : ''}</b></p>
      <p>Calendar Days: ${bill.total_calendar_days} &nbsp;|&nbsp; Working Days: ${bill.total_working_days}</p>
      <p>Working Hrs: ${bill.total_working_hours} &nbsp;|&nbsp; Sundays: ${bill.sunday_days_worked} &nbsp;|&nbsp; OT Hrs: ${bill.overtime_hours}</p>
    </div>
  </div>
  <h2 style="font-size:13px;margin:16px 0 4px">Equipment / Working Details</h2>
  <table>
    <thead><tr>
      <th>#</th><th>Equipment</th><th>Rate Type</th><th>Rate</th>
      <th>Work Days</th><th>Work Hrs</th><th>Sun Days</th><th>OT Hrs</th>
      <th>Base Amt</th>${extraTh}<th>Total</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div style="display:flex;justify-content:flex-end;margin-top:16px">
    <table class="summary" style="width:320px">
      <tr><td>Base Amount</td><td style="text-align:right">₹ ${Number(bill.base_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
      ${parseFloat(bill.overtime_amount)>0 ? `<tr><td>Overtime</td><td style="text-align:right">₹ ${Number(bill.overtime_amount).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>` : ''}
      ${parseFloat(bill.sunday_amount)>0   ? `<tr><td>Sunday Premium</td><td style="text-align:right">₹ ${Number(bill.sunday_amount).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>` : ''}
      ${parseFloat(bill.other_additions)>0 ? `<tr><td>Other Additions</td><td style="text-align:right">₹ ${Number(bill.other_additions).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>` : ''}
      ${parseFloat(bill.deductions)>0      ? `<tr><td>Deductions</td><td style="text-align:right">− ₹ ${Number(bill.deductions).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>` : ''}
      <tr style="border-top:2px solid #ccc"><td><b>Net Amount</b></td><td style="text-align:right"><b>₹ ${Number(bill.net_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</b></td></tr>
      <tr><td>GST (${bill.gst_percent}%)</td><td style="text-align:right">₹ ${Number(bill.gst_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
      <tr class="total-row"><td><b>TOTAL BILL AMOUNT</b></td><td style="text-align:right"><b>₹ ${Number(bill.total_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</b></td></tr>
    </table>
  </div>
  ${bill.payment_date ? `<p style="margin-top:12px"><b>Payment:</b> ${fmtDate(bill.payment_date)} · ${bill.payment_mode||''} · Ref: ${bill.payment_reference||''}</p>` : ''}
  ${bill.remarks ? `<p style="margin-top:8px"><b>Remarks:</b> ${bill.remarks}</p>` : ''}
  <div class="footer">Generated by RVR DPR &amp; Utilization System · ${new Date().toLocaleString('en-IN')}</div>
  </body></html>`

  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `Bill_${bill.bill_number.replace(/\//g,'-')}.doc`; a.click()
  URL.revokeObjectURL(url)
}

// ── EXCEL DOWNLOAD ────────────────────────────────────────────────────────────

async function downloadBillExcel(bill) {
  const XLSX  = await import('xlsx')
  const rules = bill.billing_rules
    ? (typeof bill.billing_rules === 'string' ? JSON.parse(bill.billing_rules) : bill.billing_rules)
    : {}
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Bill Summary ──────────────────────────────────────────────────
  const summaryData = [
    ['RVR PROJECTS PVT LTD — HIRE BILL'],
    [],
    ['Bill Number',      bill.bill_number],
    ['WO Number',        bill.wo_number || ''],
    ['Vendor',           bill.vendor_name || ''],
    ['GST No',           bill.vendor_gst || ''],
    ['Bank',             bill.bank_name ? `${bill.bank_name} · ${bill.bank_account||''} · IFSC: ${bill.bank_ifsc||''}` : ''],
    ['Project',          `${bill.project_code||''}${bill.project_name ? ' — '+bill.project_name : ''}`],
    ['Status',           (STATUS_META[bill.status]||{label:bill.status}).label],
    [],
    ['Billing Period From', fmtDate(bill.billing_period_from)],
    ['Billing Period To',   fmtDate(bill.billing_period_to)],
    ['Calendar Days',       bill.total_calendar_days],
    ['Working Days',        bill.total_working_days],
    ['Working Hours',       bill.total_working_hours],
    ['Sundays Worked',      bill.sunday_days_worked],
    ['Overtime Hours',      bill.overtime_hours],
    [],
    ['Vendor Bill No',   bill.vendor_bill_no || ''],
    ['Vendor Bill Date', bill.vendor_bill_date ? fmtDate(bill.vendor_bill_date) : ''],
    [],
    ['— AMOUNT SUMMARY —', ''],
    ['Base Amount',         Number(bill.base_amount  || 0)],
    ['Overtime Amount',     Number(bill.overtime_amount || 0)],
    ['Sunday Premium',      Number(bill.sunday_amount || 0)],
    ['Other Additions',     Number(bill.other_additions || 0)],
    ['Deductions',          Number(bill.deductions || 0)],
    ['Net Amount',          Number(bill.net_amount || 0)],
    [`GST (${bill.gst_percent}%)`, Number(bill.gst_amount || 0)],
    ['TOTAL BILL AMOUNT',   Number(bill.total_amount || 0)],
    [],
    bill.payment_date ? ['Payment Date',       fmtDate(bill.payment_date)] : [],
    bill.payment_reference ? ['Payment Ref',   bill.payment_reference]     : [],
    bill.payment_mode ? ['Payment Mode',        bill.payment_mode]          : [],
    [],
    ['Generated', new Date().toLocaleString('en-IN')],
  ].filter(r => r.length > 0)

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  wsSummary['!cols'] = [{ wch: 24 }, { wch: 40 }]
  // Bold title
  if (wsSummary['A1']) wsSummary['A1'].s = { font: { bold: true, sz: 14 } }
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Bill Summary')

  // ── Sheet 2: Equipment Items ───────────────────────────────────────────────
  const itemHeaders = [
    '#', 'Equipment', 'Rate Type', 'Rate (₹)', 'Qty', 'Unit',
    'Working Days', 'Working Hrs', 'Sunday Days', 'OT Hrs',
    'Base Amount (₹)', 'OT Amount (₹)', 'Sunday Amount (₹)', 'Total Amount (₹)',
  ]
  const itemRows = (bill.items || []).map((it, i) => [
    i + 1,
    it.equipment_desc || '',
    (it.rate_type || '').replace(/_/g, ' '),
    Number(it.rate || 0),
    Number(it.quantity || 1),
    it.unit || 'No.',
    Number(it.working_days || 0),
    Number(it.working_hours || 0),
    Number(it.sunday_days || 0),
    Number(it.overtime_hrs || 0),
    Number(it.base_amount || 0),
    Number(it.overtime_amount || 0),
    Number(it.sunday_amount || 0),
    Number(it.total_amount || 0),
  ])

  // Totals row
  if (itemRows.length) {
    const totRow = ['', 'TOTAL', '', '', '', '', '', '', '', '',
      Number(bill.base_amount || 0),
      Number(bill.overtime_amount || 0),
      Number(bill.sunday_amount || 0),
      Number(bill.total_amount || 0),
    ]
    itemRows.push(totRow)
  }

  const wsItems = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows])
  wsItems['!cols'] = [
    { wch: 4 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 6 }, { wch: 8 },
    { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 8 },
    { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
  ]
  // Bold header row
  itemHeaders.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: ci })
    if (wsItems[ref]) wsItems[ref].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' } } }
  })
  XLSX.utils.book_append_sheet(wb, wsItems, 'Equipment Items')

  // ── Sheet 3: Billing Rules ─────────────────────────────────────────────────
  const rulesData = [
    ['Billing Rules Snapshot'],
    [],
    ['Overtime Applicable',      rules.overtime_applicable      ? 'Yes' : 'No'],
    ['OT Threshold Hrs/Day',     rules.overtime_threshold_hrs   || 8],
    ['OT Rate Multiplier',       rules.overtime_rate_multiplier || 1.5],
    ['Sunday Premium',           rules.sunday_applicable        ? 'Yes' : 'No'],
    ['Sunday Rate Multiplier',   rules.sunday_rate_multiplier   || 2.0],
    ['Holiday Premium',          rules.holiday_applicable       ? 'Yes' : 'No'],
    ['Holiday Rate Multiplier',  rules.holiday_rate_multiplier  || 2.0],
    ['Pro-rata Billing',         rules.prorata_applicable       ? 'Yes' : 'No'],
  ]
  const wsRules = XLSX.utils.aoa_to_sheet(rulesData)
  wsRules['!cols'] = [{ wch: 26 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsRules, 'Billing Rules')

  const buf  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `Bill_${bill.bill_number.replace(/\//g,'-')}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function HireBilling() {
  const { isAdmin } = useAuth()
  const [bills,        setBills]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showCreate,   setShowCreate]   = useState(false)
  const [editBill,     setEditBill]     = useState(null)
  const [viewBillId,   setViewBillId]   = useState(null)
  const { toast, show: showToast } = useToast()

  const load = () => {
    setLoading(true)
    const params = {}
    if (filterStatus) params.status = filterStatus
    getHireBills(params).then(r => { setBills(r.data.data); setLoading(false) })
  }

  useEffect(load, [filterStatus])

  const filtered = bills.filter(b =>
    !search ||
    b.bill_number?.toLowerCase().includes(search.toLowerCase()) ||
    (b.vendor_name||'').toLowerCase().includes(search.toLowerCase()) ||
    (b.wo_number||'').toLowerCase().includes(search.toLowerCase()) ||
    (b.project_code||'').toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async (b) => {
    if (!confirm(`Delete bill ${b.bill_number}?`)) return
    try {
      await deleteHireBill(b.id)
      showToast('Bill deleted', 'success')
      load()
    } catch (e) {
      showToast(e.response?.data?.error || 'Delete failed', 'error')
    }
  }

  // Summary totals
  const totals = filtered.reduce((acc, b) => {
    acc.net += parseFloat(b.net_amount) || 0
    acc.gst += parseFloat(b.gst_amount) || 0
    acc.total += parseFloat(b.total_amount) || 0
    if (b.status === 'paid') acc.paid += parseFloat(b.total_amount) || 0
    return acc
  }, { net: 0, gst: 0, total: 0, paid: 0 })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">Hire Billing</h1>
        <button onClick={() => { setEditBill(null); setShowCreate(true) }}
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={15}/> New Bill
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Bills', value: filtered.length, unit: 'bills', color: 'bg-gray-50 border-gray-200' },
          { label: 'Net Amount', value: fmtMoney(totals.net), color: 'bg-blue-50 border-blue-200' },
          { label: 'GST Amount', value: fmtMoney(totals.gst), color: 'bg-amber-50 border-amber-200' },
          { label: 'Total Bill Value', value: fmtMoney(totals.total), color: 'bg-green-50 border-green-200' },
        ].map(card => (
          <div key={card.label} className={`border rounded-xl p-4 ${card.color}`}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{card.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bill no, vendor, WO, project…"
            className="border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Status</option>
          {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={load} className="p-2 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"><RefreshCw size={15}/></button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Bill No</th>
                <th className="px-4 py-3 text-left">WO</th>
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Project</th>
                <th className="px-4 py-3 text-left">Period</th>
                <th className="px-4 py-3 text-right">Work Days</th>
                <th className="px-4 py-3 text-right">Net Amt</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-blue-700 whitespace-nowrap">{b.bill_number}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{b.wo_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-900">{b.vendor_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.project_code || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {fmtDate(b.billing_period_from)}<br/>— {fmtDate(b.billing_period_to)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{b.total_working_days}</td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{fmtMoney(b.net_amount)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtMoney(b.total_amount)}</td>
                  <td className="px-4 py-3"><Badge status={b.status}/></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setViewBillId(b.id)} title="View" className="p-1.5 text-gray-500 hover:text-blue-600"><Eye size={15}/></button>
                      {b.status === 'draft' && (
                        <button onClick={() => { setEditBill(b); setShowCreate(true) }} title="Edit" className="p-1.5 text-gray-500 hover:text-blue-600"><Edit2 size={15}/></button>
                      )}
                      {b.status === 'draft' && isAdmin && (
                        <button onClick={() => handleDelete(b)} title="Delete" className="p-1.5 text-gray-500 hover:text-red-600"><Trash2 size={15}/></button>
                      )}
                      <button onClick={() => downloadBillPDF(b)}   title="PDF"   className="p-1.5 text-gray-500 hover:text-red-600"><FileText size={15}/></button>
                      <button onClick={() => downloadBillWord(b)}  title="Word"  className="p-1.5 text-gray-500 hover:text-blue-600"><Download size={15}/></button>
                      <button onClick={() => downloadBillExcel(b)} title="Excel" className="p-1.5 text-gray-500 hover:text-green-600"><Download size={15}/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">No bills found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <BillModal
          bill={editBill || null}
          onClose={() => { setShowCreate(false); setEditBill(null) }}
          onSaved={() => { setShowCreate(false); setEditBill(null); load(); showToast('Bill saved') }}
        />
      )}
      {viewBillId && (
        <BillDetailModal billId={viewBillId} onClose={() => setViewBillId(null)} onAction={load} />
      )}
      <Toast toast={toast}/>
    </div>
  )
}
