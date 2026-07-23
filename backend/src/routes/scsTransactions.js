const router = require('express').Router();
const c = require('../controllers/scsTransactionsController');
const { requireAuth } = require('../middleware/auth');

router.get('/',       requireAuth, c.getAll);
router.get('/:id',    requireAuth, c.getById);
router.post('/',      requireAuth, c.create);
router.put('/:id',    requireAuth, c.update);
router.delete('/:id', requireAuth, c.remove);

module.exports = router;
