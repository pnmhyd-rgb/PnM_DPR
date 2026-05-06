const router = require('express').Router();
const { getAll, getItems, generate, updateStatus, remove } = require('../controllers/payrollController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',           requireAuth,               getAll);
router.get('/:id/items',  requireAuth,               getItems);
router.post('/generate',  requireAuth,               generate);
router.patch('/:id',      requireAuth, requireAdmin,  updateStatus);
router.delete('/:id',     requireAuth, requireAdmin,  remove);

module.exports = router;
