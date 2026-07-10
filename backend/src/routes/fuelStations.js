const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getAll, create, update, remove } = require('../controllers/fuelStationsController');

router.get('/',       requireAuth,              getAll);
router.post('/',      requireAuth, requireAdmin, create);
router.put('/:id',    requireAuth, requireAdmin, update);
router.delete('/:id', requireAuth, requireAdmin, remove);

module.exports = router;
