const router = require('express').Router();
const { getAll, getOne, create, approve, remove } = require('../controllers/stockAdjustmentController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',          requireAuth, getAll);
router.get('/:id',       requireAuth, getOne);
router.post('/',         requireAuth, create);
router.patch('/:id/approve', requireAuth, requireAdmin, approve);
router.delete('/:id',    requireAuth, requireAdmin, remove);

module.exports = router;
