import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, X, Plus, Pencil, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Save } from 'lucide-react'
import { getAssetMatrix, getAssetMatrixTypes, createAssetMatrix, updateAssetMatrix } from '../../lib/api'

/* ── Spec field definitions per asset family ─────────────────────────────── */
const ENGINE_FIELDS = [
  { key: 'engine_make',         label: 'Engine Make',        type: 'text'   },
  { key: 'engine_model',        label: 'Engine Model',       type: 'text'   },
  { key: 'engine_capacity_cc',  label: 'Engine Capacity',    type: 'number', unit: 'cc'  },
  { key: 'rated_power_hp',      label: 'Rated Power',        type: 'number', unit: 'HP'  },
  { key: 'rated_rpm',           label: 'Rated RPM',          type: 'number', unit: 'RPM' },
  { key: 'fuel_tank_l',         label: 'Fuel Tank Capacity', type: 'number', unit: 'L'   },
  { key: 'battery_voltage_v',   label: 'Battery Voltage',    type: 'number', unit: 'V'   },
  { key: 'battery_capacity_ah', label: 'Battery Capacity',   type: 'number', unit: 'Ah'  },
]

// tower_crane MUST be defined before crane so it is matched first
const SPEC_GROUPS = {
  generator: {
    label: 'Generator / Genset',
    match: t => /genset|generator|dg.?set/i.test(t),
    fields: [
      { key: 'rated_kva',        label: 'Rated KVA',       type: 'number', unit: 'KVA' },
      { key: 'rated_kw',         label: 'Rated KW',        type: 'number', unit: 'kW'  },
      { key: 'phase',            label: 'Phase',           type: 'select', options: ['Single Phase', 'Three Phase'] },
      { key: 'frequency_hz',     label: 'Frequency',       type: 'number', unit: 'Hz'  },
      { key: 'output_voltage_v', label: 'Output Voltage',  type: 'number', unit: 'V'   },
      { key: 'power_factor',     label: 'Power Factor',    type: 'number'              },
      { key: 'alternator_make',  label: 'Alternator Make', type: 'text'                },
      { key: 'alternator_model', label: 'Alternator Model',type: 'text'                },
      ...ENGINE_FIELDS,
    ],
  },
  tower_crane: {
    label: 'Tower / Gantry / EOT / Jib Crane',
    match: t => /tower.?crane|gantry.?crane|eot.?crane|jib.?crane/i.test(t),
    fields: [
      { key: 'max_lift_t',       label: 'Max Lift Capacity', type: 'number', unit: 'T'  },
      { key: 'max_jib_length_m', label: 'Max Jib Length',    type: 'number', unit: 'm'  },
      { key: 'max_lift_height_m',label: 'Max Lift Height',   type: 'number', unit: 'm'  },
      { key: 'hoist_motor_kw',   label: 'Hoist Motor',       type: 'number', unit: 'kW' },
      { key: 'slew_motor_kw',    label: 'Slew Motor',        type: 'number', unit: 'kW' },
    ],
  },
  crane: {
    label: 'Crane (Mobile / Pick & Carry / Telescopic)',
    match: t => /crane|pick.?and.?carry|telehandler/i.test(t),
    fields: [
      { key: 'max_lift_t',        label: 'Max Lift Capacity', type: 'number', unit: 'T'  },
      { key: 'max_boom_length_m', label: 'Max Boom Length',   type: 'number', unit: 'm'  },
      { key: 'max_lift_height_m', label: 'Max Lift Height',   type: 'number', unit: 'm'  },
      { key: 'max_outreach_m',    label: 'Max Outreach',      type: 'number', unit: 'm'  },
      { key: 'carrier_tyre_size', label: 'Carrier Tyre Size', type: 'text'               },
      ...ENGINE_FIELDS,
    ],
  },
  earthmoving: {
    label: 'Earthmoving (Excavator / Loader / Dozer / Grader)',
    match: t => /excavat|backhoe|dozer|wheel.?loader|skid.?steer|motor.?grader/i.test(t),
    fields: [
      { key: 'operating_weight_t', label: 'Operating Weight', type: 'number', unit: 'T'  },
      { key: 'bucket_capacity_m3', label: 'Bucket Capacity',  type: 'number', unit: 'm³' },
      { key: 'track_width_mm',     label: 'Track Width',      type: 'number', unit: 'mm' },
      { key: 'tyre_size',          label: 'Tyre Size',        type: 'text'               },
      ...ENGINE_FIELDS,
    ],
  },
  vehicle: {
    label: 'Vehicle / Truck / Tipper / Bus / Car',
    match: t => /tipper|truck|bus|car|pickup|vehicle|utility|multi.?utility|tractor.?truck/i.test(t),
    fields: [
      { key: 'gvw_t',           label: 'GVW',                type: 'number', unit: 'T'              },
      { key: 'payload_t',       label: 'Payload',            type: 'number', unit: 'T'              },
      { key: 'axle_config',     label: 'Axle Configuration', type: 'text',   placeholder: 'e.g. 6×4'},
      { key: 'no_of_tyres',     label: 'No. of Tyres',       type: 'number'                        },
      { key: 'tyre_size_front', label: 'Tyre Size (Front)',  type: 'text'                           },
      { key: 'tyre_size_rear',  label: 'Tyre Size (Rear)',   type: 'text'                           },
      { key: 'seating_capacity',label: 'Seating Capacity',   type: 'number'                        },
      ...ENGINE_FIELDS,
    ],
  },
  tractor: {
    label: 'Tractor',
    match: t => /^tractor$/i.test(t.trim()) || /tractor\s+(with|trolley|tanker)/i.test(t),
    fields: [
      { key: 'pto_hp',          label: 'PTO HP',           type: 'number', unit: 'HP' },
      { key: 'no_of_gears',     label: 'No. of Gears',     type: 'number'             },
      { key: 'tyre_size_front', label: 'Tyre Size (Front)',type: 'text'               },
      { key: 'tyre_size_rear',  label: 'Tyre Size (Rear)', type: 'text'               },
      ...ENGINE_FIELDS,
    ],
  },
  concrete_pump: {
    label: 'Concrete Pump / Boom Placer',
    match: t => /concrete.?pump|boom.?placer/i.test(t),
    fields: [
      { key: 'max_output_m3hr',  label: 'Max Output',        type: 'number', unit: 'm³/hr' },
      { key: 'max_pressure_bar', label: 'Max Pressure',      type: 'number', unit: 'bar'   },
      { key: 'boom_reach_m',     label: 'Boom Reach',        type: 'number', unit: 'm'     },
      { key: 'pipeline_dia_mm',  label: 'Pipeline Diameter', type: 'number', unit: 'mm'    },
      ...ENGINE_FIELDS,
    ],
  },
  transit_mixer: {
    label: 'Transit / Concrete Mixer',
    match: t => /transit.?mixer|concrete.?mixer/i.test(t),
    fields: [
      { key: 'drum_capacity_m3', label: 'Drum Capacity', type: 'number', unit: 'm³' },
      { key: 'gvw_t',            label: 'GVW',           type: 'number', unit: 'T'  },
      { key: 'tyre_size',        label: 'Tyre Size',     type: 'text'               },
      ...ENGINE_FIELDS,
    ],
  },
  compressor: {
    label: 'Compressor',
    match: t => /compressor/i.test(t),
    fields: [
      { key: 'rated_cfm',       label: 'Rated CFM',        type: 'number', unit: 'CFM' },
      { key: 'rated_bar',       label: 'Rated Pressure',   type: 'number', unit: 'bar' },
      { key: 'no_of_cylinders', label: 'No. of Cylinders', type: 'number'              },
      ...ENGINE_FIELDS,
    ],
  },
  paver_roller: {
    label: 'Paver / Roller / Compactor',
    match: t => /paver|roller|compactor|vibratory/i.test(t),
    fields: [
      { key: 'paving_width_m',     label: 'Paving Width',    type: 'number', unit: 'm'  },
      { key: 'operating_weight_t', label: 'Operating Weight',type: 'number', unit: 'T'  },
      { key: 'drum_width_m',       label: 'Drum Width',      type: 'number', unit: 'm'  },
      { key: 'amplitude_mm',       label: 'Amplitude',       type: 'number', unit: 'mm' },
      ...ENGINE_FIELDS,
    ],
  },
  plant: {
    label: 'Batching / Asphalt / Mix Plant',
    match: t => /batch|asphalt|mix.?plant|macadam/i.test(t),
    fields: [
      { key: 'output_capacity', label: 'Output Capacity', type: 'number', unit: 'TPH / m³hr' },
      { key: 'rated_power_kw',  label: 'Rated Power',     type: 'number', unit: 'kW'         },
      { key: 'no_of_mixers',    label: 'No. of Mixers',   type: 'number'                     },
    ],
  },
  lighting_tower: {
    label: 'Lighting Tower',
    match: t => /lighting.?tower|light.?tower/i.test(t),
    fields: [
      { key: 'rated_kva',      label: 'Rated KVA',    type: 'number', unit: 'KVA' },
      { key: 'no_of_lamps',    label: 'No. of Lamps', type: 'number'              },
      { key: 'lamp_wattage_w', label: 'Lamp Wattage', type: 'number', unit: 'W'   },
      { key: 'mast_height_m',  label: 'Mast Height',  type: 'number', unit: 'm'   },
      ...ENGINE_FIELDS,
    ],
  },
  piling: {
    label: 'Piling / Drill Rig',
    match: t => /piling|drill.?rig|drill.?jumbo/i.test(t),
    fields: [
      { key: 'max_pile_dia_mm', label: 'Max Pile Dia', type: 'number', unit: 'mm' },
      { key: 'max_depth_m',     label: 'Max Depth',    type: 'number', unit: 'm'  },
      { key: 'crowd_force_kn',  label: 'Crowd Force',  type: 'number', unit: 'kN' },
      ...ENGINE_FIELDS,
    ],
  },
}

