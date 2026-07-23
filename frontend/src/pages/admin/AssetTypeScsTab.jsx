import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, MoreVertical, RefreshCw, Check, X,
  Clock, Gauge, Calendar, ChevronDown, ArrowDownToLine, Settings,
} from 'lucide-react'
import {
  getEquipmentTypeScs, getEquipmentTypeScsSegs,
  createEquipmentTypeScs, updateEquipmentTypeScs,
  deleteEquipmentTypeScs, syncEquipmentTypeScs,
} from '../../lib/api'

const inp  = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full'
const nv   = v => parseInt(v) || null

// ── Section Combobox ──────────────────────────────────────────────────────────
function SectionCombo({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false)
  const filtered = options.filter(o => !value || o.toLowerCase().includes(value.toLowerCase()))

  return (
    <div className="relative">
      <div className="relative">
        <input className={inp + ' pr-8'} value={value} placeholder={placeholder}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}/>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(o => (
            <button key={o} type="button"
              onMouseDown={() => { onChange(o); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700">
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add / Edit SCS Modal ──────────────────────────────────────────────────────
function ScsFormModal({ eqTypeId, eqTypeName, initial, sections, onSaved, onClose }) {
  const isEdit = !!initial
  const [form, setForm] = useState({
    name:            initial?.custom_name     || '',
    section:         initial?.section         || '',
    sub_section:     initial?.sub_section     || '',
    description:     initial?.description     || '',
    tracking:        initial ? (initial.enabled !== false) : true,
    hours_enabled:   initial ? (initial.hours_enabled !== false) : false,
    interval_hours:  initial?.interval_hours  || '',
    days_enabled:    initial?.days_enabled    || false,
    interval_days:   initial?.interval_days   || '',
    km_enabled:      initial?.km_enabled      || false,
    interval_km:     initial?.interval_km     || '',
    extra_parameter: initial?.extra_parameter || false,
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return }
    setSaving(true); setErr('')
    try {
      const payload = {
        equipment_type_id: eqTypeId,
        custom_name:    form.name.trim(),
        enabled:        form.tracking,
        hours_enabled:  form.hours_enabled,
        interval_hours: nv(form.interval_hours),
        days_enabled:   form.days_enabled,
        interval_days:  nv(form.interval_days),
        km_enabled:     form.km_enabled,
        interval_km:    nv(form.interval_km),
        section:        form.section.trim()     || null,
        sub_section:    form.sub_section.trim() || null,
        description:    form.description.trim() || null,
        extra_parameter: form.extra_parameter,
      }
      if (isEdit) {
        await updateEquipmentTypeScs(initial.id, payload)
      } else {
        await createEquipmentTypeScs(payload)
        // Auto-sync new SCS to all machines of this asset type
        syncEquipmentTypeScs({ eq_type_id: eqTypeId }).catch(() => {})
      }
      onSaved()
    } catch (e) { setErr(e.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  const RadioRow = ({ label, trueVal, onTrue, onFalse, yesLabel = 'Enable', noLabel = 'Disable' }) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex gap-5">
        <label className="flex items-center gap-1.5 cursor-pointer text-sm">
          <input type="radio" className="accent-blue-700" checked={trueVal} onChange={onTrue}/>
          <span className={trueVal ? 'text-teal-700 font-medium' : 'text-gray-500'}>{yesLabel}</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-sm">
          <input type="radio" className="accent-gray-400" checked={!trueVal} onChange={onFalse}/>
          <span className={!trueVal ? 'text-gray-700 font-medium' : 'text-gray-400'}>{noLabel}</span>
        </label>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-blue-900 rounded-t-2xl flex-shrink-0">
          <h3 className="font-bold text-white text-sm">
            {isEdit ? 'Edit Service Checksheet' : 'Add Custom Service Checksheet'}
          </h3>
          <button onClick={onClose} className="text-blue-200 hover:text-white"><X size={18}/></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          <div className="divide-y divide-gray-100">

            {/* Name */}
            <div className="flex items-center px-5 py-3.5 gap-4">
              <label className="w-44 flex-shrink-0 text-sm text-gray-700">
                Name <span className="text-red-500">*</span>
              </label>
              <input className={inp} placeholder="Please enter Name"
                value={form.name} onChange={e => set('name', e.target.value)}/>
            </div>

            {/* Asset Type (read-only) */}
            <div className="flex items-center px-5 py-3.5 gap-4">
              <label className="w-44 flex-shrink-0 text-sm text-gray-700">Asset Type</label>
              <input className={inp + ' bg-gray-50 text-gray-500 cursor-not-allowed'}
                value={eqTypeName} readOnly/>
            </div>

            {/* Section */}
            <div className="flex items-center px-5 py-3.5 gap-4">
              <label className="w-44 flex-shrink-0 text-sm text-gray-700">Section</label>
              <SectionCombo value={form.section} onChange={v => set('section', v)}
                options={sections} placeholder="Please enter Section Name"/>
            </div>

            {/* Sub-Section */}
            <div className="flex items-center px-5 py-3.5 gap-4">
              <label className="w-44 flex-shrink-0 text-sm text-gray-700">Sub-Section</label>
              <SectionCombo value={form.sub_section} onChange={v => set('sub_section', v)}
                options={sections} placeholder="Please enter Sub Section Name"/>
            </div>

            {/* Description */}
            <div className="flex items-start px-5 py-3.5 gap-4">
              <label className="w-44 flex-shrink-0 text-sm text-gray-700 mt-2">Description</label>
              <textarea rows={3} className={inp + ' resize-y'} placeholder=""
                value={form.description} onChange={e => set('description', e.target.value)}/>
            </div>

            {/* Radio rows */}
            <div className="px-5">
              <RadioRow label="Tracking Status"
                trueVal={form.tracking}
                onTrue={() => set('tracking', true)} onFalse={() => set('tracking', false)}/>

              <RadioRow label="Hours"
                trueVal={form.hours_enabled}
                onTrue={() => set('hours_enabled', true)} onFalse={() => set('hours_enabled', false)}/>
              {form.hours_enabled && (
                <div className="flex items-center gap-3 pb-3 pl-[11.5rem]">
                  <input type="number" min="1" placeholder="250"
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-28"
                    value={form.interval_hours} onChange={e => set('interval_hours', e.target.value)}/>
                  <span className="text-xs text-gray-500">Hours interval</span>
                </div>
              )}

              <RadioRow label="Days"
                trueVal={form.days_enabled}
                onTrue={() => set('days_enabled', true)} onFalse={() => set('days_enabled', false)}/>
              {form.days_enabled && (
                <div className="flex items-center gap-3 pb-3 pl-[11.5rem]">
                  <input type="number" min="1" placeholder="30"
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-28"
                    value={form.interval_days} onChange={e => set('interval_days', e.target.value)}/>
                  <span className="text-xs text-gray-500">Days interval</span>
                </div>
              )}

              <RadioRow label="Extra Parameter Required ?"
                trueVal={form.extra_parameter}
                onTrue={() => set('extra_parameter', true)} onFalse={() => set('extra_parameter', false)}
                yesLabel="Yes" noLabel="No"/>
            </div>

          </div>
        </div>

        {/* Footer */}
        {err && (
          <p className="px-5 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">{err}</p>
        )}
        <div className="flex gap-3 px-5 py-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl flex-shrink-0">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold rounded-lg text-sm">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <Check size={13}/>}
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose}
            className="px-6 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Interval Editor Modal ─────────────────────────────────────────────────────
function IntervalModal({ title, initial, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    hours_enabled:  initial?.hours_enabled ?? false,
    interval_hours: initial?.interval_hours ?? '',
    km_enabled:     initial?.km_enabled    ?? false,
    interval_km:    initial?.interval_km   ?? '',
    days_enabled:   initial?.days_enabled  ?? false,
    interval_days:  initial?.interval_days ?? '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const rows = [
    { key: 'hours', label: 'Hours', icon: Clock,    unit: 'Hours', border: 'border-blue-300',   bg: 'bg-blue-50',   chk: 'accent-blue-600',   ic: 'text-blue-600'   },
    { key: 'km',    label: 'KM',    icon: Gauge,    unit: 'KM',    border: 'border-green-300',  bg: 'bg-green-50',  chk: 'accent-green-600',  ic: 'text-green-600'  },
    { key: 'days',  label: 'Days',  icon: Calendar, unit: 'Days',  border: 'border-orange-300', bg: 'bg-orange-50', chk: 'accent-orange-600', ic: 'text-orange-600' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-indigo-700 rounded-t-2xl">
          <h3 className="font-bold text-white text-sm flex items-center gap-2"><Settings size={14}/> {title}</h3>
          <button onClick={onClose} className="text-indigo-200 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-3">
          {rows.map(({ key, label, icon: Icon, unit, border, bg, chk, ic }) => (
            <div key={key} className={`rounded-xl border p-4 ${form[`${key}_enabled`] ? `${border} ${bg}` : 'border-gray-200'}`}>
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input type="checkbox" className={`w-4 h-4 ${chk}`}
                  checked={form[`${key}_enabled`]} onChange={e => set(`${key}_enabled`, e.target.checked)}/>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                  <Icon size={14} className={ic}/> {label}-based
                </span>
              </label>
              {form[`${key}_enabled`] && (
                <div className="flex items-center gap-2 pl-7">
                  <input type="number" min="1" placeholder={key === 'hours' ? '250' : key === 'km' ? '10000' : '30'}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white max-w-[120px]"
                    value={form[`interval_${key}`]} onChange={e => set(`interval_${key}`, e.target.value)}/>
                  <span className="text-sm text-gray-500">{unit}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3 px-5 py-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
          <button onClick={() => onSave(form)} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white font-semibold rounded-lg text-sm">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <Check size={13}/>}
            {saving ? 'Saving…' : 'Apply Interval'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Main SCS Tab ──────────────────────────────────────────────────────────────
export default function AssetTypeScsTab({ eqTypeId, eqTypeName }) {
  const [items,          setItems]          = useState([])
  const [sections,       setSections]       = useState([])
  const [totalMachines,  setTotalMachines]  = useState(0)
  const [loading,        setLoading]        = useState(true)
  const [selected,       setSelected]       = useState(new Set())
  const [menuOpenId,     setMenuOpenId]     = useState(null)
  const [showForm,       setShowForm]       = useState(false)
  const [editItem,       setEditItem]       = useState(null)
  const [intervalModal,  setIntervalModal]  = useState(null)
  const [intervalSaving, setIntervalSaving] = useState(false)
  const [syncing,        setSyncing]        = useState(false)
  const [syncMsg,        setSyncMsg]        = useState('')
  const [delConfirm,     setDelConfirm]     = useState(null)
  const [deleting,       setDeleting]       = useState(false)

  const load = useCallback(() => {
    if (!eqTypeId) return
    setLoading(true)
    // Load items independently from sections so a sections error never blocks the list
    getEquipmentTypeScs({ eq_type_id: eqTypeId })
      .then(r => {
        setItems(r.data.data || [])
        setTotalMachines(r.data.total_machines || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    getEquipmentTypeScsSegs()
      .then(r => setSections(r.data.data || []))
      .catch(() => {})
  }, [eqTypeId])

  useEffect(() => { load() }, [load])

  const allChecked = items.length > 0 && items.every(i => selected.has(i.id))
  const toggleAll  = () => setSelected(allChecked ? new Set() : new Set(items.map(i => i.id)))
  const toggleOne  = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleToggleEnabled = async item => {
    try { await updateEquipmentTypeScs(item.id, { ...item, enabled: !item.enabled }); load() } catch {}
  }

  const handleIntervalSave = async form => {
    setIntervalSaving(true)
    try {
      if (intervalModal?.bulk) {
        await Promise.all([...selected].map(id => {
          const item = items.find(i => i.id === id)
          if (!item) return Promise.resolve()
          return updateEquipmentTypeScs(id, {
            ...item,
            hours_enabled: form.hours_enabled, interval_hours: nv(form.interval_hours),
            km_enabled:    form.km_enabled,    interval_km:    nv(form.interval_km),
            days_enabled:  form.days_enabled,  interval_days:  nv(form.interval_days),
          })
        }))
      } else {
        await updateEquipmentTypeScs(intervalModal.item.id, {
          ...intervalModal.item,
          hours_enabled: form.hours_enabled, interval_hours: nv(form.interval_hours),
          km_enabled:    form.km_enabled,    interval_km:    nv(form.interval_km),
          days_enabled:  form.days_enabled,  interval_days:  nv(form.interval_days),
        })
      }
      setIntervalModal(null); load()
    } catch {}
    finally { setIntervalSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteEquipmentTypeScs(delConfirm.id)
      setDelConfirm(null)
      setSelected(prev => { const n = new Set(prev); n.delete(delConfirm.id); return n })
      load()
    } catch {}
    finally { setDeleting(false) }
  }

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const r = await syncEquipmentTypeScs({ eq_type_id: eqTypeId })
      setSyncMsg(r.data.message || 'Synced successfully')
      setTimeout(() => setSyncMsg(''), 4000)
    } catch (e) { setSyncMsg(e.response?.data?.error || 'Sync failed') }
    finally { setSyncing(false) }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Service Checksheet Setting</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {items.length} checksheet{items.length !== 1 ? 's' : ''} · {totalMachines} active asset{totalMachines !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {syncMsg && <span className="text-xs text-green-600 font-medium">{syncMsg}</span>}
          {totalMachines > 0 && (
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-2 border border-indigo-300 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 disabled:opacity-50">
              {syncing ? <RefreshCw size={12} className="animate-spin"/> : <ArrowDownToLine size={12}/>}
              Sync to Assets
            </button>
          )}
          {selected.size > 0 && (
            <button onClick={() => setIntervalModal({ bulk: true })}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 bg-white text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50">
              <Settings size={12}/> Change Interval ({selected.size})
            </button>
          )}
          <button onClick={() => { setEditItem(null); setShowForm(true) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg">
            <Plus size={13}/> Add Custom SCS
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" className="w-3.5 h-3.5 accent-blue-700"
                    checked={allChecked} onChange={toggleAll}/>
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Name</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Section</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">Status</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Interval</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">Extra Param</th>
                <th className="px-3 py-3 w-10 text-center font-semibold text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={7} className="py-10 text-center text-gray-400">
                  <RefreshCw size={14} className="inline animate-spin mr-1"/> Loading…
                </td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-gray-400">
                  No service checksheets configured yet.{' '}
                  <button onClick={() => { setEditItem(null); setShowForm(true) }}
                    className="text-blue-900 hover:underline font-medium">Add one →</button>
                </td></tr>
              )}
              {!loading && items.map(item => {
                const displayName  = item.custom_name || item.check_sheet_name || '—'
                const enabledCount = parseInt(item.enabled_machine_count || 0)
                return (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${selected.has(item.id) ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-3 py-3 text-center">
                      <input type="checkbox" className="w-3.5 h-3.5 accent-blue-700"
                        checked={selected.has(item.id)} onChange={() => toggleOne(item.id)}/>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-gray-800">{displayName}</p>
                      {item.description && (
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[200px]">{item.description}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-500">
                      {item.section
                        ? <><p className="font-medium text-gray-700">{item.section}</p>
                            {item.sub_section && <p className="text-[10px] text-gray-400">{item.sub_section}</p>}</>
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => handleToggleEnabled(item)}
                        className={`mx-auto flex flex-col items-center gap-0.5 ${item.enabled ? 'text-green-600' : 'text-red-400'}`}>
                        {item.enabled
                          ? <Check size={14} className="bg-green-100 rounded-full p-0.5"/>
                          : <X     size={14} className="bg-red-100   rounded-full p-0.5"/>}
                        {totalMachines > 0 && (
                          <span className="text-[10px] text-gray-400">({enabledCount}/{totalMachines})</span>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-0.5">
                        {item.hours_enabled
                          ? <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold"><Clock size={10}/> {item.interval_hours ?? '—'} Hrs</span>
                          : <span className="flex items-center gap-1 text-[10px] text-gray-300 italic"><Clock size={10}/> Disabled</span>}
                        {item.km_enabled
                          ? <span className="flex items-center gap-1 text-[10px] text-green-600 font-semibold"><Gauge size={10}/> {item.interval_km ?? '—'} KM</span>
                          : <span className="flex items-center gap-1 text-[10px] text-gray-300 italic"><Gauge size={10}/> Disabled</span>}
                        {item.days_enabled
                          ? <span className="flex items-center gap-1 text-[10px] text-orange-600 font-semibold"><Calendar size={10}/> {item.interval_days ?? '—'} Days</span>
                          : <span className="flex items-center gap-1 text-[10px] text-gray-300 italic"><Calendar size={10}/> Disabled</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {item.extra_parameter
                        ? <span className="text-[10px] bg-purple-100 text-purple-700 font-semibold px-1.5 py-0.5 rounded-full">Yes</span>
                        : <span className="text-[10px] text-gray-300">No</span>}
                    </td>
                    <td className="px-3 py-3 relative text-center">
                      <button onClick={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                        <MoreVertical size={14}/>
                      </button>
                      {menuOpenId === item.id && (
                        <div className="absolute right-10 top-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl w-44 py-1 text-xs text-left">
                          <button onClick={() => { setEditItem(item); setShowForm(true); setMenuOpenId(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700">
                            <Settings size={12}/> Edit
                          </button>
                          <button onClick={() => { setIntervalModal({ item }); setMenuOpenId(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700">
                            <Clock size={12}/> Change Interval
                          </button>
                          <button onClick={() => { handleToggleEnabled(item); setMenuOpenId(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700">
                            {item.enabled ? <><X size={12}/> Disable</> : <><Check size={12}/> Enable</>}
                          </button>
                          <button onClick={() => { setDelConfirm(item); setMenuOpenId(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600 border-t border-gray-100">
                            <Trash2 size={12}/> Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showForm && (
        <ScsFormModal
          eqTypeId={eqTypeId}
          eqTypeName={eqTypeName}
          initial={editItem}
          sections={sections}
          onClose={() => { setShowForm(false); setEditItem(null) }}
          onSaved={() => { setShowForm(false); setEditItem(null); load() }}
        />
      )}

      {intervalModal && (
        <IntervalModal
          title={intervalModal.bulk
            ? `Change Interval (${selected.size} items)`
            : `Change Interval — ${intervalModal.item?.custom_name || intervalModal.item?.check_sheet_name}`}
          initial={intervalModal.item || {}}
          saving={intervalSaving}
          onSave={handleIntervalSave}
          onClose={() => setIntervalModal(null)}
        />
      )}

      {delConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
            <p className="font-semibold text-gray-900 mb-1">Remove checksheet?</p>
            <p className="text-sm text-gray-500 mb-5">
              "{delConfirm.custom_name || delConfirm.check_sheet_name}" will be removed from this asset category.
            </p>
            <div className="flex gap-3">
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">
                {deleting ? 'Removing…' : 'Remove'}
              </button>
              <button onClick={() => setDelConfirm(null)}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {menuOpenId && <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)}/>}
    </div>
  )
}
