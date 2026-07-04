import { useState, useEffect, useRef } from 'react'
import { X, Plus, Upload, Download, CheckCircle, AlertCircle } from 'lucide-react'
import {
  getProjects, getEquipmentTypes, getUomTypes, getVendors,
  createMachine, bulkCreateMachines, createUomType
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { downloadAssetTemplate, parseAssetFile } from '../../lib/assetBulkTemplate'

const OWNERSHIP  = ['Own', 'Hire']
const ASSET_TYPE = ['Measurable Asset', 'Non-Measurable Asset']
const FUEL_TYPES = ['Diesel', 'Petrol', 'EV', 'N/A']
const SHIFTS     = ['Single Shift', 'Dual Shift']
const READINGS   = ['Hours', 'KM']
const OWN_NAME   = 'RVR Projects Pvt Ltd'

/* ── Blank form ───────────────────────────────────────────────────────────── */
const blank = {
  project_id: '', eq_type: '', manufacturer: '', model: '',
  capacity: '', uom: '', ownership: 'Own', asset_type: 'Measurable Asset',
  vendor: '', rate: '', rate_monthly: '', fuel_type: 'Diesel',
  asset_code: '', slno: '', chassis_no: '', reg_no: '',
  date_of_purchase: '', po_number: '', price: '', yom: '',
  shift_type: 'Single Shift', reading1_basis: 'Hours',
  reading2_basis: '', dual_reading: false,
  fuel_min: '', fuel_max: '', fuel_min_km: '', fuel_max_km: '', planned_hours: '10',
}

function uniqueSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort()
}