function getSpecFields(assetType) {
  if (!assetType) return ENGINE_FIELDS
  for (const grp of Object.values(SPEC_GROUPS)) {
    if (grp.match(assetType)) return grp.fields
  }
  return ENGINE_FIELDS
}

/* ── Spec completeness indicator ─────────────────────────────────────────── */
function specCount(specs, fields) {
  if (!specs) return { filled: 0, total: fields.length }
  const filled = fields.filter(f => specs[f.key] !== undefined && specs[f.key] !== '' && specs[f.key] !== null).length
  return { filled, total: fields.length }
}

/* ── Spec Editor Modal ───────────────────────────────────────────────────── */
function SpecModal({ entry, onClose, onSaved }) {
  const fields = getSpecFields(entry.asset_type)
  const [specs,  setSpecs]  = useState({ ...(entry.technical_specs || {}) })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const inp = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white'

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      const cleaned = {}
      for (const [k, v] of Object.entries(specs)) {
        if (v !== '' && v !== null && v !== undefined) cleaned[k] = v
      }
      await updateAssetMatrix(entry.am_id, { technical_specs: cleaned })
      setSaving(false)
      onSaved()   // reload list
      onClose()   // close modal
    } catch (e) {
      setSaving(false)
      setErr(e.response?.data?.error || 'Save failed')
    }
  }

  const { filled, total } = specCount(specs, fields)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-blue-600 tracking-widest uppercase">{entry.am_id}</p>
            <h2 className="text-base font-bold text-gray-900 mt-0.5">{entry.manufacturer} {entry.model}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{entry.asset_type}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${filled === total ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {filled}/{total} fields filled
            </span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
          </div>
        </div>

        {/* Fields */}
        <div className="overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            {fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {f.label}{f.unit ? <span className="text-gray-400 font-normal"> ({f.unit})</span> : ''}
                </label>
                {f.type === 'select' ? (
                  <select
                    value={specs[f.key] || ''}
                    onChange={e => setSpecs(s => ({ ...s, [f.key]: e.target.value || undefined }))}
                    className={inp}
                  >
                    <option value="">— select —</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={specs[f.key] ?? ''}
                    placeholder={f.placeholder || ''}
                    onChange={e => {
                      const v = f.type === 'number'
                        ? (e.target.value === '' ? undefined : parseFloat(e.target.value))
                        : (e.target.value || undefined)
                      setSpecs(s => ({ ...s, [f.key]: v }))
                    }}
                    className={inp}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-100">
          {err ? <p className="text-xs text-red-600">{err}</p> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Save size={14} />{saving ? 'Saving…' : 'Save Specs'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Add New Entry Modal ─────────────────────────────────────────────────── */
const FUEL_OPTIONS = ['HS Diesel', 'Petrol', 'CNG', 'Electric', 'N/A']

function AddModal({ assetTypes, onClose, onSaved }) {
  const [form,   setForm]   = useState({ asset_type: '', manufacturer: '', model: '', fuel_type: '' })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')
  const [dupId,  setDupId]  = useState('')

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  const handleSave = async () => {
    setErr(''); setDupId('')
    if (!form.manufacturer.trim()) { setErr('Manufacturer is required'); return }
    if (!form.model.trim())        { setErr('Model is required'); return }
    setSaving(true)
    try {
      await createAssetMatrix(form)
      setSaving(false)
      onSaved()
      onClose()
    } catch (e) {
      setSaving(false)
      if (e.response?.status === 409) {
        setErr(e.response.data.error)
        setDupId(e.response.data.existing_am_id)
      } else {
        setErr(e.response?.data?.error || 'Save failed')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Add Asset Matrix Entry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className={lbl}>Asset Type</label>
            <select value={form.asset_type} onChange={e => setForm(f => ({ ...f, asset_type: e.target.value }))} className={inp}>
              <option value="">— select —</option>
              {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Manufacturer / Make <span className="text-red-500">*</span></label>
            <input type="text" value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} className={inp} placeholder="e.g. Volvo CE" />
          </div>
          <div>
            <label className={lbl}>Model <span className="text-red-500">*</span></label>
            <input type="text" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} className={inp} placeholder="e.g. EC210" />
          </div>
          <div>
            <label className={lbl}>Fuel Type</label>
            <select value={form.fuel_type} onChange={e => setForm(f => ({ ...f, fuel_type: e.target.value }))} className={inp}>
              <option value="">— select —</option>
              {FUEL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {err && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                {err}
                {dupId && <p className="mt-1 font-semibold">Existing AM ID: {dupId}</p>}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg"
          >
            <Plus size={14} />{saving ? 'Adding…' : 'Add Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
const PAGE_SIZE = 50

export default function AssetMatrix() {
  const [rows,       setRows]       = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [filterType, setFilterType] = useState('')
  const [assetTypes, setAssetTypes] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [editEntry,  setEditEntry]  = useState(null)
  const [showAdd,    setShowAdd]    = useState(false)
  const [editTank,   setEditTank]   = useState(null) // { amId, value, saving }

  // Stale-load guard: only the latest request updates state
  const loadIdRef = useRef(0)

  const load = useCallback(async (pg) => {
    const id = ++loadIdRef.current
    setLoading(true)
    try {
      const res = await getAssetMatrix({ q: search, asset_type: filterType, page: pg, limit: PAGE_SIZE })
      if (loadIdRef.current !== id) return
      setRows(res.data.data)
      setTotal(res.data.total)
    } catch {}
    finally { if (loadIdRef.current === id) setLoading(false) }
  }, [search, filterType])

  // Search/filter change → always reset to page 1 and reload
  useEffect(() => {
    setPage(1)
    load(1)
  }, [search, filterType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pagination click → reload current page (guard against re-fire on filter reset)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(page) }, [page])

  useEffect(() => {
    getAssetMatrixTypes().then(r => setAssetTypes(r.data.data)).catch(() => {})
  }, [])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const saveTankCap = async (row, value) => {
    const num = value === '' ? null : parseFloat(value)
    if (value !== '' && (isNaN(num) || num < 0)) { setEditTank(null); return }
    setEditTank(et => et ? { ...et, saving: true } : null)
    try {
      const base = { ...(row.technical_specs || {}) }
      if (num != null) base.fuel_tank_l = num; else delete base.fuel_tank_l
      await updateAssetMatrix(row.am_id, { technical_specs: base })
      setRows(rs => rs.map(r => r.am_id === row.am_id ? { ...r, technical_specs: base } : r))
    } catch {}
    setEditTank(null)
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  const specBadge = (entry) => {
    const fields = getSpecFields(entry.asset_type)
    const { filled, total: tot } = specCount(entry.technical_specs, fields)
    if (filled === 0)   return <span className="text-xs text-gray-300">No specs</span>
    if (filled === tot) return <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle size={11} />Complete</span>
    return <span className="text-xs text-amber-600">{filled}/{tot}</span>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Asset Matrix</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} entries — unique Make + Model combinations with technical specs
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={14} /> Add Entry
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 bg-white flex-1 min-w-48">
          <Search size={14} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search AM ID, make, model…"
            className="flex-1 text-sm outline-none bg-transparent"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-300 hover:text-gray-500">
              <X size={13} />
            </button>
          )}
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className={inp}>
          <option value="">All Asset Types</option>
          {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 whitespace-nowrap">AM ID</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Asset Type</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Manufacturer</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Model</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Fuel</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 whitespace-nowrap">
                  Fuel Tank (L)
                  <span className="ml-1 text-gray-300 font-normal">click to edit</span>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Tech Specs</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-sm text-gray-400">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-sm text-gray-400">No entries found</td>
                </tr>
              ) : rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-blue-700 font-semibold whitespace-nowrap">{r.am_id}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs max-w-[160px] truncate" title={r.asset_type}>{r.asset_type || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-800 font-medium">{r.manufacturer}</td>
                  <td className="px-4 py-2.5 text-gray-800">{r.model}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{r.fuel_type || '—'}</td>
                  <td className="px-4 py-2.5">
                    {editTank?.amId === r.am_id ? (
                      <input
                        type="number" autoFocus min="0" step="1"
                        value={editTank.value}
                        disabled={editTank.saving}
                        onChange={e => setEditTank(et => ({ ...et, value: e.target.value }))}
                        onBlur={() => saveTankCap(r, editTank.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditTank(null) }}
                        className="w-24 border border-blue-400 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                        placeholder="e.g. 450"
                      />
                    ) : (
                      <button
                        onClick={() => setEditTank({ amId: r.am_id, value: r.technical_specs?.fuel_tank_l ?? '', saving: false })}
                        className="group flex items-center gap-1 text-left"
                        title="Click to set fuel tank capacity"
                      >
                        {r.technical_specs?.fuel_tank_l != null
                          ? <span className="text-xs font-mono font-semibold text-gray-800 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">{r.technical_specs.fuel_tank_l} L</span>
                          : <span className="text-xs text-gray-300 group-hover:text-blue-500 border border-dashed border-gray-200 group-hover:border-blue-300 px-2 py-0.5 rounded-md transition-colors">— set</span>
                        }
                        <Pencil size={10} className="text-gray-300 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{specBadge(r)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setEditEntry(r)}
                      className="p-1.5 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Edit specs"
                    >
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/40">
            <span className="text-xs text-gray-400">
              Page {page} of {totalPages} &bull; {total} total
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {editEntry && (
        <SpecModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => load(page)}
        />
      )}
      {showAdd && (
        <AddModal
          assetTypes={assetTypes}
          onClose={() => setShowAdd(false)}
          onSaved={() => { load(1); setPage(1) }}
        />
      )}
    </div>
  )
}
