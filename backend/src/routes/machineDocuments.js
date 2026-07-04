const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const ctrl = require('../controllers/machineDocumentsController')

router.get('/:machineId',       requireAuth, ctrl.getByMachine)
router.post('/',                requireAuth, ctrl.create)
router.get('/:id/download',     requireAuth, ctrl.download)
router.delete('/:id',           requireAuth, ctrl.remove)

module.exports = router
