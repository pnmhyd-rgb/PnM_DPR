import { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, ClipboardList, BarChart2, FileText,
  Settings, LogOut, Menu, X, ChevronDown, ChevronRight, ChevronUp,
  Fuel, Wrench, Users, Package, AlertTriangle, BookOpen,
  User, Camera, RefreshCw, KeyRound, Shield, Info, Layers, Home, Download,
  FileSignature, Sparkles, ShieldAlert, Bell, RotateCcw, Clock,
} from 'lucide-react'
import DPRDownloadModal from '../pages/DPRDownloadModal'
import KalaPanel from '../pages/KalaPanel'
import { getNotifications } from '../lib/api'
import { APP_VERSION } from '../version'


const NAV = [
  { label: 'Log Entry',   href: '/entry',       icon: ClipboardList },
  { label: 'Dashboard',   href: '/dashboard',   icon: LayoutDashboard },
  { label: 'Utilization', href: '/utilization', icon: BarChart2 },
  { label: 'Summary',     href: '/summary',     icon: FileText },
  { label: 'Fuel Station', href: '/fuel-station', icon: Fuel },
  { label: 'Service',     href: '/service',     icon: Wrench },
]

const ADMIN_GENERAL_NAV = [
  { label: 'Users',       href: '/admin/users' },
  { label: 'Entries',     href: '/admin/entries' },
  { label: 'Projects',    href: '/admin/projects' },
  { label: 'Permissions', href: '/admin/permissions' },
]

const ADMIN_ASSET_NAV = [
  { label: 'Asset Master',      href: '/admin/machines' },
  { label: 'Asset Category',    href: '/admin/equipment-types' },
  { label: 'UOM Types',         href: '/admin/uom-types' },
  { label: 'Vendor Master',     href: '/admin/vendors' },
  { label: 'Reading Master',    href: '/admin/reading-master' },
  { label: 'Reading Mappings',  href: '/admin/reading-mappings' },
]

const HR_NAV = [
  { label: 'Operators',  href: '/hr/operators' },
  { label: 'Attendance', href: '/hr/attendance' },
  { label: 'Payroll',    href: '/hr/payroll' },
]

const INVENTORY_NAV = [
  { label: 'Spare Parts', href: '/inventory/spare-parts' },
]

const REPORTS_NAV = [
  { label: 'Breakdown Report', href: '/reports/breakdown' },
]

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

function Avatar({ user, size = 32, className = '' }) {
  const pic = localStorage.getItem(`profilePic_${user?.id}`)
  if (pic) {
    return (
      <img
        src={pic}
        alt={user?.name}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.38, background: '#2563eb' }}
      className={`rounded-full text-white flex items-center justify-center font-semibold flex-shrink-0 select-none ${className}`}
    >
      {initials(user?.name) || <User size={size * 0.5} />}
    </div>
  )
}

