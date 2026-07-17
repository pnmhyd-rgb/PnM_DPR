const router = require('express').Router();
const { getAll, getOne, create } = require('../controllers/partsReturnController');
const { requireAuth } = require('../middleware/auth');

router.get('/',    requireAuth, getAll);
router.get('/:id', requireAuth, getOne);
router.post('/',   requireAuth, create);

module.exports = router;
