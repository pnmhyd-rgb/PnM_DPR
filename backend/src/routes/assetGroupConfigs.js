const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/assetGroupConfigsController');

router.get('/',        requireAuth,              ctrl.getGroups);
router.get('/:group',  requireAuth,              ctrl.getOne);
router.put('/:group',  requireAuth, requireAdmin, ctrl.upsert);

module.exports = router;