export default function AddAssetModal({ onClose, onSaved }) {
  const { isAdmin } = useAuth()
  const [tab, setTab]             = useState('single')
  const [form, setForm]           = useState(blank)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const [projects, setProjects]   = useState([])
  const [eqTypes, setEqTypes]     = useState([])
  const [uomList, setUomList]     = useState([])
  const [vendors, setVendors]     = useState([])

  // Cascading selection state (Asset Group → Asset Category → Asset Name)
  const [selGroup, setSelGroup]   = useState('')
  const [selCat,   setSelCat]     = useState('')

  // Quick-add UOM (admin)
  const [newUom, setNewUom]       = useState('')
  const [addingUom, setAddingUom] = useState(false)

  // Bulk upload
  const fileRef                   = useRef()
  const [bulkFile,    setBulkFile]    = useState(null)
  const [bulkPreview, setBulkPreview] = useState(null)
  const [bulkSaving,  setBulkSaving]  = useState(false)
  const [bulkResult,  setBulkResult]  = useState(null)

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data)).catch(() => {})
    getEquipmentTypes().then(r => setEqTypes(r.data.data)).catch(() => {})
    getUomTypes().then(r => setUomList(r.data.data)).catch(() => {})
    getVendors().then(r => setVendors(r.data.data)).catch(() => {})
  }, [])

  const set = k => e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => {
      const next = { ...f, [k]: val }
      if (k === 'eq_type') {
        const et = eqTypes.find(t => t.name === val)
        if (et?.asset_category) {
          next.asset_type = et.asset_category === 'Measurable' ? 'Measurable Asset' : 'Non-Measurable Asset'
        }
        if (et?.fuel_type) {
          next.fuel_type = et.fuel_type
        }
      }
      return next
    })
  }

  // Cascading dropdown helpers
  const allGroups = uniqueSorted(eqTypes.map(t => t.asset_group))
  const filteredCats = uniqueSorted(
    eqTypes
      .filter(t => !selGroup || t.asset_group === selGroup)
      .map(t => t.asset_cat)
  )
  const filteredNames = eqTypes.filter(t => {
    if (selGroup && t.asset_group !== selGroup) return false
    if (selCat   && t.asset_cat   !== selCat)   return false
    return true
  })

  const handleGroupChange = e => {
    setSelGroup(e.target.value)
    setSelCat('')
    setForm(f => ({ ...f, eq_type: '', asset_type: 'Measurable Asset' }))
  }
  const handleCatChange = e => {
    setSelCat(e.target.value)
    setForm(f => ({ ...f, eq_type: '', asset_type: 'Measurable Asset' }))
  }

  const handleAddUom = async () => {
    if (!newUom.trim()) return
    setAddingUom(true)
    try {
      const res = await createUomType({ name: newUom.trim() })
      setUomList(prev => [...prev, res.data.data].sort((a, b) => a.name.localeCompare(b.name)))
      setForm(f => ({ ...f, uom: newUom.trim() }))
      setNewUom('')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add UOM')
    } finally { setAddingUom(false) }
  }

  const handleSingle = async () => {
    setError('')
    if (!form.project_id) { setError('Project is required'); return }
    if (!form.eq_type)    { setError('Asset Name is required'); return }
    if (!form.slno)       { setError('Machine SL No is required'); return }
    if (!form.shift_type) { setError('Shift roster is required'); return }
    if (form.ownership === 'Own' && !form.date_of_purchase) {
      setError('Date of purchase is required for own assets'); return
    }
    setSaving(true)
    try {
      await createMachine({
        ...form,
        project_id:    parseInt(form.project_id),
        asset_code:    form.asset_code || null,
        price:         form.price || null,
        rate:          form.rate || null,
        rate_monthly:  form.rate_monthly || null,
        fuel_min:      form.fuel_min || null,
        fuel_max:      form.fuel_max || null,
        fuel_min_km:   form.fuel_min_km || null,
        fuel_max_km:   form.fuel_max_km || null,
        planned_hours: parseFloat(form.planned_hours) || 10,
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  const resetBulk = () => {
    setBulkFile(null); setBulkPreview(null); setBulkResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleBulkFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setBulkFile(file); setBulkResult(null)
    setBulkPreview(await parseAssetFile(file))
    e.target.value = ''
  }

  const handleBulkUpload = async () => {
    if (!bulkPreview?.items?.length) return
    setBulkSaving(true); setBulkResult(null)
    try {
      const res = await bulkCreateMachines(bulkPreview.items)
      setBulkResult(res.data)
      if (res.data.created > 0) { onSaved?.(); resetBulk() }
    } catch (err) {
      setBulkResult({ error: err.response?.data?.error || 'Upload failed' })
    } finally { setBulkSaving(false) }
  }

  const inp  = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white'
  const lbl  = 'block text-xs font-medium text-gray-500 mb-1'
  const sec  = 'text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1 pb-1 border-b border-gray-100'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900 text-base">Add Asset</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-5 flex-shrink-0">
          {[['single', 'Single Asset'], ['bulk', 'Bulk Upload']].map(([k, label]) => (
            <button
              key={k} onClick={() => { setTab(k); resetBulk() }}
              className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── SINGLE ASSET FORM ── */}
          {tab === 'single' && (
            <div className="p-5 space-y-4">
              <p className={sec}>Basic Information</p>
              <div>
                <label className={lbl}>Project *</label>
                <select value={form.project_id} onChange={set('project_id')} className={inp}>
                  <option value="">— select —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
                {isAdmin && <p className="text-xs text-blue-600 mt-1 cursor-pointer hover:underline" onClick={() => window.open('/admin/machines','_self')}>Manage projects in Admin</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Asset Group</label>
                  <select value={selGroup} onChange={handleGroupChange} className={inp}>
                    <option value="">— all groups —</option>
                    {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Asset Category</label>
                  <select value={selCat} onChange={handleCatChange} className={inp}>
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
                  {isAdmin && <p className="text-xs text-blue-600 mt-1 cursor-pointer hover:underline" onClick={() => window.open('/admin/equipment-types','_self')}>Manage in Admin</p>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Manufacturer</label>
                  <input type="text" value={form.manufacturer} onChange={set('manufacturer')} className={inp} placeholder="e.g. Komatsu" />
                </div>
                <div>
                  <label className={lbl}>Model</label>
                  <input type="text" value={form.model} onChange={set('model')} className={inp} placeholder="e.g. PC200" />
                </div>
                <div>
                  <label className={lbl}>Year of Manufacture</label>
                  <input type="text" value={form.yom} onChange={set('yom')} className={inp} placeholder="e.g. 2023" maxLength={4} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Capacity</label>
                  <input type="text" value={form.capacity} onChange={set('capacity')} className={inp} placeholder="e.g. 20" />
                </div>
                <div>
                  <label className={lbl}>UOM</label>
                  <div className="flex gap-2">
                    <select value={form.uom} onChange={set('uom')} className={inp}>
                      <option value="">— select —</option>
                      {uomList.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <input
                          type="text" value={newUom} onChange={e => setNewUom(e.target.value)}
                          placeholder="New" className="border border-gray-300 rounded-lg px-2 py-2 text-xs w-16 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button onClick={handleAddUom} disabled={addingUom} className="px-2 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs flex-shrink-0">
                          <Plus size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <p className={sec}>Ownership</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Ownership *</label>
                  <select value={form.ownership} onChange={set('ownership')} className={inp}>
                    {OWNERSHIP.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                {form.ownership === 'Own' ? (
                  <div>
                    <label className={lbl}>Owner</label>
                    <input type="text" value={OWN_NAME} className={inp + ' bg-gray-50 text-gray-500'} readOnly />
                  </div>
                ) : (
                  <div>
                    <label className={lbl}>Vendor Name *</label>
                    <input
                      type="text" value={form.vendor} onChange={set('vendor')} className={inp}
                      list="vendor-list" placeholder="Type or select vendor"
                    />
                    <datalist id="vendor-list">
                      {vendors.map(v => <option key={v.id} value={v.name} />)}
                    </datalist>
                  </div>
                )}
              </div>
              {form.ownership === 'Hire' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Hire Charges/Day (₹)</label>
                    <input type="number" step="0.01" value={form.rate} onChange={set('rate')} className={inp} placeholder="e.g. 15000" />
                  </div>
                  <div>
                    <label className={lbl}>Hire Charges/Month (₹)</label>
                    <input type="number" step="0.01" value={form.rate_monthly} onChange={set('rate_monthly')} className={inp} placeholder="e.g. 350000" />
                  </div>
                </div>
              )}

              {form.ownership === 'Own' && (
                <div>
                  <label className={lbl}>
                    Asset Classification *
                    {form.eq_type && eqTypes.find(t => t.name === form.eq_type)?.asset_category && (
                      <span className="ml-2 text-xs font-normal text-emerald-600">(auto-filled from asset name)</span>
                    )}
                  </label>
                  <select value={form.asset_type} onChange={set('asset_type')} className={inp}>
                    {ASSET_TYPE.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
              )}

              <p className={sec}>Identification</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Asset Code</label>
                  <input type="text" value={form.asset_code} onChange={set('asset_code')} className={inp} placeholder="e.g. AST-001" />
                </div>
                <div>
                  <label className={lbl}>Machine SL No *</label>
                  <input type="text" value={form.slno} onChange={set('slno')} className={inp} placeholder="e.g. E-EX-01" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Registration No</label>
                  <input type="text" value={form.reg_no} onChange={set('reg_no')} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Chassis No</label>
                  <input type="text" value={form.chassis_no} onChange={set('chassis_no')} className={inp} />
                </div>
              </div>

              <div>
                <label className={lbl}>Fuel Type</label>
                <select value={form.fuel_type} onChange={set('fuel_type')} className={inp + ' max-w-xs'}>
                  {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>

              {form.ownership === 'Own' && (
                <>
                  <p className={sec}>Purchase Details</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={lbl}>Date of Purchase *</label>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Shift Roster *</label>
                  <select value={form.shift_type} onChange={set('shift_type')} className={inp}>
                    {SHIFTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Reading Type *</label>
                  <select value={form.reading1_basis} onChange={set('reading1_basis')} className={inp}>
                    {READINGS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="dual" checked={form.dual_reading} onChange={set('dual_reading')} className="rounded border-gray-300" />
                <label htmlFor="dual" className="text-sm text-gray-700 select-none">Dual Reading (secondary meter)</label>
                {form.dual_reading && (
                  <select value={form.reading2_basis} onChange={set('reading2_basis')} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ml-2">
                    <option value="">— select —</option>
                    {READINGS.map(r => <option key={r}>{r}</option>)}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Fuel Min (L/hr)</label><input type="number" step="0.1" value={form.fuel_min} onChange={set('fuel_min')} className={inp} placeholder="Hours-basis" /></div>
                <div><label className={lbl}>Fuel Max (L/hr)</label><input type="number" step="0.1" value={form.fuel_max} onChange={set('fuel_max')} className={inp} placeholder="Hours-basis" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Fuel Min (kms/ltr)</label><input type="number" step="0.1" value={form.fuel_min_km} onChange={set('fuel_min_km')} className={inp} placeholder="KM-basis" /></div>
                <div><label className={lbl}>Fuel Max (kms/ltr)</label><input type="number" step="0.1" value={form.fuel_max_km} onChange={set('fuel_max_km')} className={inp} placeholder="KM-basis" /></div>
              </div>
              <div>
                <label className={lbl}>Planned Hrs/Day</label>
                <input type="number" step="0.5" value={form.planned_hours} onChange={set('planned_hours')} className={inp + ' max-w-xs'} />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
          )}

          {/* ── BULK UPLOAD ── */}
          {tab === 'bulk' && (
            <div className="p-5 space-y-4">
              {/* Equipment types quick reference */}
              {eqTypes.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1.5">
                    Asset Names (M = Measurable, NM = Non-Measurable) — also listed in the template's second sheet:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {eqTypes.map(t => (
                      <span key={t.id} className="text-xs bg-white border border-amber-300 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                        {t.name}
                        {t.asset_category && (
                          <span className={`text-[10px] font-semibold ${t.asset_category === 'Measurable' ? 'text-emerald-700' : 'text-purple-700'}`}>
                            {t.asset_category === 'Measurable' ? 'M' : 'NM'}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 1 — Download template */}
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <span className="w-5 h-5 flex-shrink-0 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold mt-0.5">1</span>
                <div className="flex-1 space-y-2">
                  <p className="text-xs font-medium text-gray-700">Download the template, fill in your asset data, then re-upload.</p>
                  <p className="text-xs text-gray-500">
                    Required: <strong>Project Code</strong>, <strong>Machine SL#</strong>, <strong>Asset Name</strong>, <strong>Ownership</strong>, <strong>Shift Type</strong>.
                    Use <em>Fuel Min/Max (kms/ltr)</em> for KM-basis machines. <em>Hire Charges/Day</em> and <em>/Month</em> for Hire assets.
                    The template includes an <em>Asset Names Ref</em> sheet with all valid names.
                  </p>
                  <button onClick={() => downloadAssetTemplate(projects, eqTypes)}
                    className="flex items-center gap-2 px-3 py-1.5 border border-blue-400 text-blue-700 bg-white hover:bg-blue-50 text-xs font-medium rounded-lg transition-colors">
                    <Download size={13} />Download Template (.xlsx)
                  </button>
                </div>
              </div>

              {/* Step 2 — Upload file */}
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="w-5 h-5 flex-shrink-0 rounded-full bg-gray-500 text-white text-xs flex items-center justify-center font-bold mt-0.5">2</span>
                <div className="flex-1 space-y-2">
                  <p className="text-xs font-medium text-gray-700">Upload the filled template</p>
                  <label className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 text-xs font-medium rounded-lg transition-colors cursor-pointer w-fit">
                    <Upload size={13} />
                    {bulkFile ? bulkFile.name : 'Choose .xlsx file…'}
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkFileChange} />
                  </label>

                  {bulkPreview?.error && (
                    <p className="text-xs text-red-600">{bulkPreview.error}</p>
                  )}

                  {bulkPreview?.items && (
                    <div className="space-y-2">
                      <p className="text-xs text-green-700 font-medium">
                        ✓ {bulkPreview.items.length} row{bulkPreview.items.length !== 1 ? 's' : ''} ready to upload
                      </p>
                      {bulkPreview.skipped?.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
                          <p className="text-xs font-semibold text-amber-700">
                            ⚠ {bulkPreview.skipped.length} row{bulkPreview.skipped.length !== 1 ? 's' : ''} skipped (no Machine SL# or Asset Code):
                          </p>
                          {bulkPreview.skipped.map((s, i) => (
                            <p key={i} className="text-xs text-amber-600">Row {s.row}: {s.reason}</p>
                          ))}
                        </div>
                      )}
                      <div className="overflow-x-auto rounded border border-gray-200 max-h-44">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-100 text-gray-600 sticky top-0">
                            <tr>
                              {['#','Project','SL#','Asset Name','Category','Own/Hire','Shift'].map(h => (
                                <th key={h} className="px-2 py-1 text-left font-medium whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {bulkPreview.items.map((item, i) => (
                              <tr key={i} className="bg-white">
                                <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                                <td className="px-2 py-1 font-medium text-blue-700">{item.project_code}</td>
                                <td className="px-2 py-1 font-semibold">{item.slno}</td>
                                <td className="px-2 py-1">{item.eq_type}</td>
                                <td className="px-2 py-1">
                                  {item.asset_type ? (
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                      item.asset_type === 'Measurable Asset'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-purple-100 text-purple-700'
                                    }`}>
                                      {item.asset_type === 'Measurable Asset' ? 'M' : 'NM'}
                                    </span>
                                  ) : <span className="text-gray-400">—</span>}
                                </td>
                                <td className="px-2 py-1">
                                  <span className={`font-medium ${item.ownership === 'Own' ? 'text-blue-600' : 'text-violet-600'}`}>
                                    {item.ownership}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-gray-600">{item.shift_type}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center gap-3 pt-1">
                        <button onClick={handleBulkUpload} disabled={bulkSaving}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors">
                          <Upload size={14} />{bulkSaving ? 'Uploading…' : `Upload ${bulkPreview.items.length} Asset${bulkPreview.items.length !== 1 ? 's' : ''}`}
                        </button>
                        <button onClick={resetBulk} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Clear</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Result */}
              {bulkResult && (
                <div className={`rounded-xl p-4 space-y-2 ${bulkResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                  {bulkResult.error ? (
                    <p className="text-sm text-red-700 font-medium flex items-center gap-2"><AlertCircle size={15} />{bulkResult.error}</p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                        <CheckCircle size={15} />Upload complete — {bulkResult.created} created{bulkResult.failed > 0 ? `, ${bulkResult.failed} failed` : ''}
                      </p>
                      {bulkResult.errors?.length > 0 && (
                        <ul className="text-xs text-red-700 space-y-0.5">
                          {bulkResult.errors.map((e, i) => (
                            <li key={i}>Row {e.row} ({e.slno || '—'}): {e.error}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex gap-3 flex-shrink-0">
          {tab === 'single' ? (
            <>
              <button onClick={handleSingle} disabled={saving}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Saving…' : 'Save Asset'}
              </button>
              <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">Cancel</button>
            </>
          ) : (
            <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">Close</button>
          )}
        </div>
      </div>
    </div>
  )
}
