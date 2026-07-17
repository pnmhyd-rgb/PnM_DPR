/**
 * Unit tests for Invoice Rules – Ownership linking
 *
 * Run:  npx jest tests/invoiceRulesOwnership.test.js
 *
 * These tests mock the DB client and validate:
 *  1. Asset filtering by ownership (vendor)
 *  2. Changing ownership resets asset (frontend validation logic)
 *  3. Validation blocks mismatched ownership and asset
 *  4. Successful save with valid ownership + asset
 *  5. Own-fleet assets accept ownership_vendor = 'Own'
 */

// ── Mock db module ────────────────────────────────────────────────────────────
const mockQuery  = jest.fn()
const mockCommit = jest.fn()
const mockRollback = jest.fn()
const mockRelease  = jest.fn()
const mockClient = {
  query:   mockQuery,
  release: mockRelease,
}

jest.mock('../src/config/db', () => ({
  query:     jest.fn(),
  getClient: jest.fn(),
}))

const db = require('../src/config/db')

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body = {}, params = {}, user = { id: 1 }) {
  return { body, params, user }
}

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json   = jest.fn().mockReturnValue(res)
  return res
}

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks()
  mockQuery.mockReset()
  mockCommit.mockResolvedValue()
  mockRollback.mockResolvedValue()
  mockRelease.mockReturnValue(undefined)

  // Default client setup
  db.getClient.mockResolvedValue({
    query:   mockQuery,
    release: mockRelease,
  })
})

// ── Test: asset filtering by vendor (getAll JOIN) ─────────────────────────────
describe('getAll — ownership join', () => {
  it('returns machine_slno and machine_vendor from JOIN', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 1, rule_name: 'ABC Rule', machine_id: 5,
        machine_slno: 'AM-001', machine_nickname: 'Hitachi JD',
        machine_vendor: 'ABC Hire Co', machine_eq_type: 'Excavator',
        machine_project_id: null,
        ownership_vendor: 'ABC Hire Co',
        linked_assets: '0',
      }],
    })
    db.query.mockResolvedValueOnce({ rows: [] }) // other_charges

    const { getAll } = require('../src/controllers/invoiceRulesController')
    const req = makeReq()
    const res = makeRes()

    await getAll(req, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            machine_slno:   'AM-001',
            machine_vendor: 'ABC Hire Co',
            ownership_vendor: 'ABC Hire Co',
          }),
        ]),
      })
    )
  })
})

