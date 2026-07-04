import axios from 'axios'

const client = axios.create({ baseURL: '/api' })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const login            = (data)        => client.post('/auth/login', data)
export const getMe            = ()            => client.get('/auth/me')
export const updateMe         = (data)        => client.put('/auth/me', data)

export const getProjects      = ()            => client.get('/projects')
export const createProject    = (data)        => client.post('/projects', data)
export const updateProject    = (id, data)    => client.put(`/projects/${id}`, data)
export const deleteProject    = (id)          => client.delete(`/projects/${id}`)

export const getMachines        = (params)      => client.get('/machines', { params })
export const getFleetSummary    = (params)      => client.get('/machines/fleet-summary', { params })
export const getFleetList       = (params)      => client.get('/machines/fleet-list',    { params })
export const createMachine      = (data)        => client.post('/machines', data)
export const bulkCreateMachines         = (rows) => client.post('/machines/bulk', { rows })
export const regenerateMachineNicknames = ()     => client.post('/machines/regenerate-nicknames')
export const updateMachine      = (id, data)    => client.put(`/machines/${id}`, data)
export const deleteMachine      = (id, data)    => client.delete(`/machines/${id}`, data ? { data } : undefined)
export const transferMachine    = (id, data)    => client.put(`/machines/${id}/transfer`, data)
export const hardDeleteMachine  = (id)          => client.delete(`/machines/${id}/hard`)

export const getDesignations     = ()         => client.get('/designations')
export const createDesignation   = (data)     => client.post('/designations', data)
export const deleteDesignation   = (id)       => client.delete(`/designations/${id}`)

export const getUomTypes      = ()            => client.get('/uom')
export const createUomType    = (data)        => client.post('/uom', data)
export const deleteUomType    = (id)          => client.delete(`/uom/${id}`)

export const getFuelTypeOptions    = ()       => client.get('/fuel-type-options')
export const createFuelTypeOption  = (data)   => client.post('/fuel-type-options', data)
export const deleteFuelTypeOption  = (id)     => client.delete(`/fuel-type-options/${id}`)

export const getVendors       = ()            => client.get('/vendors')
export const upsertVendor     = (data)        => client.post('/vendors', data)
export const deleteVendor     = (id)          => client.delete(`/vendors/${id}`)

export const chatWithKala        = (data)        => client.post('/kala/chat', data)

export const getEntries          = (params)      => client.get('/entries', { params })
export const getPreviousClosing  = (params)      => client.get('/entries/previous-closing', { params })
export const getDprStatus              = (params) => client.get('/entries/dpr-status',              { params })
export const getMonthlyStatus          = (params) => client.get('/entries/monthly-status',          { params })
export const getMonthlyProjectStatus   = (params) => client.get('/entries/monthly-project-status',  { params })
export const createEntry         = (data)        => client.post('/entries', data)
export const updateEntry         = (id, data)    => client.put(`/entries/${id}`, data)
export const updateEntryStatus   = (id, status)  => client.patch(`/entries/${id}/status`, { status })
export const deleteEntry         = (id)          => client.delete(`/entries/${id}`)

export const getUtilization   = (params)      => client.get('/reports/utilization', { params })
export const getSummary       = (params)      => client.get('/reports/summary', { params })

export const getEquipmentTypes        = ()          => client.get('/equipment-types')
export const createEquipmentType      = (data)       => client.post('/equipment-types', data)
export const bulkCreateEquipmentTypes = (items)      => client.post('/equipment-types/bulk', { items })
export const updateEquipmentType      = (id, data)   => client.put(`/equipment-types/${id}`, data)
export const deleteEquipmentType      = (id, force)  => client.delete(`/equipment-types/${id}${force ? '?force=true' : ''}`)

export const getUsers         = ()            => client.get('/users')
export const createUser       = (data)        => client.post('/users', data)
export const bulkCreateUsers  = (rows)        => client.post('/users/bulk', { rows })
export const updateUser       = (id, data)    => client.put(`/users/${id}`, data)
export const deleteUser       = (id)          => client.delete(`/users/${id}`)

export const getOperators       = (params)   => client.get('/operators', { params })
export const createOperator     = (data)     => client.post('/operators', data)
export const updateOperator     = (id, data) => client.put(`/operators/${id}`, data)
export const deleteOperator     = (id)       => client.delete(`/operators/${id}`)

export const getAttendance      = (params)   => client.get('/attendance', { params })
export const createAttendance   = (data)     => client.post('/attendance', data)
export const deleteAttendance   = (id)       => client.delete(`/attendance/${id}`)

export const getFuelEntries    = (params)     => client.get('/fuel', { params })
export const createFuelEntry   = (data)       => client.post('/fuel', data)
export const deleteFuelEntry   = (id)         => client.delete(`/fuel/${id}`)

export const getFuelRecord     = (params)     => client.get('/fuel-records', { params })
export const upsertFuelRecord  = (data)       => client.post('/fuel-records', data)

