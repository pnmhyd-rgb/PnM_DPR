import { useState, useEffect, useRef } from 'react'
import { X, Plus, Upload, Download, CheckCircle, AlertCircle } from 'lucide-react'
import {
  getProjects, getEquipmentTypes, getUomTypes, getVendors,
  createMachine, bulkCreateMachines, createUomType
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

const OWNERSHIP  = ['Own', 'Hire']
const ASSET_TYPE = ['Measurable Asset', 'Non-Measurable Asset']
const FUEL_TYPES = ['Diesel', 'Petrol', 'EV', 'N/A']
const SHIFTS     = ['Single Shift', 'Dual Shift']
const READINGS   = ['Hours', 'KM']
const OWN_NAME   = 'RVR Projects Pvt Ltd'

const CSV_HEADERS = [
  'project_code','eq_type','manufacturer','model','capacity','uom',
  'ownership','asset_type','vendor_name',
  'fuel_type','slno','chassis_no','reg_no',
  'date_of_purchase','po_number','price',
  'shift_type','reading1_basis','fuel_min','fuel_max','planned_hours'
]

const CSV_EXAMPLE = [
  'PRJ01','Excavator','Komatsu','PC200','20T','Tons',
  'Own','Measurable Asset','',
  'Diesel','E-EX-01','CHS123456','AP09AB1234',
  '2024-01-15','PO-001','5000000',
  'Single Shift','Hours','8','12','10'
]

function downloadTemplate(projectCode = 'PRJ01') {
  const example = [...CSV_EXAMPLE]
  example[0] = projectCode  // replace example project_code with actual selected project code
  const lines = [CSV_HEADERS.join(','), example.join(',')]
  const blob  = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url   = URL.createObjectURL(blob)
  const a     = document.createElement('a'); a.href = url
  a.download  = 'asset_bulk_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const obj  = {}
    headers.forEach((h, i) => { obj[h] = vals[i] || '' })
    return {
      project_code:    obj.project_code,
      eq_type:         obj.eq_type,
      manufacturer:    obj.manufacturer,
      model:           obj.model,
      capacity:        obj.capacity,
      uom:             obj.uom,
      ownership:       obj.ownership || 'Own',
      asset_type:      obj.asset_type,
      vendor:          obj.vendor_name,
      fuel_type:       obj.fuel_type,
      slno:            obj.slno,
      chassis_no:      obj.chassis_no,
      reg_no:          obj.reg_no,
      date_of_purchase: obj.date_of_purchase || null,
      po_number:       obj.po_number,
      price:           obj.price,
      shift_type:      obj.shift_type || 'Single Shift',
      reading1_basis:  obj.reading1_basis || 'Hours',
      fuel_min:        obj.fuel_min,
      fuel_max:        obj.fuel_max,
      planned_hours:   obj.planned_hours || '10',
    }
  })
}

const blank = {
  project_id: '', eq_type: '', manufacturer: '', model: '',
  capacity: '', uom: '', ownership: 'Own', asset_type: 'Measurable Asset',
  vendor: '', fuel_type: 'Diesel', slno: '', chassis_no: '', reg_no: '',
  date_of_purchase: '', po_number: '', price: '',
  shift_type: 'Single Shift', reading1_basis: 'Hours',
  reading2_basis: '', dual_reading: false,
  fuel_min: '', fuel_max: '', planned_hours: '10',
}

