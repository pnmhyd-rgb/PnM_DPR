import { useState, useEffect, useRef, useCallback } from 'react'
import { chatWithKala } from '../lib/api'
import {
  X, Mic, MicOff, SendHorizonal, Sparkles,
  Download, FileSpreadsheet, FileText, Bot, User, Loader2,
  RefreshCw, ChevronRight,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ── Quick prompt chips shown before first message ─────────────────────────────

const QUICK_PROMPTS = [
  { label: "Today's DPR status",     text: "What is today's DPR submission status?" },
  { label: 'This month utilization', text: 'Show me the utilization report for this month' },
  { label: 'Fleet breakdown',        text: 'Give me a fleet status breakdown by equipment type' },
  { label: 'Hire machinery HSD',     text: 'Show fuel consumption for hire machinery this month' },
  { label: 'Low utilization',        text: 'Which machines have below 50% utilization this month?' },
]

// ── Table renderer inside chat ────────────────────────────────────────────────

function DataTable({ tableData, onDownloadExcel, onDownloadPdf }) {
  if (!tableData?.rows?.length) return null
  const { title, headers, rows } = tableData

  return (
    <div style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      {/* Table title */}
      <div style={{ background: '#1e3a8a', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#bfdbfe', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 1, minWidth: 0, marginRight: 8 }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: '#93c5fd', flexShrink: 0 }}>{rows.length} rows</span>
      </div>

      {/* Scrollable table */}
      <div style={{ overflowX: 'auto', maxHeight: 280 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
              {headers.map((h, i) => (
                <th key={i} style={{
                  padding: '6px 8px', textAlign: i >= 6 ? 'right' : 'left',
                  color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap',
                  borderBottom: '1px solid #e5e7eb', fontSize: 10,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? '#ffffff' : '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '5px 8px', color: '#374151', whiteSpace: 'nowrap',
                    textAlign: ci >= 6 ? 'right' : 'left',
                    fontFamily: ci >= 6 ? 'monospace' : 'inherit',
                    fontWeight: ci === 0 ? 600 : 400,
                  }}>
                    {cell ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Download buttons */}
      <div style={{ padding: '8px 10px', background: '#f8fafc', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 6 }}>
        <button
          onClick={() => onDownloadExcel(tableData)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
            background: '#16a34a', color: 'white', border: 'none', borderRadius: 6,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <FileSpreadsheet size={12} /> Excel
        </button>
        <button
          onClick={() => onDownloadPdf(tableData)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
            background: '#dc2626', color: 'white', border: 'none', borderRadius: 6,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <FileText size={12} /> PDF
        </button>
      </div>
    </div>
  )
}

// ── Single chat message bubble ────────────────────────────────────────────────

function MessageBubble({ msg, onDownloadExcel, onDownloadPdf }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <div style={{
          maxWidth: '85%', background: '#1d4ed8', color: 'white',
          borderRadius: '16px 16px 4px 16px', padding: '10px 14px',
          fontSize: 13, lineHeight: 1.5,
        }}>
          {msg.content}
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: '#e5e7eb',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'flex-end',
        }}>
          <User size={14} color="#6b7280" />
        </div>
      </div>
    )
  }

  // Format Kala's text: convert **bold**, bullet lists, line breaks
  const formatText = (text) => {
    if (!text) return null
    return text.split('\n').map((line, i) => {
      // Bold: **text**
      const parts = line.split(/\*\*(.*?)\*\*/)
      const formatted = parts.map((part, j) =>
        j % 2 === 1 ? <strong key={j}>{part}</strong> : part
      )
      const isBullet = line.startsWith('- ') || line.startsWith('• ')
      return (
        <span key={i} style={{ display: isBullet ? 'flex' : 'block', gap: isBullet ? 6 : 0, marginBottom: 2 }}>
          {isBullet && <span style={{ color: '#93c5fd', fontWeight: 700, flexShrink: 0 }}>•</span>}
          <span>{isBullet ? formatted.slice(1) : formatted}</span>
        </span>
      )
    })
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      {/* Kala avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Sparkles size={13} color="white" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          background: '#ffffff', border: '1px solid #e5e7eb',
          borderRadius: '4px 16px 16px 16px', padding: '10px 14px',
          fontSize: 13, color: '#1f2937', lineHeight: 1.6,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          {formatText(msg.content)}
        </div>

        {msg.tableData && (
          <DataTable
            tableData={msg.tableData}
            onDownloadExcel={onDownloadExcel}
            onDownloadPdf={onDownloadPdf}
          />
        )}
      </div>
    </div>
  )
}

// ── Thinking indicator ────────────────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Sparkles size={13} color="white" />
      </div>
      <div style={{
        background: '#ffffff', border: '1px solid #e5e7eb',
        borderRadius: '4px 16px 16px 16px', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <Loader2 size={14} color="#1d4ed8" style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>Kala is thinking…</span>
      </div>
    </div>
  )
}

// ── Download helpers ──────────────────────────────────────────────────────────

function downloadExcel(tableData) {
  const ws = XLSX.utils.aoa_to_sheet([tableData.headers, ...tableData.rows])

  // Style header row bold (basic)
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = XLSX.utils.encode_cell({ r: 0, c })
    if (ws[cell]) ws[cell].s = { font: { bold: true } }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')

  const safeName = tableData.title.replace(/[^a-zA-Z0-9_\- ]/g, '_').replace(/\s+/g, '_')
  XLSX.writeFile(wb, `${safeName}.xlsx`)
}

function downloadPdf(tableData) {
  // Lazy-load jsPDF + autotable to keep bundle clean
  import('jspdf').then(({ default: jsPDF }) => {
    import('jspdf-autotable').then(() => {
      const doc = new jsPDF({ orientation: tableData.rows[0]?.length > 7 ? 'landscape' : 'portrait' })
      doc.setFontSize(12)
      doc.setTextColor(30, 58, 138)
      doc.text(tableData.title, 14, 16)
      doc.setTextColor(100)
      doc.setFontSize(9)
      doc.text(`Generated by Kala AI · ${new Date().toLocaleDateString('en-IN')}`, 14, 22)

      doc.autoTable({
        head: [tableData.headers],
        body: tableData.rows,
        startY: 27,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      })

      const safeName = tableData.title.replace(/[^a-zA-Z0-9_\- ]/g, '_').replace(/\s+/g, '_')
      doc.save(`${safeName}.pdf`)
    })
  })
}

// ── Main KalaPanel ────────────────────────────────────────────────────────────

const GREETING = "Hi! I'm **Kala**, your AI assistant for PnM DPR. I can help you:\n- Fetch utilization and fuel reports\n- Check today's DPR completion status\n- Analyze fleet performance by project, equipment type, or ownership\n\nTry asking me something, or use the quick prompts below."

export default function KalaPanel({ onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: GREETING },
  ])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [listening, setListening] = useState(false)
  const [error,     setError]     = useState(null)

  const bottomRef  = useRef()
  const inputRef   = useRef()
  const recogRef   = useRef()

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Voice input ──
  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setError('Voice input requires Chrome or Edge browser.')
      return
    }
    const r = new SR()
    r.lang = 'en-IN'
    r.continuous = false
    r.interimResults = false
    r.onresult = (e) => { setInput(e.results[0][0].transcript); setListening(false) }
    r.onerror  = () => setListening(false)
    r.onend    = () => setListening(false)
    recogRef.current = r
    r.start()
    setListening(true)
  }
  const stopListening = () => { recogRef.current?.stop(); setListening(false) }

  // ── Send message ──
  const sendMessage = useCallback(async (text) => {
    const txt = (text || input).trim()
    if (!txt || loading) return

    setError(null)
    setInput('')
    const userMsg   = { role: 'user', content: txt }
    const nextMsgs  = [...messages, userMsg]
    setMessages(nextMsgs)
    setLoading(true)

    // Only send the actual conversation (skip the hardcoded greeting)
    const apiMessages = nextMsgs
      .slice(1)                         // skip greeting
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await chatWithKala({ messages: apiMessages })
      const { reply, tableData } = res.data
      setMessages(m => [...m, { role: 'assistant', content: reply, tableData }])
    } catch (err) {
      const msg = err.response?.data?.error || 'Unable to reach Kala. Check that ANTHROPIC_API_KEY is configured in the backend.'
      setError(msg)
      setMessages(m => [...m, { role: 'assistant', content: `Sorry, I ran into an issue: ${msg}` }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, loading, messages])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const hasRealConversation = messages.length > 1

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#f8fafc', fontFamily: 'inherit',
    }}>

      {/* ── Header ── */}
      <div style={{
        flexShrink: 0, padding: '14px 16px',
        background: 'linear-gradient(135deg, #0b1e3d 0%, #1a3a6b 60%, #1a5c8a 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)',
            border: '1.5px solid rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={17} color="white" />
          </div>
          <div>
            <p style={{ color: '#ffffff', fontWeight: 800, fontSize: 15, letterSpacing: '0.01em' }}>Kala</p>
            <p style={{ color: '#60a5fa', fontSize: 10, fontWeight: 500 }}>AI Agent · PnM Intelligence</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasRealConversation && (
            <button
              onClick={() => setMessages([{ role: 'assistant', content: GREETING }])}
              title="Clear conversation"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#93c5fd', display: 'flex', alignItems: 'center' }}
            >
              <RefreshCw size={13} />
            </button>
          )}
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#93c5fd', display: 'flex', alignItems: 'center' }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Message list ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            onDownloadExcel={downloadExcel}
            onDownloadPdf={downloadPdf}
          />
        ))}
        {loading && <ThinkingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          margin: '0 12px', padding: '8px 12px', borderRadius: 8,
          background: '#fef2f2', border: '1px solid #fecaca',
          fontSize: 12, color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      {/* ── Input area ── */}
      <div style={{ flexShrink: 0, padding: '10px 12px 14px', borderTop: '1px solid #e5e7eb', background: '#ffffff' }}>

        {/* Quick prompts — visible only at start */}
        {!hasRealConversation && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {QUICK_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => sendMessage(p.text)}
                style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 20,
                  border: '1.5px solid #bfdbfe', background: '#eff6ff',
                  color: '#1d4ed8', cursor: 'pointer', fontWeight: 500,
                  whiteSpace: 'nowrap', transition: 'all 0.1s',
                }}
                onMouseEnter={e => { e.target.style.background = '#dbeafe' }}
                onMouseLeave={e => { e.target.style.background = '#eff6ff' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={listening ? 'Listening…' : 'Ask Kala anything…'}
            disabled={loading}
            style={{
              flex: 1, border: `1.5px solid ${listening ? '#1d4ed8' : '#e5e7eb'}`,
              borderRadius: 10, padding: '9px 12px', fontSize: 13,
              outline: 'none', background: listening ? '#eff6ff' : '#ffffff',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { if (!listening) e.target.style.borderColor = '#93c5fd' }}
            onBlur={e  => { if (!listening) e.target.style.borderColor = '#e5e7eb' }}
          />

          {/* Mic button */}
          <button
            onClick={listening ? stopListening : startListening}
            title={listening ? 'Stop listening' : 'Voice input'}
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              border: listening ? '2px solid #ef4444' : '1.5px solid #e5e7eb',
              background: listening ? '#fef2f2' : '#f3f4f6',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: listening ? 'pulse 1.5s infinite' : 'none',
            }}
          >
            {listening
              ? <MicOff size={16} color="#ef4444" />
              : <Mic size={16} color="#6b7280" />
            }
          </button>

          {/* Send button */}
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            title="Send"
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: input.trim() && !loading ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#e5e7eb',
              border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: input.trim() && !loading ? '0 2px 8px rgba(37,99,235,0.35)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <SendHorizonal size={16} color={input.trim() && !loading ? 'white' : '#9ca3af'} />
          </button>
        </div>

        <p style={{ fontSize: 10, color: '#d1d5db', marginTop: 7, textAlign: 'center' }}>
          Kala · Powered by Claude AI · RVR Projects
        </p>
      </div>
    </div>
  )
}
