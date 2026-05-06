import { useState, useEffect } from 'react'
import { getProjects, getMachines, createMachine, updateMachine, deleteMachine, getEquipmentTypes } from '../../lib/api'
import { Plus, Edit2, Trash2, X } from 'lucide-react'

const SHIFT_OPTIONS = ['Single Shift', 'Dual Shift']

const blank = {
  project_id: '', slno: '', eq_type: '', capacity: '', reg_no: '',
  ownership: 'Own', vendor: '', rate: '', reading1_basis: 'Hours',
  reading2_basis: '', dual_reading: false, fuel_min: '', fuel_max: '',
  planned_hours: '10', shift_type: ''
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export default function Machines() {
  const [projects, setProjects]     = useState([])
  const [eqTypes, setEqTypes]       = useState([])
  const [machines, setMachines]     = useState([])
  const [filterProj, setFilterProj] = useState('')
  const [modal, setModal]           = useState(null)
  const [form, setForm]             = useState(blank)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const load = () => {
    getMachines(filterProj ? { project_code: filterProj } : {})
      .then(r => setMachines(r.data.data))
  }

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data))
    getEquipmentTypes().then(r => setEqTypes(r.data.data))
  }, [])

  useEffect(() => { load() }, [filterProj])

  const openAdd = () => {
    setForm({ ...blank, project_id: projects.find(p => p.code === filterProj)?.id?.toString() || '' })
    setError(''); setModal('add')
  }

  const openEdit = (m) => {
    setForm({
      project_id: String(m.project_id), slno: m.slno, eq_type: m.eq_type,
      capacity: m.capacity || '', reg_no: m.reg_no || '',
      ownership: m.ownership, vendor: m.vendor || '', rate: m.rate || '',
      reading1_basis: m.reading1_basis, reading2_basis: m.reading2_basis || '',
      dual_reading: m.dual_reading, fuel_min: m.fuel_min || '', fuel_max: m.fuel_max || '',
      planned_hours: String(m.planned_hours || 10),
      shift_type: m.shift_type || 'Single Shift'
    })
    setError(''); setModal({ edit: m })
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = async () => {
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        project_id:    parseInt(form.project_id),
        rate:          form.rate || null,
        fuel_min:      form.fuel_min || null,
        fuel_max:      form.fuel_max || null,
        capacity:      form.capacity || null,
        vendor:        form.vendor || null,
        reg_no:        form.reg_no || null,
        reading2_basis:form.reading2_basis || null,
        planned_hours: parseFloat(form.planned_hours) || 10,
        shift_type:    form.shift_type
      }
      modal === 'add' ? await createMachine(payload) : await updateMachine(modal.edit.id, payload)
      setModal(null); load()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('Deactivate this machine?')) return
    await deleteMachine(id); load()
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">Machine Registry</h1>
        <button onClick={openAdd} className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors">
          <Plus size={15} />Add Machine
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <select value={filterProj} onChange={e => setFilterProj(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Project','SL#','Type','Reg#','Own/Hire','Shift','Basis','Fuel Min','Fuel Max','Planned Hrs',''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {machines.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-400">No machines found</td></tr>
              )}
              {machines.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2"><span className="bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded text-xs">{m.project_code}</span></td>
                  <td className="px-3 py-2 font-semibold">{m.slno}</td>
                  <td className="px-3 py-2">{m.eq_type}</td>
                  <td className="px-3 py-2">{m.reg_no || '—'}</td>
                  <td className="px-3 py-2"><span className={`text-xs font-medium ${m.ownership === 'Own' ? 'text-blue-600' : 'text-violet-600'}`}>{m.ownership}</span></td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      m.shift_type === 'Dual Shift' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                    }`}>{m.shift_type || 'Single Shift'}</span>
                  </td>
                  <td className="px-3 py-2">{m.reading1_basis}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.fuel_min ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.fuel_max ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.planned_hours}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(m)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 size={13} /></button>
                      <button onClick={() => del(m.id)}   className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add Machine' : 'Edit Machine'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Project *</label>
                <select value={form.project_id} onChange={set('project_id')} className={inp} required>
                  <option value="">— select —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>SL# *</label>
                <input type="text" value={form.slno} onChange={set('slno')} className={inp} placeholder="e.g. E6-EX-02" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Equipment Type *</label>
                <select value={form.eq_type} onChange={set('eq_type')} className={inp} required>
                  <option value="">— select —</option>
                  {eqTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Capacity</label>
                <input type="text" value={form.capacity} onChange={set('capacity')} className={inp} placeholder="e.g. 20T" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Reg No</label>
                <input type="text" value={form.reg_no} onChange={set('reg_no')} className={inp} />
              </div>
              <div>
                <label className={lbl}>Ownership</label>
                <select value={form.ownership} onChange={set('ownership')} className={inp}>
                  <option>Own</option><option>Hire</option>
                </select>
              </div>
            </div>

            <div>
              <label className={lbl}>Shift Type <span className="text-red-500">*</span></label>
              <select value={form.shift_type} onChange={set('shift_type')} className={inp} required>
                <option value="">— select shift —</option>
                {SHIFT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Single Shift: operator selects Day or Night each entry. Dual Shift: both Day and Night readings captured together.</p>
            </div>

            {form.ownership === 'Hire' && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Vendor</label><input type="text" value={form.vendor} onChange={set('vendor')} className={inp} /></div>
                <div><label className={lbl}>Rate (₹/day)</label><input type="number" value={form.rate} onChange={set('rate')} className={inp} /></div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Reading 1 Basis</label>
                <select value={form.reading1_basis} onChange={set('reading1_basis')} className={inp}>
                  <option>Hours</option><option>KM</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="dual" checked={form.dual_reading} onChange={set('dual_reading')} className="rounded border-gray-300" />
                <label htmlFor="dual" className="text-sm text-gray-700 select-none">Dual Reading</label>
              </div>
            </div>

            {form.dual_reading && (
              <div>
                <label className={lbl}>Reading 2 Basis</label>
                <select value={form.reading2_basis} onChange={set('reading2_basis')} className={inp}>
                  <option value="">— select —</option><option>Hours</option><option>KM</option>
                </select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div><label className={lbl}>Fuel Min (L/hr)</label><input type="number" step="0.1" value={form.fuel_min} onChange={set('fuel_min')} className={inp} /></div>
              <div><label className={lbl}>Fuel Max (L/hr)</label><input type="number" step="0.1" value={form.fuel_max} onChange={set('fuel_max')} className={inp} /></div>
              <div><label className={lbl}>Planned Hrs/Day</label><input type="number" step="0.5" value={form.planned_hours} onChange={set('planned_hours')} className={inp} /></div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setModal(null)} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
