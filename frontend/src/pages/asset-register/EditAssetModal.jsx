import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import {
  getEquipmentTypes, getUomTypes, getVendors, updateMachine
} from '../../lib/api'

const FUEL_TYPES = ['Diesel', 'Petrol', 'EV', 'N/A']
const SHIFTS     = ['Single Shift', 'Dual Shift']
const READINGS   = ['Hours', 'KM']
const ASSET_TYPE = ['Measurable Asset', 'Non-Measurable Asset']

function uniqueSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort()
}

export default function EditAssetModal({ machine: m, onClose, onSaved }) {
  const [form, setForm] = useState({
    nickname:        m.nickname        || '',
    eq_type:         m.eq_type         || '',
    manufacturer:    m.manufacturer    || '',
    model:           m.model           || '',
    yom:             m.yom             || '',
    capacity:        m.capacity        || '',
    uom:             m.uom             || '',
    ownership:       m.ownership       || 'Own',
    asset_type:      m.asset_type      || 'Measurable Asset',
    vendor:          m.vendor          || '',
    rate:            m.rate            || '',
    rate_monthly:    m.rate_monthly    || '',
    asset_code:      m.asset_code      || '',
    slno:            m.slno            || '',
    reg_no:          m.reg_no          || '',
    chassis_no:      m.chassis_no      || '',
    engine_no:       m.engine_no       || '',
    fuel_type:       m.fuel_type       || 'Diesel',
    date_of_purchase: m.date_of_purchase ? m.date_of_purchase.slice(0, 10) : '',
    po_number:       m.po_number       || '',
    price:           m.price           || '',
    shift_type:      m.shift_type      || 'Single Shift',
    reading1_basis:  m.reading1_basis  || 'Hours',
    dual_reading:    m.dual_reading    || false,
    reading2_basis:  m.reading2_basis  || '',
    fuel_min:        m.fuel_min        ?? '',
    fuel_max:        m.fuel_max        ?? '',
    fuel_min_km:     m.fuel_min_km     ?? '',
    fuel_max_km:     m.fuel_max_km     ?? '',
    planned_hours:   m.planned_hours   ?? 10,
    active:          m.active          !== false,
  })

  const [eqTypes,  setEqTypes]  = useState([])
  const [uomList,  setUomList]  = useState([])
  const [vendors,  setVendors]  = useState([])
  const [selGroup, setSelGroup] = useState(m.asset_group || '')
  const [selCat,   setSelCat]   = useState(m.asset_cat   || '')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    getEquipmentTypes().then(r => setEqTypes(r.data.data)).catch(() => {})
    getUomTypes().then(r => setUomList(r.data.data)).catch(() => {})
    getVendors().then(r => setVendors(r.data.data)).catch(() => {})
  }, [])

  const set = k => e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [k]: val }))
  }

  const allGroups   = uniqueSorted(eqTypes.map(t => t.asset_group))
  const filteredCats = uniqueSorted(
    eqTypes.filter(t => !selGroup || t.asset_group === selGroup).map(t => t.asset_cat)
  )
  const filteredNames = eqTypes.filter(t => {
    if (selGroup && t.asset_group !== selGroup) return false
    if (selCat   && t.asset_cat   !== selCat)   return false
    return true
  })

  const handleSave = async () => {
    setError('')
    if (!form.eq_type) { setError('Asset Name is required'); return }
    if (!form.slno)    { setError('Machine SL No is required'); return }
    setSaving(true)
    try {
      const res = await updateMachine(m.id, {
        nickname:        form.nickname        || null,
        eq_type:         form.eq_type         || null,
        manufacturer:    form.manufacturer    || null,
        model:           form.model           || null,
        yom:             form.yom             || null,
        capacity:        form.capacity        || null,
        uom:             form.uom             || null,
        ownership:       form.ownership       || null,
        asset_type:      form.asset_type      || null,
        vendor:          form.vendor          || null,
        rate:            form.rate            || null,
        rate_monthly:    form.rate_monthly    || null,
        asset_code:      form.asset_code      || null,
        slno:            form.slno            || null,
        reg_no:          form.reg_no          || null,
        chassis_no:      form.chassis_no      || null,
        engine_no:       form.engine_no       || null,
        fuel_type:       form.fuel_type       || null,
        date_of_purchase: form.date_of_purchase || null,
        po_number:       form.po_number       || null,
        price:           form.price           || null,
        shift_type:      form.shift_type      || null,
        reading1_basis:  form.reading1_basis  || null,
        dual_reading:    form.dual_reading,
        reading2_basis:  form.dual_reading ? (form.reading2_basis || null) : null,
        fuel_min:        form.fuel_min !== '' ? form.fuel_min : null,
        fuel_max:        form.fuel_max !== '' ? form.fuel_max : null,
        fuel_min_km:     form.fuel_min_km !== '' ? form.fuel_min_km : null,
        fuel_max_km:     form.fuel_max_km !== '' ? form.fuel_max_km : null,
        planned_hours:   form.planned_hours   || null,
        active:          form.active,
      })
      onSaved?.(res.data.data)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'
  const sec = 'text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2 pb-1 border-b border-gray-100'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 text-base">Edit Asset</h2>
            <p className="text-xs text-gray-400 mt-0.5">{m.slno}{m.nickname ? ` · ${m.nickname}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          <p className={sec}>Identification</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Nickname</label>
              <input type="text" value={form.nickname} onChange={set('nickname')} className={inp}
                placeholder="Short name used in reports" />
            </div>
            <div>
              <label className={lbl}>Machine SL No *</label>
              <input type="text" value={form.slno} onChange={set('slno')} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Asset Code</label>
              <input type="text" value={form.asset_code} onChange={set('asset_code')} className={inp} />
            </div>
            <div>
              <label className={lbl}>Registration No</label>
              <input type="text" value={form.reg_no} onChange={set('reg_no')} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Chassis No</label>
              <input type="text" value={form.chassis_no} onChange={set('chassis_no')} className={inp} />
            </div>
            <div>
              <label className={lbl}>Engine No</label>
              <input type="text" value={form.engine_no} onChange={set('engine_no')} className={inp} />
            </div>
          </div>

          <p className={sec}>Asset Type</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Asset Group</label>
              <select value={selGroup} onChange={e => { setSelGroup(e.target.value); setSelCat('') }} className={inp}>
                <option value="">— all groups —</option>
                {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Asset Category</label>
              <select value={selCat} onChange={e => setSelCat(e.target.value)} className={inp}>
                <option value="">— all categories —</option>
                {filteredCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Asset Name *</label>
              <select value={form.eq_type} onChange={set('eq_type')} className={inp}>
                <option value="">— select —</option>
                {filteredNames.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Manufacturer</label>
              <input type="text" value={form.manufacturer} onChange={set('manufacturer')} className={inp} />
            </div>
            <div>
              <label className={lbl}>Model</label>
              <input type="text" value={form.model} onChange={set('model')} className={inp} />
            </div>
            <div>
              <label className={lbl}>Year of Mfg.</label>
              <input type="text" value={form.yom} onChange={set('yom')} className={inp} maxLength={4} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Capacity</label>
              <input type="text" value={form.capacity} onChange={set('capacity')} className={inp} />
            </div>
            <div>
              <label className={lbl}>UOM</label>
              <select value={form.uom} onChange={set('uom')} className={inp}>
                <option value="">— select —</option>
                {uomList.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <p className={sec}>Ownership</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Ownership</label>
              <select value={form.ownership} onChange={set('ownership')} className={inp}>
                <option>Own</option><option>Hire</option>
              </select>
            </div>
            {form.ownership === 'Own' ? (
              <div>
                <label className={lbl}>Asset Classification</label>
                <select value={form.asset_type} onChange={set('asset_type')} className={inp}>
                  {ASSET_TYPE.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className={lbl}>Vendor</label>
                <input type="text" value={form.vendor} onChange={set('vendor')} className={inp}
                  list="edit-vendor-list" />
                <datalist id="edit-vendor-list">
                  {vendors.map(v => <option key={v.id} value={v.name} />)}
                </datalist>
              </div>
            )}
          </div>
          {form.ownership === 'Hire' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Hire Charges/Day (₹)</label>
                <input type="number" step="0.01" value={form.rate} onChange={set('rate')} className={inp} />
              </div>
              <div>
                <label className={lbl}>Hire Charges/Month (₹)</label>
                <input type="number" step="0.01" value={form.rate_monthly} onChange={set('rate_monthly')} className={inp} />
              </div>
            </div>
          )}
          {form.ownership === 'Own' && (
            <>
              <p className={sec}>Purchase Details</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Date of Purchase</label>
                  <input type="date" value={form.date_of_purchase} onChange={set('date_of_purchase')} className={inp} />
                </div>
                <div>
                  <label className={lbl}>PO Number</label>
                  <input type="text" value={form.po_number} onChange={set('po_number')} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Purchase Price (₹)</label>
                  <input type="number" value={form.price} onChange={set('price')} className={inp} />
                </div>
              </div>
            </>
          )}

          <p className={sec}>Operational Settings</p>
          <div>
            <label className={lbl}>Fuel Type</label>
            <select value={form.fuel_type} onChange={set('fuel_type')} className={inp + ' max-w-xs'}>
              {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Shift Roster</label>
              <select value={form.shift_type} onChange={set('shift_type')} className={inp}>
                {SHIFTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Reading Type</label>
              <select value={form.reading1_basis} onChange={set('reading1_basis')} className={inp}>
                {READINGS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="edit-dual" checked={form.dual_reading} onChange={set('dual_reading')}
              className="rounded border-gray-300" />
            <label htmlFor="edit-dual" className="text-sm text-gray-700 select-none">Dual Reading (secondary meter)</label>
            {form.dual_reading && (
              <select value={form.reading2_basis} onChange={set('reading2_basis')}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— select —</option>
                {READINGS.map(r => <option key={r}>{r}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Fuel Min (L/hr)</label><input type="number" step="0.1" value={form.fuel_min} onChange={set('fuel_min')} className={inp} /></div>
            <div><label className={lbl}>Fuel Max (L/hr)</label><input type="number" step="0.1" value={form.fuel_max} onChange={set('fuel_max')} className={inp} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Fuel Min (kms/ltr)</label><input type="number" step="0.1" value={form.fuel_min_km} onChange={set('fuel_min_km')} className={inp} /></div>
            <div><label className={lbl}>Fuel Max (kms/ltr)</label><input type="number" step="0.1" value={form.fuel_max_km} onChange={set('fuel_max_km')} className={inp} /></div>
          </div>
          <div>
            <label className={lbl}>Planned Hrs/Day</label>
            <input type="number" step="0.5" value={form.planned_hours} onChange={set('planned_hours')} className={inp + ' max-w-xs'} />
          </div>

          <p className={sec}>Status</p>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="edit-active" checked={form.active} onChange={set('active')}
              className="rounded border-gray-300" />
            <label htmlFor="edit-active" className="text-sm text-gray-700 select-none">
              Asset is <span className={form.active ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                {form.active ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-200 flex-shrink-0">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
