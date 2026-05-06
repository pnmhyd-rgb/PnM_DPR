const router = require('express').Router();
const { getAll, create, remove } = require('../controllers/fuelController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',       requireAuth,              getAll);
router.post('/',      requireAuth,              create);
router.delete('/:id', requireAuth, requireAdmin, remove);

module.exports = router;
