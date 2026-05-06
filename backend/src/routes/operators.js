const router = require('express').Router();
const { getAll, create, update, remove } = require('../controllers/operatorsController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',       requireAuth,              getAll);
router.post('/',      requireAuth, requireAdmin, create);
router.put('/:id',    requireAuth, requireAdmin, update);
router.delete('/:id', requireAuth, requireAdmin, remove);

module.exports = router;
