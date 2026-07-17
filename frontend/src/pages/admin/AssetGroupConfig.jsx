import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Save, Loader2, Plus, Trash2, CheckCircle2,
  Settings, BookOpen, Fuel, ShieldCheck, RotateCcw,
  ClipboardList, BarChart2, FileText, AlertCircle,
} from 'lucide-react'
import { getAssetGroupConfig, saveAssetGroupConfig } from '../../lib/api'

/* ── helpers ── */
const lbl  = 'block text-xs font-medium text-gray-600 mb-1'
const inp  = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full'
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

const UNIT_OPTIONS = ['Hrs', 'Km', 'Ltr', 'Units']
const SHIFT_OPTIONS = ['Single Shift', 'Dual Shift']
const FORMULA_OPTIONS = [
  { value: 'L_per_Hr',       label: 'Fuel Consumption — Fuel ÷ Hours (L/Hr)'            },
  { value: 'KM_per_L',       label: 'Fuel Economy — KM ÷ Fuel (KM/L)'                  },
  { value: 'both',           label: 'Both — L/Hr + KM/L'                               },
  { value: 'transit_mixer',  label: 'Transit Mixer — Both L/Hr + KM/L (Split Formula)' },
]

function defaultConfig() {
  return {
    reading_configs: [],
    fuel_type: '',
    fuel_tank_count: 1,
    fuel_consumption_min: '',
    fuel_consumption_max: '',
    fuel_economy_min: '',
    fuel_economy_max: '',
    fuel_formula_type: 'L_per_Hr',
    qty_mandatory_if_km: false,
    qty_mandatory_if_hrs: false,
    closing_reading_mandatory: true,
    allow_negative_reading: false,
    counter_reset_allowed: true,
    reset_reading_codes: [],
    shift_type: 'Single Shift',
    fuel_entry_enabled: true,
    breakdown_entry_enabled: true,
    work_done_mandatory: false,
    report_show_fuel_cost: true,
    report_show_fuel_rate: true,
    report_show_quantity: true,
    report_show_reading_details: true,
    report_show_work_done: true,
    report_show_productivity_costing: true,
    mandatory_operator: false,
  }
}

