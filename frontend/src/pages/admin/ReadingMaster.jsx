import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, Check, Gauge, AlertTriangle, FileSpreadsheet, FileText } from 'lucide-react'
import { getReadingTypes, createReadingType, updateReadingType, deleteReadingType } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

const UNITS = ['Hrs', 'Km', 'Rpm', 'Bar', 'L', 'Ton', 'Cycle']
const blank = { code: '', name: '', unit: 'Hrs', input_type: 'Number', decimal_allowed: true }

/* ── Export helpers ───────────────────────────────────────────────────────── */
const COLS = [
  { header: 'Sl No',        val: (t, i) => i + 1 },
  { header: 'Code',         val: t => t.code },
  { header: 'Name',         val: t => t.name },
  { header: 'Unit',         val: t => t.unit },
  { header: 'Decimal',      val: t => t.decimal_allowed ? 'Yes' : 'No' },
  { header: 'Eq. Types',    val: t => parseInt(t.mapping_count) || 0 },
  { header: 'Machines',     val: t => parseInt(t.machine_count) || 0 },
]

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function fileTs() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

async function exportExcel(rows) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()
  const ws   = XLSX.utils.aoa_to_sheet([
    ['Reading Master'],
    [`Generated: ${new Date().toLocaleString('en-IN')}`],
    [],
    COLS.map(c => c.header),
    ...rows.map((t, i) => COLS.map(c => c.val(t, i))),
  ])
  ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }]
  COLS.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: 3, c: ci })
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'DCDCDC' } } }
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Reading Master')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  triggerDownload(new Blob([buf], { type: 'application/octet-stream' }), `ReadingMaster_${fileTs()}.xlsx`)
}

async function exportPDF(rows) {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('Reading Master', 14, 12)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
  doc.text(`${rows.length} reading types  |  Generated: ${new Date().toLocaleString('en-IN')}`, 14, 19)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 24,
    head: [COLS.map(c => c.header)],
    body: rows.map((t, i) => COLS.map(c => String(c.val(t, i)))),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [248, 248, 248], textColor: 0, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 26 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' },
      6: { cellWidth: 22, halign: 'center' },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: d => {
      doc.setFontSize(7); doc.setTextColor(150)
      doc.text(`Page ${d.pageNumber}`, doc.internal.pageSize.getWidth() - 20, doc.internal.pageSize.getHeight() - 6)
    },
  })
  triggerDownload(doc.output('blob'), `ReadingMaster_${fileTs()}.pdf`)
}

export default function ReadingMaster() {
  const { isAdmin } = useAuth()
  const [types,   setTypes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [form,    setForm]    = useState(blank)
  const [editing, setEditing] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // reading type to confirm-delete
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setTypes((await getReadingTypes()).data.data) } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openAdd  = () => { setForm(blank); setEditing(null); setError(''); setShowForm(true) }
  const openEdit = (t) => {
    setForm({ code: t.code, name: t.name, unit: t.unit, input_type: t.input_type, decimal_allowed: t.decimal_allowed })
    setEditing(t.id); setError(''); setShowForm(true)
  }
  const cancel = () => { setShowForm(false); setError('') }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) { setError('Code and Name are required'); return }
    setSaving(true); setError('')
    try {
      if (editing) await updateReadingType(editing, { name: form.name, unit: form.unit, input_type: form.input_type, decimal_allowed: form.decimal_allowed })
      else         await createReadingType(form)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const force = deleteTarget.mapping_count > 0 || deleteTarget.machine_count > 0
    setDeleting(true)
    try { await deleteReadingType(deleteTarget.id, force); setDeleteTarget(null); await load() }
    catch (err) { alert(err.response?.data?.error || 'Delete failed') }
    finally { setDeleting(false) }
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Gauge size={20} className="text-blue-600" /> Reading Master
          </h1>
          <p className="text-sm text-gray-500 mt-1">Define reading types used by equipment (Hours, KM, RPM, etc.)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportExcel(types).catch(e => alert('Excel download failed: ' + e.message))} title="Download Excel"
            className="flex items-center gap-1.5 border border-green-600 text-green-700 hover:bg-green-50 text-sm font-semibold px-3 py-2 rounded-lg transition-colors">
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button onClick={() => exportPDF(types).catch(e => alert('PDF download failed: ' + e.message))} title="Download PDF"
            className="flex items-center gap-1.5 border border-red-500 text-red-600 hover:bg-red-50 text-sm font-semibold px-3 py-2 rounded-lg transition-colors">
            <FileText size={14} /> PDF
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Plus size={15} /> Add Reading Type
          </button>
        </div>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{editing ? 'Edit Reading Type' : 'New Reading Type'}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <label className={lbl}>Code *</label>
              <input className={inp} value={form.code} readOnly={!!editing}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '_') }))}
                placeholder="ENG_HRS" style={editing ? { background: '#f9fafb', color: '#6b7280' } : {}} />
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className={lbl}>Name *</label>
              <input className={inp} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Engine Hours" />
            </div>
            <div>
              <label className={lbl}>Unit</label>
              <select className={inp} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={form.decimal_allowed}
                  onChange={e => setForm(f => ({ ...f, decimal_allowed: e.target.checked }))}
                  className="rounded" />
                Decimal Allowed
              </label>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              <Check size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={cancel} className="flex items-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm px-4 py-2 rounded-lg transition-colors">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Code</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Unit</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Decimal</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Mapped To</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Machines</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Loading…</td></tr>
            ) : types.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">No reading types defined yet.</td></tr>
            ) : (
              types.map(t => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded">{t.code}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-800 font-medium">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {t.decimal_allowed
                      ? <span className="text-green-500 text-xs font-bold">Yes</span>
                      : <span className="text-gray-400 text-xs">No</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                      {t.mapping_count} eq. types
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                      {t.machine_count} machines
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(t)}
                        className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                        <Pencil size={13} />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteTarget(t)}
                          title="Delete"
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete Reading Type</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Permanently delete{' '}
                  <span className="font-mono font-bold text-blue-700">{deleteTarget.code}</span>{' '}
                  — {deleteTarget.name}?
                </p>
              </div>
            </div>

            {(deleteTarget.mapping_count > 0 || deleteTarget.machine_count > 0) && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-800 space-y-1">
                <p className="font-semibold">This will also permanently delete:</p>
                {deleteTarget.mapping_count > 0 && (
                  <p>• {deleteTarget.mapping_count} equipment type mapping{deleteTarget.mapping_count > 1 ? 's' : ''}</p>
                )}
                {deleteTarget.machine_count > 0 && (
                  <p>• Reading configs on {deleteTarget.machine_count} machine{deleteTarget.machine_count > 1 ? 's' : ''}</p>
                )}
                <p>• All historical DPR reading logs for this type</p>
                <p className="font-semibold mt-1">This cannot be undone.</p>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors flex items-center gap-2">
                <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Force Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
