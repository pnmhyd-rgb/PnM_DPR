import { useState, useEffect } from 'react'
import { getProjects, getMachines, getFuelEntries, createFuelEntry, deleteFuelEntry } from '../lib/api'
import { today, formatNum, exportCSV } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { Plus, Trash2, Download, X } from 'lucide-react'

const FUEL_TYPES = ['Diesel', 'Petrol', 'CNG']

const emptyForm = () => ({
  project_id: '', machine_id: '', entry_date: today(),
  fuel_type: 'Diesel', qty: '', rate: '', operator_name: '', remarks: ''
})

export default function FuelEntries() {
  const { isAdmin } = useAuth()
  const [projects, setProjects]   = useState([])
  const [machines, setMachines]   = useState([])
  const [entries, setEntries]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [filters, setFilters]     = useState({ project_code: '', from: today(), to: today() })
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data))
  }, [])

  useEffect(() => {
    if (form.project_id) {
      getMachines({ project_id: form.project_id }).then(r => setMachines(r.data.data))
    } else {
      setMachines([])
    }
  }, [form.project_id])

  const loadEntries = () => {
    setLoading(true)
    const p = {}
    if (filters.project_code) p.project_code = filters.project_code
    if (filters.from) p.from = filters.from
    if (filters.to)   p.to   = filters.to
    getFuelEntries(p).then(r => setEntries(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { loadEntries() }, [filters])

  const setF  = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))
  const setFm = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const totalQty = entries.reduce((s, e) => s + (parseFloat(e.qty) || 0), 0)
  const totalAmt = entries.reduce((s, e) => s + (parseFloat(e.total) || 0), 0)

  const openModal = () => { setForm(emptyForm()); setError(''); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setError('') }

  const handleSave = async () => {
    if (!form.project_id || !form.entry_date || !form.qty) {
      setError('Project, date, and quantity are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await createFuelEntry(form)
      closeModal()
      loadEntries()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this fuel entry?')) return
    await deleteFuelEntry(id)
    loadEntries()
  }

  const handleExport = () => {
    exportCSV(
      ['Date', 'Project', 'Machine SL#', 'Eq Type', 'Fuel Type', 'Qty (L)', 'Rate (₹)', 'Total (₹)', 'Operator', 'Remarks'],
      entries.map(e => [
        e.entry_date, e.project_code, e.slno ?? '', e.eq_type ?? '',
        e.fuel_type, e.qty, e.rate ?? '', e.total ?? '',
        e.operator_name ?? '', e.remarks ?? ''
      ]),
      `Fuel_Entries_${filters.from}_${filters.to}.csv`
    )
  }

  const computedTotal = form.qty && form.rate
    ? (parseFloat(form.qty) * parseFloat(form.rate)).toFixed(2)
    : ''

  const sel = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fuel Issue Entries</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {entries.length} entries · {totalQty.toFixed(0)} L
            {totalAmt > 0 ? ` · ₹${formatNum(totalAmt.toFixed(0))}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors">
            <Download size={15} />Export
          </button>
          <button onClick={openModal} className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors">
            <Plus size={15} />New Entry
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <select value={filters.project_code} onChange={setF('project_code')} className={sel}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
          </select>
          <input type="date" value={filters.from} onChange={setF('from')} className={sel} />
          <input type="date" value={filters.to}   onChange={setF('to')}   className={sel} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-4xl mb-3">⛽</div>
            <p className="text-sm">No fuel entries found. Click "+ New Entry" to add one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Date','Project','Machine SL#','Eq Type','Fuel Type','Qty (L)','Rate (₹)','Total (₹)','Operator','Remarks',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{e.entry_date}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">{e.project_code}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{e.slno ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{e.eq_type ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="bg-orange-100 text-orange-800 text-xs font-semibold px-2 py-0.5 rounded">{e.fuel_type}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold">{e.qty}</td>
                    <td className="px-4 py-3 text-gray-600">{e.rate ?? '—'}</td>
                    <td className="px-4 py-3 font-medium">{e.total ? `₹${formatNum(parseFloat(e.total).toFixed(0))}` : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{e.operator_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate">{e.remarks ?? '—'}</td>
                    <td className="px-4 py-3">
                      {isAdmin && (
                        <button onClick={() => handleDelete(e.id)} className="text-red-500 hover:text-red-700 p-1 rounded">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-xs text-gray-500">{entries.length} records</td>
                  <td className="px-4 py-2 text-xs font-bold text-gray-700">{totalQty.toFixed(0)} L</td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 text-xs font-bold text-gray-700">
                    {totalAmt > 0 ? `₹${formatNum(totalAmt.toFixed(0))}` : '—'}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mt-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">New Fuel Issue Entry</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date *</label>
                  <input type="date" value={form.entry_date} onChange={setFm('entry_date')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Project *</label>
                  <select value={form.project_id} onChange={setFm('project_id')} className={inp}>
                    <option value="">Select project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Machine</label>
                  <select value={form.machine_id} onChange={setFm('machine_id')} className={inp}>
                    <option value="">Select machine</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.slno} – {m.eq_type}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fuel Type</label>
                  <select value={form.fuel_type} onChange={setFm('fuel_type')} className={inp}>
                    {FUEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantity (L) *</label>
                  <input type="number" min="0" step="0.5" placeholder="e.g. 50" value={form.qty} onChange={setFm('qty')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rate per Litre (₹)</label>
                  <input type="number" min="0" step="0.5" placeholder="e.g. 92" value={form.rate} onChange={setFm('rate')} className={inp} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Amount (₹)</label>
                  <input readOnly value={computedTotal ? `₹ ${computedTotal}` : ''} placeholder="Auto calculated" className={`${inp} bg-gray-50 text-gray-500`} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Operator Name</label>
                  <input type="text" placeholder="e.g. Ramu S." value={form.operator_name} onChange={setFm('operator_name')} className={inp} />
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Remarks</label>
                  <textarea rows={2} placeholder="Any notes…" value={form.remarks} onChange={setFm('remarks')} className={`${inp} resize-none`} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button onClick={closeModal} className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
