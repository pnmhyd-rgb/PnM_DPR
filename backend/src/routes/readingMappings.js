const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const c = require('../controllers/readingMappingsController');

router.get('/',             requireAuth,               c.getAll);
router.get('/grouped',      requireAuth,               c.getGrouped);
router.post('/',            requireAuth, requireAdmin, c.create);
router.put('/bulk-replace', requireAuth, requireAdmin, c.bulkReplace);
router.put('/:id',          requireAuth, requireAdmin, c.update);
router.delete('/:id',       requireAuth, requireAdmin, c.remove);

module.exports = router;
