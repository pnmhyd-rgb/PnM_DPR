const router = require('express').Router();
const { getAll, getPreviousClosing, create, update, updateStatus, remove, getDprStatus, getMonthlyStatus, getMonthlyProjectStatus } = require('../controllers/entriesController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/previous-closing',        requireAuth, getPreviousClosing);
router.get('/dpr-status',              requireAuth, getDprStatus);
router.get('/monthly-status',          requireAuth, getMonthlyStatus);
router.get('/monthly-project-status',  requireAuth, getMonthlyProjectStatus);
router.get('/',       requireAuth,              getAll);
router.post('/',      requireAuth,              create);
router.put('/:id',         requireAuth, requireAdmin, update);
router.patch('/:id/status', requireAuth, requireAdmin, updateStatus);
router.delete('/:id',      requireAuth, requireAdmin, remove);

module.exports = router;
