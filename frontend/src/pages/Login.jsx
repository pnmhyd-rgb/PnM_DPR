import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff } from 'lucide-react'

const FEATURES = [
  'Daily DPR Entry & Fleet Tracking',
  'Fuel, Service & Maintenance Logs',
  'Hire Work Orders & GST Verification',
  'HR — Operators, Attendance & Payroll',
  'Asset Register, Spare Parts & Reports',
]

/* ── tiny inline check icon ── */
function Check() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="#34d399" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Login() {
  const { login }  = useAuth()
  const navigate   = useNavigate()
  const [form, setForm]     = useState({ username: '', password: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/my-dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  /* shared focus/blur handlers for inputs */
  const onFocus = e => (e.target.style.borderColor = '#3b82f6')
  const onBlur  = e => (e.target.style.borderColor = '#e5e7eb')

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    border: '1.5px solid #e5e7eb', borderRadius: 10,
    padding: '11px 14px', fontSize: 14, color: '#111827',
    background: '#f9fafb', outline: 'none',
    transition: 'border-color 0.15s',
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'inherit' }}>

      {/* ════════════════════════════════════════
          LEFT PANEL — branding
      ════════════════════════════════════════ */}
      <div
        className="hidden lg:flex"
        style={{
          flex: '0 0 56%',
          background: 'linear-gradient(140deg, #0b1e3d 0%, #1a3a6b 55%, #1a5c8a 100%)',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 56px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* ── dot grid ── */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />

        {/* ── decorative rings ── */}
        <div style={{
          position: 'absolute', bottom: -130, right: -100, pointerEvents: 'none',
          width: 480, height: 480, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.025)',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, right: -30, pointerEvents: 'none',
          width: 280, height: 280, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.035)',
        }} />
        <div style={{
          position: 'absolute', top: -80, left: -100, pointerEvents: 'none',
          width: 340, height: 340, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.05)',
        }} />

        {/* ── logo ── */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <img src="/rvr-logo.png" alt="RVR" style={{ height: 50, width: 'auto' }} />
        </div>

        {/* ── headline + features ── */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{
            fontSize: 11, fontWeight: 700, color: '#60a5fa',
            letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 18,
          }}>
            Plant &amp; Machinery Division
          </p>

          <h1 style={{
            fontSize: 42, fontWeight: 800, color: '#ffffff',
            lineHeight: 1.15, marginBottom: 14,
          }}>
            PnM DPR &amp;<br />Machinery<br />Management
          </h1>

          <p style={{ fontSize: 14.5, color: '#93c5fd', marginBottom: 40, lineHeight: 1.7 }}>
            One platform to manage your entire fleet —<br />
            from daily shift entries to hire work orders.
          </p>

          {/* feature bullets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {FEATURES.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(52,211,153,0.12)',
                  border: '1px solid rgba(52,211,153,0.38)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check />
                </div>
                <span style={{ fontSize: 13.5, color: '#bfdbfe', fontWeight: 500 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── bottom copyright ── */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: 12, color: '#2d5a8e' }}>
            © {new Date().getFullYear()} RVR Projects &nbsp;·&nbsp; Version 1.0.0
          </p>
        </div>
      </div>

      {/* ════════════════════════════════════════
          RIGHT PANEL — login form
      ════════════════════════════════════════ */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f3f4f6',
        padding: '36px 24px',
      }}>

        {/* mobile-only logo */}
        <div className="lg:hidden" style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/rvr-logo.png" alt="RVR"
            style={{ height: 42, margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: '#9ca3af' }}>PnM DPR &amp; Machinery System</p>
        </div>

        {/* card */}
        <div style={{
          width: '100%', maxWidth: 400,
          background: '#ffffff',
          borderRadius: 20,
          boxShadow: '0 4px 40px rgba(0,0,0,0.09)',
          padding: '40px 38px',
          border: '1px solid #eff0f2',
        }}>

          {/* card heading */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 5 }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 13, color: '#9ca3af' }}>
              Sign in with your assigned credentials
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Username */}
            <div>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 700,
                color: '#6b7280', letterSpacing: '0.08em',
                textTransform: 'uppercase', marginBottom: 7,
              }}>
                Username
              </label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="Enter username"
                required
                autoFocus
                autoCapitalize="none"
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 700,
                color: '#6b7280', letterSpacing: '0.08em',
                textTransform: 'uppercase', marginBottom: 7,
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Enter password"
                  required
                  style={{ ...inputStyle, paddingRight: 42 }}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  tabIndex={-1}
                  style={{
                    position: 'absolute', right: 13, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 0,
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, padding: '10px 14px',
                fontSize: 13, color: '#dc2626',
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading
                  ? '#93c5fd'
                  : 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                padding: '13px',
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: 4,
                letterSpacing: '0.02em',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(37,99,235,0.32)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!loading) e.target.style.boxShadow = '0 6px 20px rgba(37,99,235,0.45)' }}
              onMouseLeave={e => { if (!loading) e.target.style.boxShadow = '0 4px 14px rgba(37,99,235,0.32)' }}
            >
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>
        </div>

        {/* footer */}
        <p style={{ marginTop: 28, fontSize: 12, color: '#d1d5db', textAlign: 'center' }}>
          © {new Date().getFullYear()} RVR Projects &nbsp;·&nbsp; Plant &amp; Machinery Division
        </p>

      </div>
    </div>
  )
}
