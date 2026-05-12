/**
 * GSTVerifyField — Reusable GST verification input for any entity form.
 *
 * Props:
 *   value       : string       — controlled GSTIN value
 *   onChange    : (val)=>void  — called on every keystroke
 *   onVerified  : (data)=>void — called with enriched GST data after successful verify
 *   onDuplicate : (msg)=>void  — called when GSTIN already exists (optional)
 *   disabled    : boolean
 *   existingId  : number|null  — current record's own ID (exclude from dup check)
 *   label       : string       — field label (default "GST Number")
 *
 * Usage:
 *   <GSTVerifyField
 *     value={form.gst_no}
 *     onChange={v => setForm(f => ({ ...f, gst_no: v }))}
 *     onVerified={gstData => autoFillFromGST(gstData)}
 *     existingId={vendor?.id}
 *   />
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { verifyGSTApi } from '../lib/api'
import {
  ShieldCheck, ShieldX, ShieldAlert, RotateCcw,
  Loader2, BadgeCheck, BadgeX, AlertCircle,
} from 'lucide-react'

// ── CLIENT-SIDE VALIDATION (instant, no API call) ─────────────────────────────

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const GSTIN_RE    = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

const STATE_CODES = {
  '01':'Jammu & Kashmir',    '02':'Himachal Pradesh',
  '03':'Punjab',             '04':'Chandigarh',
  '05':'Uttarakhand',        '06':'Haryana',
  '07':'Delhi',              '08':'Rajasthan',
  '09':'Uttar Pradesh',      '10':'Bihar',
  '11':'Sikkim',             '12':'Arunachal Pradesh',
  '13':'Nagaland',           '14':'Manipur',
  '15':'Mizoram',            '16':'Tripura',
  '17':'Meghalaya',          '18':'Assam',
  '19':'West Bengal',        '20':'Jharkhand',
  '21':'Odisha',             '22':'Chhattisgarh',
  '23':'Madhya Pradesh',     '24':'Gujarat',
  '26':'Dadra & NH and D&D', '27':'Maharashtra',
  '28':'Andhra Pradesh (Old)','29':'Karnataka',
  '30':'Goa',                '31':'Lakshadweep',
  '32':'Kerala',             '33':'Tamil Nadu',
  '34':'Puducherry',         '35':'Andaman & Nicobar',
  '36':'Telangana',          '37':'Andhra Pradesh',
  '38':'Ladakh',             '97':'Other Territory',
  '99':'Centre Jurisdiction',
}

function validateLocal(gstin) {
  if (!gstin) return null
  const g = gstin.toUpperCase().trim()
  if (g.length < 15) return null
  if (g.length > 15) return { valid: false, error: 'Must be exactly 15 characters' }
  if (!GSTIN_RE.test(g)) return { valid: false, error: 'Invalid format (check PAN + state code)' }

  // Checksum
  let sum = 0
  const mod = GSTIN_CHARS.length
  const factor = [1, 2]
  for (let i = 0; i < 14; i++) {
    const cp    = GSTIN_CHARS.indexOf(g[i])
    const digit = factor[i % 2] * cp
    sum += Math.floor(digit / mod) + (digit % mod)
  }
  const expected = GSTIN_CHARS[(mod - (sum % mod)) % mod]
  if (g[14] !== expected) return { valid: false, error: 'Invalid checksum digit' }

  const stateCode = g.substring(0, 2)
  return {
    valid:      true,
    gstin:      g,
    state_code: stateCode,
    state_name: STATE_CODES[stateCode] || 'Unknown State',
    pan:        g.substring(2, 12),
  }
}

// ── STATUS CONFIG ─────────────────────────────────────────────────────────────

const STATUS = {
  idle:       { icon: null,                   color: '',                                badge: null },
  typing:     { icon: null,                   color: '',                                badge: null },
  invalid:    { icon: ShieldX,                color: 'text-red-500',                    badge: { text: 'Invalid', bg: 'bg-red-50 text-red-600 border-red-200' } },
  valid_fmt:  { icon: ShieldAlert,            color: 'text-amber-500',                  badge: { text: 'Valid format', bg: 'bg-amber-50 text-amber-700 border-amber-200' } },
  verifying:  { icon: Loader2,                color: 'text-blue-500 animate-spin',      badge: { text: 'Verifying…', bg: 'bg-blue-50 text-blue-700 border-blue-200' } },
  active:     { icon: ShieldCheck,            color: 'text-green-600',                  badge: { text: 'Active', bg: 'bg-green-50 text-green-700 border-green-200' } },
  cancelled:  { icon: ShieldX,                color: 'text-red-500',                    badge: { text: 'Cancelled', bg: 'bg-red-50 text-red-600 border-red-200' } },
  suspended:  { icon: ShieldAlert,            color: 'text-orange-500',                 badge: { text: 'Suspended', bg: 'bg-orange-50 text-orange-700 border-orange-200' } },
  duplicate:  { icon: BadgeX,                 color: 'text-orange-500',                 badge: { text: 'Duplicate', bg: 'bg-orange-50 text-orange-700 border-orange-200' } },
  not_found:  { icon: AlertCircle,            color: 'text-gray-400',                   badge: { text: 'Not found', bg: 'bg-gray-100 text-gray-500 border-gray-200' } },
  error:      { icon: AlertCircle,            color: 'text-red-400',                    badge: { text: 'Error', bg: 'bg-red-50 text-red-600 border-red-200' } },
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export default function GSTVerifyField({
  value       = '',
  onChange,
  onVerified,
  onDuplicate,
  disabled    = false,
  existingId  = null,
  label       = 'GST Number (GSTIN)',
}) {
  const [status,    setStatus]    = useState('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [gstInfo,   setGstInfo]   = useState(null) // local parsed info (no API)
  const debounceRef = useRef(null)
  const lastVerified = useRef('')

  // Re-run local validation whenever value changes
  useEffect(() => {
    const g = value.toUpperCase().trim()

    // Clear debounce
    clearTimeout(debounceRef.current)

    if (!g) { setStatus('idle'); setStatusMsg(''); setGstInfo(null); return }
    if (g.length < 15) { setStatus('typing'); setStatusMsg(''); setGstInfo(null); return }

    const local = validateLocal(g)
    if (!local?.valid) {
      setStatus('invalid')
      setStatusMsg(local?.error || 'Invalid GSTIN')
      setGstInfo(null)
      return
    }

    setGstInfo(local)

    // If already verified this same GSTIN, don't re-call
    if (g === lastVerified.current) return

    setStatus('valid_fmt')
    setStatusMsg(`State: ${local.state_name}  ·  PAN: ${local.pan}`)

    // Auto-trigger API verify after 600ms idle
    debounceRef.current = setTimeout(() => triggerVerify(g), 600)

    return () => clearTimeout(debounceRef.current)
  }, [value])

  const triggerVerify = useCallback(async (gstin) => {
    setStatus('verifying')
    setStatusMsg('Contacting GST Network…')
    try {
      const res  = await verifyGSTApi(gstin, existingId)
      const data = res.data.data
      const warn = res.data.warning   // set when portal is blocked, partial data only

      lastVerified.current = gstin.toUpperCase()

      if (warn) {
        // Portal unavailable — partial data (state + PAN only from GSTIN)
        setStatus('valid_fmt')
        setStatusMsg(`State: ${data.state || '—'}  ·  PAN: ${data.pan || '—'}  ·  (portal unavailable — fill company details manually)`)
      } else {
        const gstStatus = (data.gst_status || '').toLowerCase()
        if (gstStatus.includes('cancel')) {
          setStatus('cancelled')
          setStatusMsg(`Cancelled · Registered: ${data.registration_date || '—'}`)
        } else if (gstStatus.includes('suspend')) {
          setStatus('suspended')
          setStatusMsg('GST registration is suspended')
        } else {
          setStatus('active')
          setStatusMsg(
            [data.legal_name, data.state, data.registration_date
              ? `Regd. ${new Date(data.registration_date).toLocaleDateString('en-IN')}`
              : ''].filter(Boolean).join('  ·  ')
          )
        }
      }

      onVerified?.(data, warn)

    } catch (err) {
      const errData = err.response?.data
      if (errData?.type === 'duplicate') {
        setStatus('duplicate')
        setStatusMsg(errData.error || 'GSTIN already registered')
        onDuplicate?.(errData.error)
        if (errData.data) onVerified?.(errData.data, errData.warning)
      } else if (err.response?.status === 404) {
        setStatus('not_found')
        setStatusMsg('GSTIN not found in GST records')
      } else if (errData?.type === 'validation') {
        setStatus('invalid')
        setStatusMsg(errData.error || 'Invalid GSTIN')
      } else {
        setStatus('error')
        setStatusMsg(errData?.error || 'Verification failed — check your connection')
      }
    }
  }, [existingId, onVerified, onDuplicate])

  const handleReverify = () => {
    const g = value.toUpperCase().trim()
    if (g.length === 15) {
      lastVerified.current = ''
      triggerVerify(g)
    }
  }

  const meta    = STATUS[status] || STATUS.idle
  const Icon    = meta.icon
  const canReverify = ['active','cancelled','suspended','not_found','error','duplicate'].includes(status)

  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>}

      {/* Input row */}
      <div className="relative flex items-center gap-2">
        {/* Icon inside input */}
        <div className="relative flex-1">
          {Icon && (
            <span className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${meta.color}`}>
              <Icon size={15} />
            </span>
          )}
          <input
            type="text"
            value={value}
            maxLength={15}
            disabled={disabled}
            onChange={e => onChange?.(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="e.g. 27AAFCS5189K1Z3"
            className={`border rounded-lg px-3 py-2 text-sm w-full font-mono tracking-widest uppercase
              focus:outline-none focus:ring-2
              ${Icon ? 'pl-8' : ''}
              ${status === 'active'    ? 'border-green-400 focus:ring-green-400 bg-green-50/30' :
                status === 'invalid'   ? 'border-red-400 focus:ring-red-400 bg-red-50/30' :
                status === 'duplicate' ? 'border-orange-400 focus:ring-orange-400 bg-orange-50/30' :
                status === 'cancelled' ? 'border-red-400 focus:ring-red-400 bg-red-50/30' :
                'border-gray-300 focus:ring-blue-500 bg-white'}
              ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          />
          {/* Character counter */}
          {value.length > 0 && value.length < 15 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              {value.length}/15
            </span>
          )}
        </div>

        {/* Reverify button */}
        {canReverify && !disabled && (
          <button
            type="button"
            onClick={handleReverify}
            title="Re-verify GST"
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600
              hover:bg-gray-50 hover:border-blue-400 hover:text-blue-600 transition-colors whitespace-nowrap"
          >
            <RotateCcw size={13} /> Reverify
          </button>
        )}
      </div>

      {/* Status badge + message */}
      {meta.badge && (
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${meta.badge.bg}`}>
            {Icon && <Icon size={11} className={status === 'verifying' ? 'animate-spin' : ''} />}
            {meta.badge.text}
          </span>
          {statusMsg && (
            <span className="text-xs text-gray-500 truncate max-w-xs">{statusMsg}</span>
          )}
        </div>
      )}

      {/* Local parsed info (before API call) */}
      {status === 'valid_fmt' && gstInfo && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          Format valid — <strong>{gstInfo.state_name}</strong> · PAN: <strong>{gstInfo.pan}</strong> · Verifying with GST Network…
        </p>
      )}
    </div>
  )
}
