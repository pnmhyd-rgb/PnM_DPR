import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  getProjects, getMachines, createMachine, bulkCreateMachines, updateMachine,
  deleteMachine, transferMachine, hardDeleteMachine, getEquipmentTypes,
  getUomTypes, getMachineReadingConfigs, toggleMachineReadingConfig, resetMachineReadingConfigs,
  regenerateMachineNicknames,
} from '../../lib/api'
import {
  Plus, Edit2, Trash2, X, Search, ChevronUp, ChevronDown as ChevDown,
  RotateCcw, Filter, Upload, Download,
  MoreVertical, ArrowRightLeft, PowerOff, AlertTriangle, ShieldAlert,
  Activity, RefreshCw, ToggleLeft, ToggleRight
} from 'lucide-react'
import MachineDownloadModal from './MachineDownloadModal'
import { downloadAssetTemplate, parseAssetFile } from '../../lib/assetBulkTemplate'
import MachineDetailPanel from '../../components/MachineDetailPanel'

function autoNickname({ eq_type, asset_code, slno, reg_no, capacity, uom, model }) {
  const name = (eq_type || '').trim()
  if (!name) return ''

  // Tower cranes: name-Model-SL#
  if (/tower\s*crane/i.test(name)) {
    const modelPart = (model || '').toString().trim()
    const slnoPart  = (slno  || '').toString().trim()
    return [name, modelPart, slnoPart].filter(Boolean).join('-')
  }

  const reg = (reg_no || '').toString().trim()
  if (reg) return `${name}-${reg}`

  const codeParts = (asset_code || '').split('/')
  const lastSeg   = codeParts.length > 1 ? codeParts[codeParts.length - 1].trim() : ''
  const codeSeq   = /^\d{4}$/.test(lastSeg) ? '' : lastSeg

  const WEIGHT_UOMS = new Set(['kg', 'kgs', 'lb', 'lbs'])
  const capRaw = (capacity || '').toString().trim()
  let capNum = '', capUnit = (uom || '').toString().trim()

  if (/^\d+(\.\d+)?$/.test(capRaw)) {
    capNum = capRaw
  } else if (capRaw) {
    const m = capRaw.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/)
    if (m) { capNum = m[1]; capUnit = m[2] }
  }

  // Fallback: extract capacity from asset code (e.g. RVR/DG/2013/125/10 → "125")
  if (!capNum) {
    for (let i = 1; i < codeParts.length - 1; i++) {
      const seg = codeParts[i].trim()
      if (/^\d{4}$/.test(seg)) continue
      const cm = seg.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/)
      if (cm) { capNum = cm[1]; capUnit = cm[2]; break }
      if (/^\d+(\.\d+)?$/.test(seg)) { capNum = seg; break }
    }
  }

  const isWeight = WEIGHT_UOMS.has(capUnit.toLowerCase())
  const fullName = (capNum && !isWeight)
    ? (capUnit ? `${capNum} ${capUnit} ${name}` : `${capNum} ${name}`)
    : name

  return codeSeq ? `${fullName}-${codeSeq}` : fullName
}

const SHIFT_OPTIONS = ['Single Shift', 'Dual Shift']
const FUEL_TYPES    = ['Diesel', 'Petrol', 'EV', 'N/A']
const ASSET_TYPES   = ['Measurable Asset', 'Non-Measurable Asset']

const blank = {
  project_id: '', asset_code: '', slno: '', eq_type: '',
  manufacturer: '', model: '', yom: '', capacity: '', uom: '',
  chassis_no: '', engine_no: '', reg_no: '', fuel_type: 'Diesel',
  ownership: 'Own', asset_type: 'Measurable Asset',
  vendor: '', rate: '', rate_monthly: '',
  reading1_basis: 'Hours', reading2_basis: '', dual_reading: false,
  fuel_min: '', fuel_max: '', fuel_min_km: '', fuel_max_km: '', fuel_tank_l: '',
  planned_hours: '10', shift_type: '',
  date_of_purchase: '', po_number: '', price: '', nickname: ''
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

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevDown size={11} className="text-gray-300 ml-0.5" />
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="text-blue-600 ml-0.5" />
    : <ChevDown size={11} className="text-blue-600 ml-0.5" />
}