export default function AddAssetModal({ onClose, onSaved }) {
  const { isAdmin } = useAuth()
  const [tab, setTab]             = useState('single')   // 'single' | 'bulk'
  const [form, setForm]           = useState(blank)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const [projects, setProjects]   = useState([])
  const [eqTypes, setEqTypes]     = useState([])
  const [uomList, setUomList]     = useState([])
  const [vendors, setVendors]     = useState([])

  // Quick-add UOM (admin)
  const [newUom, setNewUom]       = useState('')
  const [addingUom, setAddingUom] = useState(false)

  // Bulk
  const fileRef                   = useRef()
  const [bulkRows, setBulkRows]   = useState([])
  const [bulkResult, setBulkResult] = useState(null)
  const [bulking, setBulking]     = useState(false)
  const [bulkProjectId, setBulkProjectId] = useState('')

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data)).catch(() => {})
    getEquipmentTypes().then(r => setEqTypes(r.data.data)).catch(() => {})
    getUomTypes().then(r => setUomList(r.data.data)).catch(() => {})
    getVendors().then(r => setVendors(r.data.data)).catch(() => {})
  }, [])

  const set = k => e => setForm(f => ({
    ...f,
    [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value
  }))

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
    if (!form.eq_type)    { setError('Equipment type is required'); return }
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
        price:         form.price || null,
        fuel_min:      form.fuel_min || null,
        fuel_max:      form.fuel_max || null,
        planned_hours: parseFloat(form.planned_hours) || 10,
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const rows = parseCSV(ev.target.result)
      setBulkRows(rows)
      setBulkResult(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleBulkUpload = async () => {
    if (!bulkRows.length) return
    if (!bulkProjectId) { setBulkResult({ error: 'Please select a project before uploading' }); return }
    setBulking(true); setBulkResult(null)
    try {
      const rows = bulkRows.map(r => ({ ...r, project_id: parseInt(bulkProjectId), project_code: undefined }))
      const res = await bulkCreateMachines(rows)
      setBulkResult(res.data)
      if (res.data.created > 0) onSaved?.()
    } catch (err) {
      setBulkResult({ error: err.response?.data?.error || 'Upload failed' })
    } finally { setBulking(false) }
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
              key={k} onClick={() => setTab(k)}
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
              {/* Project & Equipment Type */}
              <p className={sec}>Basic Information</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Project *</label>
                  <select value={form.project_id} onChange={set('project_id')} className={inp}>
                    <option value="">— select —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                  {isAdmin && <p className="text-xs text-blue-600 mt-1 cursor-pointer hover:underline" onClick={() => window.open('/admin/machines','_self')}>Manage projects in Admin</p>}
                </div>
                <div>
                  <label className={lbl}>Equipment Type *</label>
                  <select value={form.eq_type} onChange={set('eq_type')} className={inp}>
                    <option value="">— select —</option>
                    {eqTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                  {isAdmin && <p className="text-xs text-blue-600 mt-1 cursor-pointer hover:underline" onClick={() => window.open('/admin/equipment-types','_self')}>Add types in Admin</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Manufacturer</label>
                  <input type="text" value={form.manufacturer} onChange={set('manufacturer')} className={inp} placeholder="e.g. Komatsu" />
                </div>
                <div>
                  <label className={lbl}>Model</label>
                  <input type="text" value={form.model} onChange={set('model')} className={inp} placeholder="e.g. PC200" />
                </div>
              </div>

              {/* Capacity + UOM */}
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

              {/* Ownership */}
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

              {form.ownership === 'Own' && (
                <div>
                  <label className={lbl}>Asset Classification *</label>
                  <select value={form.asset_type} onChange={set('asset_type')} className={inp}>
                    {ASSET_TYPE.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
              )}

              {/* Identity */}
              <p className={sec}>Identification</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Machine SL No *</label>
                  <input type="text" value={form.slno} onChange={set('slno')} className={inp} placeholder="e.g. E-EX-01" />
                </div>
                <div>
                  <label className={lbl}>Chassis No</label>
                  <input type="text" value={form.chassis_no} onChange={set('chassis_no')} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Registration No</label>
                  <input type="text" value={form.reg_no} onChange={set('reg_no')} className={inp} />
                </div>
              </div>

              {/* Fuel */}
              <div>
                <label className={lbl}>Fuel Type</label>
                <select value={form.fuel_type} onChange={set('fuel_type')} className={inp + ' max-w-xs'}>
                  {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>

              {/* Own-only: purchase details */}
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

              {/* Operational */}
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

              <div className="grid grid-cols-3 gap-3">
                <div><label className={lbl}>Fuel Min (L/hr)</label><input type="number" step="0.1" value={form.fuel_min} onChange={set('fuel_min')} className={inp} /></div>
                <div><label className={lbl}>Fuel Max (L/hr)</label><input type="number" step="0.1" value={form.fuel_max} onChange={set('fuel_max')} className={inp} /></div>
                <div><label className={lbl}>Planned Hrs/Day</label><input type="number" step="0.5" value={form.planned_hours} onChange={set('planned_hours')} className={inp} /></div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
          )}

          {/* ── BULK UPLOAD ── */}
          {tab === 'bulk' && (
            <div className="p-5 space-y-5">
              {/* Step 1 — Select Project */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-yellow-800">Step 1 — Select Project</p>
                <p className="text-xs text-yellow-700">Choose the project these assets belong to. No need to fill project in the CSV.</p>
                <select
                  value={bulkProjectId}
                  onChange={e => setBulkProjectId(e.target.value)}
                  className="border border-yellow-300 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                >
                  <option value="">— Select a project —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name} {p.code ? `(${p.code})` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Step 2 — Download Template */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-blue-800">Step 2 — Download Template</p>
                <p className="text-xs text-blue-700">Download the CSV template, fill in asset data (no project column needed), then save as CSV.</p>
                <button
                  onClick={() => {
                    const proj = projects.find(p => String(p.id) === String(bulkProjectId))
                    downloadTemplate(proj?.code || 'PRJ01')
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-xs rounded-lg hover:bg-blue-800 transition-colors"
                >
                  <Download size={13} />Download Template (CSV)
                </button>
              </div>

              {/* Step 3 — Upload */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-gray-700">Step 3 — Upload Filled CSV</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-3 py-2 border border-gray-300 bg-white text-gray-700 text-xs rounded-lg hover:bg-gray-50 transition-colors">
                  <Upload size={13} />Choose CSV File
                </button>
                {bulkRows.length > 0 && (
                  <p className="text-xs text-green-700 font-medium">{bulkRows.length} row{bulkRows.length !== 1 ? 's' : ''} loaded — ready to upload</p>
                )}
              </div>

              {/* Preview */}
              {bulkRows.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <p className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-200">
                    Preview ({bulkRows.length} rows) — Project: <span className="text-blue-700">{projects.find(p => String(p.id) === String(bulkProjectId))?.name || '(none selected)'}</span>
                  </p>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          {['#','Type','Manufacturer','Model','SL No','Ownership','Shift'].map(h => (
                            <th key={h} className="px-3 py-1.5 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bulkRows.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-1.5">{r.eq_type}</td>
                            <td className="px-3 py-1.5">{r.manufacturer}</td>
                            <td className="px-3 py-1.5">{r.model}</td>
                            <td className="px-3 py-1.5 font-semibold">{r.slno}</td>
                            <td className="px-3 py-1.5">{r.ownership}</td>
                            <td className="px-3 py-1.5">{r.shift_type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Result */}
              {bulkResult && (
                <div className={`rounded-xl p-4 space-y-2 ${bulkResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                  {bulkResult.error ? (
                    <p className="text-sm text-red-700 font-medium flex items-center gap-2"><AlertCircle size={15} />{bulkResult.error}</p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                        <CheckCircle size={15} />Upload complete — {bulkResult.created} created, {bulkResult.failed} failed
                      </p>
                      {bulkResult.errors?.length > 0 && (
                        <ul className="text-xs text-red-700 space-y-0.5">
                          {bulkResult.errors.map((e, i) => (
                            <li key={i}>Row {e.row} ({e.slno}): {e.error}</li>
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
              <button onClick={handleSingle} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Saving…' : 'Save Asset'}
              </button>
              <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={handleBulkUpload} disabled={bulking || bulkRows.length === 0} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
                <Upload size={15} />{bulking ? 'Uploading…' : `Upload ${bulkRows.length > 0 ? `${bulkRows.length} Assets` : ''}`}
              </button>
              <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
