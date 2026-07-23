export const today = () => new Date().toISOString().split('T')[0]

export const fmtMoney = (v) =>
  v != null ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'

export const fmtNum = (v) =>
  v != null ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN') : '—'

export const monthStart = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export const formatNum = (val, decimals = 2) => {
  const n = parseFloat(val)
  return isNaN(n) ? '-' : n.toFixed(decimals)
}

export const utilColorClass = (pct) => {
  const p = parseFloat(pct)
  if (isNaN(p)) return 'bg-gray-100 text-gray-500'
  if (p >= 90) return 'bg-green-100 text-green-700'
  if (p >= 70) return 'bg-blue-100 text-blue-700'
  if (p >= 50) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-600'
}

export const utilLabel = (pct) => {
  const p = parseFloat(pct)
  if (isNaN(p)) return '-'
  if (p >= 90) return 'Excellent'
  if (p >= 70) return 'Good'
  if (p >= 50) return 'Average'
  return 'Low'
}

export const exportCSV = (headers, rows, filename) => {
  const escape = (v) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
