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

/* ── Unified Excel template (same format as Machine Registry bulk upload) ─── */
const TEMPLATE_HEADERS = [
  'Sl No', 'Project Code', 'Machine SL#', 'Equipment Type', 'Category',
  'Ownership', 'Manufacturer', 'Model', 'Capacity', 'UOM',
  'Reg No', 'Chassis No', 'Fuel Type', 'Shift Type', 'Reading Basis',
  'Fuel Min (L/hr)', 'Fuel Max (L/hr)', 'Planned Hrs/Day',
  'Date of Purchase (YYYY-MM-DD)', 'PO Number', 'Purchase Price (₹)', 'Vendor',
]

async function downloadAssetTemplate(projects, eqTypes) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()
  const projList = projects.map(p => p.code).join(', ') || 'PROJECT_CODE'

  const ws = XLSX.utils.aoa_to_sheet([
    ['Asset Register Bulk Upload Template'],
    [`Project Codes available: ${projList}`],
    ['Ownership: Own or Hire  |  Shift: Single Shift or Dual Shift  |  Reading Basis: Hours or KM  |  Fuel Type: Diesel / Petrol / EV / N/A'],
    ['Category auto-fills from Equipment Type. Date of Purchase required for Own. Vendor required for Hire.'],
    [],
    TEMPLATE_HEADERS,
    [1, projects[0]?.code || 'PRJ001', 'E6-EX-02', 'Excavator', 'Measurable',
     'Own', 'Komatsu', 'PC200', '20T', 'Tons', 'KA01AB1234', 'CH12345', 'Diesel',
     'Single Shift', 'Hours', 5, 8, 10, '2024-01-15', 'PO-001', 5000000, ''],
    [2, projects[0]?.code || 'PRJ001', 'E6-DG-01', 'Diesel Generator', 'Measurable',
     'Hire', 'Kirloskar', 'KG2-5AS', '125', 'KVA', '', '', 'Diesel',
     'Single Shift', 'Hours', 3, 6, 10, '', '', '', 'AcmeCo'],
  ])

  ws['!cols'] = [
    {wch:6},{wch:14},{wch:14},{wch:28},{wch:16},
    {wch:10},{wch:14},{wch:14},{wch:10},{wch:8},
    {wch:14},{wch:14},{wch:10},{wch:14},{wch:14},
    {wch:14},{wch:14},{wch:14},{wch:26},{wch:14},{wch:18},{wch:16},
  ]
  const headerR = 5
  TEMPLATE_HEADERS.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: headerR, c: ci })
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D0D8E8' } } }
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Asset Register')

  // Equipment Types reference sheet
  if (eqTypes.length > 0) {
    const etWs = XLSX.utils.aoa_to_sheet([
      ['Equipment Types Reference — use exact spelling in the "Equipment Type" column'],
      [],
      ['No', 'Equipment Type Name', 'Category'],
      ...eqTypes.map((t, i) => [i + 1, t.name, t.asset_category || '—']),
    ])
    etWs['!cols'] = [{ wch: 6 }, { wch: 36 }, { wch: 18 }]
    ;['A3', 'B3', 'C3'].forEach(ref => {
      if (etWs[ref]) etWs[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D0D8E8' } } }
    })
    XLSX.utils.book_append_sheet(wb, etWs, 'Equipment Types Ref')
  }

  XLSX.writeFile(wb, `AssetRegister_Template_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function parseAssetFile(file) {
  const XLSX = await import('xlsx')
  const data = await file.arrayBuffer()
  const wb   = XLSX.read(data)
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  let headerRow = -1
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map(c => String(c).trim().toLowerCase())
    if (lower.includes('machine sl#') || lower.includes('project code')) { headerRow = i; break }
  }
  if (headerRow === -1)
    return { error: 'Cannot find the header row. Ensure columns "Project Code" and "Machine SL#" are present.' }

  const headers    = rows[headerRow].map(c => String(c).trim().toLowerCase())
  const col = k => headers.findIndex(h => h.startsWith(k))

  const projCol     = col('project code')
  const slnoCol     = col('machine sl')
  const typeCol     = col('equipment type')
  const catCol      = col('category')
  const ownCol      = col('ownership')
  const mfrCol      = col('manufacturer')
  const modelCol    = col('model')
  const capCol      = col('capacity')
  const uomCol      = col('uom')
  const regCol      = col('reg no')
  const chassisCol  = col('chassis')
  const fuelTypeCol = col('fuel type')
  const shiftCol    = col('shift type')
  const basisCol    = col('reading basis')
  const fuelMinCol  = col('fuel min')
  const fuelMaxCol  = col('fuel max')
  const planCol     = col('planned')
  const dobCol      = col('date of purchase')
  const poCol       = col('po number')
  const priceCol    = col('purchase price')
  const vendorCol   = col('vendor')

  if (projCol === -1 || slnoCol === -1 || typeCol === -1)
    return { error: 'Missing required columns: "Project Code", "Machine SL#", "Equipment Type".' }

  const items = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r    = rows[i]
    const slno = String(r[slnoCol] ?? '').trim()
    if (!slno) continue

    const catRaw   = catCol >= 0 ? String(r[catCol] ?? '').trim() : ''
    const asset_type =
      catRaw === 'Measurable'     ? 'Measurable Asset'     :
      catRaw === 'Non-Measurable' ? 'Non-Measurable Asset' : null

    items.push({
      project_code:     String(r[projCol]     ?? '').trim(),
      slno,
      eq_type:          String(r[typeCol]     ?? '').trim(),
      asset_type,
      ownership:        String(r[ownCol]      ?? 'Own').trim()          || 'Own',
      manufacturer:     mfrCol     >= 0 ? (String(r[mfrCol]     ?? '').trim() || null) : null,
      model:            modelCol   >= 0 ? (String(r[modelCol]   ?? '').trim() || null) : null,
      capacity:         capCol     >= 0 ? (String(r[capCol]     ?? '').trim() || null) : null,
      uom:              uomCol     >= 0 ? (String(r[uomCol]     ?? '').trim() || null) : null,
      reg_no:           regCol     >= 0 ? (String(r[regCol]     ?? '').trim() || null) : null,
      chassis_no:       chassisCol >= 0 ? (String(r[chassisCol] ?? '').trim() || null) : null,
      fuel_type:        fuelTypeCol>= 0 ? (String(r[fuelTypeCol]?? '').trim() || null) : null,
      shift_type:       String(r[shiftCol]    ?? 'Single Shift').trim() || 'Single Shift',
      reading1_basis:   basisCol   >= 0 ? (String(r[basisCol]   ?? 'Hours').trim() || 'Hours') : 'Hours',
      fuel_min:         fuelMinCol >= 0 ? (parseFloat(r[fuelMinCol]) || null) : null,
      fuel_max:         fuelMaxCol >= 0 ? (parseFloat(r[fuelMaxCol]) || null) : null,
      planned_hours:    planCol    >= 0 ? (parseFloat(r[planCol])    || 10)   : 10,
      date_of_purchase: dobCol     >= 0 ? (String(r[dobCol]  ?? '').trim() || null) : null,
      po_number:        poCol      >= 0 ? (String(r[poCol]   ?? '').trim() || null) : null,
      price:            priceCol   >= 0 ? (parseFloat(r[priceCol]) || null)  : null,
      vendor:           vendorCol  >= 0 ? (String(r[vendorCol] ?? '').trim() || null) : null,
    })
  }
  if (items.length === 0) return { error: 'No asset rows found in the file.' }
  return { items }
}

/* ── Blank form ───────────────────────────────────────────────────────────── */
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
  const [tab, setTab]             = useState('single')
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
      }
      return next
    })
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

              {form.ownership === 'Own' && (
                <div>
                  <label className={lbl}>
                    Asset Classification *
                    {form.eq_type && eqTypes.find(t => t.name === form.eq_type)?.asset_category && (
                      <span className="ml-2 text-xs font-normal text-emerald-600">(auto-filled from equipment type)</span>
                    )}
                  </label>
                  <select value={form.asset_type} onChange={set('asset_type')} className={inp}>
                    {ASSET_TYPE.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
              )}

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
            <div className="p-5 space-y-4">
              {/* Equipment types quick reference */}
              {eqTypes.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1.5">
                    Equipment Types (M = Measurable, NM = Non-Measurable) — also listed in the template's second sheet:
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
                    Required: <strong>Project Code</strong>, <strong>Machine SL#</strong>, <strong>Equipment Type</strong>, <strong>Ownership</strong>, <strong>Shift Type</strong>.
                    The template includes an <em>Equipment Types Ref</em> sheet listing all valid types with their categories.
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
                        {bulkPreview.items.length} row{bulkPreview.items.length !== 1 ? 's' : ''} ready to upload
                      </p>
                      <div className="overflow-x-auto rounded border border-gray-200 max-h-44">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-100 text-gray-600 sticky top-0">
                            <tr>
                              {['#','Project','SL#','Equipment Type','Category','Own/Hire','Shift'].map(h => (
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
