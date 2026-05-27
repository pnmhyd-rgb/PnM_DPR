import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { User, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'

export default function Login() {
  const { login }   = useAuth()
  const navigate    = useNavigate()
  const [form, setForm]       = useState({ username: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/my-dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundImage: `
        linear-gradient(to right,
          transparent 0%,
          transparent 40%,
          rgba(8,18,42,0.98) 58%,
          rgba(8,18,42,1.0) 100%
        ),
        url(/login-bg.png)
      `,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      fontFamily: 'inherit',
    }}>

      {/* ── Login Card ── */}
      <div style={{
        position: 'absolute',
        top: '50%', right: 'max(40px, 6vw)',
        transform: 'translateY(-50%)',
        zIndex: 1,
        width: 380,
        maxHeight: '95vh',
        overflowY: 'auto',
        background: '#ffffff',
        borderRadius: 20,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        padding: '36px 32px 28px',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <img src="/rvr-logo.png" alt="RVR" style={{ height: 48, width: 'auto' }} />
        </div>

        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 6 }}>
            Welcome Back!
          </h1>
          <p style={{ fontSize: 13.5, color: '#6b7280' }}>
            Sign in to access your PNM system
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Username */}
          <div style={{ position: 'relative' }}>
            <User size={15} style={{
              position: 'absolute', left: 13, top: '50%',
              transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none',
            }} />
            <input
              type="text"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="Username"
              required
              autoFocus
              autoCapitalize="none"
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1.5px solid #e5e7eb', borderRadius: 10,
                padding: '11px 14px 11px 36px',
                fontSize: 14, color: '#111827',
                background: '#f9fafb', outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e  => (e.target.style.borderColor = '#e5e7eb')}
            />
          </div>

          {/* Password */}
          <div style={{ position: 'relative' }}>
            <Lock size={15} style={{
              position: 'absolute', left: 13, top: '50%',
              transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none',
            }} />
            <input
              type={showPw ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Password"
              required
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1.5px solid #e5e7eb', borderRadius: 10,
                padding: '11px 42px 11px 36px',
                fontSize: 14, color: '#111827',
                background: '#f9fafb', outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e  => (e.target.style.borderColor = '#e5e7eb')}
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
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '9px 13px',
              fontSize: 13, color: '#dc2626',
            }}>
              {error}
            </div>
          )}

          {/* Login button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              padding: '12px 20px',
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: loading ? 'none' : '0 4px 16px rgba(37,99,235,0.38)',
              transition: 'all 0.15s',
              marginTop: 4,
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 6px 22px rgba(37,99,235,0.5)' }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.boxShadow = '0 4px 16px rgba(37,99,235,0.38)' }}
          >
            {loading ? 'Signing in…' : (<>Login <ArrowRight size={16} /></>)}
          </button>
        </form>

        {/* Footer */}
        <p style={{ marginTop: 28, fontSize: 11.5, color: '#9ca3af', textAlign: 'center' }}>
          © {new Date().getFullYear()} RVR Projects Pvt. Ltd.<br />All Rights Reserved
        </p>
      </div>
    </div>
  )
}
