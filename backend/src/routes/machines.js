const router = require('express').Router();
const { getAll, create, update, remove, bulkCreate } = require('../controllers/machinesController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',         requireAuth,              getAll);
router.post('/',        requireAuth,              create);       // permission checked in controller
router.post('/bulk',    requireAuth,              bulkCreate);   // permission checked in controller
router.put('/:id',      requireAuth, requireAdmin, update);
router.delete('/:id',   requireAuth, requireAdmin, remove);

module.exports = router;
