const router = require('express').Router();
const { getAll, create, update, remove, getLocations, createLocation, removeLocation } = require('../controllers/warehousesController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',                                     requireAuth, getAll);
router.post('/',                                    requireAuth, requireAdmin, create);
router.put('/:id',                                  requireAuth, requireAdmin, update);
router.delete('/:id',                               requireAuth, requireAdmin, remove);
router.get('/:warehouseId/locations',               requireAuth, getLocations);
router.post('/:warehouseId/locations',              requireAuth, requireAdmin, createLocation);
router.delete('/:warehouseId/locations/:locationId', requireAuth, requireAdmin, removeLocation);

module.exports = router;
