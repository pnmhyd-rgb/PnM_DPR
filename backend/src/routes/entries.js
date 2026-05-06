const router = require('express').Router();
const { getAll, getPreviousClosing, create, update, remove } = require('../controllers/entriesController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/previous-closing', requireAuth, getPreviousClosing);  // must be before /:id
router.get('/',       requireAuth,              getAll);
router.post('/',      requireAuth,              create);  // operators can create
router.put('/:id',    requireAuth, requireAdmin, update);  // admin only
router.delete('/:id', requireAuth, requireAdmin, remove);  // admin only

module.exports = router;