export default function Machines() {
  const location = useLocation()
  const [projects,      setProjects]      = useState([])
  const [eqTypes,       setEqTypes]       = useState([])
  const [uomList,       setUomList]       = useState([])
  const [machines,      setMachines]      = useState([])
  const [loadError,       setLoadError]       = useState('')
  const [detailPanel,     setDetailPanel]     = useState(null)
  const [detailInitialTab, setDetailInitialTab] = useState(null)

  // Reading configs panel
  const [readingConfigModal,    setReadingConfigModal]    = useState(null)  // { machine }
  const [readingConfigs,        setReadingConfigs]        = useState([])
  const [readingConfigLoading,  setReadingConfigLoading]  = useState(false)
  const [readingConfigResetting, setReadingConfigResetting] = useState(false)
  const [toggleLoading,         setToggleLoading]         = useState(null)  // config id being toggled

  // Track eq_type at edit-open time so we know if it changed on save
  const [originalEqType, setOriginalEqType] = useState('')

  // Filters
  const [filterProj,     setFilterProj]    = useState('')
  const [filterType,     setFilterType]    = useState('')
  const [filterOwn,      setFilterOwn]     = useState('')
  const [filterCategory, setFilterCategory] = useState('')   // Measurable Asset | Non-Measurable Asset
  const [search,         setSearch]        = useState('')
  const [showInactive,   setShowInactive]  = useState(false)

  // Sort
  const [sortCol,       setSortCol]       = useState('slno')
  const [sortDir,       setSortDir]       = useState('asc')

  // Multi-select
  const [selected,           setSelected]           = useState(new Set())
  const [bulkDeleting,       setBulkDeleting]       = useState(false)
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [showBulkTransfer,   setShowBulkTransfer]   = useState(false)
  const [bulkTransferProj,   setBulkTransferProj]   = useState('')
  const [bulkTransferDate,   setBulkTransferDate]   = useState('')
  const [bulkTransferring,   setBulkTransferring]   = useState(false)
  const [bulkTransferResult, setBulkTransferResult] = useState(null)  // { transferred, failed, errors }

  // Download modal
  const [showDownloadModal, setShowDownloadModal] = useState(false)

  // Nickname regeneration
  const [regenLoading, setRegenLoading] = useState(false)

  // Bulk upload
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkFile,      setBulkFile]      = useState(null)
  const [bulkPreview,   setBulkPreview]   = useState(null)
  const [bulkSaving,    setBulkSaving]    = useState(false)
  const [bulkResult,    setBulkResult]    = useState(null)
  const fileInputRef = useRef()

  // Modal
  const [modal,         setModal]         = useState(null)
  const [form,          setForm]          = useState(blank)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  // Action dropdown + action modals
  const [actionMenu,        setActionMenu]        = useState(null)   // machine id with open dropdown
  const [actionMenuPos,     setActionMenuPos]     = useState({ top: 0, right: 0 })
  const [deactivateModal,   setDeactivateModal]   = useState(null)   // machine to deactivate
  const [deactivateReason,  setDeactivateReason]  = useState('')
  const [transferModal,     setTransferModal]      = useState(null)   // machine to transfer
  const [transferProjectId, setTransferProjectId] = useState('')
  const [transferDate,      setTransferDate]      = useState('')
  const [deleteModal,       setDeleteModal]       = useState(null)   // machine to permanently delete
  const [actionSaving,      setActionSaving]      = useState(false)
  const [actionError,       setActionError]       = useState('')

  const load = () => {
    const params = {}
    if (filterProj) params.project_code = filterProj
    if (showInactive) params.include_inactive = 'true'
    setLoadError('')
    getMachines(params)
      .then(r => { setMachines(r.data.data); setSelected(new Set()) })
      .catch(err => setLoadError(err.response?.data?.error || err.message || 'Failed to load machines'))
  }

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data))
    getEquipmentTypes().then(r => setEqTypes(r.data.data))
  }, [])

  // Lazy-load UOM list only when the add/edit modal is opened
  const ensureUomList = () => {
    if (uomList.length === 0) {
      getUomTypes().then(r => setUomList(r.data.data)).catch(() => {})
    }
  }

  useEffect(() => { load() }, [filterProj, showInactive])

  // Auto-open detail panel when navigated from notification bell
  useEffect(() => {
    const openId = location.state?.openMachineId
    if (!openId || machines.length === 0) return
    const m = machines.find(x => x.id === openId)
    if (m) { setDetailPanel(m); setDetailInitialTab('counter-reset') }
  }, [machines, location.state?.openMachineId])

  // ── Filtered + sorted list ─────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = machines
    if (filterType)     list = list.filter(m => m.eq_type === filterType)
    if (filterOwn)      list = list.filter(m => m.ownership === filterOwn)
    if (filterCategory) list = list.filter(m => m.asset_type === filterCategory)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.slno?.toLowerCase().includes(q) ||
        m.asset_code?.toLowerCase().includes(q) ||
        m.nickname?.toLowerCase().includes(q) ||
        m.eq_type?.toLowerCase().includes(q) ||
        m.reg_no?.toLowerCase().includes(q) ||
        m.chassis_no?.toLowerCase().includes(q) ||
        m.engine_no?.toLowerCase().includes(q) ||
        m.project_code?.toLowerCase().includes(q) ||
        m.manufacturer?.toLowerCase().includes(q) ||
        m.model?.toLowerCase().includes(q) ||
        m.vendor?.toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      let av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [machines, filterType, filterOwn, search, sortCol, sortDir])

  const machineCount = machines.length

  // ── Sort toggle ────────────────────────────────────────────────────────────
  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  const toggleOne   = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allChecked  = displayed.length > 0 && displayed.every(m => selected.has(m.id))
  const someChecked = displayed.some(m => selected.has(m.id)) && !allChecked
  const toggleAll   = () => {
    if (allChecked) setSelected(prev => { const n = new Set(prev); displayed.forEach(m => n.delete(m.id)); return n })
    else setSelected(prev => { const n = new Set(prev); displayed.forEach(m => n.add(m.id)); return n })
  }
  const selectedCount = [...selected].filter(id => displayed.find(m => m.id === id)).length

  // ── Bulk upload ────────────────────────────────────────────────────────────
  const resetBulk = () => {
    setBulkFile(null); setBulkPreview(null); setBulkResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  const closeBulkModal = () => { setShowBulkModal(false); resetBulk() }

  const handleRegenNicknames = async () => {
    if (!confirm('Regenerate nicknames for ALL machines using current asset data? Existing nicknames will be overwritten.')) return
    setRegenLoading(true)
    try {
      const res = await regenerateMachineNicknames()
      alert(`Done — ${res.data.updated} machine nicknames updated.`)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to regenerate nicknames')
    } finally { setRegenLoading(false) }
  }

  const handleBulkFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkFile(file); setBulkResult(null)
    setBulkPreview(await parseAssetFile(file))
  }

  const handleBulkUpload = async () => {
    if (!bulkPreview?.items?.length) return
    // Pre-validate project codes — show clear error if code in file doesn't exactly match
    const uploadItems = bulkPreview.items
    if (projects.length > 0) {
      const validCodes = new Set(projects.map(p => p.code.toUpperCase()))
      const rawCodes = [...new Set(
        uploadItems.map(i => i.project_code).filter(Boolean).map(c => c.toString().trim())
      )]
      const unknownCodes = rawCodes.filter(c => !validCodes.has(c.toUpperCase()))
      if (unknownCodes.length > 0) {
        const hints = unknownCodes.map(unk => {
          const suggestion = projects.find(p =>
            p.code.toUpperCase().split(/\s+/).includes(unk.toUpperCase())
          )
          return suggestion
            ? `"${unk}" not found — did you mean "${suggestion.code}"?`
            : `"${unk}" not found`
        })
        setBulkResult({ error: `Project code mismatch in file: ${hints.join('; ')}. Update column "Project Code" in your Excel file and re-upload. Available codes: ${projects.map(p => p.code).join(', ')}` })
        return
      }
    }
    setBulkSaving(true); setBulkResult(null)
    try {
      const res = await bulkCreateMachines(uploadItems)
      setBulkResult(res.data)
      if (res.data.created > 0 || res.data.updated > 0 || res.data.reactivated > 0) {
        load()
        // Clear file/preview but keep bulkResult so the user can read the outcome
        setBulkFile(null); setBulkPreview(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    } catch (err) {
      setBulkResult({ error: err.response?.data?.error || 'Upload failed' })
    } finally { setBulkSaving(false) }
  }

  // ── Bulk deactivate ────────────────────────────────────────────────────────
  const handleBulkDeactivate = async () => {
    const ids = [...selected].filter(id => displayed.find(m => m.id === id))
    if (!confirm(`Deactivate ${ids.length} machine${ids.length > 1 ? 's' : ''}?`)) return
    setBulkDeleting(true)
    try { await Promise.all(ids.map(id => deleteMachine(id))); load() }
    finally { setBulkDeleting(false) }
  }

  // ── Bulk transfer ──────────────────────────────────────────────────────────
  const openBulkTransfer = () => {
    setBulkTransferProj(''); setBulkTransferDate(''); setBulkTransferResult(null)
    setShowBulkTransfer(true)
  }

  const handleBulkTransfer = async () => {
    if (!bulkTransferProj || !bulkTransferDate) return
    const machines_to_transfer = [...selected]
      .map(id => displayed.find(m => m.id === id))
      .filter(m => m && m.active)
    setBulkTransferring(true); setBulkTransferResult(null)
    const errors = []; let transferred = 0
    for (const m of machines_to_transfer) {
      try {
        await transferMachine(m.id, { new_project_id: parseInt(bulkTransferProj), transferred_date: bulkTransferDate })
        transferred++
      } catch (err) {
        errors.push({ slno: m.slno, error: err.response?.data?.error || 'Failed' })
      }
    }
    setBulkTransferResult({ transferred, failed: errors.length, errors })
    setBulkTransferring(false)
    if (transferred > 0) load()
  }

  // ── Bulk reactivate (inactive view) ───────────────────────────────────────
  const handleBulkReactivate = async () => {
    const ids = [...selected].filter(id => displayed.find(m => m.id === id))
    if (!confirm(`Reactivate ${ids.length} machine${ids.length > 1 ? 's' : ''}?`)) return
    setBulkDeleting(true)
    try { await Promise.all(ids.map(id => updateMachine(id, { active: true }))); load() }
    finally { setBulkDeleting(false) }
  }

  // ── Bulk permanent delete ─────────────────────────────────────────────────
  const handleBulkHardDelete = async () => {
    const ids = [...selected].filter(id => displayed.find(m => m.id === id))
    setBulkDeleting(true); setShowBulkDeleteModal(false)
    try { await Promise.all(ids.map(id => hardDeleteMachine(id))); load() }
    finally { setBulkDeleting(false) }
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────
  const openAdd = () => {
    ensureUomList()
    setForm({ ...blank, project_id: projects.find(p => p.code === filterProj)?.id?.toString() || '' })
    setError(''); setModal('add')
  }
  const openEdit = (m) => {
    ensureUomList()
    setOriginalEqType(m.eq_type)
    setForm({
      project_id: String(m.project_id), asset_code: m.asset_code || '', slno: m.slno,
      eq_type: m.eq_type,
      manufacturer: m.manufacturer || '', model: m.model || '', yom: m.yom || '',
      capacity: m.capacity || '', uom: m.uom || '',
      chassis_no: m.chassis_no || '', engine_no: m.engine_no || '', reg_no: m.reg_no || '',
      fuel_type: m.fuel_type || 'Diesel',
      ownership: m.ownership, asset_type: m.asset_type || 'Measurable Asset',
      vendor: m.vendor || '', rate: m.rate || '', rate_monthly: m.rate_monthly || '',
      reading1_basis: m.reading1_basis, reading2_basis: m.reading2_basis || '',
      dual_reading: m.dual_reading, fuel_min: m.fuel_min || '', fuel_max: m.fuel_max || '',
      fuel_min_km: m.fuel_min_km || '', fuel_max_km: m.fuel_max_km || '',
      fuel_tank_l: m.fuel_tank_l != null ? String(m.fuel_tank_l) : '',
      planned_hours: String(m.planned_hours || 10),
      shift_type: m.shift_type || 'Single Shift',
      date_of_purchase: m.date_of_purchase ? m.date_of_purchase.slice(0, 10) : '',
      po_number: m.po_number || '', price: m.price || '',
      nickname: m.nickname || ''
    })
    setError(''); setModal({ edit: m })
  }
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

  const save = async () => {
    setSaving(true); setError('')
    try {
      const isEdit = modal !== 'add'
      const eqTypeChanged = isEdit && form.eq_type !== originalEqType
      const editId = isEdit ? modal.edit.id : null

      const payload = {
        ...form,
        project_id:    parseInt(form.project_id),
        asset_code:    form.asset_code || null,
        manufacturer:  form.manufacturer || null,
        model:         form.model || null,
        yom:           form.yom || null,
        chassis_no:    form.chassis_no || null,
        engine_no:     form.engine_no || null,
        uom:           form.uom || null,
        fuel_type:     form.fuel_type || null,
        asset_type:    form.asset_type || null,
        rate:          form.rate || null,
        rate_monthly:  form.rate_monthly || null,
        fuel_min:      form.fuel_min || null,
        fuel_max:      form.fuel_max || null,
        fuel_min_km:   form.fuel_min_km || null,
        fuel_max_km:   form.fuel_max_km || null,
        fuel_tank_l:   form.fuel_tank_l !== '' ? parseFloat(form.fuel_tank_l) : null,
        capacity:      form.capacity || null,
        vendor:        form.vendor || null,
        reg_no:        form.reg_no || null,
        reading2_basis: form.reading2_basis || null,
        planned_hours: parseFloat(form.planned_hours) || 10,
        shift_type:    form.shift_type,
        date_of_purchase: form.date_of_purchase || null,
        po_number:     form.po_number || null,
        price:         form.price || null,
        nickname:      form.nickname || null
      }
      modal === 'add' ? await createMachine(payload) : await updateMachine(editId, payload)
      setModal(null)
      // Fire-and-forget: reset reading configs in background if equipment type changed
      if (eqTypeChanged && editId) {
        resetMachineReadingConfigs(editId).catch(() => {})
      }
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  const reactivate = async (id) => {
    await updateMachine(id, { active: true }); load()
  }

  const handleDeactivate = async () => {
    if (!deactivateReason) return
    setActionSaving(true); setActionError('')
    try {
      await deleteMachine(deactivateModal.id, { reason: deactivateReason })
      setDeactivateModal(null); setDeactivateReason('')
      load()
    } catch (err) {
      setActionError(err.response?.data?.error || 'Deactivation failed')
    } finally { setActionSaving(false) }
  }

  const handleTransfer = async () => {
    if (!transferProjectId || !transferDate) return
    setActionSaving(true); setActionError('')
    try {
      await transferMachine(transferModal.id, { new_project_id: parseInt(transferProjectId), transferred_date: transferDate })
      setTransferModal(null); setTransferProjectId(''); setTransferDate('')
      load()
    } catch (err) {
      setActionError(err.response?.data?.error || 'Transfer failed')
    } finally { setActionSaving(false) }
  }

  const handleHardDelete = async () => {
    setActionSaving(true); setActionError('')
    try {
      await hardDeleteMachine(deleteModal.id)
      setDeleteModal(null)
      load()
    } catch (err) {
      setActionError(err.response?.data?.error || 'Delete failed')
    } finally { setActionSaving(false) }
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'
  const thCls = col => `px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap cursor-pointer select-none hover:text-gray-700`

  const HEADERS = [
    { label: 'Project',       col: 'project_code' },
    { label: 'Nickname',      col: 'nickname' },
    { label: 'Asset Code',    col: 'asset_code' },
    { label: 'Asset Group',   col: 'asset_group' },
    { label: 'Category',      col: 'asset_cat' },
    { label: 'Asset Name',    col: 'eq_type' },
    { label: 'Measurability', col: 'asset_type' },
    { label: 'Own/Hire',      col: 'ownership' },
    { label: 'Owner Name',    col: 'vendor' },
    { label: 'Manufacturer',  col: 'manufacturer' },
    { label: 'Model',         col: 'model' },
    { label: 'Year',          col: 'yom' },
    { label: 'Capacity',      col: 'capacity' },
    { label: 'Reg No',        col: 'reg_no' },
    { label: 'Machine SL#',   col: 'slno' },
    { label: 'Chassis No',    col: 'chassis_no' },
    { label: 'Engine No',     col: 'engine_no' },
    { label: 'Shift',         col: 'shift_type' },
    { label: 'Fuel Min L/hr', col: 'fuel_min' },
    { label: 'Fuel Max L/hr', col: 'fuel_max' },
    { label: 'Fuel Min km',   col: 'fuel_min_km' },
    { label: 'Fuel Max km',   col: 'fuel_max_km' },
    { label: 'Tank Cap (L)',  col: 'fuel_tank_l' },
    { label: 'Planned',       col: 'planned_hours' },
  ]

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Machine Registry</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {showInactive ? `${machineCount} deactivated machine${machineCount !== 1 ? 's' : ''}` : `${machineCount} active machine${machineCount !== 1 ? 's' : ''}`}
            {displayed.length !== machines.length ? ` · ${displayed.length} shown` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDownloadModal(true)} disabled={displayed.length === 0}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
            <Download size={14} />Download
          </button>
          <button onClick={() => setShowBulkModal(true)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            <Upload size={14} />Bulk Upload
          </button>
          <button onClick={handleRegenNicknames} disabled={regenLoading}
            title="Re-generate all machine nicknames from current asset data"
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
            <RefreshCw size={14} className={regenLoading ? 'animate-spin' : ''} />
            {regenLoading ? 'Regenerating…' : 'Regen Nicknames'}
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors">
            <Plus size={15} />Add Machine
          </button>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          Failed to load machines: {loadError}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by SL#, type, reg no, project, manufacturer…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>

        {/* Dropdowns row */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter size={13} className="text-gray-400" />
          <select value={filterProj} onChange={e => setFilterProj(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
          </select>

          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Asset Name</option>
            {eqTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>

          <select value={filterOwn} onChange={e => setFilterOwn(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Own &amp; Hire</option>
            <option value="Own">Own only</option>
            <option value="Hire">Hire only</option>
          </select>

          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Measurability</option>
            <option value="Measurable Asset">Measurable</option>
            <option value="Non-Measurable Asset">Non-Measurable</option>
          </select>

          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            <button onClick={() => setShowInactive(false)}
              className={`px-3 py-1.5 transition-colors ${!showInactive ? 'bg-blue-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
              Active
            </button>
            <button onClick={() => setShowInactive(true)}
              className={`px-3 py-1.5 border-l border-gray-300 transition-colors ${showInactive ? 'bg-amber-500 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
              Inactive
            </button>
          </div>

          {(search || filterType || filterOwn || filterCategory) && (
            <button onClick={() => { setSearch(''); setFilterType(''); setFilterOwn(''); setFilterCategory('') }}
              className="text-xs text-blue-600 hover:underline">Clear filters</button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Bulk action toolbar */}
        {selectedCount > 0 && (
          <div className={`px-4 py-2.5 border-b flex items-center justify-between gap-3 flex-wrap ${
            showInactive ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
          }`}>
            <span className={`text-sm font-medium ${showInactive ? 'text-amber-800' : 'text-blue-800'}`}>
              {selectedCount} machine{selectedCount > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {showInactive ? (
                <>
                  <button onClick={handleBulkReactivate} disabled={bulkDeleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
                    <RotateCcw size={13} />{bulkDeleting ? 'Processing…' : `Reactivate ${selectedCount}`}
                  </button>
                  <button onClick={() => setShowBulkDeleteModal(true)} disabled={bulkDeleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
                    <Trash2 size={13} />{bulkDeleting ? 'Deleting…' : `Delete Permanently (${selectedCount})`}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={openBulkTransfer} disabled={bulkDeleting || bulkTransferring}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
                    <ArrowRightLeft size={13} />Transfer to Site
                  </button>
                  <button onClick={handleBulkDeactivate} disabled={bulkDeleting || bulkTransferring}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
                    <PowerOff size={13} />{bulkDeleting ? 'Processing…' : `Deactivate (${selectedCount})`}
                  </button>
                  <button onClick={() => setShowBulkDeleteModal(true)} disabled={bulkDeleting || bulkTransferring}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
                    <Trash2 size={13} />{bulkDeleting ? 'Deleting…' : `Delete Permanently (${selectedCount})`}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {/* Select-all checkbox */}
                <th className="px-3 py-2.5 w-8">
                  <input type="checkbox" checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked }}
                    onChange={toggleAll} className="w-4 h-4 accent-blue-600" />
                </th>
                {HEADERS.map(({ label, col }) => (
                  <th key={col} className={thCls(col)} onClick={() => toggleSort(col)}>
                    <span className="flex items-center">
                      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.length === 0 && (
                <tr><td colSpan={25} className="px-4 py-10 text-center text-gray-400">
                  {search || filterType || filterOwn || filterCategory ? 'No machines match the current filters' : 'No machines found'}
                </td></tr>
              )}
              {displayed.map(m => (
                <tr key={m.id} className={`transition-colors ${
                  !m.active ? 'bg-gray-50 opacity-60' : selected.has(m.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleOne(m.id)}
                      className="w-4 h-4 accent-blue-600" />
                  </td>
                  {/* Project */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded text-xs">{m.project_code}</span>
                  </td>
                  {/* Nickname */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {m.nickname
                      ? <button onClick={() => setDetailPanel(m)}
                          className="text-blue-700 font-medium text-xs hover:text-blue-900 hover:underline text-left">
                          {m.nickname}
                        </button>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  {/* Asset Code */}
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap font-mono text-[11px]">{m.asset_code || '—'}</td>
                  {/* Asset Group */}
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{m.asset_group || '—'}</td>
                  {/* Asset Category */}
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{m.asset_cat || '—'}</td>
                  {/* Asset Name */}
                  <td className="px-3 py-2 whitespace-nowrap">{m.eq_type}</td>
                  {/* Measurability */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {m.asset_type
                      ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m.asset_type === 'Measurable Asset' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>{m.asset_type === 'Measurable Asset' ? 'Measurable' : 'Non-Measurable'}</span>
                      : '—'}
                  </td>
                  {/* Own/Hire */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-xs font-medium ${m.ownership === 'Own' ? 'text-blue-600' : 'text-violet-600'}`}>{m.ownership}</span>
                  </td>
                  {/* Owner Name */}
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {m.ownership === 'Own' ? 'RVR Projects Pvt Ltd' : (m.vendor || '—')}
                  </td>
                  {/* Manufacturer */}
                  <td className="px-3 py-2 whitespace-nowrap">{m.manufacturer || '—'}</td>
                  {/* Model */}
                  <td className="px-3 py-2 whitespace-nowrap">{m.model || '—'}</td>
                  {/* Year */}
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{m.yom || '—'}</td>
                  {/* Capacity */}
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{m.capacity ? `${m.capacity}${m.uom ? ' ' + m.uom : ''}` : '—'}</td>
                  {/* Reg No */}
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]">{m.reg_no || '—'}</td>
                  {/* Machine SL# */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-gray-700 font-semibold text-xs font-mono">{m.slno}</span>
                    {!m.active && (
                      <span className="ml-1.5 text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
                        {m.deactivation_reason || 'Inactive'}
                      </span>
                    )}
                  </td>
                  {/* Chassis No */}
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]">{m.chassis_no || '—'}</td>
                  {/* Engine No */}
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]">{m.engine_no || '—'}</td>
                  {/* Shift */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      m.shift_type === 'Dual Shift' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                    }`}>{m.shift_type || 'Single Shift'}</span>
                  </td>
                  {/* Fuel Min L/hr */}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{m.fuel_min ?? '—'}</td>
                  {/* Fuel Max L/hr */}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{m.fuel_max ?? '—'}</td>
                  {/* Fuel Min km */}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{m.fuel_min_km ?? '—'}</td>
                  {/* Fuel Max km */}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{m.fuel_max_km ?? '—'}</td>
                  {/* Tank Capacity */}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {m.fuel_tank_l != null
                      ? <span className="font-semibold text-blue-700">{m.fuel_tank_l} L</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Planned */}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{m.planned_hours}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 items-center">
                      {m.active ? (
                        <>
                          <button onClick={() => openEdit(m)} title="Edit"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => {
                              setReadingConfigModal({ machine: m })
                              setReadingConfigs([])
                              setReadingConfigLoading(true)
                              getMachineReadingConfigs(m.id)
                                .then(r => setReadingConfigs(r.data.data))
                                .catch(() => {})
                                .finally(() => setReadingConfigLoading(false))
                            }}
                            title="Reading Configs"
                            className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded transition-colors">
                            <Activity size={13} />
                          </button>
                          <button
                            onClick={e => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setActionMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                              setActionMenu(actionMenu === m.id ? null : m.id)
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors">
                            <MoreVertical size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => reactivate(m.id)} title="Reactivate"
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors">
                            <RotateCcw size={13} />
                          </button>
                          <button onClick={() => { setDeleteModal(m); setActionError('') }} title="Permanently Delete"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {displayed.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-right">
            {displayed.length} of {machines.length} machine{machines.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Bulk Upload modal ── */}
      {showBulkModal && (
        <Modal title="Bulk Upload Machines" onClose={closeBulkModal}>
          <div className="space-y-4">

            {/* Step 1 — download template */}
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <span className="w-5 h-5 flex-shrink-0 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold mt-0.5">1</span>
              <div className="flex-1 space-y-2">
                <p className="text-xs font-medium text-gray-700">Download the template, fill in your asset data, then re-upload.</p>
                <p className="text-xs text-gray-500">
                  Required: <strong>Project Code</strong>, <strong>Machine SL#</strong>, <strong>Equipment Type</strong>, <strong>Ownership</strong>, <strong>Shift Type</strong>.
                  Use <em>Fuel Min/Max (kms/ltr)</em> for KM-basis machines. <em>Hire Charges/Day</em> and <em>/Month</em> for Hire assets.
                </p>
                <button onClick={() => downloadAssetTemplate(projects, eqTypes)}
                  className="flex items-center gap-2 px-3 py-1.5 border border-blue-400 text-blue-700 bg-white hover:bg-blue-50 text-xs font-medium rounded-lg transition-colors">
                  <Download size={13} />Download Template (.xlsx)
                </button>
              </div>
            </div>

            {/* Step 2 — upload file */}
            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <span className="w-5 h-5 flex-shrink-0 rounded-full bg-gray-500 text-white text-xs flex items-center justify-center font-bold mt-0.5">2</span>
              <div className="flex-1 space-y-2">
                <p className="text-xs font-medium text-gray-700">Upload the filled template</p>
                <label className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 text-xs font-medium rounded-lg transition-colors cursor-pointer w-fit">
                  <Upload size={13} />
                  {bulkFile ? bulkFile.name : 'Choose .xlsx file…'}
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulkFileChange} />
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
                    <div className="overflow-x-auto rounded border border-gray-200">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-100 text-gray-600">
                          <tr>
                            <th className="px-2 py-1 text-left font-medium">#</th>
                            <th className="px-2 py-1 text-left font-medium">Project</th>
                            <th className="px-2 py-1 text-left font-medium">SL#</th>
                            <th className="px-2 py-1 text-left font-medium">Equipment Type</th>
                            <th className="px-2 py-1 text-left font-medium">Own/Hire</th>
                            <th className="px-2 py-1 text-left font-medium">Shift</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {bulkPreview.items.slice(0, 6).map((item, i) => (
                            <tr key={i} className="bg-white">
                              <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                              <td className="px-2 py-1 font-medium text-blue-700">{item.project_code}</td>
                              <td className="px-2 py-1 font-semibold">{item.slno}</td>
                              <td className="px-2 py-1">{item.eq_type}</td>
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
                    {bulkPreview.items.length > 6 && (
                      <p className="text-xs text-gray-400">…and {bulkPreview.items.length - 6} more</p>
                    )}
                    <div className="flex items-center gap-3 pt-1">
                      <button onClick={handleBulkUpload} disabled={bulkSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors">
                        <Upload size={14} />{bulkSaving ? 'Uploading…' : `Upload ${bulkPreview.items.length} Machine${bulkPreview.items.length !== 1 ? 's' : ''}`}
                      </button>
                      <button onClick={resetBulk} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Clear</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Result */}
            {bulkResult && (
              <div className={`rounded-lg p-3 text-xs space-y-2 ${bulkResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                {bulkResult.error ? (
                  <p className="text-red-700 font-medium">{bulkResult.error}</p>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-green-800">
                          ✓ Upload complete —&nbsp;
                          {[
                            bulkResult.created     > 0 && `${bulkResult.created} new`,
                            bulkResult.updated     > 0 && `${bulkResult.updated} updated`,
                            bulkResult.reactivated > 0 && `${bulkResult.reactivated} reactivated`,
                            bulkResult.failed      > 0 && `${bulkResult.failed} failed`,
                          ].filter(Boolean).join(', ')}
                        </p>
                        {bulkResult.reactivated > 0 && (
                          <p className="text-green-700 mt-0.5">
                            {bulkResult.reactivated} previously deactivated machine{bulkResult.reactivated !== 1 ? 's' : ''} were reactivated and updated.
                          </p>
                        )}
                      </div>
                      <button onClick={() => setBulkResult(null)}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-0.5"><X size={13} /></button>
                    </div>
                    {bulkResult.errors?.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded p-2 space-y-0.5 max-h-32 overflow-y-auto">
                        {bulkResult.errors.map((e, i) => (
                          <p key={i} className="text-amber-700">Row {e.row} ({e.slno || '—'}): {e.error}</p>
                        ))}
                      </div>
                    )}
                    <button onClick={closeBulkModal}
                      className="mt-1 px-4 py-1.5 bg-green-700 text-white font-medium rounded-lg hover:bg-green-800 transition-colors text-xs">
                      Done — Close
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Download modal ── */}
      {showDownloadModal && (
        <MachineDownloadModal
          displayed={displayed}
          filterProj={filterProj}
          onClose={() => setShowDownloadModal(false)}
        />
      )}

      {/* ── Action dropdown (fixed-position to escape overflow-x-auto clipping) ── */}
      {actionMenu && (() => {
        const m = displayed.find(x => x.id === actionMenu)
        if (!m) return null
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setActionMenu(null)} />
            <div
              style={{ top: actionMenuPos.top, right: actionMenuPos.right }}
              className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-48 text-xs">
              <button
                onClick={() => { setActionMenu(null); setDeactivateModal(m); setDeactivateReason(''); setActionError('') }}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-amber-50 text-gray-700">
                <PowerOff size={12} className="text-amber-500" />Deactivate
              </button>
              {m.ownership === 'Own' && (
                <button
                  onClick={() => { setActionMenu(null); setTransferModal(m); setTransferProjectId(''); setActionError('') }}
                  className="flex items-center gap-2 w-full px-3 py-2 hover:bg-blue-50 text-gray-700">
                  <ArrowRightLeft size={12} className="text-blue-500" />Transfer Site
                </button>
              )}
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { setActionMenu(null); setDeleteModal(m); setActionError('') }}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-red-50 text-red-600">
                <Trash2 size={12} />Permanent Delete
              </button>
            </div>
          </>
        )
      })()}

      {/* ── Bulk Transfer modal ── */}
      {showBulkTransfer && (() => {
        const activeSel = [...selected]
          .map(id => displayed.find(m => m.id === id))
          .filter(m => m && m.active)
        const inactiveSel = selectedCount - activeSel.length
        return (
          <Modal title="Bulk Transfer to Another Site"
            onClose={() => { setShowBulkTransfer(false); setBulkTransferResult(null) }}>
            <div className="space-y-4">

              {/* Summary */}
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                <ArrowRightLeft size={15} className="flex-shrink-0 mt-0.5 text-blue-500" />
                <div>
                  <p className="font-semibold">{activeSel.length} active machine{activeSel.length !== 1 ? 's' : ''} will be transferred.</p>
                  {inactiveSel > 0 && (
                    <p className="text-xs text-blue-600 mt-0.5">{inactiveSel} inactive machine{inactiveSel !== 1 ? 's' : ''} in your selection will be skipped.</p>
                  )}
                  <p className="text-xs text-blue-600 mt-0.5">DPR history stays accessible under each machine's original project.</p>
                </div>
              </div>

              {/* Machine list preview */}
              {activeSel.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500">SL#</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500">Type</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500">From</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500">Own/Hire</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activeSel.map(m => (
                        <tr key={m.id} className="bg-white">
                          <td className="px-2 py-1.5 font-semibold">{m.slno}</td>
                          <td className="px-2 py-1.5 text-gray-600">{m.eq_type}</td>
                          <td className="px-2 py-1.5">
                            <span className="bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded">{m.project_code}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            <span className={`font-medium text-xs ${m.ownership === 'Own' ? 'text-blue-600' : 'text-violet-600'}`}>
                              {m.ownership}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Transfer To *</label>
                  <select value={bulkTransferProj} onChange={e => setBulkTransferProj(e.target.value)} className={inp}>
                    <option value="">— select project —</option>
                    {projects
                      .filter(p => !activeSel.every(m => m.project_id === p.id))
                      .map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Transfer Date *</label>
                  <input type="date" value={bulkTransferDate} onChange={e => setBulkTransferDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)} className={inp} />
                </div>
              </div>

              {/* Result */}
              {bulkTransferResult && (
                <div className={`rounded-lg p-3 text-xs space-y-1.5 ${
                  bulkTransferResult.failed > 0 && bulkTransferResult.transferred === 0
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-green-50 border border-green-200'
                }`}>
                  <p className={`font-semibold ${bulkTransferResult.transferred > 0 ? 'text-green-800' : 'text-red-700'}`}>
                    {bulkTransferResult.transferred > 0 && `✓ ${bulkTransferResult.transferred} machine${bulkTransferResult.transferred !== 1 ? 's' : ''} transferred`}
                    {bulkTransferResult.failed > 0 && ` · ${bulkTransferResult.failed} failed`}
                  </p>
                  {bulkTransferResult.errors?.map((e, i) => (
                    <p key={i} className="text-red-600">{e.slno}: {e.error}</p>
                  ))}
                  {bulkTransferResult.transferred > 0 && (
                    <button onClick={() => { setShowBulkTransfer(false); setBulkTransferResult(null) }}
                      className="mt-1 px-4 py-1.5 bg-green-700 text-white font-medium rounded-lg hover:bg-green-800 transition-colors">
                      Done — Close
                    </button>
                  )}
                </div>
              )}

              {!bulkTransferResult && (
                <div className="flex gap-3 pt-1">
                  <button onClick={handleBulkTransfer}
                    disabled={!bulkTransferProj || !bulkTransferDate || bulkTransferring || activeSel.length === 0}
                    className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
                    <ArrowRightLeft size={14} />
                    {bulkTransferring
                      ? 'Transferring…'
                      : `Transfer ${activeSel.length} Machine${activeSel.length !== 1 ? 's' : ''}`}
                  </button>
                  <button onClick={() => setShowBulkTransfer(false)}
                    className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </Modal>
        )
      })()}

      {/* ── Deactivate modal ── */}
      {deactivateModal && (
        <Modal title="Deactivate Machine" onClose={() => { setDeactivateModal(null); setDeactivateReason(''); setActionError('') }}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Deactivating <strong>{deactivateModal.slno}</strong> will hide it from active listings but preserve all DPR history.
              {deactivateModal.ownership === 'Hire' && ' You can reactivate it if the machine is rehired in the future.'}
            </p>
            <div>
              <label className={lbl}>Reason *</label>
              <select value={deactivateReason} onChange={e => setDeactivateReason(e.target.value)} className={inp}>
                <option value="">— select reason —</option>
                {deactivateModal.ownership === 'Hire' && <option value="Dehired">Dehired (returned to vendor)</option>}
                <option value="Idle/Parked">Idle / Parked</option>
                <option value="Under Repair">Sent for Major Repair</option>
                {deactivateModal.ownership === 'Own' && <option value="Sold/Disposed">Sold / Disposed</option>}
                <option value="Other">Other</option>
              </select>
            </div>
            {actionError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{actionError}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={handleDeactivate} disabled={!deactivateReason || actionSaving}
                className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {actionSaving ? 'Deactivating…' : 'Deactivate Machine'}
              </button>
              <button onClick={() => { setDeactivateModal(null); setDeactivateReason(''); setActionError('') }}
                className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Transfer modal ── */}
      {transferModal && (
        <Modal title="Transfer Machine to Another Site" onClose={() => { setTransferModal(null); setTransferProjectId(''); setTransferDate(''); setActionError('') }}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Transferring <strong>{transferModal.slno}</strong> from <strong>{transferModal.project_code}</strong> to another project.
              All past DPR history remains accessible under the original project's reports.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Transfer To *</label>
                <select value={transferProjectId} onChange={e => setTransferProjectId(e.target.value)} className={inp}>
                  <option value="">— select project —</option>
                  {projects
                    .filter(p => p.id !== transferModal.project_id)
                    .map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Transfer Date *</label>
                <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)} className={inp} />
              </div>
            </div>
            {actionError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{actionError}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={handleTransfer} disabled={!transferProjectId || !transferDate || actionSaving}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {actionSaving ? 'Transferring…' : 'Confirm Transfer'}
              </button>
              <button onClick={() => { setTransferModal(null); setTransferProjectId(''); setTransferDate(''); setActionError('') }}
                className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Permanent Delete modal ── */}
      {deleteModal && (
        <Modal title="Permanently Delete Machine" onClose={() => { setDeleteModal(null); setActionError('') }}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 space-y-1">
                <p className="font-semibold">This action cannot be undone.</p>
                <p>
                  Permanently deleting <strong>{deleteModal.slno}</strong> removes the machine record from the database.
                  Existing DPR, fuel, and service history entries are preserved but will no longer be linked to this machine.
                </p>
              </div>
            </div>
            {actionError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{actionError}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={handleHardDelete} disabled={actionSaving}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {actionSaving ? 'Deleting…' : 'Permanently Delete'}
              </button>
              <button onClick={() => { setDeleteModal(null); setActionError('') }}
                className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Bulk Delete confirmation modal ── */}
      {showBulkDeleteModal && (() => {
        const targets = [...selected]
          .map(id => displayed.find(m => m.id === id))
          .filter(Boolean)
        return (
          <Modal title="Permanently Delete Assets" onClose={() => setShowBulkDeleteModal(false)}>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <ShieldAlert size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700 space-y-1">
                  <p className="font-semibold">This action cannot be undone.</p>
                  <p>
                    Permanently deletes <strong>{targets.length} asset{targets.length !== 1 ? 's' : ''}</strong> from the database.
                    DPR, fuel, and service history entries are preserved but will no longer be linked to these machines.
                  </p>
                </div>
              </div>

              {/* Asset list */}
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">SL#</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Type</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Project</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Own/Hire</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {targets.map(m => (
                      <tr key={m.id} className="bg-white">
                        <td className="px-3 py-2 font-semibold text-gray-800">{m.slno}</td>
                        <td className="px-3 py-2 text-gray-600">{m.eq_type}</td>
                        <td className="px-3 py-2">
                          <span className="bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded">{m.project_code}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`font-medium ${m.ownership === 'Own' ? 'text-blue-600' : 'text-violet-600'}`}>{m.ownership}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                            {m.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={handleBulkHardDelete} disabled={bulkDeleting}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                  <Trash2 size={14} />
                  {bulkDeleting ? 'Deleting…' : `Delete ${targets.length} Asset${targets.length !== 1 ? 's' : ''} Permanently`}
                </button>
                <button onClick={() => setShowBulkDeleteModal(false)}
                  className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* ── Add / Edit modal ── */}
      {modal && (
        <Modal title={modal === 'add' ? 'Add Machine' : 'Edit Machine'} onClose={() => setModal(null)}>
          <div className="space-y-4">

            {/* Identification */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 pb-1">Identification</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Project *</label>
                <select value={form.project_id} onChange={set('project_id')} className={inp} required>
                  <option value="">— select —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Equipment Type *</label>
                <select value={form.eq_type} onChange={set('eq_type')} className={inp} required>
                  <option value="">— select —</option>
                  {eqTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
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
                <label className={lbl}>Asset Code</label>
                <input type="text" value={form.asset_code} onChange={set('asset_code')} className={inp} placeholder="e.g. AST-001" />
                <p className="text-xs text-gray-400 mt-0.5">Should be unique across all machines</p>
              </div>
              <div>
                <label className={lbl}>Machine SL# *</label>
                <input type="text" value={form.slno} onChange={set('slno')} className={inp} placeholder="e.g. E6-EX-02" required />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={lbl + ' mb-0'}>Nickname</label>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, nickname: autoNickname(f) }))}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-0.5 rounded hover:bg-blue-50 transition-colors">
                  ⚡ Auto-generate
                </button>
              </div>
              <input type="text" value={form.nickname} onChange={set('nickname')} className={inp}
                placeholder="e.g. 125 KVA Genset-10 or Tipper-TS076789" />
              <p className="text-xs text-gray-400 mt-0.5">Short friendly label for easy identification. Click Auto-generate to fill from asset details.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>Registration No</label>
                <input type="text" value={form.reg_no} onChange={set('reg_no')} className={inp} />
              </div>
              <div>
                <label className={lbl}>Chassis No</label>
                <input type="text" value={form.chassis_no} onChange={set('chassis_no')} className={inp} />
              </div>
              <div>
                <label className={lbl}>Engine No</label>
                <input type="text" value={form.engine_no} onChange={set('engine_no')} className={inp} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Capacity</label>
                <input type="text" value={form.capacity} onChange={set('capacity')} className={inp} placeholder="e.g. 20" />
              </div>
              <div>
                <label className={lbl}>UOM</label>
                <select value={form.uom} onChange={set('uom')} className={inp}>
                  <option value="">— select —</option>
                  {uomList.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={lbl}>Fuel Type</label>
              <select value={form.fuel_type} onChange={set('fuel_type')} className={inp + ' max-w-xs'}>
                {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>

            {/* Ownership */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 pb-1 pt-1">Ownership</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Ownership</label>
                <select value={form.ownership} onChange={set('ownership')} className={inp}>
                  <option>Own</option><option>Hire</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Shift Type *</label>
                <select value={form.shift_type} onChange={set('shift_type')} className={inp} required>
                  <option value="">— select shift —</option>
                  {SHIFT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {form.ownership === 'Own' && (
              <div>
                <label className={lbl}>
                  Asset Classification
                  {form.eq_type && eqTypes.find(t => t.name === form.eq_type)?.asset_category && (
                    <span className="ml-2 font-normal text-emerald-600">(auto-filled)</span>
                  )}
                </label>
                <select value={form.asset_type} onChange={set('asset_type')} className={inp}>
                  {ASSET_TYPES.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            )}

            {form.ownership === 'Hire' && (
              <>
                <div>
                  <label className={lbl}>Vendor</label>
                  <input type="text" value={form.vendor} onChange={set('vendor')} className={inp} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>Hire Charges/Day (₹)</label><input type="number" step="0.01" value={form.rate} onChange={set('rate')} className={inp} placeholder="e.g. 15000" /></div>
                  <div><label className={lbl}>Hire Charges/Month (₹)</label><input type="number" step="0.01" value={form.rate_monthly} onChange={set('rate_monthly')} className={inp} placeholder="e.g. 350000" /></div>
                </div>
              </>
            )}

            {/* Purchase Details (Own only) */}
            {form.ownership === 'Own' && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 pb-1 pt-1">Purchase Details</p>
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 pb-1 pt-1">Operational Settings</p>
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
              <div><label className={lbl}>Fuel Min (L/hr)</label><input type="number" step="0.1" value={form.fuel_min} onChange={set('fuel_min')} className={inp} placeholder="e.g. 1.5" /></div>
              <div><label className={lbl}>Fuel Max (L/hr)</label><input type="number" step="0.1" value={form.fuel_max} onChange={set('fuel_max')} className={inp} placeholder="e.g. 3.0" /></div>
              <div>
                <label className={lbl}>
                  Fuel Tank Capacity (L)
                  <span className="ml-1 text-blue-500 font-normal">← for HSD validation</span>
                </label>
                <input type="number" step="1" min="0" value={form.fuel_tank_l} onChange={set('fuel_tank_l')} className={inp} placeholder="e.g. 450" />
              </div>
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

            <div className="flex gap-3 pt-1">
              <button onClick={save} disabled={saving}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setModal(null)}
                className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Machine Detail Panel ── */}
      {detailPanel && (
        <MachineDetailPanel
          machine={detailPanel}
          onClose={() => { setDetailPanel(null); setDetailInitialTab(null) }}
          onEdit={() => { openEdit(detailPanel); setDetailPanel(null); setDetailInitialTab(null) }}
          initialRightTab={detailInitialTab}
        />
      )}

      {/* ── Reading Configs modal ── */}
      {readingConfigModal && (
        <Modal
          title={`Reading Configs — ${readingConfigModal.machine.slno}`}
          onClose={() => { setReadingConfigModal(null); setReadingConfigs([]) }}
        >
          <div className="space-y-4">
            {readingConfigLoading ? (
              <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
            ) : readingConfigs.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <p className="text-sm text-gray-500">No reading configs found for this machine.</p>
                <p className="text-xs text-gray-400">This equipment type may not have reading mappings defined yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                {readingConfigs.map(cfg => (
                  <div key={cfg.id} className="flex items-center justify-between px-3 py-2.5 bg-white">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{cfg.code}</p>
                      <p className="text-xs text-gray-500">{cfg.reading_name} · {cfg.unit}</p>
                    </div>
                    <button
                      onClick={async () => {
                        if (toggleLoading === cfg.id) return
                        setToggleLoading(cfg.id)
                        try {
                          await toggleMachineReadingConfig(cfg.id, { is_active: !cfg.is_active })
                          setReadingConfigs(prev => prev.map(c => c.id === cfg.id ? { ...c, is_active: !c.is_active } : c))
                        } catch (_) {}
                        setToggleLoading(null)
                      }}
                      disabled={toggleLoading === cfg.id}
                      className="flex-shrink-0 ml-3"
                      title={cfg.is_active ? 'Disable' : 'Enable'}
                    >
                      {cfg.is_active
                        ? <ToggleRight size={22} className="text-blue-600" />
                        : <ToggleLeft  size={22} className="text-gray-300" />
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={async () => {
                  setReadingConfigResetting(true)
                  try {
                    await resetMachineReadingConfigs(readingConfigModal.machine.id)
                    const r = await getMachineReadingConfigs(readingConfigModal.machine.id)
                    setReadingConfigs(r.data.data)
                    load()
                  } catch (_) {}
                  setReadingConfigResetting(false)
                }}
                disabled={readingConfigResetting}
                className="flex items-center gap-2 px-4 py-2 border border-violet-300 text-violet-700 hover:bg-violet-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
              >
                <RefreshCw size={13} className={readingConfigResetting ? 'animate-spin' : ''} />
                {readingConfigResetting ? 'Resetting…' : 'Reset to Defaults'}
              </button>
              <button
                onClick={() => { setReadingConfigModal(null); setReadingConfigs([]) }}
                className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
