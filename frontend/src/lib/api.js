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

export const getMachines      = (params)      => client.get('/machines', { params })
export const createMachine    = (data)        => client.post('/machines', data)
export const bulkCreateMachines = (rows)      => client.post('/machines/bulk', { rows })
export const updateMachine    = (id, data)    => client.put(`/machines/${id}`, data)
export const deleteMachine    = (id)          => client.delete(`/machines/${id}`)

export const getDesignations     = ()         => client.get('/designations')
export const createDesignation   = (data)     => client.post('/designations', data)
export const deleteDesignation   = (id)       => client.delete(`/designations/${id}`)

export const getUomTypes      = ()            => client.get('/uom')
export const createUomType    = (data)        => client.post('/uom', data)
export const deleteUomType    = (id)          => client.delete(`/uom/${id}`)

export const getVendors       = ()            => client.get('/vendors')
export const upsertVendor     = (data)        => client.post('/vendors', data)

export const getEntries          = (params)      => client.get('/entries', { params })
export const getPreviousClosing  = (params)      => client.get('/entries/previous-closing', { params })
export const createEntry         = (data)        => client.post('/entries', data)
export const updateEntry         = (id, data)    => client.put(`/entries/${id}`, data)
export const deleteEntry         = (id)          => client.delete(`/entries/${id}`)

export const getUtilization   = (params)      => client.get('/reports/utilization', { params })
export const getSummary       = (params)      => client.get('/reports/summary', { params })

export const getEquipmentTypes   = ()         => client.get('/equipment-types')
export const createEquipmentType = (data)     => client.post('/equipment-types', data)
export const deleteEquipmentType = (id)       => client.delete(`/equipment-types/${id}`)

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

export const getSpareTransactions  = (params) => client.get('/spare-parts', { params })
export const getSpareStockSummary  = (params) => client.get('/spare-parts/stock-summary', { params })
export const createSpareTransaction = (data)  => client.post('/spare-parts', data)
export const deleteSpareTransaction = (id)    => client.delete(`/spare-parts/${id}`)