export default function AssetGroupConfig() {
  const { group: groupParam } = useParams()
  const group    = decodeURIComponent(groupParam)
  const navigate = useNavigate()

  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [saved,       setSaved]       = useState(false)
  const [cfg,         setCfg]         = useState(defaultConfig)
  const [assetTypes,  setAssetTypes]  = useState([])
  const [machines,    setMachines]    = useState([])
  const [readingTypes,setReadingTypes]= useState([])

  useEffect(() => {
    setLoading(true)
    getAssetGroupConfig(group)
      .then(r => {
        const d = r.data.data
        if (d.config) {
          setCfg({
            ...defaultConfig(),
            ...d.config,
            reading_configs:   d.config.reading_configs   || [],
            reset_reading_codes: d.config.reset_reading_codes || [],
          })
        }
        setAssetTypes(d.assetTypes  || [])
        setMachines(d.machines      || [])
        setReadingTypes(d.readingTypes || [])
      })
      .catch(e => setError(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [group])

  const set = (key, val) => setCfg(c => ({ ...c, [key]: val }))

  /* ── Reading Configs ── */
  const addReading = () => {
    setCfg(c => ({
      ...c,
      reading_configs: [
        ...c.reading_configs,
        { code: '', name: '', unit: 'Hrs', mandatory: true, sort_order: c.reading_configs.length + 1 },
      ],
    }))
  }
  const setReadingField = (idx, key, val) => {
    setCfg(c => ({
      ...c,
      reading_configs: c.reading_configs.map((r, i) => i === idx ? { ...r, [key]: val } : r),
    }))
  }
  const removeReading = (idx) => {
    setCfg(c => ({
      ...c,
      reading_configs: c.reading_configs.filter((_, i) => i !== idx),
    }))
  }

  /* ── Reset codes ── */
  const toggleResetCode = (code) => {
    setCfg(c => {
      const codes = c.reset_reading_codes || []
      return {
        ...c,
        reset_reading_codes: codes.includes(code)
          ? codes.filter(x => x !== code)
          : [...codes, code],
      }
    })
  }

  /* ── Save ── */
  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      await saveAssetGroupConfig(group, cfg)
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

  const assetCats = [...new Set(assetTypes.map(t => t.asset_cat).filter(Boolean))]
  const byCategory = (cat) => assetTypes.filter(t => t.asset_cat === cat)

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
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
            Asset Matrix → Asset Category → Group Configuration
          </p>
          <h1 className="text-xl font-bold text-gray-900">{group}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {assetTypes.length} asset type{assetTypes.length !== 1 ? 's' : ''} ·{' '}
            {machines.length} active machine{machines.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle2 size={14} /> Saved & applied to machines
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

      {/* Section 1 — Asset Details */}
      <Section icon={BookOpen} title="Asset Details" color="slate">
        {assetTypes.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No asset types found for this group.</p>
        ) : (
          <div className="space-y-4">
            {assetCats.map(cat => (
              <div key={cat}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{cat}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {byCategory(cat).map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-1.5">
                      <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                      <span className="font-medium">{t.name}</span>
                      <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        t.asset_category === 'Measurable'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>{t.asset_category || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {machines.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Machines in this Group ({machines.length})
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1.5 px-2 text-gray-500 font-semibold">Asset Name</th>
                    <th className="text-left py-1.5 px-2 text-gray-500 font-semibold">Asset Code</th>
                    <th className="text-left py-1.5 px-2 text-gray-500 font-semibold">Fuel Type</th>
                    <th className="text-left py-1.5 px-2 text-gray-500 font-semibold">Shift</th>
                    <th className="text-left py-1.5 px-2 text-gray-500 font-semibold">Ownership</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {machines.map(m => (
                    <tr key={m.id} className="text-gray-700">
                      <td className="py-1.5 px-2 font-medium">{m.eq_type}</td>
                      <td className="py-1.5 px-2 font-mono text-gray-500">{m.asset_code || m.slno || '—'}</td>
                      <td className="py-1.5 px-2 text-gray-500">{m.fuel_type || '—'}</td>
                      <td className="py-1.5 px-2 text-gray-500">{m.shift_type || '—'}</td>
                      <td className="py-1.5 px-2">
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                          m.ownership === 'Own'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'
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
                    if (rt) {
                      setReadingField(idx, 'name', rt.name)
                      setReadingField(idx, 'unit', rt.unit)
                    }
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
                  type="text"
                  value={r.name}
                  onChange={e => setReadingField(idx, 'name', e.target.value)}
                  placeholder="e.g. Engine Hours"
                  className={inpSm + ' w-full'}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-0.5">Unit</label>
                <select
                  value={r.unit}
                  onChange={e => setReadingField(idx, 'unit', e.target.value)}
                  className={inpSm + ' w-full'}
                >
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="col-span-2 flex items-center gap-2 pt-4">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={r.mandatory}
                    onChange={e => setReadingField(idx, 'mandatory', e.target.checked)}
                    className="w-3.5 h-3.5 accent-blue-600"
                  />
                  Mandatory
                </label>
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  onClick={() => removeReading(idx)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addReading}
            className="flex items-center gap-2 px-3 py-2 border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors w-full justify-center"
          >
            <Plus size={13} /> Add Reading
          </button>

          {cfg.reading_configs.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              No readings configured. Click "Add Reading" to define readings for this asset group.
            </p>
          )}
        </div>
      </Section>

      {/* Section 3 — Fuel Configuration */}
      <Section icon={Fuel} title="Fuel Configuration" color="amber">
        <div className="grid grid-cols-2 gap-4">
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
            <input
              type="number" step="0.01" min="0"
              value={cfg.fuel_consumption_min ?? ''}
              onChange={e => set('fuel_consumption_min', e.target.value)}
              placeholder="e.g. 2.00"
              className={inp}
            />
          </div>
          <div>
            <label className={lbl}>Approved Consumption — Max (L/Hr)</label>
            <input
              type="number" step="0.01" min="0"
              value={cfg.fuel_consumption_max ?? ''}
              onChange={e => set('fuel_consumption_max', e.target.value)}
              placeholder="e.g. 3.00"
              className={inp}
            />
          </div>
          <div>
            <label className={lbl}>Approved Economy — Min (KM/L)</label>
            <input
              type="number" step="0.01" min="0"
              value={cfg.fuel_economy_min ?? ''}
              onChange={e => set('fuel_economy_min', e.target.value)}
              placeholder="e.g. 1.00"
              className={inp}
            />
          </div>
          <div>
            <label className={lbl}>Approved Economy — Max (KM/L)</label>
            <input
              type="number" step="0.01" min="0"
              value={cfg.fuel_economy_max ?? ''}
              onChange={e => set('fuel_economy_max', e.target.value)}
              placeholder="e.g. 1.50"
              className={inp}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Consumption and economy ranges will be applied to all machines in this group and used in DPR download reports.
        </p>
      </Section>

      {/* Section 4 — Log Entry Validation Rules */}
      <Section icon={ShieldCheck} title="Log Entry Validation Rules" color="green">
        <div className="space-y-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantity</p>
            <Toggle
              checked={cfg.qty_mandatory_if_km}
              onChange={v => set('qty_mandatory_if_km', v)}
              label="Quantity Mandatory when Working KM is entered"
            />
            <Toggle
              checked={cfg.qty_mandatory_if_hrs}
              onChange={v => set('qty_mandatory_if_hrs', v)}
              label="Quantity Mandatory when Working Hours is entered"
            />
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Readings</p>
            <Toggle
              checked={cfg.closing_reading_mandatory}
              onChange={v => set('closing_reading_mandatory', v)}
              label="Closing Reading Mandatory when Opening is entered"
              note="Applies to all configured reading types"
            />
            <Toggle
              checked={cfg.allow_negative_reading}
              onChange={v => set('allow_negative_reading', v)}
              label="Allow Negative Reading (total < 0)"
              note="Only enable if meters can roll back (e.g. counter resets)"
            />
          </div>
        </div>
      </Section>

      {/* Section 5 — Counter Log Settings */}
      <Section icon={RotateCcw} title="Counter Log Settings" color="purple">
        <div className="space-y-4">
          <Toggle
            checked={cfg.counter_reset_allowed}
            onChange={v => set('counter_reset_allowed', v)}
            label="Counter Reset Allowed for this Asset Group"
          />
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
                    const name = r.name || (readingTypes.find(t => t.code === code)?.name) || code
                    if (!code) return null
                    return (
                      <label key={code} className="flex items-center gap-2.5 cursor-pointer select-none bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors">
                        <input
                          type="checkbox"
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

      {/* Section 6 — DPR Settings */}
      <Section icon={ClipboardList} title="DPR Settings" color="teal">
        <div className="space-y-4">
          <div>
            <label className={lbl}>Default Shift Type</label>
            <div className="flex gap-2">
              {SHIFT_OPTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('shift_type', s)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    cfg.shift_type === s
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <Toggle
              checked={cfg.fuel_entry_enabled}
              onChange={v => set('fuel_entry_enabled', v)}
              label="Fuel Entry Enabled"
              note="Allow HSD (fuel) entries in DPR"
            />
            <Toggle
              checked={cfg.breakdown_entry_enabled}
              onChange={v => set('breakdown_entry_enabled', v)}
              label="Breakdown Entry Enabled"
              note="Allow breakdown hours in DPR"
            />
            <Toggle
              checked={cfg.work_done_mandatory}
              onChange={v => set('work_done_mandatory', v)}
              label="Work Done Description Mandatory"
            />
            <Toggle
              checked={cfg.mandatory_operator}
              onChange={v => set('mandatory_operator', v)}
              label="Operator Selection Mandatory"
              note="When enabled, DPR cannot be saved without selecting an operator"
            />
          </div>
        </div>
      </Section>

      {/* Section 7 — Fuel Formula */}
      <Section icon={BarChart2} title="Fuel Formula" color="orange">
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Select how fuel performance is calculated and displayed in the DPR log and reports.
          </p>
          <div className="space-y-2">
            {FORMULA_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 cursor-pointer select-none px-4 py-3 rounded-xl border transition-colors ${
                  cfg.fuel_formula_type === opt.value
                    ? 'border-orange-400 bg-orange-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="fuel_formula"
                  value={opt.value}
                  checked={cfg.fuel_formula_type === opt.value}
                  onChange={() => set('fuel_formula_type', opt.value)}
                  className="accent-orange-500"
                />
                <span className="text-sm font-medium text-gray-800">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </Section>

      {/* Section 8 — Report Settings */}
      <Section icon={FileText} title="Report Settings" color="rose">
        <p className="text-xs text-gray-500 mb-4">
          Select which fields and sections appear in the DPR download (Excel / PDF).
        </p>
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
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Productivity Sections</p>
          <Toggle
            checked={cfg.report_show_productivity_costing}
            onChange={v => set('report_show_productivity_costing', v)}
            label="Enable Productivity Costing &amp; Fuel vs Productivity"
          />
        </div>
      </Section>

      {/* Save footer */}
      <div className="sticky bottom-0 z-10 bg-white border-t border-gray-200 -mx-6 px-6 py-3 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          Saving will apply <strong>Fuel Type</strong>, <strong>Shift Type</strong>, and <strong>Fuel Ranges</strong> to all active machines in this group.
        </p>
        <div className="flex items-center gap-3 flex-shrink-0">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle2 size={14} /> Saved
            </span>
          )}
          {error && (
            <span className="text-xs text-red-600">{error}</span>
          )}
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
