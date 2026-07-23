const router = require('express').Router();
const { getAll, getOne, create, update, remove, bulkCreate } = require('../controllers/inventoryItemsController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',       requireAuth, getAll);
router.get('/:id',    requireAuth, getOne);
router.post('/bulk',  requireAuth, requireAdmin, bulkCreate);
router.post('/',      requireAuth, requireAdmin, create);
router.put('/:id',    requireAuth, requireAdmin, update);
router.delete('/:id', requireAuth, requireAdmin, remove);

module.exports = router;
