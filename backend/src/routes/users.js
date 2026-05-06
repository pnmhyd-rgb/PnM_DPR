const router = require('express').Router();
const { getAll, create, bulkCreate, update, remove } = require('../controllers/usersController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',        requireAuth, requireAdmin, getAll);
router.post('/',       requireAuth, requireAdmin, create);
router.post('/bulk',   requireAuth, requireAdmin, bulkCreate);
router.put('/:id',     requireAuth, requireAdmin, update);
router.delete('/:id',  requireAuth, requireAdmin, remove);

module.exports = router;
