const router = require('express').Router();
const { getAll, create, update, updateOverrides, remove, transfer, hardDelete, bulkCreate, fleetSummary, fleetList, resetReadingConfigs, propagateReadingConfigs, regenerateNicknames, getLastEntry } = require('../controllers/machinesController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/fleet-summary',            requireAuth,              fleetSummary);
router.get('/fleet-list',               requireAuth,              fleetList);
router.get('/',                          requireAuth,              getAll);
router.post('/',                         requireAuth,              create);
router.post('/bulk',                          requireAuth,              bulkCreate);
router.post('/regenerate-nicknames',          requireAuth, requireAdmin, regenerateNicknames);
router.post('/propagate-reading-configs',     requireAuth, requireAdmin, propagateReadingConfigs);
router.get('/:id/last-entry',             requireAuth,              getLastEntry);
router.post('/:id/reset-reading-configs', requireAuth, requireAdmin, resetReadingConfigs);
router.put('/:id',                       requireAuth, requireAdmin, update);
router.patch('/:id/overrides',           requireAuth, requireAdmin, updateOverrides);
router.put('/:id/transfer',              requireAuth, requireAdmin, transfer);
router.delete('/:id',                    requireAuth, requireAdmin, remove);
router.delete('/:id/hard',              requireAuth, requireAdmin, hardDelete);

module.exports = router;
