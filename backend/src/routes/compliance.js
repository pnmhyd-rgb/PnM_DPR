const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const ctrl = require('../controllers/complianceController')

router.get('/',                        requireAuth, ctrl.getAll)
router.get('/summary',                 requireAuth, ctrl.getSummary)
router.get('/upcoming',                requireAuth, ctrl.getUpcoming)
router.get('/machine/:machineId',      requireAuth, ctrl.getMachineCompliance)
router.get('/:id/attachment',          requireAuth, ctrl.getAttachment)
router.post('/batch',                  requireAuth, ctrl.batchUpsert)
router.delete('/:id',                  requireAuth, ctrl.remove)

module.exports = router
