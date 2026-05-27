const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl                          = require('../controllers/vendorsController');

router.get('/',      requireAuth,              ctrl.getAll);
router.post('/',     requireAuth,              ctrl.upsert);
router.delete('/:id', requireAuth, requireAdmin, ctrl.remove);

module.exports = router;