// ── Test: create — valid Hire machine + vendor ────────────────────────────────
describe('create — ownership validation', () => {
  it('saves successfully when machine vendor matches ownership_vendor', async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({})
    // Machine lookup → Hire, vendor = 'ABC Hire Co'
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, vendor: 'ABC Hire Co', ownership: 'Hire' }] })
    // INSERT invoice_rules
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 10, rule_number: 'IR-001' }] })
    // INSERT invoice_rule_additions
    mockQuery.mockResolvedValueOnce({})
    // INSERT invoice_rule_deductions
    mockQuery.mockResolvedValueOnce({})
    // COMMIT
    mockQuery.mockResolvedValueOnce({})

    const { create } = require('../src/controllers/invoiceRulesController')
    const req = makeReq({
      rule_number: 'IR-001', rule_name: 'ABC Rule',
      basic_rate: 50000, days: 26,
      machine_id: 5, ownership_vendor: 'ABC Hire Co',
      other_charges: [],
    })
    const res = makeRes()

    await create(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: 10 }) })
    )
    // Verify machine_id was passed to the INSERT
    const insertCall = mockQuery.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('INSERT INTO invoice_rules'))
    expect(insertCall).toBeTruthy()
    expect(insertCall[1]).toContain(5)   // machine_id
    expect(insertCall[1]).toContain('ABC Hire Co') // ownership_vendor
  })

  it('returns 400 when machine vendor does not match ownership_vendor', async () => {
    mockQuery.mockResolvedValueOnce({}) // BEGIN
    // Machine belongs to different vendor
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, vendor: 'XYZ Contractors', ownership: 'Hire' }] })
    mockQuery.mockResolvedValueOnce({}) // ROLLBACK

    const { create } = require('../src/controllers/invoiceRulesController')
    const req = makeReq({
      rule_number: 'IR-001', rule_name: 'Test',
      basic_rate: 50000, days: 26,
      machine_id: 5, ownership_vendor: 'ABC Hire Co',
      other_charges: [],
    })
    const res = makeRes()

    await create(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('does not belong') })
    )
  })

  it('returns 400 when machine_id not found', async () => {
    mockQuery.mockResolvedValueOnce({}) // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [] }) // Machine not found
    mockQuery.mockResolvedValueOnce({}) // ROLLBACK

    const { create } = require('../src/controllers/invoiceRulesController')
    const req = makeReq({
      rule_number: 'IR-001', rule_name: 'Test',
      basic_rate: 50000, days: 26,
      machine_id: 999, ownership_vendor: 'ABC Hire Co',
      other_charges: [],
    })
    const res = makeRes()

    await create(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('not found') })
    )
  })

  it('accepts Own machine with ownership_vendor = "Own"', async () => {
    mockQuery.mockResolvedValueOnce({}) // BEGIN
    // Own machine — no vendor
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 7, vendor: null, ownership: 'Own' }] })
    // INSERT invoice_rules
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 11, rule_number: 'IR-002' }] })
    // INSERT additions, deductions
    mockQuery.mockResolvedValueOnce({})
    mockQuery.mockResolvedValueOnce({})
    // COMMIT
    mockQuery.mockResolvedValueOnce({})

    const { create } = require('../src/controllers/invoiceRulesController')
    const req = makeReq({
      rule_number: 'IR-002', rule_name: 'Own – AM-010 (Excavator)',
      basic_rate: 120000, days: 26,
      machine_id: 7, ownership_vendor: 'Own',
      other_charges: [],
    })
    const res = makeRes()

    await create(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('rejects Own machine when ownership_vendor is set to a vendor name (not "Own")', async () => {
    mockQuery.mockResolvedValueOnce({}) // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 7, vendor: null, ownership: 'Own' }] })
    mockQuery.mockResolvedValueOnce({}) // ROLLBACK

    const { create } = require('../src/controllers/invoiceRulesController')
    const req = makeReq({
      rule_number: 'IR-003', rule_name: 'Bad',
      basic_rate: 50000, days: 26,
      machine_id: 7, ownership_vendor: 'Some Hire Vendor',
      other_charges: [],
    })
    const res = makeRes()

    await create(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('own-fleet') })
    )
  })

  it('creates a generic rule (no machine_id) without validation', async () => {
    mockQuery.mockResolvedValueOnce({}) // BEGIN
    // No machine lookup (machine_id is null)
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 12, rule_number: 'IR-003' }] }) // INSERT
    mockQuery.mockResolvedValueOnce({}) // additions
    mockQuery.mockResolvedValueOnce({}) // deductions
    mockQuery.mockResolvedValueOnce({}) // COMMIT

    const { create } = require('../src/controllers/invoiceRulesController')
    const req = makeReq({
      rule_number: 'IR-003', rule_name: 'Generic Rule',
      basic_rate: 50000, days: 26,
      other_charges: [],
    })
    const res = makeRes()

    await create(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    // Machine lookup should NOT have been called (only BEGIN + INSERT + additions + deductions + COMMIT)
    const machineLookups = mockQuery.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('FROM machines')
    )
    expect(machineLookups).toHaveLength(0)
  })
})

// ── Test: frontend ownership-change resets machine (logic test) ───────────────
describe('frontend logic — ownership change resets asset', () => {
  it('clears machine_id when vendor changes', () => {
    // Simulate the handleHireVendorChange state update
    let form = { ownership_vendor: 'ABC Hire Co', machine_id: '5', rule_name: 'Old Rule', basic_rate: '50000' }

    const handleHireVendorChange = (vendorName) => {
      form = { ...form, ownership_vendor: vendorName, machine_id: '', rule_name: '', basic_rate: '' }
    }

    handleHireVendorChange('XYZ Contractors')

    expect(form.machine_id).toBe('')
    expect(form.ownership_vendor).toBe('XYZ Contractors')
    expect(form.rule_name).toBe('')
    expect(form.basic_rate).toBe('')
  })

  it('clears machine_id when switching between Hire and Own tabs', () => {
    let ownerTab = 'Hire'
    let form = { ownership_vendor: 'ABC Hire Co', machine_id: '5', rule_name: 'Old Rule', basic_rate: '50000' }

    const handleOwnerTabChange = (tab) => {
      ownerTab = tab
      form = { ...form, ownership_vendor: '', machine_id: '', rule_name: '', basic_rate: '' }
    }

    handleOwnerTabChange('Own')

    expect(ownerTab).toBe('Own')
    expect(form.machine_id).toBe('')
    expect(form.ownership_vendor).toBe('')
  })
})

