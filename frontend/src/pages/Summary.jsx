import { useState, useEffect } from 'react'
import { getSummary } from '../lib/api'
import { today, formatNum } from '../lib/utils'
import { Download } from 'lucide-react'
import DPRDownloadModal from './DPRDownloadModal'

function Stat({ label, value, color = 'text-gray-800' }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value ?? '—'}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

export default function Summary() {
  const [date, setDate]         = useState(today())
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [showDPRModal, setShowDPRModal] = useState(false)

  useEffect(() => {
    setLoading(true)
    getSummary({ date }).then(r => setData(r.data.data)).finally(() => setLoading(false))
  }, [date])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">Daily Summary</h1>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <button
            onClick={() => setShowDPRModal(true)}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Download size={15} />
            Download DPR
          </button>
        </div>
      </div>

      {showDPRModal && <DPRDownloadModal onClose={() => setShowDPRModal(false)} />}

      {loading && (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      )}

      <div className="grid gap-4">
        {data.map(proj => {
          const total    = parseInt(proj.total_machines) || 0
          const reported = parseInt(proj.reported_machines) || 0
          const coverage = total > 0 ? Math.round((reported / total) * 100) : 0
          const coverageColor = coverage >= 80 ? 'text-green-600' : coverage >= 50 ? 'text-yellow-600' : 'text-red-500'
          const barColor     = coverage >= 80 ? 'bg-green-500' : coverage >= 50 ? 'bg-yellow-400' : 'bg-red-400'

          return (
            <div key={proj.project_code} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{proj.project_code}</h2>
                  <p className="text-xs text-gray-400">{proj.project_name}</p>
                </div>
                <div className="text-right">
                  <p className={`text-3xl font-black ${coverageColor}`}>{coverage}%</p>
                  <p className="text-xs text-gray-400">DPR Coverage</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Stat label="Total Machines" value={proj.total_machines} />
                <Stat label="DPR Submitted"  value={proj.reported_machines} color={reported > 0 ? 'text-blue-700' : 'text-gray-800'} />
                <Stat label="Own"             value={proj.own_machines} />
                <Stat label="Hire"            value={proj.hire_machines} />
                <Stat
                  label="Avg Utilization"
                  value={`${formatNum(proj.avg_utilization, 1)}%`}
                  color={parseFloat(proj.avg_utilization) >= 70 ? 'text-blue-700' : 'text-gray-600'}
                />
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>{reported} of {total} machines reported</span>
                  <span>{coverage}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${coverage}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
        {!loading && data.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">No project data found</p>
        )}
      </div>
    </div>
  )
}
