import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getInventoryItems, getInventoryItem, createInventoryItem, updateInventoryItem, deleteInventoryItem,
  getInventoryCategories, getWarehouses, getWarehouseLocations, getHireVendors,
  bulkCreateInventoryItems
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { today, fmtMoney, fmtNum } from '../../lib/utils'
import {
  Plus, Edit2, Trash2, X, Search, Package, AlertTriangle, XCircle,
  RefreshCw, Eye, ChevronLeft, ChevronRight, Upload, CheckCircle, FileSpreadsheet
} from 'lucide-react'

const UNITS = ['Nos', 'Kg', 'Litres', 'Metres', 'Sets', 'Pairs', 'Box', 'Roll', 'Pcs', 'Feet']
const COSTING = [
  { value: 'weighted_avg', label: 'Weighted Average' },
  { value: 'fifo',         label: 'FIFO' },
  { value: 'lifo',         label: 'LIFO' },
]

const emptyForm = () => ({
  part_code: '', part_name: '', description: '', category_id: '', sub_category_id: '',
  oem_number: '', manufacturer: '', brand: '', vendor_id: '', unit: 'Nos',
  gst_percent: 18, hsn_code: '', purchase_price: '', average_cost: '', selling_price: '',
  opening_qty: 0, min_stock: 0, max_stock: '', reorder_level: 0,
  warehouse_id: '', location_id: '', barcode: '', qr_code: '', costing_method: 'weighted_avg'
})

function StatusBadge({ status }) {
  const map = {
    in_stock:     'bg-green-100 text-green-800',
    low_stock:    'bg-amber-100 text-amber-800',
    out_of_stock: 'bg-red-100 text-red-800',
  }
  const label = { in_stock: 'In Stock', low_stock: 'Low Stock', out_of_stock: 'Out of Stock' }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {label[status] || status}
    </span>
  )
}

