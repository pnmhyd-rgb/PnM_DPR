import { useState, useEffect, useCallback } from 'react'
import { getProjects, getUsers, getSitePermissions, saveSitePermissions } from '../../lib/api'
import { Shield, Save, Loader2, CheckCircle, Building2, Search, Users } from 'lucide-react'

const MODULE_GROUPS = [
  {
    group: 'Asset Management',
    modules: [
      { key: 'asset_master',      label: 'Asset Master' },
      { key: 'asset_compliance',  label: 'Asset Compliance' },
      { key: 'asset_documents',   label: 'Asset Documents' },
      { key: 'counter_log_reset', label: 'Reset Counter Log' },
    ],
  },
  {
    group: 'DPR Operations',
    modules: [
      { key: 'dpr_log_entry',   label: 'DPR Log Entry' },
      { key: 'fuel_issue',      label: 'Fuel Issue' },
      { key: 'service_records', label: 'Service Records' },
    ],
  },
  {
    group: 'Reports',
    modules: [
      { key: 'report_utilization',  label: 'Utilization Report' },
      { key: 'report_summary',      label: 'Summary Report' },
      { key: 'report_dpr_download', label: 'DPR Download' },
      { key: 'report_breakdown',    label: 'Breakdown Report' },
    ],
  },
  {
    group: 'Hire',
    modules: [
      { key: 'hire_indents',     label: 'Hire Indents' },
      { key: 'hire_work_orders', label: 'Hire Work Orders' },
      { key: 'hire_billing',     label: 'Hire Billing' },
    ],
  },
  {
    group: 'HR',
    modules: [
      { key: 'hr_operators',  label: 'Operators' },
      { key: 'hr_attendance', label: 'Attendance' },
      { key: 'hr_payroll',    label: 'Payroll' },
    ],
  },
  {
    group: 'Inventory',
    modules: [
      { key: 'inventory_spare_parts', label: 'Spare Parts' },
    ],
  },
]

const PERM_COLS = [
  { key: 'full_access', label: 'Full Access' },
  { key: 'can_view',    label: 'View' },
  { key: 'can_add',     label: 'Add' },
  { key: 'can_edit',    label: 'Edit' },
  { key: 'can_delete',  label: 'Delete' },
]

const ROLE_BADGE = {
  admin:         'bg-red-100 text-red-700',
  site_incharge: 'bg-amber-100 text-amber-700',
  operator:      'bg-blue-100 text-blue-700',
}

