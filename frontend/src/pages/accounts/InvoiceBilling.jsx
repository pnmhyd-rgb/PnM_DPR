import { useState } from 'react'
import { Calculator, Users } from 'lucide-react'
import InvoiceCalculation from './InvoiceCalculation'
import InvoiceCalculationOwnership from './InvoiceCalculationOwnership'

const tabs = [
  { key: 'hire', label: 'Hire / WO Bill',   Icon: Calculator },
  { key: 'own',  label: 'Ownership Bill',   Icon: Users      },
]

export default function InvoiceBilling({ defaultTab = 'hire' }) {
  const [tab, setTab] = useState(defaultTab)

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-0 w-fit mx-0">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === key
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'hire' ? <InvoiceCalculation /> : <InvoiceCalculationOwnership />}
    </div>
  )
}
