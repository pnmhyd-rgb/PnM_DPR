import { useState, useEffect, useRef } from 'react'
import {
  getProjects, getUsers, createUser, bulkCreateUsers, updateUser, deleteUser,
  getDesignations, createDesignation
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import {
  Plus, Edit2, Trash2, X, Phone, Mail, Briefcase, Shield,
  Upload, Download, Search, Filter, CheckCircle, AlertCircle,
  MoreVertical, Eye, MapPin, Calendar, Clock, UserCheck, UserX, Link, Unlink
} from 'lucide-react'

/* ── constants ── */
const ROLES = [
  { value: 'operator',      label: 'Operator' },
  { value: 'site_incharge', label: 'Site Incharge' },
  { value: 'admin',         label: 'Admin' },
]
const ROLE_BADGE = {
  admin:         'bg-red-100 text-red-700',
  site_incharge: 'bg-amber-100 text-amber-700',
  operator:      'bg-blue-100 text-blue-700',
}
const STATUS_BADGE = {
  active:     'bg-green-100 text-green-700',
  idle:       'bg-yellow-100 text-yellow-700',
  inactive:   'bg-gray-100 text-gray-500',
  unverified: 'bg-purple-100 text-purple-700',
}
const STATUS_LABELS = {
  active:     'Active',
  idle:       'Idle',
  inactive:   'Inactive',
  unverified: 'Unverified',
}

const CSV_HEADERS = ['name','username','mobile','email','designation','role','sites','password','can_add_assets']
const CSV_EXAMPLE = ['John Doe','john.doe','9876543210','john@company.com','Site Engineer','operator','PRJ01,PRJ02','Pass@123','false']

function downloadTemplate() {
  const csv  = [CSV_HEADERS.join(','), CSV_EXAMPLE.join(',')].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = 'users_bulk_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const hdrs = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const obj  = {}
    hdrs.forEach((h, i) => { obj[h] = vals[i] || '' })
    return obj
  })
}

/* ── status helper ── */
function userStatus(u) {
  if (!u.last_login_at) return 'unverified'
  const days = (Date.now() - new Date(u.last_login_at)) / 86400000
  if (days <= 3)  return 'active'
  if (days <= 30) return 'idle'
  return 'inactive'
}

const blank = {
  name: '', username: '', mobile: '', email: '',
  designation: '', password: '', role: 'operator',
  project_codes: [], all_sites: false, can_add_assets: false,
}

