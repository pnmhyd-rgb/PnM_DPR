const router = require('express').Router();
const { getAll, getOne, create, remove } = require('../controllers/inventoryConsumptionController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',      requireAuth, getAll);
router.get('/:id',   requireAuth, getOne);
router.post('/',     requireAuth, create);
router.delete('/:id', requireAuth, requireAdmin, remove);

module.exports = router;
