const router = require('express').Router();
const { getAll, create, update, remove, transfer, hardDelete, bulkCreate, fleetSummary, resetReadingConfigs, propagateReadingConfigs } = require('../controllers/machinesController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/fleet-summary',            requireAuth,              fleetSummary);
router.get('/',                          requireAuth,              getAll);
router.post('/',                         requireAuth,              create);
router.post('/bulk',                          requireAuth,              bulkCreate);
router.post('/propagate-reading-configs',     requireAuth, requireAdmin, propagateReadingConfigs);
router.post('/:id/reset-reading-configs', requireAuth, requireAdmin, resetReadingConfigs);
router.put('/:id',                       requireAuth, requireAdmin, update);
router.put('/:id/transfer',              requireAuth, requireAdmin, transfer);
router.delete('/:id',                    requireAuth, requireAdmin, remove);
router.delete('/:id/hard',              requireAuth, requireAdmin, hardDelete);

module.exports = router;
