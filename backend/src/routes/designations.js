const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const ctrl            = require('../controllers/designationsController');

router.get('/',       requireAuth, ctrl.getAll);
router.post('/',      requireAuth, ctrl.create);
router.delete('/:id', requireAuth, ctrl.remove);

module.exports = router;