export const getMeterResets    = (params)     => client.get('/meter-resets', { params })
export const createMeterReset  = (data)       => client.post('/meter-resets', data)
export const deleteMeterReset  = (id)         => client.delete(`/meter-resets/${id}`)

export const getServiceEntries  = (params)   => client.get('/service', { params })
export const createServiceEntry = (data)     => client.post('/service', data)
export const deleteServiceEntry = (id)       => client.delete(`/service/${id}`)

export const getPayrollRuns         = (params)      => client.get('/payroll', { params })
export const getPayrollItems        = (runId)       => client.get(`/payroll/${runId}/items`)
export const generatePayroll        = (data)        => client.post('/payroll/generate', data)
export const updatePayrollStatus    = (id, data)    => client.patch(`/payroll/${id}`, data)
export const deletePayrollRun       = (id)          => client.delete(`/payroll/${id}`)

export const getBreakdownIncidents  = (params)      => client.get('/breakdown', { params })
export const createBreakdownIncident = (data)       => client.post('/breakdown', data)
export const updateBreakdownStatus  = (id, data)    => client.patch(`/breakdown/${id}`, data)
export const deleteBreakdownIncident = (id)         => client.delete(`/breakdown/${id}`)

export const getBreakdownSummary    = (params)      => client.get('/reports/breakdown-summary', { params })

// Hire Work Orders
export const getHireVendors          = ()            => client.get('/hire/vendors')
export const createHireVendor        = (data)        => client.post('/hire/vendors', data)
export const updateHireVendor        = (id, data)    => client.put(`/hire/vendors/${id}`, data)
export const deleteHireVendor        = (id)          => client.delete(`/hire/vendors/${id}`)

export const getHireWorkOrders       = (params)      => client.get('/hire', { params })
export const getHireWorkOrder        = (id)          => client.get(`/hire/${id}`)
export const createHireWorkOrder     = (data)        => client.post('/hire', data)
export const updateHireWorkOrder     = (id, data)    => client.put(`/hire/${id}`, data)
export const deleteHireWorkOrder     = (id)          => client.delete(`/hire/${id}`)
export const submitHireWorkOrder     = (id)          => client.patch(`/hire/${id}/submit`)
export const approveHireWOL1         = (id, data)    => client.patch(`/hire/${id}/approve-l1`, data)
export const approveHireWOFinal      = (id, data)    => client.patch(`/hire/${id}/approve`, data)
export const rejectHireWorkOrder     = (id, data)    => client.patch(`/hire/${id}/reject`, data)
export const renewHireWorkOrder      = (id, data)    => client.post(`/hire/${id}/renew`, data)

export const getTermsLibrary         = ()            => client.get('/hire/terms-library')
export const createTermsLibraryItem  = (data)        => client.post('/hire/terms-library', data)
export const updateTermsLibraryItem  = (id, data)    => client.put(`/hire/terms-library/${id}`, data)
export const deleteTermsLibraryItem  = (id)          => client.delete(`/hire/terms-library/${id}`)

export const getTermsCategories      = ()            => client.get('/hire/terms-categories')
export const createTermsCategory     = (data)        => client.post('/hire/terms-categories', data)
export const deleteTermsCategory     = (id)          => client.delete(`/hire/terms-categories/${id}`)

export const getSignatoryDesignations    = ()            => client.get('/hire/signatory-designations')
export const createSignatoryDesignation  = (data)        => client.post('/hire/signatory-designations', data)
export const deleteSignatoryDesignation  = (id)          => client.delete(`/hire/signatory-designations/${id}`)

export const getSignatories          = ()            => client.get('/hire/signatories')
export const createSignatory         = (data)        => client.post('/hire/signatories', data)
export const updateSignatory         = (id, data)    => client.put(`/hire/signatories/${id}`, data)
export const deleteSignatory         = (id)          => client.delete(`/hire/signatories/${id}`)

// Hire Indents
export const getHireIndents          = (params)      => client.get('/hire-indents', { params })
export const getHireIndent           = (id)          => client.get(`/hire-indents/${id}`)
export const createHireIndent        = (data)        => client.post('/hire-indents', data)
export const updateHireIndent        = (id, data)    => client.put(`/hire-indents/${id}`, data)
export const deleteHireIndent        = (id)          => client.delete(`/hire-indents/${id}`)
export const submitHireIndent        = (id)          => client.patch(`/hire-indents/${id}/submit`)
export const approveHireIndentL1     = (id, data)    => client.patch(`/hire-indents/${id}/approve-l1`, data)
export const approveHireIndentFinal  = (id, data)    => client.patch(`/hire-indents/${id}/approve`, data)
export const rejectHireIndent        = (id, data)    => client.patch(`/hire-indents/${id}/reject`, data)
export const convertIndentToWO       = (id)          => client.post(`/hire-indents/${id}/convert`)