function ProfileModal({ onClose }) {
  const { user, updateProfile } = useAuth()
  const [name, setName]           = useState(user?.name || '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [picPreview, setPicPreview] = useState(localStorage.getItem(`profilePic_${user?.id}`) || '')
  const fileRef = useRef()

  const handlePic = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setPicPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const save = async () => {
    setError(''); setSuccess('')
    if (newPw && newPw !== confirmPw) { setError('New passwords do not match'); return }
    if (newPw && newPw.length < 6)   { setError('Password must be at least 6 characters'); return }
    setSaving(true)
    try {
      const payload = { name }
      if (newPw) payload.password = newPw
      await updateProfile(payload)
      if (picPreview) localStorage.setItem(`profilePic_${user?.id}`, picPreview)
      else localStorage.removeItem(`profilePic_${user?.id}`)
      setSuccess('Profile updated successfully')
      setNewPw(''); setConfirmPw(''); setCurrentPw('')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save profile')
    } finally { setSaving(false) }
  }

  const removePic = () => { setPicPreview(''); localStorage.removeItem(`profilePic_${user?.id}`) }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="font-semibold text-gray-900">Profile Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Avatar upload */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {picPreview
                ? <img src={picPreview} alt="Profile" className="w-20 h-20 rounded-full object-cover border-4 border-blue-100" />
                : (
                  <div className="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold border-4 border-blue-100 select-none">
                    {initials(user?.name) || <User size={32} />}
                  </div>
                )
              }
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 bg-white border border-gray-300 rounded-full p-1.5 shadow-sm hover:bg-gray-50 transition-colors"
              >
                <Camera size={13} className="text-gray-600" />
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePic} />
            {picPreview && (
              <button onClick={removePic} className="text-xs text-red-500 hover:text-red-700">Remove photo</button>
            )}
          </div>

          {/* Role badge */}
          <div className="flex items-center justify-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${user?.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              {user?.role}
            </span>
            <span className="text-xs text-gray-400">@{user?.username}</span>
          </div>

          {/* Name */}
          <div>
            <label className={lbl}>Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className={inp} />
          </div>

          {/* Username (read-only) */}
          <div>
            <label className={lbl}>Username</label>
            <input type="text" value={user?.username || ''} className={inp + ' bg-gray-50 text-gray-400'} readOnly />
          </div>

          {/* Change password */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><KeyRound size={12} />Change Password</p>
            <div>
              <label className={lbl}>New Password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className={inp} placeholder="Leave blank to keep current" />
            </div>
            <div>
              <label className={lbl}>Confirm New Password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={inp} />
            </div>
          </div>

          {error   && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">{success}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={save} disabled={saving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={onClose} className="px-5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RolesModal({ user, onClose }) {
  const isAdmin = user?.role === 'admin'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Shield size={16} className="text-blue-600" /> Role &amp; Permissions
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${isAdmin ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              {user?.role}
            </span>
            <span className="text-sm text-gray-500">{isAdmin ? 'Administrator' : 'Operator'}</span>
          </div>
          <ul className="space-y-2 text-sm">
            {isAdmin ? (
              <>
                <li className="flex items-center gap-2 text-gray-700"><span className="text-green-500 font-bold">✓</span> Full system access</li>
                <li className="flex items-center gap-2 text-gray-700"><span className="text-green-500 font-bold">✓</span> Manage users &amp; projects</li>
                <li className="flex items-center gap-2 text-gray-700"><span className="text-green-500 font-bold">✓</span> Asset &amp; machine settings</li>
                <li className="flex items-center gap-2 text-gray-700"><span className="text-green-500 font-bold">✓</span> View all reports</li>
                <li className="flex items-center gap-2 text-gray-700"><span className="text-green-500 font-bold">✓</span> Data entry &amp; approvals</li>
              </>
            ) : (
              <>
                <li className="flex items-center gap-2 text-gray-700"><span className="text-green-500 font-bold">✓</span> Daily data entry</li>
                <li className="flex items-center gap-2 text-gray-700"><span className="text-green-500 font-bold">✓</span> View dashboard &amp; reports</li>
                <li className="flex items-center gap-2 text-gray-400"><span className="text-red-400 font-bold">✗</span> Admin settings (restricted)</li>
                <li className="flex items-center gap-2 text-gray-400"><span className="text-red-400 font-bold">✗</span> User management (restricted)</li>
              </>
            )}
          </ul>
          <button onClick={onClose} className="w-full border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg py-2 text-sm transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function AboutModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Info size={16} className="text-blue-600" /> About
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-2 text-sm">
          <p className="font-semibold text-gray-900 text-base">RVR DPR &amp; Utilization System</p>
          <p className="text-gray-500">Plants &amp; Machinery Module</p>
          <p className="text-gray-500">RVR Projects Pvt Ltd</p>
          <div className="pt-3">
            <button onClick={onClose} className="w-full border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg py-2 text-sm transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function LiveClock() {
  const [clock, setClock] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const clockDate = `${DAYS[clock.getDay()]}, ${clock.getDate()} ${MONTHS[clock.getMonth()]} ${clock.getFullYear()}`
  const clockTime = clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase()
  return (
    <div className="flex flex-col items-end leading-tight select-none">
      <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, letterSpacing: '0.03em' }}>{clockDate}</span>
      <span style={{ fontSize: 16, color: '#111827', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.03em' }}>{clockTime}</span>
    </div>
  )
}

const DOC_TYPE_LABELS = {
  insurance:       'Insurance',
  road_tax:        'Road Tax',
  fitness:         'Fitness Certificate',
  green_tax:       'Green Tax',
  puc:             'Pollution Certificate (PUC)',
  national_permit: 'National Permit',
  state_permit:    'State Permit',
  load_test:       'Load Test Certificate',
}

function NotificationBell({ notifications, isAdmin, loadError, loading, onNavigateToMachine, onNavigateToCompliance, onNavigateToEntries, onRefresh }) {
  const [open, setOpen]                     = useState(false)
  const [showReviewed, setShowReviewed]     = useState(false)

  const pendingResets    = notifications.pending_resets    || []
  const compliance       = notifications.compliance        || { expired: [], critical: [], warning: [] }
  const breakdowns       = notifications.breakdowns        || []
  const recentlyReviewed = notifications.recently_reviewed || []
  const myReviews        = notifications.my_reviews        || []

  // Badge: pending resets + expired + critical compliance + breakdowns (for admin)
  //        or recently reviewed own requests (for user)
  const urgentCount = isAdmin
    ? pendingResets.length + compliance.expired.length + compliance.critical.length + breakdowns.length
    : myReviews.length

  const warningCount = isAdmin ? compliance.warning.length : 0

  // Bell color: red if urgent, amber if warnings only, gray if all clear
  const bellColor = urgentCount > 0
    ? (pendingResets.length > 0 || compliance.expired.length > 0 || breakdowns.length > 0 ? '#ef4444' : '#f97316')
    : warningCount > 0 ? '#d97706' : '#6b7280'

  const fmtDate = (str) => {
    if (!str) return '—'
    return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const fmtDays = (d) => {
    if (d < 0) return `Expired ${Math.abs(d)}d ago`
    if (d === 0) return 'Expires today!'
    return `${d}d left`
  }

  const handleOpen  = () => { setOpen(true); onRefresh() }
  const handleClose = () => setOpen(false)

  // Shared card styles
  const cardBase = {
    width: '100%', textAlign: 'left', padding: '11px 16px',
    borderBottom: '1px solid #f3f4f6', background: 'transparent',
    cursor: 'pointer', display: 'block', transition: 'background 0.1s', border: 'none',
  }

  const SectionHeader = ({ icon, title, count, color, bg }) => (
    <div style={{
      padding: '8px 16px', background: bg, borderBottom: '1px solid #f0f0f0',
      display: 'flex', alignItems: 'center', gap: 7,
      color, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
      flexShrink: 0,
    }}>
      {icon}
      {title}
      {count > 0 && (
        <span style={{ marginLeft: 'auto', background: color, color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}>
          {count}
        </span>
      )}
    </div>
  )

  const SubHeader = ({ label, dotColor }) => (
    <div style={{ padding: '5px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: dotColor }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
      {label}
    </div>
  )

  const EmptyNote = ({ text }) => (
    <p style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', padding: '8px 16px', margin: 0 }}>{text}</p>
  )

  return (
    <>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        title="Notifications"
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, borderRadius: 10, border: '1.5px solid #e5e7eb',
          background: open ? '#fafafa' : '#fff', cursor: 'pointer',
          color: bellColor, transition: 'all 0.15s',
        }}
      >
        <Bell size={17} />
        {urgentCount > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            background: '#ef4444', color: '#fff',
            fontSize: 10, fontWeight: 700, lineHeight: 1,
            minWidth: 17, height: 17, borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '2px solid #fff',
          }}>
            {urgentCount > 9 ? '9+' : urgentCount}
          </span>
        )}
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          onClick={handleClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: 72,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 480, maxWidth: '96vw', maxHeight: '82vh',
              background: '#fff', borderRadius: 18,
              boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '14px 18px 12px', borderBottom: '1px solid #f3f4f6',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#f9fafb', flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bell size={14} style={{ color: bellColor }} />
                Notifications
                {urgentCount > 0 && (
                  <span style={{ background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 99 }}>
                    {urgentCount}
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={e => { e.stopPropagation(); onRefresh() }}
                  disabled={loading}
                  style={{ background: 'none', border: '1px solid #e5e7eb', cursor: loading ? 'not-allowed' : 'pointer', color: '#6b7280', padding: '4px 8px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                >
                  <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                  Refresh
                </button>
                <button
                  onClick={handleClose}
                  style={{ background: 'none', border: '1px solid #e5e7eb', cursor: 'pointer', color: '#6b7280', padding: '4px 8px', borderRadius: 7, display: 'flex', alignItems: 'center', fontSize: 11 }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {/* Error */}
              {loadError && (
                <div style={{ margin: 14, padding: '11px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#dc2626' }}>⚠ Failed to load notifications.</span>
                  <button onClick={e => { e.stopPropagation(); onRefresh() }} style={{ marginLeft: 'auto', fontSize: 11, color: '#dc2626', background: 'none', border: '1px solid #fca5a5', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Retry
                  </button>
                </div>
              )}

              {loading && !loadError && (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading notifications…</div>
              )}

              {!loading && !loadError && (
                isAdmin ? (
                  <>
                    {/* ── 1. Pending Approvals ── */}
                    <SectionHeader
                      icon={<RotateCcw size={12} />}
                      title="Pending Approvals"
                      count={pendingResets.length}
                      color="#d97706"
                      bg="#fffbeb"
                    />
                    {pendingResets.length === 0 ? <EmptyNote text="No pending approvals" /> : pendingResets.map(req => (
                      <button
                        key={`pr-${req.id}`}
                        onClick={() => { handleClose(); onNavigateToMachine(req) }}
                        style={cardBase}
                        onMouseEnter={e => e.currentTarget.style.background = '#fffbeb'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <RotateCcw size={11} style={{ color: '#d97706', flexShrink: 0 }} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Counter Reset</span>
                          <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>Pending</span>
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>{req.nickname || req.slno || 'Unknown Asset'}</p>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {req.asset_code && <span style={{ fontSize: 11, color: '#6b7280' }}>Code: <strong style={{ color: '#374151' }}>{req.asset_code}</strong></span>}
                          <span style={{ fontSize: 11, color: '#6b7280' }}>By: <strong style={{ color: '#374151' }}>{req.requested_by_name || '—'}</strong></span>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>Reset: <strong style={{ color: '#374151' }}>{fmtDate(req.reset_date)}</strong></span>
                        </div>
                        <p style={{ fontSize: 11, color: '#3b82f6', marginTop: 5, fontWeight: 500 }}>Open Asset Settings →</p>
                      </button>
                    ))}

                    {/* ── 2. Breakdown Reports ── */}
                    <SectionHeader
                      icon={<Wrench size={12} />}
                      title="Breakdown Reports"
                      count={breakdowns.length}
                      color="#dc2626"
                      bg="#fef2f2"
                    />
                    {breakdowns.length === 0 ? <EmptyNote text="No pending breakdown entries" /> : breakdowns.map(b => (
                      <button
                        key={`bk-${b.id}`}
                        onClick={() => { handleClose(); onNavigateToEntries() }}
                        style={cardBase}
                        onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Wrench size={11} style={{ color: '#dc2626', flexShrink: 0 }} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Breakdown</span>
                          <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, background: '#fecdd3', color: '#9f1239', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>{b.shift?.replace(' Shift','') || 'Day'} · Pending Review</span>
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>{b.nickname || b.slno || 'Unknown Asset'}</p>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>Date: <strong style={{ color: '#374151' }}>{fmtDate(b.entry_date)}</strong></span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>⏱ {parseFloat(b.breakdown).toFixed(1)} Hrs</span>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>{b.project_code}</span>
                        </div>
                        {(b.remarks || b.work_done) && (
                          <p style={{ fontSize: 11, color: '#374151', marginTop: 4, background: '#fff5f5', borderRadius: 5, padding: '3px 8px', borderLeft: '3px solid #fca5a5' }}>
                            {b.remarks || b.work_done}
                          </p>
                        )}
                        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>By: {b.submitted_by_name || '—'} · View Entries →</p>
                      </button>
                    ))}

                    {/* ── 3. Compliance Alerts ── */}
                    <SectionHeader
                      icon={<ShieldAlert size={12} />}
                      title="Compliance Alerts"
                      count={compliance.expired.length + compliance.critical.length + compliance.warning.length}
                      color="#7c3aed"
                      bg="#f5f3ff"
                    />
                    {compliance.expired.length === 0 && compliance.critical.length === 0 && compliance.warning.length === 0 ? (
                      <EmptyNote text="All compliance documents are valid" />
                    ) : (
                      <>
                        {compliance.expired.length > 0 && (
                          <>
                            <SubHeader label={`Expired (${compliance.expired.length})`} dotColor="#dc2626" />
                            {compliance.expired.map(c => {
                              const lbl = c.doc_type === 'custom' ? (c.doc_label || 'Custom') : (DOC_TYPE_LABELS[c.doc_type] || c.doc_type)
                              return (
                                <button key={`ce-${c.id}`} onClick={() => { handleClose(); onNavigateToCompliance() }} style={cardBase}
                                  onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', flex: 1 }}>{c.nickname || c.slno} — {lbl}</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 7px', borderRadius: 5, flexShrink: 0 }}>{fmtDays(c.days_remaining)}</span>
                                  </div>
                                  <div style={{ paddingLeft: 16, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {c.reg_no && <span style={{ fontSize: 10, color: '#6b7280' }}>Reg: {c.reg_no}</span>}
                                    <span style={{ fontSize: 10, color: '#6b7280' }}>Expiry: <strong>{fmtDate(c.expiry_date)}</strong></span>
                                    <span style={{ fontSize: 10, color: '#9ca3af' }}>{c.project_code}</span>
                                  </div>
                                </button>
                              )
                            })}
                          </>
                        )}
                        {compliance.critical.length > 0 && (
                          <>
                            <SubHeader label={`Expiring This Week (${compliance.critical.length})`} dotColor="#ea580c" />
                            {compliance.critical.map(c => {
                              const lbl = c.doc_type === 'custom' ? (c.doc_label || 'Custom') : (DOC_TYPE_LABELS[c.doc_type] || c.doc_type)
                              return (
                                <button key={`cc-${c.id}`} onClick={() => { handleClose(); onNavigateToCompliance() }} style={cardBase}
                                  onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c', flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', flex: 1 }}>{c.nickname || c.slno} — {lbl}</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#ea580c', background: '#ffedd5', padding: '2px 7px', borderRadius: 5, flexShrink: 0 }}>{fmtDays(c.days_remaining)}</span>
                                  </div>
                                  <div style={{ paddingLeft: 16, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {c.reg_no && <span style={{ fontSize: 10, color: '#6b7280' }}>Reg: {c.reg_no}</span>}
                                    <span style={{ fontSize: 10, color: '#6b7280' }}>Expiry: <strong>{fmtDate(c.expiry_date)}</strong></span>
                                    <span style={{ fontSize: 10, color: '#9ca3af' }}>{c.project_code}</span>
                                  </div>
                                </button>
                              )
                            })}
                          </>
                        )}
                        {compliance.warning.length > 0 && (
                          <>
                            <SubHeader label={`Expiring This Month (${compliance.warning.length})`} dotColor="#d97706" />
                            {compliance.warning.map(c => {
                              const lbl = c.doc_type === 'custom' ? (c.doc_label || 'Custom') : (DOC_TYPE_LABELS[c.doc_type] || c.doc_type)
                              return (
                                <button key={`cw-${c.id}`} onClick={() => { handleClose(); onNavigateToCompliance() }} style={cardBase}
                                  onMouseEnter={e => e.currentTarget.style.background = '#fffbeb'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706', flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', flex: 1 }}>{c.nickname || c.slno} — {lbl}</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '2px 7px', borderRadius: 5, flexShrink: 0 }}>{fmtDays(c.days_remaining)}</span>
                                  </div>
                                  <div style={{ paddingLeft: 16, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {c.reg_no && <span style={{ fontSize: 10, color: '#6b7280' }}>Reg: {c.reg_no}</span>}
                                    <span style={{ fontSize: 10, color: '#6b7280' }}>Expiry: <strong>{fmtDate(c.expiry_date)}</strong></span>
                                    <span style={{ fontSize: 10, color: '#9ca3af' }}>{c.project_code}</span>
                                  </div>
                                </button>
                              )
                            })}
                          </>
                        )}
                      </>
                    )}

                    {/* ── 4. Recently Reviewed (collapsible) ── */}
                    {recentlyReviewed.length > 0 && (
                      <>
                        <button
                          onClick={() => setShowReviewed(v => !v)}
                          style={{
                            width: '100%', border: 'none', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6',
                            padding: '8px 16px', background: '#f9fafb', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={11} /> Recently Reviewed ({recentlyReviewed.length})
                          </span>
                          {showReviewed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                        {showReviewed && recentlyReviewed.map(req => (
                          <button
                            key={`rr-${req.id}`}
                            onClick={() => { handleClose(); onNavigateToMachine(req) }}
                            style={cardBase}
                            onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                                background: req.status === 'approved' ? '#dcfce7' : '#fee2e2',
                                color: req.status === 'approved' ? '#166534' : '#991b1b' }}>
                                {req.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                              </span>
                              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>{fmtDate(req.reviewed_at)}</span>
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: '#111827', margin: '0 0 3px' }}>{req.nickname || req.slno} — Counter Reset</p>
                            <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
                              Requested by: <strong>{req.requested_by_name || '—'}</strong> · Reviewed by: <strong>{req.reviewed_by_name || 'Admin'}</strong>
                            </p>
                            {req.review_note && <p style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic', marginTop: 3 }}>"{req.review_note}"</p>}
                          </button>
                        ))}
                      </>
                    )}

                    {/* All clear */}
                    {pendingResets.length === 0 && breakdowns.length === 0 &&
                     compliance.expired.length === 0 && compliance.critical.length === 0 &&
                     compliance.warning.length === 0 && recentlyReviewed.length === 0 && (
                      <div style={{ padding: '44px 16px', textAlign: 'center' }}>
                        <Bell size={30} style={{ color: '#d1d5db', margin: '0 auto 10px', display: 'block' }} />
                        <p style={{ fontSize: 14, color: '#9ca3af', margin: 0, fontWeight: 500 }}>All clear — nothing to action</p>
                        <p style={{ fontSize: 12, color: '#d1d5db', margin: '4px 0 0' }}>No pending approvals, breakdowns, or compliance alerts</p>
                      </div>
                    )}
                  </>
                ) : (
                  /* ── User view ── */
                  <>
                    <SectionHeader
                      icon={<RotateCcw size={12} />}
                      title="Your Request Updates"
                      count={myReviews.length}
                      color="#2563eb"
                      bg="#eff6ff"
                    />
                    {myReviews.length === 0 ? (
                      <div style={{ padding: '44px 16px', textAlign: 'center' }}>
                        <Bell size={30} style={{ color: '#d1d5db', margin: '0 auto 10px', display: 'block' }} />
                        <p style={{ fontSize: 14, color: '#9ca3af', margin: 0, fontWeight: 500 }}>No recent updates</p>
                        <p style={{ fontSize: 12, color: '#d1d5db', margin: '4px 0 0' }}>No reset requests reviewed in the past 14 days</p>
                      </div>
                    ) : myReviews.map(req => (
                      <div key={`mr-${req.id}`} style={{ ...cardBase, cursor: 'default' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                            background: req.status === 'approved' ? '#dcfce7' : '#fee2e2',
                            color: req.status === 'approved' ? '#166534' : '#991b1b' }}>
                            {req.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>{fmtDate(req.reviewed_at)}</span>
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 3px' }}>{req.nickname || req.slno} — Counter Reset</p>
                        <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Reset Date: <strong>{fmtDate(req.reset_date)}</strong> · By: <strong>{req.reviewed_by_name || 'Admin'}</strong></p>
                        {req.review_note && <p style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic', marginTop: 3 }}>Note: "{req.review_note}"</p>}
                      </div>
                    ))}
                  </>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function UserMenu({ onClose, onOpenProfile, onOpenRoles, onOpenAbout }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const menuRef = useRef()

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleSignOut = () => { onClose(); logout(); navigate('/login') }
  const handleRefresh = () => { onClose(); window.location.reload() }

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: 72, right: 12, zIndex: 9999 }}
      className="w-64 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden"
    >
      {/* User header */}
      <div className="px-4 py-3.5 bg-gradient-to-br from-blue-50 to-blue-100/60 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Avatar user={user} size={40} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500">@{user?.username}</p>
            <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${user?.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Menu items */}
      <div className="py-1">
        <MenuItem icon={User} label="Profile Settings" onClick={() => { onClose(); onOpenProfile() }} />
        <MenuItem icon={RefreshCw} label="Refresh" onClick={handleRefresh} />
        <MenuItem icon={Shield} label="Role & Permissions" sub={user?.role === 'admin' ? 'Administrator — full access' : 'Operator — limited access'} onClick={() => { onClose(); onOpenRoles() }} />
      </div>

      <div className="border-t border-gray-100 py-1">
        <MenuItem icon={Info} label="About" sub="RVR DPR & Utilization System" onClick={() => { onClose(); onOpenAbout() }} />
      </div>

      <div className="border-t border-gray-100 py-1">
        <MenuItem icon={LogOut} label="Sign Out" onClick={handleSignOut} danger />
      </div>
    </div>
  )
}

function MenuItem({ icon: Icon, label, sub, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icon size={15} className={danger ? 'text-red-500' : 'text-gray-400'} />
      <div className="min-w-0">
        <p className={`text-sm font-medium ${danger ? 'text-red-600' : 'text-gray-800'}`}>{label}</p>
        {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
      </div>
    </button>
  )
}

export default function Layout({ children }) {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen]           = useState(false)
  const [adminOpen, setAdminOpen]             = useState(false)
  const [assetMatrixOpen, setAssetMatrixOpen] = useState(false)
  const [hrOpen, setHrOpen]                   = useState(false)
  const [inventoryOpen, setInventoryOpen]     = useState(false)
  const [reportsOpen, setReportsOpen]         = useState(false)
  const [hireOpen, setHireOpen]               = useState(false)
  const [assetRegisterOpen, setAssetRegisterOpen] = useState(false)
  const [ownAssetOpen, setOwnAssetOpen]           = useState(false)
  const [userMenuOpen, setUserMenuOpen]           = useState(false)
  const [showProfile, setShowProfile]             = useState(false)
  const [showRoles, setShowRoles]                 = useState(false)
  const [showAbout, setShowAbout]                 = useState(false)
  const [showDPRModal, setShowDPRModal]           = useState(false)
  const [kalaOpen, setKalaOpen]                     = useState(false)
  const [notifications,  setNotifications]  = useState({})
  const [bellLoadError,  setBellLoadError]  = useState(false)
  const [bellLoading,    setBellLoading]    = useState(false)

  const loadNotifications = useCallback(() => {
    setBellLoading(true)
    getNotifications()
      .then(r => { setNotifications(r.data || {}); setBellLoadError(false) })
      .catch(err => { console.error('Notification bell fetch error:', err); setBellLoadError(true) })
      .finally(() => setBellLoading(false))
  }, [])

  // Poll notifications every 60s; also refresh immediately after a reset is reviewed
  useEffect(() => {
    loadNotifications()
    const id = setInterval(loadNotifications, 60_000)
    window.addEventListener('resetRequestReviewed', loadNotifications)
    return () => { clearInterval(id); window.removeEventListener('resetRequestReviewed', loadNotifications) }
  }, [loadNotifications])

  const handleNotificationClick    = (req) => navigate('/admin/machines', { state: { openMachineId: req.machine_id } })
  const handleComplianceClick      = ()    => navigate('/compliance')
  const handleEntriesClick         = ()    => navigate('/admin/entries')

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-blue-700 text-white' : 'text-blue-100 hover:bg-blue-700/50'
    }`

  const subLinkCls = ({ isActive }) =>
    `block px-3 py-1.5 rounded text-sm transition-colors ${
      isActive ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-700/50'
    }`

  const sidebar = (
    <div className="flex flex-col h-full bg-blue-900">
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {/* My Dashboard */}
        <NavLink to="/my-dashboard" className={linkCls} onClick={() => setMobileOpen(false)}>
          <Home size={17} />My Dashboard
        </NavLink>

        {/* Asset Register */}
        <div>
          <button
            onClick={() => setAssetRegisterOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-blue-100 hover:bg-blue-700/50 transition-colors"
          >
            <span className="flex items-center gap-3"><BookOpen size={17} />Asset Register</span>
            {assetRegisterOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {assetRegisterOpen && (
            <div className="ml-7 mt-1 space-y-0.5">
              <div>
                <button
                  onClick={() => setOwnAssetOpen(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-1.5 rounded text-sm text-blue-200 hover:bg-blue-700/50 transition-colors"
                >
                  <span>Own Asset Register</span>
                  {ownAssetOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </button>
                {ownAssetOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    <NavLink to="/asset-register/own/measurable" className={subLinkCls} onClick={() => setMobileOpen(false)}>
                      Measurable Assets
                    </NavLink>
                    <NavLink to="/asset-register/own/non-measurable" className={subLinkCls} onClick={() => setMobileOpen(false)}>
                      Non-Measurable Assets
                    </NavLink>
                  </div>
                )}
              </div>
              <NavLink to="/asset-register/hire" className={subLinkCls} onClick={() => setMobileOpen(false)}>
                Hire Asset Register
              </NavLink>
            </div>
          )}
        </div>

        {NAV.map(({ label, href, icon: Icon }) => (
          <NavLink key={href} to={href} className={linkCls} onClick={() => setMobileOpen(false)}>
            <Icon size={17} />{label}
          </NavLink>
        ))}

        {/* Compliance */}
        <NavLink to="/compliance" className={linkCls} onClick={() => setMobileOpen(false)}>
          <ShieldAlert size={17} />Compliance
        </NavLink>

        {/* Hire */}
        <div className="pt-2">
          <button
            onClick={() => setHireOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-blue-100 hover:bg-blue-700/50 transition-colors"
          >
            <span className="flex items-center gap-3"><FileSignature size={17} />Hire</span>
            {hireOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {hireOpen && (
            <div className="ml-7 mt-1 space-y-0.5">
              <NavLink to="/hire/indents" className={subLinkCls} onClick={() => setMobileOpen(false)}>
                Indents
              </NavLink>
              <NavLink to="/hire/work-orders" className={subLinkCls} onClick={() => setMobileOpen(false)}>
                Work Orders
              </NavLink>
              <NavLink to="/hire/vendors" className={subLinkCls} onClick={() => setMobileOpen(false)}>
                Vendors
              </NavLink>
              <NavLink to="/hire/billing" className={subLinkCls} onClick={() => setMobileOpen(false)}>
                Billing
              </NavLink>
            </div>
          )}
        </div>

        <div className="pt-2">
          <button
            onClick={() => setHrOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-blue-100 hover:bg-blue-700/50 transition-colors"
          >
            <span className="flex items-center gap-3"><Users size={17} />HR</span>
            {hrOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {hrOpen && (
            <div className="ml-7 mt-1 space-y-0.5">
              {HR_NAV.map(({ label, href }) => (
                <NavLink key={href} to={href} className={subLinkCls} onClick={() => setMobileOpen(false)}>
                  {label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2">
          <button
            onClick={() => setReportsOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-blue-100 hover:bg-blue-700/50 transition-colors"
          >
            <span className="flex items-center gap-3"><AlertTriangle size={17} />Reports</span>
            {reportsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {reportsOpen && (
            <div className="ml-7 mt-1 space-y-0.5">
              {REPORTS_NAV.map(({ label, href }) => (
                <NavLink key={href} to={href} className={subLinkCls} onClick={() => setMobileOpen(false)}>
                  {label}
                </NavLink>
              ))}
              <button
                onClick={() => { setShowDPRModal(true); setMobileOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-blue-200 hover:bg-blue-700/50 transition-colors text-left"
              >
                <Download size={13} />
                Download DPR
              </button>
            </div>
          )}
        </div>

        <div className="pt-2">
          <button
            onClick={() => setInventoryOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-blue-100 hover:bg-blue-700/50 transition-colors"
          >
            <span className="flex items-center gap-3"><Package size={17} />Inventory</span>
            {inventoryOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {inventoryOpen && (
            <div className="ml-7 mt-1 space-y-0.5">
              {INVENTORY_NAV.map(({ label, href }) => (
                <NavLink key={href} to={href} className={subLinkCls} onClick={() => setMobileOpen(false)}>
                  {label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {/* Asset Matrix — standalone nav item (admin only) */}
        {isAdmin && (
          <div className="pt-2">
            <button
              onClick={() => setAssetMatrixOpen(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-blue-100 hover:bg-blue-700/50 transition-colors"
            >
              <span className="flex items-center gap-3"><Layers size={17} />Asset Matrix</span>
              {assetMatrixOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {assetMatrixOpen && (
              <div className="ml-7 mt-1 space-y-0.5">
                {ADMIN_ASSET_NAV.map(({ label, href }) => (
                  <NavLink key={href} to={href} className={subLinkCls} onClick={() => setMobileOpen(false)}>
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="pt-2">
            <button
              onClick={() => setAdminOpen(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-blue-100 hover:bg-blue-700/50 transition-colors"
            >
              <span className="flex items-center gap-3"><Settings size={17} />Admin</span>
              {adminOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>

            {adminOpen && (
              <div className="ml-7 mt-1 space-y-0.5">
                {ADMIN_GENERAL_NAV.map(({ label, href }) => (
                  <NavLink key={href} to={href} className={subLinkCls} onClick={() => setMobileOpen(false)}>
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>
      <div className="px-3 py-2 border-t border-blue-800 flex-shrink-0">
        <p className="text-xs text-blue-400 text-center select-none">PnM DPR {APP_VERSION}</p>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Desktop sidebar — full height, flush to top ── */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col">{sidebar}</aside>

      {/* ── Right column: header + content ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>

        {/* ── Header — spans only the content area ── */}
        <header style={{
          flexShrink: 0,
          background: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 72,
          padding: '0 20px',
          overflow: 'hidden',
          gap: 12,
        }}>

          {/* LEFT: mobile hamburger + RVR logo + division title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
            <button
              onClick={() => setMobileOpen(v => !v)}
              className="md:hidden"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6b7280', flexShrink: 0 }}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <img
              src="/rvr-logo.png"
              alt="RVR"
              style={{ width: 148, height: 'auto', display: 'block', flexShrink: 0 }}
            />

            {/* Divider */}
            <div className="hidden sm:block" style={{ width: 1, height: 36, background: '#e5e7eb', flexShrink: 0 }} />

            {/* Division title */}
            <p className="hidden sm:block" style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#111827',
              whiteSpace: 'nowrap',
            }}>
              Plants &amp; Machinery Asset Management Division
            </p>
          </div>

          {/* RIGHT: date/time + Kala + username + avatar */}
          <div className="hidden md:flex items-center" style={{ gap: 16, flexShrink: 0 }}>

            <LiveClock />

            <button
              onClick={() => setKalaOpen(v => !v)}
              className="flex items-center gap-2"
              style={{
                padding: '7px 14px',
                borderRadius: 10,
                border: kalaOpen
                  ? '1.5px solid rgba(255,255,255,0.35)'
                  : '1.5px solid rgba(167,139,250,0.6)',
                background: kalaOpen
                  ? 'linear-gradient(135deg, #4c1d95, #5b21b6)'
                  : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.02em',
                boxShadow: kalaOpen
                  ? '0 0 22px rgba(124,58,237,0.65), 0 2px 8px rgba(0,0,0,0.2)'
                  : '0 0 16px rgba(124,58,237,0.45), 0 2px 6px rgba(0,0,0,0.15)',
                transition: 'all 0.18s',
                whiteSpace: 'nowrap',
              }}
              title="Open Ask Kala AI Assistant"
            >
              <Sparkles size={14} />
              Ask Kala
            </button>

            <NotificationBell
              notifications={notifications}
              isAdmin={isAdmin}
              loadError={bellLoadError}
              loading={bellLoading}
              onNavigateToMachine={handleNotificationClick}
              onNavigateToCompliance={handleComplianceClick}
              onNavigateToEntries={handleEntriesClick}
              onRefresh={loadNotifications}
            />

            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
              {user?.name}
            </span>

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                title={user?.name}
              >
                <Avatar user={user} size={40} />
              </button>
              {userMenuOpen && (
                <UserMenu
                  onClose={() => setUserMenuOpen(false)}
                  onOpenProfile={() => setShowProfile(true)}
                  onOpenRoles={() => setShowRoles(true)}
                  onOpenAbout={() => setShowAbout(true)}
                />
              )}
            </div>
          </div>
        </header>

        {/* ── Content row: main + optional Kala panel ── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {children}
          </main>

          {/* Kala AI side panel */}
          {kalaOpen && (
            <div
              className="hidden md:flex flex-col flex-shrink-0"
              style={{
                width: 380,
                borderLeft: '1px solid #e5e7eb',
                boxShadow: '-4px 0 20px rgba(0,0,0,0.06)',
                animation: 'slideInRight 0.2s ease',
              }}
            >
              <KalaPanel onClose={() => setKalaOpen(false)} />
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile overlay sidebar ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-56 flex-shrink-0">{sidebar}</div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
      `}</style>

      {/* Layout-level modals */}
      {showProfile  && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showRoles    && <RolesModal user={user} onClose={() => setShowRoles(false)} />}
      {showAbout    && <AboutModal onClose={() => setShowAbout(false)} />}
      {showDPRModal && <DPRDownloadModal onClose={() => setShowDPRModal(false)} />}

    </div>
  )
}