/* ══════════════════════════════════════════════ */
export default function Users() {
  const { isAdmin } = useAuth()

  const [projects,     setProjects]     = useState([])
  const [users,        setUsers]        = useState([])
  const [designations, setDesignations] = useState([])

  // modals
  const [modal,     setModal]     = useState(null)   // null | 'add' | { edit: u }
  const [bulkOpen,  setBulkOpen]  = useState(false)
  const [viewUser,  setViewUser]  = useState(null)   // user object for view panel
  const [menuUserId, setMenuUserId] = useState(null) // three-dots dropdown

  // form
  const [form,       setForm]       = useState(blank)
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')
  const [newDesig,   setNewDesig]   = useState('')
  const [addingDesig,setAddingDesig]= useState(false)

  // site linking in view panel
  const [togglingCode, setTogglingCode] = useState(null)
  const [siteError,    setSiteError]    = useState('')

  // bulk
  const fileRef                       = useRef()
  const [bulkRows,   setBulkRows]   = useState([])
  const [bulkResult, setBulkResult] = useState(null)
  const [bulking,    setBulking]    = useState(false)

  // search / filter
  const [search,    setSearch]    = useState('')
  const [fRole,     setFRole]     = useState('')
  const [fSite,     setFSite]     = useState('')
  const [fStatus,   setFStatus]   = useState('')

  const load = () => getUsers().then(r => setUsers(r.data.data))

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data))
    getDesignations().then(r => setDesignations(r.data.data)).catch(() => {})
    load()
  }, [])

  /* ── filtering ── */
  const filtered = users.filter(u => {
    const q  = search.toLowerCase()
    const st = userStatus(u)
    if (q && !u.name.toLowerCase().includes(q) &&
              !u.username.toLowerCase().includes(q) &&
              !(u.mobile || '').includes(q)) return false
    if (fRole   && u.role !== fRole)  return false
    if (fSite   && !(u.project_codes || []).includes(fSite)) return false
    if (fStatus && st !== fStatus)    return false
    return true
  })

  /* ── form helpers ── */
  const set = k => e => setForm(f => ({
    ...f,
    [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }))

  const toggleSite = code => setForm(f => ({
    ...f,
    project_codes: f.project_codes.includes(code)
      ? f.project_codes.filter(c => c !== code)
      : [...f.project_codes, code],
  }))

  const handleRoleChange = e => {
    const role = e.target.value
    setForm(f => ({
      ...f, role,
      all_sites:     role === 'admin',
      project_codes: role === 'admin' ? projects.map(p => p.code) : [],
    }))
  }

  const handleAllSites = e => setForm(f => ({
    ...f,
    all_sites:     e.target.checked,
    project_codes: e.target.checked ? projects.map(p => p.code) : [],
  }))

  const handleAddDesignation = async () => {
    if (!newDesig.trim()) return
    setAddingDesig(true)
    try {
      const res = await createDesignation({ name: newDesig.trim() })
      setDesignations(prev => [...prev, res.data.data].sort((a,b) => a.name.localeCompare(b.name)))
      setForm(f => ({ ...f, designation: newDesig.trim() }))
      setNewDesig('')
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to add designation')
    } finally { setAddingDesig(false) }
  }

  const validate = () => {
    if (!form.name.trim())        return 'Full name is required'
    if (!form.username.trim())    return 'Username is required'
    if (!form.mobile.trim())      return 'Mobile number is required'
    if (!form.email.trim())       return 'Email ID is required'
    if (!form.designation.trim()) return 'Designation is required'
    if (modal === 'add' && !form.password) return 'Password is required'
    if (!form.role)               return 'Role is required'
    if (form.role !== 'admin' && form.project_codes.length === 0)
      return 'At least one site must be linked'
    return null
  }

  const openAdd = () => { setForm(blank); setFormError(''); setModal('add') }
  const openEdit = u => {
    setForm({
      name: u.name, username: u.username, mobile: u.mobile || '',
      email: u.email || '', designation: u.designation || '',
      password: '', role: u.role,
      project_codes: u.project_codes || [],
      all_sites: u.role === 'admin',
      can_add_assets: u.can_add_assets || false,
    })
    setFormError(''); setModal({ edit: u })
  }

  const save = async () => {
    const err = validate(); if (err) { setFormError(err); return }
    setSaving(true); setFormError('')
    try {
      const payload = {
        name: form.name.trim(), username: form.username.trim(),
        mobile: form.mobile.trim(), email: form.email.trim(),
        designation: form.designation.trim(), role: form.role,
        project_codes: form.role === 'admin' ? projects.map(p => p.code) : form.project_codes,
        can_add_assets: form.can_add_assets,
      }
      if (form.password) payload.password = form.password
      modal === 'add' ? await createUser(payload) : await updateUser(modal.edit.id, payload)
      setModal(null); load()
    } catch (err) {
      setFormError(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  const del = async id => {
    if (!confirm('Deactivate this user?')) return
    await deleteUser(id); load()
  }

  /* ── site linking from view panel ── */
  const toggleUserSite = async (code) => {
    if (!viewUser || togglingCode) return
    setSiteError('')
    setTogglingCode(code)
    const current = viewUser.project_codes || []
    const newCodes = current.includes(code)
      ? current.filter(c => c !== code)
      : [...current, code]
    try {
      const res = await updateUser(viewUser.id, { project_codes: newCodes })
      const updated = res.data.data
      setViewUser(updated)
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    } catch (err) {
      setSiteError(err.response?.data?.error || 'Failed to update site access')
    } finally { setTogglingCode(null) }
  }

  /* ── bulk ── */
  const handleFileChange = e => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setBulkRows(parseCSV(ev.target.result)); setBulkResult(null) }
    reader.readAsText(file); e.target.value = ''
  }

  const handleBulkUpload = async () => {
    if (!bulkRows.length) return
    setBulking(true); setBulkResult(null)
    try {
      const res = await bulkCreateUsers(bulkRows)
      setBulkResult(res.data)
      if (res.data.created > 0) load()
    } catch (err) {
      setBulkResult({ error: err.response?.data?.error || 'Upload failed' })
    } finally { setBulking(false) }
  }

  /* ── styles ── */
  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  /* ══════════════════════════════════════════════ */
  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">Users</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setBulkOpen(true); setBulkRows([]); setBulkResult(null) }}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 bg-white text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Upload size={14} />Bulk Upload
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors"
          >
            <Plus size={14} />Add User
          </button>
        </div>
      </div>

      {/* ── Search & Filters ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap gap-2 items-center">
        <Filter size={14} className="text-gray-400 flex-shrink-0" />

        <div className="relative flex-1 min-w-44">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, username, mobile…"
            className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select value={fRole} onChange={e => setFRole(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>

        <select value={fSite} onChange={e => setFSite(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Sites</option>
          {projects.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
        </select>

        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Statuses</option>
          <option value="active">Active — logged in within 3 days</option>
          <option value="idle">Idle — 3–30 days no login</option>
          <option value="inactive">Inactive — 30+ days no login</option>
          <option value="unverified">Unverified — never logged in</option>
        </select>

        {(search || fRole || fSite || fStatus) && (
          <button
            onClick={() => { setSearch(''); setFRole(''); setFSite(''); setFStatus('') }}
            className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors flex-shrink-0"
          >Clear</button>
        )}

        <span className="ml-auto text-xs text-gray-400 flex-shrink-0">
          {filtered.length} / {users.length} user{users.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Name','Username','Mobile','Email','Designation','Role','Sites','Status','Last Login','Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">
                  {users.length === 0 ? 'No users yet' : 'No users match the current filters'}
                </td></tr>
              )}
              {filtered.map(u => {
                const st = userStatus(u)
                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">{u.name}</td>
                    <td className="px-3 py-2.5 text-gray-500">@{u.username}</td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{u.mobile || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-36 truncate">{u.email || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{u.designation || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLES.find(r => r.value === u.role)?.label || u.role}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-40 truncate">
                      {u.role === 'admin'
                        ? <span className="text-green-600 font-medium">All Sites</span>
                        : (u.project_codes?.join(', ') || '—')}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[st]}`}>
                        {STATUS_LABELS[st]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
                        : <span className="text-purple-400">Never</span>}
                    </td>

                    {/* ── Three-dots action menu ── */}
                    <td className="px-3 py-2.5 relative">
                      <button
                        onClick={() => setMenuUserId(menuUserId === u.id ? null : u.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreVertical size={14} />
                      </button>
                      {menuUserId === u.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuUserId(null)} />
                          <div className="absolute right-2 top-8 z-20 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-36 overflow-hidden">
                            <button
                              onClick={() => { setViewUser(u); setSiteError(''); setMenuUserId(null) }}
                              className="w-full px-4 py-2.5 text-left text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
                            >
                              <Eye size={12} />View Details
                            </button>
                            <button
                              onClick={() => { openEdit(u); setMenuUserId(null) }}
                              className="w-full px-4 py-2.5 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                            >
                              <Edit2 size={12} />Edit User
                            </button>
                            <div className="border-t border-gray-100 my-0.5" />
                            <button
                              onClick={() => { del(u.id); setMenuUserId(null) }}
                              className="w-full px-4 py-2.5 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                            >
                              <UserX size={12} />Deactivate
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ VIEW USER PANEL ══ */}
      {viewUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                  {viewUser.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">{viewUser.name}</h2>
                  <p className="text-xs text-gray-400">@{viewUser.username}</p>
                </div>
              </div>
              <button onClick={() => setViewUser(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={18} />
              </button>
            </div>

            {/* Body — two columns */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">

                {/* Left — User Details */}
                <div className="p-6 space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">User Details</p>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Phone size={14} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">Mobile</p>
                        <p className="text-sm font-medium text-gray-800">{viewUser.mobile || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail size={14} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">Email</p>
                        <p className="text-sm font-medium text-gray-800">{viewUser.email || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Briefcase size={14} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">Designation</p>
                        <p className="text-sm font-medium text-gray-800">{viewUser.designation || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Shield size={14} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">Role</p>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[viewUser.role] || 'bg-gray-100 text-gray-600'}`}>
                          {ROLES.find(r => r.value === viewUser.role)?.label || viewUser.role}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <UserCheck size={14} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">Status</p>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[userStatus(viewUser)]}`}>
                          {STATUS_LABELS[userStatus(viewUser)]}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock size={14} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">Last Login</p>
                        <p className="text-sm font-medium text-gray-800">
                          {viewUser.last_login_at
                            ? new Date(viewUser.last_login_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
                            : <span className="text-purple-500">Never logged in</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar size={14} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">Created</p>
                        <p className="text-sm font-medium text-gray-800">
                          {viewUser.created_at
                            ? new Date(viewUser.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
                            : '—'}
                        </p>
                      </div>
                    </div>
                    {viewUser.can_add_assets && (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <CheckCircle size={13} className="text-green-600" />
                        <span className="text-xs text-green-700 font-medium">Can add assets to Asset Register</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right — Site Access */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Site Access</p>
                    {viewUser.role !== 'admin' && (
                      <span className="text-xs text-gray-400">
                        {(viewUser.project_codes || []).length} / {projects.length} linked
                      </span>
                    )}
                  </div>

                  {viewUser.role === 'admin' ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                      <CheckCircle size={14} className="text-green-600" />
                      <span className="text-sm text-green-700 font-medium">Admin — Access to all sites</span>
                    </div>
                  ) : projects.length === 0 ? (
                    <p className="text-xs text-gray-400">No projects configured.</p>
                  ) : (
                    <>
                      {isAdmin && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Link size={11} />Click a site card to link or delink
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {projects.map(p => {
                          const linked  = (viewUser.project_codes || []).includes(p.code)
                          const loading = togglingCode === p.code
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={!isAdmin || !!togglingCode}
                              onClick={() => isAdmin && toggleUserSite(p.code)}
                              className={`relative flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs text-left transition-all
                                ${linked
                                  ? 'border-blue-400 bg-blue-50 text-blue-800'
                                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'}
                                ${isAdmin && !togglingCode ? 'cursor-pointer' : 'cursor-default'}
                                ${loading ? 'opacity-60' : ''}
                              `}
                            >
                              <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 transition-colors ${linked ? 'bg-blue-500' : 'bg-gray-300'}`} />
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold">{p.code}</p>
                                <p className="truncate text-gray-400">{p.name}</p>
                              </div>
                              {isAdmin && (
                                <span className={`flex-shrink-0 ${linked ? 'text-blue-400' : 'text-gray-300'}`}>
                                  {loading
                                    ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    : linked
                                      ? <Link size={11} />
                                      : <Unlink size={11} />
                                  }
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                      {siteError && (
                        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{siteError}</p>
                      )}
                      {!isAdmin && (
                        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg flex items-center gap-1.5">
                          <Shield size={11} />Only admins can modify site access
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3 flex-shrink-0">
              <button
                onClick={() => { openEdit(viewUser); setViewUser(null) }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors"
              >
                <Edit2 size={14} />Edit User
              </button>
              <button
                onClick={() => { del(viewUser.id); setViewUser(null) }}
                className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50 transition-colors"
              >
                <UserX size={14} />Deactivate
              </button>
              <button
                onClick={() => setViewUser(null)}
                className="ml-auto px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ADD / EDIT MODAL ══ */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="font-semibold text-gray-900">{modal === 'add' ? 'Add User' : 'Edit User'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className={lbl}>Full Name *</label>
                <input type="text" value={form.name} onChange={set('name')} className={inp} placeholder="e.g. Rajesh Kumar" />
              </div>

              <div>
                <label className={lbl}>Username * <span className="font-normal text-gray-400">(used for login)</span></label>
                <input type="text" value={form.username} onChange={set('username')}
                  className={inp + (modal !== 'add' ? ' bg-gray-50 text-gray-400' : '')}
                  readOnly={modal !== 'add'} autoCapitalize="none" placeholder="e.g. rajesh.kumar" />
                {modal !== 'add' && <p className="text-xs text-gray-400 mt-1">Username cannot be changed.</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}><span className="flex items-center gap-1"><Phone size={10} />Mobile Number *</span></label>
                  <input type="tel" value={form.mobile} onChange={set('mobile')} className={inp} placeholder="9876543210" />
                </div>
                <div>
                  <label className={lbl}><span className="flex items-center gap-1"><Mail size={10} />Email ID *</span></label>
                  <input type="email" value={form.email} onChange={set('email')} className={inp} placeholder="name@company.com" />
                </div>
              </div>

              <div>
                <label className={lbl}><span className="flex items-center gap-1"><Briefcase size={10} />Designation *</span></label>
                <div className="flex gap-2">
                  <select value={form.designation} onChange={set('designation')} className={inp}>
                    <option value="">— select —</option>
                    {designations.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                  <input type="text" value={newDesig} onChange={e => setNewDesig(e.target.value)}
                    placeholder="New…" onKeyDown={e => e.key === 'Enter' && handleAddDesignation()}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-xs w-20 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0" />
                  <button onClick={handleAddDesignation} disabled={addingDesig || !newDesig.trim()}
                    className="px-2 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex-shrink-0">
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              <div>
                <label className={lbl}><span className="flex items-center gap-1"><Shield size={10} />Role *</span></label>
                <select value={form.role} onChange={handleRoleChange} className={inp}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {form.role === 'admin' ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-800">Admin — Site Access</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.all_sites} onChange={handleAllSites} className="rounded border-gray-300" />
                    <span className="text-sm text-gray-700 select-none">Link to All Sites (recommended for Admin)</span>
                  </label>
                  {form.all_sites
                    ? <p className="text-xs text-amber-700 ml-6">All {projects.length} site{projects.length !== 1 ? 's' : ''}: {projects.map(p => p.code).join(', ')}</p>
                    : (
                      <div className="grid grid-cols-3 gap-1.5 ml-6">
                        {projects.map(p => (
                          <button key={p.id} type="button" onClick={() => toggleSite(p.code)}
                            className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                              form.project_codes.includes(p.code) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}>{p.code}</button>
                        ))}
                      </div>
                    )
                  }
                </div>
              ) : (
                <div>
                  <label className={lbl}>Sites to Link * <span className="font-normal text-gray-400">(select at least one)</span></label>
                  {projects.length === 0
                    ? <p className="text-xs text-gray-400">No projects yet. Create projects in Admin → Projects first.</p>
                    : (
                      <div className="grid grid-cols-2 gap-2 mt-1 max-h-44 overflow-y-auto pr-1">
                        {projects.map(p => (
                          <button key={p.id} type="button" onClick={() => toggleSite(p.code)}
                            className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-colors ${
                              form.project_codes.includes(p.code) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                            }`}>
                            <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${form.project_codes.includes(p.code) ? 'bg-blue-500' : 'bg-gray-300'}`} />
                            <div className="min-w-0">
                              <p className="font-semibold">{p.code}</p>
                              <p className="text-gray-400 truncate">{p.name}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )
                  }
                  {form.project_codes.length > 0 && (
                    <p className="text-xs text-blue-600 mt-1">{form.project_codes.length} site{form.project_codes.length !== 1 ? 's' : ''} selected</p>
                  )}
                </div>
              )}

              {form.role !== 'admin' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.can_add_assets} onChange={set('can_add_assets')} className="rounded border-gray-300" />
                  <span className="text-sm text-gray-700 select-none">Allow this user to add assets to the Asset Register</span>
                </label>
              )}

              <div>
                <label className={lbl}>{modal === 'add' ? 'Password *' : 'New Password'}</label>
                <input type="password" value={form.password} onChange={set('password')} className={inp}
                  placeholder={modal !== 'add' ? 'Leave blank to keep current' : ''} />
              </div>

              {formError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex gap-3 flex-shrink-0">
              <button onClick={save} disabled={saving}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Saving…' : modal === 'add' ? 'Create User' : 'Save Changes'}
              </button>
              <button onClick={() => setModal(null)}
                className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ BULK UPLOAD MODAL ══ */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="font-semibold text-gray-900">Bulk Upload Users</h2>
              <button onClick={() => setBulkOpen(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-blue-800">Step 1 — Download Template</p>
                <p className="text-xs text-blue-700">
                  Download the CSV template. Fill columns: <span className="font-mono">{CSV_HEADERS.join(', ')}</span>.
                  For multiple sites, separate codes with commas inside the cell.
                </p>
                <button onClick={downloadTemplate}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-xs rounded-lg hover:bg-blue-800 transition-colors">
                  <Download size={13} />Download Template (CSV)
                </button>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-gray-700">Step 2 — Upload Filled CSV</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-300 bg-white text-gray-700 text-xs rounded-lg hover:bg-gray-50 transition-colors">
                  <Upload size={13} />Choose CSV File
                </button>
                {bulkRows.length > 0 && (
                  <p className="text-xs text-green-700 font-medium">{bulkRows.length} row{bulkRows.length !== 1 ? 's' : ''} loaded</p>
                )}
              </div>

              {bulkRows.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <p className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-200">Preview</p>
                  <div className="overflow-x-auto max-h-44">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          {['#','Name','Username','Mobile','Role','Sites','Designation'].map(h => (
                            <th key={h} className="px-3 py-1.5 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bulkRows.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-400">{i+1}</td>
                            <td className="px-3 py-1.5">{r.name}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.username}</td>
                            <td className="px-3 py-1.5">{r.mobile}</td>
                            <td className="px-3 py-1.5">{r.role}</td>
                            <td className="px-3 py-1.5">{r.sites}</td>
                            <td className="px-3 py-1.5">{r.designation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {bulkResult && (
                <div className={`rounded-xl p-4 space-y-2 ${bulkResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                  {bulkResult.error
                    ? <p className="text-sm text-red-700 font-medium flex items-center gap-2"><AlertCircle size={15} />{bulkResult.error}</p>
                    : <>
                        <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                          <CheckCircle size={15} />{bulkResult.created} created, {bulkResult.failed} failed
                        </p>
                        {bulkResult.errors?.length > 0 && (
                          <ul className="text-xs text-red-700 space-y-0.5">
                            {bulkResult.errors.map((e, i) => (
                              <li key={i}>Row {e.row} (@{e.username}): {e.error}</li>
                            ))}
                          </ul>
                        )}
                      </>
                  }
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex gap-3 flex-shrink-0">
              <button onClick={handleBulkUpload} disabled={bulking || bulkRows.length === 0}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
                <Upload size={15} />{bulking ? 'Uploading…' : `Upload ${bulkRows.length > 0 ? `${bulkRows.length} Users` : ''}`}
              </button>
              <button onClick={() => setBulkOpen(false)}
                className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