export default function SparePartsInventory() {
  const { isAdmin } = useAuth()
  const [items, setItems]       = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const [search, setSearch]     = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterWH, setFilterWH]   = useState('')
  const [lowStock, setLowStock]   = useState(false)

  const [categories, setCategories] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [locations, setLocations]   = useState([])
  const [vendors, setVendors]       = useState([])

  const [modal, setModal]   = useState(false)
  const [viewModal, setViewModal] = useState(null)
  const [form, setForm]     = useState(emptyForm())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [delId, setDelId]   = useState(null)

  // Bulk upload state
  const [bulkModal, setBulkModal]     = useState(false)
  const [bulkRows, setBulkRows]       = useState([])
  const [bulkFileName, setBulkFileName] = useState('')
  const [bulkParseError, setBulkParseError] = useState('')
  const [bulkUploading, setBulkUploading]   = useState(false)
  const [bulkResult, setBulkResult]         = useState(null)
  const bulkFileRef = useRef(null)

  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getInventoryItems({
        search, category_id: filterCat, warehouse_id: filterWH,
        low_stock: lowStock || undefined, page, limit: LIMIT
      })
      setItems(r.data.data); setTotal(r.data.total)
    } catch { }
    finally { setLoading(false) }
  }, [search, filterCat, filterWH, lowStock, page])

  useEffect(() => {
    Promise.all([getInventoryCategories(), getWarehouses(), getHireVendors()])
      .then(([c, w, v]) => {
        setCategories(c.data.data || [])
        setWarehouses(w.data.data || [])
        setVendors(v.data.data || [])
      })
      .catch(() => {})
  }, [])

  useEffect(() => { setPage(1) }, [search, filterCat, filterWH, lowStock])
  useEffect(() => { load() }, [load])

  const loadLocations = async (wid) => {
    if (!wid) { setLocations([]); return }
    try { const r = await getWarehouseLocations(wid); setLocations(r.data.data) }
    catch { setLocations([]) }
  }

  const openAdd = () => {
    setForm(emptyForm()); setEditId(null); setError(''); setLocations([]); setModal(true)
  }
  const openEdit = async (item) => {
    setForm({
      part_code: item.part_code, part_name: item.part_name, description: item.description || '',
      category_id: item.category_id || '', sub_category_id: item.sub_category_id || '',
      oem_number: item.oem_number || '', manufacturer: item.manufacturer || '', brand: item.brand || '',
      vendor_id: item.vendor_id || '', unit: item.unit || 'Nos',
      gst_percent: item.gst_percent || 18, hsn_code: item.hsn_code || '',
      purchase_price: item.purchase_price || '', average_cost: item.average_cost || '',
      selling_price: item.selling_price || '', opening_qty: item.opening_qty || 0,
      min_stock: item.min_stock || 0, max_stock: item.max_stock || '',
      reorder_level: item.reorder_level || 0,
      warehouse_id: item.warehouse_id || '', location_id: item.location_id || '',
      barcode: item.barcode || '', qr_code: item.qr_code || '',
      costing_method: item.costing_method || 'weighted_avg'
    })
    setEditId(item.id); setError('')
    if (item.warehouse_id) await loadLocations(item.warehouse_id)
    else setLocations([])
    setModal(true)
  }

  const save = async () => {
    if (!form.part_name.trim()) { setError('Part Name is required'); return }
    setSaving(true); setError('')
    try {
      if (editId) await updateInventoryItem(editId, form)
      else        await createInventoryItem(form)
      setModal(false); load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const del = async () => {
    try { await deleteInventoryItem(delId); setDelId(null); load() }
    catch (err) { alert(err.response?.data?.error || 'Failed to delete') }
  }

  const openView = async (id) => {
    try { const r = await getInventoryItem(id); setViewModal(r.data.data) }
    catch {}
  }

  const openBulkModal = () => {
    setBulkRows([]); setBulkFileName(''); setBulkParseError(''); setBulkResult(null)
    setBulkModal(true)
  }

  const handleBulkFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkFileName(file.name); setBulkParseError(''); setBulkRows([]); setBulkResult(null)
    try {
      const XLSX = await import('xlsx')
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const aoa  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // Find the header row: look for a row containing "Part Description"
      let headerIdx = -1
      for (let r = 0; r < Math.min(10, aoa.length); r++) {
        if (aoa[r].some(cell => cell?.toString().toLowerCase().includes('part description'))) {
          headerIdx = r; break
        }
      }
      if (headerIdx === -1) {
        setBulkParseError('Could not find the header row. Expected a row with "Part Description".')
        return
      }

      const headers = aoa[headerIdx].map(h => h?.toString().trim())
      const colIdx = (label) => headers.findIndex(h => h.toLowerCase().includes(label.toLowerCase()))

      const COL = {
        part_code:      colIdx('item number'),
        part_name:      colIdx('part description'),
        oem_number:     colIdx('part number'),
        manufacturer:   colIdx('manufacturer'),
        unit:           colIdx('unit of measurement'),
        description:    colIdx('description'),
        purchase_price: colIdx('purchase price'),
        selling_price:  colIdx('sale / consumption price'),
        gst_percent:    colIdx('igst'),
        status:         colIdx('status'),
      }

      const parsed = []
      for (let r = headerIdx + 1; r < aoa.length; r++) {
        const row = aoa[r]
        const part_name = row[COL.part_name]?.toString().trim()
        if (!part_name) continue  // skip blank rows

        parsed.push({
          part_code:      row[COL.part_code]?.toString().trim() || '',
          part_name,
          oem_number:     row[COL.oem_number]?.toString().trim() || '',
          manufacturer:   row[COL.manufacturer]?.toString().trim() || '',
          unit:           row[COL.unit]?.toString().trim() || 'Nos',
          description:    row[COL.description]?.toString().trim() || '',
          purchase_price: row[COL.purchase_price]?.toString().trim() || '',
          selling_price:  row[COL.selling_price]?.toString().trim() || '',
          gst_percent:    row[COL.gst_percent]?.toString().trim() || '0',
          active:         row[COL.status]?.toString().trim() !== 'Inactive' ? 'Active' : 'Inactive',
        })
      }

      if (parsed.length === 0) {
        setBulkParseError('No data rows found after the header row.')
        return
      }
      setBulkRows(parsed)
    } catch (err) {
      setBulkParseError('Failed to parse file: ' + err.message)
    }
  }

  const handleBulkUpload = async () => {
    if (!bulkRows.length) return
    setBulkUploading(true); setBulkResult(null); setBulkParseError('')

    const CHUNK = 500
    let totalImported = 0
    const allErrors = []

    try {
      for (let start = 0; start < bulkRows.length; start += CHUNK) {
        const chunk = bulkRows.slice(start, start + CHUNK)
        const r = await bulkCreateInventoryItems(chunk)
        totalImported += r.data.imported || 0
        if (r.data.errors?.length) allErrors.push(...r.data.errors)
      }
      setBulkResult({ imported: totalImported, errors: allErrors })
      load()
    } catch (err) {
      setBulkParseError(err.response?.data?.error || `Upload failed: ${err.message}`)
    } finally {
      setBulkUploading(false)
    }
  }

  const parentCats = categories.filter(c => !c.parent_id)
  const subCats    = categories.filter(c => c.parent_id === parseInt(form.category_id))

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'
  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="p-4 max-w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Package size={20} />Spare Parts Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} parts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw size={16} /></button>
          {isAdmin && (
            <>
              <button onClick={openBulkModal} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                <Upload size={15} /> Bulk Upload
              </button>
              <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <Plus size={15} /> Add Part
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input
            className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            placeholder="Search part name, code, OEM…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.parent_id ? '  ↳ ' : ''}{c.name}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" value={filterWH} onChange={e => setFilterWH(e.target.value)}>
          <option value="">All Warehouses</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg cursor-pointer">
          <input type="checkbox" checked={lowStock} onChange={e => setLowStock(e.target.checked)} />
          <AlertTriangle size={13} /> Low Stock Only
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Part Code</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Part Name</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Category</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Warehouse</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Location</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Current</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Reserved</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Available</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Reorder</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Avg Cost</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Value</th>
              <th className="px-3 py-3 text-center font-semibold text-gray-600">Status</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={13} className="px-4 py-10 text-center text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={13} className="px-4 py-10 text-center text-gray-400">No parts found</td></tr>
            ) : items.map(item => (
              <tr key={item.id} className={`hover:bg-gray-50 ${item.stock_status === 'out_of_stock' ? 'bg-red-50/30' : item.stock_status === 'low_stock' ? 'bg-amber-50/30' : ''}`}>
                <td className="px-3 py-2.5 font-mono text-xs text-blue-700">{item.part_code}</td>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-gray-900 max-w-[200px] truncate">{item.part_name}</div>
                  {item.brand && <div className="text-xs text-gray-400">{item.brand}</div>}
                </td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">
                  {item.category_name || '—'}
                  {item.sub_category_name && <span className="text-gray-400"> / {item.sub_category_name}</span>}
                </td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{item.warehouse_name || '—'}</td>
                <td className="px-3 py-2.5 text-gray-500 text-xs">
                  {[item.rack && `R:${item.rack}`, item.shelf && `S:${item.shelf}`, item.bin && `B:${item.bin}`].filter(Boolean).join('/') || '—'}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{fmtNum(item.current_stock)}</td>
                <td className="px-3 py-2.5 text-right text-amber-700">{fmtNum(item.reserved_stock)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-green-700">{fmtNum(item.available_stock)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500">{fmtNum(item.reorder_level)}</td>
                <td className="px-3 py-2.5 text-right text-gray-600">{fmtMoney(item.avg_cost)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-gray-800">{fmtMoney(item.inventory_value)}</td>
                <td className="px-3 py-2.5 text-center"><StatusBadge status={item.stock_status} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openView(item.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="View"><Eye size={13} /></button>
                    {isAdmin && <>
                      <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit"><Edit2 size={13} /></button>
                      <button onClick={() => setDelId(item.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete"><Trash2 size={13} /></button>
                    </>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <span>Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 border rounded hover:bg-gray-50 disabled:opacity-40"><ChevronLeft size={15} /></button>
            <span>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 border rounded hover:bg-gray-50 disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-6">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-semibold text-gray-900">{editId ? 'Edit Spare Part' : 'Add Spare Part'}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Basic Details */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Basic Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Part Code (auto if blank)</label>
                    <input className={inp} value={form.part_code} onChange={e => setForm(f => ({...f, part_code: e.target.value}))} placeholder="SP-1001" />
                  </div>
                  <div>
                    <label className={lbl}>Part Name *</label>
                    <input className={inp} value={form.part_name} onChange={e => setForm(f => ({...f, part_name: e.target.value}))} />
                  </div>
                  <div className="col-span-2">
                    <label className={lbl}>Description</label>
                    <textarea className={inp} rows={2} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
                  </div>
                  <div>
                    <label className={lbl}>Category</label>
                    <select className={inp} value={form.category_id} onChange={e => setForm(f => ({...f, category_id: e.target.value, sub_category_id: ''}))}>
                      <option value="">— Select —</option>
                      {parentCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Sub Category</label>
                    <select className={inp} value={form.sub_category_id} onChange={e => setForm(f => ({...f, sub_category_id: e.target.value}))} disabled={!form.category_id}>
                      <option value="">— Select —</option>
                      {subCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>OEM Number</label>
                    <input className={inp} value={form.oem_number} onChange={e => setForm(f => ({...f, oem_number: e.target.value}))} />
                  </div>
                  <div>
                    <label className={lbl}>Manufacturer</label>
                    <input className={inp} value={form.manufacturer} onChange={e => setForm(f => ({...f, manufacturer: e.target.value}))} />
                  </div>
                  <div>
                    <label className={lbl}>Brand</label>
                    <input className={inp} value={form.brand} onChange={e => setForm(f => ({...f, brand: e.target.value}))} />
                  </div>
                  <div>
                    <label className={lbl}>Vendor</label>
                    <select className={inp} value={form.vendor_id} onChange={e => setForm(f => ({...f, vendor_id: e.target.value}))}>
                      <option value="">— Select —</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Pricing & Tax */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pricing & Tax</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={lbl}>Unit</label>
                    <select className={inp} value={form.unit} onChange={e => setForm(f => ({...f, unit: e.target.value}))}>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>GST %</label>
                    <input type="number" className={inp} value={form.gst_percent} onChange={e => setForm(f => ({...f, gst_percent: e.target.value}))} />
                  </div>
                  <div>
                    <label className={lbl}>HSN Code</label>
                    <input className={inp} value={form.hsn_code} onChange={e => setForm(f => ({...f, hsn_code: e.target.value}))} />
                  </div>
                  <div>
                    <label className={lbl}>Purchase Price (₹)</label>
                    <input type="number" className={inp} value={form.purchase_price} onChange={e => setForm(f => ({...f, purchase_price: e.target.value}))} step="0.01" />
                  </div>
                  <div>
                    <label className={lbl}>Average Cost (₹)</label>
                    <input type="number" className={inp} value={form.average_cost} onChange={e => setForm(f => ({...f, average_cost: e.target.value}))} step="0.01" />
                  </div>
                  <div>
                    <label className={lbl}>Costing Method</label>
                    <select className={inp} value={form.costing_method} onChange={e => setForm(f => ({...f, costing_method: e.target.value}))}>
                      {COSTING.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Stock Levels */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Stock Levels</p>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className={lbl}>Opening Qty</label>
                    <input type="number" className={inp} value={form.opening_qty} onChange={e => setForm(f => ({...f, opening_qty: e.target.value}))} step="0.001" />
                  </div>
                  <div>
                    <label className={lbl}>Min Stock</label>
                    <input type="number" className={inp} value={form.min_stock} onChange={e => setForm(f => ({...f, min_stock: e.target.value}))} step="0.001" />
                  </div>
                  <div>
                    <label className={lbl}>Max Stock</label>
                    <input type="number" className={inp} value={form.max_stock} onChange={e => setForm(f => ({...f, max_stock: e.target.value}))} step="0.001" />
                  </div>
                  <div>
                    <label className={lbl}>Reorder Level</label>
                    <input type="number" className={inp} value={form.reorder_level} onChange={e => setForm(f => ({...f, reorder_level: e.target.value}))} step="0.001" />
                  </div>
                </div>
              </div>

              {/* Location */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Warehouse Location</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Warehouse</label>
                    <select className={inp} value={form.warehouse_id} onChange={e => { setForm(f => ({...f, warehouse_id: e.target.value, location_id: ''})); loadLocations(e.target.value) }}>
                      <option value="">— Select —</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Location (Rack/Shelf/Bin)</label>
                    <select className={inp} value={form.location_id} onChange={e => setForm(f => ({...f, location_id: e.target.value}))} disabled={!form.warehouse_id}>
                      <option value="">— Select —</option>
                      {locations.map(l => (
                        <option key={l.id} value={l.id}>
                          {[l.rack && `Rack ${l.rack}`, l.shelf && `Shelf ${l.shelf}`, l.bin && `Bin ${l.bin}`].filter(Boolean).join(' / ') || `Location ${l.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Barcode</label>
                    <input className={inp} value={form.barcode} onChange={e => setForm(f => ({...f, barcode: e.target.value}))} />
                  </div>
                  <div>
                    <label className={lbl}>QR Code</label>
                    <input className={inp} value={form.qr_code} onChange={e => setForm(f => ({...f, qr_code: e.target.value}))} />
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
                  {saving ? 'Saving…' : (editId ? 'Update Part' : 'Add Part')}
                </button>
                <button onClick={() => setModal(false)} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-semibold text-gray-900">{viewModal.part_name}</h2>
              <button onClick={() => setViewModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Part Code', viewModal.part_code],
                  ['Category', viewModal.category_name || '—'],
                  ['Sub Category', viewModal.sub_category_name || '—'],
                  ['OEM Number', viewModal.oem_number || '—'],
                  ['Manufacturer', viewModal.manufacturer || '—'],
                  ['Brand', viewModal.brand || '—'],
                  ['Unit', viewModal.unit],
                  ['GST %', viewModal.gst_percent + '%'],
                  ['HSN Code', viewModal.hsn_code || '—'],
                  ['Warehouse', viewModal.warehouse_name || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400">{k}</p>
                    <p className="font-medium text-gray-900">{v}</p>
                  </div>
                ))}
              </div>
              <div className="bg-blue-50 rounded-xl p-4 grid grid-cols-3 gap-3">
                <div><p className="text-xs text-blue-400">Current Stock</p><p className="text-lg font-bold text-blue-900">{fmtNum(viewModal.current_stock)}</p></div>
                <div><p className="text-xs text-amber-500">Reserved</p><p className="text-lg font-bold text-amber-700">{fmtNum(viewModal.reserved_stock)}</p></div>
                <div><p className="text-xs text-green-500">Available</p><p className="text-lg font-bold text-green-700">{fmtNum(viewModal.available_stock)}</p></div>
                <div><p className="text-xs text-gray-400">Reorder Level</p><p className="font-semibold text-gray-800">{fmtNum(viewModal.reorder_level)}</p></div>
                <div><p className="text-xs text-gray-400">Avg Cost</p><p className="font-semibold text-gray-800">{fmtMoney(viewModal.avg_cost)}</p></div>
                <div><p className="text-xs text-gray-400">Inventory Value</p><p className="font-semibold text-gray-800">{fmtMoney(parseFloat(viewModal.current_stock || 0) * parseFloat(viewModal.avg_cost || 0))}</p></div>
              </div>
              <StatusBadge status={viewModal.stock_status} />
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-6">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-emerald-600" />
                <h2 className="font-semibold text-gray-900">Bulk Upload Spare Parts</h2>
              </div>
              <button onClick={() => setBulkModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
                <p className="font-semibold">Supported format: RVR Item List Excel export</p>
                <p>Columns used: Item Number, Part Description, Part Number, Manufacturer, Unit of Measurement, Description, Purchase Price, Sale Price, IGST %, Status</p>
                <p className="text-blue-600">Items with matching Item Number (Part Code) will be updated; new codes will be inserted. Large files are uploaded in batches of 500.</p>
              </div>

              {/* File picker */}
              <div>
                <input
                  ref={bulkFileRef} type="file" accept=".xlsx,.xls"
                  onChange={handleBulkFile} className="hidden"
                />
                <button
                  onClick={() => bulkFileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors w-full justify-center"
                >
                  <Upload size={16} />
                  {bulkFileName ? bulkFileName : 'Click to select Excel file (.xlsx)'}
                </button>
              </div>

              {bulkParseError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{bulkParseError}</p>
              )}

              {/* Result */}
              {bulkResult && (
                <div className={`rounded-xl p-4 border ${bulkResult.errors?.length ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle size={16} className={bulkResult.errors?.length ? 'text-amber-600' : 'text-green-600'} />
                    <span className="font-semibold text-sm">
                      {bulkResult.imported} parts imported / updated successfully
                      {bulkResult.errors?.length ? `, ${bulkResult.errors.length} errors` : ''}
                    </span>
                  </div>
                  {bulkResult.errors?.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                      {bulkResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-amber-800">Row {e.row}: {e.part_name} — {e.error}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Preview table */}
              {bulkRows.length > 0 && !bulkResult && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Preview — {bulkRows.length} rows detected (showing first 10)
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Part Code','Part Name','OEM / Part No.','Manufacturer','Unit','GST %','Purchase Price','Status'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bulkRows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-blue-700">{r.part_code || '(auto)'}</td>
                            <td className="px-3 py-2 font-medium max-w-[180px] truncate">{r.part_name}</td>
                            <td className="px-3 py-2 text-gray-500">{r.oem_number || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{r.manufacturer || '—'}</td>
                            <td className="px-3 py-2">{r.unit}</td>
                            <td className="px-3 py-2">{r.gst_percent}%</td>
                            <td className="px-3 py-2">{r.purchase_price || '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.active === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                {r.active}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {bulkRows.length > 10 && (
                    <p className="text-xs text-gray-400 mt-1">…and {bulkRows.length - 10} more rows</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setBulkModal(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50">
                {bulkResult ? 'Close' : 'Cancel'}
              </button>
              {!bulkResult && bulkRows.length > 0 && (
                <button
                  onClick={handleBulkUpload}
                  disabled={bulkUploading}
                  className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Upload size={14} />
                  {bulkUploading ? `Uploading… (${bulkRows.length} parts in batches)` : `Upload ${bulkRows.length} Parts`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {delId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="font-semibold text-gray-900 mb-2">Delete Spare Part?</p>
            <p className="text-sm text-gray-500 mb-5">This will deactivate the part from the system.</p>
            <div className="flex gap-3">
              <button onClick={del} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
              <button onClick={() => setDelId(null)} className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm py-2">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
