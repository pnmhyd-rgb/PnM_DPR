const router = require('express').Router();
const c = require('../controllers/checkSheetsController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',       requireAuth, c.getAll);
router.get('/:id',    requireAuth, c.getOne);
router.post('/',      requireAuth, c.create);
router.put('/:id',    requireAuth, c.update);
router.delete('/:id', requireAuth, requireAdmin, c.remove);

module.exports = router;