// Hire Billing
export const getHireBills           = (params)      => client.get('/hire-billing', { params })
export const getHireBill            = (id)          => client.get(`/hire-billing/${id}`)
export const fetchHireDprData       = (params)      => client.get('/hire-billing/fetch-dpr', { params })
export const createHireBill         = (data)        => client.post('/hire-billing', data)
export const updateHireBill         = (id, data)    => client.put(`/hire-billing/${id}`, data)
export const deleteHireBill         = (id)          => client.delete(`/hire-billing/${id}`)
export const submitHireBill         = (id)          => client.patch(`/hire-billing/${id}/submit`)
export const approveHireBill        = (id, data)    => client.patch(`/hire-billing/${id}/approve`, data)
export const rejectHireBill         = (id, data)    => client.patch(`/hire-billing/${id}/reject`, data)
export const markHireBillPaid       = (id, data)    => client.patch(`/hire-billing/${id}/pay`, data)
export const updateWoBillingRules   = (woId, data)  => client.patch(`/hire-billing/wo/${woId}/billing-rules`, data)

// GST Verification (reusable for any entity)
export const verifyGSTApi       = (gstin, excludeId = null) =>
  client.post('/gst/verify', { gstin, ...(excludeId ? { exclude_id: excludeId } : {}) })
export const validateGSTLocal   = (gstin)                   => client.get('/gst/validate',        { params: { gstin } })
export const checkGSTDuplicate  = (gstin, excludeId = null) =>
  client.get('/gst/check-duplicate', { params: { gstin, ...(excludeId ? { exclude_id: excludeId } : {}) } })

export const getSpareTransactions  = (params) => client.get('/spare-parts', { params })
export const getSpareStockSummary  = (params) => client.get('/spare-parts/stock-summary', { params })
export const createSpareTransaction = (data)  => client.post('/spare-parts', data)
export const deleteSpareTransaction = (id)    => client.delete(`/spare-parts/${id}`)

// Machine Documents
export const getMachineDocuments      = (machineId) => client.get(`/machine-documents/${machineId}`)
export const createMachineDocument    = (data)      => client.post('/machine-documents', data)
export const deleteMachineDocument    = (id)        => client.delete(`/machine-documents/${id}`)
export const getMachineDocumentUrl    = (id)        => client.get(`/machine-documents/${id}/download`)

// RTA Compliance
export const getComplianceAll        = (params)      => client.get('/compliance', { params })
export const getComplianceSummary    = ()            => client.get('/compliance/summary')
export const getComplianceUpcoming   = (days)        => client.get('/compliance/upcoming', { params: { days } })
export const getMachineCompliance    = (machineId)   => client.get(`/compliance/machine/${machineId}`)
export const getComplianceAttachment = (id)          => client.get(`/compliance/${id}/attachment`, { responseType: 'blob' })
export const batchUpsertCompliance   = (data)        => client.post('/compliance/batch', data)
export const deleteCompliance        = (id)          => client.delete(`/compliance/${id}`)

// Reading Master
export const getReadingTypes        = ()             => client.get('/reading-types')
export const createReadingType      = (data)         => client.post('/reading-types', data)
export const updateReadingType      = (id, data)     => client.put(`/reading-types/${id}`, data)
export const deleteReadingType      = (id, force)    => client.delete(`/reading-types/${id}${force ? '?force=true' : ''}`)

// Reading Mappings
export const getReadingMappings       = (params)     => client.get('/reading-mappings', { params })
export const getReadingMappingsGrouped = ()          => client.get('/reading-mappings/grouped')
export const createReadingMapping     = (data)       => client.post('/reading-mappings', data)
export const updateReadingMapping     = (id, data)   => client.put(`/reading-mappings/${id}`, data)
export const deleteReadingMapping     = (id)         => client.delete(`/reading-mappings/${id}`)
export const bulkReplaceReadingMappings = (data)     => client.put('/reading-mappings/bulk-replace', data)

// Machine Reading Configs
export const getMachineReadingConfigs   = (machineId)       => client.get(`/machine-reading-configs/${machineId}`)
export const setMachineReadingConfigs   = (machineId, data) => client.put(`/machine-reading-configs/${machineId}/set`, data)
export const toggleMachineReadingConfig = (id, data)        => client.patch(`/machine-reading-configs/${id}/toggle`, data)
export const resetMachineReadingConfigs    = (machineId)       => client.post(`/machines/${machineId}/reset-reading-configs`)
export const propagateMachineReadingConfigs = (eqTypeName)    => client.post('/machines/propagate-reading-configs', { equipment_type_name: eqTypeName })

// Asset Matrix
export const searchAssetMatrix      = (q)           => client.get('/asset-matrix/search', { params: { q } })
export const getAssetMatrix         = (params)      => client.get('/asset-matrix', { params })
export const getAssetMatrixOne      = (amId)        => client.get(`/asset-matrix/${amId}`)
export const getAssetMatrixTypes    = ()            => client.get('/asset-matrix/asset-types')
export const createAssetMatrix      = (data)        => client.post('/asset-matrix', data)
export const updateAssetMatrix      = (amId, data)  => client.put(`/asset-matrix/${amId}`, data)
