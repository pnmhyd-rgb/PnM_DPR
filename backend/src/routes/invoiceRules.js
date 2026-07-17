const router = require('express').Router();
const { getAll, getOne, create, update, remove, bulkCreate } = require('../controllers/invoiceRulesController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',         requireAuth, getAll);
router.get('/:id',      requireAuth, getOne);
router.post('/',        requireAuth, requireAdmin, create);
router.post('/bulk',    requireAuth, requireAdmin, bulkCreate);
router.put('/:id',      requireAuth, requireAdmin, update);
router.delete('/:id',   requireAuth, requireAdmin, remove);

module.exports = router;
