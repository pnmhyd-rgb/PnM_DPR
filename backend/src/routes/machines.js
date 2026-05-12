const router = require('express').Router();
const { getAll, create, update, remove, transfer, hardDelete, bulkCreate, fleetSummary } = require('../controllers/machinesController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/fleet-summary', requireAuth, fleetSummary);
router.get('/',              requireAuth,              getAll);
router.post('/',             requireAuth,              create);       // permission checked in controller
router.post('/bulk',         requireAuth,              bulkCreate);   // permission checked in controller
router.put('/:id',           requireAuth, requireAdmin, update);
router.put('/:id/transfer',  requireAuth, requireAdmin, transfer);
router.delete('/:id',        requireAuth, requireAdmin, remove);
router.delete('/:id/hard',   requireAuth, requireAdmin, hardDelete);

module.exports = router;
