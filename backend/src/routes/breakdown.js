const router = require('express').Router();
const { getAll, create, updateStatus, remove } = require('../controllers/breakdownController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',           requireAuth,              getAll);
router.post('/',          requireAuth,              create);
router.patch('/:id',      requireAuth,              updateStatus); // any auth user can update status
router.delete('/:id',     requireAuth, requireAdmin, remove);

module.exports = router;
