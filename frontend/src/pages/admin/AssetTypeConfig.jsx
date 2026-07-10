import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Save, Loader2, Plus, Trash2, CheckCircle2,
  Settings, BookOpen, Fuel, ShieldCheck, RotateCcw,
  ClipboardList, BarChart2, FileText, AlertCircle, Wrench, Bell, Lock,
} from 'lucide-react'
import { getEquipmentTypeConfig, saveEquipmentTypeConfig } from '../../lib/api'

/* ── helpers ── */
const lbl   = 'block text-xs font-medium text-gray-600 mb-1'
const inp   = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full'
const inpSm = 'border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

function Toggle({ checked, onChange, label, note }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 mt-0.5 w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
      <div>
        <p className="text-sm text-gray-800 font-medium leading-tight">{label}</p>
        {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
      </div>
    </label>
  )
}

function Section({ icon: Icon, title, color = 'blue', children }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    rose:   'bg-rose-50 border-rose-200 text-rose-700',
    slate:  'bg-slate-50 border-slate-200 text-slate-700',
    teal:   'bg-teal-50 border-teal-200 text-teal-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    cyan:   'bg-cyan-50 border-cyan-200 text-cyan-700',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`flex items-center gap-2.5 px-5 py-3 border-b ${colors[color]}`}>
        <Icon size={16} />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

const UNIT_OPTIONS    = ['Hrs', 'Km', 'Ltr', 'Units']
const SHIFT_OPTIONS   = ['Single Shift', 'Dual Shift']
const FORMULA_OPTIONS = [
  { value: 'L_per_Hr', label: 'Fuel Consumption — Fuel ÷ Hours (L/Hr)' },
  { value: 'KM_per_L', label: 'Fuel Economy — KM ÷ Fuel (KM/L)'       },
  { value: 'both',     label: 'Both — L/Hr + KM/L (Transit Mixer style)'},
]

function defaultConfig() {
  return {
    reading_configs: [],
    reset_reading_codes: [],
    fuel_applicable: true,
    fuel_type: '',
    fuel_tank_count: 1,
    fuel_formula_type: 'L_per_Hr',
    fuel_consumption_min: '',
    fuel_consumption_max: '',
    fuel_economy_min: '',
    fuel_economy_max: '',
    tm_split_mode: null,
    tm_split_value: '',
    qty_mandatory_if_km: false,
    qty_mandatory_if_hrs: false,
    closing_reading_mandatory: true,
    allow_negative_reading: false,
    max_daily_reading: '',
    counter_reset_allowed: true,
    shift_type: 'Single Shift',
    fuel_entry_enabled: true,
    breakdown_entry_enabled: true,
    work_done_mandatory: false,
    mandatory_operator: false,
    service_interval_hrs: '',
    preventive_maintenance: true,
    breakdown_maintenance: true,
    lubrication_interval_hrs: '',
    low_fuel_alert: false,
    service_due_alert: false,
    calibration_due_alert: false,
    counter_exception_alert: false,
    entry_approval: false,
    supervisor_approval: false,
    lock_after_approval: true,
    report_show_fuel_cost: true,
    report_show_fuel_rate: true,
    report_show_quantity: true,
    report_show_reading_details: true,
    report_show_work_done: true,
  }
}

export default function AssetTypeConfig() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [saved,        setSaved]        = useState(false)
  const [cfg,          setCfg]          = useState(defaultConfig)
  const [eqType,       setEqType]       = useState(null)
  const [machines,     setMachines]     = useState([])
  const [readingTypes, setReadingTypes] = useState([])
  const [showTmPopup,  setShowTmPopup]  = useState(false)
  const [tmPopupMode,  setTmPopupMode]  = useState('drum_rate')
  const [tmPopupValue, setTmPopupValue] = useState('')

  useEffect(() => {
    setLoading(true)
    getEquipmentTypeConfig(id)
      .then(r => {
        const d = r.data.data
        if (d.config) {
          setCfg({
            ...defaultConfig(),
            ...d.config,
            reading_configs:    d.config.reading_configs    || [],
            reset_reading_codes: d.config.reset_reading_codes || [],
          })
        }
        setEqType(d.eqType)
        setMachines(d.machines      || [])
        setReadingTypes(d.readingTypes || [])
      })
      .catch(e => setError(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  const set = (key, val) => setCfg(c => ({ ...c, [key]: val }))

  /* ── TM Popup ── */
  const openTmPopup = () => {
    const mode = cfg.tm_split_mode || 'drum_rate'
    setTmPopupMode(mode)
    setTmPopupValue(
      cfg.tm_split_value ? String(cfg.tm_split_value) :
      mode === 'drum_rate' ? String(cfg.fuel_consumption_min || '') : String(cfg.fuel_economy_min || '')
    )
    setShowTmPopup(true)
  }
  const handleTmModeChange = (newMode) => {
    setTmPopupMode(newMode)
    setTmPopupValue(newMode === 'drum_rate'
      ? String(cfg.fuel_consumption_min || '')
      : String(cfg.fuel_economy_min || ''))
  }
  const applyTmFormula = () => {
    set('tm_split_mode',  tmPopupMode)
    set('tm_split_value', tmPopupValue)
    setShowTmPopup(false)
  }

  /* ── Reading Configs ── */
  const addReading = () =>
    setCfg(c => ({
      ...c,
      reading_configs: [
        ...c.reading_configs,
        { code: '', name: '', unit: 'Hrs', mandatory: true, sort_order: c.reading_configs.length + 1 },
      ],
    }))

  const setReadingField = (idx, key, val) =>
    setCfg(c => ({
      ...c,
      reading_configs: c.reading_configs.map((r, i) => i === idx ? { ...r, [key]: val } : r),
    }))

  const removeReading = (idx) =>
    setCfg(c => ({ ...c, reading_configs: c.reading_configs.filter((_, i) => i !== idx) }))

  const toggleResetCode = (code) =>
    setCfg(c => {
      const codes = c.reset_reading_codes || []
      return {
        ...c,
        reset_reading_codes: codes.includes(code)
          ? codes.filter(x => x !== code)
          : [...codes, code],
      }
    })

  /* ── Save ── */
  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      await saveEquipmentTypeConfig(id, cfg)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/admin/equipment-types')}
          className="mt-0.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
            Asset Category
            {eqType?.asset_cat && <> › <span className="text-gray-500">{eqType.asset_cat}</span></>}
            {' › Asset Configuration'}
          </p>
          <h1 className="text-xl font-bold text-gray-900">{eqType?.name || '—'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {eqType?.asset_category && (
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mr-2 ${
                eqType.asset_category === 'Measurable'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-purple-100 text-purple-700'
              }`}>{eqType.asset_category}</span>
            )}
            {machines.length} active machine{machines.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle2 size={14} /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Section 1 — Asset Details (read-only) */}
      <Section icon={BookOpen} title="Asset Details" color="slate">
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            { label: 'Asset Name',     value: eqType?.name           },
            { label: 'Asset Category', value: eqType?.asset_cat      },
            { label: 'Asset Group',    value: eqType?.asset_group    },
            { label: 'Measurability',  value: eqType?.asset_category },
            { label: 'Fuel Type',      value: eqType?.fuel_type      },
            { label: 'Active Machines',value: machines.length        },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              <p className="font-medium text-gray-800">{value || '—'}</p>
            </div>
          ))}
        </div>

        {machines.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Machines ({machines.length})
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1.5 px-2 text-gray-500 font-semibold">Asset Code</th>
                    <th className="text-left py-1.5 px-2 text-gray-500 font-semibold">Nickname</th>
                    <th className="text-left py-1.5 px-2 text-gray-500 font-semibold">Fuel Type</th>
                    <th className="text-left py-1.5 px-2 text-gray-500 font-semibold">Shift</th>
                    <th className="text-left py-1.5 px-2 text-gray-500 font-semibold">Ownership</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {machines.map(m => (
                    <tr key={m.id} className="text-gray-700">
                      <td className="py-1.5 px-2 font-mono text-gray-500">{m.asset_code || m.slno || '—'}</td>
                      <td className="py-1.5 px-2 font-medium">{m.nickname || m.eq_type}</td>
                      <td className="py-1.5 px-2 text-gray-500">{m.fuel_type || '—'}</td>
                      <td className="py-1.5 px-2 text-gray-500">{m.shift_type || '—'}</td>
                      <td className="py-1.5 px-2">
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                          m.ownership === 'Own' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>{m.ownership || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* Section 2 — Reading Configuration */}
      <Section icon={Settings} title="Reading Configuration" color="blue">
        <div className="space-y-3">
          {cfg.reading_configs.map((r, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="col-span-1 text-center">
                <span className="text-xs font-bold text-gray-400">{idx + 1}</span>
              </div>
              <div className="col-span-3">
                <label className="block text-xs text-gray-400 mb-0.5">Reading Code</label>
                <select
                  value={r.code}
                  onChange={e => {
                    const rt = readingTypes.find(t => t.code === e.target.value)
                    setReadingField(idx, 'code', e.target.value)
                    if (rt) { setReadingField(idx, 'name', rt.name); setReadingField(idx, 'unit', rt.unit) }
                  }}
                  className={inpSm + ' w-full'}
                >
                  <option value="">— Select —</option>
                  {readingTypes.map(t => (
                    <option key={t.code} value={t.code}>{t.code} — {t.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-xs text-gray-400 mb-0.5">Display Name</label>
                <input
                  type="text" value={r.name}
                  onChange={e => setReadingField(idx, 'name', e.target.value)}
                  placeholder="e.g. Engine Hours"
                  className={inpSm + ' w-full'}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-0.5">Unit</label>
                <select value={r.unit} onChange={e => setReadingField(idx, 'unit', e.target.value)} className={inpSm + ' w-full'}>
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="col-span-2 flex items-center gap-2 pt-4">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                  <input type="checkbox" checked={r.mandatory}
                    onChange={e => setReadingField(idx, 'mandatory', e.target.checked)}
                    className="w-3.5 h-3.5 accent-blue-600"
                  />
                  Mandatory
                </label>
              </div>
              <div className="col-span-1 flex justify-end">
                <button onClick={() => removeReading(idx)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          <button onClick={addReading}
            className="flex items-center gap-2 px-3 py-2 border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors w-full justify-center">
            <Plus size={13} /> Add Reading
          </button>

          {cfg.reading_configs.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              No readings configured. Click "Add Reading" to define readings for this asset type.
            </p>
          )}
        </div>
      </Section>

      {/* Section 3 — Fuel Configuration */}
      <Section icon={Fuel} title="Fuel Configuration" color="amber">
        <div className="space-y-4">
          <Toggle
            checked={cfg.fuel_applicable}
            onChange={v => set('fuel_applicable', v)}
            label="Fuel Applicable"
            note="Disable for electric or non-fuel assets"
          />
          {cfg.fuel_applicable && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
              <div>
                <label className={lbl}>Fuel Type</label>
                <select value={cfg.fuel_type || ''} onChange={e => set('fuel_type', e.target.value)} className={inp}>
                  <option value="">— Not specified —</option>
                  {['Diesel', 'HS Diesel', 'Petrol', 'CNG', 'Electric', 'N/A'].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Fuel Tank Count</label>
                <select value={cfg.fuel_tank_count || 1} onChange={e => set('fuel_tank_count', parseInt(e.target.value))} className={inp}>
                  {[1, 2, 3].map(n => <option key={n} value={n}>{n} Tank{n > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Approved Consumption — Min (L/Hr)</label>
                <input type="number" step="0.01" min="0"
                  value={cfg.fuel_consumption_min ?? ''} onChange={e => set('fuel_consumption_min', e.target.value)}
                  placeholder="e.g. 2.00" className={inp} />
              </div>
              <div>
                <label className={lbl}>Approved Consumption — Max (L/Hr)</label>
                <input type="number" step="0.01" min="0"
                  value={cfg.fuel_consumption_max ?? ''} onChange={e => set('fuel_consumption_max', e.target.value)}
                  placeholder="e.g. 3.00" className={inp} />
              </div>
              <div>
                <label className={lbl}>Approved Economy — Min (KM/L)</label>
                <input type="number" step="0.01" min="0"
                  value={cfg.fuel_economy_min ?? ''} onChange={e => set('fuel_economy_min', e.target.value)}
                  placeholder="e.g. 1.00" className={inp} />
              </div>
              <div>
                <label className={lbl}>Approved Economy — Max (KM/L)</label>
                <input type="number" step="0.01" min="0"
                  value={cfg.fuel_economy_max ?? ''} onChange={e => set('fuel_economy_max', e.target.value)}
                  placeholder="e.g. 1.50" className={inp} />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Section 4 — Fuel Formula */}
      <Section icon={BarChart2} title="Fuel Formula" color="orange">
        <div className="space-y-2">
          {FORMULA_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 cursor-pointer select-none px-4 py-3 rounded-xl border transition-colors ${
                cfg.fuel_formula_type === opt.value ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input type="radio" name="fuel_formula" value={opt.value}
                checked={cfg.fuel_formula_type === opt.value}
                onChange={() => set('fuel_formula_type', opt.value)}
                className="accent-orange-500"
              />
              <span className="text-sm font-medium text-gray-800">{opt.label}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* Section 4b — Transit Mixer Advance Fuel Formula */}
      {cfg.fuel_formula_type === 'both' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

          {/* Approved Fuel Limit */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-teal-500 rounded-full flex-shrink-0" />
              <span className="text-sm font-bold text-gray-800">Approved Fuel Limit</span>
              <span
                title="Standard approved limits for this Transit Mixer's two engines"
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-xs cursor-default select-none leading-none"
              >i</span>
            </div>
            <div className="space-y-2.5 pl-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 flex-1">Approved Fuel Consumption</span>
                <input
                  type="number" step="0.001" min="0"
                  value={cfg.fuel_consumption_min ?? ''}
                  onChange={e => set('fuel_consumption_min', e.target.value)}
                  placeholder="e.g. 2.5"
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm font-semibold text-right focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                />
                <span className="text-xs text-gray-400 w-10">Ltr/Hr</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 flex-1">Approved Fuel Economy</span>
                <input
                  type="number" step="0.001" min="0"
                  value={cfg.fuel_economy_min ?? ''}
                  onChange={e => set('fuel_economy_min', e.target.value)}
                  placeholder="e.g. 1.5"
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm font-semibold text-right focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                />
                <span className="text-xs text-gray-400 w-10">Km/L</span>
              </div>
            </div>
          </div>

          {/* Advance Fuel Formula */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-teal-500 rounded-full flex-shrink-0" />
                <span className="text-sm font-bold text-gray-800">Advance Fuel Formula</span>
              </div>
              <button
                type="button"
                onClick={openTmPopup}
                className="px-5 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Apply
              </button>
            </div>

            {cfg.tm_split_mode ? (
              <div className="flex items-center gap-5 pl-3 flex-wrap">
                <span className="text-sm text-gray-700 whitespace-nowrap min-w-[180px]">
                  {cfg.tm_split_mode === 'drum_rate' ? 'Advance Fuel Economy' : 'Advance Fuel Consumption'}
                </span>
                <span className="text-gray-500 font-medium text-base">=</span>
                <div className="inline-flex flex-col items-center">
                  <span className="text-sm font-semibold text-gray-800 border-b-2 border-gray-600 pb-1 px-3 whitespace-nowrap text-center">
                    {cfg.tm_split_mode === 'drum_rate'
                      ? `Fuel Consumed − ( Running Hours × ${cfg.tm_split_value || '?'} Ltr/Hr )`
                      : `Fuel Consumed − ( Total KM ÷ ${cfg.tm_split_value || '?'} Km/L )`}
                  </span>
                  <span className="text-sm text-gray-600 pt-1 px-3 whitespace-nowrap text-center">
                    {cfg.tm_split_mode === 'drum_rate' ? 'Total KM' : 'Total Running Hours'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => { set('tm_split_mode', null); set('tm_split_value', '') }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-1"
                >
                  ✕ Remove
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic pl-3">
                Click "Apply" to configure the advance fuel split formula for this Transit Mixer.
              </p>
            )}
          </div>

          {/* Apply Formula Popup */}
          {showTmPopup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
                <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-200">
                  <div className="w-1 h-6 bg-teal-500 rounded-full flex-shrink-0" />
                  <h3 className="text-sm font-bold text-gray-800">Apply Advance Fuel Formula</h3>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto max-h-[72vh]">

                  {/* Option 1 — drum_rate */}
                  <div className={`rounded-xl border p-4 transition-colors ${
                    tmPopupMode === 'drum_rate' ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-white'
                  }`}>
                    <label className="flex items-center gap-3 cursor-pointer select-none mb-4">
                      <input type="radio" name="tmPopupMode" value="drum_rate"
                        checked={tmPopupMode === 'drum_rate'}
                        onChange={() => handleTmModeChange('drum_rate')}
                        className="w-4 h-4 accent-teal-500"
                      />
                      <span className="text-sm font-semibold text-gray-800">Constant Fuel Consumption for Drum Engine Hours (Ltr/Hr)</span>
                    </label>
                    <div className="ml-7 space-y-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Advance Fuel Economy =</span>
                        <span className="inline-flex flex-col items-center">
                          <span className="text-xs font-semibold text-gray-800 border-b-2 border-gray-600 pb-1.5 px-3 whitespace-nowrap text-center">
                            {'Fuel Consumed − ( Running Hours × '}
                            {tmPopupMode === 'drum_rate' ? (
                              <input
                                type="number" step="0.001" min="0"
                                value={tmPopupValue}
                                onChange={e => setTmPopupValue(e.target.value)}
                                placeholder="2.5"
                                className="inline w-14 border-2 border-teal-400 rounded px-1 py-0.5 text-xs text-center font-bold bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 mx-0.5"
                              />
                            ) : (
                              <span className="inline-block border border-gray-300 rounded px-2 py-0.5 bg-gray-50 text-gray-400 font-mono mx-0.5 text-xs">?</span>
                            )}
                            {' Constant Drum Fuel Consumption )'}
                          </span>
                          <span className="text-xs text-gray-600 pt-1.5 px-3 text-center">Total KM</span>
                        </span>
                      </div>
                      {tmPopupMode === 'drum_rate' && parseFloat(tmPopupValue) > 0 && (() => {
                        const r = parseFloat(tmPopupValue)
                        const dD = (30 * r).toFixed(2)
                        const vD = Math.max(0, 300 - 30 * r).toFixed(2)
                        const ec = parseFloat(vD) > 0 ? (100 / parseFloat(vD)).toFixed(2) : '—'
                        return (
                          <div className="text-xs text-gray-500 bg-white rounded-lg p-3 border border-teal-200 space-y-0.5">
                            <p className="font-semibold text-teal-700 mb-1">Preview — 30 Hrs · 100 KM · 300 Ltr consumed</p>
                            <p>Drum Engine Diesel = 30 × {r} = <strong>{dD} Ltr</strong></p>
                            <p>Front Vehicle Diesel = 300 − {dD} = <strong>{vD} Ltr</strong></p>
                            <p>Front Vehicle Fuel Economy = 100 ÷ {vD} = <strong>{ec} Km/L</strong></p>
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Option 2 — vehicle_rate */}
                  <div className={`rounded-xl border p-4 transition-colors ${
                    tmPopupMode === 'vehicle_rate' ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-white'
                  }`}>
                    <label className="flex items-center gap-3 cursor-pointer select-none mb-4">
                      <input type="radio" name="tmPopupMode" value="vehicle_rate"
                        checked={tmPopupMode === 'vehicle_rate'}
                        onChange={() => handleTmModeChange('vehicle_rate')}
                        className="w-4 h-4 accent-teal-500"
                      />
                      <span className="text-sm font-semibold text-gray-800">Constant Fuel Economy for Front Vehicle (Km/L)</span>
                    </label>
                    <div className="ml-7 space-y-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Advance Fuel Consumption =</span>
                        <span className="inline-flex flex-col items-center">
                          <span className="text-xs font-semibold text-gray-800 border-b-2 border-gray-600 pb-1.5 px-3 whitespace-nowrap text-center">
                            {'Fuel Consumed − ( Total KM ÷ '}
                            {tmPopupMode === 'vehicle_rate' ? (
                              <input
                                type="number" step="0.001" min="0"
                                value={tmPopupValue}
                                onChange={e => setTmPopupValue(e.target.value)}
                                placeholder="1.5"
                                className="inline w-14 border-2 border-teal-400 rounded px-1 py-0.5 text-xs text-center font-bold bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 mx-0.5"
                              />
                            ) : (
                              <span className="inline-block border border-gray-300 rounded px-2 py-0.5 bg-gray-50 text-gray-400 font-mono mx-0.5 text-xs">?</span>
                            )}
                            {' Constant Front Vehicle Fuel Economy )'}
                          </span>
                          <span className="text-xs text-gray-600 pt-1.5 px-3 text-center">Total Running Hours</span>
                        </span>
                      </div>
                      {tmPopupMode === 'vehicle_rate' && parseFloat(tmPopupValue) > 0 && (() => {
                        const e  = parseFloat(tmPopupValue)
                        const vD = (100 / e).toFixed(2)
                        const dD = Math.max(0, 300 - 100 / e).toFixed(2)
                        const rt = parseFloat(dD) > 0 ? (parseFloat(dD) / 30).toFixed(2) : '—'
                        return (
                          <div className="text-xs text-gray-500 bg-white rounded-lg p-3 border border-teal-200 space-y-0.5">
                            <p className="font-semibold text-teal-700 mb-1">Preview — 30 Hrs · 100 KM · 300 Ltr consumed</p>
                            <p>Front Vehicle Diesel = 100 ÷ {e} = <strong>{vD} Ltr</strong></p>
                            <p>Drum Engine Diesel = 300 − {vD} = <strong>{dD} Ltr</strong></p>
                            <p>Drum Fuel Consumption = {dD} ÷ 30 = <strong>{rt} Ltr/Hr</strong></p>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowTmPopup(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button type="button" onClick={applyTmFormula}
                    disabled={!tmPopupValue || parseFloat(tmPopupValue) <= 0}
                    className="px-5 py-2 text-sm font-semibold bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white rounded-lg transition-colors">
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 5 — Log Entry Validation Rules */}
      <Section icon={ShieldCheck} title="Log Entry Validation Rules" color="green">
        <div className="space-y-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantity</p>
            <Toggle checked={cfg.qty_mandatory_if_km}  onChange={v => set('qty_mandatory_if_km',  v)} label="Quantity Mandatory when Working KM is entered" />
            <Toggle checked={cfg.qty_mandatory_if_hrs} onChange={v => set('qty_mandatory_if_hrs', v)} label="Quantity Mandatory when Working Hours is entered" />
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Readings</p>
            <Toggle checked={cfg.closing_reading_mandatory} onChange={v => set('closing_reading_mandatory', v)}
              label="Closing Reading Mandatory when Opening is entered"
              note="Applies to all configured reading types" />
            <Toggle checked={cfg.allow_negative_reading} onChange={v => set('allow_negative_reading', v)}
              label="Allow Negative Reading"
              note="Only enable if meters can roll back (e.g. counter resets)" />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <label className={lbl}>Maximum Daily Reading Limit</label>
            <input type="number" step="0.1" min="0"
              value={cfg.max_daily_reading ?? ''}
              onChange={e => set('max_daily_reading', e.target.value)}
              placeholder="e.g. 24 (hrs) or 500 (km)"
              className={inp + ' max-w-xs'}
            />
            <p className="text-xs text-gray-400 mt-1">Leave blank to disable this limit.</p>
          </div>
        </div>
      </Section>

      {/* Section 6 — Counter Log Settings */}
      <Section icon={RotateCcw} title="Counter Log Settings" color="purple">
        <div className="space-y-4">
          <Toggle checked={cfg.counter_reset_allowed} onChange={v => set('counter_reset_allowed', v)}
            label="Counter Reset Allowed for this Asset Type" />
          {cfg.counter_reset_allowed && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Readings eligible for reset
              </p>
              {cfg.reading_configs.length === 0 && readingTypes.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Configure readings first in Section 2.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {(cfg.reading_configs.length > 0 ? cfg.reading_configs : readingTypes).map(r => {
                    const code = r.code
                    const name = r.name || readingTypes.find(t => t.code === code)?.name || code
                    if (!code) return null
                    return (
                      <label key={code} className="flex items-center gap-2.5 cursor-pointer select-none bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors">
                        <input type="checkbox"
                          checked={(cfg.reset_reading_codes || []).includes(code)}
                          onChange={() => toggleResetCode(code)}
                          className="w-4 h-4 accent-purple-600"
                        />
                        <span className="text-sm text-gray-700">{name}</span>
                        <span className="ml-auto text-xs text-gray-400">{r.unit}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Section 7 — DPR Settings */}
      <Section icon={ClipboardList} title="DPR Settings" color="teal">
        <div className="space-y-4">
          <div>
            <label className={lbl}>Default Shift Type</label>
            <div className="flex gap-2">
              {SHIFT_OPTIONS.map(s => (
                <button key={s} type="button" onClick={() => set('shift_type', s)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    cfg.shift_type === s ? 'bg-teal-600 border-teal-600 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <Toggle checked={cfg.fuel_entry_enabled}      onChange={v => set('fuel_entry_enabled', v)}      label="Fuel Entry Enabled"      note="Allow HSD (fuel) entries in DPR" />
            <Toggle checked={cfg.breakdown_entry_enabled} onChange={v => set('breakdown_entry_enabled', v)} label="Breakdown Entry Enabled"  note="Allow breakdown hours in DPR" />
            <Toggle checked={cfg.work_done_mandatory}     onChange={v => set('work_done_mandatory', v)}     label="Work Done Description Mandatory" />
            <Toggle checked={cfg.mandatory_operator}      onChange={v => set('mandatory_operator', v)}      label="Operator Assignment Mandatory" />
          </div>
        </div>
      </Section>

      {/* Section 8 — Maintenance Configuration */}
      <Section icon={Wrench} title="Maintenance Configuration" color="indigo">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Service Interval (Hours)</label>
            <input type="number" min="0" step="1"
              value={cfg.service_interval_hrs ?? ''}
              onChange={e => set('service_interval_hrs', e.target.value)}
              placeholder="e.g. 250"
              className={inp}
            />
          </div>
          <div>
            <label className={lbl}>Lubrication Interval (Hours)</label>
            <input type="number" min="0" step="1"
              value={cfg.lubrication_interval_hrs ?? ''}
              onChange={e => set('lubrication_interval_hrs', e.target.value)}
              placeholder="e.g. 125"
              className={inp}
            />
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <Toggle checked={cfg.preventive_maintenance} onChange={v => set('preventive_maintenance', v)} label="Preventive Maintenance Enabled" />
          <Toggle checked={cfg.breakdown_maintenance}  onChange={v => set('breakdown_maintenance',  v)} label="Breakdown Maintenance Enabled" />
        </div>
      </Section>

      {/* Section 9 — Alert Settings */}
      <Section icon={Bell} title="Alert Settings" color="rose">
        <div className="grid grid-cols-2 gap-3">
          <Toggle checked={cfg.low_fuel_alert}           onChange={v => set('low_fuel_alert',           v)} label="Low Fuel Alert"           />
          <Toggle checked={cfg.service_due_alert}        onChange={v => set('service_due_alert',        v)} label="Service Due Alert"        />
          <Toggle checked={cfg.calibration_due_alert}    onChange={v => set('calibration_due_alert',    v)} label="Calibration Due Alert"    />
          <Toggle checked={cfg.counter_exception_alert}  onChange={v => set('counter_exception_alert',  v)} label="Counter Exception Alert"  />
        </div>
      </Section>

      {/* Section 10 — Approval Settings */}
      <Section icon={Lock} title="Approval Settings" color="cyan">
        <div className="space-y-3">
          <Toggle checked={cfg.entry_approval}      onChange={v => set('entry_approval',      v)} label="Entry Approval Required"     note="DPR entries need admin approval" />
          <Toggle checked={cfg.supervisor_approval} onChange={v => set('supervisor_approval', v)} label="Supervisor Approval Required" />
          <Toggle checked={cfg.lock_after_approval} onChange={v => set('lock_after_approval', v)} label="Lock Entry After Approval"    note="Prevent editing after approval" />
        </div>
      </Section>

      {/* Section 11 — Report Settings */}
      <Section icon={FileText} title="Report Settings" color="rose">
        <p className="text-xs text-gray-500 mb-4">Select which fields appear in the DPR download (Excel / PDF).</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'report_show_fuel_cost',       label: 'Show Fuel Cost'        },
            { key: 'report_show_fuel_rate',        label: 'Show Fuel Rate'        },
            { key: 'report_show_quantity',         label: 'Show Quantity'         },
            { key: 'report_show_reading_details',  label: 'Show Reading Details'  },
            { key: 'report_show_work_done',        label: 'Show Work Done'        },
          ].map(({ key, label }) => (
            <Toggle key={key} checked={cfg[key]} onChange={v => set(key, v)} label={label} />
          ))}
        </div>
      </Section>

      {/* Save footer */}
      <div className="sticky bottom-0 z-10 bg-white border-t border-gray-200 -mx-6 px-6 py-3 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          Saving will apply <strong>Fuel Type</strong>, <strong>Shift Type</strong>, and <strong>Fuel Ranges</strong> to all{' '}
          <strong>{machines.length} active {eqType?.name || ''} machine{machines.length !== 1 ? 's' : ''}</strong>.
        </p>
        <div className="flex items-center gap-3 flex-shrink-0">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle2 size={14} /> Saved & applied
            </span>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  )
}
