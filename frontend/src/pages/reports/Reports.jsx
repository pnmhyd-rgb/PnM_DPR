import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import DPRDownloadModal from '../DPRDownloadModal'
import { BarChart2, Fuel, Activity, Building2, ShieldCheck, ChevronRight } from 'lucide-react'

const SECTIONS = [
  {
    id: 'asset',
    title: 'Asset Reports',
    icon: BarChart2,
    headerColor: '#1d4ed8',
    headerBg: '#eff6ff',
    dotColor: '#3b82f6',
    hoverBg: '#f0f9ff',
    items: [
      { label: 'Asset Status', status: 'soon' },
      { label: 'Daily Progress Report (DPR)', action: 'dpr', status: 'active' },
      { label: 'Asset Wise Utilisation and Availability', href: '/utilization', status: 'active' },
      { label: 'Asset Data', href: '/asset-register/own/measurable', status: 'active' },
      { label: 'Date Wise Running With Analysis', status: 'soon' },
      { label: 'CounterLog History Report', status: 'soon' },
    ],
  },
  {
    id: 'fuel',
    title: 'Fuel Reports',
    icon: Fuel,
    headerColor: '#c2410c',
    headerBg: '#fff7ed',
    dotColor: '#f97316',
    hoverBg: '#fff7ed',
    items: [
      { label: 'Fuel Consumption Report', href: '/fuel-station', status: 'active' },
      { label: 'Date-wise Fuel Feed-In Report', status: 'soon' },
      { label: 'Shift Wise Fuel Issue Report', status: 'soon' },
    ],
  },
  {
    id: 'productivity',
    title: 'Productivity Reports',
    icon: Activity,
    headerColor: '#166534',
    headerBg: '#f0fdf4',
    dotColor: '#16a34a',
    hoverBg: '#f0fdf4',
    items: [
      { label: 'Site Wise Productivity', status: 'soon' },
      { label: 'Date Wise Productivity', status: 'soon' },
      { label: 'Site Wise Fuel Productivity', status: 'soon' },
      { label: 'Asset Wise Fuel Productivity', status: 'soon' },
      { label: 'Shift Wise Productivity Report', status: 'soon' },
    ],
  },
  {
    id: 'account',
    title: 'Account Reports',
    icon: Building2,
    headerColor: '#6b21a8',
    headerBg: '#faf5ff',
    dotColor: '#9333ea',
    hoverBg: '#faf5ff',
    items: [
      { label: 'Invoice Calculation', href: '/hire/billing', status: 'active' },
    ],
  },
  {
    id: 'compliance',
    title: 'Asset Compliance Reports',
    icon: ShieldCheck,
    headerColor: '#991b1b',
    headerBg: '#fef2f2',
    dotColor: '#dc2626',
    hoverBg: '#fef2f2',
    items: [
      { label: 'Asset wise Compliance Report', href: '/compliance', status: 'active' },
      { label: 'Compliance Listing', href: '/compliance', status: 'active' },
    ],
  },
]

export default function Reports() {
  const navigate = useNavigate()
  const [showDPR, setShowDPR] = useState(false)

  const handleItem = (item) => {
    if (item.status === 'soon') return
    if (item.action === 'dpr') { setShowDPR(true); return }
    if (item.href) navigate(item.href)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Select a report to view or download</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {SECTIONS.map(section => {
          const Icon = section.icon
          return (
            <div key={section.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              {/* Section header */}
              <div style={{
                background: section.headerBg,
                borderBottom: '1px solid #e5e7eb',
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Icon size={16} style={{ color: section.headerColor }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: section.headerColor, letterSpacing: '0.01em' }}>
                  {section.title}
                </span>
              </div>

              {/* Report items */}
              <div>
                {section.items.map((item, i) => {
                  const isSoon = item.status === 'soon'
                  return (
                    <button
                      key={i}
                      onClick={() => handleItem(item)}
                      disabled={isSoon}
                      style={{
                        width: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '11px 16px',
                        background: 'transparent', border: 'none',
                        borderBottom: i < section.items.length - 1 ? '1px solid #f3f4f6' : 'none',
                        cursor: isSoon ? 'default' : 'pointer',
                        textAlign: 'left', transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isSoon) e.currentTarget.style.background = section.hoverBg }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                          background: isSoon ? '#d1d5db' : section.dotColor,
                        }} />
                        <span style={{ fontSize: 13, color: isSoon ? '#9ca3af' : '#111827', fontWeight: 500 }}>
                          {item.label}
                        </span>
                      </div>
                      {isSoon ? (
                        <span style={{
                          fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                          background: '#f3f4f6', color: '#9ca3af',
                          padding: '2px 8px', borderRadius: 99,
                        }}>
                          Coming Soon
                        </span>
                      ) : (
                        <ChevronRight size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {showDPR && <DPRDownloadModal onClose={() => setShowDPR(false)} />}
    </div>
  )
}
