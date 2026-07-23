import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Entry from './pages/Entry'
import Dashboard from './pages/Dashboard'
import Utilization from './pages/Utilization'
import Summary from './pages/Summary'
import FuelEntries from './pages/FuelEntries'
import ServiceEntries from './pages/ServiceEntries'
import Operators from './pages/hr/Operators'
import Attendance from './pages/hr/Attendance'
import SpareParts from './pages/inventory/SpareParts'
import BreakdownReport from './pages/reports/BreakdownReport'
import Reports from './pages/reports/Reports'
import Payroll from './pages/hr/Payroll'
import Projects from './pages/admin/Projects'
import Machines from './pages/admin/Machines'
import AdminEntries from './pages/admin/Entries'
import Users from './pages/admin/Users'
import EquipmentTypes from './pages/admin/EquipmentTypes'
import UomTypes from './pages/admin/UomTypes'
import Vendors from './pages/admin/Vendors'
import ReadingMaster from './pages/admin/ReadingMaster'
import ReadingMappings from './pages/admin/ReadingMappings'
import AssetMatrix from './pages/admin/AssetMatrix'
import AssetGroupConfig from './pages/admin/AssetGroupConfig'
import AssetTypeConfig      from './pages/admin/AssetTypeConfig'
import AssetCategoryDetail from './pages/admin/AssetCategoryDetail'
import OwnMeasurable from './pages/asset-register/OwnMeasurable'
import OwnNonMeasurable from './pages/asset-register/OwnNonMeasurable'
import HireAssets from './pages/asset-register/HireAssets'
import MyDashboard from './pages/MyDashboard'
import HireWorkOrders from './pages/hire/HireWorkOrders'
import HireIndents from './pages/hire/HireIndents'

import Compliance from './pages/compliance/Compliance'
import Permissions from './pages/admin/Permissions'
import FuelStation from './pages/FuelStation'
import InvoiceRule from './pages/accounts/InvoiceRule'
import InvoiceBilling from './pages/accounts/InvoiceBilling'
import GeneratedInvoices from './pages/accounts/GeneratedInvoices'
import InventoryDashboard from './pages/inventory/InventoryDashboard'
import SparePartsInventory from './pages/inventory/SparePartsInventory'
import WarehouseManagement from './pages/inventory/WarehouseManagement'
import GoodsReceipt from './pages/inventory/GoodsReceipt'
import StockTransfer from './pages/inventory/StockTransfer'
import StockAdjustment from './pages/inventory/StockAdjustment'
import Consumption from './pages/inventory/Consumption'
import SparePartsReturn from './pages/inventory/SparePartsReturn'
import StockLedger from './pages/inventory/StockLedger'
import ServiceCheckSheets from './pages/service/ServiceCheckSheets'
import ServiceTickets from './pages/service/Tickets'

function ProtectedLayout() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Layout><Outlet /></Layout>
}

function AdminGuard() {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/my-dashboard" replace />
  return <Outlet />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedLayout />}>
            <Route index element={<Navigate to="/my-dashboard" replace />} />
            <Route path="my-dashboard" element={<MyDashboard />} />
            <Route path="entry"       element={<Entry />} />
            <Route path="dashboard"   element={<Dashboard />} />
            <Route path="utilization" element={<Utilization />} />
            <Route path="summary"     element={<Summary />} />
            <Route path="fuel"         element={<FuelEntries />} />
            <Route path="fuel-station" element={<FuelStation />} />
            <Route path="compliance"  element={<Compliance />} />
            <Route path="hire/indents"     element={<HireIndents />} />
            <Route path="hire/work-orders" element={<HireWorkOrders defaultTab="wo" />} />
            <Route path="hire/vendors"     element={<HireWorkOrders defaultTab="vendors" />} />

            <Route path="accounts/invoice-rules"          element={<InvoiceRule />} />
            <Route path="accounts/invoice-calculation"    element={<InvoiceBilling defaultTab="own" />} />
            <Route path="accounts/generated-invoices"     element={<GeneratedInvoices />} />
            <Route path="inventory/dashboard"    element={<InventoryDashboard />} />
            <Route path="inventory/items"        element={<SparePartsInventory />} />
            <Route path="inventory/warehouses"   element={<WarehouseManagement />} />
            <Route path="inventory/grn"          element={<GoodsReceipt />} />
            <Route path="inventory/transfers"    element={<StockTransfer />} />
            <Route path="inventory/adjustments"  element={<StockAdjustment />} />
            <Route path="inventory/consumption"  element={<Consumption />} />
            <Route path="inventory/returns"      element={<SparePartsReturn />} />
            <Route path="inventory/ledger"       element={<StockLedger />} />
            <Route path="service"               element={<ServiceEntries />} />
            <Route path="service/check-sheets" element={<ServiceCheckSheets />} />
            <Route path="service/tickets"      element={<ServiceTickets />} />
            <Route path="hr/operators"           element={<Operators />} />
            <Route path="hr/attendance"          element={<Attendance />} />
            <Route path="hr/payroll"             element={<Payroll />} />
            <Route path="inventory/spare-parts"       element={<SpareParts />} />
            <Route path="reports"                       element={<Reports />} />
            <Route path="reports/breakdown"            element={<BreakdownReport />} />
            <Route path="asset-register/own/measurable"     element={<OwnMeasurable />} />
            <Route path="asset-register/own/non-measurable" element={<OwnNonMeasurable />} />
            <Route path="asset-register/hire"               element={<HireAssets />} />
            <Route path="admin" element={<AdminGuard />}>
              <Route path="projects"        element={<Projects />} />
              <Route path="machines"        element={<Machines />} />
              <Route path="entries"         element={<AdminEntries />} />
              <Route path="users"           element={<Users />} />
              <Route path="equipment-types"  element={<EquipmentTypes />} />
              <Route path="uom-types"        element={<UomTypes />} />
              <Route path="vendors"          element={<Vendors />} />
              <Route path="reading-master"   element={<ReadingMaster />} />
              <Route path="reading-mappings" element={<ReadingMappings />} />
              <Route path="asset-matrix"              element={<AssetMatrix />} />
              <Route path="asset-group-configs/:group" element={<AssetGroupConfig />} />
              <Route path="asset-type-configs/:id"    element={<AssetTypeConfig />} />
              <Route path="asset-category/:group"     element={<AssetCategoryDetail />} />
              <Route path="permissions"               element={<Permissions />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