function emptyPerms() {
  const p = {}
  for (const g of MODULE_GROUPS)
    for (const m of g.modules)
      p[m.key] = { full_access: false, can_view: false, can_add: false, can_edit: false, can_delete: false }
  return p
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

export default function Permissions() {
  const [projects,      setProjects]      = useState([])
  const [allUsers,      setAllUsers]      = useState([])
  const [search,        setSearch]        = useState('')
  const [selectedSite,  setSelectedSite]  = useState(null)
  const [perms,         setPerms]         = useState(emptyPerms())
  const [loading,       setLoading]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [saved,         setSaved]         = useState(false)
  const [error,         setError]         = useState('')

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.data || [])).catch(() => {})
    getUsers().then(r => setAllUsers(r.data.data || [])).catch(() => {})
  }, [])

  const siteUsers = (site) =>
    allUsers.filter(u => Array.isArray(u.project_codes) && u.project_codes.includes(site.code))

  const loadPerms = useCallback(async (site) => {
    setSelectedSite(site)
    setLoading(true)
    setError('')
    setSaved(false)
    try {
      const r = await getSitePermissions(site.code)
      const base = emptyPerms()
      const saved = r.data.data || {}
      for (const key of Object.keys(base)) {
        if (saved[key]) base[key] = {
          full_access: !!saved[key].full_access,
          can_view:    !!saved[key].can_view,
          can_add:     !!saved[key].can_add,
          can_edit:    !!saved[key].can_edit,
          can_delete:  !!saved[key].can_delete,
        }
      }
      setPerms(base)
    } catch {
      setError('Failed to load permissions')
    } finally {
      setLoading(false)
    }
  }, [])

  const toggle = (module, col) => {
    setPerms(prev => {
      const cur = { ...prev[module] }
      if (col === 'full_access') {
        const fa = !cur.full_access
        return { ...prev, [module]: { full_access: fa, can_view: fa, can_add: fa, can_edit: fa, can_delete: fa } }
      }
      const next = { ...cur, [col]: !cur[col] }
      next.full_access = next.can_view && next.can_add && next.can_edit && next.can_delete
      return { ...prev, [module]: next }
    })
    setSaved(false)
  }

  const handleSave = async () => {
    if (!selectedSite) return
    setSaving(true); setError(''); setSaved(false)
    try {
      await saveSitePermissions(selectedSite.code, { permissions: perms })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save permissions')
    } finally {
      setSaving(false)
    }
  }

  const filteredProjects = projects.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.code?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex gap-0 h-full" style={{ minHeight: 0 }}>

      {/* ── Left: Site list ── */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col" style={{ minHeight: 0 }}>
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Shield size={14} className="text-blue-600" /> Permissions
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Select a site to configure</p>
        </div>
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">
            <Search size={12} className="text-gray-400 flex-shrink-0" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search sites…"
              className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredProjects.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No sites found</p>
          ) : filteredProjects.map(p => {
            const users = siteUsers(p)
            const isActive = selectedSite?.code === p.code
            return (
              <button
                key={p.id}
                onClick={() => loadPerms(p)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-gray-50 transition-colors ${
                  isActive ? 'bg-blue-50 border-l-2 border-l-blue-600' : 'hover:bg-gray-50'
                }`}
              >
                <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isActive ? 'bg-blue-600' : 'bg-blue-100'
                }`}>
                  <Building2 size={15} className={isActive ? 'text-white' : 'text-blue-600'} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate">{p.name}</p>
                  <p className="text-[10px] text-gray-400">{p.code}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                    <Users size={9} />
                    {users.length === 0 ? 'No users assigned' : `${users.length} user${users.length > 1 ? 's' : ''}`}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── Right: Permission matrix ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">

        {!selectedSite ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Building2 size={40} className="text-gray-200" />
            <p className="text-sm font-medium">Select a site to manage permissions</p>
            <p className="text-xs">Permissions set here apply to all users at the site</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-gray-900">
                  {selectedSite.name}
                  <span className="ml-2 text-xs font-normal text-gray-400">{selectedSite.code}</span>
                </h3>

                {/* Users assigned to this site */}
                {(() => {
                  const users = siteUsers(selectedSite)
                  return users.length === 0 ? (
                    <p className="text-xs text-gray-400 mt-1">No users assigned to this site</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {users.map(u => (
                        <span
                          key={u.id}
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700"
                        >
                          <span className={`w-3.5 h-3.5 rounded-full text-white flex items-center justify-center text-[8px] font-bold ${u.role === 'admin' ? 'bg-red-500' : 'bg-blue-500'}`}>
                            {initials(u.name)[0]}
                          </span>
                          {u.name}
                          <span className={`ml-0.5 text-[9px] px-1 rounded-full ${ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-500'}`}>
                            {u.role}
                          </span>
                        </span>
                      ))}
                    </div>
                  )
                })()}
              </div>

              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                {error && <p className="text-xs text-red-600">{error}</p>}
                {saved && (
                  <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                    <CheckCircle size={12} /> Saved
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || loading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {saving ? 'Saving…' : 'Save Permissions'}
                </button>
              </div>
            </div>

            {/* Matrix */}
            {loading ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-gray-400">
                <Loader2 size={18} className="animate-spin" /><span className="text-sm">Loading…</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                {MODULE_GROUPS.map(group => (
                  <div key={group.group} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="grid bg-gray-100 border-b border-gray-200"
                      style={{ gridTemplateColumns: '1fr repeat(5, 100px)' }}>
                      <div className="px-4 py-2.5 text-xs font-bold text-gray-700 uppercase tracking-wide">
                        {group.group}
                      </div>
                      {PERM_COLS.map(c => (
                        <div key={c.key} className="px-2 py-2.5 text-xs font-bold text-gray-600 text-center">
                          {c.label}
                        </div>
                      ))}
                    </div>

                    {group.modules.map((mod, idx) => (
                      <div
                        key={mod.key}
                        className={`grid items-center border-b border-gray-100 last:border-0 hover:bg-blue-50/30 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/40' : ''}`}
                        style={{ gridTemplateColumns: '1fr repeat(5, 100px)' }}
                      >
                        <div className="px-4 py-3 text-sm text-gray-800">{mod.label}</div>
                        {PERM_COLS.map(col => (
                          <div key={col.key} className="flex items-center justify-center py-3">
                            <input
                              type="checkbox"
                              checked={!!perms[mod.key]?.[col.key]}
                              onChange={() => toggle(mod.key, col.key)}
                              className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
