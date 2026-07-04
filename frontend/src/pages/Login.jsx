import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { User, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
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
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Construction background – fills left side */}
      <div className="login-bg" />
      <div className="login-bg-pattern" />

      {/* ── Login Card – right-aligned, vertically centered ── */}
      <div className="login-card">

        {/* Brand header */}
        <div className="login-header">
          <img src="/rvr-logo-new.png" alt="RVR Projects" className="login-logo" />
          <p className="login-division">
            Plants &amp; Machinery Asset Management Division
          </p>
          <h1 className="login-title">Welcome Back</h1>
          <p className="login-subtitle">Access your PNM System</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">

          {/* Username */}
          <div className="float-group">
            <User size={17} className="float-icon" />
            <input
              type="text"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder=" "
              required
              autoFocus
              autoCapitalize="none"
              className="float-input"
            />
            <label className="float-label">Username</label>
          </div>

          {/* Password */}
          <div className="float-group">
            <Lock size={17} className="float-icon" />
            <input
              type={showPw ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder=" "
              required
              className="float-input float-input--pw"
            />
            <label className="float-label">Password</label>
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              tabIndex={-1}
              className="pw-toggle"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="login-btn"
          >
            {loading
              ? 'Signing in…'
              : <><span>Login</span><ArrowRight size={18} strokeWidth={2.5} /></>
            }
          </button>

        </form>

        {/* Footer – divider + copyright, in normal flow */}
        <div className="login-footer">
          <p className="login-copyright">
            © {new Date().getFullYear()} RVR Projects Pvt. Ltd.<br />All Rights Reserved
          </p>
        </div>

      </div>
    </div>
  )
}