// ── Test: frontend validation prevents mismatch ───────────────────────────────
describe('frontend validation — ownership ↔ asset cross-check', () => {
  it('blocks save when selected machine vendor does not match selected vendor', () => {
    const ownerForm = { ownership_vendor: 'ABC Hire Co', machine_id: '5' }
    const hireMachines = [{ id: 5, vendor: 'XYZ Contractors' }]

    const sel = hireMachines.find(m => String(m.id) === String(ownerForm.machine_id))
    const mismatch = sel && (sel.vendor || '').toLowerCase() !== ownerForm.ownership_vendor.toLowerCase()

    expect(mismatch).toBe(true)
  })

  it('passes when selected machine vendor matches selected vendor', () => {
    const ownerForm = { ownership_vendor: 'ABC Hire Co', machine_id: '5' }
    const hireMachines = [{ id: 5, vendor: 'ABC Hire Co' }]

    const sel = hireMachines.find(m => String(m.id) === String(ownerForm.machine_id))
    const mismatch = sel && (sel.vendor || '').toLowerCase() !== ownerForm.ownership_vendor.toLowerCase()

    expect(mismatch).toBe(false)
  })
})

// ── Test: auto-fill logic ─────────────────────────────────────────────────────
describe('auto-fill on asset select', () => {
  it('auto-fills rule_name and basic_rate from Hire machine', () => {
    let form = { ownership_vendor: 'ABC Hire Co', machine_id: '', rule_name: '', basic_rate: '' }
    const hireMachines = [{ id: 5, slno: 'AM-005', vendor: 'ABC Hire Co', eq_type_name: 'Excavator', rate_monthly: 85000 }]

    const handleHireMachineSelect = (machineId) => {
      const m = hireMachines.find(x => String(x.id) === String(machineId))
      if (!m) return
      form = {
        ...form,
        machine_id: String(m.id),
        rule_name:  form.rule_name  || `${m.vendor || ''} – ${m.slno}${m.eq_type_name ? ` (${m.eq_type_name})` : ''}`.trim(),
        basic_rate: form.basic_rate || (m.rate_monthly ? String(m.rate_monthly) : ''),
      }
    }

    handleHireMachineSelect('5')

    expect(form.machine_id).toBe('5')
    expect(form.rule_name).toBe('ABC Hire Co – AM-005 (Excavator)')
    expect(form.basic_rate).toBe('85000')
  })

  it('auto-fills rule_name and basic_rate from Own machine', () => {
    let form = { ownership_vendor: 'Own', machine_id: '', rule_name: '', basic_rate: '' }
    const ownMachines  = [{ id: 7, slno: 'AM-010', eq_type: 'JCB', rate_monthly: 120000 }]
    const ownProjects  = [{ id: 3, code: 'SITE AM', name: 'Site AM' }]
    const ownProjectId = '3'

    const handleOwnMachineSelect = (machineId) => {
      const m = ownMachines.find(x => String(x.id) === String(machineId))
      const p = ownProjects.find(x => String(x.id) === String(ownProjectId))
      if (!m) return
      form = {
        ...form,
        machine_id:      String(m.id),
        ownership_vendor: 'Own',
        rule_name:  form.rule_name  || `Own${p ? ' – ' + p.code : ''} – ${m.slno}${m.eq_type ? ` (${m.eq_type})` : ''}`.trim(),
        basic_rate: form.basic_rate || (m.rate_monthly ? String(m.rate_monthly) : ''),
      }
    }

    handleOwnMachineSelect('7')

    expect(form.machine_id).toBe('7')
    expect(form.rule_name).toBe('Own – SITE AM – AM-010 (JCB)')
    expect(form.basic_rate).toBe('120000')
    expect(form.ownership_vendor).toBe('Own')
  })

  it('does not overwrite existing rule_name on edit', () => {
    let form = { machine_id: '', rule_name: 'My Custom Rule', basic_rate: '90000' }
    const hireMachines = [{ id: 5, slno: 'AM-005', vendor: 'ABC', eq_type_name: 'Excavator', rate_monthly: 85000 }]

    const handleHireMachineSelect = (machineId) => {
      const m = hireMachines.find(x => String(x.id) === String(machineId))
      if (!m) return
      form = {
        ...form,
        machine_id: String(m.id),
        rule_name:  form.rule_name  || `${m.vendor} – ${m.slno}`.trim(),
        basic_rate: form.basic_rate || String(m.rate_monthly),
      }
    }

    handleHireMachineSelect('5')

    // Existing values preserved (|| short-circuits)
    expect(form.rule_name).toBe('My Custom Rule')
    expect(form.basic_rate).toBe('90000')
  })
})
