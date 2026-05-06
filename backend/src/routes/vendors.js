const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const ctrl            = require('../controllers/vendorsController');

router.get('/',  requireAuth, ctrl.getAll);
router.post('/', requireAuth, ctrl.upsert);

module.exports = router;
