const router  = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/equipmentTypeConfigsController');

router.get('/:eqTypeId', requireAuth,              ctrl.getOne);
router.put('/:eqTypeId', requireAuth, requireAdmin, ctrl.upsert);

module.exports = router;
